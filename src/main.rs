mod assets;
mod markdown;
mod pty;
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

    #[arg(long = "server-child", hide = true)]
    server_child: bool,

    #[arg(long = "dir-mode", hide = true)]
    dir_mode: bool,

    #[arg(long = "workspace", hide = true)]
    workspace: Option<String>,

    #[arg(long = "stdin-file", hide = true)]
    stdin_file: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct UserConfig {
    #[serde(default = "default_true")]
    maximized: bool,
    #[serde(default = "default_theme")]
    theme: String,
    #[serde(default)]
    wide: bool,
    #[serde(default = "default_zoom")]
    zoom: u32,
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
        }
    }
}

fn config_file_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("mdv")
        .join("config.json")
}

fn load_user_config() -> UserConfig {
    let p = config_file_path();
    if let Ok(raw) = fs::read_to_string(p) {
        if let Ok(cfg) = serde_json::from_str::<UserConfig>(&raw) {
            return cfg;
        }
    }
    UserConfig::default()
}

fn save_user_config(patch: serde_json::Value) -> UserConfig {
    let mut current = serde_json::to_value(load_user_config()).unwrap_or_else(|_| serde_json::json!({}));
    if let (Some(cur_map), Some(patch_map)) = (current.as_object_mut(), patch.as_object()) {
        for (k, v) in patch_map {
            cur_map.insert(k.clone(), v.clone());
        }
    }
    let next: UserConfig = serde_json::from_value(current).unwrap_or_default();
    let p = config_file_path();
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(txt) = serde_json::to_string_pretty(&next) {
        let _ = fs::write(p, txt + "\n");
    }
    next
}

fn compute_file_sha1(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    let mut hasher = Sha1::new();
    hasher.update(&bytes);
    Some(format!("{:x}", hasher.finalize()))
}

struct AppState {
    initial_file: PathBuf,
    split_file: Option<PathBuf>,
    split_direction: String,
    workspace_dir: PathBuf,
    dir_mode: bool,
    default_theme: String,
    keep_alive: bool,
    stdin_file: Option<PathBuf>,
    watched_files: Mutex<HashMap<PathBuf, String>>,
    reload_tx: broadcast::Sender<String>,
    active_clients: AtomicUsize,
    had_client: AtomicBool,
}

#[derive(Deserialize)]
struct DocQuery {
    file: Option<String>,
}

#[derive(Deserialize)]
struct LocalFileQuery {
    path: String,
}

#[derive(Deserialize)]
struct PtyQuery {
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
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

fn build_html_shell(
    state: &AppState,
    file_path: &Path,
    rendered: &markdown::RenderedDocument,
) -> String {
    let user_cfg = load_user_config();
    let rel_display = workspace::normalize_rel_path(&state.workspace_dir, file_path);
    let rel_display = if rel_display.is_empty() {
        file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Markdown".to_string())
    } else {
        rel_display
    };
    let workspace_name = state
        .workspace_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| state.workspace_dir.to_string_lossy().to_string());

    let scan = workspace::scan_markdown_workspace(&state.workspace_dir, 8, 1500);
    let show_sidebar = state.dir_mode || scan.files.len() > 1;
    let hide_files_cls = if show_sidebar { "" } else { "hide-files" };
    let active_btn_cls = if show_sidebar { " is-active" } else { "" };

    let file_str = file_path.to_string_lossy();
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
        .or_else(|| file_path.file_name().map(|n| n.to_string_lossy().to_string()))
        .unwrap_or_else(|| "mdv".to_string());

    let init_json = serde_json::json!({
        "currentFile": file_path.to_string_lossy(),
        "initialToc": rendered.toc,
        "initialRelPath": rel_display,
        "splitFile": state.split_file.as_ref().map(|p| p.to_string_lossy()),
        "splitDirection": state.split_direction,
        "workspaceDir": state.workspace_dir.to_string_lossy(),
        "dirMode": state.dir_mode,
        "defaultTheme": state.default_theme,
        "defaultZoom": user_cfg.zoom,
        "maximized": user_cfg.maximized,
    });

