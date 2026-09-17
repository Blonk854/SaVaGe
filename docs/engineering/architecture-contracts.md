# Architecture Contracts

These decisions resolve the initial B1 and B2 probes from the upgrade review. Changes to
either contract require a focused regression test and compatibility review.

## Affine Transform Contract

- Matrices use column vectors and map a local point with `world = parentWorld * local`.
- `Transform2D` composes in the same order emitted by SVG serialization:
  `translate * rotate * scale * skewX * skewY`.
- Angles are stored in degrees and converted to radians only for matrix construction.
- The complete affine matrix is the computation format for rendering, bounds, hit testing,
  flattening, snapping, and handle placement.
- An inverse is unavailable when the determinant magnitude is below `1e-12`. Operations
  requiring that inverse must reject the edit without moving or deleting content.
- The decomposed version-1 storage shape remains unchanged for now. Reparenting that cannot
  be represented losslessly by it must not silently discard shear.

The independent transform test uses hand-calculated coordinates, rather than another
production transform implementation, to pin multiplication order and skew behavior.

## History And Session Contract

- Temporal history snapshots document content only. Selection, camera, hover, and repaint
  state do not create undo entries or imply that project content is modified.
- Loading or replacing a document clears both undo and redo history. Undo cannot restore a
  document from a previous session.
- The project session store owns session ID, display name, destination path/fingerprint,
  acknowledged serialized payload, pending save operation ID, and save timestamp outside the
  repaint store. Native-owned destination grants remain future hardening.
- Save captures an immutable document snapshot and its session/state identity. Completion
  may acknowledge only that captured state in the same session; later edits remain dirty.
- Save As changes the active destination only after a successful write. Open parses a candidate
  before the replacement decision, and stale save completion cannot alter a newer session.
- Modified state is derived from the current deterministic serialization and the acknowledged
  saved payload. This keeps the checkpoint identifiable after history eviction and makes undo to
  saved content clean without storing repaint or selection state in history.
- New, Open, raster-mode replacement, and Close use one deduplicated Save/Discard/Cancel decision.
  A save followed by a newer edit does not permit replacement.
- Undo stays on zundo. Snapshots store `{ doc }` only and rely on Immer structural sharing of
  unchanged nodes. The stack is capped at 100 steps and 48 MiB of unique retained past/future
  graph. Oldest steps drop first; the live document is never discarded to meet the budget.
  Derived-cache, diagnostic-ring, and on-disk recovery budgets stay separate.

Focused history and deferred-promise tests enforce these rules, including cancellation,
out-of-order completion, edit-during-save, prompt deduplication, undo/redo cleanliness, and
repeat-save fingerprint forwarding.

## Plugin Command Contract

- Built-in plugins are trusted in-process application code. Registration is not a sandbox,
  and CSP or command wrapping does not isolate a hostile plugin.
- There is no third-party plugin loader in this release.
- Commands receive an isolated working copy. `getNode` and `getSelectionIds` return clones,
  so mutating those values cannot change the live document.
- Success validates the working copy with the same project invariants as Open, then commits
  one document history step. Thrown commands, invalid graphs, and stale sessions discard the
  working copy and leave the current document and history unchanged.

## Recovery Contract

- Recovery format 1 stores project schema 1 in a versioned envelope. Unsupported versions and
  invalid project graphs never commit to the document store.
- Each project session has one collision-resistant recovery identity and monotonically increasing
  sequence. Native persistence ignores an older sequence, and cleanup removes an envelope only
  when its sequence is covered by the acknowledged save or explicit discard.
- Recovery checkpoints after 1.5 seconds idle and at least every 10 seconds during continuous
  document changes. This is an RPO bound plus serialization, queue, and filesystem latency, not a
  zero-loss guarantee for forced termination or power loss.
- Recovery storage is separate from project destinations and bounded to 32 MiB per session,
  256 MiB aggregate, and 64 valid session files. Budget exhaustion preserves existing recovery
  data and reports the failure without blocking editing.
- Envelope identity and contents are protected by SHA-256. Invalid envelopes are quarantined;
  valid envelopes are additionally parsed by the normal project validator before recovery.
- Recovered content opens as a new unsaved session. Opening the original does not apply recovered
  edits, and discarding recovery is explicit.
- Unsupported recovery format or project schema versions are reported and left in place. They are
  not migrated, quarantined, or overwritten by a later checkpoint. Corrupt JSON is quarantined
  by rename only.

## Format Compatibility Contract

- This application reads and writes `.savage` schema 1 only. Unknown future versions fail in
  memory with an actionable message; Open never writes the source. A newer writer that cannot
  produce schema 1 must require Save As to a new path and leave the original copy.
- SVG is a bounded interchange format. Unsupported markup is dropped on import rather than
  executed or silently claimed as a round trip. The published matrix is
  [m8-compatibility.md](m8-compatibility.md).

