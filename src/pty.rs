use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Deserialize;
use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};
use tokio::sync::broadcast;

const MAX_HISTORY_BYTES: usize = 262_144; // 256 KiB scrollback ring buffer per terminal

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClaudeState {
    None,
    Working,
    Waiting,
}

impl ClaudeState {
    pub fn as_str(self) -> &'static str {
        match self {
            ClaudeState::None => "none",
            ClaudeState::Working => "working",
            ClaudeState::Waiting => "waiting",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum OscScanState {
    Normal,
    SawEsc,
    InOsc,
    InOscSawEsc,
}

struct ClaudeTracker {
    state: ClaudeState,
    claude_alive: bool,
    osc_hint: Option<ClaudeState>,
    pending_osc_cwd: Option<PathBuf>,
    last_output_at: Instant,
    last_enter_at: Instant,
    last_keystroke_at: Instant,
    first_seen_at: Option<Instant>,
    osc_scan: OscScanState,
    osc_buf: Vec<u8>,
}

fn normalize_cwd_path(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim().trim_matches('"');
    if trimmed.is_empty() {
        return None;
    }
    #[cfg(windows)]
    {
        let fwd = trimmed.replace('\\', "/");
        if let Some(rest) = fwd.strip_prefix("/mnt/") {
            let bytes = rest.as_bytes();
            if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b'/' {
                let drive = (bytes[0] as char).to_ascii_uppercase();
                let tail = rest[2..].replace('/', "\\");
                let win_p = if tail.is_empty() {
                    PathBuf::from(format!("{}:\\", drive))
                } else {
                    PathBuf::from(format!("{}:\\{}", drive, tail))
                };
                if win_p.is_dir() {
                    return Some(win_p);
                }
            } else if bytes.len() == 1 && bytes[0].is_ascii_alphabetic() {
                let drive = (bytes[0] as char).to_ascii_uppercase();
                let win_p = PathBuf::from(format!("{}:\\", drive));
                if win_p.is_dir() {
                    return Some(win_p);
                }
            }
        }
        if fwd.starts_with('/') && !fwd.starts_with("//") {
            if let Some(distro) = default_wsl_distro_name() {
                let unc = PathBuf::from(format!(
                    r"\\wsl.localhost\{}{}",
                    distro,
                    fwd.replace('/', "\\")
                ));
                if unc.is_dir() {
                    return Some(unc);
                }
            }
        }
        let win_candidate = if fwd.len() >= 4
            && fwd.as_bytes()[0] == b'/'
            && fwd.as_bytes()[1].is_ascii_alphabetic()
            && fwd.as_bytes()[2] == b':'
        {
            &trimmed[1..]
        } else {
            trimmed
        };
        let p = PathBuf::from(win_candidate);
        if p.is_dir() {
            return Some(p);
        }
        None
    }
    #[cfg(not(windows))]
    {
        let p = PathBuf::from(trimmed);
        if p.is_dir() {
            Some(p)
        } else {
            None
        }
    }
}

impl ClaudeTracker {
    fn new() -> Self {
        let past = Instant::now()
            .checked_sub(Duration::from_secs(10))
            .unwrap_or_else(Instant::now);
        Self {
            state: ClaudeState::None,
            claude_alive: false,
            osc_hint: None,
            pending_osc_cwd: None,
            last_output_at: past,
            last_enter_at: past,
            last_keystroke_at: past,
            first_seen_at: None,
            osc_scan: OscScanState::Normal,
            osc_buf: Vec::new(),
        }
    }

    fn handle_osc_payload(&mut self) {
        if let Some(raw_cwd) = self.osc_buf.strip_prefix(b"9;9;") {
            let text = String::from_utf8_lossy(raw_cwd);
            if let Some(p) = normalize_cwd_path(&text) {
                self.pending_osc_cwd = Some(p);
            }
            return;
        }

        if let Some(raw_uri) = self.osc_buf.strip_prefix(b"7;") {
            let uri = String::from_utf8_lossy(raw_uri);
            if let Some(after_scheme) = uri.trim().strip_prefix("file://") {
                if let Some(slash_idx) = after_scheme.find('/') {
                    let encoded_path = &after_scheme[slash_idx..];
                    let decoded = urlencoding::decode(encoded_path)
                        .map(|c| c.into_owned())
                        .unwrap_or_else(|_| encoded_path.to_string());
                    if let Some(p) = normalize_cwd_path(&decoded) {
                        self.pending_osc_cwd = Some(p);
                    }
                }
            }
            return;
        }

        let payload = self
            .osc_buf
            .strip_prefix(b"0;")
            .or_else(|| self.osc_buf.strip_prefix(b"2;"));
        let Some(raw_title) = payload else {
            return;
        };
        let title = String::from_utf8_lossy(raw_title);
        match title.trim_start().chars().next() {
            Some(c) if ('\u{2800}'..='\u{28FF}').contains(&c) => {
                // Claude Code animated braille spinner title while actively working
                self.osc_hint = Some(ClaudeState::Working);
            }
            Some('\u{2733}') => {
                // Claude Code '✳' title when idle / waiting for user response or approval
                self.osc_hint = Some(ClaudeState::Waiting);
            }
            Some(_) => {
                // Non-Claude title (e.g. bash/zsh prompt title after exiting Claude)
                self.osc_hint = None;
                #[cfg(windows)]
                if let Some((_, dir_part)) = title.rsplit_once(": ") {
                    let d = dir_part.trim();
                    if d.starts_with('/') || (d.len() >= 3 && d.as_bytes()[1] == b':') {
                        if let Some(p) = normalize_cwd_path(d) {
                            self.pending_osc_cwd = Some(p);
                        }
                    }
                }
            }
            None => {}
        }
    }

    fn ingest_output(&mut self, chunk: &[u8], now: Instant) {
        if chunk.is_empty() {
            return;
        }
        // Ignore tiny immediate keystroke echoes while user is typing at prompt so typing doesn't flip Waiting -> Working
        if chunk.len() > 24 || now.duration_since(self.last_keystroke_at) > Duration::from_millis(180) {
            self.last_output_at = now;
        }

        for &b in chunk {
            match self.osc_scan {
                OscScanState::Normal => {
                    if b == 0x1b {
                        self.osc_scan = OscScanState::SawEsc;
                    }
                }
                OscScanState::SawEsc => {
                    if b == b']' {
                        self.osc_scan = OscScanState::InOsc;
                        self.osc_buf.clear();
                    } else if b != 0x1b {
                        self.osc_scan = OscScanState::Normal;
                    }
                }
                OscScanState::InOsc => {
                    if b == 0x07 {
                        self.handle_osc_payload();
                        self.osc_buf.clear();
                        self.osc_scan = OscScanState::Normal;
                    } else if b == 0x1b {
                        self.osc_scan = OscScanState::InOscSawEsc;
                    } else if self.osc_buf.len() < 512 {
                        self.osc_buf.push(b);
                    } else {
                        self.osc_buf.clear();
                        self.osc_scan = OscScanState::Normal;
                    }
                }
                OscScanState::InOscSawEsc => {
                    if b == b'\\' {
                        self.handle_osc_payload();
                    }
                    self.osc_buf.clear();
                    self.osc_scan = OscScanState::Normal;
                }
            }
        }
    }

    fn ingest_input(&mut self, data: &[u8], now: Instant) {
        if data.contains(&b'\r') || data.contains(&b'\n') {
            self.last_enter_at = now;
            self.last_output_at = now;
            if self.claude_alive {
                self.osc_hint = Some(ClaudeState::Working);
            }
        } else if !data.is_empty() {
            self.last_keystroke_at = now;
        }
    }

    fn evaluate(&mut self, now: Instant) -> ClaudeState {
        if !self.claude_alive {
            self.first_seen_at = None;
            return ClaudeState::None;
        }

        let first_seen = *self.first_seen_at.get_or_insert(now);

        if now.duration_since(first_seen) < Duration::from_millis(1200)
            || now.duration_since(self.last_enter_at) < Duration::from_millis(1100)
        {
            return ClaudeState::Working;
        }

        if let Some(hint) = self.osc_hint {
            match hint {
                ClaudeState::Waiting => {
                    if now.duration_since(self.last_output_at) < Duration::from_millis(350) {
                        return ClaudeState::Working;
                    }
                    return ClaudeState::Waiting;
                }
                ClaudeState::Working => {
                    if now.duration_since(self.last_output_at) < Duration::from_millis(2500) {
                        return ClaudeState::Working;
                    }
                    return ClaudeState::Waiting;
                }
                ClaudeState::None => {}
            }
        }

        // Fallback when OSC titles are disabled: Claude's spinner writes every ~80-150ms while working
        if now.duration_since(self.last_output_at) < Duration::from_millis(950) {
            ClaudeState::Working
        } else {
            ClaudeState::Waiting
        }
    }
}

#[cfg(target_os = "linux")]
fn is_claude_process_match(pid: u32, comm: &str) -> bool {
    let comm_low = comm.to_ascii_lowercase();
    if comm_low == "claude" || comm_low.starts_with("claude-") {
        return true;
    }

    if let Ok(exe_path) = std::fs::read_link(format!("/proc/{}/exe", pid)) {
        let exe_str = exe_path.to_string_lossy();
        if exe_str.contains("/claude/versions/")
            || exe_path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.eq_ignore_ascii_case("claude"))
                .unwrap_or(false)
        {
            return true;
        }
    }

    if let Ok(cmdline_bytes) = std::fs::read(format!("/proc/{}/cmdline", pid)) {
        let mut args = cmdline_bytes.split(|&b| b == 0).filter(|s| !s.is_empty());
        if let Some(arg0_raw) = args.next() {
            let arg0 = String::from_utf8_lossy(arg0_raw);
            let base0 = arg0.rsplit('/').next().unwrap_or(&arg0);
            if base0.eq_ignore_ascii_case("claude")
                || arg0.contains("/claude/versions/")
                || arg0.contains("@anthropic-ai/claude-code")
            {
                return true;
            }
            if matches!(
                base0,
                "node" | "bun" | "python3" | "python" | "bash" | "sh" | "zsh"
            ) {
                if let Some(arg1_raw) = args.next() {
                    let arg1 = String::from_utf8_lossy(arg1_raw);
                    let base1 = arg1.rsplit('/').next().unwrap_or(&arg1);
                    if base1.eq_ignore_ascii_case("claude")
                        || arg1.contains("@anthropic-ai/claude-code")
                        || arg1.contains("/claude/versions/")
                    {
                        return true;
                    }
                }
            }
        }
    }
    false
}

#[cfg(target_os = "linux")]
fn build_proc_children_map(
    pid_cache: &mut HashMap<u32, (String, bool)>,
) -> HashMap<u32, Vec<(u32, bool)>> {
    let mut children_map: HashMap<u32, Vec<(u32, bool)>> = HashMap::new();
    let Ok(entries) = std::fs::read_dir("/proc") else {
        return children_map;
    };

    let mut live_pids = std::collections::HashSet::with_capacity(pid_cache.len().max(128));

    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name_str) = name.to_str() else {
            continue;
        };
        let Ok(pid) = name_str.parse::<u32>() else {
            continue;
        };

