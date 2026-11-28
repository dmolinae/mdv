use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TaskWorktreeInfo {
    pub repo: String,
    pub path: String,
}

#[derive(Clone, Debug)]
pub struct FileEntry {
    pub name: String,
    pub rel_path: String,
    pub full_path: String,
}

#[derive(Clone, Debug)]
pub enum TreeNode {
    File(FileEntry),
}

pub struct ScanResult {
    pub children: Vec<TreeNode>,
    pub files: Vec<FileEntry>,
}

fn is_ignored_dir_name(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "node_modules"
            | ".git"
            | ".hg"
            | ".svn"
            | "target"
            | "dist"
            | "build"
            | "out"
            | "coverage"
            | "vendor"
            | "__pycache__"
            | "venv"
            | ".venv"
            | ".next"
            | ".nuxt"
            | ".svelte-kit"
            | ".turbo"
            | ".cache"
            | ".cargo"
            | ".rustup"
            | ".npm"
            | ".npm-global"
            | ".nvm"
            | ".fnm"
            | ".volta"
            | ".bun"
            | ".deno"
            | ".pnpm-store"
            | ".yarn"
            | ".nuget"
            | ".dotnet"
            | ".gradle"
            | ".m2"
            | ".ivy2"
            | ".sbt"
            | ".conda"
            | ".anaconda"
            | "anaconda3"
            | "miniconda3"
            | ".pyenv"
            | ".rbenv"
            | ".asdf"
            | ".mise"
            | ".sdkman"
            | ".opam"
            | ".ghcup"
            | ".elan"
            | ".local"
            | ".mozilla"
            | ".thunderbird"
            | ".pki"
            | ".gnupg"
            | ".ssh"
            | ".dbus"
            | ".gvfs"
            | ".trash"
            | "$recycle.bin"
            | "system volume information"
            | ".cursor-server"
            | ".vscode-server"
            | ".vscode-remote"
            | ".antigravity-server"
            | ".oh-my-zsh"
            | "extensions"
            | "cacheddata"
            | "cachedextensionvsixs"
            | "code cache"
            | "gpucache"
            | "dawnwebgpucache"
            | "dawngraphitecache"
            | "cache"
            | "crashpad"
            | "blob_storage"
            | "session storage"
            | "local storage"
            | "indexeddb"
            | "service worker"
            | "shell-snapshots"
            | "statsig"
            | "telemetry"
            | "appdata"
            | "application data"
            | "local settings"
            | "cookies"
            | "nethood"
            | "printhood"
            | "recent"
            | "sendto"
            | "templates"
            | "3d objects"
            | "saved games"
            | "searches"
            | "contacts"
            | "links"
            | "favorites"
            | "microsoftedgebackups"
            | "onedrivetemp"
            | "tmp"
            | "log"
            | "storage"
            | "public"
            | "packs"
            | "worktrees"
            | ".worktrees"
            | "dumps"
            | "backups"
            | "bundle"
            | ".bundle"
            | "bower_components"
            | "postgres"
            | "pgdata"
            | ".terraform"
            | ".direnv"
            | "downloads"
            | "pictures"
            | "videos"
            | "music"
    )
}

pub fn clean_canonical_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    let repaired = {
        let raw_s = path.to_string_lossy();
        if let Some(unc_tail) = raw_s.strip_prefix(r"UNC\") {
            PathBuf::from(format!(r"\\{}", unc_tail))
        } else {
            path.to_path_buf()
        }
    };
    #[cfg(not(windows))]
    let repaired = path.to_path_buf();

    let canonical = repaired.canonicalize().unwrap_or(repaired);
    #[cfg(windows)]
    {
        let s = canonical.to_string_lossy();
        if let Some(unc_tail) = s.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{}", unc_tail));
        }
        if let Some(stripped) = s.strip_prefix(r"\\?\") {
            return PathBuf::from(stripped);
        }
    }
    canonical
}