## Diagnostic Log Contract

- Diagnostic events are stored locally in a 128-event ring with a 256 KiB export bound.
  Messages are truncated and redacted before storage: full file paths, `data:`/`file:` URIs,
  long embedded payloads, and document/SVG bodies are replaced with placeholders.
- Events record level, error code, operation name, optional operation/job/session IDs, stage,
  elapsed time, and application version. They never include document JSON, assets, or secrets.
- Native convert, save, export, and recovery failures are recorded at the command boundary.
  Frontend Open, plugin, preview, and stale-conversion failures are submitted through the same
  redacting native recorder.
- Export is explicit and user-reviewed: Help → Export Diagnostics asks for confirmation, then a
  native save dialog issues a one-shot `.json` grant. There is no automatic upload or telemetry.

## Conversion Job Contract

- One conversion may run at a time. A second request is rejected with `job_busy` until the worker
  actually exits, including after cancel is requested.
- Job identity is job ID, session ID, and source revision. States used here are Running,
  CancelRequested, Succeeded, Failed, and Cancelled. There is no queue; extra work is rejected.
- Cancellation is cooperative between owned stages: decode, resize, trace, and output. The
  `vtracer` convert call has no interrupt API, so CancelRequested during tracing waits for that
  call to finish, discards the SVG, and then reports Cancelled.
- The UI may request cancel and must keep the busy state until the native command returns a
  terminal result. It must not claim that tracing stopped immediately.
- Conversion authorizes the source through a live grant (the same resolve path as preview) plus
  the exclusive job slot. The grant remains usable for retry after cancel or failure until it
  expires.

## Converter Presentation Contract

- Unsupported Convert drops and failed claims explain why work did not start. Filename-only
  messages are used; full paths stay out of the notice.
- Raster preview includes format, pixel size, and byte size from native inspection of the granted
  file. The SVG pane is empty until a matching conversion finishes.
- Named presets apply a full option set. Divergent sliders or mode show **Custom**. Changing
  options after a successful trace marks the SVG pane stale until the user converts again.
- Convert stays disabled without a source or while a job is running, with an explicit reason.
  Completion offers Open in Editor; errors can be dismissed and retried.

## Window And Display Contract

- The default native window is 1440×900 logical pixels. The comfortable workspace is 1280×720.
  The minimum is 960×600 so a 1080p display at 200% scaling can still host the window.
- Below 1100 CSS pixels, Convert stacks the inspector under the drop zone. Chrome (title bar,
  toolbar, status, inspector tabs) wraps or scrolls instead of clipping required controls.
- The editor canvas backing store is `floor(cssSize * devicePixelRatio)` and resizes when the
  window, visual viewport, or monitor DPI changes.
- Windows High Contrast uses `forced-colors` system keywords. Increased contrast thickens the
  focus ring. Narrator uses the application menus, focusable lists, canvas name “Artboard”, and
  the polite selection live region.

## Canvas Frame Scheduling

- The editor canvas does not run a perpetual animation loop. Invalidation coalesces to one
  `requestAnimationFrame`; idle has no pending rAF.
- Paint invalidation includes document/selection changes, camera, grid, tool, perspective,
  hover, boolean preview, Shape Builder, pointer drags, canvas layout resize, device-pixel-ratio
  changes, and font readiness. Canvas bitmaps are not drawn yet; a load listener would be added
  with the first raster source.
- Transient drawing (pen handles, live shapes, boolean ghosts) rides the same coalesced frame.
  There is no independent canvas animation clock.

## Store Subscriptions

- Chrome (title bar, status, toolbar) subscribes to save-label strings, rounded zoom, and
  tool/mode — not the full document. Idle pointer moves do not snap, call tools, or write
  hover/pointer fields into the UI store. Repeat pan/zoom/hover/frame-time values are no-ops.
- Paint still invalidates on document or selection identity changes and on the dirty flag
  rising edge. Dragging continues to paint through those paths.

## Derived Geometry Cache

- World matrices and world AABBs are the cached hot derived data. Hit testing, snapping,
  alignment, and flattening keep calling `nodeWorldMatrix` / `nodeWorldBounds`; those wrappers
  cache per immutable document snapshot.
- Cache size is bounded: 16 document snapshots and 8192 node entries per snapshot. Larger
  documents skip bulk fill and evict least-recent node entries. History beyond 16 snapshots
  recomputes.
- Immer/history/load produce new document objects, so edits, ancestor transforms, reparenting,
  symbol document updates, undo/redo, and replacement miss the previous snapshot automatically.
  In-place mutation of the same object requires `invalidateDerivedCache(doc)`.
- Cached results are tested against uncached oracles (`computeNodeWorldMatrix`,
  `computeNodeWorldBounds`). Symbol instance AABBs follow the instance placement box, not
  expanded symbol geometry.
