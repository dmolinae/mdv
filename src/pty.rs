use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Deserialize;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};

#[derive(Deserialize)]
#[serde(tag = "type")]
enum PtyClientMsg {
    #[serde(rename = "input")]
    Input { data: String },
    #[serde(rename = "resize")]
    Resize { cols: u16, rows: u16 },
}

fn build_shell_command(cwd: &Path) -> CommandBuilder {
    #[cfg(unix)]
    {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let shell_bin = if Path::new(&shell).exists() {
            shell
        } else {
            "/bin/bash".to_string()
        };
        let mut cmd = CommandBuilder::new(shell_bin);
        cmd.arg("-i");
        cmd.cwd(cwd);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd
    }

    #[cfg(windows)]
    {
        // Prefer WSL shell on Windows when available so Windows users also get their real WSL terminal!
        let wsl_exe = Path::new(r"C:\Windows\System32\wsl.exe");
        if wsl_exe.exists() {
            let mut cmd = CommandBuilder::new(wsl_exe);
            cmd.arg("--cd");
            cmd.arg(cwd.as_os_str());
            cmd.env("TERM", "xterm-256color");
            cmd.env("COLORTERM", "truecolor");
            return cmd;
        }
        let pwsh = Path::new(r"C:\Program Files\PowerShell\7\pwsh.exe");
        let shell = if pwsh.exists() {
            pwsh.to_string_lossy().to_string()
        } else {
            "powershell.exe".to_string()
        };
        let mut cmd = CommandBuilder::new(shell);
        cmd.arg("-NoLogo");
        cmd.cwd(cwd);
        cmd
    }
}

pub async fn handle_pty_ws(socket: WebSocket, cwd: std::path::PathBuf, cols: u16, rows: u16) {
    let pty_system = native_pty_system();
    let size = PtySize {
        rows: rows.max(4),
        cols: cols.max(10),
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = match pty_system.openpty(size) {
        Ok(p) => p,
        Err(_) => return,
    };

    let cmd = build_shell_command(&cwd);
    let mut child = match pair.slave.spawn_command(cmd) {
        Ok(c) => c,
        Err(_) => return,
    };
    // Drop slave handle in parent so EOF triggers properly when shell exits
    drop(pair.slave);

    let mut reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(_) => {
            let _ = child.kill();
            return;
        }
    };
    let writer = match pair.master.take_writer() {
        Ok(w) => Arc::new(Mutex::new(w)),
        Err(_) => {
            let _ = child.kill();
            return;
        }
    };
    let master = Arc::new(Mutex::new(pair.master));

    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (tx, mut rx) = tokio::sync::mpsc::channel::<Message>(64);

    // Blocking PTY stdout reader -> async mpsc channel
    let tx_out = tx.clone();
    tokio::task::spawn_blocking(move || {
        let mut buf = [0u8; 16384];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if tx_out.blocking_send(Message::Binary(buf[..n].to_vec())).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = tx_out.blocking_send(Message::Text(r#"{"type":"exit","code":0}"#.to_string()));
    });

    // Forward channel messages to WebSocket client
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let is_exit = matches!(&msg, Message::Text(s) if s.contains(r#""type":"exit""#));
            if ws_sender.send(msg).await.is_err() {
                break;
            }
            if is_exit {
                let _ = ws_sender.close().await;
                break;
            }
        }
    });

    // Receive input / resize from WebSocket client
    let writer_in = Arc::clone(&writer);
    let master_in = Arc::clone(&master);
    while let Some(Ok(msg)) = ws_receiver.next().await {
        match msg {
            Message::Binary(bin) => {
                if let Ok(mut w) = writer_in.lock() {
                    let _ = w.write_all(&bin);
                    let _ = w.flush();
                }
            }
            Message::Text(txt) => {
                if let Ok(parsed) = serde_json::from_str::<PtyClientMsg>(&txt) {
                    match parsed {
                        PtyClientMsg::Input { data } => {
                            if let Ok(mut w) = writer_in.lock() {
                                let _ = w.write_all(data.as_bytes());
                                let _ = w.flush();
                            }
                        }
                        PtyClientMsg::Resize { cols, rows } => {
                            if let Ok(m) = master_in.lock() {
                                let _ = m.resize(PtySize {
                                    rows: rows.max(2),
                                    cols: cols.max(4),
                                    pixel_width: 0,
                                    pixel_height: 0,
                                });
                            }
                        }
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    send_task.abort();
    let _ = child.kill();
    let _ = child.wait();
}