        let Ok(stat_raw) = std::fs::read_to_string(entry.path().join("stat")) else {
            continue;
        };
        let Some(open_paren) = stat_raw.find('(') else {
            continue;
        };
        let Some(close_paren) = stat_raw.rfind(')') else {
            continue;
        };
        if close_paren <= open_paren {
            continue;
        }
        let comm_slice = &stat_raw[open_paren + 1..close_paren];
        let after = stat_raw[close_paren + 1..].trim_start();
        let mut fields = after.split_whitespace();
        let _state = fields.next();
        let Some(ppid_str) = fields.next() else {
            continue;
        };
        let Ok(ppid) = ppid_str.parse::<u32>() else {
            continue;
        };

        live_pids.insert(pid);
        let is_claude = match pid_cache.get(&pid) {
            Some((cached_comm, cached_match)) if cached_comm == comm_slice => *cached_match,
            _ => {
                let matched = is_claude_process_match(pid, comm_slice);
                pid_cache.insert(pid, (comm_slice.to_string(), matched));
                matched
            }
        };

        children_map.entry(ppid).or_default().push((pid, is_claude));
    }

    pid_cache.retain(|pid, _| live_pids.contains(pid));
    children_map
}

#[cfg(target_os = "linux")]
fn has_claude_in_children_map(
    root_pid: u32,
    children_map: &HashMap<u32, Vec<(u32, bool)>>,
) -> bool {
    let mut queue = VecDeque::new();
    queue.push_back(root_pid);
    while let Some(cur) = queue.pop_front() {
        if let Some(kids) = children_map.get(&cur) {
            for &(kpid, is_claude) in kids {
                if is_claude {
                    return true;
                }
                queue.push_back(kpid);
            }
        }
    }
    false
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum PtyClientMsg {
    #[serde(rename = "input")]
    Input { data: String },
    #[serde(rename = "resize")]
    Resize { cols: u16, rows: u16 },
    #[serde(rename = "pause")]
    Pause { paused: bool },
}

#[derive(Clone, Default)]
pub struct TaskPtyEnv {
    pub id: Option<String>,
    pub code: Option<String>,
    pub name: Option<String>,
    pub url: Option<String>,
}

#[derive(Clone)]
enum PtyEvent {
    Output(Vec<u8>),
    ClaudeState(ClaudeState),
    CwdChanged(String),
    Exited,
}

pub struct PtySession {
    pub id: String,
    shell_pid: Option<u32>,
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    history: Mutex<VecDeque<u8>>,
    claude_tracker: Mutex<ClaudeTracker>,
    claude_alive_fast: AtomicBool,
    osc_in_progress: AtomicBool,
    current_cwd: Mutex<PathBuf>,
    last_dims: Mutex<(u16, u16)>,
    output_tx: broadcast::Sender<PtyEvent>,
    exited: AtomicBool,
}

impl PtySession {
    fn current_claude_state(&self) -> ClaudeState {
        self.claude_tracker
            .lock()
            .map(|t| t.state)
            .unwrap_or(ClaudeState::None)
    }

    fn current_cwd_string(&self) -> String {
        self.current_cwd
            .lock()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default()
    }

    fn update_cwd(&self, next_path: PathBuf) {
        if next_path.as_os_str().is_empty() {
            return;
        }
        let changed_str = if let Ok(mut guard) = self.current_cwd.lock() {
            if *guard == next_path {
                None
            } else {
                *guard = next_path.clone();
                Some(next_path.to_string_lossy().to_string())
            }
        } else {
            None
        };
        if let Some(s) = changed_str {
            let _ = self.output_tx.send(PtyEvent::CwdChanged(s));
        }
    }

    #[cfg(target_os = "linux")]
    fn refresh_cwd_from_proc(&self) {
        let Some(pid) = self.shell_pid else {
            return;
        };
        if let Ok(target) = std::fs::read_link(format!("/proc/{}/cwd", pid)) {
            if !target.to_string_lossy().ends_with(" (deleted)") {
                self.update_cwd(target);
            }
        }
    }

    fn on_output_chunk(&self, chunk: &[u8]) {
        // Fast path: when Claude is not running, no OSC scan is mid-stream, and chunk contains no ESC (0x1b),
        // skip locking claude_tracker completely on normal shell/vim output!
        if !self.claude_alive_fast.load(Ordering::Relaxed)
            && !self.osc_in_progress.load(Ordering::Relaxed)
            && !chunk.contains(&0x1b)
        {
            return;
        }
        let mut changed = None;
        let mut osc_cwd = None;
        if let Ok(mut tr) = self.claude_tracker.lock() {
            let now = Instant::now();
            tr.ingest_output(chunk, now);
            self.osc_in_progress
                .store(tr.osc_scan != OscScanState::Normal, Ordering::Relaxed);
            osc_cwd = tr.pending_osc_cwd.take();
            #[cfg(not(target_os = "linux"))]
            {
                let _ = self.shell_pid;
                tr.claude_alive = tr.osc_hint.is_some();
                self.claude_alive_fast
                    .store(tr.claude_alive, Ordering::Relaxed);
            }
            let next = tr.evaluate(now);
            if next != tr.state {
                tr.state = next;
                changed = Some(next);
            }
        }
        if let Some(cwd_path) = osc_cwd {
            self.update_cwd(cwd_path);
        }
        if let Some(next) = changed {
            let _ = self.output_tx.send(PtyEvent::ClaudeState(next));
        }
    }

    fn on_user_input(&self, data: &[u8]) {
        let has_enter = data.contains(&b'\r') || data.contains(&b'\n');
        // Fast path: if Claude is not running in this PTY and user didn't press Enter,
        // avoid locking claude_tracker on normal typing keystrokes (e.g. Vim, bash, zsh)!
        if !has_enter && !self.claude_alive_fast.load(Ordering::Relaxed) {
            return;
        }
        let mut changed = None;
        if let Ok(mut tr) = self.claude_tracker.lock() {
            let now = Instant::now();
            tr.ingest_input(data, now);
            let next = tr.evaluate(now);
            if next != tr.state {
                tr.state = next;
                changed = Some(next);
            }
        }
        if let Some(next) = changed {
            let _ = self.output_tx.send(PtyEvent::ClaudeState(next));
        }
    }

    #[cfg(target_os = "linux")]
    fn refresh_with_proc_map(&self, proc_map: Option<&HashMap<u32, Vec<(u32, bool)>>>) {
        let alive_update = proc_map.map(|m| {
            self.shell_pid
                .map(|pid| has_claude_in_children_map(pid, m))
                .unwrap_or(false)
        });
        if alive_update.is_none() && !self.claude_alive_fast.load(Ordering::Relaxed) {
            return;
        }
        let mut changed = None;
        if let Ok(mut tr) = self.claude_tracker.lock() {
            if let Some(alive) = alive_update {
                tr.claude_alive = alive;
                self.claude_alive_fast.store(alive, Ordering::Relaxed);
                if !alive {
                    tr.osc_hint = None;
                }
            }
            let next = tr.evaluate(Instant::now());
            if next != tr.state {
                tr.state = next;
                changed = Some(next);
            }
        }
        if let Some(next) = changed {
            let _ = self.output_tx.send(PtyEvent::ClaudeState(next));
        }
    }

    #[cfg(not(target_os = "linux"))]
    fn refresh_non_linux(&self) {
        let mut changed = None;
        if let Ok(mut tr) = self.claude_tracker.lock() {
            let _ = self.shell_pid;
            tr.claude_alive = tr.osc_hint.is_some();
            self.claude_alive_fast
                .store(tr.claude_alive, Ordering::Relaxed);
            let next = tr.evaluate(Instant::now());
            if next != tr.state {
                tr.state = next;
                changed = Some(next);
            }
        }
        if let Some(next) = changed {
            let _ = self.output_tx.send(PtyEvent::ClaudeState(next));
        }
    }

    fn nudge_sigwinch(&self) {
        let (cols, rows) = self
            .last_dims
            .lock()
            .map(|g| *g)
            .unwrap_or((90, 26));
        if let Ok(m) = self.master.lock() {
            let safe_rows = rows.max(2);
            let safe_cols = cols.max(4);
            let _ = m.resize(PtySize {
                rows: safe_rows,
                cols: safe_cols.saturating_add(1),
                pixel_width: 0,
                pixel_height: 0,
            });
            let _ = m.resize(PtySize {
                rows: safe_rows,
                cols: safe_cols,
                pixel_width: 0,
                pixel_height: 0,
            });
        }
    }
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<String, Arc<PtySession>>>,
    monitor_started: AtomicBool,
}

impl PtyManager {
    pub fn active_count(&self) -> usize {
        self.sessions
            .lock()
            .map(|m| m.values().filter(|s| !s.exited.load(Ordering::Relaxed)).count())
            .unwrap_or(0)
    }

    pub fn kill_session(&self, session_id: &str) -> bool {
        let removed = self
            .sessions
            .lock()
            .ok()
            .and_then(|mut map| map.remove(session_id));
        if let Some(sess) = removed {
            sess.exited.store(true, Ordering::SeqCst);
            if let Ok(mut ch) = sess.child.lock() {
                let _ = ch.kill();
                let _ = ch.wait();
            }
            return true;
        }
        false
    }

    pub fn kill_all(&self) {
        let all: Vec<Arc<PtySession>> = self
            .sessions
            .lock()
            .map(|mut map| map.drain().map(|(_, v)| v).collect())
            .unwrap_or_default();
        for sess in all {
            sess.exited.store(true, Ordering::SeqCst);
            if let Ok(mut ch) = sess.child.lock() {
                let _ = ch.kill();
                let _ = ch.wait();
            }
        }
    }

    fn get_or_create(
        self: &Arc<Self>,
        session_id: &str,
        cwd: PathBuf,
        cols: u16,
        rows: u16,
        task_env: TaskPtyEnv,
    ) -> Option<(Arc<PtySession>, bool)> {
        if let Ok(map) = self.sessions.lock() {
            if let Some(existing) = map.get(session_id) {
                if !existing.exited.load(Ordering::SeqCst) {
                    return Some((Arc::clone(existing), true));
                }
            }
        }

        let pty_system = native_pty_system();
        let size = PtySize {
            rows: rows.max(4),
            cols: cols.max(10),
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system.openpty(size).ok()?;
        let cmd = build_shell_command(&cwd, &task_env);
        let mut child = pair.slave.spawn_command(cmd).ok()?;
        let shell_pid = child.process_id();
        // Drop slave handle in parent so EOF triggers cleanly when shell exits
        drop(pair.slave);

        let mut reader = match pair.master.try_clone_reader() {
            Ok(r) => r,
            Err(_) => {
                let _ = child.kill();
                return None;
            }
        };
        let writer = match pair.master.take_writer() {
            Ok(w) => w,
            Err(_) => {
                let _ = child.kill();
                return None;
            }
        };

        let (output_tx, _) = broadcast::channel::<PtyEvent>(512);
        let session = Arc::new(PtySession {
            id: session_id.to_string(),
            shell_pid,
            writer: Mutex::new(writer),
            master: Mutex::new(pair.master),
            child: Mutex::new(child),
            history: Mutex::new(VecDeque::with_capacity(16384)),
            claude_tracker: Mutex::new(ClaudeTracker::new()),
            claude_alive_fast: AtomicBool::new(false),
            osc_in_progress: AtomicBool::new(false),
            current_cwd: Mutex::new(cwd),
            last_dims: Mutex::new((size.cols, size.rows)),
            output_tx,
            exited: AtomicBool::new(false),
        });

        if let Ok(mut map) = self.sessions.lock() {
            map.insert(session_id.to_string(), Arc::clone(&session));
        }

        // Start a single shared OS thread across ALL PTY sessions (zero Tokio worker impact)
        if !self.monitor_started.swap(true, Ordering::SeqCst) {
            let mgr_weak = Arc::downgrade(self);
            let _ = std::thread::Builder::new()
                .name("mdv-pty-mon".into())
                .spawn(move || {
                    let mut tick: u32 = 0;
                    #[cfg(target_os = "linux")]
                    let mut pid_cache: HashMap<u32, (String, bool)> = HashMap::with_capacity(256);
                    loop {
                        std::thread::sleep(Duration::from_millis(450));
                        let Some(mgr) = mgr_weak.upgrade() else {
                            break;
                        };
                        let active_sessions: Vec<Arc<PtySession>> = mgr
                            .sessions
                            .lock()
                            .map(|m| m.values().cloned().collect())
                            .unwrap_or_default();
                        if active_sessions.is_empty() {
                            continue;
                        }
                        #[cfg(target_os = "linux")]
                        {
                            // Scan /proc every ~1.35s (every 3rd tick) with per-PID match caching;
                            // on intermediate ticks only evaluate in-memory state for active Claude sessions.
                            let proc_map = if tick % 3 == 0 {
                                Some(build_proc_children_map(&mut pid_cache))
                            } else {
                                None
                            };
                            for sess in &active_sessions {
                                if !sess.exited.load(Ordering::Relaxed) {
                                    sess.refresh_cwd_from_proc();
                                    sess.refresh_with_proc_map(proc_map.as_ref());
                                }
                            }
                            tick = tick.wrapping_add(1);
                        }
                        #[cfg(not(target_os = "linux"))]
                        {
                            tick = tick.wrapping_add(1);
                            let _ = tick;
                            for sess in &active_sessions {
                                if !sess.exited.load(Ordering::Relaxed) {
                                    sess.refresh_non_linux();
                                }
                            }
                        }
                    }
                });
        }

        let sess_reader = Arc::clone(&session);
        let mgr_weak = Arc::downgrade(self);
        let sid_owned = session_id.to_string();
        let _ = std::thread::Builder::new()
            .name(format!("mdv-pty-{}", session_id))
            .spawn(move || {
                let mut buf = [0u8; 32768];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            let chunk = buf[..n].to_vec();
                            sess_reader.on_output_chunk(&chunk);
                            if let Ok(mut hist) = sess_reader.history.lock() {
                                let needed_drop = (hist.len() + chunk.len()).saturating_sub(MAX_HISTORY_BYTES);
                                if needed_drop > 0 {
                                    let drop_n = needed_drop.min(hist.len());
                                    hist.drain(..drop_n);
                                }
                                hist.extend(chunk.iter().copied());
                                let _ = sess_reader.output_tx.send(PtyEvent::Output(chunk));
                            }
                        }
                        Err(_) => break,
                    }
                }
                sess_reader.exited.store(true, Ordering::SeqCst);
                if let Some(mgr) = mgr_weak.upgrade() {
                    if let Ok(mut map) = mgr.sessions.lock() {
                        if map
                            .get(&sid_owned)
                            .map(|s| Arc::ptr_eq(s, &sess_reader))
                            .unwrap_or(false)
                        {
                            map.remove(&sid_owned);
                        }
                    }
                }
                if let Ok(mut ch) = sess_reader.child.lock() {
                    let _ = ch.wait();
                }
                let _ = sess_reader.output_tx.send(PtyEvent::Exited);
            });

        Some((session, false))
    }
}

