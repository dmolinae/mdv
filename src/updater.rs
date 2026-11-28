use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use crate::AppState;

const REPO: &str = "dmolinae/mdv";
const CHECK_CACHE_TTL: Duration = Duration::from_secs(15 * 60);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub ok: bool,
    pub current_version: String,
    pub latest_version: String,
    pub tag_name: String,
    pub update_available: bool,
    pub release_name: String,
    pub release_notes: String,
    pub release_url: String,
    pub published_at: Option<String>,
}

struct CachedUpdateCheck {
    result: UpdateCheckResult,
    checked_at: Instant,
}

#[derive(Default)]
pub struct UpdaterRuntime {
    cached: Mutex<Option<CachedUpdateCheck>>,
    installing: Mutex<bool>,
}

#[derive(Deserialize, Default)]
pub struct CheckUpdateQuery {
    pub force: Option<u8>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstallUpdatePayload {
    pub tag_name: Option<String>,
}

fn find_curl_bin() -> &'static str {
    #[cfg(windows)]
    {
        if Path::new(r"C:\Windows\System32\curl.exe").is_file() {
            return r"C:\Windows\System32\curl.exe";
        }
        "curl.exe"
    }
    #[cfg(not(windows))]
    {
        "curl"
    }
}

pub fn parse_semver_tuple(raw: &str) -> Option<(u32, u32, u32)> {
    let trimmed = raw.trim().trim_start_matches(['v', 'V']);
    let core = trimmed.split(['-', '+']).next().unwrap_or(trimmed);
    let mut parts = core.split('.');
    let major = parts.next()?.parse::<u32>().ok()?;
    let minor = parts.next().unwrap_or("0").parse::<u32>().ok()?;
    let patch = parts.next().unwrap_or("0").parse::<u32>().ok()?;
    Some((major, minor, patch))
}

fn is_newer_version(latest: &str, current: &str) -> bool {
    match (parse_semver_tuple(latest), parse_semver_tuple(current)) {
        (Some(l), Some(c)) => l > c,
        _ => false,
    }
}

fn expected_asset_name() -> &'static str {
    #[cfg(windows)]
    {
        "mdv-windows-x86_64.zip"
    }
    #[cfg(not(windows))]
    {
        "mdv-linux-x86_64.tar.gz"
    }
}

fn configure_hidden_cmd(cmd: &mut Command) {
    cmd.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
}

fn optional_github_token() -> Option<String> {
    for key in ["GITHUB_TOKEN", "GH_TOKEN"] {
        if let Ok(val) = std::env::var(key) {
            let t = val.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }
    None
}

fn verify_asset_reachable(tag: &str, asset_name: &str) -> bool {
    let url = format!(
        "https://github.com/{}/releases/download/{}/{}",
        REPO, tag, asset_name
    );
    let mut cmd = Command::new(find_curl_bin());
    configure_hidden_cmd(&mut cmd);
    cmd.args([
        "-fsSLI",
        "--max-time",
        "8",
        "-o",
        if cfg!(windows) { "NUL" } else { "/dev/null" },
        "-w",
        "%{http_code}",
        &url,
    ]);
    if let Ok(out) = cmd.output() {
        let code = String::from_utf8_lossy(&out.stdout);
        return out.status.success() && code.trim().starts_with('2');
    }
    false
}

fn fetch_latest_release_via_api() -> Option<UpdateCheckResult> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let api_url = format!("https://api.github.com/repos/{}/releases/latest", REPO);

    let mut cmd = Command::new(find_curl_bin());
    configure_hidden_cmd(&mut cmd);
    cmd.args([
        "-fsSL",
        "--max-time",
        "8",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "User-Agent: mdv-updater",
    ]);
    if let Some(tok) = optional_github_token() {
        cmd.arg("-H").arg(format!("Authorization: Bearer {}", tok));
    }
    cmd.arg(&api_url);

    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let val: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
    let tag_name = val.get("tag_name")?.as_str()?.trim().to_string();
    if tag_name.is_empty() {
        return None;
    }

    let wanted_asset = expected_asset_name();
    let has_asset = val
        .get("assets")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter().any(|item| {
                item.get("name")
                    .and_then(|n| n.as_str())
                    .map(|n| n == wanted_asset)
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false);

    let latest_clean = tag_name.trim_start_matches(['v', 'V']).to_string();
    let newer = is_newer_version(&latest_clean, &current) && has_asset;
    let release_name = val
        .get("name")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(&tag_name)
        .to_string();
    let release_notes = val
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let release_url = val
        .get("html_url")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("https://github.com/{}/releases/tag/{}", REPO, tag_name));
    let published_at = val
        .get("published_at")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Some(UpdateCheckResult {
        ok: true,
        current_version: current,
        latest_version: latest_clean,
        tag_name,
        update_available: newer,
        release_name,
        release_notes,
        release_url,
        published_at,
    })
}