    format!(
        r#"<!DOCTYPE html>
<html lang="es" data-theme="{theme}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title} — mdv</title>
  <link rel="stylesheet" href="/vendor/overlayscrollbars/overlayscrollbars.min.css" />
  <link rel="stylesheet" href="/vendor/xterm/xterm.css" />
  <link rel="stylesheet" href="/vendor/katex/katex.min.css" />
  <link rel="stylesheet" href="/assets/styles.css?v=2.0.0" />
</head>
<body class="{hide_files_cls}">
  <header class="mdv-topbar">
    <div class="mdv-topbar-left">
      <button type="button" id="mdv-toggle-files" class="mdv-tool-btn{active_btn_cls}" title="Mostrar/ocultar Navegador de MD (e)">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75C0 1.784.784 1 1.75 1ZM1.5 2.75v10.5c0 .138.112.25.25.25H5v-11H1.75a.25.25 0 0 0-.25.25Zm5 10.75h7.75a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25H6.5Z"/></svg>
        <span>Archivos</span>
        <span id="mdv-total-files" class="mdv-count-chip">{total_files}</span>
      </button>
      <div class="mdv-file-badge">
        <span id="mdv-live-dot" class="mdv-live-dot" title="Live-reload activo"></span>
        <span class="mdv-workspace-crumb">{ws_name} /</span>
        <strong id="mdv-filename">{rel_display}</strong>
        <span id="mdv-reload-pill" class="mdv-reload-pill" hidden>Actualizado</span>
      </div>
    </div>

    <div class="mdv-topbar-right">
      <div class="mdv-btn-pill-group" role="group" aria-label="Markdown Splits">
        <button type="button" id="mdv-split-vertical" class="mdv-tool-btn" title="Dividir MD a la derecha (Ctrl+Alt+R en zona MD)">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75C0 1.784.784 1 1.75 1ZM1.5 2.75v10.5c0 .138.112.25.25.25h5.5v-11h-5.5a.25.25 0 0 0-.25.25Zm7 10.75h5.75a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25H8.5Z"/></svg>
          <span>MD |</span>
        </button>
        <button type="button" id="mdv-split-horizontal" class="mdv-tool-btn" title="Dividir MD abajo (Ctrl+Alt+D en zona MD)">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75C0 1.784.784 1 1.75 1ZM1.5 2.75v4.5h13v-4.5a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25Zm0 6v4.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-4.5Z"/></svg>
          <span>MD —</span>
        </button>
      </div>

      <div class="mdv-btn-pill-group" role="group" aria-label="WSL Terminal Splits">
        <button type="button" id="mdv-toggle-term-zone" class="mdv-tool-btn is-active" title="Mostrar/ocultar Zona de Terminales">
          <span class="mdv-term-glyph">&gt;_</span>
          <span>Terminal</span>
        </button>
        <button type="button" id="mdv-term-vertical" class="mdv-tool-btn mdv-term-btn" title="Split Terminal a la derecha (Ctrl+Alt+R en Terminal o Alt+Shift+R)">
          <span>+|</span>
        </button>
        <button type="button" id="mdv-term-horizontal" class="mdv-tool-btn mdv-term-btn" title="Split Terminal abajo (Ctrl+Alt+D en Terminal o Alt+Shift+D)">
          <span>+—</span>
        </button>
      </div>

      <div class="mdv-btn-pill-group" role="group" aria-label="Tamaño de letra">
        <button type="button" id="mdv-font-dec" class="mdv-tool-btn mdv-font-btn" title="Achicar letra (-)">A−</button>
        <button type="button" id="mdv-font-reset" class="mdv-tool-btn mdv-font-pct" title="Restablecer tamaño (0)">{zoom}%</button>
        <button type="button" id="mdv-font-inc" class="mdv-tool-btn mdv-font-btn" title="Agrandar letra (+)">A+</button>
      </div>

      <button type="button" id="mdv-open-search" class="mdv-tool-btn" title="Buscar en documento (/)">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/></svg>
      </button>
      <button type="button" id="mdv-toggle-wide" class="mdv-tool-btn" title="Alternar ancho de lectura (w)">Ancho</button>
      <select id="mdv-theme-select" class="mdv-theme-select" aria-label="Tema visual" title="Cambiar tema (c)">
        <option value="tokyo">Tokyo Night</option>
        <option value="github-dark">GitHub Dark</option>
        <option value="catppuccin">Catppuccin</option>
        <option value="light">Claro (Paper)</option>
      </select>
      <button type="button" id="mdv-toggle-toc" class="mdv-tool-btn is-active" title="Mostrar/ocultar Índice (t)">Índice</button>
      <button type="button" id="mdv-open-help" class="mdv-tool-btn" title="Atajos estilo Vim (?)">?</button>
    </div>
  </header>

  <div class="mdv-workspace">
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
          <input id="mdv-file-filter" type="text" placeholder="Filtrar .md... (Ctrl+P · Alt+Clic Split)" autocomplete="off" spellcheck="false" />
        </div>
      </div>
      <div id="mdv-files-scroll" class="mdv-sidebar-scroll" data-overlayscrollbars-initialize>
        <ul id="mdv-file-list" class="mdv-file-tree">{tree_html}</ul>
      </div>
    </aside>

    <main id="mdv-md-zone" class="mdv-md-zone" data-md-count="1">
      <div id="mdv-initial-html" hidden>{body_html}</div>
    </main>

    <aside class="mdv-sidebar-toc">
      <h2 class="mdv-panel-title mdv-toc-top">En esta página</h2>
      <div id="mdv-toc-scroll" class="mdv-sidebar-scroll" data-overlayscrollbars-initialize>
        <ul id="mdv-toc-list" class="mdv-toc-list">{toc_html}</ul>
      </div>
    </aside>

    <div id="mdv-zone-resizer" class="mdv-zone-resizer" title="Arrastra para ajustar ancho de Terminales · Doble clic restablecer"></div>

    <section id="mdv-term-zone" class="mdv-term-zone" data-term-count="1" aria-label="Zona de Terminales WSL"></section>
  </div>

  <div id="mdv-search-bar" class="mdv-search-bar" hidden>
    <span class="mdv-search-Slash">/</span>
    <input id="mdv-search-input" type="text" placeholder="Buscar en panel activo... (Enter fijar, n/N navegar, Esc cerrar)" autocomplete="off" spellcheck="false" />
    <span id="mdv-search-count" class="mdv-search-count">0 / 0</span>
    <button type="button" id="mdv-search-prev" class="mdv-icon-btn" title="Anterior (N)">N</button>
    <button type="button" id="mdv-search-next" class="mdv-icon-btn" title="Siguiente (n)">n</button>
    <button type="button" id="mdv-search-close" class="mdv-icon-btn" title="Cerrar (Esc)">Esc</button>
  </div>

  <div class="mdv-vim-hud">
    <span id="mdv-vim-toast" class="mdv-vim-toast" hidden></span>
    <span id="mdv-vim-keys" class="mdv-vim-keys" hidden></span>
    <span id="mdv-vim-pos" class="mdv-vim-pos">TOP</span>
  </div>

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
  <script src="/assets/app.js?v=2.0.0"></script>
</body>
</html>"#,
        theme = workspace::escape_html_attr(&state.default_theme),
        title = workspace::escape_html_attr(&page_title),
        hide_files_cls = hide_files_cls,
        active_btn_cls = active_btn_cls,
        total_files = scan.files.len(),
        ws_name = workspace::escape_html_attr(&workspace_name),
        ws_full = workspace::escape_html_attr(&state.workspace_dir.to_string_lossy()),
        rel_display = workspace::escape_html_attr(&rel_display),
        zoom = user_cfg.zoom,
        tree_html = tree_html,
        body_html = rendered.html,
        toc_html = toc_html,
        init_json = init_json
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
        .unwrap_or_else(|| state.initial_file.clone());

    if let Some(sig) = compute_file_sha1(&target) {
        if let Ok(mut map) = state.watched_files.lock() {
            map.insert(target.clone(), sig);
        }
    }

    let raw = fs::read_to_string(&target).unwrap_or_default();
    let base_dir = target.parent().unwrap_or(&state.workspace_dir);
    let rendered = markdown::render_markdown_document(&raw, base_dir);
    let page = build_html_shell(&state, &target, &rendered);
    Html(page)
}

async fn api_doc_handler(
    State(state): State<Arc<AppState>>,
    Query(q): Query<DocQuery>,
) -> Response {
    let target = q
        .file
        .as_deref()
        .map(PathBuf::from)
        .unwrap_or_else(|| state.initial_file.clone());
    if !target.is_file() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Archivo no encontrado" })),
        )
            .into_response();
    }

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

