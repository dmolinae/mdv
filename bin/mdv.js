#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderMarkdownDocument } from '../src/renderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const NODE_MODULES_DIR = path.join(ROOT_DIR, 'node_modules');

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'target',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  '__pycache__',
  'venv',
  '.venv',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.cargo',
  '.rustup',
  '.npm',
  '.npm-global',
  '.local',
  '.claude',
  '.gemini',
  '.cursor-server',
  '.antigravity-server',
  '.oh-my-zsh'
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

function printHelp() {
  console.log(`mdv 1.2.0 — Visor moderno de Markdown con explorador recursivo, Carousel, Mermaid, Vim y Live-Reload

Uso:
  mdv                         Abre la carpeta actual y explora todos los .md en subcarpetas
  mdv <carpeta | archivo.md>  Abre una carpeta o archivo específico
  cat archivo.md | mdv        Renderiza entrada estándar

Opciones:
  -t, --theme <nombre>   Tema inicial: tokyo (default), github-dark, catppuccin, light
  -b, --browser          Abrir en pestaña normal del navegador (en vez de ventana --app)
      --no-open          No abrir ventana automáticamente (solo imprimir URL)
      --fg               Mantener el servidor en primer plano en la terminal
      --keep-alive       No apagar el servidor automáticamente al cerrar la ventana
  -p, --port <puerto>    Puerto local (por defecto asigna uno libre automáticamente)
      --update           Actualizar mdv desde GitHub a la última versión
  -h, --help             Mostrar esta ayuda
  -V, --version          Mostrar versión`);
}

function parseArgs(argv) {
  const opts = {
    target: null,
    workspace: null,
    dirMode: false,
    theme: 'tokyo',
    appMode: true,
    open: true,
    foreground: false,
    keepAlive: false,
    port: 0,
    serverChild: false,
    stdinFile: null
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
    if (arg === '-V' || arg === '--version') {
      console.log('mdv 1.2.0');
      process.exit(0);
    }
    if (arg === '--update') {
      try {
        console.log(`Actualizando mdv en ${ROOT_DIR}...`);
        execSync('git pull --ff-only && npm install --omit=dev --no-audit --no-fund', {
          cwd: ROOT_DIR,
          stdio: 'inherit'
        });
        console.log('✓ mdv actualizado correctamente.');
        process.exit(0);
      } catch (err) {
        console.error('Error al actualizar mdv:', err.message);
        process.exit(1);
      }
    }
    if (arg === '-b' || arg === '--browser') opts.appMode = false;
    else if (arg === '--no-open') opts.open = false;
    else if (arg === '--fg') opts.foreground = true;
    else if (arg === '--keep-alive') opts.keepAlive = true;
    else if (arg === '--server-child') opts.serverChild = true;
    else if (arg === '--dir-mode') opts.dirMode = true;
    else if (arg === '--workspace' && argv[i + 1]) opts.workspace = argv[++i];
    else if ((arg === '-t' || arg === '--theme') && argv[i + 1]) opts.theme = argv[++i];
    else if ((arg === '-p' || arg === '--port') && argv[i + 1]) opts.port = Number(argv[++i]) || 0;
    else if (arg === '--stdin-file' && argv[i + 1]) opts.stdinFile = argv[++i];
    else if (!arg.startsWith('-') && !opts.target) opts.target = arg;
  }
  return opts;
}

function escapeHtmlAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Recursively scans rootDir for all .md / .markdown files across subfolders,
 * returning a flat ordered list with relative paths + a nested tree structure.
 */
