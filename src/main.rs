#![cfg_attr(windows, windows_subsystem = "windows")]

mod assets;
mod clickup;
mod github;
mod markdown;
mod pty;
#[cfg(windows)]
mod win_app;
mod workspace;

use axum::{
    body::Body,
    extract::{
        ws::WebSocketUpgrade,
        Path as AxumPath, Query, State,
    },
    http::{header, HeaderValue, StatusCode},
    response::{
        sse::{Event as SseEvent, KeepAlive, Sse},
        Html, IntoResponse, Json, Response,
    },
    routing::{get, post},
    Router,
};
use clap::Parser as ClapParser;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::{
    collections::HashMap,
    convert::Infallible,
    fs,
    io::{IsTerminal, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tokio::sync::broadcast;
use tokio_stream::{wrappers::BroadcastStream, StreamExt as _};

#[derive(ClapParser, Debug, Clone)]
#[command(
    name = "mdv",
    version = "2.0.0",
    about = "Visor moderno de Markdown en Rust con Zona de Terminales WSL, Splits infinitos, Carousel, Mermaid y Vim"
)]
struct Cli {
    /// Carpeta o archivo Markdown principal
    target: Option<String>,

    /// Segundo archivo opcional para abrir directamente en Split View
    second_target: Option<String>,

    /// Segundo archivo explícito para Split View
    #[arg(short = 's', long = "split")]
    split: Option<String>,

    /// Abrir el segundo archivo en Split horizontal (arriba/abajo)
    #[arg(long = "hz")]
    horizontal: bool,

    /// Tema inicial: tokyo, github-dark, catppuccin, light
    #[arg(short = 't', long = "theme")]
    theme: Option<String>,

    /// Abrir como pestaña normal del navegador (en vez de ventana --app)
    #[arg(short = 'b', long = "browser")]
    browser: bool,

    /// Abrir en ventana flotante sin maximizar
    #[arg(long = "windowed")]
    windowed: bool,

    /// No abrir ventana automáticamente (solo imprimir URL)
    #[arg(long = "no-open")]
    no_open: bool,

    /// Mantener el servidor en primer plano en la terminal
    #[arg(long = "fg")]
    foreground: bool,

    /// No apagar automáticamente el servidor al cerrar la ventana
    #[arg(long = "keep-alive")]
    keep_alive: bool,

    /// Puerto local (0 asigna uno libre automáticamente)
    #[arg(short = 'p', long = "port", default_value_t = 0)]
    port: u16,

    /// Actualizar mdv descargando el último binario desde GitHub Releases
    #[arg(long = "update")]
    update: bool,

    /// Detener el servidor en segundo plano y cerrar las terminales abiertas de esta carpeta
    #[arg(long = "stop")]
    stop: bool,

    #[arg(long = "server-child", hide = true)]
    server_child: bool,

    #[arg(long = "dir-mode", hide = true)]
    dir_mode: bool,

    #[arg(long = "workspace", hide = true)]
    workspace: Option<String>,

    #[arg(long = "stdin-file", hide = true)]
    stdin_file: Option<String>,

    /// Conectar ventana nativa directamente a un servidor mdv existente (usado desde WSL2)
    #[arg(long = "app-url", hide = true)]
    app_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub(crate) struct UserConfig {
    #[serde(default = "default_true")]
    pub maximized: bool,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub wide: bool,
    #[serde(default = "default_zoom")]
    pub zoom: u32,
    #[serde(default)]
    pub clickup: clickup::ClickUpConfig,
}

fn default_true() -> bool {
    true
}
fn default_theme() -> String {
    "tokyo".to_string()
}
fn default_zoom() -> u32 {
    100
}

impl Default for UserConfig {
    fn default() -> Self {
        Self {
            maximized: true,
            theme: default_theme(),
            wide: false,
            zoom: 100,
            clickup: clickup::ClickUpConfig::default(),
        }
    }
}

static CONFIG_IO_LOCK: Mutex<()> = Mutex::new(());

fn config_file_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("mdv")
        .join("config.json")
}

fn write_user_config_disk(cfg: &UserConfig) {
    let p = config_file_path();
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(txt) = serde_json::to_string_pretty(cfg) {
        let _ = fs::write(&p, txt + "\n");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&p, fs::Permissions::from_mode(0o600));
        }
    }
}

pub(crate) fn load_user_config() -> UserConfig {
    let _guard = CONFIG_IO_LOCK.lock().ok();
    let p = config_file_path();
    if let Ok(raw) = fs::read_to_string(p) {
        if let Ok(cfg) = serde_json::from_str::<UserConfig>(&raw) {
            return cfg;
        }
    }
    UserConfig::default()
}

pub(crate) fn update_user_config<F: FnOnce(&mut UserConfig)>(f: F) -> UserConfig {
    let _guard = CONFIG_IO_LOCK.lock().ok();
    let p = config_file_path();
    let mut cfg = fs::read_to_string(&p)
        .ok()
        .and_then(|raw| serde_json::from_str::<UserConfig>(&raw).ok())
        .unwrap_or_default();
    f(&mut cfg);
    write_user_config_disk(&cfg);
    cfg
}

fn save_user_config(patch: serde_json::Value) -> UserConfig {
    let _guard = CONFIG_IO_LOCK.lock().ok();
    let p = config_file_path();
    let existing = fs::read_to_string(&p)
        .ok()
        .and_then(|raw| serde_json::from_str::<UserConfig>(&raw).ok())
        .unwrap_or_default();
    let mut current = serde_json::to_value(&existing).unwrap_or_else(|_| serde_json::json!({}));
    if let (Some(cur_map), Some(patch_map)) = (current.as_object_mut(), patch.as_object()) {
        for (k, v) in patch_map {
            if k != "clickup" {
                cur_map.insert(k.clone(), v.clone());
            }
        }
    }
    let mut next: UserConfig = serde_json::from_value(current).unwrap_or(existing.clone());
    next.clickup = existing.clickup;
    write_user_config_disk(&next);
    next
}

fn compute_file_sha1(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    let mut hasher = Sha1::new();
    hasher.update(&bytes);
    Some(format!("{:x}", hasher.finalize()))
}

static WORKSPACE_IO_LOCK: Mutex<()> = Mutex::new(());
static ANON_PTY_SEQ: AtomicUsize = AtomicUsize::new(1);

fn compute_workspace_key(workspace_dir: &Path) -> String {
    let mut hasher = Sha1::new();
    hasher.update(workspace_dir.to_string_lossy().as_bytes());
    format!("{:x}", hasher.finalize())
}

fn workspace_state_file_path(workspace_dir: &Path) -> PathBuf {
    let key = compute_workspace_key(workspace_dir);
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("mdv")
        .join("workspaces")
        .join(format!("{}.json", key))
}

fn load_workspace_state(workspace_dir: &Path) -> Option<serde_json::Value> {
    let _guard = WORKSPACE_IO_LOCK.lock().ok();
    let p = workspace_state_file_path(workspace_dir);
    let raw = fs::read_to_string(p).ok()?;
    serde_json::from_str::<serde_json::Value>(&raw).ok()
}

