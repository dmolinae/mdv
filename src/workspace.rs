use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug)]
pub struct FileEntry {
    pub name: String,
    pub rel_path: String,
    pub full_path: String,
}

#[derive(Clone, Debug)]
pub enum TreeNode {
    Dir {
        name: String,
        rel_path: String,
        full_path: String,
        count: usize,
        children: Vec<TreeNode>,
    },
    File(FileEntry),
}

pub struct ScanResult {
    pub children: Vec<TreeNode>,
    pub files: Vec<FileEntry>,
}

fn ignored_dirs() -> HashSet<&'static str> {
    HashSet::from([
        "node_modules",
        ".git",
        ".hg",
        ".svn",
        "target",
        "dist",
        "build",
        "out",
        "coverage",
        "vendor",
        "__pycache__",
        "venv",
        ".venv",
        ".next",
        ".nuxt",
        ".svelte-kit",
        ".turbo",
        ".cache",
        ".cargo",
        ".rustup",
        ".npm",
        ".npm-global",
        ".local",
        ".claude",
        ".gemini",
        ".cursor-server",
        ".antigravity-server",
        ".oh-my-zsh",
        "AppData",
    ])
}

pub fn escape_html_attr(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub fn normalize_rel_path(root: &Path, full: &Path) -> String {
    full.strip_prefix(root)
        .unwrap_or(full)
        .to_string_lossy()
        .replace('\\', "/")
}

pub fn is_markdown_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

pub fn scan_markdown_workspace(root_dir: &Path, max_depth: usize, max_files: usize) -> ScanResult {
    let ignored = ignored_dirs();
    let mut files = Vec::new();

    fn walk(
        current_dir: &Path,
        root_dir: &Path,
        depth: usize,
        max_depth: usize,
        max_files: usize,
        ignored: &HashSet<&str>,
        files: &mut Vec<FileEntry>,
    ) -> Option<(usize, Vec<TreeNode>)> {
        if depth > max_depth || files.len() >= max_files {
            return None;
        }
        let read_dir = fs::read_dir(current_dir).ok()?;
        let mut dirs = Vec::new();
        let mut md_files = Vec::new();

        for entry in read_dir.flatten() {
            let file_type = match entry.file_type() {
                Ok(ft) => ft,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().to_string();
            if file_type.is_dir() {
                if name.starts_with('.') || ignored.contains(name.as_str()) {
                    continue;
                }
                dirs.push((name, entry.path()));
            } else if file_type.is_file() && is_markdown_file(&name) {
                md_files.push((name, entry.path()));
            }
        }

        dirs.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
        md_files.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));

        let mut children = Vec::new();
        let mut count = 0usize;

        for (d_name, d_path) in dirs {
            if files.len() >= max_files {
                break;
            }
            if let Some((sub_count, sub_children)) =
                walk(&d_path, root_dir, depth + 1, max_depth, max_files, ignored, files)
            {
                if sub_count > 0 {
                    count += sub_count;
                    children.push(TreeNode::Dir {
                        name: d_name,
                        rel_path: normalize_rel_path(root_dir, &d_path),
                        full_path: d_path.to_string_lossy().to_string(),
                        count: sub_count,
                        children: sub_children,
                    });
                }
            }
        }

        for (f_name, f_path) in md_files {
            if files.len() >= max_files {
                break;
            }
            let entry = FileEntry {
                name: f_name,
                rel_path: normalize_rel_path(root_dir, &f_path),
                full_path: f_path.to_string_lossy().to_string(),
            };
            files.push(entry.clone());
            children.push(TreeNode::File(entry));
            count += 1;
        }

        Some((count, children))
    }

    let children = walk(root_dir, root_dir, 0, max_depth, max_files, &ignored, &mut files)
        .map(|(_, c)| c)
        .unwrap_or_default();

    ScanResult { children, files }
}

pub fn render_tree_nodes_html(nodes: &[TreeNode], active_file_path: &str) -> String {
    let mut out = String::new();
    let sep = std::path::MAIN_SEPARATOR;

    for node in nodes {
        match node {
            TreeNode::Dir {
                name,
                rel_path,
                full_path,
                count,
                children,
            } => {
                let prefix_with_sep = format!("{}{}", full_path, sep);
                let contains_active =
                    active_file_path == full_path || active_file_path.starts_with(&prefix_with_sep);
                let open_attr = if contains_active || nodes.len() <= 6 {
                    " open"
                } else {
                    ""
                };
                let inner = render_tree_nodes_html(children, active_file_path);
                out.push_str(&format!(
                    r#"<li class="mdv-tree-dir" data-dir-path="{rel}">
  <details class="mdv-folder-details"{open}>
    <summary class="mdv-folder-summary">
      <svg class="mdv-chevron" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 4 4-4 4"/></svg>
      <svg class="mdv-folder-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>
      <span class="mdv-folder-name">{name}</span>
      <span class="mdv-folder-count">{count}</span>
    </summary>
    <ul class="mdv-tree-children">{inner}</ul>
  </details>
</li>"#,
                    rel = escape_html_attr(rel_path),
                    open = open_attr,
                    name = escape_html_attr(name),
                    count = count,
                    inner = inner
                ));
            }
            TreeNode::File(f) => {
                let is_current = f.full_path == active_file_path;
                let cur_cls = if is_current { " is-current" } else { "" };
                let encoded = urlencoding::encode(&f.full_path);
                out.push_str(&format!(
                    r#"<li class="mdv-file-item{cur}" data-file-path="{full}" data-rel-path="{rel_lower}">
  <a href="/?file={encoded}" data-md-link title="{rel} (Alt+Clic abrir en nuevo Split)">
    <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" style="flex-shrink:0;opacity:0.72"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688Z"/></svg>
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
                ));
            }
        }
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
