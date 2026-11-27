(function () {
  const THEMES = ['tokyo', 'github-dark', 'catppuccin', 'light'];

  const articleEl = document.getElementById('mdv-article');
  const tocListEl = document.getElementById('mdv-toc-list');
  const fileListEl = document.getElementById('mdv-file-list');
  const fileNameEl = document.getElementById('mdv-filename');
  const liveDotEl = document.getElementById('mdv-live-dot');
  const reloadPillEl = document.getElementById('mdv-reload-pill');
  const themeSelect = document.getElementById('mdv-theme-select');
  const btnFiles = document.getElementById('mdv-toggle-files');
  const btnToc = document.getElementById('mdv-toggle-toc');
  const btnWide = document.getElementById('mdv-toggle-wide');
  const btnSearch = document.getElementById('mdv-open-search');
  const btnHelp = document.getElementById('mdv-open-help');
  const totalFilesEl = document.getElementById('mdv-total-files');
  const fileFilterEl = document.getElementById('mdv-file-filter');
  const expandTreeBtn = document.getElementById('mdv-tree-expand-all');
  const collapseTreeBtn = document.getElementById('mdv-tree-collapse-all');
  const modalEl = document.getElementById('mdv-modal');
  const modalBodyEl = document.getElementById('mdv-modal-body');

  // Search bar elements
  const searchBarEl = document.getElementById('mdv-search-bar');
  const searchInputEl = document.getElementById('mdv-search-input');
  const searchCountEl = document.getElementById('mdv-search-count');
  const searchPrevBtn = document.getElementById('mdv-search-prev');
  const searchNextBtn = document.getElementById('mdv-search-next');
  const searchCloseBtn = document.getElementById('mdv-search-close');

  // Vim HUD elements
  const vimPosEl = document.getElementById('mdv-vim-pos');
  const vimKeysEl = document.getElementById('mdv-vim-keys');
  const vimToastEl = document.getElementById('mdv-vim-toast');

  let currentFile = window.__MDV_INITIAL__?.currentFile || '';
  const carouselState = new Map();
  const carouselControllers = [];
  let zoomPercent = Number(localStorage.getItem('mdv-zoom') || 100);
  let reloadPillTimer = null;
  let toastTimer = null;

  // Theme & layout persistence
  const savedTheme = localStorage.getItem('mdv-theme') || window.__MDV_INITIAL__?.defaultTheme || 'tokyo';
  applyTheme(savedTheme, false);
  applyZoom(zoomPercent, false);

  if (localStorage.getItem('mdv-wide') === '1') {
    document.body.classList.add('wide-mode');
    btnWide?.classList.add('is-active');
  }
  // When user explicitly opens a directory (`mdv` or `mdv ./folder`), always show the file explorer initially
  if (!window.__MDV_INITIAL__?.dirMode && localStorage.getItem('mdv-hide-files') === '1') {
    document.body.classList.add('hide-files');
    btnFiles?.classList.remove('is-active');
  }

  function showToast(msg) {
    if (!vimToastEl) return;
    vimToastEl.textContent = msg;
    vimToastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      vimToastEl.hidden = true;
    }, 1400);
  }

  function flashReloadIndicator() {
    if (!reloadPillEl) return;
    reloadPillEl.hidden = false;
    clearTimeout(reloadPillTimer);
    reloadPillTimer = setTimeout(() => {
      reloadPillEl.hidden = true;
    }, 1500);
  }

  function applyTheme(theme, rerenderDiagrams) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeSelect) themeSelect.value = theme;
    localStorage.setItem('mdv-theme', theme);
    if (rerenderDiagrams) renderMermaidDiagrams();
  }

  function cycleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'tokyo';
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    applyTheme(next, true);
    showToast(`Tema: ${next}`);
  }

  function applyZoom(pct, announce = true) {
    zoomPercent = Math.min(160, Math.max(75, pct));
    articleEl.style.fontSize = `${zoomPercent}%`;
    localStorage.setItem('mdv-zoom', String(zoomPercent));
    if (announce) showToast(`Zoom: ${zoomPercent}%`);
  }

  function toggleFilesPanel() {
    const hidden = document.body.classList.toggle('hide-files');
    btnFiles?.classList.toggle('is-active', !hidden);
    localStorage.setItem('mdv-hide-files', hidden ? '1' : '0');
  }

  function toggleTocPanel() {
    const hidden = document.body.classList.toggle('hide-toc');
    btnToc?.classList.toggle('is-active', !hidden);
  }

  function toggleWideMode() {
    const wide = document.body.classList.toggle('wide-mode');
    btnWide?.classList.toggle('is-active', wide);
    localStorage.setItem('mdv-wide', wide ? '1' : '0');
    showToast(wide ? 'Ancho: expandido' : 'Ancho: lectura');
  }

  themeSelect?.addEventListener('change', (e) => applyTheme(e.target.value, true));
  btnFiles?.addEventListener('click', toggleFilesPanel);
  btnToc?.addEventListener('click', toggleTocPanel);
  btnWide?.addEventListener('click', toggleWideMode);
  btnSearch?.addEventListener('click', () => openSearchBar());
  btnHelp?.addEventListener('click', () => toggleHelpModal());

  // File Tree Expand / Collapse & Quick Filter (Ctrl+P)
  expandTreeBtn?.addEventListener('click', () => {
    fileListEl?.querySelectorAll('details.mdv-folder-details').forEach((d) => (d.open = true));
  });
  collapseTreeBtn?.addEventListener('click', () => {
    fileListEl?.querySelectorAll('details.mdv-folder-details').forEach((d) => (d.open = false));
  });

  function applyFileTreeFilter(rawFilter) {
    if (!fileListEl) return;
    const q = (rawFilter || '').trim().toLowerCase();
    const items = Array.from(fileListEl.querySelectorAll('.mdv-file-item'));
    items.forEach((li) => {
      const rel = li.getAttribute('data-rel-path') || '';
      li.hidden = q ? !rel.includes(q) : false;
    });
    const dirs = Array.from(fileListEl.querySelectorAll('.mdv-tree-dir')).reverse();
    dirs.forEach((dirLi) => {
      const hasVisibleFile = Boolean(dirLi.querySelector('.mdv-file-item:not([hidden])'));
      dirLi.hidden = q ? !hasVisibleFile : false;
      if (q && hasVisibleFile) {
        const det = dirLi.querySelector(':scope > details.mdv-folder-details');
        if (det) det.open = true;
      }
    });
  }

  fileFilterEl?.addEventListener('input', () => applyFileTreeFilter(fileFilterEl.value));
  fileFilterEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      fileFilterEl.value = '';
      applyFileTreeFilter('');
      fileFilterEl.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const firstVisible = fileListEl?.querySelector('.mdv-file-item:not([hidden])');
      const targetPath = firstVisible?.getAttribute('data-file-path');
      if (targetPath) {
        fileFilterEl.blur();
        loadDocument(targetPath, { pushState: true });
      }
    }
  });

  // Interactive Carousels
  function initCarousels() {
    carouselControllers.length = 0;
    document.querySelectorAll('[data-carousel]').forEach((carousel, idx) => {
      const id = carousel.getAttribute('data-carousel-id') || String(idx);
      const slides = Array.from(carousel.querySelectorAll('.mdv-carousel-slide'));
      const dots = Array.from(carousel.querySelectorAll('.mdv-carousel-dot'));
      const prevBtn = carousel.querySelector('[data-carousel-prev]');
      const nextBtn = carousel.querySelector('[data-carousel-next]');
      const currentEl = carousel.querySelector('[data-carousel-current]');
      if (slides.length === 0) return;

      let active = Math.min(carouselState.get(id) || 0, slides.length - 1);

      const goTo = (nextIdx) => {
        active = (nextIdx + slides.length) % slides.length;
        carouselState.set(id, active);
        slides.forEach((s, i) => {
          const isAct = i === active;
          s.classList.toggle('is-active', isAct);
          s.setAttribute('aria-hidden', isAct ? 'false' : 'true');
        });
        dots.forEach((d, i) => d.classList.toggle('is-active', i === active));
        if (currentEl) currentEl.textContent = String(active + 1);
        renderMermaidDiagrams(slides[active]);
      };

      if (active !== 0) goTo(active);

      prevBtn?.addEventListener('click', () => goTo(active - 1));
      nextBtn?.addEventListener('click', () => goTo(active + 1));
      dots.forEach((dot) => {
        dot.addEventListener('click', () => goTo(Number(dot.getAttribute('data-slide-to') || 0)));
      });

      carousel.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          goTo(active - 1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          goTo(active + 1);
        }
      });

      let startX = null;
      carousel.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button, a, pre, code')) return;
        startX = e.clientX;
      });
      carousel.addEventListener('pointerup', (e) => {
        if (startX === null) return;
        const dx = e.clientX - startX;
        startX = null;
        if (Math.abs(dx) > 48) {
          goTo(dx < 0 ? active + 1 : active - 1);
        }
      });

      carouselControllers.push({
        el: carousel,
        prev: () => goTo(active - 1),
        next: () => goTo(active + 1)
      });
    });
  }

  function findVisibleCarousel() {
    const vh = window.innerHeight;
    let best = null;
    let bestOverlap = 0;
    for (const ctrl of carouselControllers) {
      const rect = ctrl.el.getBoundingClientRect();
      const overlap = Math.min(rect.bottom, vh) - Math.max(rect.top, 50);
      if (overlap > bestOverlap && overlap > 60) {
        bestOverlap = overlap;
        best = ctrl;
      }
    }
    return best;
  }

  // Mermaid Diagrams
  async function renderMermaidDiagrams(scope = document) {
    if (!window.mermaid) return;
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    window.mermaid.initialize({
      startOnLoad: false,
      theme: isLight ? 'default' : 'dark',
      securityLevel: 'loose',
      fontFamily: '"Segoe UI Variable Text", "Segoe UI", Inter, sans-serif'
    });

    const cards = Array.from(scope.querySelectorAll('[data-mermaid-card]'));
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const parentSlide = card.closest('.mdv-carousel-slide');
      if (parentSlide && !parentSlide.classList.contains('is-active')) continue;

      const rawEl = card.querySelector('.mdv-mermaid-raw code');
      const stageEl = card.querySelector('[data-mermaid-stage]');
      if (!rawEl || !stageEl) continue;
      const source = rawEl.textContent || '';
      try {
        const uid = `mdv-mmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg } = await window.mermaid.render(uid, source);
        stageEl.innerHTML = svg;
      } catch (err) {
        stageEl.innerHTML = `<pre style="color:#ef4444;font-size:0.82rem">${err?.message || 'Error en diagrama Mermaid'}</pre>`;
      }
    }
  }

  // In-document Vim Search (/, n, N)
  let searchHits = [];
  let activeHitIdx = -1;
  let lastQuery = '';

  function clearSearchHighlights() {
    articleEl.querySelectorAll('mark.mdv-search-hit').forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
      parent.normalize();
    });
    searchHits = [];
    activeHitIdx = -1;
    if (searchCountEl) searchCountEl.textContent = '0 / 0';
  }

  function highlightQuery(query) {
    clearSearchHighlights();
    lastQuery = query;
    if (!query) return;

    const lowerQ = query.toLowerCase();
    const walker = document.createTreeWalker(articleEl, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p || p.closest('script, style, .mdv-mermaid-raw, .mdv-code-header, .mdv-mermaid-bar')) {
          return NodeFilter.FILTER_REJECT;
        }
        return node.nodeValue.toLowerCase().includes(lowerQ)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const textNode of textNodes) {
      const val = textNode.nodeValue || '';
      const frag = document.createDocumentFragment();
      let pos = 0;
      let idx;
      const lowerVal = val.toLowerCase();
      while ((idx = lowerVal.indexOf(lowerQ, pos)) !== -1) {
        if (idx > pos) frag.appendChild(document.createTextNode(val.slice(pos, idx)));
        const mark = document.createElement('mark');
        mark.className = 'mdv-search-hit';
        mark.textContent = val.slice(idx, idx + query.length);
        frag.appendChild(mark);
        searchHits.push(mark);
        pos = idx + query.length;
      }
      if (pos < val.length) frag.appendChild(document.createTextNode(val.slice(pos)));
      textNode.parentNode?.replaceChild(frag, textNode);
    }

    if (searchHits.length > 0) {
      // Pick first hit at or below viewport top
      const firstBelow = searchHits.findIndex((m) => m.getBoundingClientRect().top >= 60);
      focusSearchHit(firstBelow >= 0 ? firstBelow : 0);
    } else if (searchCountEl) {
      searchCountEl.textContent = 'Sin resultados';
    }
  }

  function focusSearchHit(idx) {
    if (!searchHits.length) return;
    searchHits.forEach((m) => m.classList.remove('is-current'));
    activeHitIdx = (idx + searchHits.length) % searchHits.length;
    const hit = searchHits[activeHitIdx];
    hit.classList.add('is-current');
    // If inside a closed <details> or inactive carousel slide, reveal it!
    const details = hit.closest('details');
    if (details && !details.open) details.open = true;
    const slide = hit.closest('.mdv-carousel-slide');
    if (slide && !slide.classList.contains('is-active')) {
      const idxAttr = Number(slide.getAttribute('data-slide-index') || 0);
      slide.closest('[data-carousel]')?.querySelector(`[data-slide-to="${idxAttr}"]`)?.click();
    }
    hit.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (searchCountEl) searchCountEl.textContent = `${activeHitIdx + 1} / ${searchHits.length}`;
  }

  function openSearchBar() {
    if (!searchBarEl || !searchInputEl) return;
    searchBarEl.hidden = false;
    searchInputEl.focus();
    searchInputEl.select();
  }

  function closeSearchBar(clearMarks = true) {
    if (searchBarEl) searchBarEl.hidden = true;
    searchInputEl?.blur();
    if (clearMarks) {
      clearSearchHighlights();
      lastQuery = '';
    }
  }

  searchInputEl?.addEventListener('input', () => highlightQuery(searchInputEl.value.trim()));
  searchInputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) focusSearchHit(activeHitIdx - 1);
      else searchInputEl.blur(); // Lock search so n / N navigate immediately like Vim!
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchBar(true);
    }
  });
  searchNextBtn?.addEventListener('click', () => focusSearchHit(activeHitIdx + 1));
  searchPrevBtn?.addEventListener('click', () => focusSearchHit(activeHitIdx - 1));
  searchCloseBtn?.addEventListener('click', () => closeSearchBar(true));

  // ? Cheatsheet Modal
  function toggleHelpModal() {
    if (!modalEl || !modalBodyEl) return;
    if (!modalEl.hidden && modalBodyEl.querySelector('[data-help-sheet]')) {
      modalEl.hidden = true;
      return;
    }
    modalBodyEl.innerHTML = `
      <div data-help-sheet>
        <h3 class="mdv-help-title">
          <span>Atajos estilo Vim en <code>mdv</code></span>
          <span class="mdv-kbd">Esc / ?</span>
        </h3>
        <div class="mdv-help-grid">
          <div class="mdv-help-section">
            <h4>Movimiento</h4>
            <div class="mdv-help-row"><span>Bajar / Subir línea</span><span><kbd class="mdv-kbd">j</kbd> / <kbd class="mdv-kbd">k</kbd></span></div>
            <div class="mdv-help-row"><span>Media página abajo / arriba</span><span><kbd class="mdv-kbd">d</kbd> / <kbd class="mdv-kbd">u</kbd></span></div>
            <div class="mdv-help-row"><span>Página abajo / arriba</span><span><kbd class="mdv-kbd">f</kbd> / <kbd class="mdv-kbd">b</kbd></span></div>
            <div class="mdv-help-row"><span>Ir al inicio / final</span><span><kbd class="mdv-kbd">g g</kbd> / <kbd class="mdv-kbd">G</kbd></span></div>
            <div class="mdv-help-row"><span>Siguiente / anterior sección</span><span><kbd class="mdv-kbd">]]</kbd> o <kbd class="mdv-kbd">}</kbd> / <kbd class="mdv-kbd">[[</kbd> o <kbd class="mdv-kbd">{</kbd></span></div>
          </div>
          <div class="mdv-help-section">
            <h4>Componentes y Búsqueda</h4>
            <div class="mdv-help-row"><span>Carrusel anterior / siguiente</span><span><kbd class="mdv-kbd">h</kbd> / <kbd class="mdv-kbd">l</kbd></span></div>
            <div class="mdv-help-row"><span>Abrir / cerrar todos los &lt;details&gt;</span><span><kbd class="mdv-kbd">z R</kbd> / <kbd class="mdv-kbd">z M</kbd></span></div>
            <div class="mdv-help-row"><span>Buscar / Siguiente / Anterior</span><span><kbd class="mdv-kbd">/</kbd> · <kbd class="mdv-kbd">n</kbd> · <kbd class="mdv-kbd">N</kbd></span></div>
            <div class="mdv-help-row"><span>Copiar ruta / bloque código</span><span><kbd class="mdv-kbd">y y</kbd> / <kbd class="mdv-kbd">y c</kbd></span></div>
            <div class="mdv-help-row"><span>Limpiar resaltado de búsqueda</span><span><kbd class="mdv-kbd">Esc</kbd></span></div>
          </div>
          <div class="mdv-help-section">
            <h4>Vista y Ventana</h4>
            <div class="mdv-help-row"><span>Mostrar / ocultar Índice (TOC)</span><span><kbd class="mdv-kbd">t</kbd></span></div>
            <div class="mdv-help-row"><span>Mostrar / ocultar Archivos</span><span><kbd class="mdv-kbd">e</kbd> / <kbd class="mdv-kbd">Ctrl+P</kbd></span></div>
            <div class="mdv-help-row"><span>Archivo anterior / siguiente</span><span><kbd class="mdv-kbd">[ f</kbd> / <kbd class="mdv-kbd">] f</kbd></span></div>
            <div class="mdv-help-row"><span>Ancho lectura / Rotar tema</span><span><kbd class="mdv-kbd">w</kbd> / <kbd class="mdv-kbd">c</kbd></span></div>
            <div class="mdv-help-row"><span>Zoom + / - / Reset</span><span><kbd class="mdv-kbd">+</kbd> <kbd class="mdv-kbd">-</kbd> <kbd class="mdv-kbd">0</kbd></span></div>
            <div class="mdv-help-row"><span>Recargar / Cerrar ventana</span><span><kbd class="mdv-kbd">r</kbd> / <kbd class="mdv-kbd">q</kbd></span></div>
          </div>
        </div>
      </div>`;
    modalEl.hidden = false;
  }

  // Delegated clicks: copy code, mermaid actions, lightbox, internal .md navigation
  document.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('[data-copy-code]');
    if (copyBtn) {
      const code = copyBtn.closest('.mdv-code-card')?.querySelector('pre code')?.textContent || '';
      await navigator.clipboard.writeText(code);
      const label = copyBtn.querySelector('span');
      const prev = label?.textContent;
      copyBtn.classList.add('is-copied');
      if (label) label.textContent = '¡Copiado!';
      setTimeout(() => {
        copyBtn.classList.remove('is-copied');
        if (label && prev) label.textContent = prev;
      }, 1500);
      return;
    }

    const codeToggle = e.target.closest('[data-mermaid-code]');
    if (codeToggle) {
      const raw = codeToggle.closest('[data-mermaid-card]')?.querySelector('.mdv-mermaid-raw');
      if (raw) raw.hidden = !raw.hidden;
      return;
    }

    const expandBtn = e.target.closest('[data-mermaid-expand]');
    if (expandBtn) {
      const svg = expandBtn.closest('[data-mermaid-card]')?.querySelector('[data-mermaid-stage]')?.innerHTML;
      if (svg && modalEl && modalBodyEl) {
        modalBodyEl.innerHTML = `<div style="min-width:65vw">${svg}</div>`;
        modalEl.hidden = false;
      }
      return;
    }

    const img = e.target.closest('[data-lightbox-img]');
    if (img && modalEl && modalBodyEl) {
      modalBodyEl.innerHTML = `<img src="${img.src}" alt="${img.alt || ''}" />`;
      modalEl.hidden = false;
      return;
    }

    if (e.target === modalEl) {
      modalEl.hidden = true;
      return;
    }

    const mdLink = e.target.closest('[data-md-link]');
    if (mdLink && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const url = new URL(mdLink.href, window.location.origin);
      const targetFile = url.searchParams.get('file');
      if (targetFile) {
        await loadDocument(targetFile, { pushState: true, hash: url.hash });
      }
    }
  });

  // Full Vim Keybinding Engine (supports counts like 5j and multi-key sequences like gg, ]], [[, [f, ]f, zR, zM, yy, yc)
  let pendingPrefix = '';
  let countPrefix = '';
  let prefixTimer = null;

  function setPending(prefix, count = countPrefix) {
    pendingPrefix = prefix;
    countPrefix = count;
    clearTimeout(prefixTimer);
    if (vimKeysEl) {
      const text = `${count}${prefix}`;
      vimKeysEl.textContent = text;
      vimKeysEl.hidden = !text;
    }
    if (prefix || count) {
      prefixTimer = setTimeout(() => resetVimPending(), 1500);
    }
  }

  function resetVimPending() {
    pendingPrefix = '';
    countPrefix = '';
    if (vimKeysEl) vimKeysEl.hidden = true;
  }

  function jumpSection(dir) {
    if (!headings.length) return;
    const y = window.scrollY;
    if (dir > 0) {
      const next = headings.find((h) => h.offsetTop > y + 85);
      (next || headings[headings.length - 1]).scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const prev = [...headings].reverse().find((h) => h.offsetTop < y + 60);
      (prev || headings[0]).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function switchSiblingFile(dir) {
    if (!fileListEl) return;
    const items = Array.from(fileListEl.querySelectorAll('.mdv-file-item'));
    if (items.length <= 1) return;
    const curIdx = items.findIndex((li) => li.classList.contains('is-current'));
    const nextIdx = ((curIdx >= 0 ? curIdx : 0) + dir + items.length) % items.length;
    const pathAttr = items[nextIdx].getAttribute('data-file-path');
    if (pathAttr) loadDocument(pathAttr, { pushState: true });
  }

  document.addEventListener('keydown', async (e) => {
    if (e.target.matches('input, textarea, select')) return;

    if (e.key === 'Escape') {
      resetVimPending();
      if (modalEl && !modalEl.hidden) {
        modalEl.hidden = true;
        return;
      }
      if (searchBarEl && !searchBarEl.hidden) {
        closeSearchBar(true);
        return;
      }
      if (searchHits.length > 0) {
        clearSearchHighlights();
        showToast('Búsqueda limpia');
      }
      return;
    }

    // Ctrl+p (quick file filter) + Ctrl+d / Ctrl+u / Ctrl+f / Ctrl+b
    if (e.ctrlKey && !e.altKey && !e.metaKey) {
      if (e.key === 'p') {
        e.preventDefault();
        if (document.body.classList.contains('hide-files')) toggleFilesPanel();
        fileFilterEl?.focus();
        fileFilterEl?.select();
        return;
      }
      if (e.key === 'd') {
        e.preventDefault();
        window.scrollBy({ top: window.innerHeight * 0.5, behavior: 'auto' });
        return;
      }
      if (e.key === 'u') {
        e.preventDefault();
        window.scrollBy({ top: -window.innerHeight * 0.5, behavior: 'auto' });
        return;
      }
      if (e.key === 'f') {
        e.preventDefault();
        window.scrollBy({ top: window.innerHeight * 0.88, behavior: 'auto' });
        return;
      }
      if (e.key === 'b') {
        e.preventDefault();
        window.scrollBy({ top: -window.innerHeight * 0.88, behavior: 'auto' });
        return;
      }
      return;
    }

    if (e.metaKey || e.altKey) return;

    // Numeric count prefix (1-9, or 0 after digits)
    if (/^[1-9]$/.test(e.key) || (e.key === '0' && countPrefix.length > 0)) {
      if (!pendingPrefix) {
        setPending('', countPrefix + e.key);
        return;
      }
    }

    const count = Math.max(1, Number(countPrefix || 1));

    // Two-key sequences
    if (pendingPrefix === 'g') {
      resetVimPending();
      if (e.key === 'g') {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    if (pendingPrefix === ']') {
      resetVimPending();
      if (e.key === ']') {
        e.preventDefault();
        jumpSection(1);
      } else if (e.key === 'f') {
        e.preventDefault();
        switchSiblingFile(1);
      }
      return;
    }

    if (pendingPrefix === '[') {
      resetVimPending();
      if (e.key === '[') {
        e.preventDefault();
        jumpSection(-1);
      } else if (e.key === 'f') {
        e.preventDefault();
        switchSiblingFile(-1);
      }
      return;
    }

    if (pendingPrefix === 'z') {
      resetVimPending();
      if (e.key === 'z') {
        e.preventDefault();
        const activeH = headings.find((h) => h.offsetTop >= window.scrollY - 20) || headings[0];
        activeH?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else if (e.key === 'R' || e.key === 'o') {
        e.preventDefault();
        articleEl.querySelectorAll('details').forEach((d) => (d.open = true));
        showToast('Desplegables abiertos');
      } else if (e.key === 'M' || e.key === 'c') {
        e.preventDefault();
        articleEl.querySelectorAll('details').forEach((d) => (d.open = false));
        showToast('Desplegables cerrados');
      } else if (e.key === 'a') {
        e.preventDefault();
        const all = Array.from(articleEl.querySelectorAll('details'));
        const shouldOpen = all.some((d) => !d.open);
        all.forEach((d) => (d.open = shouldOpen));
      }
      return;
    }

    if (pendingPrefix === 'y') {
      resetVimPending();
      if (e.key === 'y') {
        e.preventDefault();
        await navigator.clipboard.writeText(currentFile);
        showToast('Ruta copiada');
      } else if (e.key === 'c') {
        e.preventDefault();
        const cards = Array.from(articleEl.querySelectorAll('.mdv-code-card pre code'));
        const visible = cards.find((c) => {
          const r = c.getBoundingClientRect();
          return r.bottom > 60 && r.top < window.innerHeight;
        });
        if (visible) {
          await navigator.clipboard.writeText(visible.textContent || '');
          showToast('Código copiado');
        }
      }
      return;
    }

    // Start multi-key prefixes
    if (['g', '[', ']', 'z', 'y'].includes(e.key)) {
      e.preventDefault();
      setPending(e.key, countPrefix);
      return;
    }

    resetVimPending();

    switch (e.key) {
      case 'j':
        e.preventDefault();
        window.scrollBy({ top: 72 * count, behavior: 'auto' });
        break;
      case 'k':
        e.preventDefault();
        window.scrollBy({ top: -72 * count, behavior: 'auto' });
        break;
      case 'd':
        e.preventDefault();
        window.scrollBy({ top: window.innerHeight * 0.5 * count, behavior: 'auto' });
        break;
      case 'u':
        e.preventDefault();
        window.scrollBy({ top: -window.innerHeight * 0.5 * count, behavior: 'auto' });
        break;
      case 'f':
        e.preventDefault();
        window.scrollBy({ top: window.innerHeight * 0.88 * count, behavior: 'auto' });
        break;
      case 'b':
        e.preventDefault();
        window.scrollBy({ top: -window.innerHeight * 0.88 * count, behavior: 'auto' });
        break;
      case 'G':
        e.preventDefault();
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        break;
      case '}':
        e.preventDefault();
        jumpSection(1);
        break;
      case '{':
        e.preventDefault();
        jumpSection(-1);
        break;
      case 'h': {
        const car = findVisibleCarousel();
        if (car) {
          e.preventDefault();
          car.prev();
        }
        break;
      }
      case 'l': {
        const car = findVisibleCarousel();
        if (car) {
          e.preventDefault();
          car.next();
        }
        break;
      }
      case '/':
        e.preventDefault();
        openSearchBar();
        break;
      case 'n':
        if (searchHits.length > 0) {
          e.preventDefault();
          focusSearchHit(activeHitIdx + 1);
        }
        break;
      case 'N':
        if (searchHits.length > 0) {
          e.preventDefault();
          focusSearchHit(activeHitIdx - 1);
        }
        break;
      case 't':
        e.preventDefault();
        toggleTocPanel();
        break;
      case 'e':
        e.preventDefault();
        toggleFilesPanel();
        break;
      case 'w':
        e.preventDefault();
        toggleWideMode();
        break;
      case 'c':
        e.preventDefault();
        cycleTheme();
        break;
      case '+':
      case '=':
        e.preventDefault();
        applyZoom(zoomPercent + 10);
        break;
      case '-':
        e.preventDefault();
        applyZoom(zoomPercent - 10);
        break;
      case '0':
        e.preventDefault();
        applyZoom(100);
        break;
      case 'r':
        e.preventDefault();
        if (currentFile) {
          await loadDocument(currentFile, { isLiveReload: true });
          showToast('Recargado');
        }
        break;
      case '?':
        e.preventDefault();
        toggleHelpModal();
        break;
      case 'q':
        e.preventDefault();
        window.close();
        break;
    }
  });

  // TOC Scroll-Spy + Vim Scroll % Indicator
  let headings = [];
  function refreshScrollSpy() {
    headings = Array.from(articleEl.querySelectorAll('.mdv-heading[id]'));
    onScroll();
  }

  function onScroll() {
    const scrollTop = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (vimPosEl) {
      if (maxScroll <= 4) vimPosEl.textContent = 'ALL';
      else if (scrollTop <= 4) vimPosEl.textContent = 'TOP';
      else if (scrollTop >= maxScroll - 4) vimPosEl.textContent = 'BOT';
      else vimPosEl.textContent = `${Math.round((scrollTop / maxScroll) * 100)}%`;
    }

    if (!headings.length || !tocListEl) return;
    let activeId = headings[0].id;
    const threshold = scrollTop + 110;
    for (const h of headings) {
      if (h.offsetTop <= threshold) {
        activeId = h.id;
      } else {
        break;
      }
    }
    tocListEl.querySelectorAll('.mdv-toc-item').forEach((li) => {
      li.classList.toggle('is-active', li.getAttribute('data-toc-id') === activeId);
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  function renderToc(toc) {
    if (!tocListEl) return;
    tocListEl.innerHTML = toc
      .map(
        (item) =>
          `<li class="mdv-toc-item mdv-toc-level-${item.level}" data-toc-id="${item.id}"><a href="#${item.id}">${item.text}</a></li>`
      )
      .join('');
  }

  function revealActiveFileInTree(activePath) {
    if (!fileListEl) return;
    let activeLi = null;
    fileListEl.querySelectorAll('.mdv-file-item').forEach((li) => {
      const isCur = li.getAttribute('data-file-path') === activePath;
      li.classList.toggle('is-current', isCur);
      if (isCur) activeLi = li;
    });
    if (activeLi) {
      let parent = activeLi.parentElement;
      while (parent && parent !== fileListEl) {
        if (parent.matches('details.mdv-folder-details')) parent.open = true;
        parent = parent.parentElement;
      }
      activeLi.scrollIntoView({ block: 'nearest' });
    }
  }

  async function loadDocument(filePath, { pushState = false, hash = '', isLiveReload = false } = {}) {
    const scrollBefore = window.scrollY;
    const isSameFile = filePath === currentFile;

    // Preserve <details open> states across live reloads
    const openDetailsIndices = isSameFile
      ? Array.from(articleEl.querySelectorAll('details')).map((d) => d.open)
      : null;

    // Preserve open folder states in left tree
    const openFolders = fileListEl
      ? new Set(
          Array.from(fileListEl.querySelectorAll('.mdv-tree-dir'))
            .filter((li) => li.querySelector(':scope > details.mdv-folder-details')?.open)
            .map((li) => li.getAttribute('data-dir-path'))
        )
      : null;

    const res = await fetch(`/api/doc?file=${encodeURIComponent(filePath)}&_t=${Date.now()}`, {
      cache: 'no-store'
    });
    if (!res.ok) return;
    const data = await res.json();
    currentFile = data.filePath;
    articleEl.innerHTML = data.html;

    if (openDetailsIndices) {
      articleEl.querySelectorAll('details').forEach((d, idx) => {
        if (idx < openDetailsIndices.length) d.open = openDetailsIndices[idx];
      });
    }

    if (fileNameEl) fileNameEl.textContent = data.relPath || data.fileName;
    if (totalFilesEl && typeof data.totalFiles === 'number') {
      totalFilesEl.textContent = String(data.totalFiles);
    }
    document.title = `${data.title || data.fileName} — mdv`;
    renderToc(data.toc || []);

    if (data.treeHtml && fileListEl) {
      fileListEl.innerHTML = data.treeHtml;
      if (openFolders && openFolders.size > 0) {
        fileListEl.querySelectorAll('.mdv-tree-dir').forEach((li) => {
          const det = li.querySelector(':scope > details.mdv-folder-details');
          if (det && openFolders.has(li.getAttribute('data-dir-path'))) det.open = true;
        });
      }
      if (fileFilterEl?.value) applyFileTreeFilter(fileFilterEl.value);
    }
    revealActiveFileInTree(currentFile);

    initCarousels();
    await renderMermaidDiagrams();
    if (lastQuery) highlightQuery(lastQuery);
    refreshScrollSpy();

    if (isLiveReload) flashReloadIndicator();

    if (pushState) {
      history.pushState({ file: currentFile }, '', `/?file=${encodeURIComponent(currentFile)}${hash || ''}`);
    }
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
    } else if (isSameFile) {
      window.scrollTo({ top: scrollBefore, behavior: 'instant' });
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  window.addEventListener('popstate', (e) => {
    const f = e.state?.file || new URLSearchParams(location.search).get('file');
    if (f) loadDocument(f, { pushState: false, hash: location.hash });
  });

  // Live-reload SSE connection with auto-reconnect
  function connectEvents() {
    const es = new EventSource('/events');
    es.onopen = () => liveDotEl?.classList.remove('is-disconnected');
    es.onerror = () => liveDotEl?.classList.add('is-disconnected');
    es.addEventListener('reload', () => {
      if (currentFile) loadDocument(currentFile, { isLiveReload: true });
    });
  }

  // Boot
  initCarousels();
  renderMermaidDiagrams();
  refreshScrollSpy();
  connectEvents();
})();
