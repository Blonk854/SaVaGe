# SaVaGe User Manual

**Product:** SaVaGe — image-to-SVG converter and vector editor for Windows  
**Document version:** matches application v0.1.3"

---

## How to use this manual

| If you are… | Start here |
|---|---|
| New to vector graphics | [Quick start](#1-quick-start) → [Convert](#3-convert-mode) → [Edit basics](#4-edit-mode-basics) |
| Comfortable with Illustrator / Inkscape | [Workspace map](#2-workspace-map) → [Tools reference](#5-tools-reference) → [Advanced](#8-advanced-editing) |
| Looking up a menu or key | [Menus](#7-menus) → [Keyboard shortcuts](#11-keyboard-shortcuts-cheat-sheet) |

Inside SaVaGe, **Help → User Manual (PDF)…** opens this guide in your usual PDF viewer.

Keyboard shortcuts appear in **bold** (for example **V** for Select). Menu paths use **File → Open…** style.

In the app, hover a tool for its name and shortcut, and hover a disabled Align or Boolean button to see why it is unavailable. Convert explains rejected drops. An empty artboard offers **Convert an image**, **Draw a rectangle**, and **Open a project**.

---

## Table of contents

1. [Quick start](#1-quick-start)  
2. [Workspace map](#2-workspace-map)  
3. [Convert mode](#3-convert-mode)  
4. [Edit mode basics](#4-edit-mode-basics)  
5. [Tools reference](#5-tools-reference)  
6. [Panels](#6-panels)  
7. [Menus](#7-menus)  
8. [Advanced editing](#8-advanced-editing)  
9. [Files, export & clipboard](#9-files-export--clipboard)  
10. [Plugins](#10-plugins)  
11. [Keyboard shortcuts](#11-keyboard-shortcuts-cheat-sheet)  
12. [Known limitations & best practices](#12-known-limitations--best-practices)  
13. [Glossary](#13-glossary)

---

## 1. Quick start

### 1.1 Launch

Open SaVaGe the same way you open any Windows app:

- Double-click the **SaVaGe** shortcut on the desktop or in the Start menu, or  
- Double-click `SaVaGe.exe` in the folder where you installed it.

SaVaGe opens in **Convert** mode: dark graphite window, lime accent, and the same SaVaGe mark used in the title bar.

Current installers are **unsigned internal builds**. Windows may warn that the publisher is unknown. That warning is expected; compare the setup file’s SHA-256 with the checksum published for that version. **Help → About SaVaGe** repeats this notice.

You do not need a terminal, PowerShell, or developer tools to run the program.

### 1.2 Your first conversion

1. Drag a PNG, JPEG, WEBP, GIF, BMP, or TIFF onto the drop zone — or click **Open Image…**.
2. Pick a preset that matches the art:
   - **Logo / flat** — logos, icons, flat color art  
   - **Photo** — photographs and soft gradients  
   - **Line art** — sketches, comics, high-contrast line drawings  
   - **Pixel** — pixel art / hard block shapes  
3. Optionally tweak **Color precision**, **Filter speckle**, **Corner threshold**, **Path precision**, and **Mode**.
4. Click **Convert to SVG**. While it runs, **Cancel** requests a stop. Tracing cannot be interrupted mid-stage; the button stays busy until the current stage finishes and the job actually exits.
5. Check the side-by-side **Raster | SVG** preview.
6. Click **Open in Editor** to refine the vectors. If a project is already open, SaVaGe asks **Save**, **Discard**, or **Cancel** first. The toolbar **Edit** button shows the current project, not the uncommitted trace.

You can also start from **File → Open…**: choosing a photo or PNG switches you to Convert and attaches that file automatically.

### 1.3 Your first edit

An empty artboard offers **Convert an image**, **Draw a rectangle**, or **Open a project**. After objects exist:

1. Press **V** (Select). Click a shape; drag to move. Use corner and edge handles to resize; use the rotate handle to rotate.
2. Open the **Properties** tab on the right. Change fill color or opacity. **W** and **H** set the object’s on-canvas size.
3. **File → Save** (**Ctrl+S**) writes a `.savage` project (best fidelity). The first save, or **File → Save As…** (**Ctrl+Shift+S**), asks where to put it.  
   **File → Export SVG…** / **Export PNG…** are for delivery and do not mark the project Saved.

### 1.4 Five-minute power path

Convert with **Logo** preset → **Open in Editor** → Unite overlapping paths → Shape Builder (**S**) to carve → Create Symbol → Mesh fill on a hero shape → Export SVG and keep a `.savage` master.

### 1.5 Install, update, and uninstall

Install SaVaGe from the tagged NSIS setup (`SaVaGe_<version>_x64-setup.exe`) as your own Windows account. No administrator prompt is required. The program goes under your user folder (typically `%LOCALAPPDATA%\SaVaGe`), with a Start menu shortcut.

Current setups are unsigned, so Windows may warn that the publisher is unknown. Check the SHA-256 published with that version before continuing. **Help → About SaVaGe** repeats this.

SaVaGe needs the Microsoft **WebView2** runtime. Windows 10/11 usually already have it. If it is missing, the installer downloads it (internet required). If that download cannot run, setup stops instead of leaving a broken app.

To update, close SaVaGe and run a newer (or the same) tagged setup. There is no automatic updater. Keep the older setup file if you may need to reinstall it. Current tagged builds are internal or opt-in; they are not a stable channel release. Crash-recovery files stay in `%APPDATA%\com.savage.svgstudio\`. Your `.savage` documents stay wherever you saved them.

To uninstall, use **Apps → Installed apps** or the setup’s uninstaller, and **leave “Delete the application data” unchecked** if you want recovery checkpoints kept. Uninstall does not delete project files. Reinstalling later can still offer Recover for leftover checkpoints.

If a tagged setup is **withdrawn**, keep your `.savage` files. Leave **Delete the application data** unchecked. **Help → Export Diagnostics…** only if you agree to share a redacted log — nothing is uploaded automatically. Install the last verified tagged setup you were given and check its SHA-256. The first verified installer in this unsigned line is **0.1.2**; withdrawing that tag has no older verified setup — keep copies of your files and wait for a replacement tag.

If you install an older tagged setup over a newer one, recovery and your `.savage` files stay where they are. That does **not** convert newer documents to version 1. Open version-1 files as usual. A newer project still will not open — use the newer SaVaGe, or **Save As** a version-1 copy from that app before you go back.

SaVaGe does not take over `.savage` in File Explorer in this release — open projects from **File → Open…**.

On a 1080p screen at **200%** display scaling, maximize the window if the work area is tight. The supported minimum is 960×600; Convert and Edit wrap rather than hide required controls.

---

## 2. Workspace map

```
┌──────────────────────────────────────────────────────────────┐
│ Title bar: SaVaGe · File  Edit  Object  View  Help           │
├──────────────────────────────────────────────────────────────┤
│ Toolbar: Convert | Edit · Zoom · Fit · Grid · Snap · Persp   │
├────┬───────────────────────────────────────────┬─────────────┤
│    │                                           │ Layers      │
│ T  │         Main: Convert UI or Canvas        │ Properties  │
│ o  │                                           │ Artboards   │
│ o  │                                           │ Symbols     │
│ l  │                                           │ Plugins     │
│ s  │                                           │ Align/Bool  │
├────┴───────────────────────────────────────────┴─────────────┤
│ Status: zoom · selection count · mode · tool · refresh time  │
└──────────────────────────────────────────────────────────────┘
```

The left tool rail is active in **Edit** mode only.

### 2.1 Modes

| Mode | Purpose |
|---|---|
| **Convert** | Import a bitmap and trace it to editable SVG |
| **Edit** | Draw, style, boolean, symbols, and export |

Switch with the **Convert | Edit** control in the toolbar. After a successful trace, stay on Convert to compare the preview, then click **Open in Editor** when you are ready.

### 2.2 Status bar

The bottom strip shows:

- Zoom percentage  
- How many objects are selected  
- Current mode and active tool  
- Document status: **Unsaved** (no project file yet), **Modified** (edits since last save), or **Saved**  
- Last screen-refresh time (turns amber when the drawing is heavy)

The title bar repeats the document name and the same Unsaved / Modified / Saved label.

Toasts over the main view use the same status colors as Convert: lime-adjacent success, amber warning, and red error. Confirmations (saved, boolean applied) are success; “select something first” is a warning; failures are errors.

### 2.3 Display, scaling, and Narrator

The window opens at **1440×900**. **1280×720** is the comfortable workspace. The smallest supported size is **960×600**, which still fits a 1080p monitor at **200%** display scaling (maximize if the taskbar eats the remainder). At narrower widths Convert stacks Trace options under the drop zone; the title bar, toolbar, and inspector tabs wrap instead of covering controls.

The canvas follows monitor DPI. Windows High Contrast remaps chrome to system colors; the drawing on the artboard stays in document colors. **F10** focuses File for Narrator. Layers and Artboards are lists; the canvas is named **Artboard**; selection changes are announced politely.

---

## 3. Convert mode

Convert turns bitmaps into editable vector paths.

### 3.1 Loading an image

| Method | Notes |
|---|---|
| Drag and drop | Drop a raster file onto the large drop zone |
| **Open Image…** | File dialog for png / jpg / jpeg / gif / webp / bmp / tif / tiff |
| **File → Open…** | Same raster types; SaVaGe switches to Convert and attaches the file |

A thumbnail of the source appears after the file is attached, with format, pixel size, and file size. The SVG pane stays empty until a trace finishes. While converting, the drop zone is disabled, a progress label shows the current stage, and **Cancel** requests a stop after that stage. Tracing itself cannot be interrupted. Unsupported drops explain why they were rejected instead of failing silently. **Convert to SVG** stays disabled until a source is attached; hover the button for the reason.

### 3.2 Presets (start here)

Presets apply a full option set. Choose the closest match, then fine-tune. Changing a slider or **Mode** after a preset selects **Custom** (the named buttons turn off) and shows “Options no longer match a named preset.” Picking a named preset again restores that full set.

| Preset | Best for | Tendency |
|---|---|---|
| **Logo / flat** | Logos, icons, UI graphics | Solid colors, light cleanup, smooth curves |
| **Photo** | Photos, soft shading | Fewer colors, stronger speck cleanup |
| **Line art** | Ink drawings, comics | High-contrast, few colors |
| **Pixel** | Pixel art | Blocky 1:1 pixel shapes |

### 3.3 Trace options

| Control | What it does | Tip | Power user |
|---|---|---|---|
| **Color precision** | How many distinct colors to keep | Higher = more colors and a heavier file | Lower for flat brand marks; raise for photos |
| **Filter speckle** | Removes tiny islands of noise | Increase if the result looks speckled | Clean up here before **Simplify Path** |
| **Corner threshold** | Corner vs curve bias | Default is fine for logos | Lower for sharper corners; higher for smoother bends |
| **Path precision** | How tightly paths follow the original | Leave default unless the SVG is huge | Lower to reduce point count |
| **Mode** | Spline / Polygon / Pixel | Use **Spline** for logos | **Polygon** for a faceted look; **Pixel** for 1:1 blocks |

A few extra engine settings come with each preset and are not shown as separate sliders.

### 3.4 Preview and continue

After conversion you get a side-by-side **Raster | SVG** preview. The trace stays on Convert until you commit it. The primary button becomes **Convert again**.

- Click **Open in Editor** to load it as a new Unsaved document. If another project is open, SaVaGe asks **Save**, **Discard**, or **Cancel** first so Save cannot overwrite that file with the trace.
- Switching the toolbar to **Edit** without **Open in Editor** leaves the current project unchanged.
- Stay on Convert if you want to change options and convert again before editing. Changing options after a trace shows an amber banner: “Trace options changed. Convert again to update the SVG.” The SVG pane looks faded until you do.

### 3.5 Convert workflow tips

- Start with the smallest useful image that still has clean edges (very large photos produce heavy path sets).  
- Logo art with solid fills converts cleaner than soft, anti-aliased shadows.  
- After convert, use **Object → Simplify Path** on noisy selections before booleans.

---

## 4. Edit mode basics

### 4.1 Navigating the canvas

| Action | How |
|---|---|
| Pan | **H** (Pan tool), hold **Space** + drag, or middle-mouse drag |
| Zoom toward cursor | Scroll wheel |
| Zoom tool | **Z** — click to zoom in, **Alt-click** to zoom out |
| Zoom buttons | Toolbar **−** / **%** / **+** |
| Fit active artboard | Automatic when you enter Edit; then Toolbar **Fit**, **View → Fit Artboard**, or **Ctrl+0** |
| Fit selection | **View → Fit Selection** or **Ctrl+2** |
| Zoom 100% | Click the zoom %, **View → Zoom 100%**, or **Ctrl+1** |
| Zoom 50% / 200% | **View** menu |

### 4.2 Selecting and transforming

1. Activate **Select** (**V**).  
2. Click an object. **Shift+click** to add or remove from the selection.  
3. Drag the object to move it.  
4. Drag handles to resize. The opposite edge or corner stays put. **Shift** keeps proportions.  
5. Use the rotate handle to rotate around the selection’s center.  
6. Arrow keys nudge 1 px; **Shift+arrows** nudge 10 px.

**Ctrl+A** selects all. **Delete** or **Backspace** deletes the selection. While you are typing in a field (Properties, text overlay, and similar), those keys edit the field instead of the canvas.

Clicking empty canvas clears the selection. Locked objects cannot be clicked; unlock them in Layers first.

### 4.3 Undo and history

| Action | Shortcut / menu |
|---|---|
| Undo | **Ctrl+Z** · **Edit → Undo** |
| Redo | **Ctrl+Shift+Z** or **Ctrl+Y** · **Edit → Redo** |

A full drag, stroke, or resize counts as one undo step. Switching tools while you are still dragging finishes that shape first. SaVaGe keeps about the last 100 edits; huge files or very long sessions may drop the oldest steps so memory stays bounded.

### 4.4 Layers at a glance

Open the **Layers** tab:

- Top of the list ≈ front of the stack  
- Click to select  
- Toggle visibility and lock  
- Double-click to rename  
- Drag to reorder among top-level items  
- Groups show nested children indented

### 4.5 Properties at a glance

Open **Properties**:

- One object: position **X / Y**, size **W / H**, rotation **R**, opacity, fill, stroke, and effects  
- Several objects: Properties shows a mixed-selection notice and does not silently edit the first object — select one object to change size, fill, or effects  

Changing **W** or **H** scales the object to that size on the canvas.

---

## 5. Tools reference

Tools live in the left rail (Edit mode only). Click an icon or use a shortcut. Hover an icon to see its name.

A click without a drag is ignored for drawing tools (no leftover 1-pixel specks). Switching to another tool while drawing finishes the current shape.

### 5.1 Navigation & selection

#### Select — **V**

Click objects to select them. Move, multi-select (**Shift**), scale, and rotate with the handles around the selection.

#### Direct Select — **A**

Edits individual path points. Click near an anchor (on any path) to select that path and drag the point. Curve handles travel with the point.

**Variable width:** hold **Alt** and drag a point to change that point’s local stroke width. See [Variable-width strokes](#85-variable-width-strokes).

#### Pan — **H**

Drag the canvas. Hold **Space** for a temporary pan without leaving your current drawing tool.

#### Zoom — **Z**

Click the canvas to zoom in around the pointer. **Alt-click** zooms out. The scroll wheel still zooms toward the cursor at any time.

### 5.2 Shape tools

| Tool | Shortcut | Draw | Modifiers |
|---|---|---|---|
| Rectangle | **R** | Drag | **Shift** square · **Alt** from center |
| Ellipse | **O** | Drag | **Shift** circle · **Alt** from center |
| Line | **L** | Drag | **Shift** snaps to horizontal, vertical, or 45° |
| Polygon | — | Drag out the radius | Regular hexagon (6 sides) |
| Star | — | Drag out the radius | 5-point star |

New shapes use the lime accent fill where it fits the tool.

### 5.3 Path tools

#### Pen — **P**

Click to place corner anchors. Drag while placing to create Bézier handles. Click near the first point (the snap distance stays the same at any zoom) to close the path.

| Key | Action |
|---|---|
| **Enter** or **Esc** | Finish the path (leave it on the canvas) |
| **Backspace** | Remove the last point (does not delete the whole path) |

Leaving the Pen tool also finishes the current path so the next Pen session starts fresh.

#### Pencil — **N**

Freehand stroke, simplified into an open path. Good for roughing silhouettes; refine with Direct Select or **Simplify Path**. Grid snap is off while you draw so the stroke follows your hand.

#### Brush (calligraphy) — **B**

Speed-sensitive calligraphy: faster motion → thinner ribbon. The result is a **closed filled path** (not a simple outline), so fills and booleans treat it as solid geometry. Grid snap is off while you draw.

### 5.4 Pattern Brush & Scatter Brush

| Tool | Result |
|---|---|
| **Pattern Brush** | Chevron motifs stamped along your stroke at regular spacing, grouped |
| **Scatter Brush** | Leaf-like motifs with position jitter, rotation, and scale variation, grouped |

**How to use:** choose the tool → drag a gesture → release. SaVaGe creates a group of stamp paths. A click without a drag does nothing. Grid snap is off while you stroke.

Stamps are ordinary vector paths. Ungroup if you need to edit or boolean individual stamps. Spacing and jitter are fixed in this release (not yet shown as sliders).

### 5.5 Shape Builder — **S**

Interactive region sculpting for overlapping filled shapes (rectangles, ellipses, closed paths).

1. Select two or more overlapping shapes.  
2. Activate **Shape Builder** (**S**). SaVaGe splits them into atomic regions.  
3. Regions tint **green** (kept) or **red** (discarded). Click a region to toggle.  
4. Press **Enter** (or **Object → Commit Shape Builder**, or the sidebar button) to merge kept regions into one path and remove the originals.  
5. **Esc** cancels and returns to Select.

Works on closed fills only. Open pencil strokes and live text are not valid sources until you convert them (for text: **Object → Convert Text to Outlines**). You can sculpt more than a handful of overlapping shapes in one pass.

### 5.6 Text — **T**

- Click empty canvas to place a new text object (starts as “Text”) and type.  
- Click an existing text object with the Text tool — or double-click it with Select — to edit it.  

**Enter** or **Esc** finishes editing and keeps what you typed. Click away from the field to do the same.

Typography fields in Properties: content, font size, weight. New text uses **DM Sans**.

**Convert Text to Outlines:** **Object** menu or the button in Properties. SaVaGe turns the letters into real paths using the bundled faces **DM Sans** and **Syne**. Outline late if you still need to edit the live wording. Other font names will outline with the closest bundled face.

---

## 6. Panels

### 6.1 Layers

Hierarchical list of everything on the canvas. Use it for selection, visibility, locking, naming, and reordering. Nested group children appear indented.

### 6.2 Properties

Context-sensitive inspector. Several selected objects show a mixed-selection state instead of editing only the first. Select one object for fill, size, and effects.

#### Paint (fill / stroke)

| Type | Behavior |
|---|---|
| **Solid** | Single color |
| **Linear** | Linear gradient with editable stop colors |
| **Radial** | Radial gradient with editable stop colors |
| **Mesh** | Grid mesh gradient; edit corner colors |
| **None** | No paint |

Stroke width uses a slider. Mesh fills look correct on the SaVaGe canvas. Exported SVG uses a native mesh gradient that Inkscape understands. Many web browsers still do not paint mesh fills — keep a `.savage` master or export PNG when the raster look must match.

#### Path: variable width

For path objects:

- **Taper ends** — applies a width profile along each subpath  
- **Clear profile** — removes per-point widths (back to a uniform stroke)

#### Effects

- **Blur** — softens the object  
- **Drop shadow** — offset, blur, color, and opacity  

#### Clip

If the object has a clip mask, release it from Properties or **Object → Release Clip Mask**. Otherwise a short tip explains how to make one.

### 6.3 Artboards

Multiple artboards live in one document.

| Action | How |
|---|---|
| Activate | Click a board (fits the view to it) |
| Add | **+** or **Object → New Artboard** |
| Rename | Double-click the name |
| Delete | × (at least one board must remain) |

The active artboard draws with a stronger accent frame and label. **View → Fit All Artboards** frames every board.

### 6.4 Symbols

Reusable masters stored once; instances on the canvas all follow that master.

| Action | How |
|---|---|
| Create | Select artwork → **+** in the panel, or **Object → Create Symbol** |
| Place | Click a symbol name in the panel |
| Detach | Select an instance → Detach (panel, Properties, or **Object → Detach Symbol**) |
| Delete definition | × on the symbol row — placed copies are expanded into ordinary objects first so artwork is not lost |

Creating a symbol replaces the selection with an instance of the new master.

### 6.5 Plugins

Lists built-in extras and runs their commands. See [Plugins](#10-plugins).

### 6.6 Align & Boolean (sidebar)

Always visible in Edit mode under the right panels.

#### Align (two or more objects)

The sidebar uses icons with tooltips instead of L/C/R/T/M/B. Hover for the full name. Align needs two selected objects; distribute needs three. Disabled buttons say why.

| Control | Align |
|---|---|
| Left | Left edges |
| Horizontal centers | Horizontal center |
| Right | Right edges |
| Top | Top edges |
| Vertical centers | Vertical middle |
| Bottom | Bottom edges |
| Distribute horizontally | Even horizontal spacing |
| Distribute vertically | Even vertical spacing |

#### Boolean

| Button | Operation |
|---|---|
| Unite | Union |
| Intersect | Intersection |
| Subtract | Subtract (first minus the others) |
| Exclude | Exclusive or / exclude |

**Live preview:** hover a boolean button to see a translucent lime ghost of the result. Click to commit. The preview clears when the pointer leaves the boolean group. The same preview works from **Object** menu items.

Booleans need at least two selected **filled** shapes that can be treated as closed regions (rectangle, ellipse, closed path, or groups of those). Results become path geometry (smooth curves are sampled into polygons). Open strokes are skipped.

---

## 7. Menus

### 7.1 File

| Command | Behavior |
|---|---|
| **New** | **Ctrl+N**. Starts an empty Edit document. If the current document is not a saved `.savage` match, SaVaGe asks **Save**, **Discard**, or **Cancel** in the app. Closing the window uses the same in-app prompt. |
| **Open…** | **Ctrl+O**. Opens `.savage` or `.svg` into Edit. Photos and PNG/JPEG/WEBP/GIF/BMP/TIFF switch to Convert and attach the file. A damaged project file shows an error instead of crashing. |
| **Save** | **Ctrl+S**. Writes the current `.savage` if one is already the save target. The first save on an Unsaved document opens a location dialog. If the file changed on disk since it was opened or last saved, SaVaGe offers **Reload**, **Save As…**, **Overwrite**, or **Cancel**. |
| **Save As…** | **Ctrl+Shift+S**. Always asks for a location. The current project path changes only after a successful write. Cancel leaves the previous file (or Unsaved) as the save target. |
| **Export SVG…** | Writes an SVG file. Does not mark the project Saved. |
| **Export PNG…** | Writes a PNG snapshot at 2× resolution. Does not mark the project Saved. |

### 7.2 Edit

| Command | Behavior |
|---|---|
| **Undo** | **Ctrl+Z** |
| **Redo** | **Ctrl+Shift+Z** / **Ctrl+Y** |
| **Copy** | **Ctrl+C** |
| **Paste** | **Ctrl+V** |

### 7.3 Object

| Command | Behavior |
|---|---|
| Group / Ungroup | Group the selection; ungroup the primary selection |
| Unite / Intersect / Subtract / Exclude | Boolean ops + live hover preview |
| Simplify Path | Reduces complexity of selected paths |
| Convert Text to Outlines | Turns live text into paths |
| Make Clip Mask | Last selected shape is the mask; earlier selection is clipped; the mask is hidden |
| Release Clip Mask | Removes the clip from the selection; the mask reappears only when nothing else still uses it |
| Create Symbol / Detach Symbol | Symbol workflows |
| Commit Shape Builder | Finalize a Shape Builder session |
| New Artboard | Adds a board and fits the view |

**Clip mask recipe:** select the content first, then the mask shape last → **Make Clip Mask**. The mask must be a path, rectangle, or ellipse. If the command cannot run, a toast explains what to select.

### 7.4 View

| Command | Shortcut |
|---|---|
| Fit Artboard | **Ctrl+0** (also toolbar **Fit**) |
| Fit All Artboards | — |
| Fit Selection | **Ctrl+2** |
| Zoom 50% | — |
| Zoom 100% | **Ctrl+1** (also click the zoom %) |
| Zoom 200% | — |

### 7.5 Help

| Command | Behavior |
|---|---|
| **User Manual (PDF)…** | Opens this guide in your system PDF viewer |
| **Export Diagnostics…** | After confirmation, saves a redacted log of recent errors (no document contents, images, or full file paths). Review the file before sharing it. |
| **About SaVaGe** | Shows the application version and that the current installer is unsigned |

---

## 8. Advanced editing

### 8.1 Artboards (multi-board documents)

Treat artboards as design frames (icon set, poster variants, screens). Objects sit in shared drawing space; artboards are frames, not automatic clip parents (clip separately if you need that).

Activate a board before you draw if you want to work in that frame. Save `.savage` when board names, sizes, and layout must survive a reopen. SVG export is the interchange format; PNG is a picture of the current document.

### 8.2 Symbols

**When to use:** repeating logos, icons, UI chrome.

- Keep instances linked when many copies should stay identical.  
- **Detach** turns one instance into ordinary editable objects.  
- Deleting a symbol definition expands remaining instances first.

SVG export writes symbol definitions and instances where possible.

### 8.3 Shape Builder (professional use)

Ideal for logo marks and icon negative space:

1. Build overlapping primitives.  
2. Run Shape Builder; discard outer waste; keep the silhouette regions.  
3. Commit once.  
4. Optionally Simplify Path and turn remaining pieces into a Symbol.

Very dense stacks may still be faster if you Unite or Subtract first.

### 8.4 Mesh gradients

1. Select a filled shape.  
2. Properties → Fill → **Mesh**.  
3. Edit corner / control-point color swatches.

The canvas preview matches what you edit. Exported SVG keeps the mesh so Inkscape (and SaVaGe itself) can reopen it. Browsers that do not implement mesh fills will show a missing fill — export PNG when a raster deliverable must match the canvas.

### 8.5 Variable-width strokes

Uniform strokes use the stroke width in Properties. Paths may also store a width at each point.

| Method | Result |
|---|---|
| Properties → **Taper ends** | Automatic profile |
| Direct Select + **Alt-drag** | Manual width at a point |
| Properties → **Clear profile** | Back to uniform |

When point widths differ, SaVaGe draws a **filled ribbon** around the centerline. You edit the ribbon by moving points and widths — it is not a separate expanded outline unless you convert it some other way.

### 8.6 Perspective grid

Toolbar **Persp**:

| Mode | Guides |
|---|---|
| Off | No perspective overlay |
| 1-pt | Horizon + fan from one vanishing point |
| 2-pt | Horizon + fans from two vanishing points |

Turn **Snap** on to pull drawing coordinates onto:

- Nearby objects (bounding-box corners and midpoints)  
- Path anchors  
- Artboard corners and midpoints  
- The document grid (when **Grid** is visible) — 32 units  
- Perspective rays (when Persp is not Off)  

The snap distance stays comfortable at any zoom. Pencil, Brush, Pattern Brush, and Scatter Brush do not snap while you stroke, so freehand stays smooth.

Vanishing points start from the document frame. This release does not include draggable vanishing-point handles.

### 8.7 Brushes compared

| Brush | Geometry | Typical use |
|---|---|---|
| Calligraphy (**B**) | One closed ribbon path | Expressive strokes, ink feel |
| Pattern | Group of oriented motifs | Borders, decorative paths |
| Scatter | Group of jittered motifs | Foliage, texture accents |

---

## 9. Files, export & clipboard

### 9.1 Formats

| Format | Role | What it keeps |
|---|---|---|
| **`.savage`** | Native project | Everything: artboards, symbols, mesh, effects, widths |
| **`.svg`** | Handoff / web | Solids, linear and radial gradients, and mesh fills that Inkscape can reopen; some browsers skip mesh paint |
| **PNG** | Picture export | Visual snapshot |
| Photos and bitmaps | Convert only | Become vectors after you trace |

Opening a `.svg` restores solids, linear/radial gradients, and mesh fills when they are present. The opened SVG is an Unsaved document until you **Save** it as `.savage`. Opening a damaged `.savage` file, or a project newer than version 1, shows an error toast rather than rewriting the file.

This release **reads and writes `.savage` version 1 only**. A future version is left on disk unchanged — open it in a newer SaVaGe, or use that version’s **Save As** to make a version-1 copy. Crash-recovery files from a newer SaVaGe are also left in place.

SVG is a handoff format, not a lossless twin of `.savage`. Import drops scripts, foreignObject, animation, `<use>`, and raster `<image>` elements. Path arcs become straight segments. Skew/matrix transform lists on imported SVG are not parsed. Mesh fills export as SVG 2 and may not paint in every browser.

### 9.2 Recommended save strategy

1. Always keep a `.savage` working file (**File → Save** / **Save As…**).  
2. Export SVG for handoff to web or other editors.  
3. Export PNG for previews, social, or mesh-critical stills.  
4. Re-open SVG when you must — colors, gradients, and meshes come back into the document as Unsaved work.  
5. Export never clears **Modified**; only a successful project save does.

### 9.3 Clipboard

**Copy** writes:

- SVG text to the system clipboard (when Windows allows it)  
- An internal snapshot (including symbol masters used by copied instances)

**Paste** prefers that internal snapshot, then falls back to SVG on the clipboard. Pasted objects offset slightly so they do not sit exactly on the originals.

### 9.4 Duplicate

**Ctrl+D** duplicates the selection in the document (including groups and their children as independent copies). Duplicates sit 16 units down and to the right, next to the original in the same group or layer.

### 9.5 Recovery after a crash

While you edit, SaVaGe checkpoints unsaved work in the background (typically within a few seconds of the last change). After an unexpected close, the next launch may ask:

1. **Recover** — opens the checkpoint as an **Unsaved** document. **Save** or **Save As…** to keep it. The original `.savage` is not overwritten until you save on top of it.  
2. **Open Original** — if the recovery came from a saved project, open that file instead.  
3. **Discard Recovery** — drop the checkpoint.

Invalid recovery files are kept until you choose to remove them. Recovery is a safety net, not a substitute for **Save**.

---

## 10. Plugins

The **Plugins** tab lists extras that ship with SaVaGe. Built-in commands are part of the application, not third-party add-ons.

| Plugin | Command button | What it does |
|---|---|---|
| **Duplicate & Offset** | Duplicate selection + offset | Copies selected objects (not groups) 24 units down and right |
| **Randomize Fills** | Randomize selected fills | Assigns random palette fills to selected objects that have a fill |
| **Add Guide Rect** | Add guide rectangle | Inserts a translucent cyan rectangle as a layout guide |

Each command shows a short toast when it finishes. A successful command is one undo step; a failed or invalid command leaves the document unchanged. Use **Edit → Undo** if you want to reverse a successful command.

---

## 11. Keyboard shortcuts cheat sheet

**File** shortcuts (**Ctrl+N**, **Ctrl+O**, **Ctrl+S**, **Ctrl+Shift+S**) work in Convert and Edit unless a text field is focused.

Canvas tool, nudge, duplicate, and zoom shortcuts apply when the canvas can receive them — not while a text field, menu, or layer/artboard/symbol list is handling keys. **F10** focuses the File menu. Arrow keys move between menus and items; **Esc** closes the menu and returns to the menu button. **Tab** dismisses the menu. In Layers or Artboards, arrows move between rows, **Enter** or **Space** selects, and **F2** renames (**Esc** cancels the name). In Symbols, arrows move between names; **Enter** or **Space** places an instance.

### File

| Shortcut | Action |
|---|---|
| **Ctrl+N** | New |
| **Ctrl+O** | Open… |
| **Ctrl+S** | Save |
| **Ctrl+Shift+S** | Save As… |
| **F10** | Focus the File menu |

### Tools and canvas

| Shortcut | Action |
|---|---|
| **V** | Select |
| **A** | Direct Select |
| **H** | Pan |
| **Z** | Zoom tool |
| **R** | Rectangle |
| **O** | Ellipse |
| **L** | Line |
| **P** | Pen |
| **N** | Pencil |
| **B** | Calligraphy Brush |
| **S** | Shape Builder |
| **T** | Text |
| **Space** (hold) | Temporary pan |
| **Ctrl+Z** | Undo |
| **Ctrl+Shift+Z** / **Ctrl+Y** | Redo |
| **Ctrl+A** | Select all |
| **Ctrl+D** | Duplicate |
| **Ctrl+C** / **Ctrl+V** | Copy / Paste |
| **Ctrl+0** | Fit artboard |
| **Ctrl+1** | Zoom 100% |
| **Ctrl+2** | Fit selection |
| **Delete** / **Backspace** | Delete selection |
| **Arrows** | Nudge 1 px |
| **Shift+Arrows** | Nudge 10 px |
| **F2** | Rename the focused layer or artboard |

Polygon, Star, Pattern Brush, and Scatter Brush have no letter shortcut — click them on the tool rail. Hover a tool for its name and shortcut.

### Tool-specific

| Shortcut | Context | Action |
|---|---|---|
| **Enter** / **Esc** | Pen | Finish path |
| **Backspace** | Pen | Drop last point |
| **Enter** | Shape Builder | Commit |
| **Esc** | Shape Builder | Cancel |
| **Enter** / **Esc** | Text overlay | Keep the text and close the field |
| **Shift** | Select | Add/remove from selection |
| **Shift** | Shapes | Constrain (square, circle, 45° line) |
| **Alt** | Shape tools | Draw from center |
| **Alt-click** | Zoom tool | Zoom out |
| **Alt+drag** | Direct Select | Edit point stroke width |

Menu items do not show key badges in the title bar; the shortcuts in this section still apply. File shortcuts work from Convert as well as Edit.

---

## 12. Known limitations & best practices

### 12.1 Limitations (v0.1)

1. **Pattern Brush and Scatter Brush** spacing and jitter are fixed (no sliders yet).  
2. Perspective vanishing points are not draggable.  
3. Text outlines use the bundled **DM Sans** and **Syne** faces.  
4. Some web browsers will not paint mesh-gradient fills in exported SVG.  
5. Installers are unsigned until Authenticode signing is added. Windows SmartScreen may warn; verify the SHA-256 from the tagged release before installing.  
6. `.savage` files from a newer SaVaGe (version 2 or later) will not open in 0.1.0. The file is not converted or overwritten.

### 12.2 Best practices

| Goal | Practice |
|---|---|
| Logo from PNG | Logo preset → preview → Open in Editor → Simplify → Boolean / Shape Builder → Symbol |
| Editable master file | Always save `.savage` |
| Web SVG | Prefer solids and linear/radial gradients; use PNG for mesh-critical stills |
| Clean booleans | Work with closed fills; outline text first; skip open pencil strokes |
| Snappy drawing | Watch the status-bar time; simplify dense converts; hide or delete unused paths |
| Repeat UI chrome | Symbols over raw copies |
| Perspective sketching | Persp 1-pt or 2-pt + Snap on while blocking shapes |

### 12.3 Troubleshooting

| Symptom | Try |
|---|---|
| Convert drop does nothing | Drop a PNG, JPEG, WEBP, GIF, BMP, or TIFF — Convert now explains unsupported files |
| Convert to SVG is disabled | Attach a source first; hover the button for the reason |
| Cancel stays busy | That is expected: tracing finishes the current stage before the job exits |
| Converted, but still on Convert | Click **Open in Editor** (that is expected) |
| Trace options changed banner | Click **Convert again** — the SVG pane is the previous result until you do |
| Boolean fails | Select at least two filled closed shapes; ungroup if needed |
| Shape Builder empty | Select overlapping closed shapes first |
| Mesh looks empty in a browser | Open it in SaVaGe or Inkscape, or export PNG |
| Paste did nothing | Click the canvas first; copy from SaVaGe or paste SVG |
| Open failed | The file may not be a valid version-1 `.savage` project or SVG — check the toast. Newer project versions are not rewritten |
| Save As cancelled | The previous project path stays current; nothing is written |
| Save says the file changed on disk | Another SaVaGe window or program wrote the file. **Reload** takes the disk copy (and discards unsaved edits in this window), **Save As…** keeps both, **Overwrite** replaces the disk file, **Cancel** leaves both as they are |
| Save failed because the file is in use | Close the other program using the file, then Save again |
| Save failed because the disk is full | Free space, then Save or **Save As…** to another drive |
| Export left the project Modified | Expected — export is not a project save |
| Recovery prompt after a crash | Recover opens Unsaved work; Save As to keep it. Open Original leaves the checkpoint behind |
| Need error details for support | **Help → Export Diagnostics…**, review the JSON, then share only that file |
| Windows warns the installer is unknown | Expected for unsigned internal builds. Check **Help → About SaVaGe** and the release SHA-256 |
| Told a tagged setup was withdrawn | Keep `.savage` files. Leave **Delete the application data** unchecked. Install the last verified setup you were given, or wait if none exists |
| Installed an older setup on purpose | Version-1 files still open. Newer projects are not converted. Use the newer SaVaGe, or **Save As** a version-1 copy from that app before going back |
| Need a previous tagged setup | There is no in-app updater. Run the older `SaVaGe_<version>_x64-setup.exe` you kept and check its SHA-256 |
| Asked for logs after a bad build | **Help → Export Diagnostics…**, review the JSON, share only if you consent. Nothing is uploaded automatically |
| Setup stops and mentions WebView2 | Connect to the internet and retry, or install the [Evergreen WebView2 runtime](https://developer.microsoft.com/microsoft-edge/webview2/) then run setup again |
| Uninstall asked to close SaVaGe | Close the app first. Setup will not replace or remove a running `SaVaGe.exe` |
| Recovery gone after uninstall | The uninstaller’s **Delete the application data** box removes `%APPDATA%\com.savage.svgstudio`. Leave it unchecked to keep checkpoints |
| Heavy lag | Simplify paths; lower convert color precision; hide blur/shadow temporarily |
| Clicking a tool key types a letter | Click the canvas so a Properties field is not focused |
| Window too small / 200% scaling | Maximize; supported minimum is 960×600. Chrome wraps rather than hiding Convert or Edit controls |

---

## 13. Glossary

| Term | Meaning in SaVaGe |
|---|---|
| **Artboard** | Named frame with size and background; several can live in one file |
| **Boolean** | Combine shapes: unite, intersect, subtract, or exclude |
| **Clip mask** | One shape hiding parts of others |
| **Instance** | A placed copy of a symbol master |
| **Mesh** | A grid of colored points interpolated as a fill |
| **Ribbon** | A variable-width stroke drawn as a filled outline around a centerline |
| **Shape Builder** | Click regions of overlapping shapes to keep or discard them |
| **Speckle** | Tiny unwanted islands removed during tracing |
| **`.savage`** | SaVaGe’s native project file (full document) |
| **Recovery** | A crash checkpoint of unsaved work; Recover opens it as Unsaved |

---

## Appendix A — Suggested learning path

1. Convert a simple logo PNG; use **Open in Editor**.  
2. Recolor with Properties; rename layers.  
3. Draw primitives; Unite; Shape Builder.  
4. Create a Symbol; place twice; detach one.  
5. Try Brush, Pattern, and Scatter.  
6. Enable 1-pt perspective and sketch with Snap.  
7. Save `.savage`; export SVG and PNG; reopen both and compare.  
8. Run Plugins → Randomize selected fills once for fun, then Undo.

---

## Appendix B — Product identity

**SaVaGe** blends **SVG** with a bold craft aesthetic: graphite interface, lime accent, and expressive typography (Syne / DM Sans).

For help in the app, use **Help → User Manual (PDF)…** or **Help → About SaVaGe**.

---

*End of user manual.*