fn save_workspace_state(workspace_dir: &Path, val: &serde_json::Value) {
    let _guard = WORKSPACE_IO_LOCK.lock().ok();
    let p = workspace_state_file_path(workspace_dir);
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(txt) = serde_json::to_string_pretty(val) {
        let _ = fs::write(&p, txt + "\n");
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct DaemonRecord {
    port: u16,
    pid: u32,
    workspace: String,
}

fn daemon_info_file_path(workspace_dir: &Path) -> PathBuf {
    let key = compute_workspace_key(workspace_dir);
    dirs::cache_dir()
        .or_else(dirs::config_dir)
        .unwrap_or_else(std::env::temp_dir)
        .join("mdv")
        .join("daemons")
        .join(format!("{}.json", key))
}

fn write_daemon_info(workspace_dir: &Path, port: u16) {
    let p = daemon_info_file_path(workspace_dir);
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let rec = DaemonRecord {
        port,
        pid: std::process::id(),
        workspace: workspace_dir.to_string_lossy().to_string(),
    };
    if let Ok(txt) = serde_json::to_string_pretty(&rec) {
        let _ = fs::write(&p, txt + "\n");
    }
}

fn remove_daemon_info(workspace_dir: &Path) {
    let _ = fs::remove_file(daemon_info_file_path(workspace_dir));
}

fn current_build_signature() -> String {
    let mut hasher = Sha1::new();
    hasher.update(env!("CARGO_PKG_VERSION").as_bytes());
    hasher.update(assets::APP_JS);
    hasher.update(assets::STYLES_CSS);
    format!("{:x}", hasher.finalize())
}

fn probe_existing_daemon(workspace_dir: &Path) -> Option<u16> {
    use std::io::Write;
    use std::net::{SocketAddr, TcpStream};

    let p = daemon_info_file_path(workspace_dir);
    let raw = fs::read_to_string(&p).ok()?;
    let rec: DaemonRecord = serde_json::from_str(&raw).ok()?;
    if rec.port == 0 {
        let _ = fs::remove_file(&p);
        return None;
    }

    let addr = SocketAddr::from(([127, 0, 0, 1], rec.port));
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_millis(180)) {
        Ok(s) => s,
        Err(_) => {
            let _ = fs::remove_file(&p);
            return None;
        }
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(250)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(180)));
    let req = format!(
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
        rec.port
    );
    if stream.write_all(req.as_bytes()).is_err() {
        let _ = fs::remove_file(&p);
        return None;
    }
    let mut resp = String::new();
    let _ = stream.read_to_string(&mut resp);
    let body = resp.split("\r\n\r\n").nth(1).unwrap_or("");
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body) {
        if val.get("ok").and_then(|v| v.as_bool()) == Some(true)
            && val.get("workspace").and_then(|v| v.as_str())
                == Some(workspace_dir.to_string_lossy().as_ref())
        {
            let remote_sig = val.get("buildSig").and_then(|v| v.as_str()).unwrap_or("");
            let active_ptys = val.get("activePtys").and_then(|v| v.as_u64()).unwrap_or(0);
            let local_sig = current_build_signature();
            if remote_sig != local_sig && active_ptys == 0 && !remote_sig.is_empty() {
                if let Ok(mut stop_s) = TcpStream::connect_timeout(&addr, Duration::from_millis(150)) {
                    let stop_req = format!(
                        "POST /api/daemon-stop HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                        rec.port
                    );
                    let _ = stop_s.write_all(stop_req.as_bytes());
                }
                std::thread::sleep(Duration::from_millis(60));
                let _ = fs::remove_file(&p);
                return None;
            }
            return Some(rec.port);
        }
    }
    let _ = fs::remove_file(&p);
    None
}

fn stop_existing_daemon(workspace_dir: &Path) -> bool {
    use std::io::Write;
    use std::net::{SocketAddr, TcpStream};

    if let Some(port) = probe_existing_daemon(workspace_dir) {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        if let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(200)) {
            let _ = stream.set_write_timeout(Some(Duration::from_millis(200)));
            let req = format!(
                "POST /api/daemon-stop HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                port
            );
            let _ = stream.write_all(req.as_bytes());
            let _ = stream.flush();
        }
        remove_daemon_info(workspace_dir);
        return true;
    }
    remove_daemon_info(workspace_dir);
    false
}

fn percent_encode_query_val(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 8);
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

pub(crate) struct AppState {
    initial_file: Option<PathBuf>,
    split_file: Option<PathBuf>,
    split_direction: String,
    workspace_dir: PathBuf,
    dir_mode: bool,
    default_theme: String,
    keep_alive: bool,
    stdin_file: Option<PathBuf>,
    watched_files: Mutex<HashMap<PathBuf, String>>,
    pub(crate) reload_tx: broadcast::Sender<String>,
    active_clients: AtomicUsize,
    had_client: AtomicBool,
    pub(crate) clickup: clickup::ClickUpRuntime,
    pub(crate) github: github::GitHubRuntime,
    pub(crate) pty_mgr: Arc<pty::PtyManager>,
}

#[derive(Deserialize, Default)]
struct DocQuery {
    file: Option<String>,
    split: Option<String>,
    hz: Option<u8>,
    dir: Option<u8>,
}

#[derive(Deserialize)]
struct LocalFileQuery {
    path: String,
}

#[derive(Deserialize)]
struct PtyQuery {
    session_id: Option<String>,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    paused: Option<u8>,
    task_id: Option<String>,
    task_code: Option<String>,
    task_name: Option<String>,
    task_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct KillPtyPayload {
    session_id: String,
}

#[derive(Deserialize, Default)]
struct TaskWorktreesQuery {
    codes: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiDocResponse {
    file_path: String,
    file_name: String,
    rel_path: String,
    total_files: usize,
    tree_html: String,
    html: String,
    toc: Vec<markdown::TocItem>,
    title: Option<String>,
}

#[derive(Deserialize)]
struct OpenExternalPayload {
    url: String,
}

fn build_empty_markdown_html(workspace_name: &str) -> String {
    format!(
        r#"<div class="mdv-empty-md">
  <div class="mdv-empty-md-icon">📄</div>
  <h3>Sin archivos Markdown en <code>{ws}</code></h3>
  <p>Crea cualquier archivo <code>.md</code> en este proyecto y aparecerá automáticamente aquí con Live-Reload.</p>
</div>"#,
        ws = workspace::escape_html_attr(workspace_name)
    )
}

fn build_html_shell(
    state: &AppState,
    file_path: Option<&Path>,
    rendered: &markdown::RenderedDocument,
    query_overrides: Option<&DocQuery>,
) -> String {
    let user_cfg = load_user_config();
    let workspace_name = state
        .workspace_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| state.workspace_dir.to_string_lossy().to_string());

    let rel_display = match file_path {
        Some(fp) => {
            let rel = workspace::normalize_rel_path(&state.workspace_dir, fp);
            if rel.is_empty() {
                fp.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Markdown".to_string())
            } else {
                rel
            }
        }
        None => "Sin .md".to_string(),
    };

    let scan = workspace::scan_markdown_workspace(&state.workspace_dir, 8, 1500);
    let show_sidebar = scan.files.len() > 1;
    let mut body_classes = vec!["hide-toc"];
    if !show_sidebar {
        body_classes.push("hide-files");
    }
    let body_cls_str = body_classes.join(" ");
    let active_btn_cls = if show_sidebar { " is-active" } else { "" };

    let file_str = file_path
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let tree_html = workspace::render_tree_nodes_html(&scan.children, &file_str);
    let toc_html: String = rendered
        .toc
        .iter()
        .map(|item| {
            format!(
                r##"<li class="mdv-toc-item mdv-toc-level-{lvl}" data-toc-id="{id}"><a href="#{id}">{txt}</a></li>"##,
                lvl = item.level,
                id = workspace::escape_html_attr(&item.id),
                txt = workspace::escape_html_attr(&item.text)
            )
        })
        .collect();

    let page_title = rendered
        .title
        .clone()
        .or_else(|| {
            file_path
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| workspace_name.clone());

    let initial_body_html = if file_path.is_some() {
        rendered.html.clone()
    } else {
        build_empty_markdown_html(&workspace_name)
    };

    let effective_split_file = query_overrides
        .and_then(|q| q.split.as_deref())
        .map(PathBuf::from)
        .filter(|p| p.is_file())
        .or_else(|| state.split_file.clone());
    let effective_split_dir = match query_overrides.and_then(|q| q.hz) {
        Some(1) => "horizontal",
        Some(0) => "vertical",
        _ => state.split_direction.as_str(),
    };
    let effective_dir_mode = match query_overrides.and_then(|q| q.dir) {
        Some(1) => true,
        Some(0) => false,
        _ => {
            if query_overrides.and_then(|q| q.file.as_deref()).is_some() {
                false
            } else {
                state.dir_mode
            }
        }
    };

    let cu = &user_cfg.clickup;
    let init_json = serde_json::json!({
        "currentFile": file_str,
        "initialToc": rendered.toc,
        "initialRelPath": if file_path.is_some() { rel_display.clone() } else { String::new() },
        "splitFile": effective_split_file.as_ref().map(|p| p.to_string_lossy()),
        "splitDirection": effective_split_dir,
        "workspaceDir": state.workspace_dir.to_string_lossy(),
        "workspaceName": workspace_name,
        "dirMode": effective_dir_mode,
        "defaultTheme": state.default_theme,
        "defaultZoom": user_cfg.zoom,
        "maximized": user_cfg.maximized,
        "savedWorkspaceState": load_workspace_state(&state.workspace_dir),
        "clickup": {
            "connected": cu.effective_token().is_some(),
            "hasSavedToken": cu.api_token.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false),
            "selectedTeamId": cu.selected_team_id,
        }
    });