fn apply_task_env(cmd: &mut CommandBuilder, task_env: &TaskPtyEnv) {
    let mut wsl_keys = Vec::new();
    if let Some(ref v) = task_env.id {
        if !v.is_empty() {
            cmd.env("CLICKUP_TASK_ID", v);
            wsl_keys.push("CLICKUP_TASK_ID");
        }
    }
    if let Some(ref v) = task_env.code {
        if !v.is_empty() {
            cmd.env("CLICKUP_TASK_CODE", v);
            wsl_keys.push("CLICKUP_TASK_CODE");
        }
    }
    if let Some(ref v) = task_env.name {
        if !v.is_empty() {
            cmd.env("CLICKUP_TASK_NAME", v);
            wsl_keys.push("CLICKUP_TASK_NAME");
        }
    }
    if let Some(ref v) = task_env.url {
        if !v.is_empty() {
            cmd.env("CLICKUP_TASK_URL", v);
            wsl_keys.push("CLICKUP_TASK_URL");
        }
    }
    #[cfg(windows)]
    if !wsl_keys.is_empty() {
        let joined = wsl_keys.join(":");
        let merged = match std::env::var("WSLENV") {
            Ok(existing) if !existing.is_empty() => format!("{}:{}", existing, joined),
            _ => joined,
        };
        cmd.env("WSLENV", merged);
    }
    #[cfg(not(windows))]
    let _ = wsl_keys;
}

