# M0 Baseline

Recorded: 2026-09-15

Starting commit: `c7204ef9f17cfab5d49d93d50b355fe0d0c79c1e`

## Toolchain

- Windows desktop target
- Node.js 24.18.0
- pnpm 10.17.1
- Rust/Cargo 1.96.0
- Tauri 2
- Vitest 3.2.7 resolved by the lockfile

The repository pins Node, pnpm, and Rust. `npx --yes pnpm@10.17.1` is the verified
non-admin fallback when pnpm is not installed globally.

## Automated Results

| Check | Result |
|---|---|
| Frontend tests | 25 files, 87 tests passed |
| Frontend production build | Passed |
| Rust tests | 11 tests passed |
| Rust formatting | Passed after applying rustfmt to existing differences |
| Clippy with `-D warnings` | Passed after one existing warning fix |
| Production JavaScript audit | No known vulnerabilities |
| Rust advisory audit | CI: `rustsec/audit-check` v2.0.0 against `src-tauri/Cargo.lock`. Local: `pnpm audit:rust` when `cargo-audit` is installed. |
| Tauri debug application build | Passed |
| NSIS debug package | Passed: `SaVaGe_0.1.0_x64-setup.exe` |

Commands:

```powershell
npx --yes pnpm@10.17.1 check:frontend
npx --yes pnpm@10.17.1 check:rust
npx --yes pnpm@10.17.1 audit:frontend
npx --yes pnpm@10.17.1 audit:rust
npx --yes pnpm@10.17.1 tauri build --debug
```

## Open M0 Gates

- Packaged smoke on a non-admin Windows account: Guest signed off `v0.1.2` (install,
	scaling, HC/Narrator, close, recovery) and `v0.1.3` (two-instance Save) on 2026-09-18.
	Still open: WebView2-missing VM.
- Local `cargo-audit` is optional; CI runs the pinned `rustsec/audit-check` action.

The automation probe found Edge 153.0.4234.32, but neither `tauri-driver` nor a matching
EdgeDriver is installed. Until a compatible pair is selected and pinned, native coverage is
the Rust service suite plus [the recorded manual gate](native-smoke-checklist.md), not browser
tests described as native E2E.

The vectorizer now runs on one blocking native worker and rejects concurrent work. It carries job,
session, and source-revision identity. Cancellation is cooperative between decode, resize, trace,
and output; Convert Cancel keeps the busy state until that worker exits.

Browser tests are not evidence for native dialogs, filesystem replacement, close events,
WebView2 behavior, or NSIS installation.

## M3 Persistence Evidence

- New, Open, Save, Save As, modified title/status, and guarded conventional shortcuts are wired.
- New, Open, raster-mode replacement, and native Close share a deduplicated Save/Discard/Cancel
	coordinator. A failed/cancelled save or an edit during save prevents replacement.
- Saves acknowledge an immutable payload only for the matching session and operation. Undo to
	the acknowledged payload is clean; redo is modified. Save As adopts its path only on success.
- Native text writes use a unique same-directory temporary, flush with `sync_all`, and use
	Windows `ReplaceFileW` when replacing an existing file. Failed writes clean the temporary
	without deleting the destination.
- Native reads and writes return a size/modified-time fingerprint. Repeat Save rechecks it before
	replacement and rejects detected external changes. The Rust test proves the original external
	content survives a conflict, and that an explicit overwrite with no expected fingerprint
	replaces the destination.
- A fingerprint mismatch on Save presents in-app **Reload**, **Save As**, **Overwrite**, or
	**Cancel**. Reload reads through the destination grant and replaces the open document only
	after the disk copy parses. Overwrite retries with no expected fingerprint. Locked, permission,
	and disk-full failures map to specific toasts. Timestamp/size fingerprints reduce common
	accidental overwrites but are not a universal race-proof file identity.
- Native filesystem fault tests cover locked files, read-only or directory-occupied destinations,
	Unicode names, long paths, and a missing volume (unmounted-media analogue). Failed writes leave
	the original bytes and do not leak temporaries. Guest `v0.1.3` signed off two-instance
	Reload / Save As / Overwrite / Cancel on 2026-09-18.

Remaining M3 hardening is live removable-media and disk-full injection beyond the
missing-volume unit test.

## M4 Recovery Evidence

- Modified committed documents checkpoint after 1.5 seconds idle and no later than 10 seconds
	during continuous document changes. The documented recovery-point objective is therefore 10
	seconds plus serialization, native queue, and filesystem latency; forced termination can lose
	work within that window.
- Recovery uses versioned, session-specific JSON envelopes in the user app-data recovery directory.
	Envelopes include application/schema versions, source identity, sequence, timestamp, contents,
	and a SHA-256 integrity value.
- Native writes reuse the atomic same-directory replacement path, run on a blocking worker, reject
	stale sequences, cap one envelope at 32 MiB, cap aggregate valid recovery at 256 MiB/64 sessions,
	and preserve existing candidates when the budget is full.
