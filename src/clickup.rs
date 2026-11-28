use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tokio::io::AsyncWriteExt;

use crate::{load_user_config, update_user_config, AppState};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpConfig {
    #[serde(default, alias = "accessToken")]
    pub api_token: Option<String>,
    #[serde(default)]
    pub selected_team_id: Option<String>,
    #[serde(default)]
    pub user_id: Option<i64>,
    #[serde(default)]
    pub user_name: Option<String>,
}

impl ClickUpConfig {
    pub fn effective_token(&self) -> Option<String> {
        if let Some(ref t) = self.api_token {
            let trimmed = t.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
        for key in ["CLICKUP_API_TOKEN", "CLICKUP_TOKEN"] {
            if let Ok(val) = std::env::var(key) {
                let trimmed = val.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
        None
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpUserSummary {
    pub id: i64,
    pub username: String,
    pub email: Option<String>,
    pub initials: Option<String>,
    pub color: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpTeamSummary {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpAssigneeSummary {
    pub id: i64,
    pub name: String,
    pub initials: String,
    pub color: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpTaskSummary {
    pub id: String,
    pub custom_id: Option<String>,
    pub name: String,
    pub status: String,
    pub status_type: String,
    pub status_color: String,
    pub priority: Option<String>,
    pub priority_color: Option<String>,
    pub list_name: Option<String>,
    pub folder_name: Option<String>,
    pub areas: Vec<String>,
    pub assignees: Vec<ClickUpAssigneeSummary>,
    pub url: String,
    pub date_updated: Option<String>,
    pub due_date: Option<String>,
}

#[derive(Default)]
pub struct ClickUpRuntime {
    pub cached_user: Mutex<Option<ClickUpUserSummary>>,
    pub cached_teams: Mutex<Vec<ClickUpTeamSummary>>,
    pub cached_pipeline_statuses: Mutex<HashMap<String, Vec<String>>>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectClickUpPayload {
    pub api_token: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TasksQuery {
    pub team_id: Option<String>,
    pub only_mine: Option<bool>,
    pub page: Option<u32>,
    pub refresh_meta: Option<bool>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskLookupQuery {
    pub q: String,
    pub team_id: Option<String>,
}

fn escape_curl_cfg(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for ch in s.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            _ => out.push(ch),
        }
    }
    out
}

fn find_curl_bin() -> &'static str {
    #[cfg(windows)]
    {
        if std::path::Path::new(r"C:\Windows\System32\curl.exe").is_file() {
            return r"C:\Windows\System32\curl.exe";
        }
        "curl.exe"
    }
    #[cfg(not(windows))]
    {
        "curl"
    }
}

async fn clickup_api_request(
    method: &str,
    url: &str,
    api_token: &str,
) -> Result<(u16, serde_json::Value), String> {
    let mut cfg = String::new();
    cfg.push_str(&format!("url = \"{}\"\n", escape_curl_cfg(url)));
    cfg.push_str(&format!("request = \"{}\"\n", escape_curl_cfg(method)));
    cfg.push_str("header = \"Accept: application/json\"\n");

    let auth_val = if api_token.starts_with("pk_oauth_") {
        format!("Bearer {}", api_token)
    } else {
        api_token.to_string()
    };
    cfg.push_str(&format!(
        "header = \"Authorization: {}\"\n",
        escape_curl_cfg(&auth_val)
    ));

    let mut cmd = tokio::process::Command::new(find_curl_bin());
    cmd.args([
        "-sS",
        "-L",
        "--max-time",
        "25",
        "-w",
        "\n__MDV_HTTP_STATUS__:%{http_code}",
        "--config",
        "-",
    ])
    .stdin(std::process::Stdio::piped())
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    {
        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("No se pudo ejecutar curl para conectar con ClickUp: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(cfg.as_bytes())
            .await
            .map_err(|e| format!("Error enviando petición a curl: {}", e))?;
    }

    let out = child
        .wait_with_output()
        .await
        .map_err(|e| format!("Error esperando respuesta de ClickUp: {}", e))?;

    let stdout_str = String::from_utf8_lossy(&out.stdout);
    let stderr_str = String::from_utf8_lossy(&out.stderr);

    let Some((raw_body, code_str)) = stdout_str.rsplit_once("\n__MDV_HTTP_STATUS__:") else {
        let err_detail = stderr_str.trim();
        return Err(if err_detail.is_empty() {
            "Sin respuesta de red al conectar con ClickUp.".to_string()
        } else {
            format!("Error de red hacia ClickUp: {}", err_detail)
        });
    };

    let status_code = code_str.trim().parse::<u16>().unwrap_or(0);
    if status_code == 0 {
        let err_detail = stderr_str.trim();
        return Err(if err_detail.is_empty() {
            "No se pudo conectar a api.clickup.com.".to_string()
        } else {
            format!("No se pudo conectar a ClickUp: {}", err_detail)
        });
    }

    let parsed = serde_json::from_str::<serde_json::Value>(raw_body.trim())
        .unwrap_or_else(|_| serde_json::json!({ "raw": raw_body.trim() }));

    Ok((status_code, parsed))
}

fn extract_clickup_error(status: u16, val: &serde_json::Value) -> String {
    if let Some(err) = val.get("err").and_then(|v| v.as_str()) {
        return format!("ClickUp ({}): {}", status, err);
    }
    if let Some(err) = val.get("error").and_then(|v| v.as_str()) {
        return format!("ClickUp ({}): {}", status, err);
    }
    format!("Error de API ClickUp (HTTP {})", status)
}

async fn ensure_user_and_teams(
    state: &AppState,
    token: &str,
    force_refresh: bool,
) -> Result<(Option<ClickUpUserSummary>, Vec<ClickUpTeamSummary>), (StatusCode, String)> {
    if !force_refresh {
        let cached_u = state
            .clickup
            .cached_user
            .lock()
            .ok()
            .and_then(|g| g.clone());
        let cached_t = state
            .clickup
            .cached_teams
            .lock()
            .ok()
            .map(|g| g.clone())
            .unwrap_or_default();
        if cached_u.is_some() && !cached_t.is_empty() {
            return Ok((cached_u, cached_t));
        }
    }

    let (u_res, t_res) = tokio::join!(
        clickup_api_request("GET", "https://api.clickup.com/api/v2/user", token),
        clickup_api_request("GET", "https://api.clickup.com/api/v2/team", token)
    );

    let (u_status, u_json) = u_res.map_err(|e| (StatusCode::BAD_GATEWAY, e))?;
    if u_status == 401 {
        return Err((
            StatusCode::UNAUTHORIZED,
            "Personal API Token inválido o revocado en ClickUp.".to_string(),
        ));
    }
    if u_status >= 400 {
        return Err((
            StatusCode::BAD_GATEWAY,
            extract_clickup_error(u_status, &u_json),
        ));
    }

    let (t_status, t_json) = t_res.map_err(|e| (StatusCode::BAD_GATEWAY, e))?;
    if t_status == 401 {
        return Err((
            StatusCode::UNAUTHORIZED,
            "Personal API Token inválido o revocado en ClickUp.".to_string(),
        ));
    }
    if t_status >= 400 {
        return Err((
            StatusCode::BAD_GATEWAY,
            extract_clickup_error(t_status, &t_json),
        ));
    }

    let user = u_json.get("user").and_then(|u| {
        let id = u.get("id")?.as_i64()?;
        let username = u
            .get("username")
            .and_then(|v| v.as_str())
            .or_else(|| u.get("email").and_then(|v| v.as_str()))
            .unwrap_or("Usuario")
            .to_string();
        let email = u.get("email").and_then(|v| v.as_str()).map(|s| s.to_string());
        let initials = u
            .get("initials")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let color = u
            .get("color")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        Some(ClickUpUserSummary {
            id,
            username,
            email,
            initials,
            color,
        })
    });

    let teams: Vec<ClickUpTeamSummary> = t_json
        .get("teams")
        .and_then(|arr| arr.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| {
                    let id = match t.get("id")? {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Number(n) => n.to_string(),
                        _ => return None,
                    };
                    let name = t
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Workspace")
                        .to_string();
                    let color = t
                        .get("color")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    Some(ClickUpTeamSummary { id, name, color })
                })
                .collect()
        })
        .unwrap_or_default();

    if let Ok(mut gu) = state.clickup.cached_user.lock() {
        *gu = user.clone();
    }
    if let Ok(mut gt) = state.clickup.cached_teams.lock() {
        *gt = teams.clone();
    }

    if let Some(ref u) = user {
        let uid = u.id;
        let uname = u.username.clone();
        let first_team = teams.first().map(|t| t.id.clone());
        update_user_config(|cfg| {
            cfg.clickup.user_id = Some(uid);
            cfg.clickup.user_name = Some(uname);
            if cfg.clickup.selected_team_id.is_none() {
                cfg.clickup.selected_team_id = first_team;
            }
        });
    }

    Ok((user, teams))
}

pub async fn api_clickup_status_handler(State(state): State<Arc<AppState>>) -> Response {
    let cu = load_user_config().clickup;
    let has_saved_token = cu
        .api_token
        .as_deref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let Some(token) = cu.effective_token() else {
        return Json(serde_json::json!({
            "connected": false,
            "hasSavedToken": false,
            "selectedTeamId": cu.selected_team_id,
            "user": null,
            "teams": []
        }))
        .into_response();
    };

    match ensure_user_and_teams(&state, &token, false).await {
        Ok((user, teams)) => {
            let latest_cu = load_user_config().clickup;
            let selected_team_id = latest_cu
                .selected_team_id
                .or_else(|| teams.first().map(|t| t.id.clone()));
            Json(serde_json::json!({
                "connected": true,
                "hasSavedToken": has_saved_token,
                "selectedTeamId": selected_team_id,
                "user": user,
                "teams": teams
            }))
            .into_response()
        }
        Err((StatusCode::UNAUTHORIZED, msg)) => Json(serde_json::json!({
            "connected": false,
            "unauthorized": true,
            "error": msg,
            "hasSavedToken": has_saved_token,
            "selectedTeamId": cu.selected_team_id,
            "user": null,
            "teams": []
        }))
        .into_response(),
        Err((_, msg)) => Json(serde_json::json!({
            "connected": true,
            "error": msg,
            "hasSavedToken": has_saved_token,
            "selectedTeamId": cu.selected_team_id,
            "user": cu.user_id.map(|id| serde_json::json!({
                "id": id,
                "username": cu.user_name.unwrap_or_else(|| "Usuario".to_string())
            })),
            "teams": []
        }))
        .into_response(),
    }
}

pub async fn api_clickup_connect_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ConnectClickUpPayload>,
) -> Response {
    let raw_token = payload
        .api_token
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && !s.chars().all(|c| c == '•' || c == '*'))
        .map(|s| s.to_string())
        .or_else(|| load_user_config().clickup.effective_token());

    let Some(token) = raw_token else {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "Pega tu Personal API Token (pk_...) de ClickUp."
            })),
        )
            .into_response();
    };

    match ensure_user_and_teams(&state, &token, true).await {
        Ok((user, teams)) => {
            let selected_team_id = load_user_config()
                .clickup
                .selected_team_id
                .or_else(|| teams.first().map(|t| t.id.clone()));
            let sel_clone = selected_team_id.clone();
            update_user_config(|cfg| {
                cfg.clickup.api_token = Some(token.clone());
                if cfg.clickup.selected_team_id.is_none() {
                    cfg.clickup.selected_team_id = sel_clone;
                }
            });
            Json(serde_json::json!({
                "ok": true,
                "connected": true,
                "hasSavedToken": true,
                "selectedTeamId": selected_team_id,
                "user": user,
                "teams": teams,
            }))
            .into_response()
        }
        Err((code, msg)) => (
            code,
            Json(serde_json::json!({
                "error": msg,
                "unauthorized": code == StatusCode::UNAUTHORIZED
            })),
        )
            .into_response(),
    }
}

pub async fn api_clickup_disconnect_handler(State(state): State<Arc<AppState>>) -> Response {
    if let Ok(mut gu) = state.clickup.cached_user.lock() {
        *gu = None;
    }
    if let Ok(mut gt) = state.clickup.cached_teams.lock() {
        gt.clear();
    }
    if let Ok(mut gs) = state.clickup.cached_pipeline_statuses.lock() {
        gs.clear();
    }
    update_user_config(|cfg| {
        cfg.clickup.api_token = None;
        cfg.clickup.user_id = None;
        cfg.clickup.user_name = None;
    });
    Json(serde_json::json!({ "ok": true })).into_response()
}

fn normalize_status_core(raw: &str) -> String {
    let lower = raw.trim().to_lowercase();
    let stripped = lower
        .trim_start_matches(|c: char| c.is_ascii_digit())
        .trim_start_matches(['.', ')', '-', ':', ' ']);
    let mut out = String::with_capacity(stripped.len());
    let mut prev_space = false;
    for ch in stripped.chars() {
        if ch == '_' || ch == '-' || ch.is_whitespace() {
            if !prev_space && !out.is_empty() {
                out.push(' ');
                prev_space = true;
            }
        } else {
            out.push(ch);
            prev_space = false;
        }
    }
    out.trim().to_string()
}

fn is_active_pipeline_status(raw: &str) -> bool {
    let core = normalize_status_core(raw);
    core == "staging"
        || core.contains("staging")
        || core == "code review"
        || core.contains("review")
        || core == "in progress"
        || core.contains("progress")
}

async fn discover_pipeline_statuses(
    state: &AppState,
    token: &str,
    team_id: &str,
    force_refresh: bool,
) -> Vec<String> {
    if !force_refresh {
        if let Ok(guard) = state.clickup.cached_pipeline_statuses.lock() {
            if let Some(existing) = guard.get(team_id) {
                if !existing.is_empty() {
                    return existing.clone();
                }
            }
        }
    }

    let mut statuses: Vec<String> = Vec::new();
    let mut push_unique = |s: &str| {
        let trimmed = s.trim();
        if !trimmed.is_empty() && !statuses.iter().any(|x| x == trimmed) {
            statuses.push(trimmed.to_string());
        }
    };

    let spaces_url = format!(
        "https://api.clickup.com/api/v2/team/{}/space?archived=false",
        urlencoding::encode(team_id)
    );
    if let Ok((code, json)) = clickup_api_request("GET", &spaces_url, token).await {
        if code < 400 {
            if let Some(spaces) = json.get("spaces").and_then(|v| v.as_array()) {
                for sp in spaces {
                    if let Some(st_arr) = sp.get("statuses").and_then(|v| v.as_array()) {
                        for st in st_arr {
                            let st_type = st
                                .get("type")
                                .and_then(|v| v.as_str())
                                .unwrap_or("custom");
                            if st_type == "done" || st_type == "closed" {
                                continue;
                            }
                            if let Some(name) = st.get("status").and_then(|v| v.as_str()) {
                                if is_active_pipeline_status(name) {
                                    push_unique(name);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Include common Fintree / ClickUp naming variants in case a Folder/List overrides Space statuses
    for fallback in [
        "5. staging",
        "staging",
        "4. code review",
        "4. code-review",
        "code review",
        "code-review",
        "3. in progress",
        "3. in-progress",
        "in progress",
        "in-progress",
    ] {
        push_unique(fallback);
    }

    if let Ok(mut guard) = state.clickup.cached_pipeline_statuses.lock() {
        guard.insert(team_id.to_string(), statuses.clone());
    }
    statuses
}

fn extract_task_id_candidate(raw: &str) -> Option<String> {
    let mut s = raw.trim();
    if s.is_empty() {
        return None;
    }
    if let Some(idx) = s.find("clickup.com/t/") {
        s = &s[idx + "clickup.com/t/".len()..];
        s = s.split(['?', '#']).next().unwrap_or(s);
        s = s.trim_matches('/');
        if let Some(last_seg) = s.rsplit('/').next() {
            s = last_seg;
        }
    }
    s = s.trim().trim_start_matches('#').trim();
    if s.len() < 3 || s.len() > 64 {
        return None;
    }
    if !s
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return None;
    }
    Some(s.to_string())
}

pub async fn api_clickup_task_lookup_handler(
    State(state): State<Arc<AppState>>,
    Query(q): Query<TaskLookupQuery>,
) -> Response {
    let cu = load_user_config().clickup;
    let Some(token) = cu.effective_token() else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "error": "No estás conectado a ClickUp.",
                "unauthorized": true
            })),
        )
            .into_response();
    };

    let Some(candidate) = extract_task_id_candidate(&q.q) else {
        return Json(serde_json::json!({
            "found": false,
            "task": null
        }))
        .into_response();
    };

    let mut team_id = q
        .team_id
        .filter(|s| !s.trim().is_empty())
        .or(cu.selected_team_id);

    if team_id.is_none() {
        if let Ok((_, teams)) = ensure_user_and_teams(&state, &token, false).await {
            team_id = teams.first().map(|t| t.id.clone());
        }
    }

    let upper = candidate.to_ascii_uppercase();
    let mut urls_to_try = Vec::new();
    if candidate.contains('-') {
        if let Some(ref tid) = team_id {
            urls_to_try.push(format!(
                "https://api.clickup.com/api/v2/task/{}?custom_task_ids=true&team_id={}",
                urlencoding::encode(&upper),
                urlencoding::encode(tid)
            ));
            if upper != candidate {
                urls_to_try.push(format!(
                    "https://api.clickup.com/api/v2/task/{}?custom_task_ids=true&team_id={}",
                    urlencoding::encode(&candidate),
                    urlencoding::encode(tid)
                ));
            }
        }
        urls_to_try.push(format!(
            "https://api.clickup.com/api/v2/task/{}",
            urlencoding::encode(&candidate)
        ));
    } else {
        urls_to_try.push(format!(
            "https://api.clickup.com/api/v2/task/{}",
            urlencoding::encode(&candidate)
        ));
        if let Some(ref tid) = team_id {
            urls_to_try.push(format!(
                "https://api.clickup.com/api/v2/task/{}?custom_task_ids=true&team_id={}",
                urlencoding::encode(&upper),
                urlencoding::encode(tid)
            ));
        }
    }

    for url in urls_to_try {
        match clickup_api_request("GET", &url, &token).await {
            Ok((401, _)) => {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({
                        "error": "Personal API Token inválido o revocado en ClickUp.",
                        "unauthorized": true
                    })),
                )
                    .into_response();
            }
            Ok((status, json)) if status < 400 => {
                if let Some(task) = parse_task_item(&json) {
                    return Json(serde_json::json!({
                        "found": true,
                        "task": task
                    }))
                    .into_response();
                }
            }
            _ => continue,
        }
    }

    Json(serde_json::json!({
        "found": false,
        "task": null
    }))
    .into_response()
}

fn initials_from_name(name: &str) -> String {
    let parts: Vec<&str> = name.split_whitespace().take(2).collect();
    if parts.is_empty() {
        return "?".to_string();
    }
    parts
        .iter()
        .filter_map(|p| p.chars().next())
        .collect::<String>()
        .to_uppercase()
}

const AREA_SIETEA: &str = "Producto (Sietea y Sieteav2)";
const AREA_DASHBOARD: &str = "Producto (Dashboard y móvil)";
const AREA_INTERNO: &str = "Producto Interno";
const AREA_INFRA: &str = "Infraestructura y seguridad";
const AREA_AUTO_OP: &str = "Automatizaciones Operativas";

fn push_area_unique(areas: &mut Vec<String>, area: &str) {
    let trimmed = area.trim();
    if !trimmed.is_empty() && !areas.iter().any(|a| a.eq_ignore_ascii_case(trimmed)) {
        areas.push(trimmed.to_string());
    }
}

fn canonicalize_area_label(raw: &str) -> Option<&'static str> {
    let low = raw.trim().to_lowercase();
    if low.is_empty() {
        return None;
    }
    if low.contains("sietea") {
        Some(AREA_SIETEA)
    } else if low.contains("dashboard") || low.contains("móvil") || low.contains("movil") || low.contains("experiencia digital") {
        Some(AREA_DASHBOARD)
    } else if low.contains("producto interno") {
        Some(AREA_INTERNO)
    } else if low.contains("infraestructura") || low.contains("seguridad") || low.contains("ciberseguridad") {
        Some(AREA_INFRA)
    } else if low.contains("automatizaciones") || low.contains("operativa") {
        Some(AREA_AUTO_OP)
    } else {
        None
    }
}

