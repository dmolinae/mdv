#!/usr/bin/env bash
set -euo pipefail

REPO="dmolinae/mdv"
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

mkdir -p "$BIN_DIR"

if [[ "${1:-}" == "--local" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  command -v cargo >/dev/null 2>&1 || err "Modo --local requiere Rust/Cargo instalado."
  info "Compilando binario nativo mdv en Rust (release)..."
  (cd "$SCRIPT_DIR" && cargo build --release)
  install -m 755 "$SCRIPT_DIR/target/release/mdv" "$BIN_DIR/mdv"
  ok "Binario Rust instalado en $BIN_DIR/mdv"
else
  command -v curl >/dev/null 2>&1 || err "Se requiere 'curl'."
  command -v tar >/dev/null 2>&1 || err "Se requiere 'tar'."

  info "Consultando último release de $REPO en GitHub..."
  ASSET_URL="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep -oE '"browser_download_url":\s*"[^"]*mdv-linux-x86_64\.tar\.gz"' \
    | head -n 1 \
    | cut -d'"' -f4 || true)"

  if [[ -n "$ASSET_URL" ]]; then
    TMP_DIR="$(mktemp -d)"
    trap 'rm -rf "$TMP_DIR"' EXIT
    info "Descargando binario nativo Linux/WSL2 desde $ASSET_URL..."
    curl -fsSL "$ASSET_URL" -o "$TMP_DIR/mdv.tar.gz"
    tar -xzf "$TMP_DIR/mdv.tar.gz" -C "$TMP_DIR"
    install -m 755 "$TMP_DIR/mdv" "$BIN_DIR/mdv"
    ok "mdv instalado en $BIN_DIR/mdv (sin dependencias externas)"
  elif command -v cargo >/dev/null 2>&1; then
    warn "Aún no hay binario precompilado publicado; compilando desde código fuente con Cargo..."
    cargo install --git "https://github.com/$REPO.git" --root "$HOME/.local" --force
    ok "mdv compilado e instalado en $BIN_DIR/mdv"
  else
    err "No se encontró release precompilado de Linux y 'cargo' no está instalado."
  fi
fi

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

ok "¡Listo! Ejecuta 'mdv' en cualquier carpeta."
