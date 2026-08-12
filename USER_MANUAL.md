# SaVaGe User Manual

**Product:** SaVaGe — desktop image→SVG converter and vector editor  
**Platform:** Windows-first (Tauri 2)  
**Document version:** matches application v0.1.0

---

## How to use this manual

| If you are… | Start here |
|---|---|
| New to vector graphics | [Quick start](#1-quick-start) → [Convert](#3-convert-mode) → [Edit basics](#4-edit-mode-basics) |
| Comfortable with Illustrator / Inkscape | [Workspace map](#2-workspace-map) → [Tools reference](#5-tools-reference) → [Advanced](#8-advanced-editing) |
| Integrating or extending SaVaGe | [File formats](#9-files-export--clipboard) → [Plugins](#10-plugins) → [Limitations](#12-known-limitations--best-practices) |

In the app: **Help → User Manual (PDF)…** opens this guide in your system PDF viewer.

Keyboard shortcuts appear in **bold** (for example **V** for Select). Menu paths use **File → Open…** style.

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

Run SaVaGe from your project folder (developer build):

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
pnpm tauri:dev
```

Or open the installed desktop app if you built a release with `pnpm tauri:build`.

SaVaGe opens in **Convert** mode: dark graphite UI, lime accent, SaVaGe wordmark.

### 1.2 Your first conversion (beginner path)

1. Drag a PNG, JPEG, WEBP, GIF, BMP, or TIFF onto the drop zone — or click **Open Image…**.
2. Pick a preset that matches the art:
   - **Logo / flat** — logos, icons, flat color art  
   - **Photo** — photographs and soft gradients  
   - **Line art** — sketches, comics, high-contrast line drawings  
   - **Pixel** — pixel art / hard block shapes  
3. Optionally tweak **Color precision**, **Filter speckle**, **Corner threshold**, **Path precision**, and **Mode**.
4. Click **Convert to SVG**.
5. When tracing finishes, SaVaGe switches to **Edit** mode with vector layers ready to refine.

### 1.3 Your first edit

1. Press **V** (Select). Click a shape; drag to move. Use corner/edge handles to resize; use the rotate handle to rotate.
2. Open the **Props** tab on the right. Change fill color or opacity.
3. **File → Save Project…** and save a `.savage` file (best fidelity).  
   Or **File → Export SVG…** / **Export PNG…** for delivery.

### 1.4 Five-minute power path (experienced users)

Convert with **Logo** preset → Edit → boolean Unite overlapping paths → Shape Builder (**S**) to carve → Create Symbol → Mesh fill on a hero shape → Export SVG + keep `.savage` master.

---

## 2. Workspace map

```
┌──────────────────────────────────────────────────────────────┐
│ TitleBar: SaVaGe · File  Edit  Object  View  Help             │
├──────────────────────────────────────────────────────────────┤
│ Toolbar: Convert | Edit · Zoom · Fit · Grid · Snap · Persp │
├────┬───────────────────────────────────────────┬─────────────┤
│    │                                           │ Layers      │
│ T  │         Main: Convert UI or Canvas        │ Props       │
│ o  │                                           │ Boards      │
│ o  │                                           │ Symbols     │
│ l  │                                           │ Plug        │
│ s  │                                           │ Align/Bool  │
├────┴───────────────────────────────────────────┴─────────────┤
│ Status: zoom · selection count · mode · tool · frame ms      │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 Modes

| Mode | Purpose |
|---|---|
| **Convert** | Import raster art and trace it to SVG with vtracer (Rust) |
| **Edit** | Full vector scene: draw, style, boolean, symbols, export |

Switch with the **Convert | Edit** control in the toolbar. Successful conversion also jumps to Edit automatically.

### 2.2 Status bar

Bottom strip shows:

- Zoom percentage  
- Number of selected objects  
- Current mode and active tool  
- Last frame time in milliseconds (warns visually when over ~16 ms)

Transient toasts (boolean results, clip masks, plugin messages) appear over the main view.

---

## 3. Convert mode

Convert turns bitmaps into editable vector paths. Tracing runs in Rust (`vtracer`) for speed and quality.

### 3.1 Loading an image

| Method | Notes |
|---|---|
| Drag and drop | Preferred; uses the file path from the OS drop |
| **Open Image…** | File dialog for png / jpg / jpeg / gif / webp / bmp / tif / tiff |

While converting, the drop zone is disabled and a progress indicator appears.

### 3.2 Presets (start here)

Presets apply a full option set. Choose the closest match, then fine-tune.

| Preset | Best for | Technical tendency |
|---|---|---|
| **Logo / flat** | Logos, icons, UI graphics | Color mode; moderate color precision; light speck filtering; spline paths |
| **Photo** | Photos, soft shading | Slightly coarser color, stronger speck filter |
| **Line art** | Ink drawings, comics | Binary-style color treatment; very low color precision |
| **Pixel** | Pixel art | Pixel path mode; path precision 0; no speck filter |

### 3.3 Trace options (detail)

| Control | What it does | Amateur tip | Pro tip |
|---|---|---|---|
| **Color precision** | How finely colors are quantized | Higher = more colors / heavier SVG | Lower for flat brand marks; raise for photos |
| **Filter speckle** | Removes tiny islands | Increase if noisy | Trade detail vs cleanliness before Simplify Path |
| **Corner threshold** | Corner vs curve bias | Default is fine for logos | Lower for sharper corners; higher for smoother bends |
| **Path precision** | Numeric / geometric fidelity of paths | Leave default unless SVG is huge | Lower to reduce node count after convert |
| **Mode** | `spline` / `polygon` / `pixel` | Use **spline** for logos | **polygon** for faceted look; **pixel** for 1:1 pixel blocks |

Some engine knobs (splice threshold, hierarchical clustering, layer difference, max dimension) are applied by presets internally and are not all exposed in the form.

### 3.4 Preview and continue

After conversion you get a side-by-side **Raster | SVG** preview when available. SaVaGe loads the SVG into the document store and opens **Edit**.

**Open in Editor** is available if SVG markup was already produced and you stayed on Convert.

### 3.5 Convert workflow tips

- Start with the smallest useful image that still has clean edges (very large photos produce heavy path sets).  
- Logo art with solid fills converts cleaner than anti-aliased soft shadows.  
- After convert, use **Object → Simplify Path** on noisy selections before booleans.

---

## 4. Edit mode basics

### 4.1 Navigating the canvas

| Action | How |
|---|---|
| Pan | **H** (Pan tool), hold **Space** + drag, or middle-mouse drag |
| Zoom | Scroll wheel (zooms toward cursor) |
| Zoom buttons | Toolbar **−** / **%** / **+** |
| Fit active artboard | Toolbar **Fit**, **View → Fit Artboard**, or **Ctrl+0** |
| Fit selection | **View → Fit Selection** or **Ctrl+2** |
| Zoom 100% | Click zoom %, **View → Zoom 100%**, or **Ctrl+1** |

### 4.2 Selecting and transforming

1. Activate **Select** (**V**).  
2. Click an object. **Shift+click** to add/remove from the selection.  
3. Drag the body to move.  
4. Drag handles to resize (**Shift** constrains).  
5. Use the rotate handle to rotate.  
6. Arrow keys nudge 1 px; **Shift+arrows** nudge 10 px.

**Ctrl+A** selects all. **Delete** / **Backspace** deletes the selection (ignored while typing in fields).

### 4.3 Undo and history

| Action | Shortcut / menu |
|---|---|
| Undo | **Ctrl+Z** · Edit → Undo |
| Redo | **Ctrl+Shift+Z** or **Ctrl+Y** · Edit → Redo |

History is document-scoped (Zundo). Prefer finishing a stroke before undoing mid-drag when possible.

### 4.4 Layers at a glance

Open the **Layers** tab:

- Top of the list ≈ front of the stack  
- Click to select  
- Toggle visibility and lock  
- Double-click to rename  
- Drag to reorder among root items  
- Groups show nested children indented

### 4.5 Properties at a glance

Open **Props** (first selected object):

- Position **X / Y**, rotation **R**, opacity  
- **W / H** are informational (resize on-canvas with handles)  
- Fill and stroke paint editors  
- Stroke width  
- Effects: blur, drop shadow  
- Text and symbol-specific controls when relevant  

---

## 5. Tools reference

Tools live in the left rail (Edit mode only). Click an icon or use a shortcut.

### 5.1 Navigation & selection

#### Select — **V**

Hit-tests objects under the pointer. Supports move, multi-select (**Shift**), scale, and rotate via chrome handles.

#### Direct Select — **A**

Edits individual path points (anchors). Drag a point to move it (handles move with the point when present).

**Variable width:** hold **Alt** and drag a point horizontally to change that point’s local stroke width. See [Variable-width strokes](#85-variable-width-strokes).

#### Pan — **H**

Drag the canvas. Prefer Space-pan for temporary panning without leaving your draw tool.

### 5.2 Shape tools

| Tool | Shortcut | Draw | Modifiers |
|---|---|---|---|
| Rectangle | **R** | Drag | **Shift** square · **Alt** from center |
| Ellipse | **O** | Drag | **Shift** circle · **Alt** from center |
| Line | **L** | Drag | — |
| Polygon | — | Drag radius | Regular hexagon (6 sides) |
| Star | — | Drag radius | 5-point star |

Shapes land as scene nodes with default fill/stroke (brand lime accent where applicable).

### 5.3 Path tools

#### Pen — **P**

Click to place corner anchors. Drag while placing to create Bézier handles. Click near the first point to close.  

| Key | Action |
|---|---|
| **Enter** or **Esc** | Finish the path |
| **Backspace** | Remove the last point |

#### Pencil

Freehand stroke simplified into an open path. Good for roughing silhouettes; refine with Direct Select or Simplify Path.

#### Brush (calligraphy) — **B**

Speed-sensitive calligraphy: faster motion → thinner ribbon. Result is a **closed filled path** (not a uniform stroke), which booleans and fills treat as solid geometry.

### 5.4 Pattern Brush & Scatter Brush

| Tool | Result |
|---|---|
| **Pattern Brush** | Chevron motifs stamped along your stroke at regular spacing, tangent-aligned, grouped |
| **Scatter Brush** | Leaf-like motifs with position jitter, rotation noise, and scale variation, grouped |

**How to use:** select the tool → drag a gesture → release. SaVaGe creates a group containing stamp paths.

**Pro note:** stamps are real vector paths. Ungroup (or expand by detaching structure manually) if you need per-stamp boolean work. Spacing/jitter are currently fixed in-tool (not yet exposed as brush settings UI).

### 5.5 Shape Builder — **S**

Interactive region sculpting for overlapping filled shapes (rect, ellipse, closed path; up to **four** selected shapes).

1. Select two or more overlapping shapes.  
2. Activate **Shape Builder** (**S**). SaVaGe decomposes atomic regions.  
3. Regions tint **green** (kept) or **red** (discarded). Click a region to toggle.  
4. Press **Enter** (or **Object → Commit Shape Builder** / sidebar button) to union kept regions into one path and remove sources.  
5. **Esc** cancels and returns to Select.

Requires flattenable closed geometry. Open strokes and text are not valid region sources until converted/outlined.

### 5.6 Text — **T**

Click the canvas to place a text object (default “Text”), then edit inline. Double-click existing text to edit.  

**Enter** commits; **Esc** cancels the overlay edit.  

Typography fields: content, font size, weight (Props). Face defaults to the UI family (`DM Sans Variable`).

**Convert Text to Outlines:** Object menu or Props button. Implementation rasterizes the text glyph silhouette and extracts contours — useful for logo lockups, not a full font-outline engine. Prefer outlining late in the pipeline.

---

## 6. Panels

### 6.1 Layers

Hierarchical list of the scene graph. Use it for selection, visibility, locking, naming, and root reordering. Nested group children appear indented.

### 6.2 Props (Properties)

Context-sensitive inspector for the **first** selected node.

#### Paint editor (fill / stroke)

| Type | Behavior |
|---|---|
| **Solid** | Single color |
| **Linear** | Linear gradient with editable stop colors |
| **Radial** | Radial gradient with editable stop colors |
| **Mesh** | Grid mesh gradient; edit corner (control point) colors |
| **None** | No paint |

Stroke width uses a slider. Mesh fills are rasterized for canvas preview; SVG export approximates mesh with a patterned set of flat polygons (see limitations).

#### Path: variable width

For path objects:

- **Taper ends** — applies a sine-like width profile along each subpath  
- **Clear profile** — removes per-point widths (returns to uniform stroke width)

#### Effects

- **Blur** — Gaussian-style blur via canvas filter / SVG filter on export  
- **Drop shadow** — offset, blur, color/opacity (enable via shadow controls)

#### Clip

If the node has a clip mask, release it from Props or Object menu. Otherwise a short tip explains the make-mask workflow.

### 6.3 Boards (Artboards)

Multiple artboards live in one document.

| Action | How |
|---|---|
| Activate | Click a board (fits view to it) |
| Add | **+** or **Object → New Artboard** |
| Rename | Double-click the name |
| Delete | × (at least one board must remain) |

The active artboard draws with a stronger accent frame and label on the canvas. View → **Fit All Artboards** frames every board.

### 6.4 Symbols

Reusable masters stored outside the main drawing tree; instances reference a master.

| Action | How |
|---|---|
| Create | Select artwork → **+** / Create from selection / **Object → Create Symbol** |
| Place | Click a symbol name in the panel |
| Detach | Select an instance → Detach (panel, Props, or Object menu) |
| Delete definition | × on the symbol row (instances may draw empty if master is gone) |

Creating a symbol replaces the selection with an instance of the new master.

### 6.5 Plug (Plugins)

Lists registered plugins and runs their commands. Ships with three built-ins (see [Plugins](#10-plugins)).

### 6.6 Align & Boolean (sidebar)

Always visible in Edit mode under the right panels.

#### Align (two or more objects)

| Button | Align |
|---|---|
| L | Left |
| C | Horizontal center |
| R | Right |
| T | Top |
| M | Vertical middle |
| B | Bottom |

Distribute-horizontal / distribute-vertical exist in code but are not exposed in this UI build.

#### Boolean

| Button | Operation |
|---|---|
| Unite | Union |
| Inter | Intersection |
| Sub | Subtract (first minus others) |
| Xor | Exclusive or / exclude |

**Live preview:** hover (or focus) a boolean button to see a translucent lime ghost of the result. Click to commit. Preview clears when the pointer leaves the boolean group. The same preview works from **Object** menu items.

Booleans require at least two selected **filled** shapes that can be flattened (rect, ellipse, closed path, groups of those). Results become polygonal path geometry (curves are sampled).

---

## 7. Menus

### 7.1 File

| Command | Behavior |
|---|---|
| **Open…** | Opens `.savage` or `.svg` into Edit. Raster types switch to Convert mode (load the image via the Convert drop zone / Open Image). |
| **Save Project…** | Writes full document JSON as `.savage` |
| **Export SVG…** | Writes serialized SVG |
| **Export PNG…** | Renders via Rust (`resvg`), typically at 2× scale |

### 7.2 Edit

Undo, Redo, Copy, Paste — see shortcuts table.

### 7.3 Object

| Command | Behavior |
|---|---|
| Group / Ungroup | Group selection; ungroup primary selection |
| Unite / Intersect / Subtract / Exclude | Boolean ops + live hover preview |
| Simplify Path | Reduces complexity of selected paths |
| Convert Text to Outlines | Contour extraction from text |
| Make Clip Mask | Last selected shape is the mask; earlier selection is clipped; mask is hidden |
| Release Clip Mask | Restores mask visibility; clears clip links on selection |
| Create Symbol / Detach Symbol | Symbol workflows |
| Commit Shape Builder | Finalize Shape Builder session |
| New Artboard | Adds a board and fits the view |

**Clip mask recipe:** select content first, then the mask shape last → **Make Clip Mask**. Mask must be a path, rect, or ellipse.

### 7.4 View

Fit Artboard, Fit All Artboards, Fit Selection, Zoom 50% / 100% / 200%.

### 7.5 Help

| Command | Behavior |
|---|---|
| **User Manual (PDF)…** | Opens the bundled `USER_MANUAL.pdf` in the system PDF viewer |

Regenerate the PDF after editing the Markdown with `pnpm manual:pdf`.

---

## 8. Advanced editing

### 8.1 Artboards (multi-board documents)

Treat artboards as design frames (icons set, poster variants, mobile screens). Export SVG can include all boards or focus workflows around the active board (fit / PNG export uses the document serialization path — prefer saving `.savage` when board metadata matters).

Activate a board before drawing if you want new content mentally scoped to that frame; nodes are free-positioned in world space (artboards are guides/frames, not strict clip parents unless you clip).

### 8.2 Symbols / components

**When to use:** repeating logos, icons, UI chrome.

**Instance vs detach:**

- Keep instances linked when you want many copies of one master definition in the file.  
- **Detach** expands an instance into ordinary editable nodes (independent copies).

SVG export emits `<symbol>` definitions and `<use>` instances where possible.

### 8.3 Shape Builder (professional use)

Ideal for logo marks and icon negative space:

1. Build overlapping primitives.  
2. Run Shape Builder; discard outer waste; keep the silhouette regions.  
3. Commit once.  
4. Optionally Simplify Path and convert remaining pieces into a Symbol.

Region decomposition uses boolean intersect/subtract over selection subsets (capped at four shapes). Complex illustrations may need staged builds (boolean first, then Shape Builder).

### 8.4 Mesh gradients

1. Select a filled shape.  
2. Props → Fill → **Mesh**.  
3. Edit corner / control-point color swatches.

Canvas preview bilinear-samples the mesh into a pattern clipped to the shape.  

**Export note:** SVG mesh gradients are not a portable SVG standard feature. SaVaGe approximates with a `<pattern>` of polygons. For maximum fidelity across editors, keep a `.savage` master and export PNG for final raster deliverables when mesh appearance is critical.

### 8.5 Variable-width strokes

Uniform strokes use `StrokeStyle.width`. Paths may also store per-point `strokeWidth`.

| Method | Result |
|---|---|
| Props → **Taper ends** | Automatic profile |
| Direct Select + **Alt-drag** | Manual width at a point |
| Props → **Clear profile** | Back to uniform |

When any point width differs from the base width, SaVaGe draws a **filled ribbon** outline instead of a canvas `stroke()`. That ribbon is editable geometry only insofar as the centerline points and widths change — it is not a separate expanded outline node unless you otherwise convert it.

### 8.6 Perspective grid

Toolbar **Persp**:

| Mode | Guides |
|---|---|
| Off | No perspective overlay |
| 1-pt | Horizon + fan from one vanishing point |
| 2-pt | Horizon + fans from two vanishing points |

Enable **Snap** to pull drawing coordinates onto the nearest guide ray (threshold scales with zoom).  

**Important:** Snap here means **perspective ray snap**, not general document-grid snap. Grid is a visual overlay toggled separately.

Vanishing points are initialized from the document view box; v0.1 does not expose interactive VP handles in the UI.

### 8.7 Brushes compared

| Brush | Geometry | Typical use |
|---|---|---|
| Calligraphy (**B**) | One closed ribbon path | Expressive strokes, ink feel |
| Pattern | Group of oriented motifs | Borders, decorative paths |
| Scatter | Group of jittered motifs | Foliage, texture accents |

---

## 9. Files, export & clipboard

### 9.1 Formats

| Format | Role | Fidelity |
|---|---|---|
| **`.savage`** | Native project (JSON scene graph) | Full: artboards, symbols, mesh, effects, widths |
| **`.svg`** | Interchange / web | High for solids and basic gradients; mesh approximated; some import gaps |
| **PNG** | Raster export | Visual snapshot (scaled render) |
| Raster inputs | Convert only | Become vectors after trace |

### 9.2 Recommended save strategy

1. Always keep a `.savage` working file.  
2. Export SVG for handoff to web / other editors.  
3. Export PNG for previews, social, or mesh-critical stills.  
4. Re-open SVG when you must — but expect gradient/`url(#…)` paints to simplify on import (solids preferred for SVG round-trips in v0.1).

### 9.3 Clipboard

**Copy** writes:

- SVG text to the system clipboard (when permitted)  
- An internal session snapshot (including symbol masters referenced by copied instances)

**Paste** prefers the internal snapshot, then falls back to parsing SVG from the clipboard. Pasted objects offset by +24,+24 world units.

### 9.4 Duplicate

**Ctrl+D** duplicates the selection in-document (fast iteration without clipboard).

---

## 10. Plugins

### 10.1 Built-in commands (Plug tab)

| Plugin | What it does |
|---|---|
| **Duplicate & Offset** | Copies selected non-group objects +24,+24 |
| **Randomize Fills** | Assigns random palette fills to selected fillable nodes |
| **Add Guide Rect** | Inserts a translucent cyan rectangle as a layout guide |

Commands toast status messages when finished.

### 10.2 For developers (plugin API)

SaVaGe exposes a lightweight in-app plugin registry:

- `registerPlugin({ id, name, description?, commands[] })`  
- Each command receives an API: selection, get/update/add/delete nodes, export SVG string, notify, markDirty  
- `runPluginCommand(pluginId, commandId)`  
- UI lists whatever is registered (built-ins register on app start)

This is an in-process TypeScript extension surface (not a sandboxed third-party store). Suitable for studio scripts and experimental tools.

---

## 11. Keyboard shortcuts cheat sheet

### Global (canvas focused)

| Shortcut | Action |
|---|---|
| **V** | Select |
| **A** | Direct Select |
| **H** | Pan |
| **R** | Rectangle |
| **O** | Ellipse |
| **L** | Line |
| **P** | Pen |
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

### Tool-specific

| Shortcut | Context | Action |
|---|---|---|
| **Enter** / **Esc** | Pen | Finish path |
| **Backspace** | Pen | Drop last point |
| **Enter** | Shape Builder | Commit |
| **Esc** | Shape Builder | Cancel |
| **Enter** / **Esc** | Text overlay | Commit / cancel |
| **Shift** | Select / shapes | Multi-select / constrain |
| **Alt** | Shape tools | Draw from center |
| **Alt+drag** | Direct Select | Edit point stroke width |

Menu items do not display accelerator labels in the title bar; shortcuts are handled by the editor viewport.

---

## 12. Known limitations & best practices

### 12.1 Limitations (v0.1)

1. **Mesh → SVG** is an approximation (`<pattern>` polygons), not a native SVG mesh.  
2. **Opening SVG** currently restores solid/`none` paints reliably; `url(#gradient)` fills may not fully round-trip — use `.savage` for gradient/mesh masters.  
3. **File → Open** on a raster switches to Convert but does not auto-attach the file to the drop zone; use Convert’s Open Image / drag-drop.  
4. **Snap** is perspective-ray snap only (when Persp ≠ Off).  
5. **Props W/H** are read-only; transform on canvas.  
6. **Shape Builder** supports up to four selected flattenable shapes.  
7. **Text → outlines** uses raster contouring, not TrueType/CFF glyph extraction.  
8. **Help** menu is empty; distribute-align UI is not exposed yet.  
9. Pattern/Scatter brush parameters are fixed in this release.

### 12.2 Best practices

| Goal | Practice |
|---|---|
| Logo from PNG | Logo preset → Simplify → Boolean/Shape Builder → Symbol |
| Editable master file | Always save `.savage` |
| Web SVG | Prefer solids + linear/radial; expand critical meshes to PNG or simplified geometry |
| Clean booleans | Work with closed fills; convert text/strokes to fills first |
| Performance | Watch status-bar ms; simplify dense converts; hide unused boards’ complexity by deleting unused paths |
| Repeat UI chrome | Symbols over raw duplicates |
| Perspective sketching | Persp 1-pt/2-pt + Snap on while blocking shapes |

### 12.3 Troubleshooting

| Symptom | Try |
|---|---|
| Boolean fails | Ensure ≥2 filled closed shapes; ungroup if needed; convert strokes to filled ribbons or shapes |
| Shape Builder empty | Select overlapping flattenable shapes first; max 4 |
| Mesh looks banded in SVG | Expected approximation; use PNG or `.savage` |
| Paste did nothing | Focus canvas; ensure clipboard has SVG or a prior SaVaGe copy |
| Heavy lag | Simplify paths; reduce convert color precision; hide effects temporarily |

---

## 13. Glossary

| Term | Meaning in SaVaGe |
|---|---|
| **Artboard** | Named frame/guide with size and background; multi-board documents supported |
| **Boolean** | Path union / intersection / difference / xor via Rust `i_overlay` |
| **Clip mask** | One shape clipping others via `clipPath` |
| **Instance** | Placed reference to a symbol master |
| **Mesh** | Grid of colored control points interpolated as a fill |
| **Ribbon** | Variable-width stroke drawn as a filled outline around a centerline |
| **Scene graph** | Typed document nodes (`SvgDocument`) — source of truth while editing |
| **Shape Builder** | Interactive keep/discard of boolean regions |
| **Speckle** | Tiny unwanted regions removed during tracing |
| **vtracer** | Rust vectorization engine behind Convert |
| **`.savage`** | Native JSON project format |

---

## Appendix A — Suggested learning path

1. Convert a simple logo PNG.  
2. Recolor with Props; rename layers.  
3. Draw primitives; Unite; Shape Builder.  
4. Create a Symbol; place twice; detach one.  
5. Try Brush, Pattern, Scatter.  
6. Enable 1-pt perspective and sketch with Snap.  
7. Save `.savage`; export SVG and PNG; reopen both and compare fidelity.  
8. Run Plug → Randomize Fills once for fun, then Undo.

---

## Appendix B — Support & product identity

**SaVaGe** blends **SVG** with a bold “savage” craft aesthetic: graphite UI (`#0B0D10`), lime accent (`#B8FF3C`), and expressive typography (Syne / DM Sans).

For development builds, issues, and roadmap context, see the project plan (`savage_svg_studio_2bf62e1a.plan.md`) and `checklist.md` in the repository.

---

*End of user manual.*
