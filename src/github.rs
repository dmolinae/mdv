use axum::{
    extract::State,
    response::{IntoResponse, Json, Response},
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};
use tokio::io::AsyncWriteExt;

use crate::AppState;

const INDEX_CACHE_TTL: Duration = Duration::from_secs(25);
const SCOPE_CACHE_TTL: Duration = Duration::from_secs(600);

#[derive(Clone, Debug)]
struct GitHubScope {
    allowed_owners: HashSet<String>,
    qualifier_str: String,
    fetched_at: Instant,
}

#[derive(Clone, Debug)]
struct CachedPrIndex {
    /// Maps uppercase key (both `DEV-4789` custom codes AND `86E42FRJP` ClickUp task IDs) -> PRs
    by_key: HashMap<String, Vec<GitHubPrSummary>>,
    fetched_at: Instant,
}

#[derive(Default)]
pub struct GitHubRuntime {
    cached_token: Mutex<Option<String>>,
    cached_scope: Mutex<Option<GitHubScope>>,
    cached_index: Mutex<Option<CachedPrIndex>>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskPrQueryItem {
    pub id: String,
    pub code: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskPrBatchRequest {
    #[serde(default)]
    pub tasks: Vec<TaskPrQueryItem>,
    #[serde(default)]
    pub refresh: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPrSummary {
    pub number: u64,
    pub title: String,
    pub url: String,
    pub repo: String,
    pub state: String,
    pub is_draft: bool,
    pub review_decision: Option<String>,
    pub mergeable: Option<String>,
    pub ci_state: Option<String>,
    pub changed_files: u64,
    pub additions: u64,
    pub deletions: u64,
    pub status_key: String,
    pub status_label: String,
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

fn find_gh_bin() -> String {
    #[cfg(windows)]
    {
        for env_key in ["ProgramFiles", "LOCALAPPDATA"] {
            if let Ok(base) = std::env::var(env_key) {
                let p = std::path::PathBuf::from(&base)
                    .join("GitHub CLI")
                    .join("gh.exe");
                if p.is_file() {
                    return p.to_string_lossy().to_string();
                }
                let p2 = std::path::PathBuf::from(&base)
                    .join("Programs")
                    .join("GitHub CLI")
                    .join("gh.exe");
                if p2.is_file() {
                    return p2.to_string_lossy().to_string();
                }
            }
        }
        "gh.exe".to_string()
    }
    #[cfg(not(windows))]
    {
        for candidate in [
            "/usr/bin/gh",
            "/usr/local/bin/gh",
            "/home/linuxbrew/.linuxbrew/bin/gh",
        ] {
            if Path::new(candidate).is_file() {
                return candidate.to_string();
            }
        }
        "gh".to_string()
    }
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

fn read_token_from_mcp_configs() -> Option<String> {
    let home = dirs::home_dir()?;
    let candidates = [
        home.join(".gemini").join("config").join("mcp_config.json"),
        home.join(".claude.json"),
        home.join(".cursor").join("mcp.json"),
    ];
    for path in candidates {
        let Ok(raw) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) else {
            continue;
        };
        if let Some(env_obj) = val
            .get("mcpServers")
            .and_then(|m| m.get("github"))
            .and_then(|g| g.get("env"))
        {
            for key in ["GITHUB_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN", "GH_TOKEN"] {
                if let Some(tok) = env_obj
                    .get(key)
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                {
                    return Some(tok.to_string());
                }
            }
        }
    }
    None
}

fn read_token_from_gh_hosts_yml() -> Option<String> {
    let mut paths = Vec::new();
    if let Some(cfg) = dirs::config_dir() {
        paths.push(cfg.join("gh").join("hosts.yml"));
    }
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".config").join("gh").join("hosts.yml"));
    }
    for p in paths {
        let Ok(raw) = fs::read_to_string(&p) else {
            continue;
        };
        for line in raw.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("oauth_token:") {
                let tok = rest.trim().trim_matches(['"', '\'']).trim();
                if !tok.is_empty() {
                    return Some(tok.to_string());
                }
            }
        }
    }
    None
}