async fn api_prefs_handler(Json(patch): Json<serde_json::Value>) -> impl IntoResponse {
    Json(save_user_config(patch))
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
        if prev == 1 && self.state.had_client.load(Ordering::SeqCst) && !self.state.keep_alive {
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
    let cwd = q
        .cwd
        .as_deref()
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .unwrap_or_else(|| state.workspace_dir.clone());
    let cols = q.cols.unwrap_or(90);
    let rows = q.rows.unwrap_or(26);
    ws.on_upgrade(move |socket| pty::handle_pty_ws(socket, cwd, cols, rows))
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

fn get_app_profile_dir() -> Option<String> {
    #[cfg(windows)]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            return Some(format!(r"{}\mdv-viewer-profile", local));
        }
        None
    }
    #[cfg(unix)]
    {
        if Path::new("/mnt/c/WINDOWS/system32/cmd.exe").is_file() {
            if let Ok(out) = Command::new("/mnt/c/WINDOWS/system32/cmd.exe")
                .args(["/c", "echo %LOCALAPPDATA%"])
                .output()
            {
                let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !s.is_empty() && !s.contains('%') {
                    return Some(format!(r"{}\mdv-viewer-profile", s));
                }
            }
        }
        dirs::cache_dir().map(|d| d.join("mdv-viewer-profile").to_string_lossy().to_string())
    }
}