/// Rate-limit-free fallback using GitHub's 302 redirect on `/releases/latest`
fn fetch_latest_release_via_redirect() -> Result<UpdateCheckResult, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let latest_url = format!("https://github.com/{}/releases/latest", REPO);

    let mut cmd = Command::new(find_curl_bin());
    configure_hidden_cmd(&mut cmd);
    cmd.args([
        "-fsSLI",
        "--max-time",
        "8",
        "-o",
        if cfg!(windows) { "NUL" } else { "/dev/null" },
        "-w",
        "%{url_effective}",
        &latest_url,
    ]);

    let out = cmd
        .output()
        .map_err(|e| format!("No se pudo ejecutar curl: {}", e))?;
    if !out.status.success() {
        return Err("No se pudo conectar con GitHub Releases.".to_string());
    }

    let effective = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let tag_name = effective
        .rsplit("/tag/")
        .next()
        .filter(|s| !s.is_empty() && !s.contains('/'))
        .ok_or_else(|| "No se pudo determinar la última versión publicada.".to_string())?
        .to_string();

    let latest_clean = tag_name.trim_start_matches(['v', 'V']).to_string();
    let mut newer = is_newer_version(&latest_clean, &current);
    if newer && !verify_asset_reachable(&tag_name, expected_asset_name()) {
        // Release tag exists, but CI is still uploading binaries
        newer = false;
    }

    Ok(UpdateCheckResult {
        ok: true,
        current_version: current,
        latest_version: latest_clean,
        tag_name: tag_name.clone(),
        update_available: newer,
        release_name: format!("mdv {}", tag_name),
        release_notes: String::new(),
        release_url: format!("https://github.com/{}/releases/tag/{}", REPO, tag_name),
        published_at: None,
    })
}

fn check_latest_release_blocking() -> Result<UpdateCheckResult, String> {
    if let Some(res) = fetch_latest_release_via_api() {
        return Ok(res);
    }
    fetch_latest_release_via_redirect()
}

pub async fn api_update_check_handler(
    State(state): State<Arc<AppState>>,
    Query(q): Query<CheckUpdateQuery>,
) -> Response {
    let force = q.force == Some(1);
    if !force {
        if let Ok(guard) = state.updater.cached.lock() {
            if let Some(ref entry) = *guard {
                if entry.checked_at.elapsed() < CHECK_CACHE_TTL {
                    return Json(entry.result.clone()).into_response();
                }
            }
        }
    }

    let res = tokio::task::spawn_blocking(check_latest_release_blocking).await;
    match res {
        Ok(Ok(info)) => {
            if let Ok(mut guard) = state.updater.cached.lock() {
                *guard = Some(CachedUpdateCheck {
                    result: info.clone(),
                    checked_at: Instant::now(),
                });
            }
            Json(info).into_response()
        }
        Ok(Err(err)) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({
                "ok": false,
                "currentVersion": env!("CARGO_PKG_VERSION"),
                "error": err,
            })),
        )
            .into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "ok": false,
                "currentVersion": env!("CARGO_PKG_VERSION"),
                "error": err.to_string(),
            })),
        )
            .into_response(),
    }
}