async fn resolve_github_token(state: &AppState) -> Option<String> {
    if let Ok(guard) = state.github.cached_token.lock() {
        if let Some(ref tok) = *guard {
            return Some(tok.clone());
        }
    }

    for env_key in ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN"] {
        if let Ok(val) = std::env::var(env_key) {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                let owned = trimmed.to_string();
                if let Ok(mut g) = state.github.cached_token.lock() {
                    *g = Some(owned.clone());
                }
                return Some(owned);
            }
        }
    }

    // Try `gh auth token`
    {
        let mut cmd = tokio::process::Command::new(find_gh_bin());
        cmd.args(["auth", "token"])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());
        #[cfg(windows)]
        {
            #[allow(unused_imports)]
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        if let Ok(Ok(out)) = tokio::time::timeout(Duration::from_secs(3), cmd.output()).await {
            if out.status.success() {
                let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !s.is_empty() {
                    if let Ok(mut g) = state.github.cached_token.lock() {
                        *g = Some(s.clone());
                    }
                    return Some(s);
                }
            }
        }
    }

    if let Some(tok) = read_token_from_gh_hosts_yml().or_else(read_token_from_mcp_configs) {
        if let Ok(mut g) = state.github.cached_token.lock() {
            *g = Some(tok.clone());
        }
        return Some(tok);
    }

    None
}

async fn github_graphql_request(
    state: &AppState,
    query: &str,
) -> Result<serde_json::Value, String> {
    let token = resolve_github_token(state)
        .await
        .ok_or_else(|| "Sin token de GitHub disponible".to_string())?;

    let body_json = serde_json::json!({ "query": query }).to_string();

    let mut cfg = String::new();
    cfg.push_str("url = \"https://api.github.com/graphql\"\n");
    cfg.push_str("request = \"POST\"\n");
    cfg.push_str("header = \"Accept: application/vnd.github+json\"\n");
    cfg.push_str("header = \"Content-Type: application/json\"\n");
    cfg.push_str("header = \"User-Agent: mdv-workspace\"\n");
    cfg.push_str(&format!(
        "header = \"Authorization: Bearer {}\"\n",
        escape_curl_cfg(&token)
    ));
    cfg.push_str(&format!("data = \"{}\"\n", escape_curl_cfg(&body_json)));

    let mut cmd = tokio::process::Command::new(find_curl_bin());
    cmd.args([
        "-sS",
        "-L",
        "--max-time",
        "20",
        "-w",
        "\n__MDV_GH_STATUS__:%{http_code}",
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
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("No se pudo ejecutar curl para GitHub: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(cfg.as_bytes())
            .await
            .map_err(|e| format!("Error enviando query GraphQL a curl: {}", e))?;
    }

    let out = child
        .wait_with_output()
        .await
        .map_err(|e| format!("Error esperando respuesta de GitHub: {}", e))?;

    let stdout_str = String::from_utf8_lossy(&out.stdout);
    let Some((raw_body, code_str)) = stdout_str.rsplit_once("\n__MDV_GH_STATUS__:") else {
        return Err("Sin respuesta HTTP de api.github.com".to_string());
    };

    let status_code = code_str.trim().parse::<u16>().unwrap_or(0);
    if status_code == 401 {
        if let Ok(mut g) = state.github.cached_token.lock() {
            *g = None;
        }
        return Err("Token de GitHub inválido o expirado (401)".to_string());
    }
    if status_code == 0 || status_code >= 400 {
        return Err(format!("GitHub GraphQL HTTP {}", status_code));
    }

    serde_json::from_str::<serde_json::Value>(raw_body.trim())
        .map_err(|e| format!("JSON inválido de GitHub GraphQL: {}", e))
}

fn parse_github_owner_from_git_config(raw: &str) -> Vec<String> {
    let mut owners = Vec::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if !trimmed.contains("github.com") {
            continue;
        }
        if let Some(after) = trimmed.split("github.com").nth(1) {
            let stripped = after.trim_start_matches([':', '/']);
            if let Some(owner) = stripped.split('/').next() {
                let clean = owner.trim().trim_end_matches(".git");
                if !clean.is_empty()
                    && clean
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
                {
                    owners.push(clean.to_string());
                }
            }
        }
    }
    owners
}

fn discover_local_git_owners(workspace_dir: &Path) -> Vec<String> {
    let mut found = Vec::new();
    let mut check_dir = |dir: &Path| {
        let git_cfg = dir.join(".git").join("config");
        if let Ok(raw) = fs::read_to_string(git_cfg) {
            for owner in parse_github_owner_from_git_config(&raw) {
                if !found.iter().any(|x: &String| x.eq_ignore_ascii_case(&owner)) {
                    found.push(owner);
                }
            }
        }
    };

    check_dir(workspace_dir);
    if let Some(parent) = workspace_dir.parent() {
        check_dir(parent);
    }
    // Also inspect immediate child repos when `mdv` is run on a multi-repo parent dir (e.g. ~/Fintree)
    if let Ok(entries) = fs::read_dir(workspace_dir) {
        for entry in entries.flatten().take(40) {
            if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                check_dir(&entry.path());
            }
        }
    }
    found
}

