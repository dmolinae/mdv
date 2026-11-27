import path from 'node:path';
import { Marked } from 'marked';
import hljs from 'highlight.js';
import katex from 'katex';

const ALERT_META = {
  NOTE: {
    label: 'Nota',
    icon: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>'
  },
  TIP: {
    label: 'Tip',
    icon: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"/></svg>'
  },
  IMPORTANT: {
    label: 'Importante',
    icon: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>'
  },
  WARNING: {
    label: 'Advertencia',
    icon: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>'
  },
  CAUTION: {
    label: 'Precaución',
    icon: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>'
  }
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(text, seen) {
  const base = text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-') || 'section';
  const count = seen.get(base) || 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

function extractFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return { content: markdown, meta: null };
  const raw = match[1];
  const entries = [];
  for (const line of raw.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (kv) {
      entries.push({ key: kv[1], value: kv[2].replace(/^['"]|['"]$/g, '') });
    }
  }
  if (entries.length === 0) return { content: markdown, meta: null };
  return { content: markdown.slice(match[0].length), meta: entries };
}

/**
 * Extracts ````carousel ... ```` (or 3+ backticks with lang "carousel") blocks
 * while respecting outer fenced code blocks (e.g., `````markdown showing a carousel example).
 */
function replaceCarousels(markdown, renderNested) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  const placeholders = new Map();
  let i = 0;
  let carouselCounter = 0;

  while (i < lines.length) {
    const fenceMatch = lines[i].match(/^(\s*)(`{3,}|~{3,})\s*([^\s`~]*)(.*)$/);
    if (fenceMatch) {
      const indent = fenceMatch[1];
      const fence = fenceMatch[2];
      const fenceChar = fence[0];
      const fenceLen = fence.length;
      const info = fenceMatch[3].toLowerCase();

      if (info === 'carousel') {
        const bodyLines = [];
        i++;
        while (i < lines.length) {
          const closeMatch = lines[i].match(new RegExp(`^\\s*${fenceChar}{${fenceLen},}\\s*$`));
          if (closeMatch) {
            i++;
            break;
          }
          bodyLines.push(lines[i]);
          i++;
        }

        const slides = splitCarouselSlides(bodyLines.join('\n'));
        const id = `@@MDV_CAROUSEL_${carouselCounter++}@@`;
        placeholders.set(id, buildCarouselHtml(slides, renderNested, carouselCounter));
        out.push(`${indent}${id}`);
        continue;
      } else {
        // Normal code fence: pass through untouched until matching closing fence
        out.push(lines[i]);
        i++;
        while (i < lines.length) {
          out.push(lines[i]);
          const closeMatch = lines[i].match(new RegExp(`^\\s*${fenceChar}{${fenceLen},}\\s*$`));
          i++;
          if (closeMatch) break;
        }
        continue;
      }
    }
    out.push(lines[i]);
    i++;
  }

  return { text: out.join('\n'), placeholders };
}

function splitCarouselSlides(rawBody) {
  const slides = [];
  const regex = /<!--\s*slide(?:\s*:\s*([\s\S]*?))?\s*-->/gi;
  let lastIndex = 0;
  let currentTitle = null;
  let match;

  while ((match = regex.exec(rawBody)) !== null) {
    const chunk = rawBody.slice(lastIndex, match.index).trim();
    if (chunk || currentTitle) {
      slides.push({ title: currentTitle, content: chunk });
    }
    currentTitle = match[1] ? match[1].trim() : null;
    lastIndex = regex.lastIndex;
  }

  const tail = rawBody.slice(lastIndex).trim();
  if (tail || currentTitle || slides.length === 0) {
    slides.push({ title: currentTitle, content: tail });
  }

  return slides;
}

function buildCarouselHtml(slides, renderNested, index) {
  const total = slides.length;
  const slidesHtml = slides
    .map((slide, idx) => {
      const rendered = renderNested(slide.content);
      const titleBadge = slide.title
        ? `<div class="mdv-slide-label">${escapeHtml(slide.title)}</div>`
        : '';
      return `
        <section class="mdv-carousel-slide${idx === 0 ? ' is-active' : ''}" data-slide-index="${idx}" aria-hidden="${idx === 0 ? 'false' : 'true'}">
          ${titleBadge}
          <div class="mdv-slide-body">${rendered}</div>
        </section>`;
    })
    .join('\n');

  const dotsHtml = slides
    .map(
      (s, idx) =>
        `<button type="button" class="mdv-carousel-dot${idx === 0 ? ' is-active' : ''}" data-slide-to="${idx}" aria-label="Ir a diapositiva ${idx + 1}" title="${s.title ? escapeHtml(s.title) : `Vista ${idx + 1}`}"></button>`
    )
    .join('');

  return `
    <div class="mdv-carousel" data-carousel data-carousel-id="${index}" tabindex="0" role="region" aria-label="Carrusel de contenido">
      <div class="mdv-carousel-header">
        <div class="mdv-carousel-badge">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M2 3.75C2 2.784 2.784 2 3.75 2h8.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25Zm1.75-.25a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25Z"/></svg>
          <span>Carrusel</span>
        </div>
        <div class="mdv-carousel-controls">
          <span class="mdv-carousel-counter"><strong data-carousel-current>1</strong> / ${total}</span>
          <div class="mdv-carousel-nav-group">
            <button type="button" class="mdv-carousel-btn" data-carousel-prev aria-label="Anterior" title="Anterior (←)" ${total <= 1 ? 'disabled' : ''}>
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12.5 5.5 8 10 3.5"/></svg>
            </button>
            <button type="button" class="mdv-carousel-btn" data-carousel-next aria-label="Siguiente" title="Siguiente (→)" ${total <= 1 ? 'disabled' : ''}>
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5 10.5 8 6 12.5"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="mdv-carousel-viewport">
        ${slidesHtml}
      </div>
      ${total > 1 ? `<div class="mdv-carousel-footer"><div class="mdv-carousel-dots">${dotsHtml}</div><span class="mdv-carousel-hint">Usa ← → o haz clic para navegar</span></div>` : ''}
    </div>`;
}

/**
 * Protects fenced code blocks and inline code while rendering $$...$$ and $...$ math via KaTeX.
 */
function renderMathOutsideCode(markdown) {
  const stash = [];
  const stashToken = (val) => {
    const key = `@@MDV_STASH_${stash.length}@@`;
    stash.push({ key, val });
    return key;
  };

  // Protect fenced code blocks
  let text = markdown.replace(/(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g, (m) => stashToken(m));
  // Protect inline code spans
  text = text.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (m) => stashToken(m));

  // Display math $$...$$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    const html = katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false });
    return stashToken(`<div class="mdv-math-block">${html}</div>`);
  });

  // Inline math $...$ (avoid matching currency like $100 and $200)
  text = text.replace(/(^|[^\\$\w])\$([^\s$](?:[^\n$]*?[^\s$\\])?)\$(?![\d])/g, (full, prefix, expr) => {
    const html = katex.renderToString(expr, { displayMode: false, throwOnError: false });
    return `${prefix}${stashToken(`<span class="mdv-math-inline">${html}</span>`)}`;
  });

  for (let i = stash.length - 1; i >= 0; i--) {
    text = text.replaceAll(stash[i].key, stash[i].val);
  }
  return text;
}

function resolveMediaHref(href, baseDir) {
  if (!href) return href;
  if (/^(https?:|data:|mailto:|#)/i.test(href)) return href;
  if (href.startsWith('file://')) {
    const filePath = decodeURIComponent(href.replace(/^file:\/\//, '')).split('#')[0];
    return `/local-file?path=${encodeURIComponent(filePath)}`;
  }
  const [cleanPart, hashPart] = href.split('#');
  const resolved = path.resolve(baseDir, decodeURIComponent(cleanPart));
  if (/\.(md|markdown)$/i.test(cleanPart)) {
    return `/?file=${encodeURIComponent(resolved)}${hashPart ? `#${hashPart}` : ''}`;
  }
  return `/local-file?path=${encodeURIComponent(resolved)}`;
}

export function renderMarkdownDocument(rawMarkdown, { baseDir = process.cwd(), collectToc = true } = {}) {
  const { content: withoutFm, meta } = extractFrontmatter(rawMarkdown);
  const toc = [];
  const seenSlugs = new Map();

  const renderFragment = (mdSource, isNestedSlide = false) => {
    const { text: withCarouselTokens, placeholders } = replaceCarousels(mdSource, (inner) =>
      renderFragment(inner, true)
    );
    const withMath = renderMathOutsideCode(withCarouselTokens);

    const instance = new Marked({ gfm: true, breaks: false });

    instance.use({
      renderer: {
        heading({ tokens, depth }) {
          const innerHtml = this.parser.parseInline(tokens);
          const plainText = innerHtml.replace(/<[^>]+>/g, '').trim();
          const id = slugify(plainText, seenSlugs);
          if (collectToc && !isNestedSlide && depth <= 4) {
            toc.push({ id, text: plainText, level: depth });
          }
          return `<h${depth} id="${id}" class="mdv-heading"><a class="mdv-anchor" href="#${id}" aria-hidden="true">#</a>${innerHtml}</h${depth}>\n`;
        },

        code({ text, lang }) {
          const cleanLang = (lang || '').trim().split(/\s+/)[0].toLowerCase();
          if (cleanLang === 'mermaid') {
            return `
              <div class="mdv-mermaid-card" data-mermaid-card>
                <div class="mdv-mermaid-bar">
                  <span class="mdv-code-lang">mermaid</span>
                  <div class="mdv-mermaid-actions">
                    <button type="button" class="mdv-icon-btn" data-mermaid-code title="Ver código fuente">Código</button>
                    <button type="button" class="mdv-icon-btn" data-mermaid-expand title="Ampliar diagrama">Ampliar</button>
                  </div>
                </div>
                <div class="mdv-mermaid-stage" data-mermaid-stage>
                  <pre class="mermaid">${escapeHtml(text)}</pre>
                </div>
                <pre class="mdv-mermaid-raw" hidden><code>${escapeHtml(text)}</code></pre>
              </div>`;
          }

          let highlighted;
          let label = cleanLang || 'texto';
          if (cleanLang && hljs.getLanguage(cleanLang)) {
            highlighted = hljs.highlight(text, { language: cleanLang, ignoreIllegals: true }).value;
          } else {
            highlighted = escapeHtml(text);
          }

          return `
            <div class="mdv-code-card">
              <div class="mdv-code-header">
                <span class="mdv-code-lang">${escapeHtml(label)}</span>
                <button type="button" class="mdv-copy-btn" data-copy-code aria-label="Copiar código">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>
                  <span>Copiar</span>
                </button>
              </div>
              <pre><code class="hljs language-${escapeHtml(label)}">${highlighted}</code></pre>
            </div>`;
        },

        blockquote({ tokens, raw }) {
          // Support both standard "> [!NOTE]\n> body" and inline "> [!NOTE] Inline text\n> more"
          const stripped = raw
            .split(/\r?\n/)
            .map((l) => l.replace(/^\s*>\s?/, ''))
            .join('\n')
            .trim();
          const alertMatch = stripped.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]+([^\n]+))?(?:\n([\s\S]*))?$/i);
          if (alertMatch) {
            const kind = alertMatch[1].toUpperCase();
            const inlineFirstLine = (alertMatch[2] || '').trim();
            const restBody = (alertMatch[3] || '').trim();
            const info = ALERT_META[kind] || ALERT_META.NOTE;
            const combinedMd = [inlineFirstLine, restBody].filter(Boolean).join('\n\n');
            const bodyHtml = combinedMd ? renderFragment(combinedMd, isNestedSlide) : '';
            return `
              <div class="mdv-alert mdv-alert-${kind.toLowerCase()}" role="note">
                <div class="mdv-alert-title">${info.icon}<span>${info.label}</span></div>
                ${bodyHtml ? `<div class="mdv-alert-body">${bodyHtml}</div>` : ''}
              </div>`;
          }
          return `<blockquote class="mdv-blockquote">${this.parser.parse(tokens)}</blockquote>\n`;
        },

        image({ href, title, text }) {
          const src = resolveMediaHref(href, baseDir);
          const caption = title || text || '';
          return `
            <span class="mdv-figure">
              <img src="${escapeHtml(src)}" alt="${escapeHtml(text || '')}" title="${escapeHtml(title || '')}" loading="lazy" data-lightbox-img />
              ${title ? `<span class="mdv-figcaption">${escapeHtml(caption)}</span>` : ''}
            </span>`;
        },

        link({ href, title, tokens }) {
          const inner = this.parser.parseInline(tokens);
          if (!href) return inner;
          if (href.startsWith('file://')) {
            const cleanPath = decodeURIComponent(href.replace(/^file:\/\//, '')).split('#')[0];
            if (/\.(md|markdown)$/i.test(cleanPath)) {
              const hash = href.includes('#') ? `#${href.split('#')[1]}` : '';
              return `<a href="/?file=${encodeURIComponent(cleanPath)}${hash}" data-md-link title="${escapeHtml(cleanPath)}">${inner}</a>`;
            }
            return `<a href="/local-file?path=${encodeURIComponent(cleanPath)}" target="_blank" rel="noopener" class="mdv-file-pill" title="${escapeHtml(cleanPath)}">${inner}</a>`;
          }
          if (!/^(https?:|mailto:|#)/i.test(href) && /\.(md|markdown)(#.*)?$/i.test(href)) {
            const resolved = resolveMediaHref(href, baseDir);
            return `<a href="${escapeHtml(resolved)}" data-md-link>${inner}</a>`;
          }
          const external = /^https?:/i.test(href);
          const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
          const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
          return `<a href="${escapeHtml(href)}"${titleAttr}${attrs}>${inner}</a>`;
        },

        table(token) {
          let headerCells = '';
          for (let j = 0; j < token.header.length; j++) {
            const cell = token.header[j];
            const align = cell.align ? ` style="text-align:${cell.align}"` : '';
            headerCells += `<th${align}>${this.parser.parseInline(cell.tokens)}</th>`;
          }
          let bodyRows = '';
          for (let i = 0; i < token.rows.length; i++) {
            const row = token.rows[i];
            let cells = '';
            for (let j = 0; j < row.length; j++) {
              const cell = row[j];
              const align = cell.align ? ` style="text-align:${cell.align}"` : '';
              cells += `<td${align}>${this.parser.parseInline(cell.tokens)}</td>`;
            }
            bodyRows += `<tr>${cells}</tr>`;
          }
          return `<div class="mdv-table-wrap"><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
        }
      }
    });

    let html = instance.parse(withMath);
    for (const [token, carouselHtml] of placeholders.entries()) {
      html = html.replace(new RegExp(`<p>\\s*${token}\\s*<\\/p>`, 'g'), carouselHtml);
      html = html.replaceAll(token, carouselHtml);
    }
    return html;
  };

  let html = renderFragment(withoutFm, false);
  if (meta && meta.length > 0) {
    const pills = meta
      .map((m) => `<span class="mdv-meta-pill"><b>${escapeHtml(m.key)}:</b> ${escapeHtml(m.value)}</span>`)
      .join('');
    html = `<div class="mdv-frontmatter">${pills}</div>\n${html}`;
  }

  const title = toc.find((t) => t.level === 1)?.text || meta?.find((m) => m.key === 'title')?.value || null;
  return { html, toc, title };
}
