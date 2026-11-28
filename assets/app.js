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

  const workspaceEl = document.querySelector('.mdv-workspace');
  const sidebarFilesEl = document.querySelector('.mdv-sidebar-files');
  const mdZoneEl = document.getElementById('mdv-md-zone');
  const termZoneEl = document.getElementById('mdv-term-zone');
  const sideZoneEl = document.getElementById('mdv-side-zone');
  const zoneResizerEl = document.getElementById('mdv-zone-resizer');
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
  const btnFocusTermZone = document.getElementById('mdv-focus-term-zone');
  const btnToggleSideZone = document.getElementById('mdv-toggle-side-zone');
  const btnTermV = document.getElementById('mdv-term-vertical');
  const btnTermH = document.getElementById('mdv-term-horizontal');
  const btnFontDec = document.getElementById('mdv-font-dec');
  const btnFontReset = document.getElementById('mdv-font-reset');
  const btnFontInc = document.getElementById('mdv-font-inc');
  const btnSearch = document.getElementById('mdv-open-search');
  const btnHelp = document.getElementById('mdv-open-help');
  const topbarEl = document.getElementById('mdv-topbar');
  const btnWinMin = document.getElementById('mdv-win-min');
  const btnWinMax = document.getElementById('mdv-win-max');
  const btnWinClose = document.getElementById('mdv-win-close');

  function postNativeWin(msg) {
    if (window.__MDV_NATIVE_WIN__ && window.ipc?.postMessage) {
      window.ipc.postMessage(msg);
    }
  }

  if (window.__MDV_NATIVE_WIN__) {
    document.documentElement.classList.add('is-native-win');
    btnWinMin?.addEventListener('click', () => postNativeWin('minimize'));
    btnWinMax?.addEventListener('click', () => postNativeWin('toggle_maximize'));
    btnWinClose?.addEventListener('click', () => postNativeWin('close'));

    topbarEl?.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button, select, input, a, .mdv-win-controls')) return;
      e.preventDefault();
      if (e.detail === 2) {
        postNativeWin('toggle_maximize');
      } else {
        postNativeWin('drag');
      }
    });

    document.querySelector('.mdv-win-resize-ring')?.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const edge = e.target.closest('[data-win-resize]')?.getAttribute('data-win-resize');
      if (edge) {
        e.preventDefault();
        postNativeWin(`resize:${edge}`);
      }
    });
  }
  const totalFilesEl = document.getElementById('mdv-total-files');
  const fileFilterEl = document.getElementById('mdv-file-filter');
  const expandTreeBtn = document.getElementById('mdv-tree-expand-all');
  const collapseTreeBtn = document.getElementById('mdv-tree-collapse-all');
  const modalEl = document.getElementById('mdv-modal');
  const modalBodyEl = document.getElementById('mdv-modal-body');

  // Side Panel Tabs & Toolbars
  const tabMarkdownPanelEl = document.getElementById('mdv-tab-markdown');
  const tabClickupPanelEl = document.getElementById('mdv-tab-clickup');
  const mdToolbarEl = document.getElementById('mdv-md-toolbar');
  const cuToolbarEl = document.getElementById('mdv-cu-toolbar');

  // ClickUp & Task Terminal elements
  const termParkEl = document.getElementById('mdv-term-park');
  const termEmptyEl = document.getElementById('mdv-term-empty');
  const termEmptyMsgEl = document.getElementById('mdv-term-empty-msg');
  const termNewDefaultBtn = document.getElementById('mdv-term-new-default');
  const cuCountChipEl = document.getElementById('mdv-cu-count-chip');
  const cuOnlyTermsBtn = document.getElementById('mdv-cu-only-terms');
  const cuTermsChipEl = document.getElementById('mdv-cu-terms-chip');
  const cuRefreshBtn = document.getElementById('mdv-cu-refresh');
  const cuSettingsBtn = document.getElementById('mdv-cu-settings-btn');
  const cuAuthViewEl = document.getElementById('mdv-cu-auth-view');
  const cuTasksViewEl = document.getElementById('mdv-cu-tasks-view');
  const cuOpenAppsBtn = document.getElementById('mdv-cu-open-apps-btn');
  const cuTokenInput = document.getElementById('mdv-cu-token');
  const cuAuthErrorEl = document.getElementById('mdv-cu-auth-error');
  const cuConnectBtn = document.getElementById('mdv-cu-connect-btn');
  const cuBackTasksBtn = document.getElementById('mdv-cu-back-tasks-btn');
  const cuDisconnectBtn = document.getElementById('mdv-cu-disconnect-btn');
  const cuTeamSelect = document.getElementById('mdv-cu-team-select');
  const cuUserBadgeEl = document.getElementById('mdv-cu-user-badge');
  const cuAssigneeScrollEl = document.getElementById('mdv-cu-assignee-scroll');
  const cuAssigneeTabsEl = document.getElementById('mdv-cu-assignee-tabs');
  const cuSearchInput = document.getElementById('mdv-cu-search');
  const cuLookupBtn = document.getElementById('mdv-cu-lookup-btn');
  const cuTasksErrorEl = document.getElementById('mdv-cu-tasks-error');
  const cuLoadingEl = document.getElementById('mdv-cu-loading');
  const cuEmptyEl = document.getElementById('mdv-cu-empty');
  const cuTaskListEl = document.getElementById('mdv-cu-task-list');
  const cuMoreWrapEl = document.getElementById('mdv-cu-more-wrap');
  const cuLoadMoreBtn = document.getElementById('mdv-cu-load-more');

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
    overflow: { x: 'scroll', y: 'scroll' },
    scrollbars: { theme: 'os-theme-mdv', autoHide: 'scroll', autoHideDelay: 650, clickScroll: true }
  };
  const OS_SIDE_OPTS = {
    overflow: { x: 'scroll', y: 'scroll' },
    scrollbars: { theme: 'os-theme-mdv', autoHide: 'leave', autoHideDelay: 350, clickScroll: true }
  };
  const OS_BLOCK_OPTS = {
    overflow: { x: 'scroll', y: 'hidden' },
    scrollbars: { theme: 'os-theme-mdv', autoHide: 'leave', autoHideDelay: 300, clickScroll: true }
  };

  function bindHorizontalWheel(osInstanceOrEl) {
    const vp = osInstanceOrEl?.elements ? osInstanceOrEl.elements().viewport : osInstanceOrEl;
    if (!vp) return;
    vp.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && vp.scrollWidth > vp.clientWidth + 2) {
          e.preventDefault();
          vp.scrollLeft += e.deltaY;
        }
      },
      { passive: false }
    );
  }

  function initHorizontalBlockScrollbars(scope) {
    if (window.hljs && scope) {
      scope.querySelectorAll('.mdv-code-card pre code:not([data-highlighted])').forEach((el) => {
        try { window.hljs.highlightElement(el); } catch {}
      });
    }
    if (window.katex && scope) {
      scope.querySelectorAll('[data-math]:not([data-math-rendered])').forEach((el) => {
        try {
          const expr = el.getAttribute('data-math') || '';
          const displayMode = el.classList.contains('mdv-math-block');
          window.katex.render(expr, el, { displayMode, throwOnError: false });
          el.setAttribute('data-math-rendered', '1');
        } catch {}
      });
    }
    if (!OverlayScrollbars || !scope) return;
    scope
      .querySelectorAll('.mdv-code-card pre, .mdv-table-wrap, .mdv-mermaid-stage, .mdv-mermaid-raw, .mdv-math-block')
      .forEach((el) => OverlayScrollbars(el, OS_BLOCK_OPTS));
  }

  const filesScrollEl = document.getElementById('mdv-files-scroll');
  const tocScrollEl = document.getElementById('mdv-toc-scroll');
  const cuScrollEl = document.getElementById('mdv-cu-scroll');
  const modalScrollEl = document.getElementById('mdv-modal-scroll');
  let cuAssigneeOs = null;
  if (OverlayScrollbars) {
    if (filesScrollEl) OverlayScrollbars(filesScrollEl, OS_SIDE_OPTS);
    if (tocScrollEl) OverlayScrollbars(tocScrollEl, OS_SIDE_OPTS);
    if (cuScrollEl) OverlayScrollbars(cuScrollEl, OS_MAIN_OPTS);
    if (cuAuthViewEl) OverlayScrollbars(cuAuthViewEl, OS_MAIN_OPTS);
    if (cuAssigneeScrollEl) {
      cuAssigneeOs = OverlayScrollbars(cuAssigneeScrollEl, OS_BLOCK_OPTS);
      bindHorizontalWheel(cuAssigneeOs);
    }
    if (mdToolbarEl) bindHorizontalWheel(OverlayScrollbars(mdToolbarEl, OS_BLOCK_OPTS));
    if (cuToolbarEl) bindHorizontalWheel(OverlayScrollbars(cuToolbarEl, OS_BLOCK_OPTS));
    if (modalScrollEl) {
      OverlayScrollbars(modalScrollEl, {
        overflow: { x: 'scroll', y: 'scroll' },
        scrollbars: { theme: 'os-theme-mdv', autoHide: 'leave', autoHideDelay: 350, clickScroll: true }
      });
    }
  }

  // =========================================================================
  // SEPARATED DUAL INFINITE TREES + SIDE PANEL TABS:
  //   Left (Main): termRootTree (WSL Terminals inside #mdv-term-zone)
  //   Right Tabs:  [Markdown: mdRootTree] | [Clickup: OAuth + Tasks]
  // =========================================================================
  let nextNodeSeq = 1;
  let mdRootTree = null;
  let termRootTree = null;
  const mdPanes = new Map(); // id -> MarkdownPane
  const termPanes = new Map(); // id -> TerminalPane

  let focusedMdPaneId = null;
  let focusedTermPaneId = null;
  let focusZone = 'terminal'; // 'terminal' | 'files' | 'markdown' | 'clickup'
  let activeSideTab = 'markdown'; // 'markdown' | 'clickup'
  let treeCursorEl = null;
  let syncScroll = false;
  let isSyncingScroll = false;
  let zoomPercent = Number(localStorage.getItem('mdv-zoom') || initCfg.defaultZoom || 100);
  let reloadPillTimer = null;
  let toastTimer = null;

  // ClickUp runtime state + Task -> Terminal map
  const taskTerminals = new Map(); // taskId -> paneId
  const cuState = {
    connected: Boolean(initCfg.clickup?.connected),
    hasSavedToken: Boolean(initCfg.clickup?.hasSavedToken),
    selectedTeamId: initCfg.clickup?.selectedTeamId || '',
    currentUserId: null,
    assigneeFilter: localStorage.getItem('mdv-cu-assignee') || 'all', // 'all' | 'unassigned' | String(userId)
    onlyWithTerminal: localStorage.getItem('mdv-cu-only-terms') === '1',
    page: 0,
    hasMore: false,
    tasks: [],
    pinnedTasks: new Map(), // taskId -> task (looked up by ID)
    prsByTask: new Map(), // taskId -> GitHubPrSummary[]
    lookupLoading: false,
    lastLookupKey: '',
    selectedIdx: -1,
    showingSettings: false,
    loadedOnce: false,
    loading: false
  };

  function activeMdPane() {
    return mdPanes.get(focusedMdPaneId) || mdPanes.values().next().value || null;
  }

  function visibleTermPanes() {
    return Array.from(termPanes.values()).filter((p) => !p.isHidden);
  }

  function activeTermPane() {
    const focused = termPanes.get(focusedTermPaneId);
    if (focused && !focused.isHidden) return focused;
    return visibleTermPanes()[0] || null;
  }

  function updateZoneCounts() {
    const visTerms = visibleTermPanes().length;
    mdZoneEl.setAttribute('data-md-count', String(mdPanes.size));
    termZoneEl.setAttribute('data-term-count', String(visTerms));
    termZoneEl.setAttribute('data-total-terms', String(termPanes.size));
    if (termEmptyEl) {
      termEmptyEl.hidden = visTerms > 0;
      if (visTerms === 0 && termEmptyMsgEl) {
        const hiddenCount = termPanes.size;
        termEmptyMsgEl.textContent =
          hiddenCount > 0
            ? `${hiddenCount} terminal${hiddenCount === 1 ? '' : 'es'} activa${hiddenCount === 1 ? '' : 's'} en 2° plano · haz clic en su tarea para mostrarla`
            : 'Sin terminales abiertas';
      }
    }
    document.querySelectorAll('[data-pane-sync]').forEach((b) => b.classList.toggle('is-active', syncScroll));
  }

  function savePrefs(patch) {
    fetch('/api/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    }).catch(() => {});
  }

  let workspaceRestoring = false;
  let saveWsTimer = null;

  function serializeTermTree(node) {
    if (!node) return null;
    if (node.type === 'pane') {
      return {
        type: 'pane',
        id: node.id,
        cwd: node.cwd || '',
        explicitCwd: Boolean(node.explicitCwd),
        taskMeta: node.taskMeta || null,
        worktreeMeta: node.worktreeMeta || null
      };
    }
    return {
      type: 'split',
      direction: node.direction === 'horizontal' ? 'horizontal' : 'vertical',
      ratio: typeof node.ratio === 'number' ? node.ratio : 0.5,
      first: serializeTermTree(node.first),
      second: serializeTermTree(node.second)
    };
  }

  function buildWorkspaceStateSnapshot() {
    const hiddenTerms = [];
    for (const p of termPanes.values()) {
      if (p.isHidden) {
        hiddenTerms.push({
          id: p.id,
          cwd: p.cwd || '',
          explicitCwd: Boolean(p.explicitCwd),
          taskMeta: p.taskMeta || null,
          worktreeMeta: p.worktreeMeta || null
        });
      }
    }
    const pinnedTasks = [];
    for (const [taskId, taskObj] of cuState.pinnedTasks.entries()) {
      if (taskTerminals.has(taskId)) {
        pinnedTasks.push(taskObj);
      }
    }
    return {
      version: 1,
      nextNodeSeq,
      activeSideTab,
      sideZoneHidden: document.body.classList.contains('hide-side-zone'),
      focusedTermPaneId,
      termTree: serializeTermTree(termRootTree),
      hiddenTerms,
      pinnedTasks
    };
  }

  function flushWorkspaceStateBeacon() {
    if (workspaceRestoring) return;
    try {
      const body = JSON.stringify(buildWorkspaceStateSnapshot());
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/workspace-state', body);
      } else {
        fetch('/api/workspace-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true
        }).catch(() => {});
      }
    } catch {}
  }

  function scheduleSaveWorkspaceState() {
    if (workspaceRestoring) return;
    clearTimeout(saveWsTimer);
    saveWsTimer = setTimeout(() => {
      const body = JSON.stringify(buildWorkspaceStateSnapshot());
      fetch('/api/workspace-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      }).catch(() => {});
    }, 120);
  }

  window.addEventListener('pagehide', flushWorkspaceStateBeacon);
  window.addEventListener('beforeunload', flushWorkspaceStateBeacon);

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
    for (const tp of termPanes.values()) {
      if (tp.term) tp.term.options.theme = xtermTheme;
    }

    if (rerender) {
      savePrefs({ theme });
      for (const mp of mdPanes.values()) {
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

    for (const mp of mdPanes.values()) {
      mp.article.style.fontSize = `${zoomPercent}%`;
    }
    const termPx = Math.max(11, Math.min(24, Math.round((15 * zoomPercent) / 100)));
    for (const tp of termPanes.values()) {
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
    if (activeSideTab !== 'markdown') switchSideTab('markdown', { announce: false });
    if (document.body.classList.contains('hide-side-zone')) toggleSideZone(false);
    const hidden = document.body.classList.toggle('hide-files');
    btnFiles?.classList.toggle('is-active', !hidden);
    localStorage.setItem('mdv-hide-files', hidden ? '1' : '0');
    if (hidden && focusZone === 'files') {
      setFocusZone('markdown', focusedMdPaneId, false);
    }
    requestAnimationFrame(() => fitAllTerminals());
  }

  function toggleTocPanel() {
    if (activeSideTab !== 'markdown') switchSideTab('markdown', { announce: false });
    if (document.body.classList.contains('hide-side-zone')) toggleSideZone(false);
    const hidden = document.body.classList.toggle('hide-toc');
    btnToc?.classList.toggle('is-active', !hidden);
    requestAnimationFrame(() => fitAllTerminals());
  }

  function syncTabButtonsUi() {
    const sideHidden = document.body.classList.contains('hide-side-zone');
    btnToggleSideZone?.classList.toggle('is-active', !sideHidden);
    document.querySelectorAll('[data-side-tab]').forEach((btn) => {
      const isAct = btn.getAttribute('data-side-tab') === activeSideTab;
      btn.classList.toggle('is-active', isAct);
      btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
    });
    document.querySelectorAll('[data-top-tab]').forEach((btn) => {
      const isAct = !sideHidden && btn.getAttribute('data-top-tab') === activeSideTab;
      btn.classList.toggle('is-active', isAct);
    });
  }

  function toggleSideZone(announce = true) {
    const hidden = document.body.classList.toggle('hide-side-zone');
    localStorage.setItem('mdv-hide-side', hidden ? '1' : '0');
    syncTabButtonsUi();
    if (hidden && focusZone !== 'terminal') {
      setFocusZone('terminal', focusedTermPaneId, false);
    }
    requestAnimationFrame(() => fitAllTerminals());
    scheduleSaveWorkspaceState();
    if (announce) showToast(hidden ? 'Panel lateral oculto' : 'Panel lateral visible');
  }

  function switchSideTab(tabName, { focusTab = false, announce = true } = {}) {
    const nextTab = tabName === 'clickup' ? 'clickup' : 'markdown';
    activeSideTab = nextTab;
    localStorage.setItem('mdv-side-tab', nextTab);

    if (document.body.classList.contains('hide-side-zone')) {
      document.body.classList.remove('hide-side-zone');
      localStorage.setItem('mdv-hide-side', '0');
    }

    sideZoneEl?.setAttribute('data-active-tab', nextTab);
    if (tabMarkdownPanelEl) tabMarkdownPanelEl.hidden = nextTab !== 'markdown';
    if (tabClickupPanelEl) tabClickupPanelEl.hidden = nextTab !== 'clickup';
    if (mdToolbarEl) mdToolbarEl.hidden = nextTab !== 'markdown';
    if (cuToolbarEl) cuToolbarEl.hidden = nextTab !== 'clickup';
    syncTabButtonsUi();

    if (nextTab === 'clickup') {
      ensureClickUpBootstrapped();
      if (focusTab || focusZone === 'markdown' || focusZone === 'files') {
        setFocusZone('clickup', null, false);
      }
    } else {
      if (focusTab || focusZone === 'clickup') {
        setFocusZone('markdown', focusedMdPaneId, false);
      }
      const mp = activeMdPane();
      if (mp) renderMermaidDiagrams(mp.article);
    }

    requestAnimationFrame(() => fitAllTerminals());
    scheduleSaveWorkspaceState();
    if (announce) showToast(`Tab: ${nextTab === 'clickup' ? 'Clickup' : 'Markdown'}`);
  }

  function toggleWideMode() {
    const wide = document.body.classList.toggle('wide-mode');
    btnWide?.classList.toggle('is-active', wide);
    localStorage.setItem('mdv-wide', wide ? '1' : '0');
    showToast(wide ? 'Ancho: expandido' : 'Ancho: lectura');
  }

  function fitAllTerminals() {
    for (const tp of termPanes.values()) {
      tp.fitTerminal?.();
    }
  }

  // Draggable Main Resizer between [Principal Terminal Zone] (Left) and [Side Tab Panel] (Right)
  const savedSideWidth = localStorage.getItem('mdv-side-width');
  if (savedSideWidth && workspaceEl) {
    workspaceEl.style.setProperty('--mdv-side-width', savedSideWidth);
  }

  zoneResizerEl?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    isDraggingSplit = true;
    zoneResizerEl.setPointerCapture(e.pointerId);
    zoneResizerEl.classList.add('is-dragging');
    let dragRaf = 0;
    const onMove = (ev) => {
      const clientX = ev.clientX;
      if (dragRaf) return;
      dragRaf = requestAnimationFrame(() => {
        dragRaf = 0;
        const wsRect = workspaceEl.getBoundingClientRect();
        const rightWidth = Math.max(320, Math.min(wsRect.width * 0.74, wsRect.right - clientX));
        const pct = `${((rightWidth / wsRect.width) * 100).toFixed(2)}vw`;
        workspaceEl.style.setProperty('--mdv-side-width', pct);
        localStorage.setItem('mdv-side-width', pct);
      });
    };
    const onUp = () => {
      isDraggingSplit = false;
      if (dragRaf) cancelAnimationFrame(dragRaf);
      zoneResizerEl.classList.remove('is-dragging');
      zoneResizerEl.removeEventListener('pointermove', onMove);
      zoneResizerEl.removeEventListener('pointerup', onUp);
      fitAllTerminals();
    };
    zoneResizerEl.addEventListener('pointermove', onMove);
    zoneResizerEl.addEventListener('pointerup', onUp);
  });

  zoneResizerEl?.addEventListener('dblclick', () => {
    workspaceEl?.style.setProperty('--mdv-side-width', '46vw');
    localStorage.setItem('mdv-side-width', '46vw');
    requestAnimationFrame(() => fitAllTerminals());
    showToast('Proporción restablecida');
  });

  // =========================================================================
  // PANE FACTORIES (SEPARATED MARKDOWN ZONE vs TERMINAL ZONE)
  // =========================================================================
  function sanitizeCssColor(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
    if (/^(rgba?|hsla?)\([^;{}<>"]+\)$/i.test(s)) return s;
    return '';
  }

  function buildPaneHeaderHtml(id, kind, titleText, taskMeta = null, worktreeMeta = null) {
    if (kind === 'terminal') {
      let leftBadge = `<span class="mdv-term-glyph">&gt;_</span>`;
      const safeStatusColor = sanitizeCssColor(taskMeta?.statusColor);
      const colorStyleAttr = safeStatusColor
        ? ` style="--task-status-color:${escapeHtmlAttr(safeStatusColor)}" data-has-status-color="1"`
        : '';
      if (worktreeMeta) {
        const wtCodeLabel = worktreeMeta.code
          ? `${worktreeMeta.code}/${worktreeMeta.repo}`
          : worktreeMeta.repo || 'worktree';
        const tip = taskMeta?.status
          ? `${taskMeta.status} · ${worktreeMeta.path || ''}`
          : worktreeMeta.path || '';
        leftBadge = `<span class="mdv-term-task-badge is-worktree" data-pane-task-badge${colorStyleAttr} title="${escapeHtmlAttr(tip)}">⎇ ${escapeHtmlAttr(wtCodeLabel)}</span>`;
      } else if (taskMeta) {
        const tip = taskMeta.status ? `Estado en ClickUp: ${taskMeta.status}` : taskMeta.code;
        leftBadge = `<span class="mdv-term-task-badge" data-pane-task-badge${colorStyleAttr} title="${escapeHtmlAttr(tip)}">${escapeHtmlAttr(taskMeta.code)}</span>`;
      }
      const wtSlot =
        taskMeta && !worktreeMeta
          ? `<span class="mdv-pane-wt-slot" data-pane-wt-slot hidden></span>`
          : '';
      const hideBtn =
        taskMeta && !worktreeMeta
          ? `<button type="button" class="mdv-pane-btn" data-pane-hide="${id}" title="Ocultar terminal en 2° plano (toggle)">—</button>`
          : '';
      return `
        <div class="mdv-pane-bar">
          <div class="mdv-pane-bar-left">
            <span class="mdv-pane-dot"></span>
            ${leftBadge}
            <span class="mdv-pane-title" data-pane-title>${escapeHtmlAttr(titleText)}</span>
          </div>
          <div class="mdv-pane-bar-right">
            ${wtSlot}
            ${hideBtn}
            <button type="button" class="mdv-pane-btn" data-pane-action="term-right" data-target-pane="${id}" title="Split Terminal a la derecha (Ctrl+Alt+R)">+|</button>
            <button type="button" class="mdv-pane-btn" data-pane-action="term-down" data-target-pane="${id}" title="Split Terminal abajo (Ctrl+Alt+D)">+—</button>
            <button type="button" class="mdv-pane-btn" data-pane-close="${id}" data-close-kind="terminal" title="Cerrar esta terminal (Ctrl+Shift+W / Ctrl+Alt+W)">✕</button>
          </div>
        </div>`;
    }
    return `
      <div class="mdv-pane-bar">
        <div class="mdv-pane-bar-left">
          <span class="mdv-pane-dot"></span>
          <span class="mdv-pane-title" data-pane-title>${escapeHtmlAttr(titleText)}</span>
        </div>
        <div class="mdv-pane-bar-right">
          <button type="button" class="mdv-pane-btn${syncScroll ? ' is-active' : ''}" data-pane-sync title="Sincronizar scroll Markdown (Espacio y)">Sync</button>
          <button type="button" class="mdv-pane-btn" data-pane-action="md-right" data-target-pane="${id}" title="Split MD a la derecha (Ctrl+Alt+R)">+|</button>
          <button type="button" class="mdv-pane-btn" data-pane-action="md-down" data-target-pane="${id}" title="Split MD abajo (Ctrl+Alt+D)">+—</button>
          <button type="button" class="mdv-pane-btn" data-pane-close="${id}" data-close-kind="markdown" title="Cerrar este panel MD (q)">✕</button>
        </div>
      </div>`;
  }

  function escapeHtmlAttr(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function createMarkdownPane({ filePath = '', relPath = '', html = '', toc = [] } = {}) {
    const id = `md-${nextNodeSeq++}`;
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
      if (focusZone !== 'markdown' || focusedMdPaneId !== id) {
        setFocusZone('markdown', id, false);
      }
    });

    scroller.addEventListener('scroll', () => onMarkdownPaneScroll(pane), { passive: true });
    mdPanes.set(id, pane);
    return pane;
  }

  function resolvePreferredCwd() {
    return initCfg.workspaceDir || '';
  }

  const utf8Encoder = new TextEncoder();
  let isDraggingSplit = false;

  // =========================================================================
  // GPU-ACCELERATED HTML5 2D CANVAS RENDERER + GLYPH SPRITE ATLAS FOR XTERM 5
  // Replaces xterm 5's slow DomRenderer (<span> per cell + offsetWidth reflows)
  // =========================================================================
  function attachFastCanvasRenderer(term) {
    const core = term?._core;
    if (!core || !core._renderService || !core.screenElement) return null;

    const bufferService = core._bufferService || core.bufferService;
    const charSizeService = core._charSizeService || core.charSizeService;
    const optionsService = core.optionsService || core._optionsService;
    const coreService = core.coreService || core._coreService;
    const browserService = core._coreBrowserService || core.coreBrowserService;
    const themeService = core._themeService || core.themeService;
    if (!bufferService || !charSizeService || !optionsService || !themeService) return null;

    const screenEl = core.screenElement;
    const canvas = document.createElement('canvas');
    canvas.className = 'mdv-fast-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: false });
    if (!ctx) return null;

    // Opaque 2048x2048 Glyph Sprite Atlas (preserves subpixel DirectWrite/Skia AA & blits via GPU BitBlt)
    const ATLAS_SIZE = 2048;
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = ATLAS_SIZE;
    atlasCanvas.height = ATLAS_SIZE;
    const atlasCtx = atlasCanvas.getContext('2d', { alpha: false });
    let glyphMap = new Map();
    let atlasX = 0;
    let atlasY = 0;
    let atlasRowH = 0;

    const CellDataCtor = bufferService.buffer?._nullCell?.constructor;
    const workCell = CellDataCtor ? new CellDataCtor() : null;
    if (!workCell || !atlasCtx) return null;

    const redrawListeners = new Set();
    const fireRedraw = (start, end) => {
      const rows = bufferService.rows;
      if (rows <= 0) return;
      const s = Math.max(0, Math.min(rows - 1, start));
      const e = Math.max(s, Math.min(rows - 1, end));
      for (const fn of redrawListeners) {
        try { fn({ start: s, end: e }); } catch {}
      }
    };

    const dimensions = {
      device: {
        char: { width: 9, height: 18, left: 0, top: 0 },
        cell: { width: 9, height: 18 },
        canvas: { width: 800, height: 450 }
      },
      css: {
        canvas: { width: 800, height: 450 },
        cell: { width: 9, height: 18 }
      }
    };

    let fontNormal = '';
    let fontBold = '';
    let fontItalic = '';
    let fontBoldItalic = '';
    let textBaselineOffset = 14;
    let selStart = null;
    let selEnd = null;
    let selColMode = false;
    let hoverLinkRange = null;
    let lastCursorVpRow = -1;
    let lastCursorCol = -1;
    let blinkTimer = null;
    let blinkVisible = true;
    let isDisposed = false;

    const clearAtlas = () => {
      glyphMap.clear();
      atlasX = 0;
      atlasY = 0;
      atlasRowH = 0;
    };

    const rebuildFontsAndMetrics = () => {
      const dpr = browserService?.dpr || window.devicePixelRatio || 1;
      const opts = optionsService.rawOptions;
      const fontPx = Math.max(6, Math.round((opts.fontSize || 15) * dpr));
      const fam = opts.fontFamily || 'monospace';
      const wNorm = opts.fontWeight || 'normal';
      const wBold = opts.fontWeightBold || 'bold';

      fontNormal = `${wNorm} ${fontPx}px ${fam}`;
      fontBold = `${wBold} ${fontPx}px ${fam}`;
      fontItalic = `italic ${wNorm} ${fontPx}px ${fam}`;
      fontBoldItalic = `italic ${wBold} ${fontPx}px ${fam}`;

      atlasCtx.font = fontNormal;
      atlasCtx.textBaseline = 'alphabetic';
      const m = atlasCtx.measureText('M');
      const cellH = dimensions.device.cell.height;
      if (
        typeof m.fontBoundingBoxAscent === 'number' &&
        typeof m.fontBoundingBoxDescent === 'number' &&
        m.fontBoundingBoxAscent > 0
      ) {
        const total = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
        textBaselineOffset = Math.round((cellH - total) / 2 + m.fontBoundingBoxAscent);
      } else {
        const asc = m.actualBoundingBoxAscent || fontPx * 0.78;
        const desc = m.actualBoundingBoxDescent || fontPx * 0.22;
        textBaselineOffset = Math.round((cellH - (asc + desc)) / 2 + asc);
      }
      clearAtlas();
    };

    const updateDimensions = () => {
      const dpr = browserService?.dpr || window.devicePixelRatio || 1;
      const opts = optionsService.rawOptions;
      const cols = Math.max(1, bufferService.cols || 80);
      const rows = Math.max(1, bufferService.rows || 24);
      const rawCharW = charSizeService.width || 8.5;
      const rawCharH = charSizeService.height || (opts.fontSize || 15) * 1.15;

      const devCharW = Math.max(1, Math.round(rawCharW * dpr));
      const devCharH = Math.max(1, Math.ceil(rawCharH * dpr));
      const letterSp = Math.round((opts.letterSpacing || 0) * dpr);
      const devCellW = Math.max(1, devCharW + letterSp);
      const devCellH = Math.max(1, Math.floor(devCharH * (opts.lineHeight || 1)));

      dimensions.device.char.width = devCharW;
      dimensions.device.char.height = devCharH;
      dimensions.device.char.left = Math.floor(letterSp / 2);
      dimensions.device.char.top = Math.round((devCellH - devCharH) / 2);
      dimensions.device.cell.width = devCellW;
      dimensions.device.cell.height = devCellH;
      dimensions.device.canvas.width = devCellW * cols;
      dimensions.device.canvas.height = devCellH * rows;

      dimensions.css.canvas.width = Math.round(dimensions.device.canvas.width / dpr);
      dimensions.css.canvas.height = Math.round(dimensions.device.canvas.height / dpr);
      dimensions.css.cell.width = dimensions.css.canvas.width / cols;
      dimensions.css.cell.height = dimensions.css.canvas.height / rows;

      if (canvas.width !== dimensions.device.canvas.width || canvas.height !== dimensions.device.canvas.height) {
        canvas.width = dimensions.device.canvas.width;
        canvas.height = dimensions.device.canvas.height;
      }
      canvas.style.width = `${dimensions.css.canvas.width}px`;
      canvas.style.height = `${dimensions.css.canvas.height}px`;
      screenEl.style.width = `${dimensions.css.canvas.width}px`;
      screenEl.style.height = `${dimensions.css.canvas.height}px`;

      rebuildFontsAndMetrics();
    };

    const rgbHexCache = new Map();
    const rgbIntToCss = (rgb) => {
      let css = rgbHexCache.get(rgb);
      if (css === undefined) {
        if (rgbHexCache.size > 2048) rgbHexCache.clear();
        css = `#${(rgb >>> 0).toString(16).padStart(6, '0')}`;
        rgbHexCache.set(rgb, css);
      }
      return css;
    };

    // Crisp pixel-exact custom box drawing & block elements (seamless borders at any lineHeight)
    const drawCustomBoxOrBlock = (gCtx, ch, ox, oy, w, h, fgCss) => {
      const code = ch.charCodeAt(0);
      if (code < 0x2500 || code > 0x259f) return false;
      gCtx.fillStyle = fgCss;
      const lw = Math.max(1, Math.round(w / 8));
      const hw = Math.max(2, Math.round(w / 4.5));
      const cx = ox + Math.floor(w / 2);
      const cy = oy + Math.floor(h / 2);
      const lx = cx - Math.floor(lw / 2);
      const ly = cy - Math.floor(lw / 2);

      // Block elements U+2580..U+259F
      if (code === 0x2588) { gCtx.fillRect(ox, oy, w, h); return true; } // █
      if (code === 0x2580) { gCtx.fillRect(ox, oy, w, Math.ceil(h / 2)); return true; } // ▀
      if (code === 0x2584) { const hh = Math.floor(h / 2); gCtx.fillRect(ox, oy + hh, w, h - hh); return true; } // ▄
      if (code === 0x258c) { gCtx.fillRect(ox, oy, Math.ceil(w / 2), h); return true; } // ▌
      if (code === 0x2590) { const hw2 = Math.floor(w / 2); gCtx.fillRect(ox + hw2, oy, w - hw2, h); return true; } // ▐
      if (code >= 0x2581 && code <= 0x2587) {
        const frac = (code - 0x2580) / 8;
        const bh = Math.max(1, Math.round(h * frac));
        gCtx.fillRect(ox, oy + h - bh, w, bh);
        return true;
      }
      if (code === 0x2591 || code === 0x2592 || code === 0x2593) {
        gCtx.save();
        gCtx.globalAlpha = code === 0x2591 ? 0.25 : code === 0x2592 ? 0.5 : 0.75;
        gCtx.fillRect(ox, oy, w, h);
        gCtx.restore();
        return true;
      }

      // Common light/heavy/rounded box-drawing lines used by Claude Code, Neovim, tmux, lazygit
      switch (code) {
        case 0x2500: gCtx.fillRect(ox, ly, w, lw); return true; // ─
        case 0x2501: gCtx.fillRect(ox, cy - Math.floor(hw / 2), w, hw); return true; // ━
        case 0x2502: gCtx.fillRect(lx, oy, lw, h); return true; // │
        case 0x2503: gCtx.fillRect(cx - Math.floor(hw / 2), oy, hw, h); return true; // ┃
        case 0x250c: case 0x256d: // ┌ ╭
          gCtx.fillRect(lx, ly, w - (lx - ox), lw);
          gCtx.fillRect(lx, ly, lw, h - (ly - oy));
          return true;
        case 0x2510: case 0x256e: // ┐ ╮
          gCtx.fillRect(ox, ly, lx - ox + lw, lw);
          gCtx.fillRect(lx, ly, lw, h - (ly - oy));
          return true;
        case 0x2514: case 0x2570: // └ ╰
          gCtx.fillRect(lx, ly, w - (lx - ox), lw);
          gCtx.fillRect(lx, oy, lw, ly - oy + lw);
          return true;
        case 0x2518: case 0x256f: // ┘ ╯
          gCtx.fillRect(ox, ly, lx - ox + lw, lw);
          gCtx.fillRect(lx, oy, lw, ly - oy + lw);
          return true;
        case 0x251c: // ├
          gCtx.fillRect(lx, oy, lw, h);
          gCtx.fillRect(lx, ly, w - (lx - ox), lw);
          return true;
        case 0x2524: // ┤
          gCtx.fillRect(lx, oy, lw, h);
          gCtx.fillRect(ox, ly, lx - ox + lw, lw);
          return true;
        case 0x252c: // ┬
          gCtx.fillRect(ox, ly, w, lw);
          gCtx.fillRect(lx, ly, lw, h - (ly - oy));
          return true;
        case 0x2534: // ┴
          gCtx.fillRect(ox, ly, w, lw);
          gCtx.fillRect(lx, oy, lw, ly - oy + lw);
          return true;
        case 0x253c: // ┼
          gCtx.fillRect(ox, ly, w, lw);
          gCtx.fillRect(lx, oy, lw, h);
          return true;
        default:
          return false;
      }
    };

    const getOrRasterizeGlyph = (chars, fgCss, bgCss, flags, spanCells) => {
      const key = `${chars}\x01${fgCss}\x01${bgCss}\x01${flags}\x01${spanCells}`;
      let entry = glyphMap.get(key);
      if (entry !== undefined) return entry;

      const cellW = dimensions.device.cell.width;
      const cellH = dimensions.device.cell.height;
      const tileW = cellW * spanCells;
      const tileH = cellH;

      if (tileW > ATLAS_SIZE || tileH > ATLAS_SIZE) return null;
      if (atlasX + tileW > ATLAS_SIZE) {
        atlasX = 0;
        atlasY += atlasRowH + 1;
        atlasRowH = 0;
      }
      if (atlasY + tileH > ATLAS_SIZE) {
        clearAtlas();
      }

      const sx = atlasX;
      const sy = atlasY;
      atlasX += tileW + 1;
      if (tileH > atlasRowH) atlasRowH = tileH;

      atlasCtx.fillStyle = bgCss;
      atlasCtx.fillRect(sx, sy, tileW, tileH);

      const isBold = (flags & 1) !== 0;
      const isItalic = (flags & 2) !== 0;
      const isDim = (flags & 4) !== 0;

      atlasCtx.save();
      atlasCtx.beginPath();
      atlasCtx.rect(sx, sy, tileW, tileH);
      atlasCtx.clip();

      if (isDim) atlasCtx.globalAlpha = 0.52;

      const drewCustom =
        chars.length === 1 && spanCells === 1 && drawCustomBoxOrBlock(atlasCtx, chars, sx, sy, tileW, tileH, fgCss);

      if (!drewCustom) {
        atlasCtx.font = isBold
          ? isItalic ? fontBoldItalic : fontBold
          : isItalic ? fontItalic : fontNormal;
        atlasCtx.fillStyle = fgCss;
        atlasCtx.textBaseline = 'alphabetic';

        const drawX = sx + dimensions.device.char.left;
        const drawY = sy + textBaselineOffset;
        const cp = chars.codePointAt(0) || 0;
        if (cp > 0x25ff && spanCells === 1) {
          const mw = atlasCtx.measureText(chars).width;
          if (mw > tileW * 1.06) {
            const scale = tileW / mw;
            atlasCtx.translate(drawX, drawY);
            atlasCtx.scale(scale, 1);
            atlasCtx.fillText(chars, 0, 0);
            atlasCtx.restore();
            entry = { sx, sy, sw: tileW, sh: tileH };
            glyphMap.set(key, entry);
            return entry;
          }
        }
        atlasCtx.fillText(chars, drawX, drawY);
      }

      atlasCtx.restore();
      entry = { sx, sy, sw: tileW, sh: tileH };
      glyphMap.set(key, entry);
      return entry;
    };

    const isCellSelected = (col, bufRow) => {
      if (!selStart || !selEnd) return false;
      let [c0, r0] = selStart;
      let [c1, r1] = selEnd;
      if (r0 > r1 || (r0 === r1 && c0 > c1)) {
        const tc = c0; c0 = c1; c1 = tc;
        const tr = r0; r0 = r1; r1 = tr;
      }
      if (r0 === r1 && c0 === c1) return false;
      if (selColMode) {
        const minC = Math.min(c0, c1);
        const maxC = Math.max(c0, c1);
        return bufRow >= r0 && bufRow <= r1 && col >= minC && col < maxC;
      }
      if (bufRow < r0 || bufRow > r1) return false;
      if (r0 === r1) return col >= c0 && col < c1;
      if (bufRow === r0) return col >= c0;
      if (bufRow === r1) return col < c1;
      return true;
    };

    const syncBlinkTimer = () => {
      clearInterval(blinkTimer);
      blinkTimer = null;
      blinkVisible = true;
      const opts = optionsService.rawOptions;
      const shouldBlink = Boolean(
        browserService?.isFocused &&
        (coreService?.decPrivateModes?.cursorBlink ?? opts.cursorBlink) &&
        !coreService?.isCursorHidden
      );
      if (shouldBlink) {
        blinkTimer = setInterval(() => {
          if (isDisposed) return;
          blinkVisible = !blinkVisible;
          const buf = bufferService.buffer;
          const vpRow = buf.ybase + buf.y - buf.ydisp;
          if (vpRow >= 0 && vpRow < bufferService.rows) {
            fireRedraw(vpRow, vpRow);
          }
        }, 530);
      }
    };

    const renderRows = (startRow, endRow) => {
      if (isDisposed) return;
      const buf = bufferService.buffer;
      const cols = bufferService.cols;
      const rows = bufferService.rows;
      const cellW = dimensions.device.cell.width;
      const cellH = dimensions.device.cell.height;
      const colors = themeService.colors;
      const opts = optionsService.rawOptions;
      const defaultBg = colors.background.css;
      const defaultFg = colors.foreground.css;
      const selBg = (browserService?.isFocused
        ? colors.selectionBackgroundOpaque
        : colors.selectionInactiveBackgroundOpaque)?.css || 'rgba(122, 162, 247, 0.32)';
      const selFg = colors.selectionForeground?.css || null;
      const boldBright = opts.drawBoldTextInBrightColors !== false;

      const cursorBufRow = buf.ybase + buf.y;
      const cursorCol = Math.min(buf.x, cols - 1);
      const cursorShown = Boolean(!coreService?.isCursorHidden && coreService?.isCursorInitialized);
      const isFocused = Boolean(browserService?.isFocused);
      const curStyle = coreService?.decPrivateModes?.cursorStyle ?? opts.cursorStyle ?? 'block';
      const curInactive = opts.cursorInactiveStyle ?? 'outline';

      const sRow = Math.max(0, startRow);
      const eRow = Math.min(rows - 1, endRow);

      for (let vpRow = sRow; vpRow <= eRow; vpRow++) {
        const bufRow = vpRow + buf.ydisp;
        const yPx = vpRow * cellH;
        const line = buf.lines.get(bufRow);

        // Base clear with theme background (1 single GPU fillRect for the entire row)
        ctx.fillStyle = defaultBg;
        ctx.fillRect(0, yPx, cols * cellW, cellH);
        if (!line) continue;

        for (let col = 0; col < cols; col++) {
          line.loadCell(col, workCell);
          const wCells = workCell.getWidth();
          if (wCells === 0) continue;

          const selected = isCellSelected(col, bufRow);
          const isCursorCell = cursorShown && bufRow === cursorBufRow && col === cursorCol;
          const isBlockCursorActive =
            isCursorCell &&
            ((isFocused && curStyle === 'block' && blinkVisible) || (!isFocused && curInactive === 'block'));

          let fgMode = workCell.getFgColorMode();
          let fgVal = workCell.getFgColor();
          let bgMode = workCell.getBgColorMode();
          let bgVal = workCell.getBgColor();
          const inv = Boolean(workCell.isInverse());
          if (inv) {
            const tm = fgMode; fgMode = bgMode; bgMode = tm;
            const tv = fgVal; fgVal = bgVal; bgVal = tv;
          }

          let cellBg = defaultBg;
          if (bgMode === 16777216 || bgMode === 33554432) {
            cellBg = colors.ansi[bgVal]?.css || defaultBg;
          } else if (bgMode === 50331648) {
            cellBg = rgbIntToCss(bgVal);
          } else if (inv) {
            cellBg = defaultFg;
          }

          const isBold = Boolean(workCell.isBold());
          let cellFg = defaultFg;
          if (fgMode === 16777216 || fgMode === 33554432) {
            let idx = fgVal;
            if (isBold && boldBright && idx < 8) idx += 8;
            cellFg = colors.ansi[idx]?.css || defaultFg;
          } else if (fgMode === 50331648) {
            cellFg = rgbIntToCss(fgVal);
          } else if (inv) {
            cellFg = defaultBg;
          }

          if (selected) {
            cellBg = selBg;
            if (selFg) cellFg = selFg;
          }
          if (isBlockCursorActive) {
            cellBg = colors.cursor?.css || '#7aa2f7';
            cellFg = colors.cursorAccent?.css || defaultBg;
          }

          const xPx = col * cellW;
          const spanW = wCells * cellW;
          const chars = workCell.isInvisible() ? '' : workCell.getChars();

          if (!chars || chars === ' ') {
            if (cellBg !== defaultBg) {
              ctx.fillStyle = cellBg;
              ctx.fillRect(xPx, yPx, spanW, cellH);
            }
          } else {
            let flags = 0;
            if (isBold) flags |= 1;
            if (workCell.isItalic()) flags |= 2;
            if (workCell.isDim()) flags |= 4;

            let span = wCells;
            // Allow single-cell Nerd Font / PUA glyphs followed by an empty space with identical bg to use 1 cell cleanly
            const tile = getOrRasterizeGlyph(chars, cellFg, cellBg, flags, span);
            if (tile) {
              ctx.drawImage(atlasCanvas, tile.sx, tile.sy, tile.sw, tile.sh, xPx, yPx, tile.sw, tile.sh);
            }
          }

          // Text decorations (underline / strikethrough / overline / link hover)
          const hasLinkHover =
            hoverLinkRange &&
            vpRow >= hoverLinkRange.y1 &&
            vpRow <= hoverLinkRange.y2 &&
            (vpRow > hoverLinkRange.y1 || col >= hoverLinkRange.x1) &&
            (vpRow < hoverLinkRange.y2 || col < hoverLinkRange.x2);

          if (workCell.isUnderline() || hasLinkHover) {
            let ulCss = cellFg;
            if (workCell.isUnderline() && !workCell.isUnderlineColorDefault()) {
              if (workCell.isUnderlineColorRGB()) {
                ulCss = rgbIntToCss(workCell.getUnderlineColor());
              } else {
                ulCss = colors.ansi[workCell.getUnderlineColor()]?.css || cellFg;
              }
            }
            const ulH = Math.max(1, Math.round(cellH / 16));
            ctx.fillStyle = ulCss;
            ctx.fillRect(xPx, yPx + cellH - ulH - 1, spanW, ulH);
          }
          if (workCell.isStrikethrough()) {
            const stH = Math.max(1, Math.round(cellH / 16));
            ctx.fillStyle = cellFg;
            ctx.fillRect(xPx, yPx + Math.floor(cellH / 2), spanW, stH);
          }
          if (workCell.isOverline()) {
            const ovH = Math.max(1, Math.round(cellH / 16));
            ctx.fillStyle = cellFg;
            ctx.fillRect(xPx, yPx, spanW, ovH);
          }

          // Non-block cursors (bar, underline, unfocused outline)
          if (isCursorCell && !isBlockCursorActive) {
            const curCss = colors.cursor?.css || '#7aa2f7';
            const dpr = browserService?.dpr || window.devicePixelRatio || 1;
            if (isFocused && blinkVisible) {
              ctx.fillStyle = curCss;
              if (curStyle === 'bar') {
                const bw = Math.max(2, Math.round((opts.cursorWidth || 2) * dpr));
                ctx.fillRect(xPx, yPx, bw, cellH);
              } else if (curStyle === 'underline') {
                const uh = Math.max(2, Math.round(2 * dpr));
                ctx.fillRect(xPx, yPx + cellH - uh, spanW, uh);
              }
            } else if (!isFocused && curInactive && curInactive !== 'none') {
              const lw = Math.max(1, Math.round(dpr));
              ctx.strokeStyle = curCss;
              ctx.lineWidth = lw;
              if (curInactive === 'outline') {
                ctx.strokeRect(xPx + lw / 2, yPx + lw / 2, spanW - lw, cellH - lw);
              } else if (curInactive === 'bar') {
                ctx.fillStyle = curCss;
                ctx.fillRect(xPx, yPx, lw * 2, cellH);
              } else if (curInactive === 'underline') {
                ctx.fillStyle = curCss;
                ctx.fillRect(xPx, yPx + cellH - lw * 2, spanW, lw * 2);
              }
            }
          }
        }
      }

      lastCursorVpRow = cursorBufRow - buf.ydisp;
      lastCursorCol = cursorCol;
    };

    const disposables = [];
    const sub = (ev, fn) => {
      if (typeof ev === 'function') {
        const d = ev(fn);
        if (d?.dispose) disposables.push(d);
      }
    };

    if (core._linkifier?.value) {
      sub(core._linkifier.value.onShowLinkUnderline, (e) => {
        hoverLinkRange = e;
        fireRedraw(e.y1, e.y2);
      });
      sub(core._linkifier.value.onHideLinkUnderline, (e) => {
        hoverLinkRange = null;
        fireRedraw(e.y1, e.y2);
      });
    }
    sub(themeService.onChangeColors, () => {
      clearAtlas();
      fireRedraw(0, bufferService.rows - 1);
    });
    sub(optionsService.onOptionChange, () => {
      updateDimensions();
      syncBlinkTimer();
      fireRedraw(0, bufferService.rows - 1);
    });

    updateDimensions();
    screenEl.appendChild(canvas);

    const renderer = {
      dimensions,
      onRequestRedraw(listener) {
        redrawListeners.add(listener);
        return { dispose() { redrawListeners.delete(listener); } };
      },
      handleDevicePixelRatioChange() {
        updateDimensions();
      },
      handleResize() {
        updateDimensions();
      },
      handleCharSizeChanged() {
        updateDimensions();
      },
      handleBlur() {
        syncBlinkTimer();
        if (lastCursorVpRow >= 0) fireRedraw(lastCursorVpRow, lastCursorVpRow);
      },
      handleFocus() {
        syncBlinkTimer();
        const vpRow = bufferService.buffer.ybase + bufferService.buffer.y - bufferService.buffer.ydisp;
        if (vpRow >= 0) fireRedraw(vpRow, vpRow);
      },
      handleSelectionChanged(start, end, columnSelectMode) {
        selStart = start || null;
        selEnd = end || null;
        selColMode = Boolean(columnSelectMode);
        fireRedraw(0, bufferService.rows - 1);
      },
      handleCursorMove() {
        if (blinkTimer) {
          blinkVisible = true;
        }
        const buf = bufferService.buffer;
        const curVp = buf.ybase + buf.y - buf.ydisp;
        if (lastCursorVpRow !== curVp || lastCursorCol !== buf.x) {
          if (lastCursorVpRow >= 0 && lastCursorVpRow < bufferService.rows) {
            fireRedraw(lastCursorVpRow, lastCursorVpRow);
          }
          if (curVp >= 0 && curVp < bufferService.rows) {
            fireRedraw(curVp, curVp);
          }
        }
      },
      clearTextureAtlas() {
        clearAtlas();
      },
      clear() {
        ctx.fillStyle = themeService.colors.background.css;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      },
      renderRows,
      dispose() {
        isDisposed = true;
        clearInterval(blinkTimer);
        redrawListeners.clear();
        for (const d of disposables) {
          try { d.dispose(); } catch {}
        }
        clearAtlas();
        canvas.remove();
      }
    };

    core._renderService.setRenderer(renderer);
    syncBlinkTimer();
    return renderer;
  }

  function createTerminalPane({
    id: requestedId = '',
    cwd = '',
    explicitCwd = false,
    taskMeta = null,
    worktreeMeta = null
  } = {}) {
    let id = requestedId ? String(requestedId).trim() : '';
    if (id) {
      const m = /^term-(\d+)$/.exec(id);
      if (m) {
        const num = Number(m[1]);
        if (Number.isFinite(num) && num >= nextNodeSeq) {
          nextNodeSeq = num + 1;
        }
      }
    } else {
      id = `term-${nextNodeSeq++}`;
    }
    const targetCwd = explicitCwd && cwd ? cwd : initCfg.workspaceDir || cwd || '';
    const shortDir = targetCwd.split(/[/\\]/).filter(Boolean).pop() || 'wsl';
    const headerTitle = worktreeMeta
      ? `worktree (${worktreeMeta.repo || shortDir})`
      : taskMeta
        ? taskMeta.name
        : `WSL (${shortDir})`;
    const section = document.createElement('section');
    section.className = 'mdv-pane';
    section.setAttribute('data-pane-id', id);
    section.setAttribute('data-pane-kind', 'terminal');
    if (taskMeta?.id || worktreeMeta?.taskId) {
      section.setAttribute('data-task-id', taskMeta?.id || worktreeMeta?.taskId);
    }
    section.innerHTML = `
      ${buildPaneHeaderHtml(id, 'terminal', headerTitle, taskMeta, worktreeMeta)}
      <div class="mdv-terminal-wrap">
        <div class="mdv-terminal-mount"></div>
      </div>`;

    const wrapEl = section.querySelector('.mdv-terminal-wrap');
    const mountEl = section.querySelector('.mdv-terminal-mount');
    const titleEl = section.querySelector('[data-pane-title]');
    const wtSlotEl = section.querySelector('[data-pane-wt-slot]');

    const termPx = Math.max(11, Math.min(24, Math.round((15 * zoomPercent) / 100)));
    const term = window.Terminal
      ? new window.Terminal({
          cursorBlink: false,
          fastScrollModifier: 'shift',
          fastScrollSensitivity: 5,
          fontSize: termPx,
          fontFamily:
            '"MDV IosevkaTerm Nerd", "IosevkaTerm Nerd Font", "IosevkaTerm NF", "IosevkaTerm Nerd Font Mono", "IosevkaTerm NFM", "Iosevka Term", "Iosevka Nerd Font", "Iosevka NF", "Iosevka", "Cascadia Code", monospace',
          lineHeight: 1.16,
          scrollback: 3000,
          overviewRulerWidth: 0,
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
    let resizeRaf = 0;
    let lastSentCols = 0;
    let lastSentRows = 0;
    let disposed = false;
    let shellReady = false;
    let readyTimer = null;
    const pendingCommands = [];

    // Per-pane RAF output coalescer: small interactive echoes write immediately,
    // heavy TUI/log bursts coalesce to 1 merged Uint8Array per animation frame!
    let writeQueue = [];
    let writeQueueBytes = 0;
    let writeRaf = 0;

    const clearPendingWriteQueue = () => {
      writeQueue = [];
      writeQueueBytes = 0;
      if (writeRaf) {
        cancelAnimationFrame(writeRaf);
        writeRaf = 0;
      }
    };

    const flushWriteQueue = () => {
      writeRaf = 0;
      if (disposed || !term || writeQueue.length === 0) {
        writeQueue = [];
        writeQueueBytes = 0;
        return;
      }
      // Cap per-frame write at 131 KiB so a massive `cat` dump never blocks keystrokes
      const MAX_FRAME_BYTES = 131072;
      if (writeQueue.length === 1 && writeQueue[0].byteLength <= MAX_FRAME_BYTES) {
        const single = writeQueue[0];
        writeQueue = [];
        writeQueueBytes = 0;
        term.write(single);
        return;
      }
      let takeCount = 0;
      let takeBytes = 0;
      while (takeCount < writeQueue.length && (takeBytes + writeQueue[takeCount].byteLength <= MAX_FRAME_BYTES || takeCount === 0)) {
        takeBytes += writeQueue[takeCount].byteLength;
        takeCount++;
      }
      const chunks = writeQueue.splice(0, takeCount);
      writeQueueBytes -= takeBytes;
      if (chunks.length === 1) {
        term.write(chunks[0]);
      } else {
        const merged = new Uint8Array(takeBytes);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }
        term.write(merged);
      }
      if (writeQueue.length > 0) {
        writeRaf = requestAnimationFrame(flushWriteQueue);
      }
    };

    const enqueuePtyOutput = (arrayBuf) => {
      if (disposed || pane.isHidden || !term) return;
      const u8 = new Uint8Array(arrayBuf);
      if (u8.byteLength === 0) return;
      // Instant fast-path for interactive keystroke echo (< 512 bytes when queue is idle)
      if (!writeRaf && writeQueue.length === 0 && u8.byteLength <= 512) {
        term.write(u8);
        return;
      }
      writeQueue.push(u8);
      writeQueueBytes += u8.byteLength;
      if (!writeRaf) {
        writeRaf = requestAnimationFrame(flushWriteQueue);
      }
    };

    const sendRawInput = (str) => {
      if (ws && ws.readyState === WebSocket.OPEN && str) {
        ws.send(utf8Encoder.encode(str));
      }
    };

    const flushPendingCommands = () => {
      if (disposed || !ws || ws.readyState !== WebSocket.OPEN || !pendingCommands.length) return;
      pane.fitTerminal();
      const batch = pendingCommands.splice(0, pendingCommands.length);
      for (const cmdLine of batch) {
        sendRawInput(`${cmdLine}\r`);
      }
    };

    const pane = {
      type: 'pane',
      id,
      kind: 'terminal',
      cwd: targetCwd,
      explicitCwd: Boolean(explicitCwd && cwd),
      taskMeta: taskMeta || null,
      worktreeMeta: worktreeMeta || null,
      worktrees: [],
      wtSlotEl,
      claudeState: 'none',
      isHidden: false,
      el: section,
      section,
      mountEl,
      titleEl,
      term,
      fitAddon,
      setOutputPaused(paused) {
        if (paused) {
          clearPendingWriteQueue();
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pause', paused: Boolean(paused) }));
        }
      },
      runShellCommand(cmdLine) {
        if (!cmdLine) return;
        if (shellReady && ws && ws.readyState === WebSocket.OPEN) {
          pane.fitTerminal();
          sendRawInput(`${cmdLine}\r`);
        } else {
          pendingCommands.push(cmdLine);
        }
      },
      fitTerminal(forceSend = false) {
        if (disposed || pane.isHidden || !term || !fitAddon || !mountEl.isConnected) return;
        if (mountEl.clientWidth < 20 || mountEl.clientHeight < 20) return;
        try {
          fitAddon.fit();
          if (ws && ws.readyState === WebSocket.OPEN) {
            if (forceSend || term.cols !== lastSentCols || term.rows !== lastSentRows) {
              lastSentCols = term.cols;
              lastSentRows = term.rows;
              ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
            }
          }
        } catch {}
      },
      boot() {
        if (!term || term.element) return;

        // Pre-install our GPU 2D Canvas renderer during _onWillOpen so xterm's slow DomRenderer is NEVER created!
        if (term._core?._onWillOpen?.event) {
          const once = term._core._onWillOpen.event(() => {
            try { once?.dispose?.(); } catch {}
            try { attachFastCanvasRenderer(term); } catch {}
          });
        }

        term.open(mountEl);
        if (!mountEl.querySelector('.mdv-fast-canvas')) {
          try { attachFastCanvasRenderer(term); } catch {}
        }

        // Pass app-level spatial & split shortcuts cleanly out of xterm
        term.attachCustomKeyEventHandler((ev) => {
          if (!ev.altKey && !ev.ctrlKey && !ev.metaKey) {
            return true;
          }
          const isAltGraph = Boolean(ev.getModifierState && ev.getModifierState('AltGraph'));
          const isCtrlAlt = (ev.ctrlKey && ev.altKey && !ev.metaKey) || (isAltGraph && !ev.metaKey);
          if (isCtrlAlt && ['KeyR', 'KeyD', 'KeyT', 'KeyB', 'KeyW'].includes(ev.code)) {
            return false;
          }
          if (ev.altKey && ev.shiftKey && !ev.ctrlKey && ['KeyR', 'KeyD', 'KeyW', 'ArrowLeft', 'ArrowRight'].includes(ev.code)) {
            return false;
          }
          if (
            ev.altKey &&
            !ev.ctrlKey &&
            !ev.shiftKey &&
            !ev.metaKey &&
            !isAltGraph &&
            ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'Digit1', 'Digit2', 'KeyB'].includes(ev.code)
          ) {
            return false;
          }
          if (ev.ctrlKey && ev.shiftKey && !ev.altKey && !ev.metaKey) {
            if (ev.code === 'KeyW' || ev.key?.toLowerCase() === 'w') {
              return false;
            }
            if (ev.code === 'KeyC' && term.hasSelection()) {
              navigator.clipboard.writeText(term.getSelection()).catch(() => {});
              return false;
            }
          }
          return true;
        });

        const connectShell = () => {
          if (disposed) return;
          if (!pane.isHidden) {
            pane.fitTerminal();
          }
          const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
          const qp = new URLSearchParams({
            session_id: id,
            cwd: targetCwd,
            cols: String(term.cols),
            rows: String(term.rows)
          });
          if (pane.isHidden) qp.set('paused', '1');
          if (taskMeta?.id) qp.set('task_id', taskMeta.id);
          if (taskMeta?.code) qp.set('task_code', taskMeta.code);
          if (taskMeta?.name) qp.set('task_name', taskMeta.name);
          if (taskMeta?.url) qp.set('task_url', taskMeta.url);

          const wsUrl = `${proto}//${location.host}/ws/pty?${qp.toString()}`;
          shellReady = false;
          lastSentCols = 0;
          lastSentRows = 0;
          clearTimeout(readyTimer);
          ws = new WebSocket(wsUrl);
          ws.binaryType = 'arraybuffer';

          ws.onopen = () => {
            readyTimer = setTimeout(() => {
              if (!shellReady) {
                shellReady = true;
                flushPendingCommands();
              }
            }, 900);
          };

          ws.onmessage = (ev) => {
            if (ev.data instanceof ArrayBuffer) {
              enqueuePtyOutput(ev.data);
              if (!shellReady) {
                clearTimeout(readyTimer);
                readyTimer = setTimeout(() => {
                  shellReady = true;
                  flushPendingCommands();
                }, 160);
              }
            } else if (typeof ev.data === 'string') {
              try {
                const msg = JSON.parse(ev.data);
                if (msg.type === 'ready') {
                  if (msg.claudeState) {
                    setPaneClaudeState(pane, msg.claudeState);
                  }
                  if (msg.reattached) {
                    clearTimeout(readyTimer);
                    shellReady = true;
                    if (!pane.isHidden) {
                      requestAnimationFrame(() => {
                        pane.fitTerminal(true);
                        flushPendingCommands();
                      });
                    }
                  }
                } else if (msg.type === 'sync_reset') {
                  clearPendingWriteQueue();
                  term.reset();
                } else if (msg.type === 'claude_state') {
                  setPaneClaudeState(pane, msg.state);
                } else if (msg.type === 'exit') {
                  if (taskMeta || termPanes.size > 1) {
                    closeTerminalPane(id);
                  } else {
                    fetch('/api/pty/kill', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ sessionId: id })
                    }).catch(() => {});
                    clearPendingWriteQueue();
                    term.reset();
                    connectShell();
                  }
                }
              } catch {}
            }
          };
        };

        connectShell();

        if (document.fonts?.load) {
          Promise.allSettled([
            document.fonts.load(`${termPx}px "MDV IosevkaTerm Nerd"`),
            document.fonts.load(`${termPx}px "IosevkaTerm Nerd Font"`),
            document.fonts.load(`${termPx}px "IosevkaTerm NF"`)
          ]).then(() => {
            if (disposed || pane.isHidden) return;
            try {
              term._core?._charSizeService?.measure?.();
              term.clearTextureAtlas?.();
              pane.fitTerminal();
            } catch {}
          });
        }

        // Send raw UTF-8 binary frames on every keystroke (0 JSON stringify/parse overhead!)
        term.onData((data) => {
          sendRawInput(data);
        });

        term.onTitleChange((newTitle) => {
          if (!taskMeta && !worktreeMeta && titleEl && newTitle && titleEl.textContent !== newTitle) {
            titleEl.textContent = newTitle;
          }
        });

        resizeObserver = new ResizeObserver(() => {
          if (isDraggingSplit || pane.isHidden) return;
          if (resizeRaf) cancelAnimationFrame(resizeRaf);
          resizeRaf = requestAnimationFrame(() => {
            resizeRaf = 0;
            pane.fitTerminal();
          });
        });
        resizeObserver.observe(wrapEl);
      },
      dispose() {
        disposed = true;
        clearTimeout(readyTimer);
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        clearPendingWriteQueue();
        try { resizeObserver?.disconnect(); } catch {}
        try { ws?.close(); } catch {}
        try { term?.dispose(); } catch {}
      }
    };

    section.addEventListener('pointerdown', () => {
      if (focusZone !== 'terminal' || focusedTermPaneId !== id) {
        setFocusZone('terminal', id, false);
      }
    });

    termPanes.set(id, pane);
    return pane;
  }

  // =========================================================================
  // GENERIC RECURSIVE TREE HELPERS FOR BOTH ZONES
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

  function bindBranchResizerEvents(branch) {
    const { el: branchEl, resizerEl } = branch;
    resizerEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      isDraggingSplit = true;
      resizerEl.setPointerCapture(e.pointerId);
      resizerEl.classList.add('is-dragging');
      let dragRaf = 0;
      const onMove = (ev) => {
        const cx = ev.clientX;
        const cy = ev.clientY;
        if (dragRaf) return;
        dragRaf = requestAnimationFrame(() => {
          dragRaf = 0;
          const rect = branchEl.getBoundingClientRect();
          branch.ratio =
            branch.direction === 'vertical'
              ? (cx - rect.left) / rect.width
              : (cy - rect.top) / rect.height;
          applyBranchSizes(branch);
        });
      };
      const onUp = () => {
        isDraggingSplit = false;
        if (dragRaf) cancelAnimationFrame(dragRaf);
        resizerEl.classList.remove('is-dragging');
        resizerEl.removeEventListener('pointermove', onMove);
        resizerEl.removeEventListener('pointerup', onUp);
        fitAllTerminals();
        if (termZoneEl?.contains(branchEl)) {
          scheduleSaveWorkspaceState();
        }
      };
      resizerEl.addEventListener('pointermove', onMove);
      resizerEl.addEventListener('pointerup', onUp);
    });
    resizerEl.addEventListener('dblclick', () => {
      branch.ratio = 0.5;
      applyBranchSizes(branch);
      fitAllTerminals();
      if (termZoneEl?.contains(branchEl)) {
        scheduleSaveWorkspaceState();
      }
      showToast('Split 50 / 50');
    });
  }

  function buildSplitBranch(firstNode, secondNode, direction, initialRatio = 0.5) {
    const dir = direction === 'horizontal' ? 'horizontal' : 'vertical';
    const branchEl = document.createElement('div');
    branchEl.className = 'mdv-split-branch';
    branchEl.setAttribute('data-direction', dir);

    const resizerEl = document.createElement('div');
    resizerEl.className = 'mdv-split-resizer';
    resizerEl.title = 'Arrastra para redimensionar · Doble clic 50/50';

    const branch = {
      type: 'split',
      id: `split-${nextNodeSeq++}`,
      direction: dir,
      ratio: typeof initialRatio === 'number' && Number.isFinite(initialRatio) ? initialRatio : 0.5,
      el: branchEl,
      resizerEl,
      first: firstNode,
      second: secondNode
    };

    branchEl.append(firstNode.el, resizerEl, secondNode.el);
    applyBranchSizes(branch);
    bindBranchResizerEvents(branch);
    return branch;
  }

  function createBranchAround(targetPane, newPane, direction) {
    const placeholder = document.createElement('span');
    targetPane.el.replaceWith(placeholder);
    const branch = buildSplitBranch(targetPane, newPane, direction, 0.5);
    placeholder.replaceWith(branch.el);
    return branch;
  }

  // Split inside Markdown Tab
  async function splitMarkdownPane(targetId, direction = 'vertical', filePath = null) {
    if (activeSideTab !== 'markdown') switchSideTab('markdown', { announce: false });
    if (document.body.classList.contains('hide-side-zone')) toggleSideZone(false);
    const targetPane = mdPanes.get(targetId) || activeMdPane();
    if (!targetPane) return null;
    const fileToOpen = filePath ?? targetPane.filePath ?? initCfg.currentFile ?? '';
    const newPane = createMarkdownPane({
      filePath: fileToOpen,
      relPath: fileToOpen ? fileToOpen.split('/').pop() : 'Markdown'
    });
    const branch = createBranchAround(targetPane, newPane, direction);
    mdRootTree = replaceTreeNode(mdRootTree, targetPane.id, branch);
    updateZoneCounts();

    await loadDocumentInPane(newPane.id, fileToOpen, { preserveScroll: false });
    if (!filePath) {
      newPane.scroller.scrollTop = targetPane.scroller.scrollTop;
    }
    setFocusZone('markdown', newPane.id, false);
    showToast(direction === 'vertical' ? 'MD Split Right' : 'MD Split Down');
    return newPane;
  }

  function detachPaneFromTermTree(pane) {
    if (!pane || pane.isHidden) return null;
    if (termRootTree === pane) {
      termRootTree = null;
      pane.el.remove();
      return null;
    }
    const parentBranch = findParentBranch(termRootTree, pane);
    if (!parentBranch) return null;
    const sibling = parentBranch.first === pane ? parentBranch.second : parentBranch.first;
    sibling.el.style.flex = parentBranch.el.style.flex || '1 1 100%';
    parentBranch.el.replaceWith(sibling.el);

    const grandParent = findParentBranch(termRootTree, parentBranch);
    if (!grandParent) {
      termRootTree = sibling;
      sibling.el.style.flex = '1 1 100%';
    } else {
      if (grandParent.first === parentBranch) grandParent.first = sibling;
      else grandParent.second = sibling;
      applyBranchSizes(grandParent);
    }
    return sibling;
  }

  function attachPaneToTermTree(pane, preferredDirection = null) {
    pane.el.style.flex = '1 1 100%';
    if (!termRootTree) {
      termRootTree = pane;
      termZoneEl.appendChild(pane.el);
      return;
    }
    const target = activeTermPane() || firstLeafPane(termRootTree);
    if (!target) {
      termRootTree = pane;
      termZoneEl.appendChild(pane.el);
      return;
    }
    const rect = target.el.getBoundingClientRect();
    const dir = preferredDirection || (rect.width >= 960 ? 'vertical' : 'horizontal');
    const branch = createBranchAround(target, pane, dir);
    termRootTree = replaceTreeNode(termRootTree, target.id, branch);
  }

  function hideTerminalPane(paneId) {
    const pane = termPanes.get(paneId);
    if (!pane || pane.isHidden) return;
    const sibling = detachPaneFromTermTree(pane);
    pane.isHidden = true;
    pane.setOutputPaused?.(true);
    if (pane.term) pane.term.options.cursorBlink = false;
    pane.section.classList.remove('is-focused', 'is-zone-focused');
    pane.term?.blur?.();
    termParkEl?.appendChild(pane.el);

    if (focusedTermPaneId === paneId) {
      const next = firstLeafPane(sibling) || firstLeafPane(termRootTree);
      focusedTermPaneId = next ? next.id : null;
      if (focusZone === 'terminal' && next) {
        setFocusZone('terminal', next.id, false);
      }
    }
    updateZoneCounts();
    requestAnimationFrame(() => fitAllTerminals());
    renderClickUpTasksList();
    scheduleSaveWorkspaceState();
    showToast(pane.taskMeta ? `Oculta en 2° plano: ${pane.taskMeta.code}` : 'Terminal oculta en 2° plano');
  }

  function showTerminalPane(paneId) {
    const pane = termPanes.get(paneId);
    if (!pane) return;
    const wasHidden = pane.isHidden;
    if (pane.isHidden) {
      pane.isHidden = false;
      attachPaneToTermTree(pane);
    }
    updateZoneCounts();
    setFocusZone('terminal', pane.id, false);
    requestAnimationFrame(() => {
      try {
        pane.term?._core?._charSizeService?.measure?.();
        pane.term?.clearTextureAtlas?.();
      } catch {}
      fitAllTerminals();
      if (wasHidden) {
        pane.setOutputPaused?.(false);
      }
    });
    renderClickUpTasksList();
    scheduleSaveWorkspaceState();
    showToast(pane.taskMeta ? `Terminal activa: ${pane.taskMeta.code}` : 'Terminal activa');
  }

  function extractCleanTaskCodeForPane(pane) {
    if (!pane?.taskMeta) return '';
    const rawCode = String(pane.taskMeta.code || '').trim().replace(/^#/, '');
    if (/^[A-Za-z]{2,12}-\d+$/.test(rawCode)) return rawCode.toUpperCase();
    const m = String(pane.taskMeta.name || '').match(/\b([A-Za-z]{2,12}-\d+)\b/);
    if (m) return m[1].toUpperCase();
    return rawCode.toUpperCase();
  }

  function renderPaneWorktreeButtons(pane, worktrees) {
    if (!pane?.wtSlotEl) return;
    const list = Array.isArray(worktrees) ? worktrees.slice(0, 3) : [];
    const prevKey = JSON.stringify(pane.worktrees || []);
    const nextKey = JSON.stringify(list);
    if (prevKey === nextKey) return;
    pane.worktrees = list;
    if (!list.length) {
      pane.wtSlotEl.innerHTML = '';
      pane.wtSlotEl.hidden = true;
      return;
    }
    pane.wtSlotEl.innerHTML = list
      .map((wt) => {
        const label = list.length === 1 ? `Worktree (${wt.repo})` : wt.repo;
        return `<button type="button" class="mdv-pane-btn mdv-wt-btn" data-open-worktree="${escapeHtmlAttr(wt.path)}" data-wt-repo="${escapeHtmlAttr(wt.repo)}" data-source-pane="${pane.id}" title="Abrir nueva terminal en el worktree local: ${escapeHtmlAttr(wt.path)}">⎇ ${escapeHtmlAttr(label)}</button>`;
      })
      .join('');
    pane.wtSlotEl.hidden = false;
  }

  let wtCheckInFlight = false;
  async function refreshTaskTerminalWorktrees() {
    if (wtCheckInFlight) return;
    const panesByCode = new Map();
    for (const p of termPanes.values()) {
      if (p.taskMeta && !p.worktreeMeta) {
        const code = extractCleanTaskCodeForPane(p);
        if (code) {
          if (!panesByCode.has(code)) panesByCode.set(code, []);
          panesByCode.get(code).push(p);
        }
      }
    }
    if (!panesByCode.size) return;

    wtCheckInFlight = true;
    try {
      const codesParam = Array.from(panesByCode.keys()).join(',');
      const res = await fetch(`/api/task-worktrees?codes=${encodeURIComponent(codesParam)}`, {
        cache: 'no-store'
      });
      if (!res.ok) return;
      const data = await res.json();
      const byCode = data?.worktreesByCode || {};
      for (const [code, panes] of panesByCode.entries()) {
        const wts = byCode[code] || [];
        for (const p of panes) {
          renderPaneWorktreeButtons(p, wts);
        }
      }
    } catch {
    } finally {
      wtCheckInFlight = false;
    }
  }

  setInterval(() => {
    if (document.visibilityState !== 'hidden') {
      refreshTaskTerminalWorktrees();
    }
  }, 5000);

  function openTaskWorktreeTerminal(sourcePaneId, wtPath, wtRepo) {
    if (!wtPath) return;
    const sourcePane = sourcePaneId ? termPanes.get(sourcePaneId) : null;
    const targetPane =
      (sourcePane && !sourcePane.isHidden ? sourcePane : null) || activeTermPane();
    const taskCode = sourcePane ? extractCleanTaskCodeForPane(sourcePane) : '';
    const newPane = createTerminalPane({
      cwd: wtPath,
      explicitCwd: true,
      taskMeta: sourcePane?.taskMeta ? { ...sourcePane.taskMeta } : null,
      worktreeMeta: {
        taskId: sourcePane?.taskMeta?.id || '',
        code: taskCode,
        repo: wtRepo || wtPath.split(/[/\\]/).filter(Boolean).pop() || 'worktree',
        path: wtPath
      }
    });

    if (!targetPane) {
      termRootTree = newPane;
      termZoneEl.appendChild(newPane.el);
    } else {
      const rect = targetPane.el.getBoundingClientRect();
      const dir = rect.width >= 900 ? 'vertical' : 'horizontal';
      const branch = createBranchAround(targetPane, newPane, dir);
      termRootTree = replaceTreeNode(termRootTree, targetPane.id, branch);
    }

    updateZoneCounts();
    newPane.boot();
    setFocusZone('terminal', newPane.id, false);
    requestAnimationFrame(() => fitAllTerminals());
    scheduleSaveWorkspaceState();
    showToast(`Worktree: ${wtRepo || wtPath}`);
  }

  function resolveTaskCloseCode(task) {
    if (task?.customId) return String(task.customId).trim();
    const m = String(task?.name || '').match(/\b([A-Za-z]{2,10}-\d+)\b/);
    if (m) return m[1];
    return String(task?.id || '').trim();
  }

  function launchClaudeCloseTask(task) {
    if (!task?.id) return;
    const closeCode = resolveTaskCloseCode(task);
    if (!closeCode) return;
    const safeCode = closeCode.replace(/(["\\$`])/g, '\\$1');
    const claudeCmd = `claude "/close-task ${safeCode}"`;

    const existingPaneId = taskTerminals.get(task.id);
    const existingPane = existingPaneId ? termPanes.get(existingPaneId) : null;

    if (!existingPane) {
      if (existingPaneId) taskTerminals.delete(task.id);
      const code = task.customId || `#${task.id}`;
      const newPane = createTerminalPane({
        taskMeta: {
          id: task.id,
          code,
          name: task.name || code,
          url: task.url || '',
          status: task.status || '',
          statusColor: task.statusColor || ''
        }
      });
      taskTerminals.set(task.id, newPane.id);
      cuState.pinnedTasks.set(task.id, task);
      attachPaneToTermTree(newPane);
      updateZoneCounts();
      newPane.boot();
      newPane.runShellCommand(claudeCmd);
      setFocusZone('terminal', newPane.id, false);
      requestAnimationFrame(() => fitAllTerminals());
      renderClickUpTasksList();
      scheduleSaveWorkspaceState();
      refreshTaskTerminalWorktrees();
      showToast(`Claude: /close-task ${closeCode}`);
      return;
    }

    if (existingPane.isHidden) {
      showTerminalPane(existingPane.id);
    } else {
      setFocusZone('terminal', existingPane.id, false);
    }
    existingPane.runShellCommand(claudeCmd);
    showToast(`Claude: /close-task ${closeCode}`);
  }

  function toggleTaskTerminal(task) {
    if (!task?.id) return;
    const existingPaneId = taskTerminals.get(task.id);
    const existingPane = existingPaneId ? termPanes.get(existingPaneId) : null;

    if (!existingPane) {
      if (existingPaneId) taskTerminals.delete(task.id);
      const code = task.customId || `#${task.id}`;
      const newPane = createTerminalPane({
        taskMeta: {
          id: task.id,
          code,
          name: task.name || code,
          url: task.url || '',
          status: task.status || '',
          statusColor: task.statusColor || ''
        }
      });
      taskTerminals.set(task.id, newPane.id);
      cuState.pinnedTasks.set(task.id, task);
      attachPaneToTermTree(newPane);
      updateZoneCounts();
      newPane.boot();
      setFocusZone('terminal', newPane.id, false);
      requestAnimationFrame(() => fitAllTerminals());
      renderClickUpTasksList();
      scheduleSaveWorkspaceState();
      refreshTaskTerminalWorktrees();
      showToast(`Terminal creada: ${code}`);
      return;
    }

    if (existingPane.isHidden) {
      showTerminalPane(existingPane.id);
    } else {
      hideTerminalPane(existingPane.id);
    }
  }

  // Split inside Principal Terminal Zone (Left)
  function splitTerminalPane(targetId, direction = 'vertical', cwd = '') {
    const requested = targetId ? termPanes.get(targetId) : null;
    const targetPane = (requested && !requested.isHidden ? requested : null) || activeTermPane();
    if (!targetPane) {
      const tp = createTerminalPane({ cwd });
      termRootTree = tp;
      termZoneEl.appendChild(tp.el);
      focusedTermPaneId = tp.id;
      updateZoneCounts();
      tp.boot();
      setFocusZone('terminal', tp.id, false);
      scheduleSaveWorkspaceState();
      return tp;
    }
    const newPane = createTerminalPane({ cwd: resolvePreferredCwd() });
    const branch = createBranchAround(targetPane, newPane, direction);
    termRootTree = replaceTreeNode(termRootTree, targetPane.id, branch);
    updateZoneCounts();
    newPane.boot();
    setFocusZone('terminal', newPane.id, false);
    scheduleSaveWorkspaceState();
    showToast(direction === 'vertical' ? 'Terminal Split Right' : 'Terminal Split Down');
    return newPane;
  }

  function closeMarkdownPane(paneId) {
    const pane = mdPanes.get(paneId);
    if (!pane) return;
    if (mdPanes.size <= 1) {
      setFocusZone('terminal', focusedTermPaneId);
      return;
    }
    const parentBranch = findParentBranch(mdRootTree, pane);
    if (!parentBranch) return;
    const sibling = parentBranch.first === pane ? parentBranch.second : parentBranch.first;
    sibling.el.style.flex = parentBranch.el.style.flex || '1 1 100%';
    parentBranch.el.replaceWith(sibling.el);

    const grandParent = findParentBranch(mdRootTree, parentBranch);
    if (!grandParent) {
      mdRootTree = sibling;
      sibling.el.style.flex = '1 1 100%';
    } else {
      if (grandParent.first === parentBranch) grandParent.first = sibling;
      else grandParent.second = sibling;
      applyBranchSizes(grandParent);
    }
    pane.dispose?.();
    mdPanes.delete(paneId);
    updateZoneCounts();

    if (focusedMdPaneId === paneId) {
      const next = firstLeafPane(sibling) || firstLeafPane(mdRootTree);
      if (next) {
        focusedMdPaneId = next.id;
        if (focusZone === 'markdown') setFocusZone('markdown', next.id, false);
      }
    }
    updateFileTreeMarkers();
    showToast('Panel MD cerrado');
  }

  function closeTerminalPane(paneId) {
    const pane = termPanes.get(paneId);
    if (!pane) return;
    if (!pane.taskMeta && termPanes.size <= 1) {
      showToast('La vista principal mantiene al menos 1 terminal activa');
      return;
    }

    let sibling = null;
    if (!pane.isHidden) {
      sibling = detachPaneFromTermTree(pane);
    } else {
      pane.el.remove();
    }

    if (pane.taskMeta?.id && taskTerminals.get(pane.taskMeta.id) === paneId) {
      taskTerminals.delete(pane.taskMeta.id);
    }

    fetch('/api/pty/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: paneId })
    }).catch(() => {});

    pane.dispose?.();
    termPanes.delete(paneId);

    if (termPanes.size === 0) {
      const fresh = createTerminalPane();
      termRootTree = fresh;
      termZoneEl.appendChild(fresh.el);
      focusedTermPaneId = fresh.id;
      fresh.boot();
    } else if (focusedTermPaneId === paneId) {
      const next = firstLeafPane(sibling) || firstLeafPane(termRootTree);
      focusedTermPaneId = next ? next.id : null;
      if (focusZone === 'terminal' && next) setFocusZone('terminal', next.id, false);
    }

    updateZoneCounts();
    requestAnimationFrame(() => fitAllTerminals());
    renderClickUpTasksList();
    scheduleSaveWorkspaceState();
    showToast('Terminal cerrada');
  }

  function equalizeTree(node) {
    if (!node || node.type === 'pane') return;
    node.ratio = 0.5;
    applyBranchSizes(node);
    equalizeTree(node.first);
    equalizeTree(node.second);
    if (node === termRootTree) {
      scheduleSaveWorkspaceState();
    }
  }

  // =========================================================================
  // 4-COLUMN SPATIAL FOCUS NAVIGATION (Alt + h / j / k / l)
  // Order: [1. Archivos] <-> [2. Visor MD] <-> (3. Índice visual) <-> [4. Terminales]
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
            const subUl = det.querySelector(':scope > ul');
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
        await splitMarkdownPane(focusedMdPaneId, 'vertical', targetPath);
        if (stayInFiles) setFocusZone('files', null, false);
      } else {
        const md = activeMdPane();
        if (md) {
          await loadDocumentInPane(md.id, targetPath, { pushState: true });
          if (!stayInFiles) {
            setFocusZone('markdown', md.id, false);
          } else {
            const refreshed = fileListEl?.querySelector(`.mdv-file-item[data-file-path="${CSS.escape(targetPath)}"]`);
            setTreeCursor(refreshed);
          }
        }
      }
    }
  }

  function getActiveTerminalTaskId() {
    if (!focusedTermPaneId) return null;
    const tp = termPanes.get(focusedTermPaneId);
    if (!tp || tp.isHidden) return null;
    return tp.taskMeta?.id || tp.worktreeMeta?.taskId || null;
  }

  function syncFocusedTerminalTaskHighlight({ scrollCard = false } = {}) {
    if (!cuTaskListEl) return;
    const activeTaskId = getActiveTerminalTaskId();
    const zoneIsTerm = focusZone === 'terminal';
    cuTaskListEl.querySelectorAll('.mdv-cu-task-item').forEach((li) => {
      const tid = li.getAttribute('data-cu-task-id');
      const isMatch = Boolean(activeTaskId && tid === activeTaskId);
      li.classList.toggle('is-term-focused', isMatch);
      li.classList.toggle('is-term-zone-live', isMatch && zoneIsTerm);
      const pill = li.querySelector('[data-cu-focus-pill]');
      if (pill) pill.hidden = !isMatch;
      if (
        isMatch &&
        scrollCard &&
        activeSideTab === 'clickup' &&
        !document.body.classList.contains('hide-side-zone')
      ) {
        li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  function setFocusZone(zone, targetPaneId = null, announce = true) {
    focusZone = zone;

    // Clear previous focus visuals
    sidebarFilesEl?.classList.remove('is-zone-focused');
    tabClickupPanelEl?.classList.remove('is-zone-focused');
    btnFocusTermZone?.classList.toggle('is-active', zone === 'terminal');
    if (zone !== 'files' && treeCursorEl) treeCursorEl.classList.remove('is-tree-cursor');
    for (const mp of mdPanes.values()) {
      mp.section.classList.remove('is-zone-focused');
    }
    for (const tp of termPanes.values()) {
      tp.section.classList.remove('is-zone-focused');
      const isTargetTerm = zone === 'terminal' && tp.id === (targetPaneId || focusedTermPaneId);
      if (tp.term) {
        tp.term.options.cursorBlink = isTargetTerm && !tp.isHidden;
      }
      if (!isTargetTerm) {
        tp.term?.blur?.();
      }
    }

    if (zone === 'terminal') {
      const tp = termPanes.get(targetPaneId) || activeTermPane();
      if (!tp) return;
      const changedFocus = focusedTermPaneId !== tp.id;
      focusedTermPaneId = tp.id;
      for (const [id, p] of termPanes.entries()) {
        p.section.classList.toggle('is-focused', id === tp.id);
      }
      tp.section.classList.add('is-zone-focused');
      syncFocusedTerminalTaskHighlight({ scrollCard: changedFocus });
      if (changedFocus) {
        scheduleSaveWorkspaceState();
      }
      if (vimPosEl) vimPosEl.textContent = 'TERM';
      requestAnimationFrame(() => tp.term?.focus());
      if (announce) showToast('Foco: Terminal principal');
      return;
    }

    syncFocusedTerminalTaskHighlight({ scrollCard: false });

    if (zone === 'clickup') {
      if (activeSideTab !== 'clickup') switchSideTab('clickup', { announce: false });
      if (document.activeElement?.closest('.xterm')) document.activeElement.blur();
      tabClickupPanelEl?.classList.add('is-zone-focused');
      if (vimPosEl) vimPosEl.textContent = 'CLICKUP';
      if (announce) showToast('Foco: Clickup');
      return;
    }

    if (zone === 'files') {
      if (activeSideTab !== 'markdown') switchSideTab('markdown', { announce: false });
      if (document.body.classList.contains('hide-files')) {
        document.body.classList.remove('hide-files');
        btnFiles?.classList.add('is-active');
        localStorage.setItem('mdv-hide-files', '0');
      }
      if (document.activeElement?.closest('.xterm')) document.activeElement.blur();
      sidebarFilesEl?.classList.add('is-zone-focused');
      const items = getNavigableTreeItems();
      const validExisting = treeCursorEl && items.includes(treeCursorEl) ? treeCursorEl : null;
      setTreeCursor(validExisting || items.find((el) => el.classList?.contains('is-current')) || items[0] || null);
      if (vimPosEl) vimPosEl.textContent = 'FILES';
      if (announce) showToast('Foco: Archivos MD');
      return;
    }

    if (zone === 'markdown') {
      if (activeSideTab !== 'markdown') switchSideTab('markdown', { announce: false });
      if (document.activeElement?.closest('.xterm')) document.activeElement.blur();
      const mp = mdPanes.get(targetPaneId) || activeMdPane();
      if (!mp) return;
      focusedMdPaneId = mp.id;
      for (const [id, p] of mdPanes.entries()) {
        p.section.classList.toggle('is-focused', id === mp.id);
      }
      mp.section.classList.add('is-zone-focused');
      if (fileNameEl) fileNameEl.textContent = mp.relPath || mp.filePath.split('/').pop() || 'Sin .md';
      renderToc(mp.toc);
      refreshHeadings(mp);
      onMarkdownPaneScroll(mp);
      updateFileTreeMarkers();
      if (lastQuery) highlightQuery(lastQuery);
      if (announce) showToast(`Foco: ${mp.relPath || 'Markdown'}`);
    }
  }

  function findNeighborInMap(curPane, paneMap, dir) {
    const curRect = curPane.section.getBoundingClientRect();
    let best = null;
    let bestDist = Infinity;
    let bestOverlap = -1;

    for (const cand of paneMap.values()) {
      if (cand.id === curPane.id) continue;
      const r = cand.section.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) continue;

      if (dir === 'left' && r.right <= curRect.left + 10) {
        const overlap = Math.min(r.bottom, curRect.bottom) - Math.max(r.top, curRect.top);
        const dist = Math.max(0, curRect.left - r.right);
        if (overlap > 12 && (dist < bestDist - 4 || (Math.abs(dist - bestDist) <= 4 && overlap > bestOverlap))) {
          bestDist = dist;
          bestOverlap = overlap;
          best = cand;
        }
      } else if (dir === 'right' && r.left >= curRect.right - 10) {
        const overlap = Math.min(r.bottom, curRect.bottom) - Math.max(r.top, curRect.top);
        const dist = Math.max(0, r.left - curRect.right);
        if (overlap > 12 && (dist < bestDist - 4 || (Math.abs(dist - bestDist) <= 4 && overlap > bestOverlap))) {
          bestDist = dist;
          bestOverlap = overlap;
          best = cand;
        }
      } else if (dir === 'up' && r.bottom <= curRect.top + 10) {
        const overlap = Math.min(r.right, curRect.right) - Math.max(r.left, curRect.left);
        const dist = Math.max(0, curRect.top - r.bottom);
        if (overlap > 12 && (dist < bestDist - 4 || (Math.abs(dist - bestDist) <= 4 && overlap > bestOverlap))) {
          bestDist = dist;
          bestOverlap = overlap;
          best = cand;
        }
      } else if (dir === 'down' && r.top >= curRect.bottom - 10) {
        const overlap = Math.min(r.right, curRect.right) - Math.max(r.left, curRect.left);
        const dist = Math.max(0, r.top - curRect.bottom);
        if (overlap > 12 && (dist < bestDist - 4 || (Math.abs(dist - bestDist) <= 4 && overlap > bestOverlap))) {
          bestDist = dist;
          bestOverlap = overlap;
          best = cand;
        }
      }
    }
    return best;
  }

  function pickEdgePane(paneMap, edge, refRect = null) {
    const list = Array.from(paneMap.values()).filter((p) => p.section.getBoundingClientRect().width > 10);
    if (!list.length) return null;
    list.sort((a, b) => {
      const ra = a.section.getBoundingClientRect();
      const rb = b.section.getBoundingClientRect();
      const primary = edge === 'leftmost' ? ra.left - rb.left : rb.right - ra.right;
      if (Math.abs(primary) > 8) return primary;
      if (refRect) {
        const oa = Math.min(ra.bottom, refRect.bottom) - Math.max(ra.top, refRect.top);
        const ob = Math.min(rb.bottom, refRect.bottom) - Math.max(rb.top, refRect.top);
        return ob - oa;
      }
      return ra.top - rb.top;
    });
    return list[0];
  }

  function handleSpatialFocusNavigation(dir) {
    if (document.activeElement?.matches('input, select')) {
      document.activeElement.blur();
    }

    // Left (Principal): Terminal Zone -> Right: Side Tab Panel [Markdown | Clickup]
    if (focusZone === 'terminal') {
      const curTerm = activeTermPane();
      if (!curTerm) return;
      const neighborTerm = findNeighborInMap(curTerm, termPanes, dir);
      if (neighborTerm) {
        setFocusZone('terminal', neighborTerm.id);
        return;
      }
      if (dir === 'right') {
        if (document.body.classList.contains('hide-side-zone')) {
          toggleSideZone(false);
        }
        if (activeSideTab === 'clickup') {
          setFocusZone('clickup');
        } else if (!document.body.classList.contains('hide-files')) {
          setFocusZone('files');
        } else {
          const targetMd = pickEdgePane(mdPanes, 'leftmost', curTerm.section.getBoundingClientRect()) || activeMdPane();
          if (targetMd) setFocusZone('markdown', targetMd.id);
        }
      }
      return;
    }

    if (focusZone === 'clickup') {
      if (dir === 'left') {
        const targetTerm = pickEdgePane(termPanes, 'rightmost') || activeTermPane();
        if (targetTerm) setFocusZone('terminal', targetTerm.id);
      } else if (dir === 'right') {
        switchSideTab('markdown', { focusTab: true });
      } else if (dir === 'down') {
        moveClickUpSelection(1);
      } else if (dir === 'up') {
        moveClickUpSelection(-1);
      }
      return;
    }

    if (focusZone === 'files') {
      if (dir === 'left') {
        const targetTerm = pickEdgePane(termPanes, 'rightmost') || activeTermPane();
        if (targetTerm) setFocusZone('terminal', targetTerm.id);
      } else if (dir === 'right') {
        const targetMd = pickEdgePane(mdPanes, 'leftmost') || activeMdPane();
        if (targetMd) setFocusZone('markdown', targetMd.id);
      } else if (dir === 'down') {
        moveTreeCursor(1);
      } else if (dir === 'up') {
        moveTreeCursor(-1);
      }
      return;
    }

    if (focusZone === 'markdown') {
      const curMd = activeMdPane();
      if (!curMd) return;
      const neighborMd = findNeighborInMap(curMd, mdPanes, dir);
      if (neighborMd) {
        setFocusZone('markdown', neighborMd.id);
        return;
      }
      if (dir === 'left') {
        if (!document.body.classList.contains('hide-files')) {
          setFocusZone('files');
        } else {
          const targetTerm = pickEdgePane(termPanes, 'rightmost', curMd.section.getBoundingClientRect()) || activeTermPane();
          if (targetTerm) setFocusZone('terminal', targetTerm.id);
        }
      } else if (dir === 'right') {
        switchSideTab('clickup', { focusTab: true });
      }
    }
  }

  function toggleSyncScroll() {
    syncScroll = !syncScroll;
    updateZoneCounts();
    showToast(syncScroll ? 'Scroll sincronizado: ON' : 'Scroll sincronizado: OFF');
  }

  // Topbar & Side Panel bindings
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
  if (localStorage.getItem('mdv-hide-side') === '1' && !initCfg.splitFile) {
    document.body.classList.add('hide-side-zone');
  }

  sidebarFilesEl?.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input, button')) return;
    if (focusZone !== 'files') setFocusZone('files', null, false);
  });

  tabClickupPanelEl?.addEventListener('pointerdown', (e) => {
    if (focusZone !== 'clickup' && !e.target.closest('button, a')) {
      setFocusZone('clickup', null, false);
    }
  });

  document.querySelectorAll('[data-side-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-side-tab');
      switchSideTab(tab, { focusTab: true });
    });
  });

  document.querySelectorAll('[data-top-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-top-tab');
      const sideHidden = document.body.classList.contains('hide-side-zone');
      if (!sideHidden && activeSideTab === tab) {
        toggleSideZone(true);
      } else {
        switchSideTab(tab, { focusTab: true });
      }
    });
  });

  themeSelect?.addEventListener('change', (e) => applyTheme(e.target.value, true));
  btnFiles?.addEventListener('click', toggleFilesPanel);
  btnToc?.addEventListener('click', toggleTocPanel);
  btnFocusTermZone?.addEventListener('click', () => setFocusZone('terminal', focusedTermPaneId));
  btnToggleSideZone?.addEventListener('click', () => toggleSideZone(true));
  btnWide?.addEventListener('click', toggleWideMode);
  btnSplitV?.addEventListener('click', () => splitMarkdownPane(focusedMdPaneId, 'vertical'));
  btnSplitH?.addEventListener('click', () => splitMarkdownPane(focusedMdPaneId, 'horizontal'));
  btnTermV?.addEventListener('click', () => splitTerminalPane(focusedTermPaneId, 'vertical'));
  btnTermH?.addEventListener('click', () => splitTerminalPane(focusedTermPaneId, 'horizontal'));
  btnFontDec?.addEventListener('click', () => applyZoom(zoomPercent - 10));
  btnFontReset?.addEventListener('click', () => applyZoom(100));
  btnFontInc?.addEventListener('click', () => applyZoom(zoomPercent + 10));
  btnSearch?.addEventListener('click', () => openSearchBar());
  btnHelp?.addEventListener('click', () => toggleHelpModal());

  // File Tree Expand / Collapse & Filter
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
      setFocusZone('files', null, false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      fileFilterEl.blur();
      setFocusZone('files', null, false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const firstVisible = fileListEl?.querySelector('.mdv-file-item:not([hidden])');
      const targetPath = firstVisible?.getAttribute('data-file-path');
      if (targetPath) {
        fileFilterEl.blur();
        if (e.altKey || e.shiftKey) {
          splitMarkdownPane(focusedMdPaneId, 'vertical', targetPath);
        } else {
          const md = activeMdPane();
          if (md) {
            loadDocumentInPane(md.id, targetPath, { pushState: true });
            setFocusZone('markdown', md.id, false);
          }
        }
      }
    }
  });

  // Carousels & Mermaid
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
    if (!pane) return null;
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
    for (const mp of mdPanes.values()) {
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
    const pane = activeMdPane();
    if (!query || !pane) return;

    const lowerQ = query.toLowerCase();
    const walker = document.createTreeWalker(pane.article, NodeFilter.SHOW_TEXT, {
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
          <span>Atajos: Terminales (Principal) | Panel Lateral [Markdown · Clickup]</span>
          <span class="mdv-kbd">Esc / ?</span>
        </h3>
        <div class="mdv-help-grid">
          <div class="mdv-help-section">
            <h4>Terminales y Tabs</h4>
            <div class="mdv-help-row"><span>Moverse entre paneles y pestañas</span><span><kbd class="mdv-kbd">Alt + ← / ↓ / ↑ / →</kbd></span></div>
            <div class="mdv-help-row"><span>Cambiar tab Markdown / Clickup</span><span><kbd class="mdv-kbd">Alt+1/2</kbd> o <kbd class="mdv-kbd">Alt+Shift+←/→</kbd></span></div>
            <div class="mdv-help-row"><span>Mostrar / ocultar panel lateral</span><span><kbd class="mdv-kbd">Alt+B</kbd></span></div>
            <div class="mdv-help-row"><span>Split Right / Down en zona actual</span><span><kbd class="mdv-kbd">Ctrl+Alt+R</kbd> / <kbd class="mdv-kbd">Ctrl+Alt+D</kbd></span></div>
            <div class="mdv-help-row"><span>Forzar nuevo Split Terminal</span><span><kbd class="mdv-kbd">Alt+Shift+R</kbd> / <kbd class="mdv-kbd">Alt+Shift+D</kbd></span></div>
            <div class="mdv-help-row"><span>Cerrar terminal en foco</span><span><kbd class="mdv-kbd">Ctrl+Shift+W</kbd> / <kbd class="mdv-kbd">Ctrl+Alt+W</kbd></span></div>
          </div>
          <div class="mdv-help-section">
            <h4>Tab Markdown (Archivos y Lectura)</h4>
            <div class="mdv-help-row"><span>Árbol de archivos / Filtro rápido</span><span><kbd class="mdv-kbd">e</kbd> / <kbd class="mdv-kbd">Ctrl+P</kbd></span></div>
            <div class="mdv-help-row"><span>Bajar / Subir · Media pág.</span><span><kbd class="mdv-kbd">j</kbd>/<kbd class="mdv-kbd">k</kbd> · <kbd class="mdv-kbd">d</kbd>/<kbd class="mdv-kbd">u</kbd></span></div>
            <div class="mdv-help-row"><span>Inicio / Final · Secciones</span><span><kbd class="mdv-kbd">gg</kbd>/<kbd class="mdv-kbd">G</kbd> · <kbd class="mdv-kbd">]]</kbd>/<kbd class="mdv-kbd">[[</kbd></span></div>
            <div class="mdv-help-row"><span>Buscar / Índice / Ancho / Tema</span><span><kbd class="mdv-kbd">/</kbd> · <kbd class="mdv-kbd">t</kbd> · <kbd class="mdv-kbd">w</kbd> · <kbd class="mdv-kbd">c</kbd></span></div>
            <div class="mdv-help-row"><span>Letra A+ / A− / 100%</span><span><kbd class="mdv-kbd">+</kbd> · <kbd class="mdv-kbd">-</kbd> · <kbd class="mdv-kbd">0</kbd></span></div>
          </div>
          <div class="mdv-help-section">
            <h4>Tab Clickup</h4>
            <div class="mdv-help-row"><span>Subir / bajar entre tareas</span><span><kbd class="mdv-kbd">j</kbd> / <kbd class="mdv-kbd">k</kbd></span></div>
            <div class="mdv-help-row"><span>Cambiar sub-tab de responsable</span><span><kbd class="mdv-kbd">h</kbd> / <kbd class="mdv-kbd">l</kbd></span></div>
            <div class="mdv-help-row"><span>Abrir / Toggle terminal de tarea</span><span><kbd class="mdv-kbd">Clic</kbd> o <kbd class="mdv-kbd">Enter</kbd></span></div>
            <div class="mdv-help-row"><span>Abrir tarea en navegador ClickUp</span><span><kbd class="mdv-kbd">o</kbd> o <kbd class="mdv-kbd">↗</kbd></span></div>
            <div class="mdv-help-row"><span>Filtrar tareas / Recargar</span><span><kbd class="mdv-kbd">/</kbd> · <kbd class="mdv-kbd">r</kbd></span></div>
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
      if (file) await splitMarkdownPane(focusedMdPaneId, 'vertical', file);
      return;
    }

    const wtOpenBtn = e.target.closest('[data-open-worktree]');
    if (wtOpenBtn) {
      e.preventDefault();
      e.stopPropagation();
      const wtPath = wtOpenBtn.getAttribute('data-open-worktree');
      const wtRepo = wtOpenBtn.getAttribute('data-wt-repo') || '';
      const srcPane = wtOpenBtn.getAttribute('data-source-pane') || '';
      openTaskWorktreeTerminal(srcPane, wtPath, wtRepo);
      return;
    }

    const paneActionBtn = e.target.closest('[data-pane-action]');
    if (paneActionBtn) {
      const action = paneActionBtn.getAttribute('data-pane-action');
      const pid = paneActionBtn.getAttribute('data-target-pane');
      if (action === 'md-right') await splitMarkdownPane(pid, 'vertical');
      else if (action === 'md-down') await splitMarkdownPane(pid, 'horizontal');
      else if (action === 'term-right') splitTerminalPane(pid, 'vertical');
      else if (action === 'term-down') splitTerminalPane(pid, 'horizontal');
      return;
    }

    const paneHideBtn = e.target.closest('[data-pane-hide]');
    if (paneHideBtn) {
      const pid = paneHideBtn.getAttribute('data-pane-hide');
      if (pid) hideTerminalPane(pid);
      return;
    }

    const paneCloseBtn = e.target.closest('[data-pane-close]');
    if (paneCloseBtn) {
      const id = paneCloseBtn.getAttribute('data-pane-close');
      const kind = paneCloseBtn.getAttribute('data-close-kind');
      if (kind === 'terminal') closeTerminalPane(id);
      else closeMarkdownPane(id);
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
      const mp = activeMdPane();
      if (id && mp) {
        mp.article.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          await splitMarkdownPane(focusedMdPaneId, 'vertical', targetFile);
        } else {
          const mp = activeMdPane();
          if (mp) {
            await loadDocumentInPane(mp.id, targetFile, { pushState: true, hash: url.hash });
            setFocusZone('markdown', mp.id, false);
          }
        }
      }
    }
  });

  // =========================================================================
  // GLOBAL KEYBOARD ENGINE
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
    const pane = activeMdPane();
    if (!pane || !pane.headings.length) return;
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
    const pane = activeMdPane();
    if (!fileListEl || !pane) return;
    const items = Array.from(fileListEl.querySelectorAll('.mdv-file-item'));
    if (items.length <= 1) return;
    const curIdx = items.findIndex((li) => li.getAttribute('data-file-path') === pane.filePath);
    const nextIdx = ((curIdx >= 0 ? curIdx : 0) + dir + items.length) % items.length;
    const pathAttr = items[nextIdx].getAttribute('data-file-path');
    if (pathAttr) loadDocumentInPane(pane.id, pathAttr, { pushState: true });
  }

  window.addEventListener(
    'keydown',
    (e) => {
      // Zero-overhead synchronous fast path when typing normal keys inside a terminal!
      if (focusZone === 'terminal' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        return;
      }
      const inXterm = Boolean(e.target?.closest?.('.xterm'));
      if (inXterm && !e.altKey && !e.ctrlKey && !e.metaKey) {
        return;
      }
      (async () => {
      const inInput = !inXterm && Boolean(e.target?.matches?.('input, textarea, select'));
      const isAltGraph = Boolean(e.getModifierState && e.getModifierState('AltGraph'));
      const isCtrlAlt = (e.ctrlKey && e.altKey && !e.metaKey) || (!inInput && isAltGraph && !e.metaKey);

      // Close focused terminal with Ctrl+Shift+W
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && (e.code === 'KeyW' || e.key?.toLowerCase() === 'w')) {
        e.preventDefault();
        e.stopPropagation();
        if (focusZone === 'terminal' && focusedTermPaneId) {
          const curTerm = termPanes.get(focusedTermPaneId);
          if (curTerm && !curTerm.isHidden) {
            closeTerminalPane(curTerm.id);
          }
        }
        return;
      }

      // 1. Context-aware Ctrl+Alt+R / Ctrl+Alt+D Splits:
      //    - In Terminal Zone => splits Terminal Zone (Right / Down)!
      //    - In Markdown / Files Zone => splits Markdown Zone (Right / Down)!
      if (isCtrlAlt) {
        if ((e.shiftKey && e.code === 'KeyR') || e.code === 'KeyT') {
          e.preventDefault();
          e.stopPropagation();
          splitTerminalPane(focusedTermPaneId, 'vertical');
          return;
        }
        if ((e.shiftKey && e.code === 'KeyD') || e.code === 'KeyB') {
          e.preventDefault();
          e.stopPropagation();
          splitTerminalPane(focusedTermPaneId, 'horizontal');
          return;
        }
        if (!e.shiftKey && (e.code === 'KeyR' || e.key?.toLowerCase() === 'r')) {
          e.preventDefault();
          e.stopPropagation();
          if (focusZone === 'terminal') {
            splitTerminalPane(focusedTermPaneId, 'vertical');
          } else {
            const selFile =
              focusZone === 'files' && treeCursorEl?.classList.contains('mdv-file-item')
                ? treeCursorEl.getAttribute('data-file-path')
                : null;
            await splitMarkdownPane(focusedMdPaneId, 'vertical', selFile);
          }
          return;
        }
        if (!e.shiftKey && (e.code === 'KeyD' || e.key?.toLowerCase() === 'd')) {
          e.preventDefault();
          e.stopPropagation();
          if (focusZone === 'terminal') {
            splitTerminalPane(focusedTermPaneId, 'horizontal');
          } else {
            const selFile =
              focusZone === 'files' && treeCursorEl?.classList.contains('mdv-file-item')
                ? treeCursorEl.getAttribute('data-file-path')
                : null;
            await splitMarkdownPane(focusedMdPaneId, 'horizontal', selFile);
          }
          return;
        }
        if (!e.shiftKey && (e.code === 'KeyW' || e.key?.toLowerCase() === 'w')) {
          e.preventDefault();
          e.stopPropagation();
          if (focusZone === 'terminal' && focusedTermPaneId) {
            const curTerm = termPanes.get(focusedTermPaneId);
            if (curTerm && !curTerm.isHidden) {
              closeTerminalPane(curTerm.id);
            }
          }
          return;
        }
      }
      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        if (e.code === 'KeyR') {
          e.preventDefault();
          e.stopPropagation();
          splitTerminalPane(focusedTermPaneId, 'vertical');
          return;
        }
        if (e.code === 'KeyD') {
          e.preventDefault();
          e.stopPropagation();
          splitTerminalPane(focusedTermPaneId, 'horizontal');
          return;
        }
        if (e.code === 'KeyW') {
          e.preventDefault();
          e.stopPropagation();
          if (focusZone === 'terminal' && focusedTermPaneId) closeTerminalPane(focusedTermPaneId);
          else if (focusedMdPaneId) closeMarkdownPane(focusedMdPaneId);
          return;
        }
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          const nextTab = activeSideTab === 'clickup' ? 'markdown' : 'clickup';
          switchSideTab(nextTab, { focusTab: true });
          return;
        }
      }

      // 2. Quick Side Panel Tab & Visibility Shortcuts (Alt+1 = Markdown, Alt+2 = Clickup, Alt+B = Toggle Side Panel)
      if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && !isAltGraph) {
        if (e.code === 'Digit1') {
          e.preventDefault();
          e.stopPropagation();
          switchSideTab('markdown', { focusTab: true });
          return;
        }
        if (e.code === 'Digit2') {
          e.preventDefault();
          e.stopPropagation();
          switchSideTab('clickup', { focusTab: true });
          return;
        }
        if (e.code === 'KeyB') {
          e.preventDefault();
          e.stopPropagation();
          toggleSideZone(true);
          return;
        }
      }

      // 3. Spatial Alt + Flechas across [Terminales] <-> [Pestañas: Markdown / Clickup]
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey &&
        !isAltGraph &&
        ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'].includes(e.code)
      ) {
        e.preventDefault();
        e.stopPropagation();
        resetVimPending();
        const dirMap = {
          ArrowLeft: 'left',
          ArrowRight: 'right',
          ArrowDown: 'down',
          ArrowUp: 'up'
        };
        handleSpatialFocusNavigation(dirMap[e.code]);
        return;
      }

      // Inside Terminal or Input, pass all normal keys straight to shell/input
      if (inInput || focusZone === 'terminal') {
        if (inInput && e.key === 'Escape') {
          e.target.blur();
        }
        return;
      }

      if (focusZone === 'clickup') {
        if (e.key === 'Escape') {
          if (modalEl && !modalEl.hidden) {
            modalEl.hidden = true;
          } else {
            setFocusZone('terminal', focusedTermPaneId);
          }
          return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        switch (e.key) {
          case 'j':
          case 'ArrowDown':
            e.preventDefault();
            moveClickUpSelection(1);
            return;
          case 'k':
          case 'ArrowUp':
            e.preventDefault();
            moveClickUpSelection(-1);
            return;
          case 'h':
          case 'ArrowLeft':
            e.preventDefault();
            cycleClickUpAssigneeTab(-1);
            return;
          case 'l':
          case 'ArrowRight':
            e.preventDefault();
            cycleClickUpAssigneeTab(1);
            return;
          case 'Enter':
          case ' ':
            e.preventDefault();
            toggleSelectedClickUpTaskTerminal();
            return;
          case 'o':
            e.preventDefault();
            openSelectedClickUpTask();
            return;
          case '/':
            e.preventDefault();
            cuSearchInput?.focus();
            cuSearchInput?.select();
            return;
          case 'r':
            e.preventDefault();
            loadClickUpTasks({ reset: true, refreshMeta: true });
            return;
          case '?':
            e.preventDefault();
            toggleHelpModal();
            return;
          case 'q':
            e.preventDefault();
            setFocusZone('terminal', focusedTermPaneId);
            return;
        }
        return;
      }

      const pane = activeMdPane();

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
          setFocusZone('markdown', focusedMdPaneId);
          return;
        }
        if (searchHits.length > 0) {
          clearSearchHighlights();
          showToast('Búsqueda limpia');
        }
        return;
      }

      if (pendingPrefix === '␣') {
        resetVimPending();
        e.preventDefault();
        const k = e.key;
        if (k === 'v' || k === '|') await splitMarkdownPane(focusedMdPaneId, 'vertical');
        else if (k === 's' || k === '-') await splitMarkdownPane(focusedMdPaneId, 'horizontal');
        else if (k === 't') splitTerminalPane(focusedTermPaneId, 'vertical');
        else if (k === 'T') splitTerminalPane(focusedTermPaneId, 'horizontal');
        else if (k === 'h') handleSpatialFocusNavigation('left');
        else if (k === 'l') handleSpatialFocusNavigation('right');
        else if (k === 'k') handleSpatialFocusNavigation('up');
        else if (k === 'j') handleSpatialFocusNavigation('down');
        else if (k === '=') {
          equalizeTree(mdRootTree);
          equalizeTree(termRootTree);
          fitAllTerminals();
          showToast('Splits igualados 50 / 50');
        } else if (k === 'y') {
          toggleSyncScroll();
        } else if (k === 'q' || k === 'c') {
          if (focusedMdPaneId) closeMarkdownPane(focusedMdPaneId);
        }
        return;
      }

      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key === 'p') {
          e.preventDefault();
          if (document.body.classList.contains('hide-files')) toggleFilesPanel();
          fileFilterEl?.focus();
          fileFilterEl?.select();
          return;
        }
        if (focusZone === 'markdown' && pane) {
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
            setFocusZone('markdown', focusedMdPaneId);
            return;
        }
        return;
      }

      // MARKDOWN PANE VIM MODE
      if (!pane) return;
      const scroller = pane.scroller;

      if (e.key === 'Tab' && mdPanes.size > 1) {
        e.preventDefault();
        const ids = Array.from(mdPanes.keys());
        const nextId = ids[(ids.indexOf(pane.id) + 1) % ids.length];
        setFocusZone('markdown', nextId);
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
          await splitMarkdownPane(pane.id, 'vertical');
          break;
        case 'S':
          e.preventDefault();
          await splitMarkdownPane(pane.id, 'horizontal');
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
          closeMarkdownPane(pane.id);
          break;
      }
      })();
    },
    { capture: true }
  );

  // =========================================================================
  // SCROLL-SPY, DOCUMENT LOADING & LIVE-RELOAD
  // =========================================================================
  function refreshHeadings(pane) {
    pane.headings = Array.from(pane.article.querySelectorAll('.mdv-heading[id]'));
  }

  function onMarkdownPaneScroll(pane) {
    const scroller = pane.scroller;
    const scrollTop = scroller.scrollTop;
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;

    if (syncScroll && !isSyncingScroll && maxScroll > 0) {
      isSyncingScroll = true;
      for (const other of mdPanes.values()) {
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

    if (pane.id !== focusedMdPaneId) return;

    if (focusZone === 'markdown' && vimPosEl) {
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
    const cur = activeMdPane();
    const focusedPath = cur?.filePath || '';
    const openMdPaths = new Set(Array.from(mdPanes.values()).map((p) => p.filePath));
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
    const pane = mdPanes.get(paneId);
    if (!pane) return;

    const isSameFile = Boolean(filePath) && filePath === pane.filePath;
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

    const queryParam = filePath ? `file=${encodeURIComponent(filePath)}&` : '';
    const res = await fetch(`/api/doc?${queryParam}_t=${Date.now()}`, {
      cache: 'no-store'
    });
    if (!res.ok) return;
    const data = await res.json();

    pane.filePath = data.filePath || '';
    pane.relPath = data.relPath || data.fileName || 'Sin .md';
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

    if (data.treeHtml !== undefined && fileListEl) {
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

    if (pane.id === focusedMdPaneId) {
      if (fileNameEl) fileNameEl.textContent = pane.relPath;
      if (data.title || data.fileName) {
        document.title = `${data.title || data.fileName} — mdv`;
        postNativeWin(`title:${document.title}`);
      }
      renderToc(pane.toc);
      if (lastQuery) highlightQuery(lastQuery);
    }
    updateFileTreeMarkers();

    if (isLiveReload) flashReloadIndicator();

    if (pushState && pane.filePath) {
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
    const md = activeMdPane();
    if (f && md) loadDocumentInPane(md.id, f, { pushState: false, hash: location.hash });
  });

  // =========================================================================
  // CLICKUP OAUTH 2.0 + SIMPLE TASKS CONTROLLER
  // =========================================================================
  function escapeHtmlText(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function openExternalUrl(url) {
    if (!url) return;
    try {
      await fetch('/api/open-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  }

  function renderClickUpViewMode() {
    const showAuth = !cuState.connected || cuState.showingSettings;
    if (cuAuthViewEl) cuAuthViewEl.hidden = !showAuth;
    if (cuTasksViewEl) cuTasksViewEl.hidden = showAuth;
    if (cuBackTasksBtn) cuBackTasksBtn.hidden = !cuState.connected;
    if (cuDisconnectBtn) cuDisconnectBtn.hidden = !cuState.connected;

    if (cuTokenInput) {
      cuTokenInput.placeholder = cuState.hasSavedToken
        ? '•••••••• (token guardado — pega uno nuevo para reemplazar)'
        : 'pk_...';
    }
  }

  function formatRelativeUpdated(msStr) {
    const ms = Number(msStr);
    if (!ms || Number.isNaN(ms)) return '';
    const diffMin = Math.max(0, Math.floor((Date.now() - ms) / 60000));
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin}m`;
    const hrs = Math.floor(diffMin / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `hace ${days}d`;
    return new Date(ms).toLocaleDateString('es');
  }

  function cleanStatusCore(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/^\d+[\.\)\-:\s]+/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isHiddenClickUpStatus(task) {
    if (task?.id && taskTerminals.has(task.id)) return false;
    const stType = String(task?.statusType || '').toLowerCase();
    if (stType === 'done' || stType === 'closed') return true;
    const core = cleanStatusCore(task?.status);
    if (
      core === 'done' ||
      core.startsWith('done ') ||
      core.endsWith(' done') ||
      core === 'closed' ||
      core === 'complete' ||
      core === 'completed'
    ) {
      return true;
    }
    if (core === 'to do' || core === 'todo' || core === 'next' || core.startsWith('next ')) {
      return true;
    }
    return false;
  }

  // Exact pipeline order: 5. staging -> 4. code review -> 3. in progress (-> any pinned terminal task)
  function getClickUpStatusRank(raw) {
    const core = cleanStatusCore(raw);
    if (core === 'staging' || core.includes('staging')) return 0;
    if (core === 'code review' || core.includes('review')) return 1;
    if (core === 'in progress' || core.includes('progress')) return 2;
    if (core === 'next' || core.startsWith('next ')) return 3;
    return 4;
  }

  function sortClickUpTasksByStatus(list) {
    return [...list].sort((a, b) => {
      const ra = getClickUpStatusRank(a.status);
      const rb = getClickUpStatusRank(b.status);
      if (ra !== rb) return ra - rb;
      const sa = cleanStatusCore(a.status);
      const sb = cleanStatusCore(b.status);
      if (sa !== sb) return sa.localeCompare(sb);
      return Number(b.dateUpdated || 0) - Number(a.dateUpdated || 0);
    });
  }

  function getMergedAllKnownTasks() {
    const byId = new Map();
    for (const t of cuState.tasks) {
      if (t?.id) byId.set(t.id, t);
    }
    for (const [id, t] of cuState.pinnedTasks.entries()) {
      if (!byId.has(id)) byId.set(id, t);
    }
    return Array.from(byId.values());
  }

  function findClickUpTaskById(taskId) {
    if (!taskId) return null;
    return cuState.tasks.find((t) => t.id === taskId) || cuState.pinnedTasks.get(taskId) || null;
  }

  function taskHasOpenTerminal(task) {
    if (!task?.id) return false;
    const pid = taskTerminals.get(task.id);
    return Boolean(pid && termPanes.has(pid));
  }

  function getActivePipelineTasks() {
    return getMergedAllKnownTasks().filter((t) => !isHiddenClickUpStatus(t));
  }

  function getScopedPipelineTasks() {
    const allActive = getActivePipelineTasks();
    return cuState.onlyWithTerminal ? allActive.filter(taskHasOpenTerminal) : allActive;
  }

  function buildAssigneeSubTabs() {
    const activeTasks = getScopedPipelineTasks();
    const map = new Map(); // String(id) -> { id, name, initials, count }
    let unassignedCount = 0;

    for (const t of activeTasks) {
      const assignees = Array.isArray(t.assignees) ? t.assignees : [];
      if (assignees.length === 0) {
        unassignedCount++;
        continue;
      }
      for (const a of assignees) {
        const key = String(a.id);
        const existing = map.get(key);
        if (existing) {
          existing.count++;
        } else {
          map.set(key, {
            id: key,
            name: a.name || 'Usuario',
            initials: a.initials || '?',
            count: 1
          });
        }
      }
    }

    const entries = Array.from(map.values());
    const myKey = cuState.currentUserId != null ? String(cuState.currentUserId) : null;
    entries.sort((a, b) => {
      if (myKey) {
        if (a.id === myKey && b.id !== myKey) return -1;
        if (b.id === myKey && a.id !== myKey) return 1;
      }
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    });

    // Build concise short display names (first name, + last initial if collision)
    const firstNamesCount = new Map();
    for (const e of entries) {
      const fn = e.name.split(/\s+/)[0].toLowerCase();
      firstNamesCount.set(fn, (firstNamesCount.get(fn) || 0) + 1);
    }
    for (const e of entries) {
      const parts = e.name.split(/\s+/).filter(Boolean);
      const fn = parts[0] || e.name;
      if ((firstNamesCount.get(fn.toLowerCase()) || 0) > 1 && parts.length > 1) {
        e.shortName = `${fn} ${parts[1][0].toUpperCase()}.`;
      } else {
        e.shortName = fn;
      }
    }

    const tabs = [{ id: 'all', label: 'Todas', title: 'Todas las tareas activas', count: activeTasks.length }];
    for (const e of entries) {
      tabs.push({ id: e.id, label: e.shortName, title: e.name, count: e.count });
    }
    if (unassignedCount > 0) {
      tabs.push({ id: 'unassigned', label: 'Sin asignar', title: 'Tareas sin responsable', count: unassignedCount });
    }
    return tabs;
  }

  function renderClickUpAssigneeTabs() {
    if (!cuAssigneeTabsEl) return;
    const scopedTasks = getScopedPipelineTasks();
    const tabs = buildAssigneeSubTabs();
    if (!tabs.some((t) => t.id === cuState.assigneeFilter)) {
      cuState.assigneeFilter = 'all';
      localStorage.setItem('mdv-cu-assignee', 'all');
    }
    if (cuAssigneeScrollEl) {
      cuAssigneeScrollEl.hidden = scopedTasks.length === 0;
    }
    cuAssigneeTabsEl.innerHTML = tabs
      .map((tab) => {
        const isAct = tab.id === cuState.assigneeFilter;
        return `
          <button type="button" class="mdv-cu-subtab${isAct ? ' is-active' : ''}" role="tab" aria-selected="${isAct ? 'true' : 'false'}" data-cu-assignee="${escapeHtmlText(tab.id)}" title="${escapeHtmlText(tab.title)}">
            <span>${escapeHtmlText(tab.label)}</span>
            <span class="mdv-cu-subtab-count">${tab.count}</span>
          </button>`;
      })
      .join('');
    cuAssigneeOs?.update?.(true);
  }

  function cycleClickUpAssigneeTab(delta) {
    const tabs = buildAssigneeSubTabs();
    if (tabs.length <= 1) return;
    const curIdx = Math.max(0, tabs.findIndex((t) => t.id === cuState.assigneeFilter));
    const nextTab = tabs[(curIdx + delta + tabs.length) % tabs.length];
    cuState.assigneeFilter = nextTab.id;
    localStorage.setItem('mdv-cu-assignee', nextTab.id);
    cuState.selectedIdx = -1;
    renderClickUpAssigneeTabs();
    renderClickUpTasksList();
    cuAssigneeTabsEl?.querySelector('.mdv-cu-subtab.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function extractClientTaskIdToken(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    const urlIdx = s.indexOf('clickup.com/t/');
    if (urlIdx !== -1) {
      s = s.slice(urlIdx + 'clickup.com/t/'.length).split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
      const parts = s.split('/');
      s = parts[parts.length - 1] || '';
    }
    s = s.replace(/^#+/, '').trim();
    if (s.length < 3 || s.length > 64 || !/^[A-Za-z0-9_-]+$/.test(s)) return '';
    return s;
  }

  function looksLikeTaskIdOrUrl(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return false;
    if (trimmed.includes('clickup.com/t/') || trimmed.startsWith('#')) return Boolean(extractClientTaskIdToken(trimmed));
    const tok = extractClientTaskIdToken(trimmed);
    if (!tok) return false;
    if (/^[A-Za-z0-9_]+-\d+$/.test(tok)) return true; // Custom ID like FIN-123
    return tok.length >= 6 && /\d/.test(tok); // ClickUp ID like 86a4xyz12
  }

  function getFilteredClickUpTasks() {
    const af = cuState.assigneeFilter || 'all';
    const rawQ = (cuSearchInput?.value || '').trim();
    const q = rawQ.toLowerCase();
    const idToken = extractClientTaskIdToken(rawQ).toLowerCase();

    if (!q) {
      const subset = getScopedPipelineTasks().filter((t) => {
        const assignees = Array.isArray(t.assignees) ? t.assignees : [];
        if (af === 'unassigned') return assignees.length === 0;
        if (af !== 'all') return assignees.some((a) => String(a.id) === af);
        return true;
      });
      return sortClickUpTasksByStatus(subset);
    }

    // When searching, search across ALL known + looked-up tasks, and bypass assignee tab filter on exact ID/URL match
    const subset = getMergedAllKnownTasks().filter((t) => {
      const assignees = Array.isArray(t.assignees) ? t.assignees : [];
      const exactIdMatch =
        Boolean(idToken) &&
        (String(t.id || '').toLowerCase() === idToken || String(t.customId || '').toLowerCase() === idToken);

      if (exactIdMatch) return true;

      if (cuState.onlyWithTerminal && !taskHasOpenTerminal(t)) return false;

      // For normal text search, keep hiding done/todo/next unless pinned, and respect active assignee tab
      if (isHiddenClickUpStatus(t) && !cuState.pinnedTasks.has(t.id)) return false;
      if (af === 'unassigned' && assignees.length > 0) return false;
      if (af !== 'all' && af !== 'unassigned' && !assignees.some((a) => String(a.id) === af)) return false;

      const hay = [
        t.customId || '',
        t.id || '',
        t.name || '',
        t.status || '',
        t.listName || '',
        t.folderName || '',
        ...assignees.map((a) => a.name || '')
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    return sortClickUpTasksByStatus(subset);
  }

  function getTaskTermVisualSpec(termPane) {
    if (!termPane) {
      return {
        cardCls: '',
        badgeCls: 'is-none',
        hasDot: false,
        label: '>_ Terminal',
        title: 'Haz clic en la tarea para abrir un terminal'
      };
    }
    const isVisible = !termPane.isHidden;
    const cs = termPane.claudeState || 'none';
    const baseWord = isVisible ? 'Abierta' : 'Oculta';
    if (cs === 'working') {
      return {
        cardCls: 'has-term-claude-working',
        badgeCls: `${isVisible ? 'is-open' : 'is-hidden'} is-claude-working`,
        hasDot: true,
        label: `✦ ${baseWord}`,
        title: `Claude trabajando (${baseWord.toLowerCase()}) — clic en la tarea para ${isVisible ? 'ocultar en 2° plano' : 'mostrar'}`
      };
    }
    if (cs === 'waiting') {
      return {
        cardCls: 'has-term-claude-waiting',
        badgeCls: `${isVisible ? 'is-open' : 'is-hidden'} is-claude-waiting`,
        hasDot: true,
        label: `✦ ${baseWord}`,
        title: `Claude esperando tu respuesta (${baseWord.toLowerCase()}) — clic en la tarea para ${isVisible ? 'ocultar en 2° plano' : 'mostrar'}`
      };
    }
    if (isVisible) {
      return {
        cardCls: 'has-term-open',
        badgeCls: 'is-open',
        hasDot: true,
        label: '>_ Abierta',
        title: 'Terminal visible — clic en la tarea para ocultar en 2° plano'
      };
    }
    return {
      cardCls: 'has-term-hidden',
      badgeCls: 'is-hidden',
      hasDot: true,
      label: '>_ Oculta',
      title: 'Terminal activa en 2° plano — clic en la tarea para mostrar'
    };
  }

  function syncSingleTaskCardTermBadge(taskId) {
    if (!cuTaskListEl || !taskId) return;
    const cardEl = cuTaskListEl.querySelector(`.mdv-cu-task-item[data-cu-task-id="${CSS.escape(taskId)}"]`);
    if (!cardEl) return;
    const paneId = taskTerminals.get(taskId);
    const termPane = paneId ? termPanes.get(paneId) : null;
    const spec = getTaskTermVisualSpec(termPane);

    cardEl.classList.remove(
      'has-term-open',
      'has-term-hidden',
      'has-term-claude-working',
      'has-term-claude-waiting'
    );
    if (spec.cardCls) cardEl.classList.add(spec.cardCls);

    const badgeEl = cardEl.querySelector('.mdv-cu-term-badge');
    if (badgeEl) {
      badgeEl.className = `mdv-cu-term-badge ${spec.badgeCls}`;
      badgeEl.title = spec.title;
      badgeEl.innerHTML = spec.hasDot
        ? `<span class="mdv-cu-term-dot"></span><span>${escapeHtmlText(spec.label)}</span>`
        : escapeHtmlText(spec.label);
    }
  }

  function setPaneClaudeState(pane, rawState) {
    if (!pane) return;
    const next = rawState === 'working' || rawState === 'waiting' ? rawState : 'none';
    if (pane.claudeState === next) return;
    pane.claudeState = next;
    pane.section.setAttribute('data-claude-state', next);
    if (pane.taskMeta?.id) {
      syncSingleTaskCardTermBadge(pane.taskMeta.id);
      refreshTaskTerminalWorktrees();
    }
  }

  function renderTaskPrsHtml(taskId) {
    const prs = cuState.prsByTask.get(taskId);
    if (!prs || !prs.length) return '';
    return prs
      .map((pr) => {
        const sKey = escapeHtmlText(pr.statusKey || 'open');
        const sLabel = escapeHtmlText(pr.statusLabel || 'PR');
        const filesNum = Number(pr.changedFiles || 0);
        const filesTxt = `${filesNum} ${filesNum === 1 ? 'archivo' : 'archivos'}`;
        const addNum = Number(pr.additions || 0);
        const delNum = Number(pr.deletions || 0);
        let ciHtml = '';
        if (pr.ciState === 'SUCCESS') {
          ciHtml = `<span class="mdv-cu-pr-ci is-ok" title="Checks en verde (SUCCESS)">✓</span>`;
        } else if (pr.ciState === 'FAILURE' || pr.ciState === 'ERROR') {
          ciHtml = `<span class="mdv-cu-pr-ci is-fail" title="Checks fallando (${escapeHtmlText(pr.ciState)})">✕</span>`;
        } else if (pr.ciState === 'PENDING' || pr.ciState === 'EXPECTED') {
          ciHtml = `<span class="mdv-cu-pr-ci is-pending" title="Checks en ejecución">●</span>`;
        }
        const tip = `${pr.repo} #${pr.number} — ${pr.title || sLabel}`;
        return `
          <div class="mdv-cu-pr-row">
            <button type="button" class="mdv-cu-pr-pill is-pr-${sKey}" data-cu-open-url="${escapeHtmlText(pr.url)}" title="${escapeHtmlText(tip)}">
              <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>
              <span class="mdv-cu-pr-repo">${escapeHtmlText(pr.repo)} #${pr.number}</span>
              <span class="mdv-cu-pr-sep">·</span>
              <span class="mdv-cu-pr-state">${sLabel}</span>
              ${ciHtml}
            </button>
            <span class="mdv-cu-pr-stats" title="${filesNum} archivos modificados (+${addNum} / -${delNum} líneas)">
              <span class="mdv-cu-pr-files">${filesTxt}</span>
              <span class="mdv-cu-pr-add">+${addNum}</span>
              <span class="mdv-cu-pr-del">−${delNum}</span>
            </span>
          </div>`;
      })
      .join('');
  }

  function syncTaskCardsPrSlots(taskIds) {
    if (!cuTaskListEl) return;
    for (const tid of taskIds) {
      const slot = cuTaskListEl.querySelector(
        `.mdv-cu-task-item[data-cu-task-id="${CSS.escape(tid)}"] [data-cu-pr-slot]`
      );
      if (!slot) continue;
      const html = renderTaskPrsHtml(tid);
      slot.innerHTML = html;
      slot.hidden = !html;
    }
  }

  async function fetchGitHubPrsForTasks(tasksList, { refresh = false } = {}) {
    if (!Array.isArray(tasksList) || !tasksList.length) return;
    const payloadTasks = tasksList
      .filter((t) => t?.id)
      .map((t) => ({
        id: t.id,
        code: resolveTaskCloseCode(t)
      }));
    if (!payloadTasks.length) return;

    try {
      const res = await fetch('/api/github/task-prs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: payloadTasks, refresh })
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.available || !data?.prsByTask) return;
      const updatedIds = [];
      for (const [tid, prs] of Object.entries(data.prsByTask)) {
        cuState.prsByTask.set(tid, Array.isArray(prs) ? prs : []);
        updatedIds.push(tid);
      }
      if (updatedIds.length) {
        syncTaskCardsPrSlots(updatedIds);
      }
    } catch {}
  }

  function applyPaneTaskBadgeColor(pane) {
    const badgeEl = pane?.section?.querySelector('[data-pane-task-badge]');
    if (!badgeEl) return;
    const color = sanitizeCssColor(pane.taskMeta?.statusColor);
    const statusTxt = pane.taskMeta?.status || '';
    if (color) {
      badgeEl.style.setProperty('--task-status-color', color);
      badgeEl.setAttribute('data-has-status-color', '1');
    } else {
      badgeEl.style.removeProperty('--task-status-color');
      badgeEl.removeAttribute('data-has-status-color');
    }
    if (pane.worktreeMeta) {
      const baseTip = pane.worktreeMeta.path || '';
      badgeEl.title = statusTxt ? `${statusTxt} · ${baseTip}` : baseTip;
    } else if (statusTxt) {
      badgeEl.title = `Estado en ClickUp: ${statusTxt}`;
    }
  }

  function syncAllTerminalTaskStatusColors() {
    const knownById = new Map();
    for (const t of getMergedAllKnownTasks()) {
      if (t?.id) knownById.set(t.id, t);
    }
    let changed = false;
    for (const pane of termPanes.values()) {
      const tid = pane.taskMeta?.id;
      if (!tid) continue;
      const task = knownById.get(tid);
      if (task) {
        const nextStatus = task.status || '';
        const nextColor = task.statusColor || '';
        if (pane.taskMeta.status !== nextStatus || pane.taskMeta.statusColor !== nextColor) {
          pane.taskMeta = {
            ...pane.taskMeta,
            status: nextStatus,
            statusColor: nextColor
          };
          changed = true;
        }
      }
      applyPaneTaskBadgeColor(pane);
    }
    if (changed) {
      scheduleSaveWorkspaceState();
    }
  }

  function renderClickUpTasksList() {
    syncAllTerminalTaskStatusColors();
    if (!cuTaskListEl) return;
    renderClickUpAssigneeTabs();
    const activeTasks = getActivePipelineTasks();
    const withTermCount = activeTasks.filter(taskHasOpenTerminal).length;
    const filtered = getFilteredClickUpTasks();

    if (cuOnlyTermsBtn) {
      cuOnlyTermsBtn.classList.toggle('is-active', cuState.onlyWithTerminal);
      cuOnlyTermsBtn.setAttribute('aria-pressed', cuState.onlyWithTerminal ? 'true' : 'false');
    }
    if (cuTermsChipEl) {
      cuTermsChipEl.textContent = String(withTermCount);
      cuTermsChipEl.hidden = !cuState.connected || withTermCount === 0;
    }

    if (cuCountChipEl) {
      cuCountChipEl.textContent = String(activeTasks.length);
      cuCountChipEl.hidden = !cuState.connected;
    }

    if (cuEmptyEl) {
      if (cuState.lookupLoading && filtered.length === 0) {
        cuEmptyEl.textContent = 'Buscando tarea por ID en ClickUp...';
        cuEmptyEl.hidden = false;
      } else if (cuState.onlyWithTerminal && !cuSearchInput?.value?.trim()) {
        cuEmptyEl.textContent = 'No hay tareas con terminal abierta en este momento.';
        cuEmptyEl.hidden = cuState.loading || filtered.length > 0;
      } else {
        cuEmptyEl.textContent = 'No se encontraron tareas con este filtro (pega un ID y pulsa Enter para buscar en ClickUp).';
        cuEmptyEl.hidden = cuState.loading || filtered.length > 0;
      }
    }
    if (cuMoreWrapEl) {
      cuMoreWrapEl.hidden =
        !cuState.hasMore || cuState.onlyWithTerminal || Boolean(cuSearchInput?.value?.trim());
    }

    if (cuState.selectedIdx >= filtered.length) {
      cuState.selectedIdx = filtered.length - 1;
    }

    // Count tasks per normalized status in current filtered view for group headers
    const statusGroupCounts = new Map();
    for (const t of filtered) {
      const sk = cleanStatusCore(t.status);
      statusGroupCounts.set(sk, (statusGroupCounts.get(sk) || 0) + 1);
    }

    let lastStatusKey = null;
    const focusedTaskId = getActiveTerminalTaskId();
    const zoneIsTerm = focusZone === 'terminal';
    const htmlParts = [];

    filtered.forEach((t, idx) => {
      const sKey = cleanStatusCore(t.status);
      if (sKey !== lastStatusKey) {
        lastStatusKey = sKey;
        htmlParts.push(`
          <li class="mdv-cu-status-group" aria-hidden="true">
            <span class="mdv-cu-status-dot" style="background:${escapeHtmlText(t.statusColor || '#64748b')}"></span>
            <span>${escapeHtmlText(t.status)}</span>
            <span class="mdv-cu-status-group-count">${statusGroupCounts.get(sKey) || 0}</span>
          </li>`);
      }

      const badgeCode = t.customId || `#${t.id}`;
      const crumb = [t.folderName, t.listName].filter(Boolean).join(' / ');
      const updated = formatRelativeUpdated(t.dateUpdated);
      const prioHtml = t.priority
        ? `<span class="mdv-cu-priority" style="color:${escapeHtmlText(t.priorityColor || 'var(--text-muted)')}">⚑ ${escapeHtmlText(t.priority)}</span>`
        : '';
      const assigneesHtml = (t.assignees || [])
        .slice(0, 4)
        .map(
          (a) =>
            `<span class="mdv-cu-avatar" title="${escapeHtmlText(a.name)}">${escapeHtmlText(a.initials)}</span>`
        )
        .join('');

      const paneId = taskTerminals.get(t.id);
      const termPane = paneId ? termPanes.get(paneId) : null;
      const hasTerm = Boolean(termPane);
      const spec = getTaskTermVisualSpec(termPane);
      const termCardCls = spec.cardCls ? ` ${spec.cardCls}` : '';
      let termBadgeHtml = `<span class="mdv-cu-term-badge ${spec.badgeCls}" title="${escapeHtmlText(spec.title)}">${escapeHtmlText(spec.label)}</span>`;
      if (hasTerm) {
        termBadgeHtml = `
          <span class="mdv-cu-term-badge ${spec.badgeCls}" title="${escapeHtmlText(spec.title)}">
            <span class="mdv-cu-term-dot"></span>
            <span>${escapeHtmlText(spec.label)}</span>
          </span>
          <button type="button" class="mdv-cu-term-kill" data-cu-kill-term="${escapeHtmlText(t.id)}" title="Cerrar y terminar proceso del terminal">✕</button>`;
      }

      const closeCode = resolveTaskCloseCode(t);
      const prRowsHtml = renderTaskPrsHtml(t.id);
      const isSel = idx === cuState.selectedIdx;
      const isTermFocused = Boolean(focusedTaskId && t.id === focusedTaskId);
      const focusCardCls = isTermFocused
        ? ` is-term-focused${zoneIsTerm ? ' is-term-zone-live' : ''}`
        : '';
      htmlParts.push(`
        <li class="mdv-cu-task-item${isSel ? ' is-selected' : ''}${termCardCls}${focusCardCls}" data-cu-idx="${idx}" data-cu-task-id="${escapeHtmlText(t.id)}" data-cu-url="${escapeHtmlText(t.url)}">
          <div class="mdv-cu-task-top">
            <span class="mdv-cu-status-pill">
              <span class="mdv-cu-status-dot" style="background:${escapeHtmlText(t.statusColor || '#64748b')}"></span>
              <span>${escapeHtmlText(t.status)}</span>
            </span>
            <button type="button" class="mdv-cu-task-id" data-cu-copy-id="${escapeHtmlText(t.customId || t.id)}" title="Clic para copiar ID">${escapeHtmlText(badgeCode)}</button>
            <span class="mdv-cu-focus-pill" data-cu-focus-pill${isTermFocused ? '' : ' hidden'} title="El terminal de esta tarea está actualmente en foco">◉ En foco</span>
            <div class="mdv-cu-term-wrap">
              <button type="button" class="mdv-cu-claude-btn" data-cu-close-task="${escapeHtmlText(t.id)}" title="Abrir Claude en terminal con: /close-task ${escapeHtmlText(closeCode)}">✦ /close-task</button>
              ${termBadgeHtml}
              <button type="button" class="mdv-pane-btn mdv-cu-open-btn" data-cu-open-url="${escapeHtmlText(t.url)}" title="Abrir tarea en ClickUp">↗</button>
            </div>
          </div>
          <div class="mdv-cu-task-title">${escapeHtmlText(t.name)}</div>
          <div class="mdv-cu-pr-slot" data-cu-pr-slot${prRowsHtml ? '' : ' hidden'}>${prRowsHtml}</div>
          <div class="mdv-cu-task-meta">
            ${crumb ? `<span class="mdv-cu-list-crumb" title="${escapeHtmlText(crumb)}">${escapeHtmlText(crumb)}</span>` : ''}
            ${prioHtml}
            ${updated ? `<span>${escapeHtmlText(updated)}</span>` : ''}
            ${assigneesHtml ? `<span class="mdv-cu-assignees">${assigneesHtml}</span>` : ''}
          </div>
        </li>`);
    });

    cuTaskListEl.innerHTML = htmlParts.join('');
  }

  function moveClickUpSelection(delta) {
    if (!cuTaskListEl) return;
    const items = Array.from(cuTaskListEl.querySelectorAll('.mdv-cu-task-item'));
    if (!items.length) return;
    if (cuState.selectedIdx < 0) {
      cuState.selectedIdx = 0;
    } else {
      cuState.selectedIdx = Math.min(items.length - 1, Math.max(0, cuState.selectedIdx + delta));
    }
    items.forEach((li, i) => li.classList.toggle('is-selected', i === cuState.selectedIdx));
    items[cuState.selectedIdx]?.scrollIntoView({ block: 'nearest' });
  }

  function toggleSelectedClickUpTaskTerminal() {
    let sel = cuTaskListEl?.querySelector('.mdv-cu-task-item.is-selected');
    if (!sel) {
      moveClickUpSelection(0);
      sel = cuTaskListEl?.querySelector('.mdv-cu-task-item.is-selected');
    }
    const taskId = sel?.getAttribute('data-cu-task-id');
    const task = findClickUpTaskById(taskId);
    if (task) toggleTaskTerminal(task);
  }

  function openSelectedClickUpTask() {
    const sel = cuTaskListEl?.querySelector('.mdv-cu-task-item.is-selected');
    const url = sel?.getAttribute('data-cu-url');
    if (url) openExternalUrl(url);
  }

  async function refreshPinnedTasksSilently(alreadyFreshIds = new Set()) {
    const candidateIds = new Set([
      ...cuState.pinnedTasks.keys(),
      ...taskTerminals.keys()
    ]);
    const idsToLookup = Array.from(candidateIds)
      .filter((tid) => tid && !alreadyFreshIds.has(tid))
      .slice(0, 8);
    if (!idsToLookup.length) return;
    await Promise.allSettled(
      idsToLookup.map(async (tid) => {
        const cur = cuState.pinnedTasks.get(tid);
        const termPaneId = taskTerminals.get(tid);
        const termPane = termPaneId ? termPanes.get(termPaneId) : null;
        const queryKey = cur?.customId || termPane?.taskMeta?.code?.replace(/^#/, '') || tid;
        const params = new URLSearchParams({ q: queryKey });
        if (cuState.selectedTeamId) params.set('teamId', cuState.selectedTeamId);
        const res = await fetch(`/api/clickup/task-lookup?${params.toString()}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.found && data.task?.id) {
          cuState.pinnedTasks.set(data.task.id, data.task);
        }
      })
    );
  }

  async function loadClickUpTasks({
    reset = true,
    refreshMeta = false,
    silent = false,
    refreshPrs = false
  } = {}) {
    if (cuState.loading) return;
    cuState.loading = true;
    if (!silent && cuTasksErrorEl) cuTasksErrorEl.hidden = true;

    const prevFiltered = silent ? getFilteredClickUpTasks() : [];
    const prevSelectedTaskId =
      silent && cuState.selectedIdx >= 0 && cuState.selectedIdx < prevFiltered.length
        ? prevFiltered[cuState.selectedIdx]?.id || null
        : null;

    if (reset && !silent) {
      cuState.tasks = [];
      cuState.selectedIdx = -1;
      if (cuLoadingEl) cuLoadingEl.hidden = false;
      if (cuEmptyEl) cuEmptyEl.hidden = true;
      renderClickUpTasksList();
    }

    let fetchSucceeded = false;
    try {
      const params = new URLSearchParams();
      if (!reset) params.set('page', String(cuState.page + 1));
      if (cuState.selectedTeamId) params.set('teamId', cuState.selectedTeamId);
      if (refreshMeta) params.set('refreshMeta', 'true');

      const res = await fetch(`/api/clickup/tasks?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.unauthorized || res.status === 401) {
          cuState.connected = false;
          cuState.showingSettings = false;
          renderClickUpViewMode();
          if (cuAuthErrorEl) {
            cuAuthErrorEl.textContent = data.error || 'Sesión expirada. Reconecta tu cuenta.';
            cuAuthErrorEl.hidden = false;
          }
          return;
        }
        if (!silent && cuTasksErrorEl) {
          cuTasksErrorEl.textContent = data.error || 'No se pudieron obtener las tareas de ClickUp.';
          cuTasksErrorEl.hidden = false;
        }
        return;
      }

      fetchSucceeded = true;
      if (cuTasksErrorEl) cuTasksErrorEl.hidden = true;
      cuState.connected = true;
      cuState.page = data.page || 0;
      cuState.hasMore = Boolean(data.hasMore);
      if (data.teamId) cuState.selectedTeamId = data.teamId;
      if (data.user?.id != null) cuState.currentUserId = data.user.id;

      if (cuTeamSelect && Array.isArray(data.teams)) {
        cuTeamSelect.innerHTML = data.teams
          .map(
            (tm) =>
              `<option value="${escapeHtmlText(tm.id)}"${tm.id === cuState.selectedTeamId ? ' selected' : ''}>${escapeHtmlText(tm.name)}</option>`
          )
          .join('');
        cuTeamSelect.hidden = data.teams.length === 0;
      }

      if (cuUserBadgeEl) {
        cuUserBadgeEl.textContent = data.user?.username ? `@${data.user.username}` : '';
        cuUserBadgeEl.hidden = !data.user?.username;
      }

      const incoming = Array.isArray(data.tasks) ? data.tasks : [];
      cuState.tasks = reset ? incoming : [...cuState.tasks, ...incoming];
      if (reset) {
        await refreshPinnedTasksSilently(new Set(incoming.map((t) => t.id)));
      }

      if (silent && prevSelectedTaskId) {
        const nextFiltered = getFilteredClickUpTasks();
        cuState.selectedIdx = nextFiltered.findIndex((t) => t.id === prevSelectedTaskId);
      }
    } catch {
      if (!silent && cuTasksErrorEl) {
        cuTasksErrorEl.textContent = 'Error de conexión al consultar las tareas de ClickUp.';
        cuTasksErrorEl.hidden = false;
      }
    } finally {
      cuState.loading = false;
      if (cuLoadingEl) cuLoadingEl.hidden = true;
      if (!silent || fetchSucceeded) {
        renderClickUpViewMode();
        renderClickUpTasksList();
        fetchGitHubPrsForTasks(getActivePipelineTasks(), {
          refresh: Boolean(refreshMeta || refreshPrs || silent)
        });
      }
    }
  }

  const CU_LIVE_RELOAD_MS = 30000;
  let cuLastPollAt = Date.now();

  async function runSilentClickUpLiveReload() {
    if (!cuState.connected || !cuState.loadedOnce || cuState.loading) return;
    if (document.visibilityState === 'hidden') return;
    cuLastPollAt = Date.now();
    await loadClickUpTasks({ reset: true, silent: true, refreshPrs: true });
  }

  setInterval(() => {
    runSilentClickUpLiveReload();
  }, CU_LIVE_RELOAD_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - cuLastPollAt >= CU_LIVE_RELOAD_MS) {
      runSilentClickUpLiveReload();
    }
  });

  async function ensureClickUpBootstrapped() {
    if (cuState.loadedOnce) return;
    cuState.loadedOnce = true;
    renderClickUpViewMode();

    try {
      const res = await fetch('/api/clickup/status', { cache: 'no-store' });
      if (res.ok) {
        const st = await res.json();
        cuState.connected = Boolean(st.connected);
        cuState.hasSavedToken = Boolean(st.hasSavedToken);
        cuState.selectedTeamId = st.selectedTeamId || cuState.selectedTeamId;
      }
    } catch {}

    renderClickUpViewMode();
    if (cuState.connected) {
      await loadClickUpTasks({ reset: true });
    }
  }

  cuOpenAppsBtn?.addEventListener('click', () => {
    openExternalUrl('https://app.clickup.com/settings/apps');
  });

  async function submitClickUpToken() {
    if (cuAuthErrorEl) cuAuthErrorEl.hidden = true;
    const apiToken = (cuTokenInput?.value || '').trim();
    if (!apiToken && !cuState.hasSavedToken) {
      if (cuAuthErrorEl) {
        cuAuthErrorEl.textContent = 'Pega tu Personal API Token (pk_...) de ClickUp.';
        cuAuthErrorEl.hidden = false;
      }
      cuTokenInput?.focus();
      return;
    }

    if (cuConnectBtn) {
      cuConnectBtn.disabled = true;
      cuConnectBtn.textContent = 'Verificando...';
    }
    try {
      const res = await fetch('/api/clickup/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (cuAuthErrorEl) {
          cuAuthErrorEl.textContent = data.error || 'No se pudo validar el token en ClickUp.';
          cuAuthErrorEl.hidden = false;
        }
        return;
      }
      cuState.connected = true;
      cuState.hasSavedToken = true;
      cuState.showingSettings = false;
      if (data.selectedTeamId) cuState.selectedTeamId = data.selectedTeamId;
      if (cuTokenInput) cuTokenInput.value = '';
      renderClickUpViewMode();
      showToast('¡ClickUp conectado!');
      await loadClickUpTasks({ reset: true });
    } catch {
      if (cuAuthErrorEl) {
        cuAuthErrorEl.textContent = 'Error local al conectar con ClickUp.';
        cuAuthErrorEl.hidden = false;
      }
    } finally {
      if (cuConnectBtn) {
        cuConnectBtn.disabled = false;
        cuConnectBtn.textContent = 'Conectar cuenta';
      }
    }
  }

  cuConnectBtn?.addEventListener('click', submitClickUpToken);
  cuTokenInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitClickUpToken();
    }
  });

  cuOnlyTermsBtn?.addEventListener('click', () => {
    cuState.onlyWithTerminal = !cuState.onlyWithTerminal;
    localStorage.setItem('mdv-cu-only-terms', cuState.onlyWithTerminal ? '1' : '0');
    cuState.selectedIdx = -1;
    if (cuState.showingSettings) {
      cuState.showingSettings = false;
      renderClickUpViewMode();
    }
    renderClickUpTasksList();
    showToast(cuState.onlyWithTerminal ? 'Filtro: solo con terminal' : 'Filtro: todas las tareas');
  });

  cuSettingsBtn?.addEventListener('click', () => {
    cuState.showingSettings = !cuState.showingSettings;
    renderClickUpViewMode();
  });

  cuBackTasksBtn?.addEventListener('click', () => {
    cuState.showingSettings = false;
    renderClickUpViewMode();
  });

  cuDisconnectBtn?.addEventListener('click', async () => {
    await fetch('/api/clickup/disconnect', { method: 'POST' }).catch(() => {});
    cuState.connected = false;
    cuState.hasSavedToken = false;
    cuState.showingSettings = false;
    cuState.tasks = [];
    if (cuCountChipEl) cuCountChipEl.hidden = true;
    renderClickUpViewMode();
    renderClickUpTasksList();
    showToast('Cuenta de ClickUp desconectada');
  });

  cuRefreshBtn?.addEventListener('click', () => {
    if (cuState.connected) {
      cuState.showingSettings = false;
      renderClickUpViewMode();
      loadClickUpTasks({ reset: true, refreshMeta: true });
    } else {
      ensureClickUpBootstrapped();
    }
  });

  cuTeamSelect?.addEventListener('change', () => {
    cuState.selectedTeamId = cuTeamSelect.value;
    loadClickUpTasks({ reset: true });
  });

  cuAssigneeTabsEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cu-assignee]');
    if (!btn) return;
    const nextAssignee = btn.getAttribute('data-cu-assignee') || 'all';
    if (cuState.assigneeFilter === nextAssignee) return;
    cuState.assigneeFilter = nextAssignee;
    localStorage.setItem('mdv-cu-assignee', nextAssignee);
    cuState.selectedIdx = -1;
    renderClickUpAssigneeTabs();
    renderClickUpTasksList();
  });

  termNewDefaultBtn?.addEventListener('click', () => {
    splitTerminalPane(null, 'vertical');
  });

  let cuLookupTimer = null;

  async function lookupClickUpTaskById(rawInput, { announceNotFound = false } = {}) {
    const token = extractClientTaskIdToken(rawInput);
    if (!token || !cuState.connected) {
      if (announceNotFound) showToast('Ingresa un ID o URL válido de ClickUp');
      return;
    }

    // If already present locally, just highlight it
    const existing = getMergedAllKnownTasks().find(
      (t) =>
        String(t.id || '').toLowerCase() === token.toLowerCase() ||
        String(t.customId || '').toLowerCase() === token.toLowerCase()
    );
    if (existing) {
      cuState.pinnedTasks.set(existing.id, existing);
      cuState.selectedIdx = 0;
      renderClickUpTasksList();
      return;
    }

    cuState.lookupLoading = true;
    cuState.lastLookupKey = token.toLowerCase();
    if (cuLookupBtn) cuLookupBtn.disabled = true;
    renderClickUpTasksList();

    try {
      const params = new URLSearchParams({ q: rawInput.trim() });
      if (cuState.selectedTeamId) params.set('teamId', cuState.selectedTeamId);
      const res = await fetch(`/api/clickup/task-lookup?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.found && data.task?.id) {
        cuState.pinnedTasks.set(data.task.id, data.task);
        cuState.selectedIdx = 0;
        fetchGitHubPrsForTasks([data.task], { refresh: false });
        showToast(`Tarea encontrada: ${data.task.customId || '#' + data.task.id}`);
      } else if (announceNotFound) {
        showToast(`No se encontró la tarea "${token}" en ClickUp`);
      }
    } catch {
      if (announceNotFound) showToast('Error al buscar tarea en ClickUp');
    } finally {
      cuState.lookupLoading = false;
      if (cuLookupBtn) cuLookupBtn.disabled = false;
      renderClickUpTasksList();
    }
  }

  cuSearchInput?.addEventListener('input', () => {
    clearTimeout(cuLookupTimer);
    cuState.selectedIdx = -1;
    renderClickUpTasksList();

    const val = (cuSearchInput.value || '').trim();
    if (val && getFilteredClickUpTasks().length === 0 && looksLikeTaskIdOrUrl(val)) {
      const key = extractClientTaskIdToken(val).toLowerCase();
      if (key && key !== cuState.lastLookupKey) {
        cuLookupTimer = setTimeout(() => {
          lookupClickUpTaskById(val, { announceNotFound: false });
        }, 380);
      }
    } else if (!val) {
      cuState.lastLookupKey = '';
    }
  });

  cuSearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(cuLookupTimer);
      const val = (cuSearchInput.value || '').trim();
      const currentFiltered = getFilteredClickUpTasks();
      if (currentFiltered.length === 1 && extractClientTaskIdToken(val)) {
        // Pressing Enter again when the looked-up task is already shown toggles its terminal!
        toggleTaskTerminal(currentFiltered[0]);
      } else if (val) {
        lookupClickUpTaskById(val, { announceNotFound: true });
      }
    }
  });

  cuLookupBtn?.addEventListener('click', () => {
    clearTimeout(cuLookupTimer);
    const val = (cuSearchInput?.value || '').trim();
    if (!val) {
      cuSearchInput?.focus();
      return;
    }
    lookupClickUpTaskById(val, { announceNotFound: true });
  });

  cuLoadMoreBtn?.addEventListener('click', () => {
    loadClickUpTasks({ reset: false });
  });

  cuTaskListEl?.addEventListener('click', async (e) => {
    const closeTaskBtn = e.target.closest('[data-cu-close-task]');
    if (closeTaskBtn) {
      e.stopPropagation();
      const taskId = closeTaskBtn.getAttribute('data-cu-close-task');
      const task = findClickUpTaskById(taskId);
      if (task) launchClaudeCloseTask(task);
      return;
    }
    const killBtn = e.target.closest('[data-cu-kill-term]');
    if (killBtn) {
      e.stopPropagation();
      const taskId = killBtn.getAttribute('data-cu-kill-term');
      const pid = taskId ? taskTerminals.get(taskId) : null;
      if (pid) closeTerminalPane(pid);
      return;
    }
    const copyBtn = e.target.closest('[data-cu-copy-id]');
    if (copyBtn) {
      e.stopPropagation();
      const idText = copyBtn.getAttribute('data-cu-copy-id') || '';
      await navigator.clipboard.writeText(idText);
      showToast(`Copiado: ${idText}`);
      return;
    }
    const openEl = e.target.closest('[data-cu-open-url]');
    if (openEl) {
      e.stopPropagation();
      const url = openEl.getAttribute('data-cu-open-url');
      if (url) openExternalUrl(url);
      return;
    }
    const cardEl = e.target.closest('.mdv-cu-task-item[data-cu-task-id]');
    if (cardEl) {
      const idx = Number(cardEl.getAttribute('data-cu-idx') ?? -1);
      if (idx >= 0) cuState.selectedIdx = idx;
      const taskId = cardEl.getAttribute('data-cu-task-id');
      const task = findClickUpTaskById(taskId);
      if (task) toggleTaskTerminal(task);
    }
  });

  function connectEvents() {
    const es = new EventSource('/events');
    es.onopen = () => liveDotEl?.classList.remove('is-disconnected');
    es.onerror = () => liveDotEl?.classList.add('is-disconnected');
    es.addEventListener('reload', (ev) => {
      let payload = {};
      try { payload = JSON.parse(ev.data || '{}'); } catch {}

      if (payload.reason === 'tree') {
        const md = activeMdPane();
        if (md) {
          loadDocumentInPane(md.id, md.filePath || '', { preserveScroll: true, isLiveReload: false });
        }
        return;
      }
      const changed = payload.file;
      for (const mp of mdPanes.values()) {
        if (mp.filePath && (!changed || mp.filePath === changed)) {
          loadDocumentInPane(mp.id, mp.filePath, { preserveScroll: true, isLiveReload: true });
        }
      }
    });
  }

  // =========================================================================
  // BOOT:
  //   1) Principal WSL Terminal Pane ALWAYS open & focused on the Left (#mdv-term-zone)
  //      — restores saved workspace terminal split tree & task terminals when present!
  //   2) Tabbed Side Panel on the Right (#mdv-side-zone: [Markdown | Clickup])
  // =========================================================================
  function restoreTermTreeNode(savedNode) {
    if (!savedNode || typeof savedNode !== 'object') return null;
    if (savedNode.type === 'pane') {
      if (!savedNode.id || termPanes.has(savedNode.id)) return null;
      const pane = createTerminalPane({
        id: savedNode.id,
        cwd: savedNode.cwd || '',
        explicitCwd: Boolean(savedNode.explicitCwd),
        taskMeta: savedNode.taskMeta || null,
        worktreeMeta: savedNode.worktreeMeta || null
      });
      if (pane.taskMeta?.id && !pane.worktreeMeta) {
        taskTerminals.set(pane.taskMeta.id, pane.id);
      }
      return pane;
    }
    if (savedNode.type === 'split') {
      const first = restoreTermTreeNode(savedNode.first);
      const second = restoreTermTreeNode(savedNode.second);
      if (first && second) {
        return buildSplitBranch(first, second, savedNode.direction, savedNode.ratio);
      }
      return first || second || null;
    }
    return null;
  }

  function restoreWorkspaceTerminals(saved) {
    if (!saved || typeof saved !== 'object') return false;
    const hasSavedTree = Boolean(saved.termTree);
    const hasSavedHidden = Array.isArray(saved.hiddenTerms) && saved.hiddenTerms.length > 0;
    if (!hasSavedTree && !hasSavedHidden) return false;

    if (typeof saved.nextNodeSeq === 'number' && Number.isFinite(saved.nextNodeSeq)) {
      nextNodeSeq = Math.max(nextNodeSeq, Math.floor(saved.nextNodeSeq));
    }

    if (Array.isArray(saved.pinnedTasks)) {
      for (const pt of saved.pinnedTasks) {
        if (pt?.id) {
          cuState.pinnedTasks.set(pt.id, pt);
        }
      }
    }

    const restoredRoot = saved.termTree ? restoreTermTreeNode(saved.termTree) : null;
    if (restoredRoot) {
      termRootTree = restoredRoot;
      termRootTree.el.style.flex = '1 1 100%';
      termZoneEl.appendChild(termRootTree.el);
    }

    if (hasSavedHidden) {
      for (const ht of saved.hiddenTerms) {
        if (!ht?.id || termPanes.has(ht.id)) continue;
        const hp = createTerminalPane({
          id: ht.id,
          cwd: ht.cwd || '',
          explicitCwd: Boolean(ht.explicitCwd),
          taskMeta: ht.taskMeta || null,
          worktreeMeta: ht.worktreeMeta || null
        });
        hp.isHidden = true;
        termParkEl?.appendChild(hp.el);
        if (hp.taskMeta?.id && !hp.worktreeMeta) {
          taskTerminals.set(hp.taskMeta.id, hp.id);
        }
      }
    }

    if (termPanes.size === 0) return false;

    for (const tp of termPanes.values()) {
      tp.boot();
    }

    const reqFocus = saved.focusedTermPaneId ? termPanes.get(saved.focusedTermPaneId) : null;
    const initialLeaf = (reqFocus && !reqFocus.isHidden ? reqFocus : null) || firstLeafPane(termRootTree);
    focusedTermPaneId = initialLeaf ? initialLeaf.id : null;
    return true;
  }

  if (initCfg.maximized) {
    try {
      if (window.outerWidth < screen.availWidth - 24 || window.outerHeight < screen.availHeight - 24) {
        window.moveTo(screen.availLeft || 0, screen.availTop || 0);
        window.resizeTo(screen.availWidth, screen.availHeight);
      }
    } catch {}
  }

  workspaceRestoring = true;

  const rootMdPane = createMarkdownPane({
    filePath: initCfg.currentFile || '',
    relPath: initCfg.initialRelPath || 'Sin .md',
    html: initialHtml,
    toc: initCfg.initialToc || []
  });
  mdRootTree = rootMdPane;
  mdZoneEl.appendChild(rootMdPane.el);
  focusedMdPaneId = rootMdPane.id;

  const savedWs = initCfg.savedWorkspaceState || null;
  const restoredTerms = restoreWorkspaceTerminals(savedWs);
  if (!restoredTerms) {
    const rootTermPane = createTerminalPane();
    termRootTree = rootTermPane;
    termZoneEl.appendChild(rootTermPane.el);
    focusedTermPaneId = rootTermPane.id;
    rootTermPane.boot();
  }

  applyZoom(zoomPercent, false);
  initCarouselsForPane(rootMdPane);
  renderMermaidDiagrams(rootMdPane.article).then(() => initHorizontalBlockScrollbars(rootMdPane.article));
  initHorizontalBlockScrollbars(rootMdPane.article);
  refreshHeadings(rootMdPane);
  updateFileTreeMarkers();

  const explicitDocPassed = (!initCfg.dirMode && Boolean(initCfg.currentFile)) || Boolean(initCfg.splitFile);
  const initialTab = explicitDocPassed
    ? 'markdown'
    : savedWs?.activeSideTab || localStorage.getItem('mdv-side-tab') || 'markdown';
  if (!explicitDocPassed && savedWs?.sideZoneHidden) {
    document.body.classList.add('hide-side-zone');
    localStorage.setItem('mdv-hide-side', '1');
  }
  if (initialTab === 'clickup') {
    if (savedWs?.sideZoneHidden && !explicitDocPassed) {
      activeSideTab = 'clickup';
      sideZoneEl?.setAttribute('data-active-tab', 'clickup');
      if (tabMarkdownPanelEl) tabMarkdownPanelEl.hidden = true;
      if (tabClickupPanelEl) tabClickupPanelEl.hidden = false;
      if (mdToolbarEl) mdToolbarEl.hidden = true;
      if (cuToolbarEl) cuToolbarEl.hidden = false;
      syncTabButtonsUi();
      ensureClickUpBootstrapped();
    } else {
      switchSideTab('clickup', { focusTab: false, announce: false });
    }
  } else {
    syncTabButtonsUi();
    if (cuState.connected) {
      setTimeout(() => {
        if (cuState.connected && !cuState.loadedOnce) {
          ensureClickUpBootstrapped();
        }
      }, 800);
    }
  }

  workspaceRestoring = false;

  // Principal view is always Terminals!
  postNativeWin(`title:${document.title}`);
  if (focusedTermPaneId) {
    setFocusZone('terminal', focusedTermPaneId, false);
  }
  updateZoneCounts();
  scheduleSaveWorkspaceState();
  refreshTaskTerminalWorktrees();
  connectEvents();

  if (initCfg.splitFile) {
    splitMarkdownPane(rootMdPane.id, initCfg.splitDirection || 'vertical', initCfg.splitFile).then(() => {
      if (focusedTermPaneId) {
        setFocusZone('terminal', focusedTermPaneId, false);
      }
    });
  }
})();