fn resolve_dropdown_selected_name(cf: &serde_json::Value) -> Option<String> {
    let val = cf.get("value")?;
    if val.is_null() {
        return None;
    }
    if let Some(obj_name) = val
        .get("name")
        .or_else(|| val.get("label"))
        .and_then(|v| v.as_str())
    {
        return Some(obj_name.to_string());
    }
    let options = cf
        .get("type_config")
        .and_then(|tc| tc.get("options"))
        .and_then(|o| o.as_array());
    if let Some(idx) = val.as_i64() {
        if let Some(opts) = options {
            for opt in opts {
                let ord = opt.get("orderindex").and_then(|v| v.as_i64());
                if ord == Some(idx) {
                    if let Some(n) = opt
                        .get("name")
                        .or_else(|| opt.get("label"))
                        .and_then(|v| v.as_str())
                    {
                        return Some(n.to_string());
                    }
                }
            }
            if idx >= 0 && (idx as usize) < opts.len() {
                if let Some(n) = opts[idx as usize]
                    .get("name")
                    .or_else(|| opts[idx as usize].get("label"))
                    .and_then(|v| v.as_str())
                {
                    return Some(n.to_string());
                }
            }
        }
    }
    if let Some(val_str) = val.as_str() {
        if let Some(opts) = options {
            for opt in opts {
                let oid = opt.get("id").and_then(|v| v.as_str());
                let ord_str = opt
                    .get("orderindex")
                    .and_then(|v| v.as_i64())
                    .map(|n| n.to_string());
                if oid == Some(val_str) || ord_str.as_deref() == Some(val_str) {
                    if let Some(n) = opt
                        .get("name")
                        .or_else(|| opt.get("label"))
                        .and_then(|v| v.as_str())
                    {
                        return Some(n.to_string());
                    }
                }
            }
        }
        return Some(val_str.to_string());
    }
    None
}

