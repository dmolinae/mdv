# mdv — Modern Markdown & WSL Terminal Workspace (Rust)

Visor y entorno de documentación ultraligero escrito **100% en Rust** (un único ejecutable nativo sin dependencias externas) para **Windows** y **WSL2 / Linux**, con interfaz maximizada limpia (`--app`), **Carruseles interactivos**, **Mermaid**, **KaTeX**, navegación estilo **Vim** y una **Zona de Terminales reales de WSL** con splits infinitos.

---

## Instalación en Windows

### Opción 1: Instalador gráfico `.exe` (Recomendado)
Descarga y ejecuta **[`mdv-setup-x64.exe`](https://github.com/dmolinae/mdv/releases/latest/download/mdv-setup-x64.exe)** desde [GitHub Releases](https://github.com/dmolinae/mdv/releases/latest):
- Instala `mdv.exe` sin requerir permisos de administrador (`%LOCALAPPDATA%\Programs\mdv`).
- Lo añade automáticamente a tu `PATH` de Windows (listo para PowerShell, CMD y Windows Terminal).
- Añade **"Abrir en mdv"** al clic derecho sobre carpetas en el Explorador de Windows y asociación opcional de archivos `.md`.
- Cuando se ejecuta en Windows, abre automáticamente tu terminal **WSL** (con `IosevkaTerm Nerd Font`) en el panel derecho, o PowerShell si WSL no está instalado.

### Opción 2: Una línea en PowerShell
```powershell
irm https://raw.githubusercontent.com/dmolinae/mdv/main/install.ps1 | iex
```

---

## Instalación en WSL2 / Linux

Descarga el binario nativo precompilado (cero Node.js, cero Python):

```bash
curl -fsSL https://raw.githubusercontent.com/dmolinae/mdv/main/install.sh | bash
```

O compílalo localmente desde código fuente con Cargo:

```bash
git clone https://github.com/dmolinae/mdv.git ~/code/mdv
cd ~/code/mdv
./install.sh --local
```

Para actualizar a la última versión en Windows o WSL2:

```bash
mdv --update
```

---

## Layout en 4 Zonas (Izquierda a Derecha)

`Navegador de MD` **|** `Visor de MD (Splits infinitos)` **|** `Índice (TOC)` **|** `Zona de Terminales WSL (1 abierta por defecto + Splits infinitos)`

- **Aplicación nativa real en Windows (`WebView2` + barra superior integrada):** ventana Win32 propia con logo e identidad nativa en la Barra de Tareas y `Alt+Tab` (sin depender de Chrome/Edge `--app`), integrando el logo de `mdv`, arrastre de ventana y botones `─` / `□` / `✕` directamente en la barra superior (usa `--windowed` para ventana flotante o `--browser` para pestaña normal).
- **Componentes extendidos:** carruseles ````carousel` + `<!-- slide -->`, diagramas **Mermaid** vectoriales con zoom, fórmulas **KaTeX** (`$...$` / `$$...$$`), alertas GitHub/Antigravity (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`), bloques `<details>` y barras flotantes **OverlayScrollbars**.
- **Terminales reales (`portable-pty` + `xterm.js`):** PTY nativo en Linux/WSL2 y ConPTY conectado a `wsl.exe` en Windows, configurado con `IosevkaTerm Nerd Font`.
- **Live-Reload híbrido y apagado automático:** detecta guardados atómicos de Vim/VS Code al instante y cierra el servidor local automáticamente al cerrar la ventana.

---

## Uso

```bash
# Abrir la carpeta actual y explorar todos los .md en subcarpetas
mdv

# Abrir un archivo o carpeta específica
mdv README.md
mdv ./docs

# Abrir dos archivos directamente en Split View (vertical u horizontal con --hz)
mdv README.md docs/arquitectura.md
mdv --hz README.md docs/arquitectura.md

# Leer desde entrada estándar (pipe)
cat notas.md | mdv
```

---

## Atajos principales (`?` dentro de la app)

| Acción | Atajo |
| :--- | :--- |
| Mover foco entre **Archivos ↔ Visor MD ↔ Terminales WSL** | `Alt + h` / `Alt + j` / `Alt + k` / `Alt + l` |
| Split Right / Split Down (contextual: divide MD o Terminal según foco) | `Ctrl+Alt+R` / `Ctrl+Alt+D` |
| Forzar nuevo Split en Zona de Terminales WSL | `Alt+Shift+R` / `Alt+Shift+D` |
| Cerrar panel MD o Terminal activa | `Alt+Shift+W` (o `q` en MD / `exit` en Terminal) |
| En Navegador de MD: mover / abrir / preview sin salir / expandir | `j`/`k` · `o` o `Enter` · `O` · `l`/`h` |
| Filtrar archivos `.md` del árbol izquierdo | `Ctrl+P` |
| Bajar / subir en documento · Media página · Inicio / Final | `j`/`k` (`5j`) · `d`/`u` · `gg`/`G` |
| Siguiente / anterior encabezado · Slide de carrusel | `]]` / `[[` · `h` / `l` |
| Buscar en documento / siguiente / anterior | `/` · `n` · `N` · `Esc` |
| Tamaño de letra `A+` / `A−` / `100%` | `+` · `-` · `0` |
| Mostrar / ocultar Archivos o Índice · Ancho · Rotar tema | `e` / `t` · `w` · `c` |

---

## Licencia

MIT © Daniel Molina