    format!(
        r#"<!DOCTYPE html>
<html lang="es" data-theme="{theme}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title} — mdv</title>
  <link rel="icon" type="image/png" sizes="256x256" href="/assets/icon-256.png" />
  <link rel="icon" type="image/png" sizes="128x128" href="/assets/icon-128.png" />
  <link rel="icon" type="image/png" sizes="64x64" href="/assets/icon-64.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/icon-32.png" />
  <link rel="icon" type="image/x-icon" href="/favicon.ico" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="stylesheet" href="/vendor/overlayscrollbars/overlayscrollbars.min.css" />
  <link rel="stylesheet" href="/vendor/xterm/xterm.css" />
  <link rel="stylesheet" href="/vendor/katex/katex.min.css" />
  <link rel="stylesheet" href="/assets/styles.css?v=2.12.0" />
</head>
<body class="{body_cls_str}">
  <div class="mdv-win-resize-ring" aria-hidden="true">
    <div class="mdv-win-edge is-n" data-win-resize="N"></div>
    <div class="mdv-win-edge is-s" data-win-resize="S"></div>
    <div class="mdv-win-edge is-e" data-win-resize="E"></div>
    <div class="mdv-win-edge is-w" data-win-resize="W"></div>
    <div class="mdv-win-edge is-nw" data-win-resize="NW"></div>
    <div class="mdv-win-edge is-ne" data-win-resize="NE"></div>
    <div class="mdv-win-edge is-sw" data-win-resize="SW"></div>
    <div class="mdv-win-edge is-se" data-win-resize="SE"></div>
  </div>

  <header id="mdv-topbar" class="mdv-topbar">
    <div class="mdv-topbar-left">
      <div class="mdv-app-brand" title="mdv — Markdown &amp; WSL Workspace">{logo_svg}</div>
      <div class="mdv-file-badge">
        <span id="mdv-live-dot" class="mdv-live-dot" title="Servidor conectado"></span>
        <strong class="mdv-workspace-crumb-main" title="{ws_full}">{ws_name}</strong>
        <span class="mdv-crumb-sep">/</span>
        <span id="mdv-filename" class="mdv-filename-sub">{rel_display}</span>
        <span id="mdv-reload-pill" class="mdv-reload-pill" hidden>Actualizado</span>
      </div>

      <div class="mdv-btn-pill-group" role="group" aria-label="Splits de Terminales">
        <button type="button" id="mdv-focus-term-zone" class="mdv-tool-btn is-active" title="Enfocar vista principal de Terminales">
          <span class="mdv-term-glyph">&gt;_</span>
          <span>Terminales</span>
        </button>
        <button type="button" id="mdv-term-vertical" class="mdv-tool-btn mdv-term-btn" title="Dividir Terminal a la derecha (Ctrl+Alt+R o Alt+Shift+R)">
          <span>+|</span>
        </button>
        <button type="button" id="mdv-term-horizontal" class="mdv-tool-btn mdv-term-btn" title="Dividir Terminal abajo (Ctrl+Alt+D o Alt+Shift+D)">
          <span>+—</span>
        </button>
      </div>
    </div>

    <div class="mdv-topbar-right">
      <div class="mdv-btn-pill-group" role="group" aria-label="Panel lateral">
        <button type="button" class="mdv-tool-btn is-active" data-top-tab="markdown" title="Abrir tab Markdown (Alt+1)">
          <span>Markdown</span>
        </button>
        <button type="button" class="mdv-tool-btn" data-top-tab="clickup" title="Abrir tab Clickup (Alt+2)">
          <span>Clickup</span>
        </button>
        <button type="button" id="mdv-toggle-side-zone" class="mdv-tool-btn is-active" title="Mostrar/ocultar panel lateral (Alt+B)">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75C0 1.784.784 1 1.75 1ZM1.5 2.75v10.5c0 .138.112.25.25.25H9.5v-11H1.75a.25.25 0 0 0-.25.25Zm9.5 10.75h3.25a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25H11Z"/></svg>
        </button>
      </div>

      <div class="mdv-btn-pill-group" role="group" aria-label="Tamaño de letra">
        <button type="button" id="mdv-font-dec" class="mdv-tool-btn mdv-font-btn" title="Achicar letra (-)">A−</button>
        <button type="button" id="mdv-font-reset" class="mdv-tool-btn mdv-font-pct" title="Restablecer tamaño (0)">{zoom}%</button>
        <button type="button" id="mdv-font-inc" class="mdv-tool-btn mdv-font-btn" title="Agrandar letra (+)">A+</button>
      </div>

      <select id="mdv-theme-select" class="mdv-theme-select" aria-label="Tema visual" title="Cambiar tema (c)">
        <option value="tokyo">Tokyo Night</option>
        <option value="github-dark">GitHub Dark</option>
        <option value="catppuccin">Catppuccin</option>
        <option value="light">Claro (Paper)</option>
      </select>
      <button type="button" id="mdv-open-help" class="mdv-tool-btn" title="Atajos de teclado (?)">?</button>

      <div id="mdv-win-controls" class="mdv-win-controls" aria-label="Controles de ventana">
        <button type="button" id="mdv-win-min" class="mdv-win-btn" title="Minimizar" aria-label="Minimizar">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 5h8" stroke="currentColor" stroke-width="1.2"/></svg>
        </button>
        <button type="button" id="mdv-win-max" class="mdv-win-btn" title="Maximizar / Restaurar" aria-label="Maximizar">
          <svg class="mdv-icon-max" width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1.2" y="1.2" width="7.6" height="7.6" rx="0.8" stroke="currentColor" stroke-width="1.2"/></svg>
          <svg class="mdv-icon-restore" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 2.8V1.4h5.6V7H7.2" stroke="currentColor" stroke-width="1.1"/><rect x="1.2" y="3" width="5.8" height="5.8" rx="0.8" stroke="currentColor" stroke-width="1.2"/></svg>
        </button>
        <button type="button" id="mdv-win-close" class="mdv-win-btn mdv-win-btn-close" title="Cerrar (Alt+F4)" aria-label="Cerrar">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.25"/></svg>
        </button>
      </div>
    </div>
  </header>

  <div class="mdv-workspace">
    <main id="mdv-term-zone" class="mdv-term-zone" data-term-count="1" data-total-terms="1" aria-label="Vista Principal de Terminales">
      <div id="mdv-term-empty" class="mdv-term-empty" hidden>
        <div class="mdv-term-empty-box">
          <div class="mdv-term-glyph" style="font-size:1.35rem">&gt;_</div>
          <p id="mdv-term-empty-msg">Terminales en segundo plano</p>
          <button type="button" id="mdv-term-new-default" class="mdv-pane-btn">+ Abrir nueva terminal</button>
        </div>
      </div>
    </main>

    <div id="mdv-zone-resizer" class="mdv-zone-resizer" title="Arrastra para redimensionar · Doble clic restablecer"></div>

    <section id="mdv-side-zone" class="mdv-side-zone" data-active-tab="markdown" aria-label="Panel lateral con pestañas">
      <div class="mdv-side-tabbar">
        <div class="mdv-side-tabs" role="tablist">
          <button type="button" class="mdv-side-tab is-active" role="tab" aria-selected="true" data-side-tab="markdown">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5C0 2.784.784 2 1.75 2ZM1.5 3.75v8.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25ZM3 10.5v-5h1.5l1.5 2 1.5-2H9v5H7.5V7.6L6 9.6l-1.5-2v2.9H3Zm8.5 0L9.5 8h1.25V5.5h1.5V8h1.25l-2 2.5Z"/></svg>
            <span>Markdown</span>
          </button>
          <button type="button" class="mdv-side-tab" role="tab" aria-selected="false" data-side-tab="clickup">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M8 1.5 2.5 6.3l1.8 2.05L8 5.1l3.7 3.25 1.8-2.05L8 1.5Zm-4.3 8.15-1.6 2.1C3.75 13.3 5.75 14.2 8 14.2s4.25-.9 5.9-2.45l-1.6-2.1C11.1 10.8 9.65 11.5 8 11.5s-3.1-.7-4.3-1.85Z"/></svg>
            <span>Clickup</span>
            <span id="mdv-cu-count-chip" class="mdv-count-chip" hidden>0</span>
          </button>
        </div>

        <div id="mdv-md-toolbar" class="mdv-side-toolbar" data-overlayscrollbars-initialize>
          <div class="mdv-side-toolbar-inner">
            <button type="button" id="mdv-toggle-files" class="mdv-pane-btn{active_btn_cls}" title="Mostrar/ocultar árbol de archivos .md (e)">
              <span>Archivos</span>
              <span id="mdv-total-files" class="mdv-count-chip">{total_files}</span>
            </button>
            <button type="button" id="mdv-split-vertical" class="mdv-pane-btn" title="Dividir MD a la derecha">MD |</button>
            <button type="button" id="mdv-split-horizontal" class="mdv-pane-btn" title="Dividir MD abajo">MD —</button>
            <button type="button" id="mdv-open-search" class="mdv-pane-btn" title="Buscar en documento (/)">/</button>
            <button type="button" id="mdv-toggle-wide" class="mdv-pane-btn" title="Alternar ancho de lectura (w)">Ancho</button>
            <button type="button" id="mdv-toggle-toc" class="mdv-pane-btn" title="Mostrar/ocultar Índice (t)">Índice</button>
          </div>
        </div>

        <div id="mdv-cu-toolbar" class="mdv-side-toolbar" data-overlayscrollbars-initialize hidden>
          <div class="mdv-side-toolbar-inner">
            <button type="button" id="mdv-cu-only-terms" class="mdv-pane-btn" title="Mostrar solo las tareas que tienen una terminal abierta">
              <span>&gt;_ Con terminal</span>
              <span id="mdv-cu-terms-chip" class="mdv-count-chip" hidden>0</span>
            </button>
            <button type="button" id="mdv-cu-refresh" class="mdv-pane-btn" title="Actualizar listado de tareas">↻ Actualizar</button>
            <button type="button" id="mdv-cu-settings-btn" class="mdv-pane-btn" title="Configurar Personal API Token de ClickUp">⚙ Token</button>
          </div>
        </div>
      </div>

      <div id="mdv-tab-markdown" class="mdv-side-tabpanel">
        <aside class="mdv-sidebar-files">
          <div class="mdv-explorer-top">
            <div class="mdv-explorer-header">
              <h2 class="mdv-panel-title" title="{ws_full}">{ws_name}</h2>
              <div class="mdv-explorer-actions">
                <button type="button" id="mdv-tree-expand-all" class="mdv-mini-btn" title="Expandir subcarpetas">+</button>
                <button type="button" id="mdv-tree-collapse-all" class="mdv-mini-btn" title="Colapsar subcarpetas">−</button>
              </div>
            </div>
            <div class="mdv-file-filter-wrap">
              <input id="mdv-file-filter" type="text" placeholder="Filtrar .md... (Ctrl+P)" autocomplete="off" spellcheck="false" />
            </div>
          </div>
          <div id="mdv-files-scroll" class="mdv-sidebar-scroll" data-overlayscrollbars-initialize>
            <ul id="mdv-file-list" class="mdv-file-tree">{tree_html}</ul>
          </div>
        </aside>

        <div id="mdv-md-zone" class="mdv-md-zone" data-md-count="1">
          <div id="mdv-initial-html" hidden>{body_html}</div>
        </div>

        <aside class="mdv-sidebar-toc">
          <h2 class="mdv-panel-title mdv-toc-top">En esta página</h2>
          <div id="mdv-toc-scroll" class="mdv-sidebar-scroll" data-overlayscrollbars-initialize>
            <ul id="mdv-toc-list" class="mdv-toc-list">{toc_html}</ul>
          </div>
        </aside>
      </div>

      <div id="mdv-tab-clickup" class="mdv-side-tabpanel mdv-cu-panel" hidden>
        <div id="mdv-cu-auth-view" class="mdv-cu-auth-wrap" data-overlayscrollbars-initialize>
          <div class="mdv-cu-card">
            <div class="mdv-cu-card-head">
              <div>
                <h3>Conectar con ClickUp</h3>
                <p>En ClickUp abre <strong>Settings → Apps → API Token</strong>, genera o copia tu token personal (<code>pk_...</code>) y pégalo aquí.</p>
              </div>
            </div>

            <div>
              <button type="button" id="mdv-cu-open-apps-btn" class="mdv-pane-btn">
                Abrir ClickUp → Settings / Apps ↗
              </button>
            </div>

            <label class="mdv-cu-field">
              <span>Personal API Token</span>
              <input id="mdv-cu-token" type="password" placeholder="pk_..." autocomplete="off" spellcheck="false" />
            </label>

            <div id="mdv-cu-auth-error" class="mdv-cu-error" hidden></div>

            <div class="mdv-cu-actions">
              <button type="button" id="mdv-cu-connect-btn" class="mdv-cu-primary-btn">
                Conectar cuenta
              </button>
              <button type="button" id="mdv-cu-back-tasks-btn" class="mdv-pane-btn" hidden>Volver a tareas</button>
              <button type="button" id="mdv-cu-disconnect-btn" class="mdv-pane-btn mdv-cu-danger-btn" hidden>Desconectar cuenta</button>
            </div>
          </div>
        </div>

        <div id="mdv-cu-tasks-view" class="mdv-cu-tasks-wrap" hidden>
          <div class="mdv-cu-filterbar">
            <div class="mdv-cu-filterbar-top">
              <select id="mdv-cu-team-select" class="mdv-theme-select mdv-cu-team-select" title="Workspace de ClickUp"></select>
              <span id="mdv-cu-user-badge" class="mdv-cu-user-badge" title="Usuario conectado"></span>
            </div>
            <div id="mdv-cu-assignee-scroll" class="mdv-cu-assignee-scroll" data-overlayscrollbars-initialize>
              <div id="mdv-cu-assignee-tabs" class="mdv-cu-assignee-tabs" role="tablist" aria-label="Responsables"></div>
            </div>
            <div class="mdv-cu-search-row">
              <input id="mdv-cu-search" type="text" placeholder="Filtrar o pegar ID / URL de tarea (Enter busca en ClickUp)..." autocomplete="off" spellcheck="false" />
              <button type="button" id="mdv-cu-lookup-btn" class="mdv-pane-btn mdv-cu-lookup-btn" title="Buscar tarea por ID o URL directamente en ClickUp">Buscar ID</button>
            </div>
          </div>

          <div id="mdv-cu-tasks-error" class="mdv-cu-error" hidden></div>

          <div id="mdv-cu-scroll" class="mdv-cu-scroll" data-overlayscrollbars-initialize>
            <div id="mdv-cu-loading" class="mdv-cu-empty" hidden>Cargando tareas de ClickUp...</div>
            <div id="mdv-cu-empty" class="mdv-cu-empty" hidden>No se encontraron tareas abiertas con este filtro.</div>
            <ul id="mdv-cu-task-list" class="mdv-cu-task-list"></ul>
            <div id="mdv-cu-more-wrap" class="mdv-cu-more-wrap" hidden>
              <button type="button" id="mdv-cu-load-more" class="mdv-pane-btn">Cargar más tareas</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>

  <div id="mdv-search-bar" class="mdv-search-bar" hidden>
    <span class="mdv-search-Slash">/</span>
    <input id="mdv-search-input" type="text" placeholder="Buscar en documento Markdown... (Enter fijar, n/N navegar, Esc cerrar)" autocomplete="off" spellcheck="false" />
    <span id="mdv-search-count" class="mdv-search-count">0 / 0</span>
    <button type="button" id="mdv-search-prev" class="mdv-icon-btn" title="Anterior (N)">N</button>
    <button type="button" id="mdv-search-next" class="mdv-icon-btn" title="Siguiente (n)">n</button>
    <button type="button" id="mdv-search-close" class="mdv-icon-btn" title="Cerrar (Esc)">Esc</button>
  </div>

  <div class="mdv-vim-hud">
    <span id="mdv-vim-toast" class="mdv-vim-toast" hidden></span>
    <span id="mdv-vim-keys" class="mdv-vim-keys" hidden></span>
    <span id="mdv-vim-pos" class="mdv-vim-pos">TERM</span>
  </div>

  <div id="mdv-term-park" class="mdv-term-park" aria-hidden="true"></div>

  <div id="mdv-modal" class="mdv-modal" hidden>
    <div id="mdv-modal-scroll" class="mdv-modal-content" data-overlayscrollbars-initialize>
      <div id="mdv-modal-body"></div>
    </div>
  </div>

  <script>
    window.__MDV_INITIAL__ = {init_json};
  </script>
  <script src="/vendor/overlayscrollbars/overlayscrollbars.browser.es6.min.js"></script>
  <script src="/vendor/xterm/xterm.js"></script>
  <script src="/vendor/xterm/addon-fit.js"></script>
  <script src="/vendor/highlight/highlight.min.js"></script>
  <script src="/vendor/katex/katex.min.js"></script>
  <script src="/vendor/mermaid/mermaid.min.js"></script>
  <script src="/assets/app.js?v=2.12.0"></script>
</body>
</html>"#,
        theme = workspace::escape_html_attr(&state.default_theme),
        title = workspace::escape_html_attr(&page_title),
        body_cls_str = body_cls_str,
        active_btn_cls = active_btn_cls,
        total_files = scan.files.len(),
        ws_name = workspace::escape_html_attr(&workspace_name),
        ws_full = workspace::escape_html_attr(&state.workspace_dir.to_string_lossy()),
        rel_display = workspace::escape_html_attr(&rel_display),
        zoom = user_cfg.zoom,
        tree_html = tree_html,
        body_html = initial_body_html,
        toc_html = toc_html,
        init_json = init_json,
        logo_svg = assets::LOGO_SVG_STR
    )
}

async fn index_handler(
    State(state): State<Arc<AppState>>,
    Query(q): Query<DocQuery>,
) -> impl IntoResponse {
    let target = q
        .file
        .as_deref()
        .map(PathBuf::from)
        .filter(|p| p.is_file())
        .or_else(|| state.initial_file.clone().filter(|p| p.is_file()));

    let rendered = if let Some(ref fp) = target {
        if let Some(sig) = compute_file_sha1(fp) {
            if let Ok(mut map) = state.watched_files.lock() {
                map.insert(fp.clone(), sig);
            }
        }
        let raw = fs::read_to_string(fp).unwrap_or_default();
        let base_dir = fp.parent().unwrap_or(&state.workspace_dir);
        markdown::render_markdown_document(&raw, base_dir)
    } else {
        markdown::RenderedDocument {
            html: String::new(),
            toc: Vec::new(),
            title: None,
        }
    };

    let page = build_html_shell(&state, target.as_deref(), &rendered, Some(&q));
    Html(page)
}

async fn api_doc_handler(
    State(state): State<Arc<AppState>>,
    Query(q): Query<DocQuery>,
) -> Response {
    let target = q
        .file
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .or_else(|| state.initial_file.clone())
        .or_else(|| {
            let scan = workspace::scan_markdown_workspace(&state.workspace_dir, 8, 1500);
            workspace::pick_default_markdown_file(&scan.files, &state.workspace_dir)
        });

    let Some(target) = target.filter(|p| p.is_file()) else {
        let scan = workspace::scan_markdown_workspace(&state.workspace_dir, 8, 1500);
        let ws_name = state
            .workspace_dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "proyecto".to_string());
        return Json(ApiDocResponse {
            file_path: String::new(),
            file_name: String::new(),
            rel_path: "Sin .md".to_string(),
            total_files: scan.files.len(),
            tree_html: workspace::render_tree_nodes_html(&scan.children, ""),
            html: build_empty_markdown_html(&ws_name),
            toc: Vec::new(),
            title: None,
        })
        .into_response();
    };