fn resolve_labels_selected_names(cf: &serde_json::Value) -> Vec<String> {
    let mut out = Vec::new();
    let Some(arr) = cf.get("value").and_then(|v| v.as_array()) else {
        return out;
    };
    let options = cf
        .get("type_config")
        .and_then(|tc| tc.get("options"))
        .and_then(|o| o.as_array());
    for item in arr {
        if let Some(lbl) = item
            .get("label")
            .or_else(|| item.get("name"))
            .and_then(|v| v.as_str())
        {
            out.push(lbl.to_string());
            continue;
        }
        if let Some(id_str) = item.as_str() {
            if let Some(opts) = options {
                if let Some(found) = opts.iter().find(|o| o.get("id").and_then(|v| v.as_str()) == Some(id_str)) {
                    if let Some(lbl) = found
                        .get("label")
                        .or_else(|| found.get("name"))
                        .and_then(|v| v.as_str())
                    {
                        out.push(lbl.to_string());
                        continue;
                    }
                }
            }
        }
    }
    out
}

fn extract_task_areas(
    t: &serde_json::Value,
    name: &str,
    list_name: Option<&str>,
    folder_name: Option<&str>,
) -> Vec<String> {
    let mut explicit_areas: Vec<String> = Vec::new();
    let mut project_labels: Vec<String> = Vec::new();
    let mut category_labels: Vec<String> = Vec::new();
    let mut tipo_name: Option<String> = None;

    if let Some(cfs) = t.get("custom_fields").and_then(|v| v.as_array()) {
        for cf in cfs {
            let cf_name = cf
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_lowercase();
            let cf_type = cf.get("type").and_then(|v| v.as_str()).unwrap_or("");

            if cf_name == "área" || cf_name == "area" {
                if let Some(sel) = resolve_dropdown_selected_name(cf) {
                    if let Some(canon) = canonicalize_area_label(&sel) {
                        push_area_unique(&mut explicit_areas, canon);
                    } else if sel.to_lowercase().contains("todo el equipo") {
                        for all_a in [AREA_SIETEA, AREA_DASHBOARD, AREA_INTERNO, AREA_INFRA, AREA_AUTO_OP] {
                            push_area_unique(&mut explicit_areas, all_a);
                        }
                    } else {
                        push_area_unique(&mut explicit_areas, &sel);
                    }
                }
            } else if cf_name == "equipos" || cf_name == "equipo" {
                for lbl in resolve_labels_selected_names(cf) {
                    if let Some(canon) = canonicalize_area_label(&lbl) {
                        push_area_unique(&mut explicit_areas, canon);
                    } else {
                        push_area_unique(&mut explicit_areas, &lbl);
                    }
                }
            } else if cf_name == "proyecto" || cf_name == "proyectos" {
                if cf_type == "labels" {
                    project_labels.extend(resolve_labels_selected_names(cf));
                } else if let Some(sel) = resolve_dropdown_selected_name(cf) {
                    project_labels.push(sel);
                }
            } else if cf_name == "categorias" || cf_name == "categorías" || cf_name == "categoria" {
                if cf_type == "labels" {
                    category_labels.extend(resolve_labels_selected_names(cf));
                }
            } else if cf_name == "tipo" {
                tipo_name = resolve_dropdown_selected_name(cf);
            }
        }
    }

    if !explicit_areas.is_empty() {
        return explicit_areas;
    }

    let mut derived: Vec<String> = Vec::new();

    // Map Fintree `Proyecto` labels to official Fintree Areas
    for proj in &project_labels {
        let p = proj.trim().to_lowercase();
        match p.as_str() {
            "sietea" | "sieteav2" | "sieta" | "template" => {
                push_area_unique(&mut derived, AREA_SIETEA);
            }
            "dashboard" | "app móvil" | "app movil" | "web" => {
                push_area_unique(&mut derived, AREA_DASHBOARD);
            }
            "client-manager"
            | "client manager"
            | "admin-fintree"
            | "scrapper-manager"
            | "scrapper manager"
            | "emailpush notifier"
            | "dev-workspace"
            | "openclaw" => {
                push_area_unique(&mut derived, AREA_INTERNO);
            }
            "ansible"
            | "ansible y servidores"
            | "keycloak"
            | "sftp"
            | "gatekeeper"
            | "sftp-infra"
            | "semaphore" => {
                push_area_unique(&mut derived, AREA_INFRA);
            }
            "refinitiv" => {
                push_area_unique(&mut derived, AREA_AUTO_OP);
            }
            _ => {}
        }
    }

    // List / Folder / Categorias / Tipo signals
    let list_low = list_name.unwrap_or("").to_lowercase();
    let folder_low = folder_name.unwrap_or("").to_lowercase();
    if list_low.contains("ciberseguridad") || folder_low.contains("infraestructura") {
        push_area_unique(&mut derived, AREA_INFRA);
    } else if list_low.contains("backoffice") {
        push_area_unique(&mut derived, AREA_AUTO_OP);
    } else if let Some(canon) = canonicalize_area_label(&folder_low) {
        push_area_unique(&mut derived, canon);
    }

    if let Some(ref tp) = tipo_name {
        let tl = tp.to_lowercase();
        if tl.contains("ciberseguridad") || tl.contains("vulnerabilidad") {
            push_area_unique(&mut derived, AREA_INFRA);
        } else if tl == "app" {
            push_area_unique(&mut derived, AREA_DASHBOARD);
        }
    }

    for cat in &category_labels {
        let cl = cat.to_lowercase();
        if cl.contains("infraestructura") || cl.contains("seguridad") || cl.contains("gatekeeper") {
            push_area_unique(&mut derived, AREA_INFRA);
        } else if cl.contains("scraper") || cl.contains("automatización") || cl.contains("automatizacion") || cl.contains("operativo") {
            push_area_unique(&mut derived, AREA_AUTO_OP);
        } else if cl.contains("dashboard") || cl.contains("app móvil") || cl.contains("app movil") {
            push_area_unique(&mut derived, AREA_DASHBOARD);
        }
    }

    // Smart title fallback for CLI-created tasks with empty custom_fields
    if derived.is_empty() {
        let title_low = name.to_lowercase();
        if title_low.contains("client-manager")
            || title_low.contains("client manager")
            || title_low.contains("scrapper-manager")
            || title_low.contains("scrapper manager")
            || title_low.contains("admin-fintree")
            || title_low.contains("lector de documentos")
            || title_low.contains("pdf extractor")
            || title_low.contains("worktree")
            || title_low.contains("close-task")
            || title_low.starts_with("skill ")
            || title_low.contains("dev-workspace")
        {
            push_area_unique(&mut derived, AREA_INTERNO);
        }
        if title_low.contains("ansible")
            || title_low.contains("psqlbackup")
            || title_low.contains("backup")
            || title_low.contains("nautilus")
            || title_low.contains("arca")
            || title_low.contains("docker")
            || title_low.contains("sftp")
            || title_low.contains("keycloak")
            || title_low.contains("gatekeeper")
            || title_low.contains("dependabot")
            || title_low.contains("ubuntu")
            || title_low.contains("db.py")
            || title_low.contains("monitoreo")
            || title_low.contains("servidor")
        {
            push_area_unique(&mut derived, AREA_INFRA);
        }
        if title_low.contains("cartola")
            || title_low.contains("importación")
            || title_low.contains("importacion")
            || title_low.contains("nemos ")
            || title_low.contains("scraper")
            || title_low.contains("refinitiv")
            || title_low.contains("cuadratura")
        {
            push_area_unique(&mut derived, AREA_AUTO_OP);
        }
        if title_low.contains("dashboard") || title_low.contains("app móvil") || title_low.contains("app movil") {
            push_area_unique(&mut derived, AREA_DASHBOARD);
        }
        if derived.is_empty()
            && (title_low.contains("sietea")
                || title_low.contains("propuesta")
                || title_low.contains("statement")
                || title_low.contains("rentabilidad")
                || title_low.contains("custodio")
                || title_low.contains("template")
                || title_low.contains("redis")
                || title_low.contains("reporte"))
        {
            push_area_unique(&mut derived, AREA_SIETEA);
        }
    }

    derived
}

