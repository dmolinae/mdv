(function () {
  const THEMES = ['tokyo', 'github-dark', 'catppuccin', 'light'];

  const sidebarFilesEl = document.querySelector('.mdv-sidebar-files');
  const panesRootEl = document.getElementById('mdv-panes-root');
  const resizerEl = document.getElementById('mdv-split-resizer');
  const tocListEl = document.getElementById('mdv-toc-list');
  const fileListEl = document.getElementById('mdv-file-list');
  const fileNameEl = document.getElementById('mdv-filename');
  const liveDotEl = document.getElementById('mdv-live-dot');
  const reloadPillEl = document.getElementById('mdv-reload-pill');
  const themeSelect = document.getElementById('mdv-theme-select');
  const btnFiles = document.getElementById('mdv-toggle-files');
  const btnToc = document.getElementById('mdv-toggle-toc');
  const btnWide = document.getElementById('mdv-toggle-wide');
  const btnSplitV = document.getElementById('mdv-split-vertical');
  const btnSplitH = document.getElementById('mdv-split-horizontal');
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

  const initCfg = window.__MDV_INITIAL__ || {};
  const OSGlobal = window.OverlayScrollbarsGlobal;
  const OverlayScrollbars = OSGlobal?.OverlayScrollbars;
  if (OverlayScrollbars && OSGlobal?.ClickScrollPlugin) {
    OverlayScrollbars.plugin(OSGlobal.ClickScrollPlugin);
  }

  const OS_MAIN_OPTS = {
    scrollbars: {
      theme: 'os-theme-mdv',
      autoHide: 'scroll',
      autoHideDelay: 650,
      clickScroll: true
    }
  };

  const OS_SIDE_OPTS = {
    scrollbars: {
      theme: 'os-theme-mdv',
      autoHide: 'leave',
      autoHideDelay: 350,
      clickScroll: true
    }
  };

  const OS_BLOCK_OPTS = {
    overflow: { x: 'scroll', y: 'hidden' },
    scrollbars: {
      theme: 'os-theme-mdv',
      autoHide: 'leave',
      autoHideDelay: 300,
      clickScroll: true
    }
  };

  function initHorizontalBlockScrollbars(scope) {
    if (!OverlayScrollbars || !scope) return;
    scope
      .querySelectorAll('.mdv-code-card pre, .mdv-table-wrap, .mdv-mermaid-stage, .mdv-math-block')
      .forEach((el) => {
        OverlayScrollbars(el, OS_BLOCK_OPTS);
      });
  }

  let splitMode = 'none'; // 'none' | 'vertical' | 'horizontal'
  let focusedPaneIdx = 0;
  let focusZone = 'pane'; // 'pane' | 'files'
  let treeCursorEl = null; // Currently highlighted .mdv-file-item or .mdv-folder-summary in 'files' zone
  let syncScroll = false;
  let isSyncingScroll = false;
  let splitRatio = 0.5;
  let zoomPercent = Number(localStorage.getItem('mdv-zoom') || 100);
  let reloadPillTimer = null;
  let toastTimer = null;

  const panes = [0, 1].map((idx) => {
    const section = document.querySelector(`.mdv-pane[data-pane-index="${idx}"]`);
    const scrollerHost = section.querySelector('[data-pane-scroller]');
    const osInstance = OverlayScrollbars ? OverlayScrollbars(scrollerHost, OS_MAIN_OPTS) : null;
    const scrollerViewport = osInstance ? osInstance.elements().viewport : scrollerHost;
    return {
      idx,
      section,
      scrollerHost,
      osInstance,
      scroller: scrollerViewport,
      article: section.querySelector('[data-pane-article]'),
      titleEl: section.querySelector('[data-pane-title]'),
      filePath: idx === 0 ? initCfg.currentFile || '' : '',
      relPath: idx === 0 ? initCfg.initialRelPath || '' : '',
      toc: idx === 0 ? initCfg.initialToc || [] : [],
      headings: [],
      carouselState: new Map(),
      carouselControllers: []
    };
  });

  // Initialize OverlayScrollbars on Left Files Sidebar, Right TOC Sidebar, and Modal
  const filesScrollEl = document.getElementById('mdv-files-scroll');
  const tocScrollEl = document.getElementById('mdv-toc-scroll');
  const modalScrollEl = document.getElementById('mdv-modal-scroll');
  let filesOsInstance = null;
  if (OverlayScrollbars) {
    if (filesScrollEl) filesOsInstance = OverlayScrollbars(filesScrollEl, OS_SIDE_OPTS);
    if (tocScrollEl) OverlayScrollbars(tocScrollEl, OS_SIDE_OPTS);
    if (modalScrollEl) {
      OverlayScrollbars(modalScrollEl, {
        scrollbars: { theme: 'os-theme-mdv', autoHide: 'leave', autoHideDelay: 350, clickScroll: true }
      });
    }
  }

  function activePane() {
    return panes[focusedPaneIdx] || panes[0];
  }

  // Theme & layout persistence
  const savedTheme = localStorage.getItem('mdv-theme') || initCfg.defaultTheme || 'tokyo';
  applyTheme(savedTheme, false);
  applyZoom(zoomPercent, false);

  if (localStorage.getItem('mdv-wide') === '1') {
    document.body.classList.add('wide-mode');
    btnWide?.classList.add('is-active');
  }
  if (!initCfg.dirMode && localStorage.getItem('mdv-hide-files') === '1') {
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
    }, 1450);
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
    if (rerenderDiagrams) {
      fetch('/api/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme })
      }).catch(() => {});
      renderMermaidDiagrams(panes[0].article);
      if (splitMode !== 'none') renderMermaidDiagrams(panes[1].article);
    }
  }

  function cycleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'tokyo';
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    applyTheme(next, true);
    showToast(`Tema: ${next}`);
  }

  function applyZoom(pct, announce = true) {
    zoomPercent = Math.min(160, Math.max(75, pct));
    panes.forEach((p) => {
      p.article.style.fontSize = `${zoomPercent}%`;
    });
    localStorage.setItem('mdv-zoom', String(zoomPercent));
    if (announce) showToast(`Zoom: ${zoomPercent}%`);
  }

  function toggleFilesPanel() {
    const hidden = document.body.classList.toggle('hide-files');
    btnFiles?.classList.toggle('is-active', !hidden);
    localStorage.setItem('mdv-hide-files', hidden ? '1' : '0');
    if (hidden && focusZone === 'files') {
      setFocusZone('pane', focusedPaneIdx, false);
    }
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

  // Focus Zone & Vim File Browser Cursor Management ('files' <-> 'pane')
  function getNavigableTreeItems() {
    if (!fileListEl) return [];
    const result = [];
    function collectFromUl(ul) {
      for (const li of ul.children) {
        if (li.hidden) continue;
        if (li.classList.contains('mdv-tree-dir')) {
          const det = li.querySelector(':scope > details.mdv-folder-details');
          const sum = det?.querySelector(':scope > summary.mdv-folder-summary');
          if (sum) result.push(sum);
          if (det?.open) {
            const subUl = det.querySelector(':scope > ul.mdv-tree-children');
            if (subUl) collectFromUl(subUl);
          }
        } else if (li.classList.contains('mdv-file-item')) {
          result.push(li);
        }
      }
    }
    collectFromUl(fileListEl);
    return result;
  }

  function setTreeCursor(el) {
    if (treeCursorEl) treeCursorEl.classList.remove('is-tree-cursor');
    treeCursorEl = el || null;
    if (treeCursorEl && focusZone === 'files') {
      treeCursorEl.classList.add('is-tree-cursor');
      treeCursorEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function moveTreeCursor(delta) {
    const items = getNavigableTreeItems();
    if (!items.length) return;
    let curIdx = treeCursorEl ? items.indexOf(treeCursorEl) : -1;
    if (curIdx === -1) {
      const currentFileLi = items.find((el) => el.classList?.contains('is-current'));
      curIdx = currentFileLi ? items.indexOf(currentFileLi) : 0;
    } else {
      curIdx = Math.min(items.length - 1, Math.max(0, curIdx + delta));
    }
    setTreeCursor(items[curIdx]);
  }

  async function activateTreeCursorItem({ openInSplit = false, stayInFiles = false } = {}) {
    if (!treeCursorEl) {
      moveTreeCursor(0);
      if (!treeCursorEl) return;
    }
    if (treeCursorEl.classList.contains('mdv-folder-summary')) {
      const det = treeCursorEl.closest('details.mdv-folder-details');
      if (det) det.open = !det.open;
      return;
    }
    if (treeCursorEl.classList.contains('mdv-file-item')) {
      const targetPath = treeCursorEl.getAttribute('data-file-path');
      if (!targetPath) return;
      if (openInSplit) {
        await openSplit(splitMode === 'none' ? 'vertical' : splitMode, targetPath);
        if (stayInFiles) setFocusZone('files', focusedPaneIdx, false);
      } else {
        await loadDocumentInPane(focusedPaneIdx, targetPath, { pushState: focusedPaneIdx === 0 });
        if (!stayInFiles) {
          setFocusZone('pane', focusedPaneIdx, false);
        } else {
          // Re-bind treeCursorEl since tree HTML refreshed
          const refreshed = fileListEl?.querySelector(`.mdv-file-item[data-file-path="${CSS.escape(targetPath)}"]`);
          setTreeCursor(refreshed);
        }
      }
    }
  }

  function setFocusZone(zone, paneIdx = focusedPaneIdx, announce = true) {
    if (zone === 'files') {
      if (document.body.classList.contains('hide-files')) {
        document.body.classList.remove('hide-files');
        btnFiles?.classList.add('is-active');
        localStorage.setItem('mdv-hide-files', '0');
      }
      focusZone = 'files';
      sidebarFilesEl?.classList.add('is-zone-focused');
      panes.forEach((p) => p.section.classList.remove('is-zone-focused'));
      const items = getNavigableTreeItems();
      const validExisting = treeCursorEl && items.includes(treeCursorEl) ? treeCursorEl : null;
      const initialItem =
        validExisting || items.find((el) => el.classList?.contains('is-current')) || items[0] || null;
      setTreeCursor(initialItem);
      if (vimPosEl) vimPosEl.textContent = 'FILES';
      if (announce) showToast('Foco: Archivos (j/k mover, o/Enter abrir)');
    } else {
      focusZone = 'pane';
      sidebarFilesEl?.classList.remove('is-zone-focused');
      if (treeCursorEl) treeCursorEl.classList.remove('is-tree-cursor');
      focusPane(paneIdx);
      panes.forEach((p, i) => p.section.classList.toggle('is-zone-focused', i === focusedPaneIdx));
      if (announce) {
        showToast(splitMode === 'none' ? 'Foco: Documento' : `Foco: Panel ${focusedPaneIdx + 1}`);
      }
    }
  }

  // Spatial Alt + Arrow navigation across [Archivos] <-> [Pane 0] <-> [Pane 1]
  function handleAltArrowNavigation(arrowKey) {
    if (document.activeElement?.matches('input, textarea, select')) {
      document.activeElement.blur();
    }
    if (arrowKey === 'ArrowLeft') {
      if (focusZone === 'pane') {
        if (splitMode === 'vertical' && focusedPaneIdx === 1) {
          setFocusZone('pane', 0);
        } else {
          setFocusZone('files');
        }
      }
    } else if (arrowKey === 'ArrowRight') {
      if (focusZone === 'files') {
        setFocusZone('pane', splitMode === 'vertical' ? 0 : focusedPaneIdx);
      } else if (focusZone === 'pane' && splitMode === 'vertical' && focusedPaneIdx === 0) {
        setFocusZone('pane', 1);
      }
    } else if (arrowKey === 'ArrowDown') {
      if (focusZone === 'pane' && splitMode === 'horizontal' && focusedPaneIdx === 0) {
        setFocusZone('pane', 1);
      } else if (focusZone === 'files') {
        moveTreeCursor(1);
      }
    } else if (arrowKey === 'ArrowUp') {
      if (focusZone === 'pane' && splitMode === 'horizontal' && focusedPaneIdx === 1) {
        setFocusZone('pane', 0);
      } else if (focusZone === 'files') {
        moveTreeCursor(-1);
      }
    }
  }

  // Split View Management
  function applySplitSizes(ratio = splitRatio) {
    splitRatio = Math.min(0.82, Math.max(0.18, ratio));
    if (splitMode === 'none') {
      panes[0].section.style.flex = '1 1 100%';
      panes[1].section.style.flex = '1 1 50%';
    } else {
      const pctA = (splitRatio * 100).toFixed(2);
      const pctB = ((1 - splitRatio) * 100).toFixed(2);
      panes[0].section.style.flex = `0 0 calc(${pctA}% - 3px)`;
      panes[1].section.style.flex = `0 0 calc(${pctB}% - 3px)`;
    }
  }

  function updateSplitButtonsUI() {
    btnSplitV?.classList.toggle('is-active', splitMode === 'vertical');
    btnSplitH?.classList.toggle('is-active', splitMode === 'horizontal');
    document.querySelectorAll('[data-pane-sync]').forEach((b) => b.classList.toggle('is-active', syncScroll));
  }

  function focusPane(idx) {
    if (splitMode === 'none') idx = 0;
    focusedPaneIdx = idx;
    panes.forEach((p, i) => {
      p.section.classList.toggle('is-focused', i === idx);
      p.section.classList.toggle('is-zone-focused', focusZone === 'pane' && i === idx);
    });
    const p = activePane();
    if (fileNameEl) fileNameEl.textContent = p.relPath || p.filePath.split('/').pop() || '';
    renderToc(p.toc);
    refreshHeadings(p);
    onPaneScroll(p);
    updateFileTreeMarkers();
    if (lastQuery) highlightQuery(lastQuery);
  }

  async function openSplit(direction = 'vertical', targetFile = null) {
    const wasNone = splitMode === 'none';
    if (!wasNone && splitMode === direction && !targetFile) {
      closePane(1);
      return;
    }
    splitMode = direction;
    panesRootEl.setAttribute('data-split-mode', direction);
    panes[1].section.hidden = false;
    if (resizerEl) resizerEl.hidden = false;
    applySplitSizes(wasNone ? 0.5 : splitRatio);
    updateSplitButtonsUI();

    const fileForPane1 = targetFile || panes[1].filePath || panes[0].filePath;
    await loadDocumentInPane(1, fileForPane1, { preserveScroll: !targetFile && Boolean(panes[1].filePath) });
    if (wasNone && !targetFile) {
      panes[1].scroller.scrollTop = panes[0].scroller.scrollTop;
    }
    setFocusZone('pane', 1, false);
    showToast(direction === 'vertical' ? 'Split Right activo' : 'Split Down activo');
  }

  function closePane(idxToClose) {
    if (splitMode === 'none') {
      window.close();
      return;
    }
    if (idxToClose === 0) {
      copyPaneState(panes[1], panes[0]);
    }
    splitMode = 'none';
    syncScroll = false;
    panesRootEl.setAttribute('data-split-mode', 'none');
    panes[1].section.hidden = true;
    if (resizerEl) resizerEl.hidden = true;
    applySplitSizes(0.5);
    updateSplitButtonsUI();
    setFocusZone('pane', 0, false);
    showToast('Split cerrado');
  }

  function copyPaneState(src, dst) {
    const srcScroll = src.scroller.scrollTop;
    dst.filePath = src.filePath;
    dst.relPath = src.relPath;
    dst.toc = [...src.toc];
    dst.article.innerHTML = src.article.innerHTML;
    if (dst.titleEl) dst.titleEl.textContent = dst.relPath;
    dst.carouselState = new Map(src.carouselState);
    initCarouselsForPane(dst);
    initHorizontalBlockScrollbars(dst.article);
    refreshHeadings(dst);
    dst.scroller.scrollTop = srcScroll;
  }

  function swapPanes() {
    if (splitMode === 'none') return;
    const scroll0 = panes[0].scroller.scrollTop;
    const scroll1 = panes[1].scroller.scrollTop;
    const tmp = {
      filePath: panes[0].filePath,
      relPath: panes[0].relPath,
      toc: [...panes[0].toc],
      html: panes[0].article.innerHTML,
      carouselState: new Map(panes[0].carouselState)
    };
    copyPaneState(panes[1], panes[0]);
    panes[1].filePath = tmp.filePath;
    panes[1].relPath = tmp.relPath;
    panes[1].toc = tmp.toc;
    panes[1].article.innerHTML = tmp.html;
    if (panes[1].titleEl) panes[1].titleEl.textContent = tmp.relPath;
    panes[1].carouselState = tmp.carouselState;
    initCarouselsForPane(panes[1]);
    initHorizontalBlockScrollbars(panes[1].article);
    refreshHeadings(panes[1]);
    panes[0].scroller.scrollTop = scroll1;
    panes[1].scroller.scrollTop = scroll0;
    focusPane(focusedPaneIdx);
    showToast('Paneles intercambiados');
  }

  function toggleSyncScroll() {
    if (splitMode === 'none') return;
    syncScroll = !syncScroll;
    updateSplitButtonsUI();
    showToast(syncScroll ? 'Scroll sincronizado: ON' : 'Scroll sincronizado: OFF');
  }

  // Draggable Resizer
  resizerEl?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resizerEl.setPointerCapture(e.pointerId);
    resizerEl.classList.add('is-dragging');
    const onMove = (ev) => {
      const rect = panesRootEl.getBoundingClientRect();
      if (splitMode === 'vertical') {
        applySplitSizes((ev.clientX - rect.left) / rect.width);
      } else if (splitMode === 'horizontal') {
        applySplitSizes((ev.clientY - rect.top) / rect.height);
      }
    };
    const onUp = () => {
      resizerEl.classList.remove('is-dragging');
      resizerEl.removeEventListener('pointermove', onMove);
      resizerEl.removeEventListener('pointerup', onUp);
    };
    resizerEl.addEventListener('pointermove', onMove);
    resizerEl.addEventListener('pointerup', onUp);
  });
  resizerEl?.addEventListener('dblclick', () => {
    applySplitSizes(0.5);
    showToast('Paneles 50 / 50');
  });

  // Focus zones on pointer interaction
  panes.forEach((p) => {
    p.section.addEventListener('pointerdown', () => {
      if (focusZone !== 'pane' || (splitMode !== 'none' && focusedPaneIdx !== p.idx)) {
        setFocusZone('pane', p.idx, false);
      }
    });
  });

  sidebarFilesEl?.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input, button')) return;
    if (focusZone !== 'files') {
      setFocusZone('files', focusedPaneIdx, false);
    }
  });

  themeSelect?.addEventListener('change', (e) => applyTheme(e.target.value, true));
  btnFiles?.addEventListener('click', toggleFilesPanel);
  btnToc?.addEventListener('click', toggleTocPanel);
  btnWide?.addEventListener('click', toggleWideMode);
  btnSplitV?.addEventListener('click', () => openSplit('vertical'));
  btnSplitH?.addEventListener('click', () => openSplit('horizontal'));
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
    fileListEl.querySelectorAll('.mdv-file-item').forEach((li) => {
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
    if (focusZone === 'files') {
      const items = getNavigableTreeItems();
      setTreeCursor(items[0] || null);
    }
  }

  fileFilterEl?.addEventListener('input', () => applyFileTreeFilter(fileFilterEl.value));
  fileFilterEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      fileFilterEl.value = '';
      applyFileTreeFilter('');
      fileFilterEl.blur();
      setFocusZone('files', focusedPaneIdx, false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      fileFilterEl.blur();
      setFocusZone('files', focusedPaneIdx, false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const firstVisible = fileListEl?.querySelector('.mdv-file-item:not([hidden])');
      const targetPath = firstVisible?.getAttribute('data-file-path');
      if (targetPath) {
        fileFilterEl.blur();
        if (e.altKey || e.shiftKey) openSplit(splitMode === 'none' ? 'vertical' : splitMode, targetPath);
        else {
          loadDocumentInPane(focusedPaneIdx, targetPath, { pushState: focusedPaneIdx === 0 });
          setFocusZone('pane', focusedPaneIdx, false);
        }
      }
    }
  });

  // Per-pane Carousels
  function initCarouselsForPane(pane) {
    pane.carouselControllers.length = 0;
    pane.article.querySelectorAll('[data-carousel]').forEach((carousel, idx) => {
      const id = carousel.getAttribute('data-carousel-id') || String(idx);
      const slides = Array.from(carousel.querySelectorAll('.mdv-carousel-slide'));
      const dots = Array.from(carousel.querySelectorAll('.mdv-carousel-dot'));
      const prevBtn = carousel.querySelector('[data-carousel-prev]');
      const nextBtn = carousel.querySelector('[data-carousel-next]');
      const currentEl = carousel.querySelector('[data-carousel-current]');
      if (slides.length === 0) return;

      let active = Math.min(pane.carouselState.get(id) || 0, slides.length - 1);

      const goTo = (nextIdx) => {
        active = (nextIdx + slides.length) % slides.length;
        pane.carouselState.set(id, active);
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
        if (e.key === 'ArrowLeft' && !e.altKey) {
          e.preventDefault();
          goTo(active - 1);
        } else if (e.key === 'ArrowRight' && !e.altKey) {
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

      pane.carouselControllers.push({
        el: carousel,
        prev: () => goTo(active - 1),
        next: () => goTo(active + 1)
      });
    });
  }

  function findVisibleCarouselInPane(pane) {
    const scrollerRect = pane.scroller.getBoundingClientRect();
    let best = null;
    let bestOverlap = 0;
    for (const ctrl of pane.carouselControllers) {
      const rect = ctrl.el.getBoundingClientRect();
      const overlap = Math.min(rect.bottom, scrollerRect.bottom) - Math.max(rect.top, scrollerRect.top);
      if (overlap > bestOverlap && overlap > 60) {
        bestOverlap = overlap;
        best = ctrl;
      }
    }
    return best;
  }

  // Mermaid Diagrams
  async function renderMermaidDiagrams(scope) {
    if (!window.mermaid || !scope) return;
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

  // In-document Search in Focused Pane (/, n, N)
  let searchHits = [];
  let activeHitIdx = -1;
  let lastQuery = '';

  function clearSearchHighlights() {
    panes.forEach((p) => {
      p.article.querySelectorAll('mark.mdv-search-hit').forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
        parent.normalize();
      });
    });
    searchHits = [];
    activeHitIdx = -1;
    if (searchCountEl) searchCountEl.textContent = '0 / 0';
  }

  function highlightQuery(query) {
    clearSearchHighlights();
    lastQuery = query;
    if (!query) return;

    const targetArticle = activePane().article;
    const lowerQ = query.toLowerCase();
    const walker = document.createTreeWalker(targetArticle, NodeFilter.SHOW_TEXT, {
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
      const scrollerTop = activePane().scroller.getBoundingClientRect().top;
      const firstBelow = searchHits.findIndex((m) => m.getBoundingClientRect().top >= scrollerTop + 10);
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
      else searchInputEl.blur();
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
          <span>Atajos Vim, Navegador de Archivos y Split Views</span>
          <span class="mdv-kbd">Esc / ?</span>
        </h3>
        <div class="mdv-help-grid">
          <div class="mdv-help-section">
            <h4>Foco y Navegador de Archivos</h4>
            <div class="mdv-help-row"><span>Cambiar entre Archivos y Paneles</span><span><kbd class="mdv-kbd">Alt + ← → ↑ ↓</kbd></span></div>
            <div class="mdv-help-row"><span>Moverse en árbol de archivos</span><span><kbd class="mdv-kbd">j</kbd> / <kbd class="mdv-kbd">k</kbd></span></div>
            <div class="mdv-help-row"><span>Abrir archivo / carpeta</span><span><kbd class="mdv-kbd">o</kbd> o <kbd class="mdv-kbd">Enter</kbd></span></div>
            <div class="mdv-help-row"><span>Previsualizar sin salir del árbol</span><span><kbd class="mdv-kbd">O</kbd></span></div>
            <div class="mdv-help-row"><span>Expandir / cerrar carpeta</span><span><kbd class="mdv-kbd">l</kbd> / <kbd class="mdv-kbd">h</kbd></span></div>
            <div class="mdv-help-row"><span>Filtro rápido de archivos</span><span><kbd class="mdv-kbd">Ctrl+P</kbd></span></div>
          </div>
          <div class="mdv-help-section">
            <h4>Split Views</h4>
            <div class="mdv-help-row"><span>Split Right / Split Down</span><span><kbd class="mdv-kbd">Ctrl+Alt+R</kbd> / <kbd class="mdv-kbd">Ctrl+Alt+D</kbd></span></div>
            <div class="mdv-help-row"><span>Alternativa Vim Split</span><span><kbd class="mdv-kbd">Espacio v</kbd> / <kbd class="mdv-kbd">Espacio s</kbd></span></div>
            <div class="mdv-help-row"><span>Intercambiar / Igualar 50:50</span><span><kbd class="mdv-kbd">Espacio x</kbd> / <kbd class="mdv-kbd">Espacio =</kbd></span></div>
            <div class="mdv-help-row"><span>Sincronizar scroll</span><span><kbd class="mdv-kbd">Espacio y</kbd></span></div>
            <div class="mdv-help-row"><span>Cerrar panel / Solo este panel</span><span><kbd class="mdv-kbd">q</kbd> / <kbd class="mdv-kbd">Espacio o</kbd></span></div>
          </div>
          <div class="mdv-help-section">
            <h4>Lectura y Componentes</h4>
            <div class="mdv-help-row"><span>Bajar / Subir · Media pág.</span><span><kbd class="mdv-kbd">j</kbd>/<kbd class="mdv-kbd">k</kbd> · <kbd class="mdv-kbd">d</kbd>/<kbd class="mdv-kbd">u</kbd></span></div>
            <div class="mdv-help-row"><span>Inicio / Final · Secciones</span><span><kbd class="mdv-kbd">gg</kbd>/<kbd class="mdv-kbd">G</kbd> · <kbd class="mdv-kbd">]]</kbd>/<kbd class="mdv-kbd">[[</kbd></span></div>
            <div class="mdv-help-row"><span>Carrusel anterior / siguiente</span><span><kbd class="mdv-kbd">h</kbd> / <kbd class="mdv-kbd">l</kbd></span></div>
            <div class="mdv-help-row"><span>Buscar / Siguiente / Anterior</span><span><kbd class="mdv-kbd">/</kbd> · <kbd class="mdv-kbd">n</kbd> · <kbd class="mdv-kbd">N</kbd></span></div>
            <div class="mdv-help-row"><span>Índice / Archivos / Tema</span><span><kbd class="mdv-kbd">t</kbd> · <kbd class="mdv-kbd">e</kbd> · <kbd class="mdv-kbd">c</kbd></span></div>
          </div>
        </div>
      </div>`;
    modalEl.hidden = false;
  }

  // Delegated clicks
  document.addEventListener('click', async (e) => {
    const splitOpenBtn = e.target.closest('[data-open-in-split]');
    if (splitOpenBtn) {
      e.preventDefault();
      e.stopPropagation();
      const file = splitOpenBtn.getAttribute('data-open-in-split');
      if (file) await openSplit(splitMode === 'none' ? 'vertical' : splitMode, file);
      return;
    }

    const paneCloseBtn = e.target.closest('[data-pane-close]');
    if (paneCloseBtn) {
      closePane(Number(paneCloseBtn.getAttribute('data-pane-close') || 1));
      return;
    }

    if (e.target.closest('[data-pane-swap]')) {
      swapPanes();
      return;
    }

    if (e.target.closest('[data-pane-sync]')) {
      toggleSyncScroll();
      return;
    }

    const tocAnchor = e.target.closest('#mdv-toc-list a');
    if (tocAnchor) {
      e.preventDefault();
      const id = tocAnchor.getAttribute('href')?.slice(1);
      if (id) {
        const target = activePane().article.querySelector(`#${CSS.escape(id)}`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

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
        if (e.altKey || e.shiftKey) {
          await openSplit(splitMode === 'none' ? 'vertical' : splitMode, targetFile);
        } else {
          await loadDocumentInPane(focusedPaneIdx, targetFile, {
            pushState: focusedPaneIdx === 0,
            hash: url.hash
          });
          setFocusZone('pane', focusedPaneIdx, false);
        }
      }
    }
  });

  // Vim Keybinding Engine (Capture phase on window so Alt+Arrows & Ctrl+Alt/AltGraph shortcuts ALWAYS fire!)
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
      prefixTimer = setTimeout(() => resetVimPending(), 1800);
    }
  }

  function resetVimPending() {
    pendingPrefix = '';
    countPrefix = '';
    if (vimKeysEl) vimKeysEl.hidden = true;
  }

  function jumpSection(dir) {
    const pane = activePane();
    if (!pane.headings.length) return;
    const scrollerTop = pane.scroller.getBoundingClientRect().top;
    if (dir > 0) {
      const next = pane.headings.find((h) => h.getBoundingClientRect().top > scrollerTop + 28);
      (next || pane.headings[pane.headings.length - 1]).scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const prev = [...pane.headings].reverse().find((h) => h.getBoundingClientRect().top < scrollerTop - 12);
      (prev || pane.headings[0]).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function switchSiblingFile(dir) {
    if (!fileListEl) return;
    const items = Array.from(fileListEl.querySelectorAll('.mdv-file-item'));
    if (items.length <= 1) return;
    const curPath = activePane().filePath;
    const curIdx = items.findIndex((li) => li.getAttribute('data-file-path') === curPath);
    const nextIdx = ((curIdx >= 0 ? curIdx : 0) + dir + items.length) % items.length;
    const pathAttr = items[nextIdx].getAttribute('data-file-path');
    if (pathAttr) loadDocumentInPane(focusedPaneIdx, pathAttr, { pushState: focusedPaneIdx === 0 });
  }

  window.addEventListener(
    'keydown',
    async (e) => {
      const inInput = Boolean(e.target?.matches?.('input, textarea, select'));
      const isAltGraph = Boolean(e.getModifierState && e.getModifierState('AltGraph'));
      const isCtrlAlt = (e.ctrlKey && e.altKey && !e.metaKey) || (!inInput && isAltGraph && !e.metaKey);

      // 1. Ctrl + Alt + R (Split Right) & Ctrl + Alt + D (Split Down)
      // Handles Windows Spanish/LATAM keyboards where Ctrl+Alt sends AltGraph!
      if (isCtrlAlt) {
        if (e.code === 'KeyR' || e.key?.toLowerCase() === 'r') {
          e.preventDefault();
          e.stopPropagation();
          if (focusZone === 'files' && treeCursorEl?.classList.contains('mdv-file-item')) {
            await activateTreeCursorItem({ openInSplit: true });
          } else {
            await openSplit('vertical');
          }
          return;
        }
        if (e.code === 'KeyD' || e.key?.toLowerCase() === 'd') {
          e.preventDefault();
          e.stopPropagation();
          if (focusZone === 'files' && treeCursorEl?.classList.contains('mdv-file-item')) {
            const p = treeCursorEl.getAttribute('data-file-path');
            await openSplit('horizontal', p || null);
          } else {
            await openSplit('horizontal');
          }
          return;
        }
      }

      // 2. Alt + Arrow keys: switch focus cleanly between File Browser <-> Open Document Panes
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
      ) {
        e.preventDefault();
        e.stopPropagation();
        resetVimPending();
        handleAltArrowNavigation(e.key);
        return;
      }

      if (inInput) return;

      const pane = activePane();
      const scroller = pane.scroller;

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
        if (focusZone === 'files') {
          setFocusZone('pane', focusedPaneIdx);
          return;
        }
        if (searchHits.length > 0) {
          clearSearchHighlights();
          showToast('Búsqueda limpia');
        }
        return;
      }

      // Handle pending <Leader> (Space) or ^W Split Window commands!
      if (pendingPrefix === '␣' || pendingPrefix === '^W') {
        resetVimPending();
        e.preventDefault();
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (k === 'v' || k === '|' || k === 'r') await openSplit('vertical');
        else if (k === 's' || k === '-' || k === 'd') await openSplit('horizontal');
        else if (k === 'w' || k === ' ') {
          if (splitMode !== 'none') setFocusZone('pane', focusedPaneIdx === 0 ? 1 : 0);
        } else if (k === 'h' || k === 'arrowleft') {
          handleAltArrowNavigation('ArrowLeft');
        } else if (k === 'l' || k === 'arrowright') {
          handleAltArrowNavigation('ArrowRight');
        } else if (k === 'k' || k === 'arrowup') {
          if (splitMode === 'horizontal') setFocusZone('pane', 0);
        } else if (k === 'j' || k === 'arrowdown') {
          if (splitMode === 'horizontal') setFocusZone('pane', 1);
        } else if (k === 'x') {
          swapPanes();
        } else if (k === '=') {
          applySplitSizes(0.5);
          showToast('Paneles 50 / 50');
        } else if (k === 'y') {
          toggleSyncScroll();
        } else if (k === 'q' || k === 'c') {
          closePane(focusedPaneIdx);
        } else if (k === 'o') {
          if (splitMode !== 'none') closePane(focusedPaneIdx === 0 ? 1 : 0);
        }
        return;
      }

      // Ctrl shortcuts
      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key === 'p') {
          e.preventDefault();
          if (document.body.classList.contains('hide-files')) toggleFilesPanel();
          fileFilterEl?.focus();
          fileFilterEl?.select();
          return;
        }
        if (focusZone === 'pane') {
          if (e.key === 'd') {
            e.preventDefault();
            scroller.scrollBy({ top: scroller.clientHeight * 0.5, behavior: 'auto' });
            return;
          }
          if (e.key === 'u') {
            e.preventDefault();
            scroller.scrollBy({ top: -scroller.clientHeight * 0.5, behavior: 'auto' });
            return;
          }
          if (e.key === 'f') {
            e.preventDefault();
            scroller.scrollBy({ top: scroller.clientHeight * 0.88, behavior: 'auto' });
            return;
          }
          if (e.key === 'b') {
            e.preventDefault();
            scroller.scrollBy({ top: -scroller.clientHeight * 0.88, behavior: 'auto' });
            return;
          }
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

      // =========================================================
      // MODE A: FILE BROWSER VIM NAVIGATION (focusZone === 'files')
      // =========================================================
      if (focusZone === 'files') {
        if (pendingPrefix === 'g') {
          resetVimPending();
          if (e.key === 'g') {
            e.preventDefault();
            const items = getNavigableTreeItems();
            if (items.length) setTreeCursor(items[0]);
          }
          return;
        }
        if (e.key === 'g') {
          e.preventDefault();
          setPending('g', countPrefix);
          return;
        }
        if (e.key === ' ') {
          e.preventDefault();
          setPending('␣', '');
          return;
        }

        resetVimPending();
        switch (e.key) {
          case 'j':
          case 'ArrowDown':
            e.preventDefault();
            moveTreeCursor(count);
            return;
          case 'k':
          case 'ArrowUp':
            e.preventDefault();
            moveTreeCursor(-count);
            return;
          case 'G': {
            e.preventDefault();
            const items = getNavigableTreeItems();
            if (items.length) setTreeCursor(items[items.length - 1]);
            return;
          }
          case 'o':
          case 'Enter':
            e.preventDefault();
            await activateTreeCursorItem({ stayInFiles: false });
            return;
          case 'O':
            e.preventDefault();
            await activateTreeCursorItem({ stayInFiles: true });
            return;
          case 'v':
            e.preventDefault();
            await activateTreeCursorItem({ openInSplit: true });
            return;
          case 'l':
          case 'ArrowRight':
            e.preventDefault();
            if (treeCursorEl?.classList.contains('mdv-folder-summary')) {
              const det = treeCursorEl.closest('details.mdv-folder-details');
              if (det && !det.open) det.open = true;
              else moveTreeCursor(1);
            } else {
              await activateTreeCursorItem({ stayInFiles: false });
            }
            return;
          case 'h':
          case 'ArrowLeft':
            e.preventDefault();
            if (treeCursorEl?.classList.contains('mdv-folder-summary')) {
              const det = treeCursorEl.closest('details.mdv-folder-details');
              if (det && det.open) {
                det.open = false;
                return;
              }
            }
            {
              const parentDet = treeCursorEl?.parentElement?.closest('details.mdv-folder-details');
              const parentSum = parentDet?.querySelector(':scope > summary.mdv-folder-summary');
              if (parentSum) setTreeCursor(parentSum);
            }
            return;
          case '/':
          case 'f':
            e.preventDefault();
            fileFilterEl?.focus();
            fileFilterEl?.select();
            return;
          case 'e':
            e.preventDefault();
            toggleFilesPanel();
            return;
          case '?':
            e.preventDefault();
            toggleHelpModal();
            return;
          case 'q':
            e.preventDefault();
            setFocusZone('pane', focusedPaneIdx);
            return;
        }
        return;
      }

      // =========================================================
      // MODE B: DOCUMENT PANE VIM NAVIGATION (focusZone === 'pane')
      // =========================================================
      if (e.key === 'Tab' && splitMode !== 'none') {
        e.preventDefault();
        setFocusZone('pane', focusedPaneIdx === 0 ? 1 : 0);
        return;
      }

      if (pendingPrefix === 'g') {
        resetVimPending();
        if (e.key === 'g') {
          e.preventDefault();
          scroller.scrollTo({ top: 0, behavior: 'smooth' });
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
          const scrollerTop = scroller.getBoundingClientRect().top;
          const activeH =
            pane.headings.find((h) => h.getBoundingClientRect().top >= scrollerTop - 20) || pane.headings[0];
          activeH?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } else if (e.key === 'R' || e.key === 'o') {
          e.preventDefault();
          pane.article.querySelectorAll('details').forEach((d) => (d.open = true));
          showToast('Desplegables abiertos');
        } else if (e.key === 'M' || e.key === 'c') {
          e.preventDefault();
          pane.article.querySelectorAll('details').forEach((d) => (d.open = false));
          showToast('Desplegables cerrados');
        } else if (e.key === 'a') {
          e.preventDefault();
          const all = Array.from(pane.article.querySelectorAll('details'));
          const shouldOpen = all.some((d) => !d.open);
          all.forEach((d) => (d.open = shouldOpen));
        }
        return;
      }

      if (pendingPrefix === 'y') {
        resetVimPending();
        if (e.key === 'y') {
          e.preventDefault();
          await navigator.clipboard.writeText(pane.filePath);
          showToast('Ruta copiada');
        } else if (e.key === 'c') {
          e.preventDefault();
          const scrollerRect = scroller.getBoundingClientRect();
          const cards = Array.from(pane.article.querySelectorAll('.mdv-code-card pre code'));
          const visible = cards.find((c) => {
            const r = c.getBoundingClientRect();
            return r.bottom > scrollerRect.top + 10 && r.top < scrollerRect.bottom;
          });
          if (visible) {
            await navigator.clipboard.writeText(visible.textContent || '');
            showToast('Código copiado');
          }
        }
        return;
      }

      if (['g', '[', ']', 'z', 'y'].includes(e.key)) {
        e.preventDefault();
        setPending(e.key, countPrefix);
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        setPending('␣', '');
        return;
      }

      resetVimPending();

      switch (e.key) {
        case 'j':
          e.preventDefault();
          scroller.scrollBy({ top: 72 * count, behavior: 'auto' });
          break;
        case 'k':
          e.preventDefault();
          scroller.scrollBy({ top: -72 * count, behavior: 'auto' });
          break;
        case 'd':
          e.preventDefault();
          scroller.scrollBy({ top: scroller.clientHeight * 0.5 * count, behavior: 'auto' });
          break;
        case 'u':
          e.preventDefault();
          scroller.scrollBy({ top: -scroller.clientHeight * 0.5 * count, behavior: 'auto' });
          break;
        case 'f':
          e.preventDefault();
          scroller.scrollBy({ top: scroller.clientHeight * 0.88 * count, behavior: 'auto' });
          break;
        case 'b':
          e.preventDefault();
          scroller.scrollBy({ top: -scroller.clientHeight * 0.88 * count, behavior: 'auto' });
          break;
        case 'G':
          e.preventDefault();
          scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
          break;
        case '}':
          e.preventDefault();
          jumpSection(1);
          break;
        case '{':
          e.preventDefault();
          jumpSection(-1);
          break;
        case 'V':
          e.preventDefault();
          await openSplit('vertical');
          break;
        case 'S':
          e.preventDefault();
          await openSplit('horizontal');
          break;
        case 'h': {
          const car = findVisibleCarouselInPane(pane);
          if (car) {
            e.preventDefault();
            car.prev();
          }
          break;
        }
        case 'l': {
          const car = findVisibleCarouselInPane(pane);
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
          if (pane.filePath) {
            await loadDocumentInPane(pane.idx, pane.filePath, { preserveScroll: true, isLiveReload: true });
            showToast('Recargado');
          }
          break;
        case '?':
          e.preventDefault();
          toggleHelpModal();
          break;
        case 'q':
          e.preventDefault();
          if (splitMode !== 'none') closePane(focusedPaneIdx);
          else window.close();
          break;
      }
    },
    { capture: true }
  );

  // Per-Pane Scroll-Spy + Sync Scroll
  function refreshHeadings(pane) {
    pane.headings = Array.from(pane.article.querySelectorAll('.mdv-heading[id]'));
  }

  function onPaneScroll(pane) {
    const scroller = pane.scroller;
    const scrollTop = scroller.scrollTop;
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;

    if (syncScroll && splitMode !== 'none' && !isSyncingScroll && maxScroll > 0) {
      isSyncingScroll = true;
      const other = panes[pane.idx === 0 ? 1 : 0];
      const otherMax = other.scroller.scrollHeight - other.scroller.clientHeight;
      if (otherMax > 0) {
        other.scroller.scrollTop = (scrollTop / maxScroll) * otherMax;
      }
      requestAnimationFrame(() => {
        isSyncingScroll = false;
      });
    }

    if (pane.idx !== focusedPaneIdx || focusZone === 'files') return;

    if (vimPosEl) {
      if (maxScroll <= 4) vimPosEl.textContent = 'ALL';
      else if (scrollTop <= 4) vimPosEl.textContent = 'TOP';
      else if (scrollTop >= maxScroll - 4) vimPosEl.textContent = 'BOT';
      else vimPosEl.textContent = `${Math.round((scrollTop / maxScroll) * 100)}%`;
    }

    if (!pane.headings.length || !tocListEl) return;
    const scrollerTop = scroller.getBoundingClientRect().top;
    let activeId = pane.headings[0].id;
    for (const h of pane.headings) {
      if (h.getBoundingClientRect().top <= scrollerTop + 72) {
        activeId = h.id;
      } else {
        break;
      }
    }
    tocListEl.querySelectorAll('.mdv-toc-item').forEach((li) => {
      li.classList.toggle('is-active', li.getAttribute('data-toc-id') === activeId);
    });
  }

  panes.forEach((p) => {
    p.scroller.addEventListener('scroll', () => onPaneScroll(p), { passive: true });
  });

  function renderToc(toc) {
    if (!tocListEl) return;
    tocListEl.innerHTML = (toc || [])
      .map(
        (item) =>
          `<li class="mdv-toc-item mdv-toc-level-${item.level}" data-toc-id="${item.id}"><a href="#${item.id}">${item.text}</a></li>`
      )
      .join('');
  }

  function updateFileTreeMarkers() {
    if (!fileListEl) return;
    const focusedPath = activePane().filePath;
    const otherPath = splitMode !== 'none' ? panes[focusedPaneIdx === 0 ? 1 : 0].filePath : '';
    let activeLi = null;

    fileListEl.querySelectorAll('.mdv-file-item').forEach((li) => {
      const p = li.getAttribute('data-file-path');
      const isCur = p === focusedPath;
      const isSec = splitMode !== 'none' && p === otherPath && !isCur;
      li.classList.toggle('is-current', isCur);
      li.classList.toggle('is-secondary', isSec);
      if (isCur) activeLi = li;
    });

    if (activeLi && focusZone !== 'files') {
      let parent = activeLi.parentElement;
      while (parent && parent !== fileListEl) {
        if (parent.matches('details.mdv-folder-details')) parent.open = true;
        parent = parent.parentElement;
      }
      activeLi.scrollIntoView({ block: 'nearest' });
    }
  }

  async function loadDocumentInPane(
    paneIdx,
    filePath,
    { pushState = false, hash = '', preserveScroll = false, isLiveReload = false } = {}
  ) {
    const pane = panes[paneIdx];
    if (!pane || !filePath) return;

    const isSameFile = filePath === pane.filePath;
    const scrollBefore = pane.scroller.scrollTop;
    const openDetailsIndices =
      isSameFile || preserveScroll
        ? Array.from(pane.article.querySelectorAll('details')).map((d) => d.open)
        : null;

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

    pane.filePath = data.filePath;
    pane.relPath = data.relPath || data.fileName;
    pane.toc = data.toc || [];
    pane.article.innerHTML = data.html;
    if (pane.titleEl) pane.titleEl.textContent = pane.relPath;

    if (openDetailsIndices) {
      pane.article.querySelectorAll('details').forEach((d, idx) => {
        if (idx < openDetailsIndices.length) d.open = openDetailsIndices[idx];
      });
    }

    if (totalFilesEl && typeof data.totalFiles === 'number') {
      totalFilesEl.textContent = String(data.totalFiles);
    }

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

    initCarouselsForPane(pane);
    await renderMermaidDiagrams(pane.article);
    initHorizontalBlockScrollbars(pane.article);
    refreshHeadings(pane);

    if (paneIdx === focusedPaneIdx) {
      if (fileNameEl) fileNameEl.textContent = pane.relPath;
      document.title = `${data.title || data.fileName} — mdv`;
      renderToc(pane.toc);
      if (lastQuery) highlightQuery(lastQuery);
    }
    updateFileTreeMarkers();

    if (isLiveReload) flashReloadIndicator();

    if (pushState && paneIdx === 0) {
      history.pushState({ file: pane.filePath }, '', `/?file=${encodeURIComponent(pane.filePath)}${hash || ''}`);
    }
    if (hash) {
      const target = pane.article.querySelector(`#${CSS.escape(hash.slice(1))}`);
      target?.scrollIntoView();
    } else if (isSameFile || preserveScroll) {
      pane.scroller.scrollTop = scrollBefore;
    } else {
      pane.scroller.scrollTop = 0;
    }
    onPaneScroll(pane);
  }

  window.addEventListener('popstate', (e) => {
    const f = e.state?.file || new URLSearchParams(location.search).get('file');
    if (f) loadDocumentInPane(0, f, { pushState: false, hash: location.hash });
  });

  function connectEvents() {
    const es = new EventSource('/events');
    es.onopen = () => liveDotEl?.classList.remove('is-disconnected');
    es.onerror = () => liveDotEl?.classList.add('is-disconnected');
    es.addEventListener('reload', (ev) => {
      let payload = {};
      try { payload = JSON.parse(ev.data || '{}'); } catch {}
      if (payload.reason === 'tree' && panes[focusedPaneIdx]?.filePath) {
        loadDocumentInPane(focusedPaneIdx, panes[focusedPaneIdx].filePath, {
          preserveScroll: true,
          isLiveReload: false
        });
        return;
      }
      const changed = payload.file;
      const visiblePanes = splitMode === 'none' ? [panes[0]] : panes;
      for (const p of visiblePanes) {
        if (!changed || p.filePath === changed) {
          loadDocumentInPane(p.idx, p.filePath, { preserveScroll: true, isLiveReload: true });
        }
      }
    });
  }

  // Boot
  if (initCfg.maximized) {
    try {
      if (window.outerWidth < screen.availWidth - 24 || window.outerHeight < screen.availHeight - 24) {
        window.moveTo(screen.availLeft || 0, screen.availTop || 0);
        window.resizeTo(screen.availWidth, screen.availHeight);
      }
    } catch {}
  }
  initCarouselsForPane(panes[0]);
  renderMermaidDiagrams(panes[0].article).then(() => initHorizontalBlockScrollbars(panes[0].article));
  initHorizontalBlockScrollbars(panes[0].article);
  refreshHeadings(panes[0]);
  onPaneScroll(panes[0]);
  updateFileTreeMarkers();
  connectEvents();

  if (initCfg.splitFile) {
    openSplit(initCfg.splitDirection || 'vertical', initCfg.splitFile);
  }
})();