    if let Some(sig) = compute_file_sha1(&target) {
        if let Ok(mut map) = state.watched_files.lock() {
            map.insert(target.clone(), sig);
        }
    }

    let raw = fs::read_to_string(&target).unwrap_or_default();
    let base_dir = target.parent().unwrap_or(&state.workspace_dir);
    let rendered = markdown::render_markdown_document(&raw, base_dir);
    let scan = workspace::scan_markdown_workspace(&state.workspace_dir, 8, 1500);
    let file_str = target.to_string_lossy().to_string();
    let file_name = target
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let rel_raw = workspace::normalize_rel_path(&state.workspace_dir, &target);
    let rel_path = if rel_raw.is_empty() {
        file_name.clone()
    } else {
        rel_raw
    };

    Json(ApiDocResponse {
        file_path: file_str.clone(),
        file_name,
        rel_path,
        total_files: scan.files.len(),
        tree_html: workspace::render_tree_nodes_html(&scan.children, &file_str),
        html: rendered.html,
        toc: rendered.toc,
        title: rendered.title,
    })
    .into_response()
}

async fn api_open_external_handler(Json(payload): Json<OpenExternalPayload>) -> Response {
    let url = payload.url.trim();
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "URL no permitida" })),
        )
            .into_response();
    }
    launch_window(url, false, false);
    Json(serde_json::json!({ "ok": true })).into_response()
}

