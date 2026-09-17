# SaVaGe 0.1.0 release notes

Unsigned internal Windows NSIS build. GitHub Releases for this tag are prereleases.
There is no automatic updater. Verify SHA-256 before installing. This version cannot
be marked stable until Authenticode signing and a recorded gate review exist.

## Documents

- Native projects are `.savage` **version 1**. Version 2 or later is not opened and is
  not rewritten. Use a newer SaVaGe, or **Save As** a version-1 copy from that version.
- Crash recovery format 1 carries project schema 1. Newer recovery files are left in
  place.

## SVG (known unsupported or lossy)

- Path **arcs** import as straight segments.
- SVG **skew**, **matrix()**, and multi-transform lists are not parsed on import.
- **`<use>`**, **`<symbol>`**, and **clipPath** are not rebuilt as scene objects on import.
- Raster **`<image>`** elements are dropped; convert bitmaps in Convert mode.
- **script**, **foreignObject**, SMIL animation, and remote image fetches are dropped.
- **Mesh** fills export as SVG 2 and may not paint in web browsers.

Keep a `.savage` master. Export SVG for handoff, PNG for mesh-critical stills.