async fn resolve_github_scope(state: &AppState, force_refresh: bool) -> Result<GitHubScope, String> {
    if !force_refresh {
        if let Ok(guard) = state.github.cached_scope.lock() {
            if let Some(ref sc) = *guard {
                if sc.fetched_at.elapsed() < SCOPE_CACHE_TTL {
                    return Ok(sc.clone());
                }
            }
        }
    }

    // Uses ONLY `repo`-scoped fields (`viewer.repositories`) — never requires `read:org`!
    let viewer_q = r#"query {
  viewer {
    login
    repositories(first: 50, affiliations: [OWNER, ORGANIZATION_MEMBER, COLLABORATOR], orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes {
        owner { login __typename }
      }
    }
  }
}"#;

    let ws_dir = state.workspace_dir();
    let local_owners_fut = tokio::task::spawn_blocking(move || discover_local_git_owners(&ws_dir));
    let (gql_res, local_owners_res) = tokio::join!(github_graphql_request(state, viewer_q), local_owners_fut);

    let json = gql_res?;
    let viewer = json
        .get("data")
        .and_then(|d| d.get("viewer"))
        .ok_or_else(|| "GitHub GraphQL no devolvió viewer".to_string())?;

    let mut allowed_owners = HashSet::new();
    let mut qualifiers = Vec::new();

    if let Some(login) = viewer.get("login").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
        allowed_owners.insert(login.to_ascii_lowercase());
        qualifiers.push(format!("user:{}", login));
    }

    if let Some(nodes) = viewer
        .get("repositories")
        .and_then(|r| r.get("nodes"))
        .and_then(|n| n.as_array())
    {
        for repo_node in nodes {
            let Some(owner_obj) = repo_node.get("owner") else {
                continue;
            };
            let Some(ologin) = owner_obj
                .get("login")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
            else {
                continue;
            };
            if allowed_owners.insert(ologin.to_ascii_lowercase()) {
                let typename = owner_obj
                    .get("__typename")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Organization");
                if typename == "User" {
                    qualifiers.push(format!("user:{}", ologin));
                } else {
                    qualifiers.push(format!("org:{}", ologin));
                }
            }
        }
    }

    if let Ok(local_owners) = local_owners_res {
        for owner in local_owners {
            if allowed_owners.insert(owner.to_ascii_lowercase()) {
                qualifiers.push(format!("org:{}", owner));
            }
        }
    }

    let scope = GitHubScope {
        allowed_owners,
        qualifier_str: qualifiers.join(" "),
        fetched_at: Instant::now(),
    };

    if let Ok(mut guard) = state.github.cached_scope.lock() {
        *guard = Some(scope.clone());
    }
    Ok(scope)
}

fn escape_gql_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for ch in s.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            _ => out.push(ch),
        }
    }
    out
}

fn task_code_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\b([a-z]{2,10}-\d+)\b").unwrap())
}

fn clickup_url_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)clickup\.com/t/(?:[a-z0-9_-]+/)?([a-z0-9_-]{4,40})").unwrap())
}

/// Extracts all task identifiers (`DEV-4789`, `DOC-14`, and ClickUp task IDs `86E42FRJP`)
/// associated with a Pull Request, prioritizing branch name, title, and explicit ClickUp links
/// so incidental mentions of other task IDs in PR prose do not cross-link unrelated tasks.
fn extract_task_keys_from_pr(head_ref: &str, title: &str, body: &str) -> HashSet<String> {
    let mut keys = HashSet::new();
    let code_re = task_code_regex();
    let cu_re = clickup_url_regex();

    // 1. Branch name (e.g. `DEV-4791/pdf-configs` or `DOC-14-readme`) & PR title
    for cap in code_re.captures_iter(head_ref) {
        keys.insert(cap[1].to_ascii_uppercase());
    }
    for cap in code_re.captures_iter(title) {
        keys.insert(cap[1].to_ascii_uppercase());
    }

    // 2. Explicit ClickUp URLs and `ClickUp:` reference lines in PR body
    for cap in cu_re.captures_iter(body) {
        keys.insert(cap[1].to_ascii_uppercase());
    }
    for line in body.lines() {
        if line.to_ascii_lowercase().contains("clickup") {
            for cap in code_re.captures_iter(line) {
                keys.insert(cap[1].to_ascii_uppercase());
            }
        }
    }

    // 3. Fallback: free-form body codes ONLY if neither branch, title, nor ClickUp link had any key
    if keys.is_empty() {
        for cap in code_re.captures_iter(body) {
            keys.insert(cap[1].to_ascii_uppercase());
        }
    }

    keys
}