async fn api_prefs_handler(Json(patch): Json<serde_json::Value>) -> impl IntoResponse {
    Json(save_user_config(patch))
}

async fn api_health_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    Json(serde_json::json!({
        "ok": true,
        "pid": std::process::id(),
        "workspace": state.workspace_dir.to_string_lossy(),
        "buildSig": current_build_signature(),
        "activePtys": state.pty_mgr.active_count(),
    }))
}

async fn api_daemon_stop_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    state.pty_mgr.kill_all();
    remove_daemon_info(&state.workspace_dir);
    let st = Arc::clone(&state);
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(40)).await;
        if let Some(ref tmp) = st.stdin_file {
            let _ = fs::remove_file(tmp);
        }
        std::process::exit(0);
    });
    Json(serde_json::json!({ "ok": true }))
}

async fn api_get_workspace_state_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    Json(load_workspace_state(&state.workspace_dir).unwrap_or(serde_json::Value::Null))
}

async fn api_save_workspace_state_handler(
    State(state): State<Arc<AppState>>,
    bytes: axum::body::Bytes,
) -> Response {
    match serde_json::from_slice::<serde_json::Value>(&bytes) {
        Ok(val) if val.is_object() => {
            save_workspace_state(&state.workspace_dir, &val);
            Json(serde_json::json!({ "ok": true })).into_response()
        }
        _ => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Payload inválido" })),
        )
            .into_response(),
    }
}

async fn api_pty_kill_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<KillPtyPayload>,
) -> impl IntoResponse {
    let killed = state.pty_mgr.kill_session(payload.session_id.trim());
    Json(serde_json::json!({ "ok": true, "killed": killed }))
}

async fn api_task_worktrees_handler(
    State(state): State<Arc<AppState>>,
    Query(q): Query<TaskWorktreesQuery>,
) -> impl IntoResponse {
    let codes: Vec<String> = q
        .codes
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .take(60)
        .collect();
    if codes.is_empty() {
        return Json(serde_json::json!({ "worktreesByCode": {} }));
    }
    let ws_dir = state.workspace_dir.clone();
    let map = tokio::task::spawn_blocking(move || {
        workspace::discover_worktrees_for_codes(&ws_dir, &codes)
    })
    .await
    .unwrap_or_default();
    Json(serde_json::json!({ "worktreesByCode": map }))
}

async fn api_app_quit_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    // Only terminate automatically for ephemeral stdin sessions; workspace daemons stay alive
    // so open & background terminals persist when closing and reopening the app!
    if !state.keep_alive && state.stdin_file.is_some() {
        let st = Arc::clone(&state);
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(40)).await;
            if let Some(ref tmp) = st.stdin_file {
                let _ = fs::remove_file(tmp);
            }
            std::process::exit(0);
        });
    }
    Json(serde_json::json!({ "ok": true }))
}

async fn local_file_handler(Query(q): Query<LocalFileQuery>) -> Response {
    let p = PathBuf::from(&q.path);
    if !p.is_file() {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    }
    match tokio::fs::read(&p).await {
        Ok(bytes) => {
            let mime = mime_guess::from_path(&p).first_or_octet_stream();
            let mut res = Response::new(Body::from(bytes));
            res.headers_mut().insert(
                header::CONTENT_TYPE,
                HeaderValue::from_str(mime.as_ref())
                    .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
            );
            res.headers_mut()
                .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            res
        }
        Err(_) => (StatusCode::NOT_FOUND, "Not found").into_response(),
    }
}

struct ClientDropGuard {
    state: Arc<AppState>,
}

impl Drop for ClientDropGuard {
    fn drop(&mut self) {
        let prev = self.state.active_clients.fetch_sub(1, Ordering::SeqCst);
        if prev == 1
            && self.state.had_client.load(Ordering::SeqCst)
            && !self.state.keep_alive
            && self.state.stdin_file.is_some()
        {
            let st = Arc::clone(&self.state);
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(3500)).await;
                if st.active_clients.load(Ordering::SeqCst) == 0 {
                    if let Some(tmp) = &st.stdin_file {
                        let _ = fs::remove_file(tmp);
                    }
                    std::process::exit(0);
                }
            });
        }
    }
}

async fn sse_events_handler(
    State(state): State<Arc<AppState>>,
) -> Sse<impl tokio_stream::Stream<Item = Result<SseEvent, Infallible>>> {
    state.active_clients.fetch_add(1, Ordering::SeqCst);
    state.had_client.store(true, Ordering::SeqCst);
    let guard = ClientDropGuard {
        state: Arc::clone(&state),
    };
    let rx = state.reload_tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(move |msg| {
        let _keep_guard_alive = &guard;
        msg.ok().map(|payload| Ok(SseEvent::default().event("reload").data(payload)))
    });
    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)).text("ping"))
}