- Startup scanning validates envelope integrity natively and project structure through the normal
	version-1 parser before commit. Invalid envelopes are quarantined and reported without blocking
	startup.
- Recovery offers Recover as a new unsaved document, Open Original where available, or explicit
	discard. Save/discard cleanup is sequence-aware and cannot remove a newer checkpoint.

Compatibility is intentionally narrow: recovery format 1 carries project schema 1, and unsupported
recovery/project versions are preserved rather than migrated or overwritten. No schema version 2
writer exists yet, so there is no downgrade/export migration path to qualify. Packaged killed-process,
upgrade/reinstall retention, and real disk-pressure qualification remain manual M8 evidence.

## M5 Security Boundary Evidence

- Production now has an explicit CSP: scripts are local-only; network connections are limited to
	Tauri IPC; images allow local/data/blob previews; fonts are local/data; inline styles remain
	allowed because current React components use style attributes and scoped style elements.
- Development adds only the Vite HMR websocket endpoint to that policy.
- The unused webview filesystem and shell plugin grants and initialization were removed. Dialog is
	the only plugin capability; privileged reads, writes, conversion, export, recovery, booleans, and
	Help remain named native commands.

- Conversion now accepts immutable job/session/source-revision identity and returns the same identity
	with its typed success result. The frontend validates that response and discards it if the project
	session or selected source changed before completion.
- Heavy conversion runs through `spawn_blocking` with one active permit. A second conversion receives
	a typed `job_busy` rejection, and the permit remains occupied until the worker actually exits,
	including after CancelRequested.
- Conversion checks a live source grant rather than consuming it, so cancel or failure can retry the
	same authorized file until the grant expires. Concurrent work is still exclusive.
- Native cancellation is cooperative between decode, resize, trace, and output. `vtracer` has no
	interrupt checkpoint; a cancel during tracing waits for that call, discards the SVG, and then
	returns `cancelled`. Convert UI Cancel keeps the busy state and says it is stopping after the
	current stage.
- Native validation caps source files at 64 MiB, decoded dimensions at 16,384 per side and 40 million
	pixels, requested output dimensions at 4,096, and generated SVG at 32 MiB. Enumerated options and
	job/session identifiers are validated before tracing. PNG export uses the same 16,384-per-side and
	40-million-pixel caps, plus a 32 MiB SVG input cap, and refuses before allocating a pixmap.
- Raster paths are authorized only by a native picker or a recently observed native drag/drop event.
	The native layer canonicalizes supported raster files and binds them to opaque UUID grants with a
	30-minute lifetime and a 64-grant process bound; pending drop observations expire after 30 seconds
	and are also capped at 64.
- Preview and conversion both resolve a live grant without accepting a path from the webview.
	An unknown or expired token cannot launch work. The exclusive job slot still prevents a second
	conversion while one is running. The File > Open raster route uses the same native picker contract.
- Save, Save As, SVG export, and PNG export obtain destinations from native dialogs. Native code
	canonicalizes the selected parent, enforces the operation's extension, and returns only an opaque
	UUID grant plus a display path. Default names containing path components are rejected.
- Project destination grants are reusable for repeat Save and are stored separately from the display
	path. They expire after eight hours; SVG and PNG export grants are one-shot. The shared registry
	prunes expired entries and permits at most 64 live grants. Save As adopts the path and grant only
	after the granted write succeeds; native Open supplies a reusable grant for an existing project.
- The Tauri command registry no longer exposes a raw-path text writer or path-based export. Trusted
	native recovery code alone retains direct access to the internal atomic writer. Recovery documents
	and Open Original intentionally receive no destination grant and must obtain a new native Save
	destination.
- Built-in plugin commands run against an isolated working copy. Returned nodes are clones, failures
	and invalid graphs never reach the document store, and a successful command is one undo step.
	Stale completion after an intervening edit is discarded. This wrapping is not a sandbox; there is
	still no third-party plugin loader.
- Diagnostic events live in a native 128-event ring with a 256 KiB bound. Messages are redacted
	before storage (no document bodies, assets, secrets, or full paths). Convert/save/export/recovery
	failures record operation/job/session IDs, stage, elapsed time, and error codes. Help → Export
	Diagnostics confirms with the user, then writes a one-shot `.json` grant. There is no telemetry.
- Convert hands vtracer at most 4096² RGBA bytes (67,108,864). Source pixels and file bytes
	remain capped before decode. `vtracer` internals after that buffer are still not interruptible
	or independently budgeted.
- Production CSP and capability JSON are tested: scripts are `'self'` only, no `unsafe-eval` or
	remote `https:` connect/image/font, and the webview has no `fs`/`shell`/`http` plugins.
	Unknown and overflow grants cannot authorize reads or writes. Packaged WebView2 enforcement
	of that CSP remains a native observation, not a browser test.

Canonical path grants reduce arbitrary-path access but do not claim handle-pinned protection
against path replacement, symlink changes, or reparse-point changes after authorization.