#[cfg(windows)]
fn query_hkcu_reg_string(subkey_str: &str, value_str: &str) -> Option<String> {
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    const HKEY_CURRENT_USER: isize = (0x8000_0001u32 as i32) as isize;
    const KEY_READ: u32 = 0x20019;

    #[link(name = "advapi32")]
    extern "system" {
        fn RegOpenKeyExW(
            hkey: isize,
            lp_sub_key: *const u16,
            ul_options: u32,
            sam_desired: u32,
            phk_result: *mut isize,
        ) -> i32;
        fn RegQueryValueExW(
            hkey: isize,
            lp_value_name: *const u16,
            lp_reserved: *const u32,
            lp_type: *mut u32,
            lp_data: *mut u8,
            lpcb_data: *mut u32,
        ) -> i32;
        fn RegCloseKey(hkey: isize) -> i32;
    }

    let subkey: Vec<u16> = std::ffi::OsStr::new(subkey_str)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let val_name: Vec<u16> = std::ffi::OsStr::new(value_str)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let mut hkey: isize = 0;
        if RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut hkey) != 0 {
            return None;
        }
        let mut data_len: u32 = 0;
        if RegQueryValueExW(
            hkey,
            val_name.as_ptr(),
            std::ptr::null(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut data_len,
        ) != 0
            || data_len < 4
        {
            let _ = RegCloseKey(hkey);
            return None;
        }
        let mut buf: Vec<u16> = vec![0u16; (data_len as usize + 1) / 2];
        let status = RegQueryValueExW(
            hkey,
            val_name.as_ptr(),
            std::ptr::null(),
            std::ptr::null_mut(),
            buf.as_mut_ptr() as *mut u8,
            &mut data_len,
        );
        let _ = RegCloseKey(hkey);
        if status != 0 {
            return None;
        }
        let u16_len = (data_len as usize / 2).min(buf.len());
        let slice = &buf[..u16_len];
        let end = slice.iter().position(|&c| c == 0).unwrap_or(slice.len());
        let s = std::ffi::OsString::from_wide(&slice[..end])
            .to_string_lossy()
            .trim()
            .to_string();
        if s.is_empty() {
            None
        } else {
            Some(s)
        }
    }
}