pub fn escape_html_attr(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub fn normalize_rel_path(root: &Path, full: &Path) -> String {
    if let Ok(rel) = full.strip_prefix(root) {
        return rel.to_string_lossy().replace('\\', "/");
    }
    #[cfg(windows)]
    {
        let r_str = root.to_string_lossy().replace('\\', "/");
        let r_trim = r_str.trim_end_matches('/');
        let f_str = full.to_string_lossy().replace('\\', "/");
        if f_str.len() > r_trim.len()
            && f_str[..r_trim.len()].eq_ignore_ascii_case(r_trim)
            && f_str.as_bytes().get(r_trim.len()) == Some(&b'/')
        {
            return f_str[r_trim.len() + 1..].to_string();
        }
    }
    full.to_string_lossy().replace('\\', "/")
}

pub fn is_markdown_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

/// Level-order (BFS) Markdown workspace scanner so large directories like a user's personal folder
/// (`~` or `C:\Users\<user>`) ALWAYS discover shallow `.md` files and project folders first without
/// starving behind deep nested cache directories.
pub fn scan_markdown_workspace(root_dir: &Path, max_depth: usize, max_files: usize) -> ScanResult {
    use std::collections::VecDeque;

    let mut files = Vec::new();
    let mut visited_entries: usize = 0;
    const MAX_VISITED_ENTRIES: usize = 65_000;

    let mut seen_symlink_dirs: HashSet<PathBuf> = HashSet::new();
    let mut queue: VecDeque<(PathBuf, usize)> = VecDeque::new();
    queue.push_back((root_dir.to_path_buf(), 0));

    while let Some((current_dir, depth)) = queue.pop_front() {
        if depth > max_depth || files.len() >= max_files {
            break;
        }
        if depth > 0 && visited_entries >= MAX_VISITED_ENTRIES {
            break;
        }

        let Ok(read_dir) = fs::read_dir(&current_dir) else {
            continue;
        };

        let mut subdirs: Vec<(String, PathBuf)> = Vec::new();
        let mut md_files: Vec<(String, PathBuf)> = Vec::new();

        for entry in read_dir.flatten() {
            visited_entries += 1;
            if depth > 0 && visited_entries > MAX_VISITED_ENTRIES {
                break;
            }
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path();

            if file_type.is_dir() {
                if is_ignored_dir_name(&name) {
                    continue;
                }
                subdirs.push((name, path));
            } else if file_type.is_file() {
                if is_markdown_file(&name) {
                    md_files.push((name, path));
                }
            } else if file_type.is_symlink() {
                if is_markdown_file(&name) && path.is_file() {
                    md_files.push((name, path));
                } else if depth <= 2 && !is_ignored_dir_name(&name) && path.is_dir() {
                    let target = clean_canonical_path(&path);
                    if seen_symlink_dirs.insert(target) {
                        subdirs.push((name, path));
                    }
                }
            }
        }

        md_files.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
        for (f_name, f_path) in md_files {
            if files.len() >= max_files {
                break;
            }
            files.push(FileEntry {
                name: f_name,
                rel_path: normalize_rel_path(root_dir, &f_path),
                full_path: f_path.to_string_lossy().to_string(),
            });
        }

        if depth < max_depth && files.len() < max_files && visited_entries < MAX_VISITED_ENTRIES {
            // Visit regular folders before hidden dot-folders at the same depth so project folders
            // (`code/`, `Documents/`, `Desktop/`, `docs/`) get priority over deep `.config` trees.
            subdirs.sort_by(|a, b| {
                let a_dot = a.0.starts_with('.');
                let b_dot = b.0.starts_with('.');
                a_dot
                    .cmp(&b_dot)
                    .then_with(|| a.0.to_lowercase().cmp(&b.0.to_lowercase()))
            });
            for (_d_name, d_path) in subdirs {
                queue.push_back((d_path, depth + 1));
            }
        }
    }

    files.sort_by(|a, b| a.rel_path.to_lowercase().cmp(&b.rel_path.to_lowercase()));
    let children: Vec<TreeNode> = files.iter().cloned().map(TreeNode::File).collect();

    ScanResult { children, files }
}

pub fn render_tree_nodes_html(nodes: &[TreeNode], active_file_path: &str) -> String {
    fn flatten_files<'a>(nodes: &'a [TreeNode], acc: &mut Vec<&'a FileEntry>) {
        for n in nodes {
            match n {
                TreeNode::File(f) => acc.push(f),
            }
        }
    }

    fn render_file_li(f: &FileEntry, active_file_path: &str) -> String {
        let is_current = f.full_path == active_file_path;
        let cur_cls = if is_current { " is-current" } else { "" };
        let encoded = urlencoding::encode(&f.full_path);
        format!(
            r#"<li class="mdv-file-item{cur}" data-file-path="{full}" data-rel-path="{rel_lower}">
  <a href="/?file={encoded}" data-md-link title="{rel} (Alt+Clic abrir en nuevo Split)">
    <span class="mdv-file-label">{name}</span>
  </a>
  <button type="button" class="mdv-open-split-btn" data-open-in-split="{full}" title="Abrir en nuevo Split">
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75C0 1.784.784 1 1.75 1ZM1.5 2.75v10.5c0 .138.112.25.25.25h5.75v-11H1.75a.25.25 0 0 0-.25.25Zm7.25 10.75h5.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25h-5.5Z"/></svg>
  </button>
</li>"#,
            cur = cur_cls,
            full = escape_html_attr(&f.full_path),
            rel_lower = escape_html_attr(&f.rel_path.to_lowercase()),
            encoded = encoded,
            rel = escape_html_attr(&f.rel_path),
            name = escape_html_attr(&f.name),
        )
    }

    let mut all_files = Vec::new();
    flatten_files(nodes, &mut all_files);

    let mut root_files: Vec<&FileEntry> = Vec::new();
    let mut groups: std::collections::BTreeMap<String, (String, Vec<&FileEntry>)> =
        std::collections::BTreeMap::new();

    for f in all_files {
        if let Some((dir_rel, _)) = f.rel_path.rsplit_once('/') {
            let key = dir_rel.to_lowercase();
            groups
                .entry(key)
                .or_insert_with(|| (dir_rel.to_string(), Vec::new()))
                .1
                .push(f);
        } else {
            root_files.push(f);
        }
    }

    root_files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    let mut out = String::new();
    for f in &root_files {
        out.push_str(&render_file_li(f, active_file_path));
    }

    let total_groups = groups.len();
    for (_, (dir_rel, mut group_files)) in groups {
        group_files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        let contains_active = group_files.iter().any(|f| f.full_path == active_file_path);
        let open_attr = if contains_active || total_groups <= 14 {
            " open"
        } else {
            ""
        };

        let (prefix_html, leaf_name) = match dir_rel.rsplit_once('/') {
            Some((parent, leaf)) => (
                format!(
                    r#"<span class="mdv-folder-prefix">{}/</span>"#,
                    escape_html_attr(parent)
                ),
                escape_html_attr(leaf),
            ),
            None => (String::new(), escape_html_attr(&dir_rel)),
        };

        let mut inner = String::new();
        for f in &group_files {
            inner.push_str(&render_file_li(f, active_file_path));
        }

        out.push_str(&format!(
            r#"<li class="mdv-tree-dir mdv-file-group" data-dir-path="{rel}">
  <details class="mdv-folder-details"{open}>
    <summary class="mdv-folder-summary" title="{rel}">
      <svg class="mdv-chevron" viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 4 4-4 4"/></svg>
      <span class="mdv-folder-path">{prefix}<span class="mdv-folder-leaf">{leaf}</span></span>
      <span class="mdv-folder-count">{count}</span>
    </summary>
    <ul class="mdv-group-files">{inner}</ul>
  </details>
</li>"#,
            rel = escape_html_attr(&dir_rel),
            open = open_attr,
            prefix = prefix_html,
            leaf = leaf_name,
            count = group_files.len(),
            inner = inner,
        ));
    }

    out
}

