(function () {
  const THEMES = ['tokyo', 'github-dark', 'catppuccin', 'light'];

  const XTERM_THEMES = {
    tokyo: {
      background: '#131622',
      foreground: '#d8dee9',
      cursor: '#7aa2f7',
      selectionBackground: 'rgba(122, 162, 247, 0.28)',
      black: '#15161e',
      red: '#f7768e',
      green: '#9ece6a',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      magenta: '#bb9af7',
      cyan: '#7dcfff',
      white: '#a9b1d6',
      brightBlack: '#414868',
      brightRed: '#f7768e',
      brightGreen: '#9ece6a',
      brightYellow: '#e0af68',
      brightBlue: '#7aa2f7',
      brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff',
      brightWhite: '#c0caf5'
    },
    'github-dark': {
      background: '#12171e',
      foreground: '#e6edf3',
      cursor: '#58a6ff',
      selectionBackground: 'rgba(88, 166, 255, 0.28)',
      black: '#0d1117',
      red: '#ff7b72',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#b1bac4',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#ffffff'
    },
    catppuccin: {
      background: '#141420',
      foreground: '#cdd6f4',
      cursor: '#cba6f7',
      selectionBackground: 'rgba(203, 166, 247, 0.28)',
      black: '#45475a',
      red: '#f38ba8',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      magenta: '#f5c2e7',
      cyan: '#94e2d5',
      white: '#bac2de',
      brightBlack: '#585b70',
      brightRed: '#f38ba8',
      brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af',
      brightBlue: '#89b4fa',
      brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5',
      brightWhite: '#a6adc8'
    },
    light: {
      background: '#f4f6f9',
      foreground: '#1e293b',
      cursor: '#2563eb',
      selectionBackground: 'rgba(37, 99, 235, 0.2)',
      black: '#0f172a',
      red: '#dc2626',
      green: '#15803d',
      yellow: '#b45309',
      blue: '#1d4ed8',
      magenta: '#7e22ce',
      cyan: '#0e7490',
      white: '#e2e8f0',
      brightBlack: '#64748b',
      brightRed: '#ef4444',
      brightGreen: '#16a34a',
      brightYellow: '#d97706',
      brightBlue: '#2563eb',
      brightMagenta: '#9333ea',
      brightCyan: '#0891b2',
      brightWhite: '#0f172a'
    }
  };

  const sidebarFilesEl = document.querySelector('.mdv-sidebar-files');
  const panesRootEl = document.getElementById('mdv-panes-root');
  const initialHtmlHolder = document.getElementById('mdv-initial-html');
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
  const btnTermV = document.getElementById('mdv-term-vertical');
  const btnTermH = document.getElementById('mdv-term-horizontal');
  const btnFontDec = document.getElementById('mdv-font-dec');
  const btnFontReset = document.getElementById('mdv-font-reset');
  const btnFontInc = document.getElementById('mdv-font-inc');
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
  const initialHtml = initialHtmlHolder ? initialHtmlHolder.innerHTML : '';
  initialHtmlHolder?.remove();

  const OSGlobal = window.OverlayScrollbarsGlobal;
  const OverlayScrollbars = OSGlobal?.OverlayScrollbars;
  if (OverlayScrollbars && OSGlobal?.ClickScrollPlugin) {
    OverlayScrollbars.plugin(OSGlobal.ClickScrollPlugin);
  }

  const OS_MAIN_OPTS = {
    scrollbars: { theme: 'os-theme-mdv', autoHide: 'scroll', autoHideDelay: 650, clickScroll: true }
  };
  const OS_SIDE_OPTS = {
    scrollbars: { theme: 'os-theme-mdv', autoHide: 'leave', autoHideDelay: 350, clickScroll: true }
  };
  const OS_BLOCK_OPTS = {
    overflow: { x: 'scroll', y: 'hidden' },
    scrollbars: { theme: 'os-theme-mdv', autoHide: 'leave', autoHideDelay: 300, clickScroll: true }
  };

  function initHorizontalBlockScrollbars(scope) {
    if (!OverlayScrollbars || !scope) return;
    scope
      .querySelectorAll('.mdv-code-card pre, .mdv-table-wrap, .mdv-mermaid-stage, .mdv-math-block')
      .forEach((el) => OverlayScrollbars(el, OS_BLOCK_OPTS));
  }

  const filesScrollEl = document.getElementById('mdv-files-scroll');
  const tocScrollEl = document.getElementById('mdv-toc-scroll');
  const modalScrollEl = document.getElementById('mdv-modal-scroll');
  if (OverlayScrollbars) {
    if (filesScrollEl) OverlayScrollbars(filesScrollEl, OS_SIDE_OPTS);
    if (tocScrollEl) OverlayScrollbars(tocScrollEl, OS_SIDE_OPTS);
    if (modalScrollEl) {
      OverlayScrollbars(modalScrollEl, {
        scrollbars: { theme: 'os-theme-mdv', autoHide: 'leave', autoHideDelay: 350, clickScroll: true }
      });
    }
  }

  // =========================================================================
  // INFINITE RECURSIVE SPLIT TREE STATE
  // =========================================================================
  let nextNodeSeq = 1;
  let rootTree = null; // PaneNode | BranchNode
  const panesById = new Map(); // id -> PaneNode
  let focusedPaneId = null;
  let lastMarkdownPaneId = null;
  let focusZone = 'pane'; // 'pane' | 'files'
  let treeCursorEl = null;
  let syncScroll = false;
  let isSyncingScroll = false;
  let zoomPercent = Number(localStorage.getItem('mdv-zoom') || initCfg.defaultZoom || 100);
  let reloadPillTimer = null;
  let toastTimer = null;

  function activePane() {
    return panesById.get(focusedPaneId) || panesById.values().next().value || null;
  }

  function allMarkdownPanes() {
    return Array.from(panesById.values()).filter((p) => p.kind === 'markdown');
  }

  function allTerminalPanes() {
    return Array.from(panesById.values()).filter((p) => p.kind === 'terminal');
  }

  function updatePaneCountAttr() {
    panesRootEl.setAttribute('data-pane-count', String(panesById.size));
    document.querySelectorAll('[data-pane-sync]').forEach((b) => b.classList.toggle('is-active', syncScroll));
  }

  function savePrefs(patch) {
    fetch('/api/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    }).catch(() => {});
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

  function currentThemeName() {
    return document.documentElement.getAttribute('data-theme') || 'tokyo';
  }

  function applyTheme(theme, rerender) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeSelect) themeSelect.value = theme;
    localStorage.setItem('mdv-theme', theme);

    const xtermTheme = XTERM_THEMES[theme] || XTERM_THEMES.tokyo;
    for (const tp of allTerminalPanes()) {
      if (tp.term) tp.term.options.theme = xtermTheme;
    }

    if (rerender) {
      savePrefs({ theme });
      for (const mp of allMarkdownPanes()) {
        renderMermaidDiagrams(mp.article);
      }
    }
  }

  function cycleTheme() {
    const cur = currentThemeName();
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    applyTheme(next, true);
    showToast(`Tema: ${next}`);
  }

  function applyZoom(pct, announce = true) {
    zoomPercent = Math.min(170, Math.max(70, Math.round(pct)));
    if (btnFontReset) btnFontReset.textContent = `${zoomPercent}%`;
    localStorage.setItem('mdv-zoom', String(zoomPercent));

    for (const mp of allMarkdownPanes()) {
      mp.article.style.fontSize = `${zoomPercent}%`;
    }
    const termPx = Math.max(11, Math.min(24, Math.round((14 * zoomPercent) / 100)));
    for (const tp of allTerminalPanes()) {
      if (tp.term) {
        tp.term.options.fontSize = termPx;
        tp.fitTerminal?.();
      }
    }

    if (announce) {
      savePrefs({ zoom: zoomPercent });
      showToast(`Letra: ${zoomPercent}%`);
    }
  }

  function toggleFilesPanel() {
    const hidden = document.body.classList.toggle('hide-files');
    btnFiles?.classList.toggle('is-active', !hidden);
    localStorage.setItem('mdv-hide-files', hidden ? '1' : '0');
    if (hidden && focusZone === 'files') {
      setFocusZone('pane', focusedPaneId, false);
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

  // =========================================================================
  // PANE FACTORIES (MARKDOWN PANE & WSL TERMINAL PANE)
  // =========================================================================
  function buildPaneHeaderHtml(id, kind, titleText) {
    const iconHtml =
      kind === 'terminal'
        ? '<span class="mdv-term-glyph">&gt;_</span>'
        : '<span class="mdv-pane-dot"></span>';
    const syncBtn =
      kind === 'markdown'
        ? `<button type="button" class="mdv-pane-btn${syncScroll ? ' is-active' : ''}" data-pane-sync title="Sincronizar scroll Markdown (Espacio y)">Sync</button>`
        : '';
    return `
      <div class="mdv-pane-bar">
        <div class="mdv-pane-bar-left">
          ${iconHtml}
          <span class="mdv-pane-title" data-pane-title>${titleText}</span>
        </div>
        <div class="mdv-pane-bar-right">
          ${syncBtn}
          <button type="button" class="mdv-pane-btn" data-pane-action="md-right" data-target-pane="${id}" title="Split Markdown a la derecha (Ctrl+Alt+R)">+MD |</button>
          <button type="button" class="mdv-pane-btn" data-pane-action="term-right" data-target-pane="${id}" title="Split Terminal WSL a la derecha (Alt+Shift+R)">&gt;_ |</button>
          <button type="button" class="mdv-pane-btn" data-pane-action="term-down" data-target-pane="${id}" title="Split Terminal WSL abajo (Alt+Shift+D)">&gt;_ —</button>
          <button type="button" class="mdv-pane-btn" data-pane-close="${id}" title="Cerrar este panel">✕</button>
        </div>
      </div>`;
  }

  function createMarkdownPane({ filePath = '', relPath = '', html = '', toc = [] } = {}) {
    const id = `pane-${nextNodeSeq++}`;
    const section = document.createElement('section');
    section.className = 'mdv-pane';
    section.setAttribute('data-pane-id', id);
    section.setAttribute('data-pane-kind', 'markdown');
    section.innerHTML = `
      ${buildPaneHeaderHtml(id, 'markdown', relPath || filePath.split('/').pop() || 'Markdown')}
      <div class="mdv-pane-scroller" data-overlayscrollbars-initialize>
        <article class="mdv-article" style="font-size:${zoomPercent}%">${html}</article>
      </div>`;

    const scrollerHost = section.querySelector('.mdv-pane-scroller');
    const osInstance = OverlayScrollbars ? OverlayScrollbars(scrollerHost, OS_MAIN_OPTS) : null;
    const scroller = osInstance ? osInstance.elements().viewport : scrollerHost;
    const article = section.querySelector('.mdv-article');
    const titleEl = section.querySelector('[data-pane-title]');

    const pane = {
      type: 'pane',
      id,
      kind: 'markdown',
      el: section,
      section,
      scrollerHost,
      osInstance,
      scroller,
      article,
      titleEl,
      filePath,
      relPath,
      toc,
      headings: [],
      carouselState: new Map(),
      carouselControllers: [],
      dispose() {
        try { osInstance?.destroy(); } catch {}
      }
    };

    section.addEventListener('pointerdown', () => {
      if (focusZone !== 'pane' || focusedPaneId !== id) {
        setFocusZone('pane', id, false);
      }
    });

    scroller.addEventListener('scroll', () => onMarkdownPaneScroll(pane), { passive: true });
    panesById.set(id, pane);
    lastMarkdownPaneId = id;
    return pane;
  }

  function resolvePreferredCwd() {
    const cur = activePane();
    if (cur?.kind === 'markdown' && cur.filePath) {
      const idx = cur.filePath.lastIndexOf('/');
      if (idx > 0) return cur.filePath.slice(0, idx);
    }
    if (lastMarkdownPaneId && panesById.has(lastMarkdownPaneId)) {
      const mp = panesById.get(lastMarkdownPaneId);
      const idx = mp.filePath.lastIndexOf('/');
      if (idx > 0) return mp.filePath.slice(0, idx);
    }
    return initCfg.workspaceDir || '';
  }

  function createTerminalPane({ cwd = '' } = {}) {
    const id = `pane-${nextNodeSeq++}`;
    const targetCwd = cwd || resolvePreferredCwd();
    const shortDir = targetCwd.split('/').filter(Boolean).pop() || 'wsl';
    const section = document.createElement('section');
    section.className = 'mdv-pane';
    section.setAttribute('data-pane-id', id);
    section.setAttribute('data-pane-kind', 'terminal');
    section.innerHTML = `
      ${buildPaneHeaderHtml(id, 'terminal', `WSL (${shortDir})`)}
      <div class="mdv-terminal-wrap">
        <div class="mdv-terminal-mount"></div>
      </div>`;

    const wrapEl = section.querySelector('.mdv-terminal-wrap');
    const mountEl = section.querySelector('.mdv-terminal-mount');
    const titleEl = section.querySelector('[data-pane-title]');

    const termPx = Math.max(11, Math.min(24, Math.round((14 * zoomPercent) / 100)));
    const term = window.Terminal
      ? new window.Terminal({
          cursorBlink: true,
          fontSize: termPx,
          fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, ui-monospace, monospace',
          lineHeight: 1.18,
          scrollback: 5000,
          allowProposedApi: true,
          theme: XTERM_THEMES[currentThemeName()] || XTERM_THEMES.tokyo
        })
      : null;

    const fitAddon = term && window.FitAddon ? new window.FitAddon.FitAddon() : null;
    if (term && fitAddon) {
      term.loadAddon(fitAddon);
    }

    let ws = null;
    let resizeObserver = null;
    let disposed = false;

    function fitTerminal() {
      if (disposed || !term || !fitAddon || !mountEl.isConnected) return;
      if (mountEl.clientWidth < 20 || mountEl.clientHeight < 20) return;
      try {
        fitAddon.fit();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      } catch {}
    }

    const pane = {
      type: 'pane',
      id,
      kind: 'terminal',
      cwd: targetCwd,
      el: section,
      section,
      mountEl,
      titleEl,
      term,
      fitAddon,
      fitTerminal,
      boot() {
        if (!term || term.element) return;
        term.open(mountEl);

        // Allow app-level spatial navigation & split shortcuts to pass out of xterm cleanly!
        term.attachCustomKeyEventHandler((ev) => {
          const isAltGraph = Boolean(ev.getModifierState && ev.getModifierState('AltGraph'));
          const isCtrlAlt = (ev.ctrlKey && ev.altKey && !ev.metaKey) || (isAltGraph && !ev.metaKey);
          if (isCtrlAlt && ['KeyR', 'KeyD', 'KeyT', 'KeyB'].includes(ev.code)) {
            return false;
          }
          if (ev.altKey && ev.shiftKey && !ev.ctrlKey && ['KeyR', 'KeyD', 'KeyW'].includes(ev.code)) {
            return false;
          }
          if (
            ev.altKey &&
            !ev.ctrlKey &&
            !ev.shiftKey &&
            !ev.metaKey &&
            !isAltGraph &&
            ['KeyH', 'KeyJ', 'KeyK', 'KeyL'].includes(ev.code)
          ) {
            return false;
          }
          // Ctrl+Shift+C / Ctrl+Shift+V copy-paste convenience in terminal
          if (ev.ctrlKey && ev.shiftKey && ev.code === 'KeyC' && term.hasSelection()) {
            navigator.clipboard.writeText(term.getSelection()).catch(() => {});
            return false;
          }
          return true;
        });

        fitTerminal();
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${location.host}/ws/pty?cwd=${encodeURIComponent(targetCwd)}&cols=${term.cols}&rows=${term.rows}`;
        ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        ws.onmessage = (ev) => {
          if (ev.data instanceof ArrayBuffer) {
            term.write(new Uint8Array(ev.data));
          } else if (typeof ev.data === 'string') {
            try {
              const msg = JSON.parse(ev.data);
              if (msg.type === 'exit') {
                if (panesById.size > 1) {
                  closePaneById(id);
                } else {
                  term.writeln('\r\n\x1b[90m[Sesión cerrada — cerrando ventana...]\x1b[0m');
                  setTimeout(() => window.close(), 350);
                }
              }
            } catch {}
          }
        };

        term.onData((data) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'input', data }));
          }
        });

        term.onTitleChange((newTitle) => {
          if (titleEl && newTitle) titleEl.textContent = newTitle;
        });

        resizeObserver = new ResizeObserver(() => {
          requestAnimationFrame(() => fitTerminal());
        });
        resizeObserver.observe(wrapEl);
      },
      dispose() {
        disposed = true;
        try { resizeObserver?.disconnect(); } catch {}
        try { ws?.close(); } catch {}
        try { term?.dispose(); } catch {}
      }
    };

    section.addEventListener('pointerdown', () => {
      if (focusZone !== 'pane' || focusedPaneId !== id) {
        setFocusZone('pane', id, false);
      }
    });

    panesById.set(id, pane);
    return pane;
  }

  // =========================================================================
  // RECURSIVE BINARY TREE OPERATIONS (INFINITE SPLITS)
  // =========================================================================
  function applyBranchSizes(branch) {
    const r = Math.min(0.86, Math.max(0.14, branch.ratio));
    branch.ratio = r;
    const pctA = (r * 100).toFixed(2);
    const pctB = ((1 - r) * 100).toFixed(2);
    branch.first.el.style.flex = `0 0 calc(${pctA}% - 2.5px)`;
    branch.second.el.style.flex = `0 0 calc(${pctB}% - 2.5px)`;
  }

  function replaceTreeNode(current, targetId, replacement) {
    if (!current) return replacement;
    if (current.type === 'pane') {
      return current.id === targetId ? replacement : current;
    }
    current.first = replaceTreeNode(current.first, targetId, replacement);
    current.second = replaceTreeNode(current.second, targetId, replacement);
    return current;
  }

  function findParentBranch(current, childNode) {
    if (!current || current.type === 'pane') return null;
    if (current.first === childNode || current.second === childNode) return current;
    return findParentBranch(current.first, childNode) || findParentBranch(current.second, childNode);
  }

  function firstLeafPane(node) {
    if (!node) return null;
    if (node.type === 'pane') return node;
    return firstLeafPane(node.first) || firstLeafPane(node.second);
  }

  async function splitPane(targetPaneId, direction = 'vertical', newKind = 'markdown', opts = {}) {
    const targetPane = panesById.get(targetPaneId) || activePane();
    if (!targetPane) return null;

    let newPane;
    if (newKind === 'terminal') {
      newPane = createTerminalPane({ cwd: opts.cwd });
    } else {
      const sourceMd =
        targetPane.kind === 'markdown'
          ? targetPane
          : (lastMarkdownPaneId && panesById.get(lastMarkdownPaneId)) || allMarkdownPanes()[0];
      const fileToOpen = opts.filePath || sourceMd?.filePath || initCfg.currentFile;
      newPane = createMarkdownPane({ filePath: fileToOpen, relPath: fileToOpen.split('/').pop() });
    }

    const branchEl = document.createElement('div');
    branchEl.className = 'mdv-split-branch';
    branchEl.setAttribute('data-direction', direction);

    const resizerEl = document.createElement('div');
    resizerEl.className = 'mdv-split-resizer';
    resizerEl.title = 'Arrastra para redimensionar · Doble clic 50/50';

    const branch = {
      type: 'split',
      id: `split-${nextNodeSeq++}`,
      direction,
      ratio: 0.5,
      el: branchEl,
      resizerEl,
      first: targetPane,
      second: newPane
    };

    // Swap DOM in-place so existing xterm/scrollbars in targetPane stay 100% live!
    targetPane.el.replaceWith(branchEl);
    branchEl.append(targetPane.el, resizerEl, newPane.el);
    applyBranchSizes(branch);

    resizerEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      resizerEl.setPointerCapture(e.pointerId);
      resizerEl.classList.add('is-dragging');
      const onMove = (ev) => {
        const rect = branchEl.getBoundingClientRect();
        if (branch.direction === 'vertical') {
          branch.ratio = (ev.clientX - rect.left) / rect.width;
        } else {
          branch.ratio = (ev.clientY - rect.top) / rect.height;
        }
        applyBranchSizes(branch);
      };
      const onUp = () => {
        resizerEl.classList.remove('is-dragging');
        resizerEl.removeEventListener('pointermove', onMove);
        resizerEl.removeEventListener('pointerup', onUp);
      };
      resizerEl.addEventListener('pointermove', onMove);
      resizerEl.addEventListener('pointerup', onUp);
    });
    resizerEl.addEventListener('dblclick', () => {
      branch.ratio = 0.5;
      applyBranchSizes(branch);
      showToast('Split 50 / 50');
    });

    rootTree = replaceTreeNode(rootTree, targetPane.id, branch);
    updatePaneCountAttr();

    if (newPane.kind === 'terminal') {
      newPane.boot();
      setFocusZone('pane', newPane.id, false);
      showToast(direction === 'vertical' ? 'Terminal WSL (derecha)' : 'Terminal WSL (abajo)');
    } else {
      await loadDocumentInPane(newPane.id, newPane.filePath, { preserveScroll: false });
      if (!opts.filePath && targetPane.kind === 'markdown') {
        newPane.scroller.scrollTop = targetPane.scroller.scrollTop;
      }
      setFocusZone('pane', newPane.id, false);
      showToast(direction === 'vertical' ? 'Split Right creado' : 'Split Down creado');
    }
    return newPane;
  }

  function closePaneById(paneId) {
    const pane = panesById.get(paneId);
    if (!pane) return;

    if (panesById.size <= 1) {
      pane.dispose?.();
      window.close();
      return;
    }

    const parentBranch = findParentBranch(rootTree, pane);
    if (!parentBranch) return;
    const sibling = parentBranch.first === pane ? parentBranch.second : parentBranch.first;

    // Replace parentBranch DOM with surviving sibling subtree DOM in-place!
    sibling.el.style.flex = parentBranch.el.style.flex || '1 1 100%';
    parentBranch.el.replaceWith(sibling.el);

    const grandParent = findParentBranch(rootTree, parentBranch);
    if (!grandParent) {
      rootTree = sibling;
      sibling.el.style.flex = '1 1 100%';
    } else {
      if (grandParent.first === parentBranch) grandParent.first = sibling;
      else grandParent.second = sibling;
      applyBranchSizes(grandParent);
    }

    pane.dispose?.();
    panesById.delete(paneId);
    updatePaneCountAttr();

    if (focusedPaneId === paneId) {
      const nextTarget = firstLeafPane(sibling) || firstLeafPane(rootTree);
      if (nextTarget) setFocusZone('pane', nextTarget.id, false);
    } else {
      updateFileTreeMarkers();
    }
    // Re-fit any terminals that just expanded
    requestAnimationFrame(() => {
      for (const tp of allTerminalPanes()) tp.fitTerminal?.();
    });
    showToast('Panel cerrado');
  }

  function closeOtherPanes(keepPaneId) {
    const keep = panesById.get(keepPaneId);
    if (!keep || panesById.size <= 1) return;
    for (const [id, p] of panesById.entries()) {
      if (id !== keepPaneId) {
        p.dispose?.();
        panesById.delete(id);
      }
    }
    rootTree = keep;
    keep.el.style.flex = '1 1 100%';
    panesRootEl.innerHTML = '';
    panesRootEl.appendChild(keep.el);
    updatePaneCountAttr();
    setFocusZone('pane', keep.id, false);
    if (keep.kind === 'terminal') requestAnimationFrame(() => keep.fitTerminal?.());
    showToast('Solo panel activo');
  }

  function equalizeAllBranches(node = rootTree) {
    if (!node || node.type === 'pane') return;
    node.ratio = 0.5;
    applyBranchSizes(node);
    equalizeAllBranches(node.first);
    equalizeAllBranches(node.second);
  }

  // =========================================================================
  // 2D GEOMETRIC SPATIAL FOCUS (Alt + h / j / k / l across infinite splits!)
  // =========================================================================
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
      const curPane = activePane();
      if (openInSplit || curPane?.kind === 'terminal') {
        // If current focused pane is a terminal (or user asked for split), either load in existing markdown pane or split!
        const existingMd = !openInSplit && lastMarkdownPaneId ? panesById.get(lastMarkdownPaneId) : null;
        if (existingMd) {
          await loadDocumentInPane(existingMd.id, targetPath, { pushState: true });
          if (!stayInFiles) setFocusZone('pane', existingMd.id, false);
        } else {
          await splitPane(curPane?.id, 'vertical', 'markdown', { filePath: targetPath });
          if (stayInFiles) setFocusZone('files', focusedPaneId, false);
        }
      } else if (curPane) {
        await loadDocumentInPane(curPane.id, targetPath, { pushState: true });
        if (!stayInFiles) {
          setFocusZone('pane', curPane.id, false);
        } else {
          const refreshed = fileListEl?.querySelector(`.mdv-file-item[data-file-path="${CSS.escape(targetPath)}"]`);
          setTreeCursor(refreshed);
        }
      }
    }
  }

  function focusPaneById(id) {
    const p = panesById.get(id) || activePane();
    if (!p) return;
    focusedPaneId = p.id;
    if (p.kind === 'markdown') lastMarkdownPaneId = p.id;

    for (const [pid, paneObj] of panesById.entries()) {
      const isFoc = pid === p.id;
      paneObj.section.classList.toggle('is-focused', isFoc);
      paneObj.section.classList.toggle('is-zone-focused', focusZone === 'pane' && isFoc);
      if (!isFoc && paneObj.kind === 'terminal') {
        paneObj.term?.blur?.();
      }
    }

    if (p.kind === 'terminal') {
      if (vimPosEl && focusZone === 'pane') vimPosEl.textContent = 'TERM';
      if (focusZone === 'pane') {
        requestAnimationFrame(() => p.term?.focus());
      }
    } else {
      if (document.activeElement?.closest('.xterm')) {
        document.activeElement.blur();
      }
      if (fileNameEl) fileNameEl.textContent = p.relPath || p.filePath.split('/').pop() || '';
      renderToc(p.toc);
      refreshHeadings(p);
      onMarkdownPaneScroll(p);
      if (lastQuery) highlightQuery(lastQuery);
    }
    updateFileTreeMarkers();
  }

  function setFocusZone(zone, paneId = focusedPaneId, announce = true) {
    if (zone === 'files') {
      if (document.body.classList.contains('hide-files')) {
        document.body.classList.remove('hide-files');
        btnFiles?.classList.add('is-active');
        localStorage.setItem('mdv-hide-files', '0');
      }
      focusZone = 'files';
      if (document.activeElement?.closest('.xterm')) {
        document.activeElement.blur();
      }
      sidebarFilesEl?.classList.add('is-zone-focused');
      for (const p of panesById.values()) p.section.classList.remove('is-zone-focused');
      const items = getNavigableTreeItems();
      const validExisting = treeCursorEl && items.includes(treeCursorEl) ? treeCursorEl : null;
      const initialItem =
        validExisting || items.find((el) => el.classList?.contains('is-current')) || items[0] || null;
      setTreeCursor(initialItem);
      if (vimPosEl) vimPosEl.textContent = 'FILES';
      if (announce) showToast('Foco: Archivos');
    } else {
      focusZone = 'pane';
      sidebarFilesEl?.classList.remove('is-zone-focused');
      if (treeCursorEl) treeCursorEl.classList.remove('is-tree-cursor');
      focusPaneById(paneId);
      if (announce) {
        const p = activePane();
        showToast(p?.kind === 'terminal' ? 'Foco: Terminal WSL' : `Foco: ${p?.relPath || 'Documento'}`);
      }
    }
  }

  function handleSpatialFocusNavigation(dir) {
    if (document.activeElement?.matches('input, select')) {
      document.activeElement.blur();
    }

    if (focusZone === 'files') {
      if (dir === 'right') {
        // Pick leftmost pane with best vertical overlap
        const panes = Array.from(panesById.values());
        panes.sort((a, b) => a.section.getBoundingClientRect().left - b.section.getBoundingClientRect().left);
        if (panes[0]) setFocusZone('pane', panes[0].id);
      } else if (dir === 'down') {
        moveTreeCursor(1);
      } else if (dir === 'up') {
        moveTreeCursor(-1);
      }
      return;
    }

    const cur = activePane();
    if (!cur) return;
    const curRect = cur.section.getBoundingClientRect();
    let bestPane = null;
    let bestDist = Infinity;
    let bestOverlap = -1;

    for (const cand of panesById.values()) {
      if (cand.id === cur.id) continue;
      const r = cand.section.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) continue;

      if (dir === 'left' && r.right <= curRect.left + 10) {
        const overlap = Math.min(r.bottom, curRect.bottom) - Math.max(r.top, curRect.top);
        const dist = Math.max(0, curRect.left - r.right);
        if (overlap > 12 && (dist < bestDist - 4 || (Math.abs(dist - bestDist) <= 4 && overlap > bestOverlap))) {
          bestDist = dist;
          bestOverlap = overlap;
          bestPane = cand;
        }
      } else if (dir === 'right' && r.left >= curRect.right - 10) {
        const overlap = Math.min(r.bottom, curRect.bottom) - Math.max(r.top, curRect.top);
        const dist = Math.max(0, r.left - curRect.right);
        if (overlap > 12 && (dist < bestDist - 4 || (Math.abs(dist - bestDist) <= 4 && overlap > bestOverlap))) {
          bestDist = dist;
          bestOverlap = overlap;
          bestPane = cand;
        }
      } else if (dir === 'up' && r.bottom <= curRect.top + 10) {
        const overlap = Math.min(r.right, curRect.right) - Math.max(r.left, curRect.left);
        const dist = Math.max(0, curRect.top - r.bottom);
        if (overlap > 12 && (dist < bestDist - 4 || (Math.abs(dist - bestDist) <= 4 && overlap > bestOverlap))) {
          bestDist = dist;
          bestOverlap = overlap;
          bestPane = cand;
        }
      } else if (dir === 'down' && r.top >= curRect.bottom - 10) {
        const overlap = Math.min(r.right, curRect.right) - Math.max(r.left, curRect.left);
        const dist = Math.max(0, r.top - curRect.bottom);
        if (overlap > 12 && (dist < bestDist - 4 || (Math.abs(dist - bestDist) <= 4 && overlap > bestOverlap))) {
          bestDist = dist;
          bestOverlap = overlap;
          bestPane = cand;
        }
      }
    }

    if (bestPane) {
      setFocusZone('pane', bestPane.id);
    } else if (dir === 'left') {
      // No pane further left -> enter Left File Browser!
      setFocusZone('files');
    }
  }

  function toggleSyncScroll() {
    syncScroll = !syncScroll;
    updatePaneCountAttr();
    showToast(syncScroll ? 'Scroll sincronizado: ON' : 'Scroll sincronizado: OFF');
  }

  // Topbar event listeners
  const savedTheme = localStorage.getItem('mdv-theme') || initCfg.defaultTheme || 'tokyo';
  applyTheme(savedTheme, false);

  if (localStorage.getItem('mdv-wide') === '1') {
    document.body.classList.add('wide-mode');
    btnWide?.classList.add('is-active');
  }
  if (!initCfg.dirMode && localStorage.getItem('mdv-hide-files') === '1') {
    document.body.classList.add('hide-files');
    btnFiles?.classList.remove('is-active');
  }

  sidebarFilesEl?.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input, button')) return;
    if (focusZone !== 'files') setFocusZone('files', focusedPaneId, false);
  });

  themeSelect?.addEventListener('change', (e) => applyTheme(e.target.value, true));
  btnFiles?.addEventListener('click', toggleFilesPanel);
  btnToc?.addEventListener('click', toggleTocPanel);
  btnWide?.addEventListener('click', toggleWideMode);
  btnSplitV?.addEventListener('click', () => splitPane(focusedPaneId, 'vertical', 'markdown'));
  btnSplitH?.addEventListener('click', () => splitPane(focusedPaneId, 'horizontal', 'markdown'));
  btnTermV?.addEventListener('click', () => splitPane(focusedPaneId, 'vertical', 'terminal'));
  btnTermH?.addEventListener('click', () => splitPane(focusedPaneId, 'horizontal', 'terminal'));
  btnFontDec?.addEventListener('click', () => applyZoom(zoomPercent - 10));
  btnFontReset?.addEventListener('click', () => applyZoom(100));
  btnFontInc?.addEventListener('click', () => applyZoom(zoomPercent + 10));
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
      setFocusZone('files', focusedPaneId, false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      fileFilterEl.blur();
      setFocusZone('files', focusedPaneId, false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const firstVisible = fileListEl?.querySelector('.mdv-file-item:not([hidden])');
      const targetPath = firstVisible?.getAttribute('data-file-path');
      if (targetPath) {
        fileFilterEl.blur();
        if (e.altKey || e.shiftKey) {
          splitPane(focusedPaneId, 'vertical', 'markdown', { filePath: targetPath });
        } else {
          const cur = activePane();
          const mdTarget = cur?.kind === 'markdown' ? cur : allMarkdownPanes()[0];
          if (mdTarget) {
            loadDocumentInPane(mdTarget.id, targetPath, { pushState: true });
            setFocusZone('pane', mdTarget.id, false);
          } else {
            splitPane(focusedPaneId, 'vertical', 'markdown', { filePath: targetPath });
          }
        }
      }
    }
  });

  // Carousels & Mermaid
  function initCarouselsForPane(pane) {
    if (pane.kind !== 'markdown') return;
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
    if (pane?.kind !== 'markdown') return null;
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

  async function renderMermaidDiagrams(scope) {
    if (!window.mermaid || !scope) return;
    const isLight = currentThemeName() === 'light';
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

  // Search in Focused Markdown Pane
  let searchHits = [];
  let activeHitIdx = -1;
  let lastQuery = '';

  function clearSearchHighlights() {
    for (const mp of allMarkdownPanes()) {
      mp.article.querySelectorAll('mark.mdv-search-hit').forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
        parent.normalize();
      });
    }
    searchHits = [];
    activeHitIdx = -1;
    if (searchCountEl) searchCountEl.textContent = '0 / 0';
  }

  function highlightQuery(query) {
    clearSearchHighlights();
    lastQuery = query;
    const pane = activePane();
    if (!query || pane?.kind !== 'markdown') return;

    const targetArticle = pane.article;
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
      const scrollerTop = pane.scroller.getBoundingClientRect().top;
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

  function toggleHelpModal() {
    if (!modalEl || !modalBodyEl) return;
    if (!modalEl.hidden && modalBodyEl.querySelector('[data-help-sheet]')) {
      modalEl.hidden = true;
      return;
    }
    modalBodyEl.innerHTML = `
      <div data-help-sheet>
        <h3 class="mdv-help-title">
          <span>Atajos Vim, Splits Infinitos y Terminales WSL</span>
          <span class="mdv-kbd">Esc / ?</span>
        </h3>
        <div class="mdv-help-grid">
          <div class="mdv-help-section">
            <h4>Splits Infinitos y Terminales WSL</h4>
            <div class="mdv-help-row"><span>Split Markdown Right / Down</span><span><kbd class="mdv-kbd">Ctrl+Alt+R</kbd> / <kbd class="mdv-kbd">Ctrl+Alt+D</kbd></span></div>
            <div class="mdv-help-row"><span>Split Terminal WSL Right</span><span><kbd class="mdv-kbd">Alt+Shift+R</kbd> o <kbd class="mdv-kbd">Ctrl+Alt+T</kbd></span></div>
            <div class="mdv-help-row"><span>Split Terminal WSL Down</span><span><kbd class="mdv-kbd">Alt+Shift+D</kbd> o <kbd class="mdv-kbd">Ctrl+Alt+B</kbd></span></div>
            <div class="mdv-help-row"><span>Mover foco (Archivos / MD / Term)</span><span><kbd class="mdv-kbd">Alt + h / j / k / l</kbd></span></div>
            <div class="mdv-help-row"><span>Cerrar cualquier panel activo</span><span><kbd class="mdv-kbd">Alt+Shift+W</kbd> (o <kbd class="mdv-kbd">q</kbd> en MD)</span></div>
            <div class="mdv-help-row"><span>Igualar todos 50:50 / Solo actual</span><span><kbd class="mdv-kbd">Espacio =</kbd> / <kbd class="mdv-kbd">Espacio o</kbd></span></div>
          </div>
          <div class="mdv-help-section">
            <h4>Navegador de Archivos</h4>
            <div class="mdv-help-row"><span>Entrar / salir del árbol</span><span><kbd class="mdv-kbd">Alt + h</kbd> / <kbd class="mdv-kbd">Alt + l</kbd></span></div>
            <div class="mdv-help-row"><span>Mover cursor arriba / abajo</span><span><kbd class="mdv-kbd">j</kbd> / <kbd class="mdv-kbd">k</kbd></span></div>
            <div class="mdv-help-row"><span>Abrir archivo / carpeta</span><span><kbd class="mdv-kbd">o</kbd> o <kbd class="mdv-kbd">Enter</kbd></span></div>
            <div class="mdv-help-row"><span>Preview sin salir / Abrir Split</span><span><kbd class="mdv-kbd">O</kbd> / <kbd class="mdv-kbd">v</kbd></span></div>
            <div class="mdv-help-row"><span>Expandir / cerrar carpeta</span><span><kbd class="mdv-kbd">l</kbd> / <kbd class="mdv-kbd">h</kbd></span></div>
            <div class="mdv-help-row"><span>Filtro rápido</span><span><kbd class="mdv-kbd">Ctrl+P</kbd></span></div>
          </div>
          <div class="mdv-help-section">
            <h4>Lectura y Letra</h4>
            <div class="mdv-help-row"><span>Letra A+ / A− / 100%</span><span><kbd class="mdv-kbd">+</kbd> · <kbd class="mdv-kbd">-</kbd> · <kbd class="mdv-kbd">0</kbd></span></div>
            <div class="mdv-help-row"><span>Bajar / Subir · Media pág.</span><span><kbd class="mdv-kbd">j</kbd>/<kbd class="mdv-kbd">k</kbd> · <kbd class="mdv-kbd">d</kbd>/<kbd class="mdv-kbd">u</kbd></span></div>
            <div class="mdv-help-row"><span>Inicio / Final · Secciones</span><span><kbd class="mdv-kbd">gg</kbd>/<kbd class="mdv-kbd">G</kbd> · <kbd class="mdv-kbd">]]</kbd>/<kbd class="mdv-kbd">[[</kbd></span></div>
            <div class="mdv-help-row"><span>Carrusel anterior / siguiente</span><span><kbd class="mdv-kbd">h</kbd> / <kbd class="mdv-kbd">l</kbd></span></div>
            <div class="mdv-help-row"><span>Buscar / Siguiente / Anterior</span><span><kbd class="mdv-kbd">/</kbd> · <kbd class="mdv-kbd">n</kbd> · <kbd class="mdv-kbd">N</kbd></span></div>
          </div>
        </div>
      </div>`;
    modalEl.hidden = false;
  }

  // Delegated Clicks
  document.addEventListener('click', async (e) => {
    const splitOpenBtn = e.target.closest('[data-open-in-split]');
    if (splitOpenBtn) {
      e.preventDefault();
      e.stopPropagation();
      const file = splitOpenBtn.getAttribute('data-open-in-split');
      if (file) await splitPane(focusedPaneId, 'vertical', 'markdown', { filePath: file });
      return;
    }

    const paneActionBtn = e.target.closest('[data-pane-action]');
    if (paneActionBtn) {
      const action = paneActionBtn.getAttribute('data-pane-action');
      const pid = paneActionBtn.getAttribute('data-target-pane') || focusedPaneId;
      if (action === 'md-right') await splitPane(pid, 'vertical', 'markdown');
      else if (action === 'term-right') await splitPane(pid, 'vertical', 'terminal');
      else if (action === 'term-down') await splitPane(pid, 'horizontal', 'terminal');
      return;
    }

    const paneCloseBtn = e.target.closest('[data-pane-close]');
    if (paneCloseBtn) {
      closePaneById(paneCloseBtn.getAttribute('data-pane-close'));
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
      const pane = activePane();
      if (id && pane?.kind === 'markdown') {
        pane.article.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        const cur = activePane();
        if (e.altKey || e.shiftKey) {
          await splitPane(focusedPaneId, 'vertical', 'markdown', { filePath: targetFile });
        } else if (cur?.kind === 'markdown') {
          await loadDocumentInPane(cur.id, targetFile, { pushState: true, hash: url.hash });
          setFocusZone('pane', cur.id, false);
        } else {
          const existingMd = (lastMarkdownPaneId && panesById.get(lastMarkdownPaneId)) || allMarkdownPanes()[0];
          if (existingMd) {
            await loadDocumentInPane(existingMd.id, targetFile, { pushState: true, hash: url.hash });
            setFocusZone('pane', existingMd.id, false);
          } else {
            await splitPane(focusedPaneId, 'vertical', 'markdown', { filePath: targetFile });
          }
        }
      }
    }
  });

  // =========================================================================
  // GLOBAL KEYBOARD ENGINE (Capture phase)
  // =========================================================================
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
    if (pane?.kind !== 'markdown' || !pane.headings.length) return;
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
    const pane = activePane();
    if (!fileListEl || pane?.kind !== 'markdown') return;
    const items = Array.from(fileListEl.querySelectorAll('.mdv-file-item'));
    if (items.length <= 1) return;
    const curIdx = items.findIndex((li) => li.getAttribute('data-file-path') === pane.filePath);
    const nextIdx = ((curIdx >= 0 ? curIdx : 0) + dir + items.length) % items.length;
    const pathAttr = items[nextIdx].getAttribute('data-file-path');
    if (pathAttr) loadDocumentInPane(pane.id, pathAttr, { pushState: true });
  }

  window.addEventListener(
    'keydown',
    async (e) => {
      const inXterm = Boolean(e.target?.closest?.('.xterm'));
      const inInput = !inXterm && Boolean(e.target?.matches?.('input, textarea, select'));
      const isAltGraph = Boolean(e.getModifierState && e.getModifierState('AltGraph'));
      const isCtrlAlt = (e.ctrlKey && e.altKey && !e.metaKey) || (!inInput && isAltGraph && !e.metaKey);

      // 1. Global Split Creation Shortcuts (work inside Markdown, Terminal, AND File Tree!)
      if (isCtrlAlt) {
        // Ctrl+Alt+Shift+R/D OR Ctrl+Alt+T/B => WSL Terminal Split!
        if ((e.shiftKey && e.code === 'KeyR') || e.code === 'KeyT') {
          e.preventDefault();
          e.stopPropagation();
          await splitPane(focusedPaneId, 'vertical', 'terminal');
          return;
        }
        if ((e.shiftKey && e.code === 'KeyD') || e.code === 'KeyB') {
          e.preventDefault();
          e.stopPropagation();
          await splitPane(focusedPaneId, 'horizontal', 'terminal');
          return;
        }
        // Ctrl+Alt+R / Ctrl+Alt+D => Markdown Split!
        if (!e.shiftKey && (e.code === 'KeyR' || e.key?.toLowerCase() === 'r')) {
          e.preventDefault();
          e.stopPropagation();
          const selFile =
            focusZone === 'files' && treeCursorEl?.classList.contains('mdv-file-item')
              ? treeCursorEl.getAttribute('data-file-path')
              : null;
          await splitPane(focusedPaneId, 'vertical', 'markdown', { filePath: selFile });
          return;
        }
        if (!e.shiftKey && (e.code === 'KeyD' || e.key?.toLowerCase() === 'd')) {
          e.preventDefault();
          e.stopPropagation();
          const selFile =
            focusZone === 'files' && treeCursorEl?.classList.contains('mdv-file-item')
              ? treeCursorEl.getAttribute('data-file-path')
              : null;
          await splitPane(focusedPaneId, 'horizontal', 'markdown', { filePath: selFile });
          return;
        }
      }

      // Alt + Shift + R / D (WSL Terminal Right / Down) & Alt + Shift + W (Close active pane anywhere!)
      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        if (e.code === 'KeyR') {
          e.preventDefault();
          e.stopPropagation();
          await splitPane(focusedPaneId, 'vertical', 'terminal');
          return;
        }
        if (e.code === 'KeyD') {
          e.preventDefault();
          e.stopPropagation();
          await splitPane(focusedPaneId, 'horizontal', 'terminal');
          return;
        }
        if (e.code === 'KeyW') {
          e.preventDefault();
          e.stopPropagation();
          if (focusedPaneId) closePaneById(focusedPaneId);
          return;
        }
      }

      // 2. Spatial Alt + h / j / k / l across [Archivos] <-> [Markdown Panes] <-> [WSL Terminals]!
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey &&
        !isAltGraph &&
        ['KeyH', 'KeyJ', 'KeyK', 'KeyL'].includes(e.code)
      ) {
        e.preventDefault();
        e.stopPropagation();
        resetVimPending();
        const dirMap = { KeyH: 'left', KeyL: 'right', KeyJ: 'down', KeyK: 'up' };
        handleSpatialFocusNavigation(dirMap[e.code]);
        return;
      }

      // If user is typing inside a WSL Terminal (or form input), let all normal keys go directly to zsh/bash!
      const pane = activePane();
      if (inInput || (focusZone === 'pane' && pane?.kind === 'terminal')) {
        return;
      }

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
          setFocusZone('pane', focusedPaneId);
          return;
        }
        if (searchHits.length > 0) {
          clearSearchHighlights();
          showToast('Búsqueda limpia');
        }
        return;
      }

      // <Leader> (Space) Split Window commands
      if (pendingPrefix === '␣') {
        resetVimPending();
        e.preventDefault();
        const k = e.key;
        if (k === 'v' || k === '|') await splitPane(focusedPaneId, 'vertical', 'markdown');
        else if (k === 's' || k === '-') await splitPane(focusedPaneId, 'horizontal', 'markdown');
        else if (k === 't') await splitPane(focusedPaneId, 'vertical', 'terminal');
        else if (k === 'T') await splitPane(focusedPaneId, 'horizontal', 'terminal');
        else if (k === 'h') handleSpatialFocusNavigation('left');
        else if (k === 'l') handleSpatialFocusNavigation('right');
        else if (k === 'k') handleSpatialFocusNavigation('up');
        else if (k === 'j') handleSpatialFocusNavigation('down');
        else if (k === '=') {
          equalizeAllBranches();
          showToast('Splits igualados 50 / 50');
        } else if (k === 'y') {
          toggleSyncScroll();
        } else if (k === 'q' || k === 'c') {
          if (focusedPaneId) closePaneById(focusedPaneId);
        } else if (k === 'o') {
          if (focusedPaneId) closeOtherPanes(focusedPaneId);
        }
        return;
      }

      // Ctrl shortcuts in Markdown / Files mode
      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key === 'p') {
          e.preventDefault();
          if (document.body.classList.contains('hide-files')) toggleFilesPanel();
          fileFilterEl?.focus();
          fileFilterEl?.select();
          return;
        }
        if (focusZone === 'pane' && pane?.kind === 'markdown') {
          const scroller = pane.scroller;
          if (e.key === 'd') {
            e.preventDefault();
            scroller.scrollBy({ top: scroller.clientHeight * 0.5, behavior: 'auto' });
          } else if (e.key === 'u') {
            e.preventDefault();
            scroller.scrollBy({ top: -scroller.clientHeight * 0.5, behavior: 'auto' });
          } else if (e.key === 'f') {
            e.preventDefault();
            scroller.scrollBy({ top: scroller.clientHeight * 0.88, behavior: 'auto' });
          } else if (e.key === 'b') {
            e.preventDefault();
            scroller.scrollBy({ top: -scroller.clientHeight * 0.88, behavior: 'auto' });
          }
        }
        return;
      }

      if (e.metaKey || e.altKey) return;

      if (/^[1-9]$/.test(e.key) || (e.key === '0' && countPrefix.length > 0)) {
        if (!pendingPrefix) {
          setPending('', countPrefix + e.key);
          return;
        }
      }

      const count = Math.max(1, Number(countPrefix || 1));

      // FILE BROWSER VIM MODE
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
            setFocusZone('pane', focusedPaneId);
            return;
        }
        return;
      }

      // MARKDOWN PANE VIM MODE
      if (!pane || pane.kind !== 'markdown') return;
      const scroller = pane.scroller;

      if (e.key === 'Tab' && panesById.size > 1) {
        e.preventDefault();
        const ids = Array.from(panesById.keys());
        const nextId = ids[(ids.indexOf(pane.id) + 1) % ids.length];
        setFocusZone('pane', nextId);
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
          await splitPane(pane.id, 'vertical', 'markdown');
          break;
        case 'S':
          e.preventDefault();
          await splitPane(pane.id, 'horizontal', 'markdown');
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
            await loadDocumentInPane(pane.id, pane.filePath, { preserveScroll: true, isLiveReload: true });
            showToast('Recargado');
          }
          break;
        case '?':
          e.preventDefault();
          toggleHelpModal();
          break;
        case 'q':
          e.preventDefault();
          closePaneById(pane.id);
          break;
      }
    },
    { capture: true }
  );

  // =========================================================================
  // SCROLL-SPY, DOCUMENT LOADING & LIVE-RELOAD
  // =========================================================================
  function refreshHeadings(pane) {
    if (pane?.kind !== 'markdown') return;
    pane.headings = Array.from(pane.article.querySelectorAll('.mdv-heading[id]'));
  }

  function onMarkdownPaneScroll(pane) {
    if (pane.kind !== 'markdown') return;
    const scroller = pane.scroller;
    const scrollTop = scroller.scrollTop;
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;

    if (syncScroll && !isSyncingScroll && maxScroll > 0) {
      isSyncingScroll = true;
      for (const other of allMarkdownPanes()) {
        if (other.id === pane.id) continue;
        const otherMax = other.scroller.scrollHeight - other.scroller.clientHeight;
        if (otherMax > 0) {
          other.scroller.scrollTop = (scrollTop / maxScroll) * otherMax;
        }
      }
      requestAnimationFrame(() => {
        isSyncingScroll = false;
      });
    }

    if (pane.id !== focusedPaneId || focusZone === 'files') return;

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
    const cur = activePane();
    const focusedPath = cur?.kind === 'markdown' ? cur.filePath : '';
    const openMdPaths = new Set(allMarkdownPanes().map((p) => p.filePath));
    let activeLi = null;

    fileListEl.querySelectorAll('.mdv-file-item').forEach((li) => {
      const p = li.getAttribute('data-file-path');
      const isCur = Boolean(focusedPath) && p === focusedPath;
      const isSec = !isCur && openMdPaths.has(p);
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
    paneId,
    filePath,
    { pushState = false, hash = '', preserveScroll = false, isLiveReload = false } = {}
  ) {
    const pane = panesById.get(paneId);
    if (!pane || pane.kind !== 'markdown' || !filePath) return;

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

    if (pane.id === focusedPaneId) {
      if (fileNameEl) fileNameEl.textContent = pane.relPath;
      document.title = `${data.title || data.fileName} — mdv`;
      renderToc(pane.toc);
      if (lastQuery) highlightQuery(lastQuery);
    }
    updateFileTreeMarkers();

    if (isLiveReload) flashReloadIndicator();

    if (pushState) {
      history.pushState({ file: pane.filePath }, '', `/?file=${encodeURIComponent(pane.filePath)}${hash || ''}`);
    }
    if (hash) {
      pane.article.querySelector(`#${CSS.escape(hash.slice(1))}`)?.scrollIntoView();
    } else if (isSameFile || preserveScroll) {
      pane.scroller.scrollTop = scrollBefore;
    } else {
      pane.scroller.scrollTop = 0;
    }
    onMarkdownPaneScroll(pane);
  }

  window.addEventListener('popstate', (e) => {
    const f = e.state?.file || new URLSearchParams(location.search).get('file');
    const md = allMarkdownPanes()[0];
    if (f && md) loadDocumentInPane(md.id, f, { pushState: false, hash: location.hash });
  });

  function connectEvents() {
    const es = new EventSource('/events');
    es.onopen = () => liveDotEl?.classList.remove('is-disconnected');
    es.onerror = () => liveDotEl?.classList.add('is-disconnected');
    es.addEventListener('reload', (ev) => {
      let payload = {};
      try { payload = JSON.parse(ev.data || '{}'); } catch {}
      if (payload.reason === 'tree') {
        const md = allMarkdownPanes()[0];
        if (md?.filePath) {
          loadDocumentInPane(md.id, md.filePath, { preserveScroll: true, isLiveReload: false });
        }
        return;
      }
      const changed = payload.file;
      for (const mp of allMarkdownPanes()) {
        if (!changed || mp.filePath === changed) {
          loadDocumentInPane(mp.id, mp.filePath, { preserveScroll: true, isLiveReload: true });
        }
      }
    });
  }

  // Boot initial root Markdown pane
  if (initCfg.maximized) {
    try {
      if (window.outerWidth < screen.availWidth - 24 || window.outerHeight < screen.availHeight - 24) {
        window.moveTo(screen.availLeft || 0, screen.availTop || 0);
        window.resizeTo(screen.availWidth, screen.availHeight);
      }
    } catch {}
  }

  const rootPane = createMarkdownPane({
    filePath: initCfg.currentFile || '',
    relPath: initCfg.initialRelPath || '',
    html: initialHtml,
    toc: initCfg.initialToc || []
  });
  rootTree = rootPane;
  panesRootEl.appendChild(rootPane.el);
  focusedPaneId = rootPane.id;

  applyZoom(zoomPercent, false);
  initCarouselsForPane(rootPane);
  renderMermaidDiagrams(rootPane.article).then(() => initHorizontalBlockScrollbars(rootPane.article));
  initHorizontalBlockScrollbars(rootPane.article);
  refreshHeadings(rootPane);
  setFocusZone('pane', rootPane.id, false);
  updatePaneCountAttr();
  connectEvents();

  if (initCfg.splitFile) {
    splitPane(rootPane.id, initCfg.splitDirection || 'vertical', 'markdown', {
      filePath: initCfg.splitFile
    });
  }
})();