#[cfg(windows)]
fn has_installed_wsl_distro() -> bool {
    query_hkcu_reg_string(
        r"Software\Microsoft\Windows\CurrentVersion\Lxss",
        "DefaultDistribution",
    )
    .is_some()
}

#[cfg(windows)]
fn default_wsl_distro_name() -> Option<String> {
    let guid = query_hkcu_reg_string(
        r"Software\Microsoft\Windows\CurrentVersion\Lxss",
        "DefaultDistribution",
    )?;
    query_hkcu_reg_string(
        &format!(r"Software\Microsoft\Windows\CurrentVersion\Lxss\{}", guid),
        "DistributionName",
    )
}

fn build_shell_command(cwd: &Path, task_env: &TaskPtyEnv) -> CommandBuilder {
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
        apply_task_env(&mut cmd, task_env);
        cmd
    }

    #[cfg(windows)]
    {
        let wsl_exe = Path::new(r"C:\Windows\System32\wsl.exe");
        if wsl_exe.exists() && has_installed_wsl_distro() {
            let mut cmd = CommandBuilder::new(wsl_exe);
            cmd.arg("--cd");
            cmd.arg(cwd.as_os_str());
            cmd.env("TERM", "xterm-256color");
            cmd.env("COLORTERM", "truecolor");
            apply_task_env(&mut cmd, task_env);
            return cmd;
        }
        let pwsh = Path::new(r"C:\Program Files\PowerShell\7\pwsh.exe");
        let shell = if pwsh.exists() {
            pwsh.to_string_lossy().to_string()
        } else {
            "powershell.exe".to_string()
        };
        let mut cmd = CommandBuilder::new(shell);
        cmd.args([
            "-NoLogo",
            "-NoExit",
            "-Command",
            "$__mdv_p = $function:prompt; function global:prompt { \"$([char]27)]9;9;$($executionContext.SessionState.Path.CurrentFileSystemLocation.ProviderPath)$([char]7)\" + (& $__mdv_p) }",
        ]);
        cmd.cwd(cwd);
        apply_task_env(&mut cmd, task_env);
        cmd
    }
}

