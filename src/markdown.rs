use pulldown_cmark::{html, CodeBlockKind, Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use regex::Regex;
use serde::Serialize;
use std::cell::Cell;
use std::collections::HashMap;
use std::path::Path;
use std::sync::OnceLock;

#[derive(Clone, Debug, Serialize)]
pub struct TocItem {
    pub id: String,
    pub text: String,
    pub level: u8,
}

#[derive(Clone, Debug, Serialize)]
pub struct RenderedDocument {
    pub html: String,
    pub toc: Vec<TocItem>,
    pub title: Option<String>,
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn strip_html_tags(s: &str) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"<[^>]+>").unwrap());
    re.replace_all(s, "").to_string()
}

fn slugify(text: &str, seen: &mut HashMap<String, usize>) -> String {
    let clean = strip_html_tags(text).to_lowercase();
    let mut base = String::new();
    let mut prev_dash = false;
    for ch in clean.chars() {
        if ch.is_alphanumeric() {
            base.push(ch);
            prev_dash = false;
        } else if (ch.is_whitespace() || ch == '-' || ch == '_') && !prev_dash && !base.is_empty() {
            base.push('-');
            prev_dash = true;
        }
    }
    let base = base.trim_matches('-').to_string();
    let base = if base.is_empty() {
        "section".to_string()
    } else {
        base
    };
    let count = seen.entry(base.clone()).or_insert(0);
    let slug = if *count == 0 {
        base
    } else {
        format!("{}-{}", base, *count)
    };
    *count += 1;
    slug
}

