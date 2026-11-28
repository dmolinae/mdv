use std::{
    net::TcpStream,
    path::PathBuf,
    process::{Command, Stdio},
};
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    platform::windows::WindowBuilderExtWindows,
    window::{Icon, ResizeDirection, WindowBuilder},
};
use wry::{http::Request, NewWindowResponse, WebContext, WebViewBuilder, WebViewBuilderExtWindows};

static ICON_64_RGBA: &[u8] = include_bytes!("../assets/icon-64.rgba");

const ATTACH_PARENT_PROCESS: u32 = 0xFFFFFFFF;
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[link(name = "kernel32")]
extern "system" {
    fn AttachConsole(dwProcessId: u32) -> i32;
}

/// Attaches to the parent terminal console ONLY for foreground CLI invocations (`--help`, `--version`, etc.)
/// so launching from Explorer / Start Menu / WSL2 never flashes a black console window, while letting Windows
/// group by executable and honor `WM_SETICON` (`with_window_icon` / `with_taskbar_icon`) directly!
pub fn init_windows_process() {
    let is_gui_background = std::env::args().any(|a| a == "--server-child" || a == "--app-url" || a.starts_with("--app-url="));
    if !is_gui_background {
        unsafe {
            let _ = AttachConsole(ATTACH_PARENT_PROCESS);
        }
    }
}

enum UserEvent {
    Minimize,
    ToggleMaximize,
    DragWindow,
    DragResize(ResizeDirection),
    SetTitle(String),
    CloseWindow,
}

fn load_window_icon() -> Option<Icon> {
    Icon::from_rgba(ICON_64_RGBA.to_vec(), 64, 64).ok()
}

fn webview2_data_dir() -> Option<PathBuf> {
    std::env::var("LOCALAPPDATA")
        .ok()
        .map(|base| PathBuf::from(base).join("mdv").join("webview2"))
}

fn parse_resize_dir(code: &str) -> Option<ResizeDirection> {
    match code {
        "N" => Some(ResizeDirection::North),
        "S" => Some(ResizeDirection::South),
        "E" => Some(ResizeDirection::East),
        "W" => Some(ResizeDirection::West),
        "NE" => Some(ResizeDirection::NorthEast),
        "NW" => Some(ResizeDirection::NorthWest),
        "SE" => Some(ResizeDirection::SouthEast),
        "SW" => Some(ResizeDirection::SouthWest),
        _ => None,
    }
}

fn notify_local_server_quit(url: &str) {
    // Parse host:port from http://127.0.0.1:<port>...
    let stripped = url
        .strip_prefix("http://")
        .or_else(|| url.strip_prefix("https://"))
        .unwrap_or(url);
    let host_port = stripped.split('/').next().unwrap_or("");
    if host_port.starts_with("127.0.0.1:") || host_port.starts_with("localhost:") {
        if let Ok(mut stream) = TcpStream::connect(host_port) {
            use std::io::Write;
            let _ = stream.set_write_timeout(Some(std::time::Duration::from_millis(150)));
            let req = format!(
                "POST /api/app-quit HTTP/1.1\r\nHost: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                host_port
            );
            let _ = stream.write_all(req.as_bytes());
            let _ = stream.flush();
        }
    }
}

fn open_external_in_default_browser(url: &str) {
    use std::os::windows::process::CommandExt;
    if url.starts_with("https://") || url.starts_with("http://") {
        let _ = Command::new("cmd")
            .args(["/c", "start", "", url])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }
}

