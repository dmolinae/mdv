# mdv — Modern Terminal, Markdown & ClickUp Workspace (Rust)

Entorno de desarrollo ultraligero escrito **100% en Rust** (un único ejecutable nativo con todos los assets embebidos, sin Node.js ni Python) para **Windows** y **WSL2 / Linux**. Combina una **Zona Principal de Terminales reales (WSL / Linux / PowerShell)** con splits infinitos y persistencia en segundo plano junto a un **Panel Lateral con pestañas para Documentación Markdown y Tareas de ClickUp + PRs de GitHub**.

---

## Instalación en Windows

### Opción 1: Instalador gráfico `.exe` (Recomendado)
Descarga y ejecuta **[`mdv-setup-x64.exe`](https://github.com/dmolinae/mdv/releases/latest/download/mdv-setup-x64.exe)** desde [GitHub Releases](https://github.com/dmolinae/mdv/releases/latest):
- Instala `mdv.exe` en tu cuenta sin requerir permisos de administrador (`%LOCALAPPDATA%\Programs\mdv`).
- Añade acceso directo en el **Menú Inicio**, comando `mdv` en tu `PATH` de usuario y desinstalador en Configuración de Windows.
- Registra **"Abrir en mdv"** en el menú contextual al hacer clic derecho sobre cualquier carpeta y en *"Abrir con"* para archivos `.md` / `.markdown`.
- Abre automáticamente tu distribución **WSL** en la carpeta del proyecto (o **PowerShell** si no hay ninguna distribución WSL instalada) y ofrece lanzar `mdv` al finalizar la instalación.

### Opción 2: Una línea en PowerShell
```powershell
irm https://raw.githubusercontent.com/dmolinae/mdv/main/install.ps1 | iex
```

---

## Instalación en WSL2 / Linux

Descarga e instala el binario nativo precompilado (y si estás en WSL2, instala también `mdv.exe` en Windows para abrir la ventana nativa `WebView2` directamente desde WSL2):

```bash
curl -fsSL https://raw.githubusercontent.com/dmolinae/mdv/main/install.sh | bash
```

O compílalo localmente desde código fuente con Cargo:

```bash
git clone https://github.com/dmolinae/mdv.git ~/code/mdv
cd ~/code/mdv
./install.sh --local
```

Para actualizar a la última versión en Windows o WSL2 / Linux:

```bash
mdv --update
```

---

## Arquitectura del Workspace

```text
┌───────────────────────────────────────────┬──────────────────────────────────────────────┐
│  Barra superior nativa (WebView2 / App)   │  Tamaño (pt) · Fuente · Tema · [MD | ClickUp]│
├───────────────────────────────────────────┼──────────────────────────────────────────────┤
│                                           │  Pestaña 1: Markdown (Alt+1)                 │
│   ZONA PRINCIPAL DE TERMINALES            │   • Árbol recursivo de .md + filtro (Ctrl+P) │
│   • Splits verticales y horizontales      │   • Visor Markdown con Splits infinitos      │
│   • Sesiones persistentes (daemon local)  │   • Índice (TOC), Carruseles, Mermaid, KaTeX │
│   • Estado en vivo de Claude Code         ├──────────────────────────────────────────────┤
│   • Clic derecho: copiar selección/pegar  │  Pestaña 2: ClickUp + GitHub PRs (Alt+2)     │
│                                           │   • Filtro por responsable, área o ID / URL  │
│                                           │   • Detección de git worktrees y estado PR   │
│                                           │   • 1 clic / Enter abre terminal de la tarea │
└───────────────────────────────────────────┴──────────────────────────────────────────────┘
```

### Características principales
- **Ventana nativa sin bordes en Windows (`WebView2`):** ventana Win32 propia con identidad e ícono nativo en Barra de Tareas y `Alt+Tab`, barra superior integrada con arrastre, redimensionado en bordes y controles `─` / `□` / `✕` (con fallback automático a Chrome/Edge `--app` si `WebView2` no está disponible).
- **Terminales reales y persistentes (`portable-pty` + `xterm.js`):** PTY nativo en Linux/WSL2 y ConPTY hacia `wsl.exe` / PowerShell en Windows. Al cerrar la ventana, el demonio por carpeta mantiene vivas tus sesiones para reconectar al instante al volver a ejecutar `mdv` (usa `mdv --stop` para detenerlo).
- **Indicador de estado para Claude Code:** detecta automáticamente procesos de Claude Code en cada terminal y muestra si está trabajando o esperando respuesta del usuario.
- **Tipografía y temas en vivo:** selector de tamaño en puntos (`6 pt` – `20 pt`), selector de fuente de terminal con detección automática de fuentes instaladas (`Iosevka Term`, `JetBrains Mono`, `Cascadia Code`, `Fira Code`, `MesloLGS NF`, `0xProto`, `Geist Mono`, etc.) y 4 temas (`Tokyo Night`, `GitHub Dark`, `Catppuccin`, `Claro`).
- **Visor Markdown enriquecido con Live-Reload:** carruseles ````carousel` + `<!-- slide -->`, diagramas **Mermaid** con zoom, fórmulas **KaTeX** (`$...$` / `$$...$$`), alertas GitHub (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`), resaltado de código y recarga instantánea al guardar en Vim / VS Code.
- **Integración con ClickUp y GitHub PRs:** conecta tu Personal API Token (`pk_...`), filtra tareas por responsable o área, consulta el estado de los PRs vinculados mediante `gh`, detecta `git worktrees` locales asociados al código de la tarea y abre terminales con las variables `CLICKUP_TASK_ID`, `CLICKUP_TASK_CODE`, `CLICKUP_TASK_NAME` y `CLICKUP_TASK_URL` preconfiguradas.

