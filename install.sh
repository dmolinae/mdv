#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${MDV_REPO_URL:-https://github.com/dmolinae/mdv.git}"
INSTALL_DIR="${MDV_INSTALL_DIR:-$HOME/.local/share/mdv}"
BIN_DIR="${MDV_BIN_DIR:-$HOME/.local/bin}"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { printf "${BLUE}==>${NC} %s\n" "$*"; }
ok()    { printf "${GREEN}✓${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}!${NC} %s\n" "$*"; }
err()   { printf "${RED}✗${NC} %s\n" "$*" >&2; exit 1; }

LOCAL_MODE=0
if [[ "${1:-}" == "--local" ]]; then
  LOCAL_MODE=1
fi

command -v git >/dev/null 2>&1 || err "Se requiere 'git'. En Ubuntu/WSL2 ejecuta: sudo apt update && sudo apt install -y git"
command -v node >/dev/null 2>&1 || err "Se requiere 'node' (>= 18). Instálalo con nvm/fnm o NodeSource antes de continuar."
command -v npm >/dev/null 2>&1 || err "Se requiere 'npm'. Verifica tu instalación de Node.js."

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if (( NODE_MAJOR < 18 )); then
  err "Se requiere Node.js >= 18 (encontrado: $(node -v))."
fi

mkdir -p "$BIN_DIR"

if (( LOCAL_MODE == 1 )); then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  TARGET_DIR="$SCRIPT_DIR"
  info "Instalando mdv en modo local desde $TARGET_DIR..."
else
  TARGET_DIR="$INSTALL_DIR"
  mkdir -p "$(dirname "$TARGET_DIR")"
  if [[ -d "$TARGET_DIR/.git" ]]; then
    info "Actualizando instalación existente en $TARGET_DIR..."
    git -C "$TARGET_DIR" pull --ff-only
  else
    rm -rf "$TARGET_DIR"
    info "Clonando $REPO_URL en $TARGET_DIR..."
    git clone --depth 1 "$REPO_URL" "$TARGET_DIR"
  fi
fi

info "Instalando dependencias de renderizado (marked, mermaid, katex, highlight.js, overlayscrollbars)..."
if [[ -f "$TARGET_DIR/package-lock.json" ]]; then
  (cd "$TARGET_DIR" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
else
  (cd "$TARGET_DIR" && npm install --omit=dev --no-audit --no-fund --loglevel=error)
fi

chmod +x "$TARGET_DIR/bin/mdv.js"
ln -sf "$TARGET_DIR/bin/mdv.js" "$BIN_DIR/mdv"
ok "Binario enlazado en $BIN_DIR/mdv"

# Ensure ~/.local/bin is in PATH across common shells
ensure_path_in_rc() {
  local rc_file="$1"
  local line='export PATH="$HOME/.local/bin:$PATH"'
  if [[ -f "$rc_file" ]] && ! grep -Fq '.local/bin' "$rc_file"; then
    printf '\n# mdv CLI\n%s\n' "$line" >> "$rc_file"
    info "Se añadió ~/.local/bin al PATH en $(basename "$rc_file")"
  fi
}

if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  ensure_path_in_rc "$HOME/.bashrc"
  ensure_path_in_rc "$HOME/.zshrc"
  warn "$BIN_DIR no está en tu sesión actual. Ejecuta: source ~/.zshrc (o ~/.bashrc)"
fi

if grep -qi microsoft /proc/version 2>/dev/null; then
  if [[ -f "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" ]] || \
     [[ -f "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" ]] || \
     [[ -f "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe" ]]; then
    ok "WSL2 detectado con navegador nativo de Windows listo para modo --app"
  else
    warn "WSL2 detectado, pero no se encontró Chrome/Edge en la ruta estándar de /mnt/c; se usará el navegador predeterminado de Windows."
  fi
fi

ok "¡Instalación completada! Ejecuta 'mdv' en cualquier carpeta o 'mdv archivo.md'."