fn download_file(url: &str, dest: &Path) -> Result<(), String> {
    let mut cmd = Command::new(find_curl_bin());
    configure_hidden_cmd(&mut cmd);
    cmd.args(["-fsSL", "--max-time", "120", "-o"]);
    cmd.arg(dest);
    cmd.arg(url);
    let out = cmd
        .output()
        .map_err(|e| format!("Error al iniciar descarga: {}", e))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Falló la descarga desde {}", url)
        } else {
            stderr
        });
    }
    Ok(())
}

#[cfg(windows)]
fn install_release_binary_blocking(tag: &str) -> Result<PathBuf, String> {
    let self_exe =
        std::env::current_exe().map_err(|e| format!("No se pudo ubicar mdv.exe: {}", e))?;
    let tmp_dir = std::env::temp_dir().join(format!("mdv-self-update-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp_dir);
    fs::create_dir_all(&tmp_dir).map_err(|e| format!("Crear carpeta temporal: {}", e))?;

    let zip_path = tmp_dir.join("mdv-windows-x86_64.zip");
    let extract_dir = tmp_dir.join("extracted");
    fs::create_dir_all(&extract_dir).map_err(|e| e.to_string())?;

    let url = format!(
        "https://github.com/{}/releases/download/{}/mdv-windows-x86_64.zip",
        REPO, tag
    );
    download_file(&url, &zip_path)?;

    let ps_cmd = format!(
        "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
        zip_path.to_string_lossy().replace('\'', "''"),
        extract_dir.to_string_lossy().replace('\'', "''"),
    );
    let mut ps = Command::new("powershell.exe");
    configure_hidden_cmd(&mut ps);
    ps.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        &ps_cmd,
    ]);
    let out = ps
        .output()
        .map_err(|e| format!("Error al descomprimir actualización: {}", e))?;
    if !out.status.success() {
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(format!(
            "No se pudo descomprimir el paquete ZIP: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }

    let staged_exe = extract_dir.join("mdv.exe");
    let meta = fs::metadata(&staged_exe).map_err(|_| "El paquete descargado no contiene mdv.exe".to_string())?;
    if meta.len() < 512_000 {
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err("El ejecutable descargado está incompleto o corrupto.".to_string());
    }

    // Rename running mdv.exe -> mdv.exe.old (allowed by NTFS on active executables!) and place new mdv.exe
    let old_exe = self_exe.with_extension("exe.old");
    let _ = fs::remove_file(&old_exe);
    fs::rename(&self_exe, &old_exe).map_err(|e| {
        let _ = fs::remove_dir_all(&tmp_dir);
        format!("No se pudo preparar reemplazo de mdv.exe: {}", e)
    })?;

    if let Err(e) = fs::copy(&staged_exe, &self_exe) {
        // Roll back rename if copy failed
        let _ = fs::rename(&old_exe, &self_exe);
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(format!("No se pudo escribir el nuevo mdv.exe: {}", e));
    }

    // Update Uninstall DisplayVersion in HKCU if installed via mdv-setup
    let clean_ver = tag.trim_start_matches(['v', 'V']).replace('\'', "''");
    let mut reg_ps = Command::new("powershell.exe");
    configure_hidden_cmd(&mut reg_ps);
    reg_ps.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        &format!(
            "if (Test-Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\mdv') {{ Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\mdv' -Name 'DisplayVersion' -Value '{}' }}",
            clean_ver
        ),
    ]);
    let _ = reg_ps.status();

    let _ = fs::remove_dir_all(&tmp_dir);
    Ok(self_exe)
}

#[cfg(not(windows))]
fn install_release_binary_blocking(tag: &str) -> Result<PathBuf, String> {
    use std::os::unix::fs::PermissionsExt;

    let self_exe =
        std::env::current_exe().map_err(|e| format!("No se pudo ubicar el binario mdv: {}", e))?;
    let tmp_dir = std::env::temp_dir().join(format!("mdv-self-update-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp_dir);
    fs::create_dir_all(&tmp_dir).map_err(|e| format!("Crear carpeta temporal: {}", e))?;

    let tar_path = tmp_dir.join("mdv-linux-x86_64.tar.gz");
    let url = format!(
        "https://github.com/{}/releases/download/{}/mdv-linux-x86_64.tar.gz",
        REPO, tag
    );
    download_file(&url, &tar_path)?;

    let out = Command::new("tar")
        .arg("-xzf")
        .arg(&tar_path)
        .arg("-C")
        .arg(&tmp_dir)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("No se pudo extraer tar.gz: {}", e))?;
    if !out.status.success() {
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(format!(
            "Error al descomprimir mdv-linux-x86_64.tar.gz: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }

    let extracted_bin = tmp_dir.join("mdv");
    let meta =
        fs::metadata(&extracted_bin).map_err(|_| "El archivo descargado no contiene mdv".to_string())?;
    if meta.len() < 512_000 {
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err("El binario descargado está incompleto.".to_string());
    }
    let _ = fs::set_permissions(&extracted_bin, fs::Permissions::from_mode(0o755));

    // Stage next to target binary so rename(2) is atomic on the same filesystem (avoids ETXTBSY)
    let parent_dir = self_exe
        .parent()
        .ok_or_else(|| "Ruta de binario inválida".to_string())?;
    let staged_target = parent_dir.join(format!(".mdv.update.{}", std::process::id()));
    fs::copy(&extracted_bin, &staged_target).map_err(|e| {
        let _ = fs::remove_dir_all(&tmp_dir);
        format!(
            "No hay permisos de escritura en '{}' para actualizar mdv: {}",
            parent_dir.display(),
            e
        )
    })?;
    let _ = fs::set_permissions(&staged_target, fs::Permissions::from_mode(0o755));
    if let Err(e) = fs::rename(&staged_target, &self_exe) {
        let _ = fs::remove_file(&staged_target);
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(format!("No se pudo reemplazar el ejecutable mdv: {}", e));
    }

    // If running inside WSL2 and native Windows host mdv.exe is installed on /mnt/c, update it too!
    #[cfg(unix)]
    if let Some(win_exe) = crate::find_windows_native_mdv_exe() {
        if win_exe.to_string_lossy().starts_with("/mnt/") {
            let win_zip = tmp_dir.join("mdv-win.zip");
            let win_url = format!(
                "https://github.com/{}/releases/download/{}/mdv-windows-x86_64.zip",
                REPO, tag
            );
            if download_file(&win_url, &win_zip).is_ok() {
                let win_extract = tmp_dir.join("win-ext");
                let _ = fs::create_dir_all(&win_extract);
                let py_ok = Command::new("python3")
                    .args([
                        "-c",
                        "import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extract('mdv.exe', sys.argv[2])",
                    ])
                    .arg(&win_zip)
                    .arg(&win_extract)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
                    .map(|s| s.success())
                    .unwrap_or(false);
                let new_win_exe = win_extract.join("mdv.exe");
                if py_ok && new_win_exe.is_file() {
                    let old_win = win_exe.with_extension("exe.old");
                    let _ = fs::remove_file(&old_win);
                    let _ = fs::rename(&win_exe, &old_win);
                    if fs::copy(&new_win_exe, &win_exe).is_err() {
                        let _ = fs::rename(&old_win, &win_exe);
                    } else {
                        let _ = fs::set_permissions(&win_exe, fs::Permissions::from_mode(0o755));
                    }
                }
            }
        }
    }

    let _ = fs::remove_dir_all(&tmp_dir);
    Ok(self_exe)
}

fn spawn_hot_restart_server(new_exe: &Path, ws_dir: &Path, port: u16, reopen_window: bool) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        crate::win_app::allow_foreground_activation(None);
        let exe_s = new_exe.to_string_lossy();
        let ws_s = ws_dir.to_string_lossy();
        let cmd_line = if reopen_window || port == 0 {
            format!(
                "ping 127.0.0.1 -n 2 > nul & \"{}\" -- \"{}\"",
                exe_s, ws_s
            )
        } else {
            format!(
                "ping 127.0.0.1 -n 2 > nul & \"{}\" --workspace \"{}\" --server-child --port {} --no-open -- \"{}\"",
                exe_s, ws_s, port, ws_s
            )
        };
        let _ = Command::new("cmd.exe")
            .args(["/d", "/c", &cmd_line])
            .creation_flags(0x08000000)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }

    #[cfg(not(windows))]
    {
        let mut cmd = Command::new("sh");
        if reopen_window || port == 0 {
            cmd.args(["-c", "sleep 0.45; exec \"$1\" -- \"$2\"", "sh"])
                .arg(new_exe)
                .arg(ws_dir);
        } else {
            cmd.args([
                "-c",
                "sleep 0.45; exec \"$1\" --workspace \"$2\" --server-child --port \"$3\" --no-open -- \"$2\"",
                "sh",
            ])
            .arg(new_exe)
            .arg(ws_dir)
            .arg(port.to_string());
        }
        let _ = cmd
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }
}

pub async fn api_update_install_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<InstallUpdatePayload>,
) -> Response {
    {
        let mut installing = match state.updater.installing.lock() {
            Ok(g) => g,
            Err(_) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "ok": false, "error": "Estado interno inválido" })),
                )
                    .into_response();
            }
        };
        if *installing {
            return (
                StatusCode::CONFLICT,
                Json(serde_json::json!({ "ok": false, "error": "Ya hay una actualización en curso." })),
            )
                .into_response();
        }
        *installing = true;
    }

    let requested_tag = payload
        .tag_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let target_tag = match requested_tag {
        Some(t) => t,
        None => {
            match tokio::task::spawn_blocking(check_latest_release_blocking).await {
                Ok(Ok(info)) if info.update_available => info.tag_name,
                Ok(Ok(info)) => {
                    if let Ok(mut g) = state.updater.installing.lock() {
                        *g = false;
                    }
                    return Json(serde_json::json!({
                        "ok": true,
                        "alreadyUpToDate": true,
                        "newVersion": info.current_version,
                    }))
                    .into_response();
                }
                Ok(Err(e)) => {
                    if let Ok(mut g) = state.updater.installing.lock() {
                        *g = false;
                    }
                    return (
                        StatusCode::BAD_GATEWAY,
                        Json(serde_json::json!({ "ok": false, "error": e })),
                    )
                        .into_response();
                }
                Err(e) => {
                    if let Ok(mut g) = state.updater.installing.lock() {
                        *g = false;
                    }
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
                    )
                        .into_response();
                }
            }
        }
    };

    // Guard tag syntax to safe release tag characters only
    if !target_tag
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
    {
        if let Ok(mut g) = state.updater.installing.lock() {
            *g = false;
        }
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "ok": false, "error": "Etiqueta de versión inválida." })),
        )
            .into_response();
    }

    let tag_for_task = target_tag.clone();
    let install_res =
        tokio::task::spawn_blocking(move || install_release_binary_blocking(&tag_for_task)).await;

    let new_exe = match install_res {
        Ok(Ok(p)) => p,
        Ok(Err(e)) => {
            if let Ok(mut g) = state.updater.installing.lock() {
                *g = false;
            }
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "ok": false, "error": e })),
            )
                .into_response();
        }
        Err(e) => {
            if let Ok(mut g) = state.updater.installing.lock() {
                *g = false;
            }
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let new_version = target_tag.trim_start_matches(['v', 'V']).to_string();
    let bound_port = state.bound_port.load(std::sync::atomic::Ordering::Relaxed);
    let reopen_win = state.is_foreground_win;
    let ws_dir = state.workspace_dir();

    let st = Arc::clone(&state);
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(220)).await;
        spawn_hot_restart_server(&new_exe, &ws_dir, bound_port, reopen_win);
        st.pty_mgr.kill_all();
        std::process::exit(0);
    });

    Json(serde_json::json!({
        "ok": true,
        "newVersion": new_version,
        "tagName": target_tag,
        "port": bound_port,
        "reopenWindow": reopen_win,
        "restarting": true,
    }))
    .into_response()
}