---

## Uso por línea de comandos

```bash
# Abrir el workspace en la carpeta actual (reconecta a terminales activas si ya existían)
mdv

# Abrir un archivo Markdown o una carpeta específica
mdv README.md
mdv ./docs

# Abrir dos archivos directamente en Split View (vertical u horizontal con --hz)
mdv README.md docs/arquitectura.md
mdv --hz README.md docs/arquitectura.md

# Leer Markdown temporal desde entrada estándar (pipe)
cat notas.md | mdv

# Abrir en ventana flotante (sin maximizar) o en una pestaña normal del navegador
mdv --windowed
mdv --browser

# Detener el demonio en segundo plano y cerrar las terminales de la carpeta actual
mdv --stop

# Actualizar mdv desde GitHub Releases
mdv --update
```

---

## Atajos de teclado (`?` dentro de la app)

### Terminales y Paneles
| Acción | Atajo |
| :--- | :--- |
| Mover foco entre paneles y zonas | `Alt + ← / ↓ / ↑ / →` (o `Alt + h / j / k / l`) |
| Cambiar pestaña lateral **Markdown / ClickUp** | `Alt + 1` / `Alt + 2` (o `Alt + Shift + ← / →`) |
| Mostrar / ocultar panel lateral derecho | `Alt + B` |
| Dividir panel a la derecha / abajo en la zona actual | `Ctrl + Alt + R` / `Ctrl + Alt + D` |
| Forzar nuevo Split en la Zona de Terminales | `Alt + Shift + R` / `Alt + Shift + D` |
| Cerrar terminal o panel en foco | `Ctrl + Shift + W` / `Ctrl + Alt + W` |
| Copiar selección o pegar en terminal | `Clic derecho` · `Ctrl + Shift + C / V` |

### Pestaña Markdown (Archivos y Lectura estilo Vim)
| Acción | Atajo |
| :--- | :--- |
| Mostrar / ocultar árbol de archivos · Filtro rápido | `e` · `Ctrl + P` |
| En árbol de archivos: mover / abrir / preview / expandir | `j` / `k` · `Enter` o `o` · `O` · `l` / `h` |
| Bajar / subir · Media página · Inicio / Final | `j` / `k` (`5j`) · `d` / `u` · `gg` / `G` |
| Siguiente / anterior encabezado · Slide de carrusel | `]]` / `[[` · `h` / `l` |
| Buscar en documento / siguiente / anterior / cerrar | `/` · `n` · `N` · `Esc` |
| Tamaño de letra `A+` / `A−` / restablecer | `+` · `-` · `0` |
| Mostrar / ocultar Índice (TOC) · Ancho · Rotar tema | `t` · `w` · `c` |

### Pestaña ClickUp
| Acción | Atajo |
| :--- | :--- |
| Moverse entre tareas | `j` / `k` |
| Cambiar sub-pestaña de responsable | `h` / `l` |
| Abrir o alternar terminal asociada a la tarea | `Enter` o `Clic` |
| Abrir tarea en el navegador (ClickUp) | `o` |
| Buscar / filtrar por ID o URL · Actualizar tareas | `/` · `r` |

---

## Licencia

MIT © Daniel Molina