pub fn run_native_window(
    url: &str,
    initial_title: &str,
    maximized: bool,
    notify_remote_quit: bool,
    stdin_cleanup: Option<PathBuf>,
) -> ! {
    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let icon = load_window_icon();

    let window = WindowBuilder::new()
        .with_title(initial_title)
        .with_window_icon(icon.clone())
        .with_taskbar_icon(icon)
        .with_decorations(false)
        .with_undecorated_shadow(true)
        .with_inner_size(LogicalSize::new(1440.0, 900.0))
        .with_min_inner_size(LogicalSize::new(760.0, 480.0))
        .with_maximized(maximized)
        .build(&event_loop)
        .expect("Failed to create native Windows mdv window");

    let mut web_context = WebContext::new(webview2_data_dir());

    let init_script = format!(
        r#"window.__MDV_NATIVE_WIN__ = true;
window.__MDV_WIN_MAXIMIZED__ = {max_bool};
(function applyMdvWinState() {{
  if (document.documentElement) {{
    document.documentElement.classList.add('is-native-win');
    document.documentElement.setAttribute('data-win-maximized', window.__MDV_WIN_MAXIMIZED__ ? 'true' : 'false');
  }} else {{
    document.addEventListener('DOMContentLoaded', applyMdvWinState, {{ once: true }});
  }}
}})();"#,
        max_bool = if maximized { "true" } else { "false" }
    );

    let proxy = event_loop.create_proxy();
    let ipc_handler = move |req: Request<String>| {
        let msg = req.body().as_str();
        match msg {
            "minimize" => {
                let _ = proxy.send_event(UserEvent::Minimize);
            }
            "toggle_maximize" => {
                let _ = proxy.send_event(UserEvent::ToggleMaximize);
            }
            "drag" => {
                let _ = proxy.send_event(UserEvent::DragWindow);
            }
            "close" => {
                let _ = proxy.send_event(UserEvent::CloseWindow);
            }
            _ => {
                if let Some(rest) = msg.strip_prefix("title:") {
                    let _ = proxy.send_event(UserEvent::SetTitle(rest.to_string()));
                } else if let Some(dir_code) = msg.strip_prefix("resize:") {
                    if let Some(dir) = parse_resize_dir(dir_code) {
                        let _ = proxy.send_event(UserEvent::DragResize(dir));
                    }
                }
            }
        }
    };

    let target_url = url.to_string();
    let webview = WebViewBuilder::new_with_web_context(&mut web_context)
        .with_url(&target_url)
        .with_background_color((15, 17, 26, 255))
        .with_browser_accelerator_keys(false)
        .with_initialization_script(&init_script)
        .with_ipc_handler(ipc_handler)
        .with_accept_first_mouse(true)
        .with_new_window_req_handler(|ext_url, _| {
            open_external_in_default_browser(&ext_url);
            NewWindowResponse::Deny
        })
        .build(&window)
        .expect("Failed to initialize WebView2 in mdv window");

    let mut webview_opt = Some(webview);
    let mut last_max = window.is_maximized();

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::WindowEvent {
                event: WindowEvent::Resized(_),
                ..
            } => {
                let is_max = window.is_maximized();
                if is_max != last_max {
                    last_max = is_max;
                    if let Some(ref wv) = webview_opt {
                        let js = format!(
                            "window.__MDV_WIN_MAXIMIZED__ = {b}; if (document.documentElement) document.documentElement.setAttribute('data-win-maximized', '{s}');",
                            b = if is_max { "true" } else { "false" },
                            s = if is_max { "true" } else { "false" }
                        );
                        let _ = wv.evaluate_script(&js);
                    }
                }
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            }
            | Event::UserEvent(UserEvent::CloseWindow) => {
                let _ = webview_opt.take();
                if let Some(ref tmp) = stdin_cleanup {
                    let _ = std::fs::remove_file(tmp);
                }
                if notify_remote_quit {
                    notify_local_server_quit(&target_url);
                }
                *control_flow = ControlFlow::Exit;
            }
            Event::UserEvent(ue) => match ue {
                UserEvent::Minimize => window.set_minimized(true),
                UserEvent::ToggleMaximize => {
                    let next = !window.is_maximized();
                    window.set_maximized(next);
                }
                UserEvent::DragWindow => {
                    let _ = window.drag_window();
                }
                UserEvent::DragResize(dir) => {
                    let _ = window.drag_resize_window(dir);
                }
                UserEvent::SetTitle(title) => {
                    window.set_title(&title);
                }
                UserEvent::CloseWindow => {}
            },
            _ => {}
        }
    });
}
