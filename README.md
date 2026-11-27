# mdv — Modern Markdown Viewer para WSL2 y Linux

Visor ligero de Markdown lanzado desde la terminal que abre una **ventana limpia nativa en Windows (`--app`)**, diseñado especialmente para **WSL2** (evitando los bordes toscos y el mal escalado de WSLg) con soporte completo para componentes extendidos, navegación estilo **Vim** y **Live-Reload**.

## Características principales

- **Ventana limpia nativa (`--app`):** utiliza Chrome/Edge nativo de Windows sin pestañas ni barra de URLs, con renderizado tipográfico DirectWrite nítido.
- **Componentes extendidos:**
  - **Carruseles interactivos (`carousel`):** bloques ````carousel` separados con `<!-- slide -->` o `<!-- slide: Título -->`, navegables con botones, puntos, arrastre o teclas `h` / `l` (permitiendo código, tablas, alertas y Mermaid dentro de cada vista).
  - **Diagramas Mermaid vectoriales:** SVG adaptativos al tema con vista de código fuente y modo **Ampliar**.
  - **Alertas GitHub / Antigravity:** `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` y `[!CAUTION]`.
  - **Fórmulas matemáticas (KaTeX):** soporte en línea (`$...$`) y en bloque (`$$...$$`).
  - **Código con resaltado (`highlight.js`):** botón de copiado rápido y soporte de bloques `<details>` desplegables.
- **Explorador recursivo de carpetas:** ejecuta `mdv` en cualquier directorio para listar en un árbol colapsable todos los `.md` de la carpeta actual y subcarpetas (con filtro rápido `Ctrl+P`).
- **Mappings estilo Vim + Índice (TOC):** navegación fluida con teclado (`j`/`k`, `5j`, `d`/`u`, `gg`/`G`, `]]`/`[[`, `/` + `n`/`N`, `h`/`l`, `zR`/`zM`, `?`, `q`) y tabla de contenidos lateral con *scroll-spy*.
- **Live-Reload híbrido y apagado automático:** detecta cambios al instante (incluso guardados atómicos de Vim/Neovim y rutas `/mnt/c/...`), devuelve el prompt de la terminal enseguida y apaga su servidor local automáticamente al cerrar la ventana.

---

## Instalación rápida en WSL2 / Linux

Requisitos: `git` y `Node.js >= 18`.

### Opción 1: Instalador de una línea (recomendado)

```bash
curl -fsSL https://raw.githubusercontent.com/dmolinae/mdv/main/install.sh | bash
```

Esto clona `mdv` en `~/.local/share/mdv`, instala sus dependencias locales (funciona 100% offline después de instalar) y enlaza el ejecutable en `~/.local/bin/mdv`.

### Opción 2: Clonar manualmente para desarrollo

```bash
git clone https://github.com/dmolinae/mdv.git ~/code/mdv
cd ~/code/mdv
./install.sh --local
```

### Actualizar a la última versión

```bash
mdv --update
```

---

## Uso

```bash
# Abrir la carpeta actual y explorar todos los .md en subcarpetas
mdv

# Abrir un archivo o directorio específico
mdv README.md
mdv ./docs

# Leer desde entrada estándar (pipe)
cat notas.md | mdv

# Elegir tema inicial o abrir en pestaña normal del navegador
mdv -t catppuccin demo.md
mdv -b demo.md
```

---

## Atajos estilo Vim (`?` dentro de la app)

| Acción | Atajo |
| :--- | :--- |
| Bajar / subir línea (acepta conteos ej. `5j`) | `j` / `k` |
| Media página abajo / arriba | `d` / `u` (o `Ctrl+d` / `Ctrl+u`) |
| Página completa abajo / arriba | `f` / `b` |
| Inicio / final del documento | `gg` / `G` |
| Siguiente / anterior encabezado | `]]` o `}` / `[[` o `{` |
| Slide anterior / siguiente del carrusel visible | `h` / `l` |
| Abrir / cerrar todos los `<details>` | `zR` / `zM` (`za` alterna) |
| Buscar en documento / siguiente / anterior | `/` · `n` · `N` · `Esc` |
| Filtrar archivos `.md` del árbol izquierdo | `Ctrl+P` |
| Archivo `.md` anterior / siguiente | `[f` / `]f` |
| Mostrar / ocultar Archivos o Índice (TOC) | `e` / `t` |
| Alternar ancho de lectura / Rotar tema | `w` / `c` |
| Zoom `+` / `-` / restablecer | `+` · `-` · `0` |
| Copiar ruta actual / bloque de código visible | `yy` / `yc` |
| Forzar recarga / Mostrar ayuda / Cerrar ventana | `r` · `?` · `q` |

---

## Sintaxis de Carrusel

````markdown
````carousel
<!-- slide: 1. Vista inicial -->
Contenido en **Markdown**, tablas, imágenes o alertas.

<!-- slide: 2. Código o Diagramas -->
```ts
console.log("Hola desde el slide 2");
```
````
````

## Licencia

MIT © Daniel Molina
