# SaVaGe manual E2E checklist

## Convert

- [ ] Open SaVaGe (`pnpm tauri:dev`)
- [ ] Convert mode shows SaVaGe wordmark + dragon logo
- [ ] Open a PNG/JPEG/WEBP via drop zone or dialog
- [ ] Choose Logo / Photo / Line / Pixel preset
- [ ] Convert completes and switches to Edit mode
- [ ] Layers list shows vector paths (not a single raster image)

## Edit

- [ ] Pan with Space+drag or middle mouse
- [ ] Zoom with scroll wheel toward cursor
- [ ] Select / move / resize / rotate a path
- [ ] Undo / Redo (Ctrl+Z / Ctrl+Shift+Z)
- [ ] Draw rect, ellipse, line, polygon, star
- [ ] Pen tool creates editable path; Enter finishes
- [ ] Pencil freehand creates path
- [ ] Layers visibility/lock/rename works
- [ ] Properties fill/stroke/opacity commit on blur

## Appearance / Text

- [ ] Fill type: Solid / Linear / Radial
- [ ] Drop shadow + blur on selection
- [ ] Double-click text to edit inline
- [ ] Convert text to outlines

## Artboards / Clip

- [ ] Boards tab → add / rename / delete artboards
- [ ] Active artboard highlighted; Fit focuses active board
- [ ] View → Fit All Artboards
- [ ] Select content + mask last → Make Clip Mask

## Symbols / Brush

- [ ] Select shapes → Object → Create Symbol (or Symbols tab +)
- [ ] Place another instance from Symbols tab
- [ ] Detach instance → becomes editable shapes
- [ ] Brush tool (B) paints variable-width calligraphy strokes

## Shape builder / Live boolean / Mesh / Variable stroke

- [ ] Select 2+ shapes → hover Unite/Inter/Sub/Xor shows lime preview
- [ ] Click boolean op commits result
- [ ] Shape Builder (S): regions tint green/red; click toggles; Enter commits
- [ ] Fill → Mesh shows multi-color grid; edit corner swatches
- [ ] Path → Taper ends / Alt-drag point width (Direct Select)

## Phase 11 remainder

- [ ] Pattern Brush stamps chevrons along stroke
- [ ] Scatter Brush stamps jittered leaves along stroke
- [ ] Toolbar Persp → 1-pt / 2-pt shows cyan guides; Snap pulls to rays
- [ ] Plug tab → Duplicate & Offset / Randomize Fills / Add Guide Rect

## View

- [ ] Toolbar Fit / zoom ± / 100%
- [ ] View → Fit Artboard (Ctrl+0), Fit Selection (Ctrl+2)

## Boolean / Object

- [ ] Select 2+ shapes → Unite / Intersect / Subtract / Exclude
- [ ] Object → Simplify Path
- [ ] Object → Group / Ungroup

## IO

- [ ] File → Save Project (`.savage`)
- [ ] File → Export SVG
- [ ] File → Export PNG
- [ ] Re-open `.savage` / `.svg`
- [ ] Ctrl+C / Ctrl+V copy-paste selection