fn compute_pr_status(
    state: &str,
    is_draft: bool,
    review_decision: Option<&str>,
    mergeable: Option<&str>,
) -> (String, String) {
    match state {
        "MERGED" => ("merged".to_string(), "Mergeado".to_string()),
        "CLOSED" => ("closed".to_string(), "Cerrado".to_string()),
        _ => {
            if is_draft {
                ("draft".to_string(), "Draft".to_string())
            } else if mergeable == Some("CONFLICTING") {
                ("conflict".to_string(), "Conflicto".to_string())
            } else if review_decision == Some("CHANGES_REQUESTED") {
                ("changes".to_string(), "Cambios".to_string())
            } else if review_decision == Some("APPROVED") {
                ("approved".to_string(), "Aprobado".to_string())
            } else {
                ("open".to_string(), "PR Abierto".to_string())
            }
        }
    }
}

fn parse_pr_node(
    node: &serde_json::Value,
    allowed_owners: &HashSet<String>,
) -> Option<(HashSet<String>, GitHubPrSummary)> {
    let number = node.get("number")?.as_u64()?;
    let url = node.get("url")?.as_str()?.to_string();
    let title = node
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let body = node.get("body").and_then(|v| v.as_str()).unwrap_or("");
    let head_ref = node
        .get("headRefName")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let repo_obj = node.get("repository")?;
    let repo = repo_obj
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("repo")
        .to_string();
    let owner = repo_obj
        .get("owner")
        .and_then(|o| o.get("login"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if !allowed_owners.is_empty() && !allowed_owners.contains(&owner.to_ascii_lowercase()) {
        return None;
    }

    let task_keys = extract_task_keys_from_pr(head_ref, &title, body);
    if task_keys.is_empty() {
        return None;
    }

    let state = node
        .get("state")
        .and_then(|v| v.as_str())
        .unwrap_or("OPEN")
        .to_string();
    let is_draft = node
        .get("isDraft")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let review_decision = node
        .get("reviewDecision")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let mergeable = node
        .get("mergeable")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let ci_state = node
        .get("commits")
        .and_then(|c| c.get("nodes"))
        .and_then(|arr| arr.as_array())
        .and_then(|arr| arr.first())
        .and_then(|n| n.get("commit"))
        .and_then(|c| c.get("statusCheckRollup"))
        .and_then(|r| r.get("state"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let changed_files = node
        .get("changedFiles")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let additions = node.get("additions").and_then(|v| v.as_u64()).unwrap_or(0);
    let deletions = node.get("deletions").and_then(|v| v.as_u64()).unwrap_or(0);

    let (status_key, status_label) = compute_pr_status(
        &state,
        is_draft,
        review_decision.as_deref(),
        mergeable.as_deref(),
    );

    Some((
        task_keys,
        GitHubPrSummary {
            number,
            title,
            url,
            repo,
            state,
            is_draft,
            review_decision,
            mergeable,
            ci_state,
            changed_files,
            additions,
            deletions,
            status_key,
            status_label,
        },
    ))
}

fn state_sort_rank(state: &str) -> u8 {
    match state {
        "OPEN" => 0,
        "MERGED" => 1,
        _ => 2,
    }
}

async fn ensure_pr_index(
    state: &AppState,
    scope: &GitHubScope,
    force_refresh: bool,
) -> Result<HashMap<String, Vec<GitHubPrSummary>>, String> {
    if !force_refresh {
        if let Ok(guard) = state.github.cached_index.lock() {
            if let Some(ref idx) = *guard {
                if idx.fetched_at.elapsed() < INDEX_CACHE_TTL {
                    return Ok(idx.by_key.clone());
                }
            }
        }
    }

    let owners = &scope.qualifier_str;
    let q_open = if owners.is_empty() {
        "is:pr is:open sort:updated-desc".to_string()
    } else {
        format!("is:pr is:open {} sort:updated-desc", owners)
    };
    let q_closed = if owners.is_empty() {
        "is:pr is:closed sort:updated-desc".to_string()
    } else {
        format!("is:pr is:closed {} sort:updated-desc", owners)
    };

    let gql = format!(
        r#"query {{
  openPrs: search(query: "{qo}", type: ISSUE, first: 100) {{
    nodes {{ ...PrFields }}
  }}
  closedPrs: search(query: "{qc}", type: ISSUE, first: 100) {{
    nodes {{ ...PrFields }}
  }}
}}
fragment PrFields on PullRequest {{
  number
  title
  body
  url
  state
  isDraft
  reviewDecision
  mergeable
  headRefName
  changedFiles
  additions
  deletions
  repository {{
    name
    owner {{ login }}
  }}
  commits(last: 1) {{
    nodes {{
      commit {{
        statusCheckRollup {{
          state
        }}
      }}
    }}
  }}
}}"#,
        qo = escape_gql_string(&q_open),
        qc = escape_gql_string(&q_closed),
    );

    let json = github_graphql_request(state, &gql).await?;
    let data = json
        .get("data")
        .ok_or_else(|| "GitHub GraphQL sin campo data".to_string())?;

    let mut by_key: HashMap<String, Vec<GitHubPrSummary>> = HashMap::new();
    let mut seen_key_url: HashSet<(String, String)> = HashSet::new();

    for bucket in ["openPrs", "closedPrs"] {
        if let Some(arr) = data
            .get(bucket)
            .and_then(|s| s.get("nodes"))
            .and_then(|n| n.as_array())
        {
            for node in arr {
                if let Some((keys, pr)) = parse_pr_node(node, &scope.allowed_owners) {
                    for key in keys {
                        if seen_key_url.insert((key.clone(), pr.url.clone())) {
                            by_key.entry(key).or_default().push(pr.clone());
                        }
                    }
                }
            }
        }
    }

    for prs in by_key.values_mut() {
        let active_repos: HashSet<String> = prs
            .iter()
            .filter(|p| p.state == "OPEN" || p.state == "MERGED")
            .map(|p| p.repo.clone())
            .collect();
        if !active_repos.is_empty() {
            prs.retain(|p| p.state != "CLOSED" || !active_repos.contains(&p.repo));
        }
        prs.sort_by(|a, b| {
            state_sort_rank(&a.state)
                .cmp(&state_sort_rank(&b.state))
                .then_with(|| a.repo.cmp(&b.repo))
                .then_with(|| b.number.cmp(&a.number))
        });
    }

    if let Ok(mut guard) = state.github.cached_index.lock() {
        *guard = Some(CachedPrIndex {
            by_key: by_key.clone(),
            fetched_at: Instant::now(),
        });
    }

    Ok(by_key)
}

pub async fn api_github_task_prs_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<TaskPrBatchRequest>,
) -> Response {
    if payload.tasks.is_empty() {
        return Json(serde_json::json!({
            "available": true,
            "prsByTask": {}
        }))
        .into_response();
    }

    let scope = match resolve_github_scope(&state, false).await {
        Ok(sc) => sc,
        Err(err) => {
            return Json(serde_json::json!({
                "available": false,
                "reason": err,
                "prsByTask": {}
            }))
            .into_response();
        }
    };

    let index = match ensure_pr_index(&state, &scope, payload.refresh).await {
        Ok(idx) => idx,
        Err(err) => {
            // Fall back to stale cached index if available during transient network blips
            let fallback = state
                .github
                .cached_index
                .lock()
                .ok()
                .and_then(|g| g.as_ref().map(|c| c.by_key.clone()));
            match fallback {
                Some(idx) => idx,
                None => {
                    return Json(serde_json::json!({
                        "available": false,
                        "reason": err,
                        "prsByTask": {}
                    }))
                    .into_response();
                }
            }
        }
    };

    let mut prs_by_task: HashMap<String, Vec<GitHubPrSummary>> = HashMap::new();

    for item in payload.tasks.iter().take(150) {
        let mut combined: Vec<GitHubPrSummary> = Vec::new();
        let mut seen_urls: HashSet<String> = HashSet::new();

        let id_key = item.id.trim().trim_start_matches('#').to_ascii_uppercase();
        if !id_key.is_empty() {
            if let Some(prs) = index.get(&id_key) {
                for pr in prs {
                    if seen_urls.insert(pr.url.clone()) {
                        combined.push(pr.clone());
                    }
                }
            }
        }

        if let Some(ref raw_code) = item.code {
            let code_key = raw_code.trim().trim_start_matches('#').to_ascii_uppercase();
            if !code_key.is_empty() && code_key != id_key {
                if let Some(prs) = index.get(&code_key) {
                    for pr in prs {
                        if seen_urls.insert(pr.url.clone()) {
                            combined.push(pr.clone());
                        }
                    }
                }
            }
        }

        if !combined.is_empty() {
            combined.sort_by(|a, b| {
                state_sort_rank(&a.state)
                    .cmp(&state_sort_rank(&b.state))
                    .then_with(|| a.repo.cmp(&b.repo))
                    .then_with(|| b.number.cmp(&a.number))
            });
            prs_by_task.insert(item.id.clone(), combined);
        }
    }

    Json(serde_json::json!({
        "available": true,
        "prsByTask": prs_by_task,
    }))
    .into_response()
}