fn parse_task_item(t: &serde_json::Value) -> Option<ClickUpTaskSummary> {
    let id = t.get("id")?.as_str()?.to_string();
    let custom_id = t
        .get("custom_id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let name = t
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("(Sin título)")
        .to_string();

    let status_obj = t.get("status");
    let status = status_obj
        .and_then(|s| s.get("status"))
        .and_then(|v| v.as_str())
        .unwrap_or("open")
        .to_string();
    let status_type = status_obj
        .and_then(|s| s.get("type"))
        .and_then(|v| v.as_str())
        .unwrap_or("custom")
        .to_string();
    let status_color = status_obj
        .and_then(|s| s.get("color"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("#64748b")
        .to_string();

    let priority_obj = t.get("priority").filter(|v| !v.is_null());
    let priority = priority_obj
        .and_then(|p| p.get("priority"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let priority_color = priority_obj
        .and_then(|p| p.get("color"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let list_name = t
        .get("list")
        .and_then(|l| l.get("name"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let folder_name = t
        .get("folder")
        .and_then(|f| {
            let hidden = f.get("hidden").and_then(|h| h.as_bool()).unwrap_or(false);
            if hidden {
                None
            } else {
                f.get("name").and_then(|v| v.as_str())
            }
        })
        .filter(|s| !s.is_empty() && *s != "hidden")
        .map(|s| s.to_string());

    let assignees = t
        .get("assignees")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let uid = a.get("id")?.as_i64()?;
                    let uname = a
                        .get("username")
                        .and_then(|v| v.as_str())
                        .or_else(|| a.get("email").and_then(|v| v.as_str()))
                        .unwrap_or("User")
                        .to_string();
                    let initials = a
                        .get("initials")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| initials_from_name(&uname));
                    let color = a
                        .get("color")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    Some(ClickUpAssigneeSummary {
                        id: uid,
                        name: uname,
                        initials,
                        color,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let url = t
        .get("url")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("https://app.clickup.com/t/{}", id));

    let date_updated = t
        .get("date_updated")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let due_date = t
        .get("due_date")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let areas = extract_task_areas(t, &name, list_name.as_deref(), folder_name.as_deref());

    Some(ClickUpTaskSummary {
        id,
        custom_id,
        name,
        status,
        status_type,
        status_color,
        priority,
        priority_color,
        list_name,
        folder_name,
        areas,
        assignees,
        url,
        date_updated,
        due_date,
    })
}

pub async fn api_clickup_tasks_handler(
    State(state): State<Arc<AppState>>,
    Query(q): Query<TasksQuery>,
) -> Response {
    let cu = load_user_config().clickup;
    let Some(token) = cu.effective_token() else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "error": "No estás conectado a ClickUp.",
                "unauthorized": true
            })),
        )
            .into_response();
    };

    let (user, teams) = match ensure_user_and_teams(&state, &token, q.refresh_meta.unwrap_or(false)).await {
        Ok(pair) => pair,
        Err((code, msg)) => {
            return (
                code,
                Json(serde_json::json!({
                    "error": msg,
                    "unauthorized": code == StatusCode::UNAUTHORIZED
                })),
            )
                .into_response();
        }
    };

    if teams.is_empty() {
        return Json(serde_json::json!({
            "teamId": null,
            "teamName": null,
            "user": user,
            "teams": [],
            "page": 0,
            "hasMore": false,
            "tasks": []
        }))
        .into_response();
    }

    let requested_team = q
        .team_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or(cu.selected_team_id);

    let chosen_team = requested_team
        .as_deref()
        .and_then(|tid| teams.iter().find(|t| t.id == tid))
        .unwrap_or(&teams[0])
        .clone();

    update_user_config(|cfg| {
        cfg.clickup.selected_team_id = Some(chosen_team.id.clone());
    });

    let pipeline_statuses =
        discover_pipeline_statuses(&state, &token, &chosen_team.id, q.refresh_meta.unwrap_or(false))
            .await;
    let status_query_suffix: String = pipeline_statuses
        .iter()
        .map(|st| format!("&statuses%5B%5D={}", urlencoding::encode(st)))
        .collect();

    let explicit_page = q.page;
    let start_page = explicit_page.unwrap_or(0);
    let max_pages_to_fetch: u32 = if explicit_page.is_some() { 1 } else { 5 };

    let mut all_tasks: Vec<ClickUpTaskSummary> = Vec::new();
    let mut cur_page = start_page;
    let mut has_more = false;

    for i in 0..max_pages_to_fetch {
        cur_page = start_page + i;
        let mut url = format!(
            "https://api.clickup.com/api/v2/team/{}/task?subtasks=true&include_closed=false&order_by=updated&reverse=true&page={}{}",
            urlencoding::encode(&chosen_team.id),
            cur_page,
            status_query_suffix
        );

        if q.only_mine.unwrap_or(false) {
            if let Some(ref u) = user {
                url.push_str(&format!("&assignees%5B%5D={}", u.id));
            }
        }

        match clickup_api_request("GET", &url, &token).await {
            Ok((status, _json)) if status == 401 => {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({
                        "error": "Personal API Token inválido o revocado en ClickUp.",
                        "unauthorized": true
                    })),
                )
                    .into_response();
            }
            Ok((status, json)) if status >= 400 => {
                return (
                    StatusCode::BAD_GATEWAY,
                    Json(serde_json::json!({
                        "error": extract_clickup_error(status, &json)
                    })),
                )
                    .into_response();
            }
            Ok((_, json)) => {
                let batch: Vec<ClickUpTaskSummary> = json
                    .get("tasks")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(parse_task_item).collect())
                    .unwrap_or_default();
                let batch_len = batch.len();
                let last_page = json
                    .get("last_page")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(batch_len < 100);
                all_tasks.extend(batch);
                if last_page || batch_len == 0 {
                    has_more = false;
                    break;
                } else {
                    has_more = true;
                }
            }
            Err(err) => {
                return (
                    StatusCode::BAD_GATEWAY,
                    Json(serde_json::json!({ "error": err })),
                )
                    .into_response();
            }
        }
    }

    Json(serde_json::json!({
        "teamId": chosen_team.id,
        "teamName": chosen_team.name,
        "user": user,
        "teams": teams,
        "page": cur_page,
        "hasMore": has_more,
        "tasks": all_tasks,
    }))
    .into_response()
}