async fn pty_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Query(q): Query<PtyQuery>,
) -> impl IntoResponse {
    let session_id = q
        .session_id
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("anon-{}", ANON_PTY_SEQ.fetch_add(1, Ordering::SeqCst)));
    let cwd = q
        .cwd
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .unwrap_or_else(|| state.workspace_dir.clone());
    let cols = q.cols.unwrap_or(90);
    let rows = q.rows.unwrap_or(26);
    let initial_paused = q.paused == Some(1);
    let task_env = pty::TaskPtyEnv {
        id: q.task_id,
        code: q.task_code,
        name: q.task_name,
        url: q.task_url,
    };
    let pty_mgr = Arc::clone(&state.pty_mgr);
    ws.on_upgrade(move |socket| {
        pty::handle_pty_ws(
            socket,
            pty_mgr,
            session_id,
            cwd,
            cols,
            rows,
            initial_paused,
            task_env,
        )
    })
}

fn find_chromium_browser() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let mut candidates = Vec::new();
        for env_key in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
            if let Ok(base) = std::env::var(env_key) {
                let b = PathBuf::from(base);
                candidates.push(b.join(r"Google\Chrome\Application\chrome.exe"));
                candidates.push(b.join(r"Microsoft\Edge\Application\msedge.exe"));
                candidates.push(b.join(r"BraveSoftware\Brave-Browser\Application\brave.exe"));
            }
        }
        for c in candidates {
            if c.is_file() {
                return Some(c);
            }
        }
        None
    }

    #[cfg(unix)]
    {
        let wsl_candidates = [
            "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
            "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
            "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
            "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe",
            "/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
        ];
        for c in wsl_candidates {
            let p = PathBuf::from(c);
            if p.is_file() {
                return Some(p);
            }
        }
        for bin in ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"] {
            if let Ok(out) = Command::new("which").arg(bin).output() {
                if out.status.success() {
                    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !s.is_empty() {
                        return Some(PathBuf::from(s));
                    }
                }
            }
        }
        None
    }
}

#[cfg(unix)]
fn find_wsl_cmd_exe() -> Option<&'static Path> {
    for c in [
        "/mnt/c/Windows/System32/cmd.exe",
        "/mnt/c/WINDOWS/system32/cmd.exe",
    ] {
        let p = Path::new(c);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

#[cfg(unix)]
fn get_windows_localappdata() -> Option<String> {
    if let Some(cmd_exe) = find_wsl_cmd_exe() {
        let mut cmd = Command::new(cmd_exe);
        cmd.args(["/d", "/c", "echo %LOCALAPPDATA%"]);
        if Path::new("/mnt/c").is_dir() {
            // Avoid CMD.EXE UNC path warning when invoked from a Linux filesystem path (/home/...)
            cmd.current_dir("/mnt/c");
        }
        if let Ok(out) = cmd.output() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Some(line) = text
                .lines()
                .map(|l| l.trim())
                .rev()
                .find(|l| {
                    let b = l.as_bytes();
                    b.len() >= 3 && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/') && !l.contains('%')
                })
            {
                return Some(line.to_string());
            }
        }
    }

    // Fallback: inspect /mnt/c/Users/<user>/AppData/Local directly without spawning cmd.exe
    if let Ok(entries) = fs::read_dir("/mnt/c/Users") {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if matches!(
                name.as_str(),
                "Public" | "Default" | "Default User" | "All Users" | "desktop.ini"
            ) {
                continue;
            }
            let local_dir = entry.path().join("AppData").join("Local");
            if local_dir.is_dir() {
                return Some(format!(r"C:\Users\{}\AppData\Local", name));
            }
        }
    }
    None
}

fn get_app_profile_dir(for_windows_browser: bool) -> Option<String> {
    #[cfg(windows)]
    {
        let _ = for_windows_browser;
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            return Some(format!(r"{}\mdv-viewer-profile", local));
        }
        None
    }
    #[cfg(unix)]
    {
        if for_windows_browser {
            return get_windows_localappdata().map(|s| format!(r"{}\mdv-viewer-profile", s));
        }
        dirs::cache_dir().map(|d| d.join("mdv-viewer-profile").to_string_lossy().to_string())
    }
}

#[cfg(unix)]
fn win_path_to_wsl(win_path: &str) -> Option<PathBuf> {
    let trimmed = win_path.trim().replace('\\', "/");
    let bytes = trimmed.as_bytes();
    if bytes.len() >= 3 && bytes[1] == b':' && bytes[2] == b'/' {
        let drive = (bytes[0] as char).to_ascii_lowercase();
        return Some(PathBuf::from(format!("/mnt/{}/{}", drive, &trimmed[3..])));
    }
    None
}