pub fn pick_default_markdown_file(files: &[FileEntry], root_dir: &Path) -> Option<PathBuf> {
    if files.is_empty() {
        return None;
    }
    if let Some(root_readme) = files.iter().find(|f| {
        Path::new(&f.full_path).parent() == Some(root_dir)
            && (f.name.eq_ignore_ascii_case("readme.md") || f.name.eq_ignore_ascii_case("readme.markdown"))
    }) {
        return Some(PathBuf::from(&root_readme.full_path));
    }
    if let Some(root_md) = files
        .iter()
        .find(|f| Path::new(&f.full_path).parent() == Some(root_dir))
    {
        return Some(PathBuf::from(&root_md.full_path));
    }
    if let Some(any_readme) = files
        .iter()
        .filter(|f| f.name.eq_ignore_ascii_case("readme.md") || f.name.eq_ignore_ascii_case("readme.markdown"))
        .min_by_key(|f| f.rel_path.matches('/').count())
    {
        return Some(PathBuf::from(&any_readme.full_path));
    }
    Some(PathBuf::from(&files[0].full_path))
}

fn contains_exact_task_code(haystack: &str, code_upper: &str) -> bool {
    let hay_up = haystack.to_ascii_uppercase();
    let bytes = hay_up.as_bytes();
    let needle = code_upper.as_bytes();
    if needle.is_empty() || bytes.len() < needle.len() {
        return false;
    }

    let mut start = 0usize;
    while let Some(rel_idx) = hay_up[start..].find(code_upper) {
        let idx = start + rel_idx;
        let end = idx + needle.len();
        let before_ok = idx == 0 || !bytes[idx - 1].is_ascii_alphanumeric();
        let after_ok = end == bytes.len() || !bytes[end].is_ascii_digit();
        if before_ok && after_ok {
            return true;
        }
        start = idx + 1;
    }
    false
}