## M6 Converter Presentation Evidence

- Convert explains unsupported drops and native claim failures instead of ignoring them.
- Attached sources show filename, format, pixel size, and byte size from the native preview.
- Named presets stay selected only while options match; otherwise Convert shows Custom.
- Raster and SVG panes are visible before a trace. The SVG preview is an image blob rather than
	injected markup. Changing options after a successful convert marks that pane stale until the
	next convert. Convert is disabled without a source or while a job is running, with a reason.

## M6 Editor Presentation Evidence

- Entering Edit fits the active artboard once the viewport has a real size, and again when the
	project session changes.
- An empty artboard offers Convert an image, Draw a rectangle, and Open a project.
- Align uses labeled icons with disabled reasons (two objects to align, three to distribute).
	Boolean and Commit Shape Builder buttons also explain why they are unavailable.
- Title bar and status bar show Unsaved, Modified, or Saved instead of a silent asterisk.

## M6 Keyboard Evidence

- Application menus are a menubar: **F10** focuses File, arrows move across menus and items,
	Enter/Space opens or activates, Escape closes and returns focus, Tab dismisses.
- Layer and artboard rows are list options with arrow selection and **F2** rename (Escape cancels).
	Symbol names are keyboard-placeable. Canvas is focusable; tool and nudge shortcuts ignore typing
	and list/menu navigation.
- Selection changes announce politely in a live region. Pointer hover does not.

## M6 Visual Evidence

- Convert and Edit share the title-bar mark, Syne wordmark, graphite surfaces, and lime accent.
	Studio credit on Convert is secondary. Cyan/violet converter chrome is gone.
- Focus, selection, warning, error, success, disabled, loading, and mixed-selection use shared
	tokens. Convert errors, stale traces, and cancellations are banners, not plain red copy.
	Toasts use the same kinds. Props no longer silently edits the first object in a multi-selection.
- Secondary text is lighter graphite (`--fg-1`) sized for UI chrome. Disabled controls keep readable
	labels instead of dimming an entire panel.

## M6 Window And Display Evidence

- Native default 1440×900, comfortable 1280×720, minimum 960×600 (1080p at 200% scaling).
	Convert stacks at 1100 CSS pixels. Title bar, toolbar, status, and inspector tabs wrap or
	scroll; required controls are not hidden.
- Canvas backing store follows devicePixelRatio and monitor changes. High Contrast maps to
	system `forced-colors`. Narrator still uses F10, list rows, the Artboard canvas, and the
	selection live region. Guest `v0.1.2` signed off 150%/200% scaling, High Contrast, and
	Narrator on 2026-09-18.

## M6 Manual And Shortcut Evidence

- `USER_MANUAL.md` matches live File **Save** / **Save As…**, inspector tabs (Properties,
	Artboards, Plugins), Convert Custom / Convert again / stale banner copy, file shortcuts
	(**Ctrl+N** / **O** / **S** / **Shift+S**), F10 menu keys, and crash recovery prompts.
- Hover tooltips (tools, disabled Align/Boolean, Convert) are the in-app help; Help still opens
	the bundled PDF. Regenerating that PDF is `pnpm manual:pdf`.
- Guest `v0.1.2` signed off 150%/200%/HC/Narrator and Help-open-PDF on 2026-09-18.

## M7 Frame Scheduling Evidence

- Editor paints are coalesced onto one `requestAnimationFrame`. Idle has no rAF. Repeat
	`markDirty` before a frame notifies the store once. Resize, DPR, font readiness, document
	edits, camera, hover/preview/tool transients, and pointer drags request a frame; hover-only
	pointer moves do not.
- Chrome subscribes to save-label / rounded zoom / tool slices rather than the full document.
	Idle pointer moves skip snapping and tool updates. Identical pan, zoom, hover, and frame-time
	writes do not notify. Document edits still raise dirty and paint.
- World matrices and world AABBs cache per document snapshot (16 documents, 8192 nodes).
	Invalidation tests cover in-place edits, ancestor transforms, reparenting, symbol instance
	boxes, undo/redo, and document replacement against uncached oracles.
- Hit testing rejects padded world AABBs before Path2D tests. Topmost reverse-paint-order
	selection is unchanged. A spatial index is not added; linear AABB rejection is the measured
	next step after the matrix/bounds cache.
- Inspector lists stay fully rendered for keyboard sibling focus. Convert/Edit already
	unmounts the unused viewport and the inactive inspector tab. The existing split is
	`convertTextToOutlines` → `fontOutlines` / opentype.js; no second lazy graph. UI fonts are
	variable Syne/DM Sans. Outline conversion keeps five measured latin WOFFs (~17–19 KiB).
	Static `@fontsource/dm-sans` and `@fontsource/syne` are not imported; the copied WOFFs stay.
- Named-machine p50/p95 interaction budgets remain a later M7 measurement, not this slice.