- Hit testing rejects padded world AABBs before constructing Path2D tests. The pad covers
  stroke width and the same screen-pixel slop as the precise test, scaled by the node matrix.
  Candidates stay in reverse paint order so the topmost visible unlocked leaf wins. There is
  no spatial index until a named-machine profile shows the linear AABB pass is the bottleneck.

## Lists, Code Split, And Fonts

- Inspector lists (Layers, Artboards, Symbols, Plugins) render every row. Arrow-key focus
  walks `[data-list-row]` in the DOM. Convert vs Edit already unmounts the unused viewport,
  and only the active inspector tab is mounted. A virtualized list is not added until a
  named-machine profile shows inspector layout above the interaction budget; it would have
  to preserve that keyboard contract.
- The only extra JS split is `convertTextToOutlines` → dynamic `fontOutlines` / opentype.js.
  AppShell still statically imports Convert and Edit chrome. Do not add a second lazy path
  for the same modules.
- UI text uses `@fontsource-variable` Syne and DM Sans (latin + latin-ext weight axes).
  Outline conversion uses five static latin WOFF files (DM Sans 400/500/700, Syne 400/700),
  about 17–19 KiB each. Those weights stay. The static `@fontsource/dm-sans` and
  `@fontsource/syne` packages are not imported; do not delete the copied WOFFs to “save”
  the variable-font UI packages.

## Release Artifact Contract

- A distributable Windows installer is a production NSIS build from a git tag `vX.Y.Z`
  whose `X.Y.Z` matches `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`,
  and the user-manual application version.
- The tagged commit is built with frozen pnpm and locked Cargo dependencies. Release GitHub
  Actions are pinned by commit SHA. Signing secrets, when they exist, belong only to the
  protected `release` environment and never to pull-request jobs.
- Current artifacts are unsigned internal builds. `provenance.json` records `signed: false`.
  Broad stable distribution waits on Authenticode. Verify SHA-256 sidecars before installing;
  Windows publisher warnings are expected and are not a vendor signature.

## Install And Uninstall Contract

- The Windows installer is current-user NSIS. It does not require Administrator rights and
  does not register `.savage` file associations.
- Missing WebView2 uses the Evergreen download bootstrapper (internet required). A failed
  bootstrap aborts setup. There is no claimed minimum WebView2 version beyond “the runtime
  that successfully launches the app.”
- Application data (`%APPDATA%\com.savage.svgstudio`, including recovery and diagnostics)
  is separate from the install directory (`%LOCALAPPDATA%\SaVaGe`) and from user project
  files. Default uninstall keeps app data; the NSIS “Delete the application data” checkbox
  is the only supported way to remove it.
- Update/reinstall of tagged builds is allowed. Installing or uninstalling while the app is
  running must wait until `SaVaGe.exe` exits. A locked project destination must fail the
  write and leave the original file.

## Staged Rollout Contract

- Channels are internal corpus, named opt-in beta, then stable. Promotion is an explicit
  gate review, not a percentage of clients. There is no automatic updater.
- Beta population, feedback interval (7 days), and exit criteria are published before any
  beta invite. Unsigned artifacts may reach beta; they cannot be stable.
- Tagged GitHub Releases are prereleases until a signed promotion record unmarks them.
  Policy and records: [m8-rollout.md](m8-rollout.md).

## Halt And Withdraw Contract

- Promotion stops on confirmed document corruption, missing recovery, a critical or high
  security defect, or a failed tagged install/upgrade.
- User `.savage` files and recovery snapshots stay in place. Diagnostics leave the machine
  only after Help → Export Diagnostics confirmation. There is no automatic upload.
- Withdraw drafts the GitHub Release and keeps the git tag plus checksum/provenance
  sidecars. Do not delete the release, the tag, or user files.
- Offer the last verified installer recorded in [verified-installers.json](verified-installers.json).
  That list is empty for 0.1.0; do not invent a prior setup. Procedure: [m8-withdraw.md](m8-withdraw.md).

## Rollback Rehearsal Contract

- Installing a previous tagged NSIS must keep application data. `allowDowngrades` is on and the
  bundle identifier does not change. Uninstall must not use Delete the application data.
- A binary downgrade is not document rollback. Schema 1 copies still open. Schema ≥2 projects
  and newer recovery envelopes stay on disk unchanged; Open does not coerce them to version 1.
- Newer work that the older reader cannot open is recovered with the newer reader, or by an
  explicit **Save As** schema-1 copy made in that newer writer before the downgrade.
  Procedure: [m8-rollback.md](m8-rollback.md).

## Artifact Retention Contract

- Previous tagged NSIS installers, SHA-256 sidecars, provenance, and compatibility notes stay
  available. New tags append to [verified-installers.json](verified-installers.json); they do not
  replace a different SHA for an existing tag.
- Distribution is manual reinstall of a retained setup. There is no automatic updater.
  Executables are not stored in git. Procedure: [m8-retain.md](m8-retain.md).