pub async fn handle_pty_ws(
    socket: WebSocket,
    pty_mgr: Arc<PtyManager>,
    session_id: String,
    cwd: PathBuf,
    cols: u16,
    rows: u16,
    initial_paused: bool,
    task_env: TaskPtyEnv,
) {
    let Some((session, is_reattach)) = pty_mgr.get_or_create(&session_id, cwd, cols, rows, task_env) else {
        return;
    };

    if let Ok(mut d) = session.last_dims.lock() {
        *d = (cols.max(4), rows.max(2));
    }

    // Snapshot buffered history and subscribe atomically under history lock so zero bytes are missed/duplicated
    let (history_snapshot, mut out_rx) = {
        let guard = session.history.lock().unwrap();
        let snap: Vec<u8> = if is_reattach && !initial_paused {
            guard.iter().copied().collect()
        } else {
            Vec::new()
        };
        let rx = session.output_tx.subscribe();
        (snap, rx)
    };

    let (mut ws_sender, mut ws_receiver) = socket.split();

    let initial_claude_state = session.current_claude_state();
    let initial_cwd = session.current_cwd_string();
    let ready_msg = serde_json::json!({
        "type": "ready",
        "sessionId": session.id,
        "reattached": is_reattach,
        "claudeState": initial_claude_state.as_str(),
        "cwd": initial_cwd,
    })
    .to_string();

    if ws_sender.send(Message::Text(ready_msg)).await.is_err() {
        return;
    }

    if is_reattach && !initial_paused && !history_snapshot.is_empty() {
        if ws_sender.send(Message::Binary(history_snapshot)).await.is_err() {
            return;
        }
    }

    if is_reattach && !initial_paused {
        session.nudge_sigwinch();
    }

    let (pause_tx, mut pause_rx) = tokio::sync::watch::channel::<bool>(initial_paused);
    let sess_for_send = Arc::clone(&session);

    let send_task = tokio::spawn(async move {
        let mut is_paused = *pause_rx.borrow();
        let mut pending_claude_state: Option<ClaudeState> = None;
        let mut pending_cwd: Option<String> = None;

        loop {
            if let Some(st) = pending_claude_state.take() {
                let payload = serde_json::json!({
                    "type": "claude_state",
                    "state": st.as_str(),
                })
                .to_string();
                if ws_sender.send(Message::Text(payload)).await.is_err() {
                    break;
                }
            }
            if let Some(cwd_val) = pending_cwd.take() {
                let payload = serde_json::json!({
                    "type": "cwd",
                    "cwd": cwd_val,
                })
                .to_string();
                if ws_sender.send(Message::Text(payload)).await.is_err() {
                    break;
                }
            }

            tokio::select! {
                biased;

                changed = pause_rx.changed() => {
                    if changed.is_err() {
                        break;
                    }
                    let next_paused = *pause_rx.borrow_and_update();
                    if is_paused && !next_paused {
                        // Terminal just became visible again: atomically grab fresh ring-buffer snapshot
                        // and re-subscribe so the UI catches up instantaneously without having rendered in background!
                        let (snap, fresh_rx) = {
                            let guard = sess_for_send.history.lock().unwrap();
                            let s: Vec<u8> = guard.iter().copied().collect();
                            let rx = sess_for_send.output_tx.subscribe();
                            (s, rx)
                        };
                        out_rx = fresh_rx;
                        if ws_sender
                            .send(Message::Text(r#"{"type":"sync_reset"}"#.to_string()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                        if !snap.is_empty() && ws_sender.send(Message::Binary(snap)).await.is_err() {
                            break;
                        }
                        sess_for_send.nudge_sigwinch();
                    }
                    is_paused = next_paused;
                }

                ev = out_rx.recv() => {
                    match ev {
                        Ok(PtyEvent::Output(first_bytes)) => {
                            if is_paused {
                                continue;
                            }
                            // Zero-delay coalescing: drain any already-queued Output chunks up to 64 KiB
                            // into a single WebSocket binary frame (0ms added latency on single-key echo!).
                            let mut batch = first_bytes;
                            let mut saw_exit = false;
                            while batch.len() < 65_536 {
                                match out_rx.try_recv() {
                                    Ok(PtyEvent::Output(more)) => {
                                        batch.extend_from_slice(&more);
                                    }
                                    Ok(PtyEvent::ClaudeState(st)) => {
                                        pending_claude_state = Some(st);
                                    }
                                    Ok(PtyEvent::CwdChanged(cwd_val)) => {
                                        pending_cwd = Some(cwd_val);
                                    }
                                    Ok(PtyEvent::Exited) => {
                                        saw_exit = true;
                                        break;
                                    }
                                    Err(broadcast::error::TryRecvError::Lagged(_)) => continue,
                                    Err(broadcast::error::TryRecvError::Empty)
                                    | Err(broadcast::error::TryRecvError::Closed) => break,
                                }
                            }
                            if ws_sender.send(Message::Binary(batch)).await.is_err() {
                                break;
                            }
                            if saw_exit {
                                let _ = ws_sender
                                    .send(Message::Text(r#"{"type":"exit","code":0}"#.to_string()))
                                    .await;
                                let _ = ws_sender.close().await;
                                break;
                            }
                        }
                        Ok(PtyEvent::ClaudeState(st)) => {
                            let payload = serde_json::json!({
                                "type": "claude_state",
                                "state": st.as_str(),
                            })
                            .to_string();
                            if ws_sender.send(Message::Text(payload)).await.is_err() {
                                break;
                            }
                        }
                        Ok(PtyEvent::CwdChanged(cwd_val)) => {
                            let payload = serde_json::json!({
                                "type": "cwd",
                                "cwd": cwd_val,
                            })
                            .to_string();
                            if ws_sender.send(Message::Text(payload)).await.is_err() {
                                break;
                            }
                        }
                        Ok(PtyEvent::Exited) => {
                            let _ = ws_sender
                                .send(Message::Text(r#"{"type":"exit","code":0}"#.to_string()))
                                .await;
                            let _ = ws_sender.close().await;
                            break;
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => {
                            if !is_paused {
                                // Recover cleanly from extreme output burst (>16 MiB) by syncing latest ring buffer
                                let snap: Vec<u8> = sess_for_send
                                    .history
                                    .lock()
                                    .map(|g| g.iter().copied().collect())
                                    .unwrap_or_default();
                                if ws_sender
                                    .send(Message::Text(r#"{"type":"sync_reset"}"#.to_string()))
                                    .await
                                    .is_err()
                                {
                                    break;
                                }
                                if !snap.is_empty()
                                    && ws_sender.send(Message::Binary(snap)).await.is_err()
                                {
                                    break;
                                }
                            }
                        }
                        Err(broadcast::error::RecvError::Closed) => break,
                    }
                }
            }
        }
    });

    while let Some(Ok(msg)) = ws_receiver.next().await {
        match msg {
            Message::Binary(bin) => {
                if let Ok(mut w) = session.writer.lock() {
                    let _ = w.write_all(&bin);
                    let _ = w.flush();
                }
                session.on_user_input(&bin);
            }
            Message::Text(txt) => {
                if let Ok(parsed) = serde_json::from_str::<PtyClientMsg>(&txt) {
                    match parsed {
                        PtyClientMsg::Input { data } => {
                            let bytes = data.as_bytes();
                            if let Ok(mut w) = session.writer.lock() {
                                let _ = w.write_all(bytes);
                                let _ = w.flush();
                            }
                            session.on_user_input(bytes);
                        }
                        PtyClientMsg::Resize { cols, rows } => {
                            let safe_rows = rows.max(2);
                            let safe_cols = cols.max(4);
                            let changed = if let Ok(mut d) = session.last_dims.lock() {
                                if *d == (safe_cols, safe_rows) {
                                    false
                                } else {
                                    *d = (safe_cols, safe_rows);
                                    true
                                }
                            } else {
                                true
                            };
                            if changed {
                                if let Ok(m) = session.master.lock() {
                                    let _ = m.resize(PtySize {
                                        rows: safe_rows,
                                        cols: safe_cols,
                                        pixel_width: 0,
                                        pixel_height: 0,
                                    });
                                }
                            }
                        }
                        PtyClientMsg::Pause { paused } => {
                            let _ = pause_tx.send(paused);
                        }
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Disconnect WebSocket ONLY; keep the underlying PTY process alive in PtyManager!
    send_task.abort();
}