#[cfg(unix)]
fn find_windows_native_mdv_exe() -> Option<PathBuf> {
    if let Ok(explicit) = std::env::var("MDV_WIN_EXE") {
        let p = PathBuf::from(explicit.trim());
        if p.is_file() {
            return Some(p);
        }
    }
    if let Some(local) = get_windows_localappdata() {
        if let Some(base) = win_path_to_wsl(&local) {
            let candidate = base.join("Programs").join("mdv").join("mdv.exe");
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    if let Ok(entries) = fs::read_dir("/mnt/c/Users") {
        for entry in entries.flatten() {
            let candidate = entry
                .path()
                .join("AppData")
                .join("Local")
                .join("Programs")
                .join("mdv")
                .join("mdv.exe");
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    if let Ok(self_exe) = std::env::current_exe() {
        // Also check sibling Windows target builds when developing from repo
        if let Some(repo_root) = self_exe.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
            for rel in [
                "target/x86_64-pc-windows-msvc/release/mdv.exe",
                "target/x86_64-pc-windows-msvc/debug/mdv.exe",
            ] {
                let c = repo_root.join(rel);
                if c.is_file() {
                    return Some(c);
                }
            }
        }
    }
    None
}

pub(crate) fn launch_window(url: &str, app_mode: bool, maximized: bool) {
    #[cfg(windows)]
    if app_mode {
        if let Ok(self_exe) = std::env::current_exe() {
            use std::os::windows::process::CommandExt;
            let mut cmd = Command::new(self_exe);
            cmd.arg("--app-url").arg(url);
            if !maximized {
                cmd.arg("--windowed");
            }
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
            if cmd.spawn().is_ok() {
                return;
            }
        }
    }

    #[cfg(unix)]
    if app_mode {
        if let Some(win_mdv) = find_windows_native_mdv_exe() {
            let mut cmd = Command::new(win_mdv);
            cmd.arg("--app-url").arg(url);
            if !maximized {
                cmd.arg("--windowed");
            }
            if Path::new("/mnt/c").is_dir() {
                cmd.current_dir("/mnt/c");
            }
            cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
            if cmd.spawn().is_ok() {
                return;
            }
        }
    }

    if let Some(browser) = find_chromium_browser() {
        let is_win_browser = cfg!(windows)
            || browser
                .to_string_lossy()
                .to_ascii_lowercase()
                .ends_with(".exe");
        let mut cmd = Command::new(&browser);
        if app_mode {
            cmd.arg(format!("--app={}", url));
            cmd.arg("--no-first-run");
            cmd.arg("--no-default-browser-check");
            if let Some(prof) = get_app_profile_dir(is_win_browser) {
                cmd.arg(format!("--user-data-dir={}", prof));
            }
            if maximized {
                cmd.arg("--start-maximized");
            } else {
                cmd.arg("--window-size=1420,880");
            }
        } else {
            cmd.arg(url);
        }
        #[cfg(unix)]
        if is_win_browser && Path::new("/mnt/c").is_dir() {
            cmd.current_dir("/mnt/c");
        }
        cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let _ = cmd.spawn();
        return;
    }

    #[cfg(windows)]
    {
        let _ = Command::new("cmd")
            .args(["/c", "start", "", url])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }
    #[cfg(unix)]
    {
        if let Some(cmd_exe) = find_wsl_cmd_exe() {
            let mut cmd = Command::new(cmd_exe);
            cmd.args(["/d", "/c", "start", "", url]);
            if Path::new("/mnt/c").is_dir() {
                cmd.current_dir("/mnt/c");
            }
            let _ = cmd
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();
        } else {
            let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
            let _ = Command::new(opener)
                .arg(url)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();
        }
    }
}

fn resolve_initial_target(target_arg: Option<&str>, explicit_workspace: Option<&str>) -> (Option<PathBuf>, PathBuf, bool) {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let raw = match target_arg {
        Some(t) => {
            let p = PathBuf::from(t);
            if p.is_absolute() {
                p
            } else {
                cwd.join(p)
            }
        }
        None => cwd.clone(),
    };

    if !raw.exists() {
        eprintln!("Error: no existe '{}'", raw.display());
        std::process::exit(1);
    }

    let canonical = raw.canonicalize().unwrap_or(raw);
    #[cfg(windows)]
    let canonical = {
        let s = canonical.to_string_lossy();
        if let Some(stripped) = s.strip_prefix(r"\\?\") {
            PathBuf::from(stripped)
        } else {
            canonical
        }
    };

    if canonical.is_dir() {
        let scan = workspace::scan_markdown_workspace(&canonical, 8, 1500);
        let initial = workspace::pick_default_markdown_file(&scan.files, &canonical);
        return (initial, canonical, true);
    }

    let ws = if let Some(exp) = explicit_workspace {
        PathBuf::from(exp)
    } else {
        let home = dirs::home_dir();
        if canonical.starts_with(&cwd) && Some(cwd.as_path()) != home.as_deref() && cwd.parent().is_some() {
            cwd
        } else {
            canonical.parent().unwrap_or(&canonical).to_path_buf()
        }
    };

    (Some(canonical), ws, false)
}

fn run_self_update() {
    #[cfg(unix)]
    {
        println!("Actualizando mdv desde GitHub Releases...");
        let status = Command::new("bash")
            .args([
                "-c",
                "curl -fsSL https://raw.githubusercontent.com/dmolinae/mdv/main/install.sh | bash",
            ])
            .status();
        match status {
            Ok(s) if s.success() => std::process::exit(0),
            _ => {
                eprintln!("Error al actualizar mdv.");
                std::process::exit(1);
            }
        }
    }
    #[cfg(windows)]
    {
        println!("Actualizando mdv en Windows desde GitHub Releases...");
        let status = Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "irm https://raw.githubusercontent.com/dmolinae/mdv/main/install.ps1 | iex",
            ])
            .status();
        match status {
            Ok(s) if s.success() => std::process::exit(0),
            _ => {
                eprintln!("Error al actualizar mdv.");
                std::process::exit(1);
            }
        }
    }
}

fn main() {
    #[cfg(windows)]
    win_app::init_windows_process();

    let mut cli = Cli::parse();

    if cli.update {
        run_self_update();
    }

    #[cfg(windows)]
    if let Some(ref remote_url) = cli.app_url {
        win_app::run_native_window(remote_url, "mdv", !cli.windowed, true, None);
    }

    #[cfg(not(windows))]
    if let Some(ref remote_url) = cli.app_url {
        launch_window(remote_url, true, !cli.windowed);
        return;
    }

    // Read piped stdin into temporary file if invoked as `cat foo.md | mdv`
    if cli.target.is_none() && cli.stdin_file.is_none() && !std::io::stdin().is_terminal() {
        let mut buf = String::new();
        if std::io::stdin().read_to_string(&mut buf).is_ok() && !buf.is_empty() {
            let tmp = std::env::temp_dir().join(format!("mdv-stdin-{}.md", std::process::id()));
            if fs::write(&tmp, buf).is_ok() {
                let s = tmp.to_string_lossy().to_string();
                cli.stdin_file = Some(s.clone());
                cli.target = Some(s);
            }
        }
    } else if let Some(ref sf) = cli.stdin_file {
        cli.target = Some(sf.clone());
    }

    let user_cfg = load_user_config();
    let theme = cli.theme.clone().unwrap_or_else(|| user_cfg.theme.clone());
    let maximized = if cli.windowed { false } else { user_cfg.maximized };
    let split_arg = cli.split.clone().or_else(|| cli.second_target.clone());

    let (initial_file, workspace_dir, is_dir_target) =
        resolve_initial_target(cli.target.as_deref(), cli.workspace.as_deref());
    let effective_dir_mode = cli.dir_mode || is_dir_target;

    if cli.stop {
        if stop_existing_daemon(&workspace_dir) {
            println!(
                "Servidor y terminales detenidos en {}",
                workspace_dir.display()
            );
        } else {
            println!("No había servidor activo en {}", workspace_dir.display());
        }
        return;
    }

    let resolved_split = split_arg.map(|s| {
        let p = PathBuf::from(&s);
        let full = if p.is_absolute() {
            p
        } else {
            std::env::current_dir().unwrap_or_default().join(p)
        };
        if !full.is_file() {
            eprintln!("Error: no existe el segundo archivo '{}'", s);
            std::process::exit(1);
        }
        full.canonicalize().unwrap_or(full)
    });

    // Detach server in background by default so terminal prompt returns immediately
    if !cli.foreground && !cli.server_child && !cli.no_open {
        let label = if effective_dir_mode || initial_file.is_none() {
            format!(
                "carpeta {}",
                workspace_dir
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| workspace_dir.to_string_lossy().to_string())
            )
        } else {
            initial_file
                .as_ref()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default()
        };

        // Reuse existing per-workspace daemon if alive so open terminals persist seamlessly!
        if cli.port == 0 && cli.stdin_file.is_none() {
            if let Some(existing_port) = probe_existing_daemon(&workspace_dir) {
                let mut q_parts: Vec<String> = Vec::new();
                if effective_dir_mode {
                    q_parts.push("dir=1".to_string());
                } else if let Some(ref f) = initial_file {
                    q_parts.push("dir=0".to_string());
                    q_parts.push(format!(
                        "file={}",
                        percent_encode_query_val(&f.to_string_lossy())
                    ));
                }
                if let Some(ref sp) = resolved_split {
                    q_parts.push(format!(
                        "split={}",
                        percent_encode_query_val(&sp.to_string_lossy())
                    ));
                    if cli.horizontal {
                        q_parts.push("hz=1".to_string());
                    }
                }
                let target_url = if q_parts.is_empty() {
                    format!("http://127.0.0.1:{}", existing_port)
                } else {
                    format!("http://127.0.0.1:{}/?{}", existing_port, q_parts.join("&"))
                };
                launch_window(&target_url, !cli.browser, maximized);
                println!("Reabriendo {} en ventana mdv...", label);
                return;
            }
        }

        let exe = std::env::current_exe().expect("Cannot locate mdv executable");
        let mut cmd = Command::new(exe);
        if let Some(ref f) = initial_file {
            cmd.arg(f);
        } else {
            cmd.arg(&workspace_dir);
        }
        cmd.arg("--workspace")
            .arg(&workspace_dir)
            .arg("--server-child")
            .arg("--theme")
            .arg(&theme);
        if let Some(ref sp) = resolved_split {
            cmd.arg("--split").arg(sp);
            if cli.horizontal {
                cmd.arg("--hz");
            }
        }
        if effective_dir_mode {
            cmd.arg("--dir-mode");
        }
        if !maximized {
            cmd.arg("--windowed");
        }
        if cli.browser {
            cmd.arg("--browser");
        }
        if cli.keep_alive {
            cmd.arg("--keep-alive");
        }
        if cli.port != 0 {
            cmd.arg("--port").arg(cli.port.to_string());
        }
        if let Some(ref sf) = cli.stdin_file {
            cmd.arg("--stdin-file").arg(sf);
        }
        cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW on Windows!
        }
        let _ = cmd.spawn();
        println!("Abriendo {} en ventana mdv...", label);
        return;
    }

    #[cfg(windows)]
    let stdin_cleanup = cli.stdin_file.as_ref().map(PathBuf::from);
    #[cfg(windows)]
    let initial_win_title = initial_file
        .as_ref()
        .and_then(|p| p.file_name())
        .map(|n| format!("{} — mdv", n.to_string_lossy()))
        .unwrap_or_else(|| {
            let ws_label = workspace_dir
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "mdv".to_string());
            format!("{} — mdv", ws_label)
        });

    let server_future = async move {
        let (reload_tx, _) = broadcast::channel::<String>(32);
        let mut initial_map = HashMap::new();
        if let Some(ref f) = initial_file {
            if let Some(sig) = compute_file_sha1(f) {
                initial_map.insert(f.clone(), sig);
            }
        }
        if let Some(ref sp) = resolved_split {
            if let Some(sig) = compute_file_sha1(sp) {
                initial_map.insert(sp.clone(), sig);
            }
        }

        let record_daemon = cli.stdin_file.is_none() && cli.port == 0;
        let state = Arc::new(AppState {
            initial_file: initial_file.clone(),
            split_file: resolved_split,
            split_direction: if cli.horizontal {
                "horizontal".to_string()
            } else {
                "vertical".to_string()
            },
            workspace_dir: workspace_dir.clone(),
            dir_mode: effective_dir_mode,
            default_theme: theme,
            keep_alive: cli.keep_alive,
            stdin_file: cli.stdin_file.map(PathBuf::from),
            watched_files: Mutex::new(initial_map),
            reload_tx: reload_tx.clone(),
            active_clients: AtomicUsize::new(0),
            had_client: AtomicBool::new(false),
            clickup: clickup::ClickUpRuntime::default(),
            github: github::GitHubRuntime::default(),
            pty_mgr: Arc::new(pty::PtyManager::default()),
        });

        // Run blocking filesystem live-reload watchers on a dedicated OS thread (never on Tokio async workers!)
        // so PTY WebSocket keystrokes and output stay 100% jitter-free.
        {
            let st = Arc::clone(&state);
            let _ = std::thread::Builder::new()
                .name("mdv-fs-watch".into())
                .spawn(move || {
                    let mut last_count: Option<usize> = None;
                    let mut tick_num: u32 = 0;
                    loop {
                        std::thread::sleep(Duration::from_millis(350));
                        if st.active_clients.load(Ordering::Relaxed) == 0 {
                            continue;
                        }

                        // 1. Check watched open Markdown files (every 350ms)
                        let paths_to_check: Vec<(PathBuf, String)> = st
                            .watched_files
                            .lock()
                            .map(|map| map.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
                            .unwrap_or_default();

                        let mut changed_files = Vec::new();
                        for (path, prev_sig) in paths_to_check {
                            if let Some(new_sig) = compute_file_sha1(&path) {
                                if new_sig != prev_sig {
                                    if let Ok(mut map) = st.watched_files.lock() {
                                        map.insert(path.clone(), new_sig);
                                    }
                                    changed_files.push(path.to_string_lossy().to_string());
                                }
                            }
                        }
                        for f in changed_files {
                            let payload =
                                serde_json::json!({ "file": f, "reason": "content" }).to_string();
                            let _ = st.reload_tx.send(payload);
                        }

                        // 2. Check workspace Markdown file count (every ~4.9s on this dedicated thread)
                        tick_num = tick_num.wrapping_add(1);
                        if last_count.is_none() || tick_num % 14 == 0 {
                            let count =
                                workspace::scan_markdown_workspace(&st.workspace_dir, 8, 1500)
                                    .files
                                    .len();
                            if let Some(prev) = last_count {
                                if count != prev {
                                    let payload =
                                        serde_json::json!({ "file": null, "reason": "tree" })
                                            .to_string();
                                    let _ = st.reload_tx.send(payload);
                                }
                            }
                            last_count = Some(count);
                        }
                    }
                });
        }

        if cli.server_child && !cli.keep_alive {
            let st = Arc::clone(&state);
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_secs(45)).await;
                if !st.had_client.load(Ordering::SeqCst) {
                    remove_daemon_info(&st.workspace_dir);
                    std::process::exit(0);
                }
            });
        }

        let app = Router::new()
            .route("/", get(index_handler))
            .route("/events", get(sse_events_handler))
            .route("/api/health", get(api_health_handler))
            .route("/api/daemon-stop", post(api_daemon_stop_handler))
            .route(
                "/api/workspace-state",
                get(api_get_workspace_state_handler).post(api_save_workspace_state_handler),
            )
            .route("/api/pty/kill", post(api_pty_kill_handler))
            .route("/api/task-worktrees", get(api_task_worktrees_handler))
            .route("/api/doc", get(api_doc_handler))
            .route("/api/prefs", post(api_prefs_handler))
            .route("/api/app-quit", post(api_app_quit_handler))
            .route("/api/open-external", post(api_open_external_handler))
            .route("/api/clickup/status", get(clickup::api_clickup_status_handler))
            .route("/api/clickup/connect", post(clickup::api_clickup_connect_handler))
            .route("/api/clickup/disconnect", post(clickup::api_clickup_disconnect_handler))
            .route("/api/clickup/tasks", get(clickup::api_clickup_tasks_handler))
            .route("/api/clickup/task-lookup", get(clickup::api_clickup_task_lookup_handler))
            .route("/api/github/task-prs", post(github::api_github_task_prs_handler))
            .route("/local-file", get(local_file_handler))
            .route("/ws/pty", get(pty_ws_handler))
            .route(
                "/favicon.ico",
                get(|| async { assets::serve_bytes(assets::ICON_ICO, "image/x-icon", false) }),
            )
            .route(
                "/manifest.webmanifest",
                get(|| async {
                    assets::serve_bytes(
                        assets::WEB_MANIFEST_JSON,
                        "application/manifest+json; charset=utf-8",
                        false,
                    )
                }),
            )
            .route("/assets/icon-32.png", get(|| async { assets::serve_ico_png_frame(32) }))
            .route("/assets/icon-64.png", get(|| async { assets::serve_ico_png_frame(64) }))
            .route("/assets/icon-128.png", get(|| async { assets::serve_ico_png_frame(128) }))
            .route("/assets/icon-256.png", get(|| async { assets::serve_ico_png_frame(256) }))
            .route(
                "/assets/logo.svg",
                get(|| async { assets::serve_bytes(assets::LOGO_SVG, "image/svg+xml; charset=utf-8", false) }),
            )
            .route(
                "/assets/styles.css",
                get(|| async { assets::serve_bytes(assets::STYLES_CSS, "text/css; charset=utf-8", false) }),
            )
            .route(
                "/assets/app.js",
                get(|| async { assets::serve_bytes(assets::APP_JS, "application/javascript; charset=utf-8", false) }),
            )
            .route(
                "/vendor/overlayscrollbars/overlayscrollbars.min.css",
                get(|| async { assets::serve_bytes(assets::OVERLAYSCROLLBARS_CSS, "text/css; charset=utf-8", false) }),
            )
            .route(
                "/vendor/overlayscrollbars/overlayscrollbars.browser.es6.min.js",
                get(|| async {
                    assets::serve_bytes(
                        assets::OVERLAYSCROLLBARS_JS_GZ,
                        "application/javascript; charset=utf-8",
                        true,
                    )
                }),
            )
            .route(
                "/vendor/xterm/xterm.css",
                get(|| async { assets::serve_bytes(assets::XTERM_CSS, "text/css; charset=utf-8", false) }),
            )
            .route(
                "/vendor/xterm/xterm.js",
                get(|| async { assets::serve_bytes(assets::XTERM_JS_GZ, "application/javascript; charset=utf-8", true) }),
            )
            .route(
                "/vendor/xterm/addon-fit.js",
                get(|| async { assets::serve_bytes(assets::XTERM_FIT_JS, "application/javascript; charset=utf-8", false) }),
            )
            .route(
                "/vendor/highlight/highlight.min.js",
                get(|| async {
                    assets::serve_bytes(assets::HIGHLIGHT_JS_GZ, "application/javascript; charset=utf-8", true)
                }),
            )
            .route(
                "/vendor/mermaid/mermaid.min.js",
                get(|| async {
                    assets::serve_bytes(assets::MERMAID_JS_GZ, "application/javascript; charset=utf-8", true)
                }),
            )
            .route(
                "/vendor/katex/*rel",
                get(|AxumPath(rel): AxumPath<String>| async move { assets::serve_katex_asset(&rel) }),
            )
            .with_state(state);

        let listener = tokio::net::TcpListener::bind(("127.0.0.1", cli.port))
            .await
            .expect("Failed to bind local port");
        let local_addr = listener.local_addr().unwrap();
        if record_daemon {
            write_daemon_info(&workspace_dir, local_addr.port());
        }
        let url = format!("http://127.0.0.1:{}", local_addr.port());

        if !cli.server_child {
            println!("mdv 2.0.0 (Rust) escuchando en {} ({})", url, workspace_dir.display());
        }

        (listener, app, url)
    };

    #[cfg(windows)]
    if cli.foreground && !cli.browser && !cli.no_open {
        let (url_tx, url_rx) = std::sync::mpsc::sync_channel::<String>(1);
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("Failed to initialize Tokio runtime");
            rt.block_on(async move {
                let (listener, app, url) = server_future.await;
                let _ = url_tx.send(url);
                axum::serve(listener, app).tcp_nodelay(true).await.unwrap();
            });
        });

        let bound_url = url_rx.recv().expect("Local server failed to start");
        win_app::run_native_window(&bound_url, &initial_win_title, maximized, true, stdin_cleanup);
    }

    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to initialize Tokio runtime");
    rt.block_on(async move {
        let (listener, app, url) = server_future.await;
        if !cli.no_open {
            launch_window(&url, !cli.browser, maximized);
        }
        axum::serve(listener, app).tcp_nodelay(true).await.unwrap();
    });
}