fn extract_frontmatter(md: &str) -> (&str, Vec<(String, String)>) {
    static FM_RE: OnceLock<Regex> = OnceLock::new();
    let re = FM_RE.get_or_init(|| Regex::new(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n").unwrap());
    if let Some(caps) = re.captures(md) {
        let full = caps.get(0).unwrap();
        let body = caps.get(1).unwrap().as_str();
        let mut entries = Vec::new();
        for line in body.lines() {
            if let Some((k, v)) = line.split_once(':') {
                let key = k.trim();
                let val = v.trim().trim_matches(|c| c == '"' || c == '\'');
                if !key.is_empty()
                    && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
                    && !val.is_empty()
                {
                    entries.push((key.to_string(), val.to_string()));
                }
            }
        }
        if !entries.is_empty() {
            return (&md[full.end()..], entries);
        }
    }
    (md, Vec::new())
}

fn alert_meta(kind: &str) -> (&'static str, &'static str) {
    match kind {
        "TIP" => (
            "Tip",
            r#"<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"/></svg>"#,
        ),
        "IMPORTANT" => (
            "Importante",
            r#"<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>"#,
        ),
        "WARNING" => (
            "Advertencia",
            r#"<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>"#,
        ),
        "CAUTION" => (
            "Precaución",
            r#"<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>"#,
        ),
        _ => (
            "Nota",
            r#"<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>"#,
        ),
    }
}

/// Pre-processes ````carousel blocks AND GitHub/Antigravity `> [!NOTE]` blockquotes outside code fences,
/// returning placeholders mapped to rendered HTML.
fn extract_blocks_outside_fences<F>(
    md: &str,
    mut render_nested: F,
    carousel_seq: &Cell<usize>,
) -> (String, HashMap<String, String>)
where
    F: FnMut(&str) -> String,
{
    static FENCE_RE: OnceLock<Regex> = OnceLock::new();
    static ALERT_START_RE: OnceLock<Regex> = OnceLock::new();

    let fence_re = FENCE_RE.get_or_init(|| Regex::new(r"^(\s*)(`{3,}|~{3,})\s*([^\s`~]*)(.*)$").unwrap());
    let alert_re = ALERT_START_RE.get_or_init(|| {
        Regex::new(r"(?i)^\s*>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]+(.*))?$").unwrap()
    });

    let lines: Vec<&str> = md.lines().collect();
    let mut out_lines = Vec::new();
    let mut placeholders = HashMap::new();
    let mut i = 0;

    while i < lines.len() {
        if let Some(caps) = fence_re.captures(lines[i]) {
            let indent = caps.get(1).unwrap().as_str();
            let fence = caps.get(2).unwrap().as_str();
            let fence_char = fence.chars().next().unwrap();
            let fence_len = fence.len();
            let info = caps.get(3).unwrap().as_str().to_ascii_lowercase();

            if info == "carousel" {
                let mut body_lines = Vec::new();
                i += 1;
                while i < lines.len() {
                    let trimmed = lines[i].trim();
                    if trimmed.len() >= fence_len && trimmed.chars().all(|c| c == fence_char) {
                        i += 1;
                        break;
                    }
                    body_lines.push(lines[i]);
                    i += 1;
                }
                let cid = carousel_seq.get() + 1;
                carousel_seq.set(cid);
                let slides = split_carousel_slides(&body_lines.join("\n"));
                let html = build_carousel_html(&slides, &mut render_nested, cid);
                let token = format!("@@MDV_BLOCK_{}@@", placeholders.len());
                placeholders.insert(token.clone(), html);
                out_lines.push(format!("{}\n{}\n", indent, token));
                continue;
            } else {
                // Regular code fence: pass through verbatim
                out_lines.push(lines[i].to_string());
                i += 1;
                while i < lines.len() {
                    out_lines.push(lines[i].to_string());
                    let trimmed = lines[i].trim();
                    i += 1;
                    if trimmed.len() >= fence_len && trimmed.chars().all(|c| c == fence_char) {
                        break;
                    }
                }
                continue;
            }
        }

        // Check GitHub / Antigravity Alert blockquote: > [!NOTE] ...
        if let Some(caps) = alert_re.captures(lines[i]) {
            let kind = caps.get(1).unwrap().as_str().to_ascii_uppercase();
            let first_inline = caps.get(2).map(|m| m.as_str().trim()).unwrap_or("");
            let mut body_parts = Vec::new();
            if !first_inline.is_empty() {
                body_parts.push(first_inline.to_string());
            }
            i += 1;
            while i < lines.len() {
                let l = lines[i].trim_start();
                if let Some(stripped) = l.strip_prefix('>') {
                    let s = stripped.strip_prefix(' ').unwrap_or(stripped);
                    body_parts.push(s.to_string());
                    i += 1;
                } else {
                    break;
                }
            }
            let (label, icon) = alert_meta(&kind);
            let combined_md = body_parts.join("\n");
            let body_html = if combined_md.trim().is_empty() {
                String::new()
            } else {
                format!(r#"<div class="mdv-alert-body">{}</div>"#, render_nested(&combined_md))
            };
            let alert_html = format!(
                r#"<div class="mdv-alert mdv-alert-{kind_lc}" role="note"><div class="mdv-alert-title">{icon}<span>{label}</span></div>{body}</div>"#,
                kind_lc = kind.to_ascii_lowercase(),
                icon = icon,
                label = label,
                body = body_html
            );
            let token = format!("@@MDV_BLOCK_{}@@", placeholders.len());
            placeholders.insert(token.clone(), alert_html);
            out_lines.push(format!("\n{}\n", token));
            continue;
        }

        out_lines.push(lines[i].to_string());
        i += 1;
    }

    (out_lines.join("\n"), placeholders)
}

fn split_carousel_slides(raw_body: &str) -> Vec<(Option<String>, String)> {
    static SLIDE_RE: OnceLock<Regex> = OnceLock::new();
    let re = SLIDE_RE.get_or_init(|| Regex::new(r"(?i)<!--\s*slide(?:\s*:\s*([\s\S]*?))?\s*-->").unwrap());

    let mut slides = Vec::new();
    let mut last_idx = 0usize;
    let mut current_title: Option<String> = None;

    for caps in re.captures_iter(raw_body) {
        let m = caps.get(0).unwrap();
        let chunk = raw_body[last_idx..m.start()].trim();
        if !chunk.is_empty() || current_title.is_some() {
            slides.push((current_title.take(), chunk.to_string()));
        }
        current_title = caps.get(1).map(|c| c.as_str().trim().to_string()).filter(|s| !s.is_empty());
        last_idx = m.end();
    }

    let tail = raw_body[last_idx..].trim();
    if !tail.is_empty() || current_title.is_some() || slides.is_empty() {
        slides.push((current_title, tail.to_string()));
    }
    slides
}

fn build_carousel_html<F>(slides: &[(Option<String>, String)], render_nested: &mut F, cid: usize) -> String
where
    F: FnMut(&str) -> String,
{
    let total = slides.len();
    let mut slides_html = String::new();
    let mut dots_html = String::new();

    for (idx, (title, content)) in slides.iter().enumerate() {
        let active_cls = if idx == 0 { " is-active" } else { "" };
        let aria_hidden = if idx == 0 { "false" } else { "true" };
        let title_badge = match title {
            Some(t) => format!(r#"<div class="mdv-slide-label">{}</div>"#, escape_html(t)),
            None => String::new(),
        };
        let rendered = render_nested(content);
        slides_html.push_str(&format!(
            r#"<section class="mdv-carousel-slide{active_cls}" data-slide-index="{idx}" aria-hidden="{aria_hidden}">{title_badge}<div class="mdv-slide-body">{rendered}</div></section>"#
        ));

        let dot_title = title
            .as_deref()
            .map(escape_html)
            .unwrap_or_else(|| format!("Vista {}", idx + 1));
        dots_html.push_str(&format!(
            r#"<button type="button" class="mdv-carousel-dot{active_cls}" data-slide-to="{idx}" aria-label="Ir a diapositiva {n}" title="{dot_title}"></button>"#,
            n = idx + 1
        ));
    }

    let disabled = if total <= 1 { " disabled" } else { "" };
    let footer = if total > 1 {
        format!(
            r#"<div class="mdv-carousel-footer"><div class="mdv-carousel-dots">{dots_html}</div><span class="mdv-carousel-hint">Usa h / l o haz clic para navegar</span></div>"#
        )
    } else {
        String::new()
    };

    format!(
        r#"<div class="mdv-carousel" data-carousel data-carousel-id="{cid}" tabindex="0" role="region" aria-label="Carrusel de contenido">
  <div class="mdv-carousel-header">
    <div class="mdv-carousel-badge">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M2 3.75C2 2.784 2.784 2 3.75 2h8.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25Zm1.75-.25a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25Z"/></svg>
      <span>Carrusel</span>
    </div>
    <div class="mdv-carousel-controls">
      <span class="mdv-carousel-counter"><strong data-carousel-current>1</strong> / {total}</span>
      <div class="mdv-carousel-nav-group">
        <button type="button" class="mdv-carousel-btn" data-carousel-prev aria-label="Anterior" title="Anterior (h)"{disabled}>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12.5 5.5 8 10 3.5"/></svg>
        </button>
        <button type="button" class="mdv-carousel-btn" data-carousel-next aria-label="Siguiente" title="Siguiente (l)"{disabled}>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5 10.5 8 6 12.5"/></svg>
        </button>
      </div>
    </div>
  </div>
  <div class="mdv-carousel-viewport">{slides_html}</div>
  {footer}
</div>"#
    )
}

/// Protects code fences & inline code spans while converting `$$...$$` and `$...$` into KaTeX placeholders.
fn extract_math_outside_code(md: &str, placeholders: &mut HashMap<String, String>) -> String {
    static FENCE_LINE_RE: OnceLock<Regex> = OnceLock::new();
    static INLINE_CODE_RE: OnceLock<Regex> = OnceLock::new();
    static DISPLAY_MATH_RE: OnceLock<Regex> = OnceLock::new();
    static INLINE_MATH_RE: OnceLock<Regex> = OnceLock::new();

    let fence_line_re = FENCE_LINE_RE.get_or_init(|| Regex::new(r"^\s*(`{3,}|~{3,})").unwrap());
    let code_re = INLINE_CODE_RE.get_or_init(|| Regex::new(r"`+[^`\n]+`+").unwrap());
    let dmath_re = DISPLAY_MATH_RE.get_or_init(|| Regex::new(r"\$\$([\s\S]+?)\$\$").unwrap());
    let imath_re = INLINE_MATH_RE.get_or_init(|| Regex::new(r"(^|[^\\$\w])\$([^\s$](?:[^\n$]*?[^\s$\\])?)\$").unwrap());

    let mut code_stash: Vec<(String, String)> = Vec::new();
    let mut stash_fn = |s: &str| -> String {
        let key = format!("@@MDV_CODE_STASH_{}@@", code_stash.len());
        code_stash.push((key.clone(), s.to_string()));
        key
    };

    // Stash fenced code blocks deterministically line-by-line
    let lines: Vec<&str> = md.lines().collect();
    let mut stashed_lines = Vec::with_capacity(lines.len());
    let mut i = 0;
    while i < lines.len() {
        if let Some(caps) = fence_line_re.captures(lines[i]) {
            let fence = caps.get(1).unwrap().as_str();
            let fch = fence.chars().next().unwrap();
            let flen = fence.len();
            let mut block = Vec::new();
            block.push(lines[i]);
            i += 1;
            while i < lines.len() {
                block.push(lines[i]);
                let tr = lines[i].trim();
                i += 1;
                if tr.len() >= flen && tr.chars().all(|c| c == fch) {
                    break;
                }
            }
            stashed_lines.push(stash_fn(&block.join("\n")));
        } else {
            stashed_lines.push(lines[i].to_string());
            i += 1;
        }
    }
    let text = stashed_lines.join("\n");
    let text = code_re
        .replace_all(&text, |caps: &regex::Captures| stash_fn(caps.get(0).unwrap().as_str()))
        .to_string();

    let text = dmath_re
        .replace_all(&text, |caps: &regex::Captures| {
            let expr = caps.get(1).unwrap().as_str().trim();
            let token = format!("@@MDV_BLOCK_{}@@", placeholders.len());
            placeholders.insert(
                token.clone(),
                format!(r#"<div class="mdv-math-block" data-math="{}"></div>"#, escape_html(expr)),
            );
            format!("\n{}\n", token)
        })
        .to_string();

    let mut text = imath_re
        .replace_all(&text, |caps: &regex::Captures| {
            let prefix = caps.get(1).unwrap().as_str();
            let expr = caps.get(2).unwrap().as_str();
            let token = format!("@@MDV_INLINE_{}@@", placeholders.len());
            placeholders.insert(
                token.clone(),
                format!(r#"<span class="mdv-math-inline" data-math="{}"></span>"#, escape_html(expr)),
            );
            format!("{}{}", prefix, token)
        })
        .to_string();

    for (k, v) in code_stash.into_iter().rev() {
        text = text.replace(&k, &v);
    }
    text
}

fn resolve_href(href: &str, base_dir: &Path, is_image: bool) -> (String, bool, bool) {
    // Returns (resolved_href, is_md_internal_link, is_external_http)
    let lower = href.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return (href.to_string(), false, true);
    }
    if lower.starts_with("data:") || lower.starts_with("mailto:") || href.starts_with('#') {
        return (href.to_string(), false, false);
    }
    if let Some(stripped) = href.strip_prefix("file://") {
        let (path_part, hash_part) = match stripped.split_once('#') {
            Some((p, h)) => (p, Some(h)),
            None => (stripped, None),
        };
        let decoded = urlencoding::decode(path_part)
            .map(|c| c.into_owned())
            .unwrap_or_else(|_| path_part.to_string());
        // Handle Windows file:///C:/... leading slash
        #[cfg(windows)]
        let decoded = if decoded.starts_with('/') && decoded.as_bytes().get(2) == Some(&b':') {
            decoded[1..].to_string()
        } else {
            decoded
        };
        if !is_image && (decoded.ends_with(".md") || decoded.ends_with(".markdown")) {
            let h = hash_part.map(|x| format!("#{}", x)).unwrap_or_default();
            return (format!("/?file={}{}", urlencoding::encode(&decoded), h), true, false);
        }
        return (format!("/local-file?path={}", urlencoding::encode(&decoded)), false, false);
    }

    let (clean_part, hash_part) = match href.split_once('#') {
        Some((p, h)) => (p, Some(h)),
        None => (href, None),
    };
    let decoded_rel = urlencoding::decode(clean_part)
        .map(|c| c.into_owned())
        .unwrap_or_else(|_| clean_part.to_string());
    let joined = base_dir.join(&decoded_rel);
    let resolved = joined
        .canonicalize()
        .unwrap_or(joined)
        .to_string_lossy()
        .to_string();

    if !is_image && (clean_part.to_ascii_lowercase().ends_with(".md") || clean_part.to_ascii_lowercase().ends_with(".markdown")) {
        let h = hash_part.map(|x| format!("#{}", x)).unwrap_or_default();
        return (format!("/?file={}{}", urlencoding::encode(&resolved), h), true, false);
    }
    (format!("/local-file?path={}", urlencoding::encode(&resolved)), false, false)
}

fn heading_level_num(lvl: HeadingLevel) -> u8 {
    match lvl {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

pub fn render_markdown_document(raw_markdown: &str, base_dir: &Path) -> RenderedDocument {
    let (without_fm, meta) = extract_frontmatter(raw_markdown);
    let mut toc = Vec::new();
    let mut seen_slugs = HashMap::new();
    let carousel_seq = Cell::new(0usize);

    fn render_fragment(
        md_source: &str,
        base_dir: &Path,
        is_nested: bool,
        toc: &mut Vec<TocItem>,
        seen_slugs: &mut HashMap<String, usize>,
        carousel_seq: &Cell<usize>,
    ) -> String {
        let (after_blocks, mut placeholders) = extract_blocks_outside_fences(
            md_source,
            |inner| render_fragment(inner, base_dir, true, toc, seen_slugs, carousel_seq),
            carousel_seq,
        );
        let prepared = extract_math_outside_code(&after_blocks, &mut placeholders);

        let mut opts = Options::empty();
        opts.insert(Options::ENABLE_TABLES);
        opts.insert(Options::ENABLE_STRIKETHROUGH);
        opts.insert(Options::ENABLE_TASKLISTS);
        opts.insert(Options::ENABLE_FOOTNOTES);

        let parser = Parser::new_ext(&prepared, opts);
        let events: Vec<Event> = parser.collect();
        let mut out_events: Vec<Event> = Vec::with_capacity(events.len());

        let mut idx = 0usize;
        while idx < events.len() {
            match &events[idx] {
                Event::Start(Tag::Heading { level, .. }) => {
                    let lvl = heading_level_num(*level);
                    let mut inner_events = Vec::new();
                    let mut plain = String::new();
                    idx += 1;
                    while idx < events.len() {
                        if matches!(events[idx], Event::End(TagEnd::Heading(_))) {
                            idx += 1;
                            break;
                        }
                        match &events[idx] {
                            Event::Text(t) | Event::Code(t) => plain.push_str(t),
                            _ => {}
                        }
                        inner_events.push(events[idx].clone());
                        idx += 1;
                    }
                    let mut inner_html = String::new();
                    html::push_html(&mut inner_html, inner_events.into_iter());
                    let id = slugify(&plain, seen_slugs);
                    if !is_nested && lvl <= 4 {
                        toc.push(TocItem {
                            id: id.clone(),
                            text: plain.trim().to_string(),
                            level: lvl,
                        });
                    }
                    out_events.push(Event::Html(
                        format!(
                            r##"<h{lvl} id="{id}" class="mdv-heading"><a class="mdv-anchor" href="#{id}" aria-hidden="true">#</a>{inner_html}</h{lvl}>"##
                        )
                        .into(),
                    ));
                    continue;
                }

                Event::Start(Tag::CodeBlock(kind)) => {
                    let lang = match kind {
                        CodeBlockKind::Fenced(info) => info
                            .split_whitespace()
                            .next()
                            .unwrap_or("")
                            .to_ascii_lowercase(),
                        CodeBlockKind::Indented => String::new(),
                    };
                    let mut code_text = String::new();
                    idx += 1;
                    while idx < events.len() {
                        if matches!(events[idx], Event::End(TagEnd::CodeBlock)) {
                            idx += 1;
                            break;
                        }
                        if let Event::Text(t) = &events[idx] {
                            code_text.push_str(t);
                        }
                        idx += 1;
                    }
                    let escaped_code = escape_html(&code_text);
                    let block_html = if lang == "mermaid" {
                        format!(
                            r#"<div class="mdv-mermaid-card" data-mermaid-card>
  <div class="mdv-mermaid-bar">
    <span class="mdv-code-lang">mermaid</span>
    <div class="mdv-mermaid-actions">
      <button type="button" class="mdv-icon-btn" data-mermaid-code title="Ver código fuente">Código</button>
      <button type="button" class="mdv-icon-btn" data-mermaid-expand title="Ampliar diagrama">Ampliar</button>
    </div>
  </div>
  <div class="mdv-mermaid-stage" data-mermaid-stage>
    <pre class="mermaid">{escaped_code}</pre>
  </div>
  <pre class="mdv-mermaid-raw" hidden><code>{escaped_code}</code></pre>
</div>"#
                        )
                    } else {
                        let label = if lang.is_empty() { "texto" } else { &lang };
                        let lang_cls = if lang.is_empty() {
                            "plaintext".to_string()
                        } else {
                            escape_html(&lang)
                        };
                        format!(
                            r#"<div class="mdv-code-card">
  <div class="mdv-code-header">
    <span class="mdv-code-lang">{label}</span>
    <button type="button" class="mdv-copy-btn" data-copy-code aria-label="Copiar código">
      <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>
      <span>Copiar</span>
    </button>
  </div>
  <pre><code class="hljs language-{lang_cls}">{escaped_code}</code></pre>
</div>"#,
                            label = escape_html(label),
                            lang_cls = lang_cls,
                            escaped_code = escaped_code
                        )
                    };
                    out_events.push(Event::Html(block_html.into()));
                    continue;
                }

                Event::Start(Tag::BlockQuote(_)) => {
                    out_events.push(Event::Html(r#"<blockquote class="mdv-blockquote">"#.into()));
                    idx += 1;
                    continue;
                }
                Event::End(TagEnd::BlockQuote(_)) => {
                    out_events.push(Event::Html("</blockquote>\n".into()));
                    idx += 1;
                    continue;
                }

                Event::Start(Tag::Table(alignments)) => {
                    out_events.push(Event::Html(r#"<div class="mdv-table-wrap">"#.into()));
                    out_events.push(Event::Start(Tag::Table(alignments.clone())));
                    idx += 1;
                    continue;
                }
                Event::End(TagEnd::Table) => {
                    out_events.push(Event::End(TagEnd::Table));
                    out_events.push(Event::Html("</div>\n".into()));
                    idx += 1;
                    continue;
                }

                Event::Start(Tag::Image { dest_url, title, .. }) => {
                    let dest = dest_url.to_string();
                    let ttl = title.to_string();
                    let mut alt = String::new();
                    idx += 1;
                    while idx < events.len() {
                        if matches!(events[idx], Event::End(TagEnd::Image)) {
                            idx += 1;
                            break;
                        }
                        if let Event::Text(t) = &events[idx] {
                            alt.push_str(t);
                        }
                        idx += 1;
                    }
                    let (src, _, _) = resolve_href(&dest, base_dir, true);
                    let caption_html = if !ttl.is_empty() {
                        format!(r#"<span class="mdv-figcaption">{}</span>"#, escape_html(&ttl))
                    } else {
                        String::new()
                    };
                    out_events.push(Event::Html(
                        format!(
                            r#"<span class="mdv-figure"><img src="{src}" alt="{alt}" title="{ttl}" loading="lazy" data-lightbox-img />{caption_html}</span>"#,
                            src = escape_html(&src),
                            alt = escape_html(&alt),
                            ttl = escape_html(&ttl),
                            caption_html = caption_html
                        )
                        .into(),
                    ));
                    continue;
                }

                Event::Start(Tag::Link { dest_url, title, .. }) => {
                    let dest = dest_url.to_string();
                    let ttl = title.to_string();
                    let mut inner_events = Vec::new();
                    idx += 1;
                    while idx < events.len() {
                        if matches!(events[idx], Event::End(TagEnd::Link)) {
                            idx += 1;
                            break;
                        }
                        inner_events.push(events[idx].clone());
                        idx += 1;
                    }
                    let mut inner_html = String::new();
                    html::push_html(&mut inner_html, inner_events.into_iter());
                    let (resolved, is_md, is_ext) = resolve_href(&dest, base_dir, false);
                    let mut attrs = String::new();
                    if is_md {
                        attrs.push_str(" data-md-link");
                    } else if is_ext || resolved.starts_with("/local-file") {
                        attrs.push_str(r#" target="_blank" rel="noopener noreferrer""#);
                    }
                    if !ttl.is_empty() {
                        attrs.push_str(&format!(r#" title="{}""#, escape_html(&ttl)));
                    }
                    out_events.push(Event::Html(
                        format!(r#"<a href="{}"{}>{}</a>"#, escape_html(&resolved), attrs, inner_html).into(),
                    ));
                    continue;
                }

                _ => {
                    out_events.push(events[idx].clone());
                    idx += 1;
                }
            }
        }

        let mut html_out = String::new();
        html::push_html(&mut html_out, out_events.into_iter());

        for (token, block_html) in placeholders {
            let wrapped_p = format!("<p>{}</p>", token);
            html_out = html_out.replace(&wrapped_p, &block_html);
            html_out = html_out.replace(&token, &block_html);
        }
        html_out
    }

    let mut html_body = render_fragment(
        without_fm,
        base_dir,
        false,
        &mut toc,
        &mut seen_slugs,
        &carousel_seq,
    );

    if !meta.is_empty() {
        let pills: String = meta
            .iter()
            .map(|(k, v)| {
                format!(
                    r#"<span class="mdv-meta-pill"><b>{}:</b> {}</span>"#,
                    escape_html(k),
                    escape_html(v)
                )
            })
            .collect();
        html_body = format!(r#"<div class="mdv-frontmatter">{}</div>{}"#, pills, html_body);
    }

    let title = toc
        .iter()
        .find(|t| t.level == 1)
        .map(|t| t.text.clone())
        .or_else(|| meta.iter().find(|(k, _)| k == "title").map(|(_, v)| v.clone()));

    RenderedDocument {
        html: html_body,
        toc,
        title,
    }
}
