# SaVaGe User Manual

**Product:** SaVaGe — image-to-SVG converter and vector editor for Windows  
**Document version:** matches application v0.1.0

---

## How to use this manual

| If you are… | Start here |
|---|---|
| New to vector graphics | [Quick start](#1-quick-start) → [Convert](#3-convert-mode) → [Edit basics](#4-edit-mode-basics) |
| Comfortable with Illustrator / Inkscape | [Workspace map](#2-workspace-map) → [Tools reference](#5-tools-reference) → [Advanced](#8-advanced-editing) |
| Looking up a menu or key | [Menus](#7-menus) → [Keyboard shortcuts](#11-keyboard-shortcuts-cheat-sheet) |

Inside SaVaGe, **Help → User Manual (PDF)…** opens this guide in your usual PDF viewer.

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

Open SaVaGe the same way you open any Windows app:

- Double-click the **SaVaGe** shortcut on the desktop or in the Start menu, or  
- Double-click `SaVaGe.exe` in the folder where you installed it.

SaVaGe opens in **Convert** mode: dark graphite window, lime accent, SaVaGe wordmark.

You do not need a terminal, PowerShell, or developer tools to run the program.

### 1.2 Your first conversion

1. Drag a PNG, JPEG, WEBP, GIF, BMP, or TIFF onto the drop zone — or click **Open Image…**.
2. Pick a preset that matches the art:
   - **Logo / flat** — logos, icons, flat color art  
   - **Photo** — photographs and soft gradients  
   - **Line art** — sketches, comics, high-contrast line drawings  
   - **Pixel** — pixel art / hard block shapes  
3. Optionally tweak **Color precision**, **Filter speckle**, **Corner threshold**, **Path precision**, and **Mode**.
4. Click **Convert to SVG**.
5. Check the side-by-side **Raster | SVG** preview.
6. Click **Open in Editor** (or switch the toolbar to **Edit**) to refine the vectors.

You can also start from **File → Open…**: choosing a photo or PNG switches you to Convert and attaches that file automatically.

### 1.3 Your first edit

1. Press **V** (Select). Click a shape; drag to move. Use corner and edge handles to resize; use the rotate handle to rotate.
2. Open the **Props** tab on the right. Change fill color or opacity. **W** and **H** set the object’s on-canvas size.
3. **File → Save Project…** and save a `.savage` file (best fidelity).  
   Or **File → Export SVG…** / **Export PNG…** for delivery.

### 1.4 Five-minute power path

Convert with **Logo** preset → **Open in Editor** → Unite overlapping paths → Shape Builder (**S**) to carve → Create Symbol → Mesh fill on a hero shape → Export SVG and keep a `.savage` master.

---

## 2. Workspace map

```
┌──────────────────────────────────────────────────────────────┐
│ Title bar: SaVaGe · File  Edit  Object  View  Help           │
├──────────────────────────────────────────────────────────────┤
│ Toolbar: Convert | Edit · Zoom · Fit · Grid · Snap · Persp   │
├────┬───────────────────────────────────────────┬─────────────┤
│    │                                           │ Layers      │
│ T  │         Main: Convert UI or Canvas        │ Props       │
│ o  │                                           │ Boards      │
│ o  │                                           │ Symbols     │
│ l  │                                           │ Plug        │
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
- Last screen-refresh time (turns amber when the drawing is heavy)

Short confirmation messages (boolean results, clip masks, plugin actions) appear as toasts over the main view.

---

## 3. Convert mode

Convert turns bitmaps into editable vector paths.

### 3.1 Loading an image

| Method | Notes |
|---|---|
| Drag and drop | Drop a raster file onto the large drop zone |
| **Open Image…** | File dialog for png / jpg / jpeg / gif / webp / bmp / tif / tiff |
| **File → Open…** | Same raster types; SaVaGe switches to Convert and attaches the file |

A thumbnail of the source appears after the file is attached. While converting, the drop zone is disabled and a progress indicator appears. Non-image files dropped on Convert are ignored.

### 3.2 Presets (start here)

Presets apply a full option set. Choose the closest match, then fine-tune.

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

After conversion you get a side-by-side **Raster | SVG** preview. The traced drawing is already loaded into the document.

- Click **Open in Editor** to refine it on the canvas.  
- Or switch the toolbar to **Edit** at any time.  
- Stay on Convert if you want to change options and convert again before editing.

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
| Fit active artboard | Toolbar **Fit**, **View → Fit Artboard**, or **Ctrl+0** |
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

A full drag, stroke, or resize counts as one undo step. Switching tools while you are still dragging finishes that shape first.

### 4.4 Layers at a glance

Open the **Layers** tab:

- Top of the list ≈ front of the stack  
- Click to select  
- Toggle visibility and lock  
- Double-click to rename  
- Drag to reorder among top-level items  
- Groups show nested children indented

### 4.5 Properties at a glance

Open **Props** (it always inspects the **first** object in the selection):

- Position **X / Y**, size **W / H**, rotation **R**, opacity  
- Fill and stroke  
- Stroke width  
- Effects: blur, drop shadow  
- Extra controls for text and symbols when those are selected  

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

Typography fields in Props: content, font size, weight. New text uses **DM Sans**.

**Convert Text to Outlines:** **Object** menu or the button in Props. SaVaGe turns the letters into real paths using the bundled faces **DM Sans** and **Syne**. Outline late if you still need to edit the live wording. Other font names will outline with the closest bundled face.

---

## 6. Panels

### 6.1 Layers

Hierarchical list of everything on the canvas. Use it for selection, visibility, locking, naming, and reordering. Nested group children appear indented.

### 6.2 Props (Properties)

Context-sensitive inspector for the **first** selected object.

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

If the object has a clip mask, release it from Props or **Object → Release Clip Mask**. Otherwise a short tip explains how to make one.

### 6.3 Boards (Artboards)

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
| Detach | Select an instance → Detach (panel, Props, or **Object → Detach Symbol**) |
| Delete definition | × on the symbol row — placed copies are expanded into ordinary objects first so artwork is not lost |

Creating a symbol replaces the selection with an instance of the new master.

### 6.5 Plug (Plugins)

Lists built-in extras and runs their commands. See [Plugins](#10-plugins).

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

Even spacing (distribute) is not in the sidebar in this release.

#### Boolean

| Button | Operation |
|---|---|
| Unite | Union |
| Inter | Intersection |
| Sub | Subtract (first minus the others) |
| Xor | Exclusive or / exclude |

**Live preview:** hover a boolean button to see a translucent lime ghost of the result. Click to commit. The preview clears when the pointer leaves the boolean group. The same preview works from **Object** menu items.

Booleans need at least two selected **filled** shapes that can be treated as closed regions (rectangle, ellipse, closed path, or groups of those). Results become path geometry (smooth curves are sampled into polygons). Open strokes are skipped.

---

## 7. Menus

### 7.1 File

| Command | Behavior |
|---|---|
| **Open…** | Opens `.savage` or `.svg` into Edit. Photos and PNG/JPEG/WEBP/GIF/BMP/TIFF switch to Convert and attach the file. A damaged project file shows an error instead of crashing. |
| **Save Project…** | Writes the full document as `.savage` |
| **Export SVG…** | Writes an SVG file |
| **Export PNG…** | Writes a PNG snapshot (typically at 2× resolution) |

There is no separate “New” command: start from Convert, or **Open…** another file.

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

Fit Artboard, Fit All Artboards, Fit Selection, Zoom 50% / 100% / 200%.

### 7.5 Help

| Command | Behavior |
|---|---|
| **User Manual (PDF)…** | Opens this guide in your system PDF viewer |

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
2. Props → Fill → **Mesh**.  
3. Edit corner / control-point color swatches.

The canvas preview matches what you edit. Exported SVG keeps the mesh so Inkscape (and SaVaGe itself) can reopen it. Browsers that do not implement mesh fills will show a missing fill — export PNG when a raster deliverable must match the canvas.

### 8.5 Variable-width strokes

Uniform strokes use the stroke width in Props. Paths may also store a width at each point.

| Method | Result |
|---|---|
| Props → **Taper ends** | Automatic profile |
| Direct Select + **Alt-drag** | Manual width at a point |
| Props → **Clear profile** | Back to uniform |

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

Opening a `.svg` restores solids, linear/radial gradients, and mesh fills when they are present. Opening a damaged `.savage` file shows an error toast rather than a blank crash.

### 9.2 Recommended save strategy

1. Always keep a `.savage` working file.  
2. Export SVG for handoff to web or other editors.  
3. Export PNG for previews, social, or mesh-critical stills.  
4. Re-open SVG when you must — colors, gradients, and meshes come back into the document.

### 9.3 Clipboard

**Copy** writes:

- SVG text to the system clipboard (when Windows allows it)  
- An internal snapshot (including symbol masters used by copied instances)

**Paste** prefers that internal snapshot, then falls back to SVG on the clipboard. Pasted objects offset slightly so they do not sit exactly on the originals.

### 9.4 Duplicate

**Ctrl+D** duplicates the selection in the document (including groups and their children as independent copies). Duplicates sit 16 units down and to the right, next to the original in the same group or layer.

---

## 10. Plugins

The **Plug** tab lists extras that ship with SaVaGe.

| Plugin | What it does |
|---|---|
| **Duplicate & Offset** | Copies selected objects (not groups) 24 units down and right |
| **Randomize Fills** | Assigns random palette fills to selected objects that have a fill |
| **Add Guide Rect** | Inserts a translucent cyan rectangle as a layout guide |

Each command shows a short toast when it finishes. Use **Edit → Undo** if you want to reverse it.

---

## 11. Keyboard shortcuts cheat sheet

Shortcuts apply when the canvas is focused — not while a text field is active.

### Global

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

Polygon, Star, Pattern Brush, and Scatter Brush have no letter shortcut — click them on the tool rail.

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

Menu items do not show key badges in the title bar; the shortcuts above still work on the canvas.

---

## 12. Known limitations & best practices

### 12.1 Limitations (v0.1)

1. **Distribute / even spacing** is not in the Align bar yet (left/center/right/top/middle/bottom are).  
2. Pattern Brush and Scatter Brush spacing and jitter are fixed (no sliders yet).  
3. Perspective vanishing points are not draggable.  
4. Text outlines use the bundled **DM Sans** and **Syne** faces.  
5. Some web browsers will not paint mesh-gradient fills in exported SVG.

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
| Convert drop does nothing | Drop a PNG, JPEG, WEBP, GIF, BMP, or TIFF — other files are ignored |
| Converted, but still on Convert | Click **Open in Editor** (that is expected) |
| Boolean fails | Select at least two filled closed shapes; ungroup if needed |
| Shape Builder empty | Select overlapping closed shapes first |
| Mesh looks empty in a browser | Open it in SaVaGe or Inkscape, or export PNG |
| Paste did nothing | Click the canvas first; copy from SaVaGe or paste SVG |
| Open failed | The file may not be a valid `.savage` project or SVG — check the toast |
| Heavy lag | Simplify paths; lower convert color precision; hide blur/shadow temporarily |
| Clicking a tool key types a letter | Click the canvas so a Properties field is not focused |

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

---

## Appendix A — Suggested learning path

1. Convert a simple logo PNG; use **Open in Editor**.  
2. Recolor with Props; rename layers.  
3. Draw primitives; Unite; Shape Builder.  
4. Create a Symbol; place twice; detach one.  
5. Try Brush, Pattern, and Scatter.  
6. Enable 1-pt perspective and sketch with Snap.  
7. Save `.savage`; export SVG and PNG; reopen both and compare.  
8. Run Plug → Randomize Fills once for fun, then Undo.

---

## Appendix B — Product identity

**SaVaGe** blends **SVG** with a bold craft aesthetic: graphite interface, lime accent, and expressive typography (Syne / DM Sans).

For help in the app, use **Help → User Manual (PDF)…**.

---

*End of user manual.*