fn inspect_git_worktrees_dir(
    git_worktrees_dir: &Path,
    repo_fallback: &str,
    codes_upper: &[String],
    out: &mut HashMap<String, Vec<(String, PathBuf)>>,
) {
    let Ok(entries) = fs::read_dir(git_worktrees_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let wt_meta_dir = entry.path();
        let Ok(gitdir_raw) = fs::read_to_string(wt_meta_dir.join("gitdir")) else {
            continue;
        };
        let trimmed = gitdir_raw.trim();
        let wt_root = Path::new(trimmed)
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from(trimmed));
        if !wt_root.is_dir() {
            continue;
        }
        let head_raw = fs::read_to_string(wt_meta_dir.join("HEAD")).unwrap_or_default();
        let wt_path_str = wt_root.to_string_lossy();

        let repo_name = if !repo_fallback.is_empty() {
            repo_fallback.to_string()
        } else {
            wt_root
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "worktree".to_string())
        };

        for code in codes_upper {
            if contains_exact_task_code(&wt_path_str, code)
                || contains_exact_task_code(head_raw.trim(), code)
            {
                out.entry(code.clone())
                    .or_default()
                    .push((repo_name.clone(), wt_root.clone()));
            }
        }
    }
}

pub fn discover_worktrees_for_codes(
    workspace_dir: &Path,
    raw_codes: &[String],
) -> HashMap<String, Vec<TaskWorktreeInfo>> {
    let codes_upper: Vec<String> = raw_codes
        .iter()
        .map(|c| c.trim().trim_start_matches('#').to_ascii_uppercase())
        .filter(|c| c.len() >= 3 && c.len() <= 48)
        .collect();

    if codes_upper.is_empty() {
        return HashMap::new();
    }

    let mut base_roots: Vec<PathBuf> = Vec::new();
    let mut push_root = |p: PathBuf| {
        if p.is_dir() {
            let canon = p.canonicalize().unwrap_or(p);
            if !base_roots.contains(&canon) {
                base_roots.push(canon);
            }
        }
    };

    push_root(workspace_dir.to_path_buf());
    if let Some(parent) = workspace_dir.parent() {
        push_root(parent.to_path_buf());
    }
    if let Some(home) = dirs::home_dir() {
        push_root(home.join("Fintree"));
    }

    let mut raw_matches: HashMap<String, Vec<(String, PathBuf)>> = HashMap::new();

    for root in &base_roots {
        // 1. Check `<root>/work/tasks/<TASK>*/worktrees/<repo>`
        let tasks_dir = root.join("work").join("tasks");
        if let Ok(task_entries) = fs::read_dir(&tasks_dir) {
            for t_entry in task_entries.flatten() {
                if !t_entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    continue;
                }
                let folder_name = t_entry.file_name().to_string_lossy().to_string();
                let matching_codes: Vec<&String> = codes_upper
                    .iter()
                    .filter(|code| contains_exact_task_code(&folder_name, code))
                    .collect();
                if matching_codes.is_empty() {
                    continue;
                }

                let t_path = t_entry.path();
                let wt_container = t_path.join("worktrees");
                if let Ok(wt_entries) = fs::read_dir(&wt_container) {
                    for wt_entry in wt_entries.flatten() {
                        let p = wt_entry.path();
                        if p.is_dir() {
                            let repo_name = wt_entry.file_name().to_string_lossy().to_string();
                            for &code in &matching_codes {
                                raw_matches
                                    .entry(code.clone())
                                    .or_default()
                                    .push((repo_name.clone(), p.clone()));
                            }
                        }
                    }
                } else if let Ok(sub_entries) = fs::read_dir(&t_path) {
                    for sub_entry in sub_entries.flatten() {
                        let p = sub_entry.path();
                        if p.is_dir() && p.join(".git").exists() {
                            let repo_name = sub_entry.file_name().to_string_lossy().to_string();
                            for &code in &matching_codes {
                                raw_matches
                                    .entry(code.clone())
                                    .or_default()
                                    .push((repo_name.clone(), p.clone()));
                            }
                        }
                    }
                }
            }
        }

        // 2. Check `<root>/.git/worktrees/*` and `<root>/<repo>/.git/worktrees/*`
        let root_name = root
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let direct_wt = root.join(".git").join("worktrees");
        if direct_wt.is_dir() {
            inspect_git_worktrees_dir(&direct_wt, &root_name, &codes_upper, &mut raw_matches);
        }

        if let Ok(children) = fs::read_dir(root) {
            for child in children.flatten().take(60) {
                if !child.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    continue;
                }
                let child_name = child.file_name().to_string_lossy().to_string();
                if child_name.starts_with('.') || child_name == "work" {
                    continue;
                }
                let sub_wt = child.path().join(".git").join("worktrees");
                if sub_wt.is_dir() {
                    inspect_git_worktrees_dir(&sub_wt, &child_name, &codes_upper, &mut raw_matches);
                }
            }
        }
    }

    let mut result: HashMap<String, Vec<TaskWorktreeInfo>> = HashMap::new();
    for (code, items) in raw_matches {
        let mut seen_paths = HashSet::new();
        let mut list = Vec::new();
        for (repo, path) in items {
            let canon = clean_canonical_path(&path);
            let path_str = canon.to_string_lossy().to_string();
            if seen_paths.insert(path_str.clone()) {
                list.push(TaskWorktreeInfo {
                    repo,
                    path: path_str,
                });
            }
        }
        if !list.is_empty() {
            list.sort_by(|a, b| a.repo.to_lowercase().cmp(&b.repo.to_lowercase()));
            result.insert(code, list);
        }
    }

    result
}
