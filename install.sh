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
  info "Compilando binario nativo Linux/WSL2 mdv en Rust (release)..."
  (cd "$SCRIPT_DIR" && cargo build --release --bin mdv)
  install -m 755 "$SCRIPT_DIR/target/release/mdv" "$BIN_DIR/mdv"
  ok "Binario Linux/WSL2 instalado en $BIN_DIR/mdv"

  # Si estamos en WSL2 y existe Cargo nativo en Windows, compilar e instalar también el host nativo WebView2 (mdv.exe)
  CMD_EXE=""
  if [[ -f "/mnt/c/Windows/System32/cmd.exe" ]]; then
    CMD_EXE="/mnt/c/Windows/System32/cmd.exe"
  elif [[ -f "/mnt/c/WINDOWS/system32/cmd.exe" ]]; then
    CMD_EXE="/mnt/c/WINDOWS/system32/cmd.exe"
  fi

  if [[ -n "$CMD_EXE" ]]; then
    WIN_LOCALAPPDATA="$(cd /mnt/c && "$CMD_EXE" /d /c "echo %LOCALAPPDATA%" 2>/dev/null | tr -d '\r' | tail -n 1 || true)"
    WIN_USERPROFILE="$(cd /mnt/c && "$CMD_EXE" /d /c "echo %USERPROFILE%" 2>/dev/null | tr -d '\r' | tail -n 1 || true)"
    if [[ "$WIN_LOCALAPPDATA" == *:* && "$WIN_USERPROFILE" == *:* ]]; then
      WIN_DRIVE="$(printf '%s' "${WIN_LOCALAPPDATA:0:1}" | tr '[:upper:]' '[:lower:]')"
      WIN_LOCAL_WSL="/mnt/$WIN_DRIVE/${WIN_LOCALAPPDATA:3}"
      WIN_LOCAL_WSL="${WIN_LOCAL_WSL//\\//}"
      WIN_PROF_DRIVE="$(printf '%s' "${WIN_USERPROFILE:0:1}" | tr '[:upper:]' '[:lower:]')"
      WIN_PROF_WSL="/mnt/$WIN_PROF_DRIVE/${WIN_USERPROFILE:3}"
      WIN_PROF_WSL="${WIN_PROF_WSL//\\//}"

      WIN_CARGO_EXE="$WIN_PROF_WSL/.cargo/bin/cargo.exe"
      WIN_DEST="$WIN_LOCAL_WSL/Programs/mdv"
      if [[ -f "$WIN_CARGO_EXE" ]]; then
        info "Compilando ventana nativa de Windows (mdv.exe con WebView2) usando Cargo de Windows..."
        WIN_STAGE_WSL="$WIN_LOCAL_WSL/Temp/mdv-win-build-src"
        WIN_STAGE_DOS="$WIN_LOCALAPPDATA\\Temp\\mdv-win-build-src"
        mkdir -p "$WIN_STAGE_WSL" "$WIN_DEST"
        rm -rf "$WIN_STAGE_WSL/src" "$WIN_STAGE_WSL/assets"
        cp -f "$SCRIPT_DIR/Cargo.toml" "$SCRIPT_DIR/Cargo.lock" "$SCRIPT_DIR/build.rs" "$WIN_STAGE_WSL/"
        cp -rf "$SCRIPT_DIR/src" "$SCRIPT_DIR/assets" "$WIN_STAGE_WSL/"
        if (cd "$WIN_STAGE_WSL" && "$CMD_EXE" /d /c "\"%USERPROFILE%\\.cargo\\bin\\cargo.exe\" build --release --bin mdv"); then
          cp -f "$WIN_STAGE_WSL/target/release/mdv.exe" "$WIN_DEST/mdv.exe"
          chmod +x "$WIN_DEST/mdv.exe" || true
          ok "App nativa de Windows instalada en $WIN_DEST/mdv.exe"
        else
          warn "Falló la compilación de Windows con cargo.exe (se usará el mdv.exe existente si está presente)."
        fi
      elif [[ -f "$WIN_DEST/mdv.exe" ]]; then
        ok "Host nativo de Windows detectado en $WIN_DEST/mdv.exe"
      else
        warn "No se encontró cargo.exe en Windows ($WIN_CARGO_EXE) ni $WIN_DEST/mdv.exe."
      fi
    fi
  fi
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

    if [[ -f "/mnt/c/WINDOWS/system32/cmd.exe" ]]; then
      WIN_ZIP_URL="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
        | grep -oE '"browser_download_url":\s*"[^"]*mdv-windows-x86_64\.zip"' \
        | head -n 1 \
        | cut -d'"' -f4 || true)"
      WIN_LOCALAPPDATA="$(/mnt/c/WINDOWS/system32/cmd.exe /c "echo %LOCALAPPDATA%" 2>/dev/null | tr -d '\r' || true)"
      if [[ -n "$WIN_ZIP_URL" && "$WIN_LOCALAPPDATA" == *:* ]] && command -v python3 >/dev/null 2>&1; then
        WIN_DRIVE="$(printf '%s' "${WIN_LOCALAPPDATA:0:1}" | tr '[:upper:]' '[:lower:]')"
        WIN_REST="${WIN_LOCALAPPDATA:3}"
        WIN_DEST="/mnt/$WIN_DRIVE/${WIN_REST//\\//}/Programs/mdv"
        info "Instalando host de ventana nativa de Windows en $WIN_DEST/mdv.exe..."
        mkdir -p "$WIN_DEST"
        if curl -fsSL "$WIN_ZIP_URL" -o "$TMP_DIR/mdv-win.zip"; then
          python3 -c "import zipfile; zipfile.ZipFile('$TMP_DIR/mdv-win.zip').extract('mdv.exe', '$WIN_DEST')" && chmod +x "$WIN_DEST/mdv.exe" || true
          ok "Ventana nativa de Windows (WebView2) lista para abrirse desde WSL2"
        fi
      fi
    fi
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