export function scanMarkdownWorkspace(rootDir, { maxDepth = 8, maxFiles = 1500 } = {}) {
  const files = [];

  function walk(currentDir, depth) {
    if (depth > maxDepth || files.length >= maxFiles) return null;
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return null;
    }

    const dirs = [];
    const mdFiles = [];

    for (const entry of entries) {
      const name = entry.name;
      if (entry.isDirectory()) {
        if (name.startsWith('.') || IGNORED_DIRS.has(name)) continue;
        dirs.push(entry);
      } else if (entry.isFile() && /\.(md|markdown)$/i.test(name)) {
        mdFiles.push(entry);
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    mdFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const childNodes = [];

    // Folders first (like VS Code / standard file explorers), only kept if they contain .md files
    for (const d of dirs) {
      if (files.length >= maxFiles) break;
      const fullSubDir = path.join(currentDir, d.name);
      const subTree = walk(fullSubDir, depth + 1);
      if (subTree && subTree.count > 0) {
        childNodes.push(subTree);
      }
    }

    // Then Markdown files in this folder
    for (const f of mdFiles) {
      if (files.length >= maxFiles) break;
      const fullPath = path.join(currentDir, f.name);
      const relPath = path.relative(rootDir, fullPath).split(path.sep).join('/');
      const fileEntry = {
        type: 'file',
        name: f.name,
        relPath,
        fullPath
      };
      files.push(fileEntry);
      childNodes.push(fileEntry);
    }

    const totalCount = childNodes.reduce((sum, n) => sum + (n.type === 'dir' ? n.count : 1), 0);
    return {
      type: 'dir',
      name: path.basename(currentDir) || currentDir,
      relPath: path.relative(rootDir, currentDir).split(path.sep).join('/'),
      fullPath: currentDir,
      count: totalCount,
      children: childNodes
    };
  }

  const tree = walk(rootDir, 0) || { type: 'dir', name: path.basename(rootDir), relPath: '', count: 0, children: [] };
  return { tree, files };
}

function renderTreeNodesHtml(nodes, activeFilePath) {
  return nodes
    .map((node) => {
      if (node.type === 'dir') {
        const containsActive =
          activeFilePath === node.fullPath || activeFilePath.startsWith(node.fullPath + path.sep);
        const openAttr = containsActive || nodes.length <= 6 ? ' open' : '';
        return `
          <li class="mdv-tree-dir" data-dir-path="${escapeHtmlAttr(node.relPath)}">
            <details class="mdv-folder-details"${openAttr}>
              <summary class="mdv-folder-summary">
                <svg class="mdv-chevron" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 4 4-4 4"/></svg>
                <svg class="mdv-folder-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>
                <span class="mdv-folder-name">${escapeHtmlAttr(node.name)}</span>
                <span class="mdv-folder-count">${node.count}</span>
              </summary>
              <ul class="mdv-tree-children">
                ${renderTreeNodesHtml(node.children, activeFilePath)}
              </ul>
            </details>
          </li>`;
      }

      const isCurrent = node.fullPath === activeFilePath;
      return `
        <li class="mdv-file-item${isCurrent ? ' is-current' : ''}" data-file-path="${escapeHtmlAttr(node.fullPath)}" data-rel-path="${escapeHtmlAttr(node.relPath.toLowerCase())}">
          <a href="/?file=${encodeURIComponent(node.fullPath)}" data-md-link title="${escapeHtmlAttr(node.relPath)}">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" style="flex-shrink:0;opacity:0.72"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688Z"/></svg>
            <span class="mdv-file-label">${escapeHtmlAttr(node.name)}</span>
          </a>
        </li>`;
    })
    .join('');
}

function pickDefaultMarkdownFile(files, rootDir) {
  if (files.length === 0) return null;
  // 1. Root README.md
  const rootReadme = files.find(
    (f) => path.dirname(f.fullPath) === rootDir && /^readme\.(md|markdown)$/i.test(f.name)
  );
  if (rootReadme) return rootReadme.fullPath;
  // 2. Any root .md file
  const rootMd = files.find((f) => path.dirname(f.fullPath) === rootDir);
  if (rootMd) return rootMd.fullPath;
  // 3. Shallowest README.md in subfolders
  const anyReadme = [...files]
    .filter((f) => /^readme\.(md|markdown)$/i.test(f.name))
    .sort((a, b) => a.relPath.split('/').length - b.relPath.split('/').length)[0];
  if (anyReadme) return anyReadme.fullPath;
  // 4. First discovered .md file
  return files[0].fullPath;
}

function resolveInitialTarget(targetArg, explicitWorkspace) {
  const cwd = process.cwd();
  const raw = targetArg ? path.resolve(targetArg) : cwd;
  if (!fs.existsSync(raw)) {
    console.error(`Error: no existe '${targetArg}'`);
    process.exit(1);
  }
  const stat = fs.statSync(raw);
  if (stat.isDirectory()) {
    const { files } = scanMarkdownWorkspace(raw);
    if (files.length === 0) {
      console.error(`No se encontraron archivos .md en '${raw}' ni en sus subcarpetas.`);
      process.exit(1);
    }
    return {
      initialFile: pickDefaultMarkdownFile(files, raw),
      workspaceDir: raw,
      isDirectoryTarget: true
    };
  }

  // File target: if explicitWorkspace given, use it; else if file is inside cwd (and cwd isn't filesystem root), use cwd or file's parent
  let workspaceDir = explicitWorkspace ? path.resolve(explicitWorkspace) : path.dirname(raw);
  if (!explicitWorkspace && raw.startsWith(cwd + path.sep) && cwd !== '/' && cwd !== process.env.HOME) {
    workspaceDir = cwd;
  }
  return {
    initialFile: raw,
    workspaceDir,
    isDirectoryTarget: false
  };
}

function findWindowsBrowser() {
  const candidates = [
    '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'
  ];
  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

function launchWindow(url, appMode) {
  const browser = findWindowsBrowser();
  if (browser && appMode) {
    const child = spawn(browser, [`--app=${url}`, '--window-size=1340,860'], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return;
  }
  if (browser && !appMode) {
    const child = spawn(browser, [url], { detached: true, stdio: 'ignore' });
    child.unref();
    return;
  }
  if (fs.existsSync('/mnt/c/WINDOWS/system32/cmd.exe')) {
    const child = spawn('/mnt/c/WINDOWS/system32/cmd.exe', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return;
  }
  // Native Linux / macOS fallback
  const fallbackCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  try {
    const child = spawn(fallbackCmd, [url], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {}
}

function computeFileSignature(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha1').update(buf).digest('hex');
  } catch {
    return null;
  }
}

function buildHtmlShell({ filePath, workspaceDir, dirMode, html, toc, title, defaultTheme }) {
  const relDisplay = path.relative(workspaceDir, filePath).split(path.sep).join('/') || path.basename(filePath);
  const workspaceName = path.basename(workspaceDir) || workspaceDir;
  const { tree, files } = scanMarkdownWorkspace(workspaceDir);
  const showSidebarByDefault = dirMode || files.length > 1;
  const hideFilesClass = showSidebarByDefault ? '' : 'hide-files';

  const treeHtml = renderTreeNodesHtml(tree.children, filePath);

  const tocHtml = toc
    .map(
      (item) =>
        `<li class="mdv-toc-item mdv-toc-level-${item.level}" data-toc-id="${item.id}"><a href="#${item.id}">${item.text}</a></li>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es" data-theme="${defaultTheme}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtmlAttr(title || path.basename(filePath))} — mdv</title>
  <link rel="stylesheet" href="/vendor/katex/katex.min.css" />
  <link rel="stylesheet" href="/assets/styles.css" />
</head>
<body class="${hideFilesClass}">
  <header class="mdv-topbar">
    <div class="mdv-topbar-left">
      <button type="button" id="mdv-toggle-files" class="mdv-tool-btn${showSidebarByDefault ? ' is-active' : ''}" title="Explorador de archivos (e)">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75C0 1.784.784 1 1.75 1ZM1.5 2.75v10.5c0 .138.112.25.25.25H5v-11H1.75a.25.25 0 0 0-.25.25Zm5 10.75h7.75a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25H6.5Z"/></svg>
        <span>Archivos</span>
        <span id="mdv-total-files" class="mdv-count-chip">${files.length}</span>
      </button>
      <div class="mdv-file-badge">
        <span id="mdv-live-dot" class="mdv-live-dot" title="Live-reload activo"></span>
        <span class="mdv-workspace-crumb">${escapeHtmlAttr(workspaceName)} /</span>
        <strong id="mdv-filename">${escapeHtmlAttr(relDisplay)}</strong>
        <span id="mdv-reload-pill" class="mdv-reload-pill" hidden>Actualizado</span>
      </div>
    </div>
    <div class="mdv-topbar-right">
      <button type="button" id="mdv-open-search" class="mdv-tool-btn" title="Buscar en documento (/)">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/></svg>
        <span>/</span>
      </button>
      <button type="button" id="mdv-toggle-wide" class="mdv-tool-btn" title="Alternar ancho de lectura (w)">Ancho</button>
      <select id="mdv-theme-select" class="mdv-theme-select" aria-label="Tema visual" title="Cambiar tema (c)">
        <option value="tokyo">Tokyo Night</option>
        <option value="github-dark">GitHub Dark</option>
        <option value="catppuccin">Catppuccin</option>
        <option value="light">Claro (Paper)</option>
      </select>
      <button type="button" id="mdv-toggle-toc" class="mdv-tool-btn is-active" title="Mostrar/ocultar Índice (t)">Índice</button>
      <button type="button" id="mdv-open-help" class="mdv-tool-btn" title="Atajos estilo Vim (?)">?</button>
    </div>
  </header>

  <div class="mdv-layout">
    <aside class="mdv-sidebar-files">
      <div class="mdv-explorer-header">
        <h2 class="mdv-panel-title" title="${escapeHtmlAttr(workspaceDir)}">${escapeHtmlAttr(workspaceName)}</h2>
        <div class="mdv-explorer-actions">
          <button type="button" id="mdv-tree-expand-all" class="mdv-mini-btn" title="Expandir subcarpetas">+</button>
          <button type="button" id="mdv-tree-collapse-all" class="mdv-mini-btn" title="Colapsar subcarpetas">−</button>
        </div>
      </div>
      <div class="mdv-file-filter-wrap">
        <input id="mdv-file-filter" type="text" placeholder="Filtrar .md... (Ctrl+P)" autocomplete="off" spellcheck="false" />
      </div>
      <ul id="mdv-file-list" class="mdv-file-tree">${treeHtml}</ul>
    </aside>

    <main class="mdv-main">
      <article id="mdv-article" class="mdv-article">${html}</article>
    </main>

    <aside class="mdv-sidebar-toc">
      <h2 class="mdv-panel-title">En esta página</h2>
      <ul id="mdv-toc-list" class="mdv-toc-list">${tocHtml}</ul>
    </aside>
  </div>

  <!-- Vim Search Bar (/) -->
  <div id="mdv-search-bar" class="mdv-search-bar" hidden>
    <span class="mdv-search-Slash">/</span>
    <input id="mdv-search-input" type="text" placeholder="Buscar en documento... (Enter fijar, n/N navegar, Esc cerrar)" autocomplete="off" spellcheck="false" />
    <span id="mdv-search-count" class="mdv-search-count">0 / 0</span>
    <button type="button" id="mdv-search-prev" class="mdv-icon-btn" title="Anterior (N)">N</button>
    <button type="button" id="mdv-search-next" class="mdv-icon-btn" title="Siguiente (n)">n</button>
    <button type="button" id="mdv-search-close" class="mdv-icon-btn" title="Cerrar (Esc)">Esc</button>
  </div>

  <!-- Vim HUD -->
  <div class="mdv-vim-hud">
    <span id="mdv-vim-toast" class="mdv-vim-toast" hidden></span>
    <span id="mdv-vim-keys" class="mdv-vim-keys" hidden></span>
    <span id="mdv-vim-pos" class="mdv-vim-pos">TOP</span>
  </div>

  <!-- Modal -->
  <div id="mdv-modal" class="mdv-modal" hidden>
    <div id="mdv-modal-body" class="mdv-modal-content"></div>
  </div>

  <script>
    window.__MDV_INITIAL__ = ${JSON.stringify({
      currentFile: filePath,
      workspaceDir,
      dirMode: Boolean(dirMode),
      defaultTheme
    })};
  </script>
  <script src="/vendor/mermaid/mermaid.min.js"></script>
  <script src="/assets/app.js"></script>
</body>
</html>`;
}

async function readStdinToTempFile() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const content = Buffer.concat(chunks).toString('utf8');
  const tmpFile = path.join('/tmp', `mdv-stdin-${process.pid}.md`);
  fs.writeFileSync(tmpFile, content, 'utf8');
  return tmpFile;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.target && !opts.stdinFile && !process.stdin.isTTY) {
    opts.stdinFile = await readStdinToTempFile();
    opts.target = opts.stdinFile;
  } else if (opts.stdinFile) {
    opts.target = opts.stdinFile;
  }

  const { initialFile, workspaceDir, isDirectoryTarget } = resolveInitialTarget(opts.target, opts.workspace);
  const effectiveDirMode = opts.dirMode || isDirectoryTarget;

  if (!opts.foreground && !opts.serverChild && opts.open) {
    const forwardArgs = [
      fileURLToPath(import.meta.url),
      initialFile,
      '--workspace',
      workspaceDir,
      '--server-child',
      '--theme',
      opts.theme
    ];
    if (effectiveDirMode) forwardArgs.push('--dir-mode');
    if (!opts.appMode) forwardArgs.push('--browser');
    if (opts.keepAlive) forwardArgs.push('--keep-alive');
    if (opts.port) forwardArgs.push('--port', String(opts.port));
    if (opts.stdinFile) forwardArgs.push('--stdin-file', opts.stdinFile);

    const bg = spawn(process.execPath, forwardArgs, {
      detached: true,
      stdio: 'ignore'
    });
    bg.unref();
    const label = effectiveDirMode
      ? `carpeta ${path.basename(workspaceDir)} (${path.relative(workspaceDir, initialFile) || path.basename(initialFile)})`
      : path.basename(initialFile);
    console.log(`Abriendo ${label} en ventana mdv...`);
    process.exit(0);
  }

  let activeFile = initialFile;
  let lastSignature = computeFileSignature(activeFile);
  let lastTreeCount = scanMarkdownWorkspace(workspaceDir).files.length;
  const sseClients = new Set();
  let hadClient = false;
  let shutdownTimer = null;
  let dirWatcher = null;
  let debounceTimer = null;

  function broadcastReload(reason = 'change') {
    const payload = JSON.stringify({ file: activeFile, reason, ts: Date.now() });
    for (const res of sseClients) {
      res.write(`event: reload\ndata: ${payload}\n\n`);
    }
  }

  function checkActiveFileChanged() {
    const sig = computeFileSignature(activeFile);
    if (sig && sig !== lastSignature) {
      lastSignature = sig;
      broadcastReload('content');
    }
  }

  function watchTarget(filePath) {
    const dirToWatch = path.dirname(filePath);
    if (dirWatcher) {
      try { dirWatcher.close(); } catch {}
      dirWatcher = null;
    }
    lastSignature = computeFileSignature(filePath);

    try {
      dirWatcher = fs.watch(dirToWatch, { persistent: false }, () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          checkActiveFileChanged();
        }, 65);
      });
    } catch {}
  }

  const pollTimer = setInterval(() => {
    if (sseClients.size > 0) {
      checkActiveFileChanged();
    }
  }, 350);
  pollTimer.unref();

  // Periodically check if new/deleted .md files appeared anywhere in workspaceDir subfolders
  const treePollTimer = setInterval(() => {
    if (sseClients.size > 0) {
      const count = scanMarkdownWorkspace(workspaceDir).files.length;
      if (count !== lastTreeCount) {
        lastTreeCount = count;
        broadcastReload('tree');
      }
    }
  }, 2000);
  treePollTimer.unref();

  const heartbeatTimer = setInterval(() => {
    for (const res of sseClients) {
      res.write(': ping\n\n');
    }
  }, 15000);
  heartbeatTimer.unref();

  watchTarget(activeFile);

  function serveStaticFile(res, fullPath) {
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(fullPath).pipe(res);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      hadClient = true;
      if (shutdownTimer) {
        clearTimeout(shutdownTimer);
        shutdownTimer = null;
      }

      req.on('close', () => {
        sseClients.delete(res);
        if (hadClient && sseClients.size === 0 && !opts.keepAlive) {
          shutdownTimer = setTimeout(() => {
            if (sseClients.size === 0) {
              if (opts.stdinFile) {
                try { fs.unlinkSync(opts.stdinFile); } catch {}
              }
              process.exit(0);
            }
          }, 3500);
        }
      });
      return;
    }

    if (url.pathname === '/api/doc') {
      const requested = url.searchParams.get('file') || activeFile;
      const resolved = path.resolve(requested);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Archivo no encontrado' }));
        return;
      }
      if (resolved !== activeFile) {
        activeFile = resolved;
        watchTarget(activeFile);
      } else {
        lastSignature = computeFileSignature(activeFile);
      }
      const raw = fs.readFileSync(resolved, 'utf8');
      const rendered = renderMarkdownDocument(raw, { baseDir: path.dirname(resolved) });
      const { tree, files } = scanMarkdownWorkspace(workspaceDir);
      lastTreeCount = files.length;
      const relDisplay =
        path.relative(workspaceDir, resolved).split(path.sep).join('/') || path.basename(resolved);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(
        JSON.stringify({
          filePath: resolved,
          fileName: path.basename(resolved),
          relPath: relDisplay,
          totalFiles: files.length,
          treeHtml: renderTreeNodesHtml(tree.children, resolved),
          ...rendered
        })
      );
      return;
    }

    if (url.pathname === '/assets/styles.css') {
      return serveStaticFile(res, path.join(PUBLIC_DIR, 'styles.css'));
    }
    if (url.pathname === '/assets/app.js') {
      return serveStaticFile(res, path.join(PUBLIC_DIR, 'app.js'));
    }
    if (url.pathname === '/vendor/mermaid/mermaid.min.js') {
      return serveStaticFile(res, path.join(NODE_MODULES_DIR, 'mermaid/dist/mermaid.min.js'));
    }
    if (url.pathname.startsWith('/vendor/katex/')) {
      const rel = url.pathname.slice('/vendor/katex/'.length);
      const safeTarget = path.resolve(path.join(NODE_MODULES_DIR, 'katex/dist'), rel);
      if (safeTarget.startsWith(path.join(NODE_MODULES_DIR, 'katex/dist'))) {
        return serveStaticFile(res, safeTarget);
      }
    }
    if (url.pathname === '/local-file') {
      const p = url.searchParams.get('path');
      if (!p) {
        res.writeHead(400);
        res.end('Missing path');
        return;
      }
      return serveStaticFile(res, path.resolve(p));
    }

    if (url.pathname === '/') {
      const queryFile = url.searchParams.get('file');
      if (queryFile && fs.existsSync(queryFile) && fs.statSync(queryFile).isFile()) {
        activeFile = path.resolve(queryFile);
        watchTarget(activeFile);
      }
      const raw = fs.readFileSync(activeFile, 'utf8');
      const rendered = renderMarkdownDocument(raw, { baseDir: path.dirname(activeFile) });
      const htmlPage = buildHtmlShell({
        filePath: activeFile,
        workspaceDir,
        dirMode: effectiveDirMode,
        defaultTheme: opts.theme,
        ...rendered
      });
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(htmlPage);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  if (opts.serverChild && !opts.keepAlive) {
    setTimeout(() => {
      if (!hadClient) process.exit(0);
    }, 30000).unref();
  }

  server.listen(opts.port, '127.0.0.1', () => {
    const addr = server.address();
    const url = `http://127.0.0.1:${addr.port}`;
    if (!opts.serverChild) {
      console.log(`mdv escuchando en ${url} (${workspaceDir})`);
    }
    if (opts.open) {
      launchWindow(url, opts.appMode);
    }
  });
}

// Only run CLI main when executed directly (allows importing scanMarkdownWorkspace for tests)
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main();
}