fn launch_window(url: &str, app_mode: bool, maximized: bool) {
    if let Some(browser) = find_chromium_browser() {
        let mut cmd = Command::new(browser);
        if app_mode {
            cmd.arg(format!("--app={}", url));
            cmd.arg("--no-first-run");
            cmd.arg("--no-default-browser-check");
            if let Some(prof) = get_app_profile_dir() {
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
        if Path::new("/mnt/c/WINDOWS/system32/cmd.exe").is_file() {
            let _ = Command::new("/mnt/c/WINDOWS/system32/cmd.exe")
                .args(["/c", "start", "", url])
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

fn resolve_initial_target(target_arg: Option<&str>, explicit_workspace: Option<&str>) -> (PathBuf, PathBuf, bool) {
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
        match workspace::pick_default_markdown_file(&scan.files, &canonical) {
            Some(initial) => return (initial, canonical, true),
            None => {
                eprintln!(
                    "No se encontraron archivos .md en '{}' ni en sus subcarpetas.",
                    canonical.display()
                );
                std::process::exit(1);
            }
        }
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

    (canonical, ws, false)
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

#[tokio::main]
async fn main() {
    let mut cli = Cli::parse();

    if cli.update {
        run_self_update();
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
        let exe = std::env::current_exe().expect("Cannot locate mdv executable");
        let mut cmd = Command::new(exe);
        cmd.arg(&initial_file)
            .arg("--workspace")
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
        let label = if effective_dir_mode {
            format!(
                "carpeta {}",
                workspace_dir
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| workspace_dir.to_string_lossy().to_string())
            )
        } else {
            initial_file
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default()
        };
        println!("Abriendo {} en ventana mdv...", label);
        return;
    }

    let (reload_tx, _) = broadcast::channel::<String>(32);
    let mut initial_map = HashMap::new();
    if let Some(sig) = compute_file_sha1(&initial_file) {
        initial_map.insert(initial_file.clone(), sig);
    }
    if let Some(ref sp) = resolved_split {
        if let Some(sig) = compute_file_sha1(sp) {
            initial_map.insert(sp.clone(), sig);
        }
    }

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
    });

    // Hybrid SHA-1 live-reload watcher (300ms) + recursive workspace file count watcher (2s)
    {
        let st = Arc::clone(&state);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(300));
            loop {
                interval.tick().await;
                if st.active_clients.load(Ordering::Relaxed) == 0 {
                    continue;
                }
                let mut changed_files = Vec::new();
                if let Ok(mut map) = st.watched_files.lock() {
                    for (path, prev_sig) in map.iter_mut() {
                        if let Some(new_sig) = compute_file_sha1(path) {
                            if &new_sig != prev_sig {
                                *prev_sig = new_sig;
                                changed_files.push(path.to_string_lossy().to_string());
                            }
                        }
                    }
                }
                for f in changed_files {
                    let payload = serde_json::json!({ "file": f, "reason": "content" }).to_string();
                    let _ = st.reload_tx.send(payload);
                }
            }
        });
    }

    {
        let st = Arc::clone(&state);
        tokio::spawn(async move {
            let mut last_count = workspace::scan_markdown_workspace(&st.workspace_dir, 8, 1500)
                .files
                .len();
            let mut interval = tokio::time::interval(Duration::from_millis(2000));
            loop {
                interval.tick().await;
                if st.active_clients.load(Ordering::Relaxed) == 0 {
                    continue;
                }
                let count = workspace::scan_markdown_workspace(&st.workspace_dir, 8, 1500)
                    .files
                    .len();
                if count != last_count {
                    last_count = count;
                    let payload = serde_json::json!({ "file": null, "reason": "tree" }).to_string();
                    let _ = st.reload_tx.send(payload);
                }
            }
        });
    }

    if cli.server_child && !cli.keep_alive {
        let st = Arc::clone(&state);
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(30)).await;
            if !st.had_client.load(Ordering::SeqCst) {
                std::process::exit(0);
            }
        });
    }

    let app = Router::new()
        .route("/", get(index_handler))
        .route("/events", get(sse_events_handler))
        .route("/api/doc", get(api_doc_handler))
        .route("/api/prefs", post(api_prefs_handler))
        .route("/local-file", get(local_file_handler))
        .route("/ws/pty", get(pty_ws_handler))
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
    let url = format!("http://127.0.0.1:{}", local_addr.port());

    if !cli.server_child {
        println!("mdv 2.0.0 (Rust) escuchando en {} ({})", url, workspace_dir.display());
    }
    if !cli.no_open {
        launch_window(&url, !cli.browser, maximized);
    }

    axum::serve(listener, app).await.unwrap();
}
