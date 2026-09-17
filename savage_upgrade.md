# SaVaGe Upgrade Plan

## Purpose

This plan describes the work required to move SaVaGe from an ambitious `0.1.0` editor into a dependable, polished desktop image-to-SVG converter and vector editor.

The upgrade is organized around one principle: protect the user's work and make document behavior correct before expanding the feature set. New drawing features should wait until document transforms, file safety, import/export boundaries, accessibility, and performance are reliable.

## Product Goals

SaVaGe should become an application that:

- Never loses or silently corrupts user work.
- Renders, selects, edits, saves, and exports the same geometry consistently.
- Handles malformed or oversized input without crashing or exhausting resources.
- Follows familiar desktop-editor conventions.
- Makes conversion quality and progress easy to understand.
- Remains responsive on complex traced documents.
- Is usable with keyboard navigation and assistive technology.
- Has automated evidence that critical workflows work in development and packaged builds.

## Success Metrics

Track these metrics before and after the upgrade:

| Area | Target |
|---|---|
| Data loss | No unprompted replacement or close of a modified document |
| File reliability | Save operations are atomic and all failures are visible |
| Geometry correctness | Canvas, hit testing, bounds, booleans, and SVG export agree for nested transforms |
| Import safety | Invalid, cyclic, duplicate-ID, oversized, and non-finite documents are rejected safely |
| Conversion safety | Source bytes, decoded pixels, dimensions, runtime, and concurrency are bounded |
| Editor performance | Pan/zoom stays near 60 FPS on the standard 1,000-path benchmark |
| Selection latency | Typical hit tests complete within 16 ms on the standard benchmark |
| Startup | First usable window within 2 seconds on the reference development machine |
| Accessibility | Core file, conversion, layer, artboard, and property workflows are keyboard operable |
| Automated quality | Critical workflow E2E coverage runs in CI on every change |
| Release quality | Installer creation and clean-machine smoke test pass before release |

The exact performance thresholds should be adjusted after baseline measurements, but regressions should not be accepted without explicit review.

## Guiding Engineering Decisions

1. Use one authoritative transform pipeline for rendering, bounds, hit testing, flattening, and export.
2. Treat `.savage`, SVG, raster images, clipboard data, and plugin data as untrusted input.
3. Separate canvas repaint state from document persistence state.
4. Keep native filesystem and conversion operations narrow, validated, bounded, and observable.
5. Use standard desktop interaction patterns unless SaVaGe has a documented reason to diverge.
6. Add test coverage at the same boundary where each defect is fixed.
7. Measure performance before optimizing and retain benchmark fixtures to prevent regressions.

---

## Phase 0: Baseline and Delivery Infrastructure

**Goal:** Make quality measurable and ensure every later phase has repeatable checks.

### 0.1 Establish continuous integration

Add a CI workflow that runs on pull requests and the default branch:

- Install Node.js 22 and dependencies using the locked pnpm version.
- Run `pnpm build`.
- Run `pnpm test` with coverage reporting.
- Run `cargo fmt --check`.
- Run `cargo clippy --all-targets --all-features -- -D warnings`.
- Run `cargo test`.
- Run JavaScript and Rust dependency audits.
- Build the Windows installer on protected release branches or tags.
- Upload test, coverage, benchmark, and installer artifacts.

### 0.2 Pin development tooling

- Add the pnpm package-manager version to `package.json`.
- Ensure Tauri's `beforeDevCommand` works through the pinned package manager rather than assuming a globally installed `pnpm` executable.
- Pin the manual-generation dependency instead of invoking an unpinned `pnpm dlx` package.
- Remove machine-specific browser paths from manual generation.
- Document the supported Windows, WebView2, Node.js, and Rust versions.

### 0.3 Add baseline fixtures

Create representative documents for:

- Empty and small documents.
- Nested transformed groups.
- Duplicate and malformed IDs.
- Cyclic and dangling references.
- Common SVG transforms and path arcs.
- 100, 1,000, and 10,000 path documents.
- Large but valid raster inputs.
- Inputs that exceed configured safety limits.

### 0.4 Record baseline measurements

Measure startup, import, conversion, render, pan, zoom, hit testing, save, reopen, and export. Record machine specifications and fixture versions with each result.

### Acceptance Criteria

- CI blocks merges when build, tests, formatting, linting, or audits fail.
- The documented setup works on a clean non-administrator Windows account.
- Benchmark fixtures and a repeatable measurement command exist.
- Existing behavior has baseline performance and bundle-size numbers.

---

## Phase 1: Document Correctness

**Goal:** Ensure every subsystem agrees about document geometry and destructive tools affect only intended objects.

### 1.1 Unify transform composition

Affected areas include:

- `src/features/editor/renderer/drawDocument.ts`
- `src/shared/geometry/bounds.ts`
- `src/shared/geometry/hitTest.ts`
- `src/shared/geometry/flatten.ts`
- `src/shared/document/serialize.ts`

Implement shared traversal utilities that accumulate parent and local transforms in a documented order. Rendering, hit testing, bounds, selection handles, snapping, boolean flattening, clipboard operations, grouping, and export must use the same transform semantics.

Avoid fixing each subsystem independently. A single traversal and matrix-composition contract should own this behavior.

### 1.2 Preserve transforms during structural operations

Verify and correct:

- Group and ungroup.
- Reparenting and layer movement.
- Copy and paste.
- Symbol creation and expansion.
- Artboard movement.
- Boolean operations.
- SVG import and export.

An object's visual position must not change merely because its parent changes.

### 1.3 Correct boolean operand handling

In `src/features/tools/booleanOps.ts`:

- Preserve an explicit mapping between accepted shapes and source node IDs.
- Exclude unsupported, open, text, image, or invalid geometry without deleting it.
- Choose the result style from a participating operand.
- Display a useful message when fewer than two compatible shapes remain.
- Treat one gesture as one undo transaction.

### 1.4 Add geometry conformance tests

Test nested translation, rotation, scale, mixed transforms, negative scale, and multiple group levels. For each fixture, assert agreement between:

- Rendered geometry.
- Computed bounds.
- Hit-testing coordinates.
- Flattened boolean geometry.
- Serialized and reopened geometry.

### Acceptance Criteria

- A nested transformed document looks identical before and after save/reopen and SVG export/import within documented precision.
- Bounds and hit testing match visible geometry.
- Grouping or ungrouping preserves world-space appearance.
- Mixed boolean selections never delete non-participating nodes.
- Regression tests fail against the previous incorrect behavior.

---

## Phase 2: File Safety and Document Lifecycle

**Goal:** Prevent data loss and make file operations behave like a trustworthy desktop editor.

### 2.1 Separate persistence state from repaint state

Add document-session state containing:

- Current project path.
- Display name.
- Current document revision.
- Last-saved revision.
- Modified status derived from those revisions.
- Last successful save time.
- Recovery snapshot status.

Keep canvas repaint invalidation separate in the UI/rendering store.

### 2.2 Implement standard file commands

Add:

- New.
- Open with `Ctrl+O`.
- Save with `Ctrl+S`.
- Save As with `Ctrl+Shift+S`.
- Recent projects.
- Reopen last project as an opt-in preference.
- Current filename and modified marker in the title bar.

Save should reuse the current path. Save As should always ask for a destination.

### 2.3 Protect modified documents

Prompt before:

- New document.
- Open document.
- Replacing the document with a conversion result.
- Closing the window.
- Application shutdown or update.

The prompt should offer Save, Discard, and Cancel. Failed saves must keep the document open and modified.

### 2.4 Make writes atomic

For `.savage` projects:

1. Serialize and validate the output.
2. Write to a sibling temporary file.
3. Flush and close it.
4. Replace the destination atomically where supported.
5. Preserve or recover the previous file if replacement fails.

### 2.5 Add autosave and recovery

- Write bounded recovery snapshots after meaningful idle periods.
- Keep recovery separate from the user's project file.
- Detect a newer recovery snapshot on startup.
- Offer Recover, Open Original, and Discard Recovery.
- Remove snapshots after a confirmed successful save or discard.
- Avoid snapshotting every pointer event.

### 2.6 Standardize operation feedback

Create one notification mechanism for:

- Save success and destination.
- Export success and destination.
- Import warnings.
- Recoverable errors.
- Blocking errors with actionable details.

Never discard promise rejections once the application shell is mounted.

### Acceptance Criteria

- No command can silently replace a modified document.
- `Ctrl+S` saves to the current path without reopening the dialog.
- Save and export failures are visible and actionable.
- Interrupted writes do not leave a truncated project as the only copy.
- A simulated crash offers recovery on the next launch.
- File lifecycle behavior has automated integration coverage.

---

## Phase 3: Input Validation and Security Hardening

**Goal:** Make malformed or hostile input fail safely without compromising user files or system resources.

### 3.1 Define a strict `.savage` schema

Use a maintained schema validator or a focused validation layer to verify:

- Supported version and migration path.
- Node discriminants and required fields.
- Unique IDs.
- Valid root and group child references.
- No graph cycles or duplicate ownership.
- Finite transforms, coordinates, dimensions, and opacity values.
- Valid paints, colors, gradients, symbols, and artboards.
- Maximum nodes, points, text length, resource count, and nesting depth.

Return structured validation errors suitable for user-facing summaries and diagnostic details.

### 3.2 Harden SVG ingestion

- Remap all external IDs to unique internal IDs.
- Support or explicitly reject unsupported transforms and path commands.
- Preserve elliptical arcs rather than replacing them with lines.
- Handle transform lists in SVG-defined order.
- Resolve rotation centers, matrices, and skews.
- Reject external scripts, event handlers, foreign objects, and remote resource loading.
- Limit XML size, nesting, element count, path command count, and numeric magnitude.
- Warn before any documented lossy conversion.

### 3.3 Harden SVG serialization and preview

- XML-escape every attribute and text value.
- Validate IDs and paint values before serialization.
- Avoid direct `dangerouslySetInnerHTML` where a safer rendering path is practical.
- If raw SVG insertion remains necessary, sanitize it with a well-tested allowlist.
- Add a restrictive Content Security Policy.

### 3.4 Reduce Tauri capabilities

Review `src-tauri/capabilities/default.json` and `src-tauri/tauri.conf.json`:

- Remove unused generic filesystem permissions.
- Remove unused shell permissions.
- Keep file access behind narrow custom commands.
- Require dialog-issued or otherwise validated paths.
- Restrict extensions and operation types server-side.
- Validate all arguments again in Rust rather than trusting the webview.

### 3.5 Bound raster and export resources

Before full raster decode:

- Check source file size.
- Read dimensions without allocating the full decoded bitmap where possible.
- Enforce maximum width, height, decoded pixel count, and memory budget.
- Validate all conversion options server-side.

Before PNG export:

- Reject non-finite or non-positive dimensions.
- Enforce maximum width, height, area, SVG bytes, and scale.
- Estimate memory and fail before allocation.
- Add cancellation and execution deadlines where practical.

### 3.6 Add fuzz and adversarial tests

Exercise:

- `.savage` parsing and graph validation.
- SVG path and transform parsing.
- Duplicate IDs and reference collisions.
- Deeply nested groups.
- Extremely large and non-finite numbers.
- Decompression-bomb-like raster metadata.
- Oversized export requests.

### Acceptance Criteria

- Malformed files produce a controlled error and leave the current document unchanged.
- Cycles, dangling references, duplicate IDs, and excessive nesting cannot enter the store.
- Imported and exported SVG cannot introduce executable markup.
- Native commands reject excessive allocations before they occur.
- The application runs with CSP enabled and the minimum required capabilities.

---

## Phase 4: Core Workflow Usability

**Goal:** Make conversion and editing clear to first-time users without slowing experienced users.

### 4.1 Improve the converter workflow

Create a clear sequence:

1. Choose or drop an image.
2. Inspect source details and warnings.
3. Choose a preset or customize settings.
4. Convert with visible progress and cancellation.
5. Compare raster and SVG.
6. Open in Editor or export directly.

Improvements:

- Explain rejected file types and oversized inputs.
- Show source dimensions, format, and file size.
- Change the preset indicator to Custom after manual edits.
- Render the existing progress label and announce progress accessibly.
- Replace the unexplained empty SVG pane with an explicit pre-conversion state.
- Add synchronized pan/zoom, split view, overlay, and before/after modes.
- Display output dimensions, path count, conversion duration, and estimated SVG size.
- Warn when settings produce excessive complexity.
- Preserve the user's last successful settings.

### 4.2 Improve the empty editor

On a new or empty document:

- Fit the artboard to the viewport.
- Offer Open Project, Import SVG, Paste, and New Document actions.
- Show contextual guidance only until the first object is created.
- Provide sensible document presets and custom dimensions.

### 4.3 Make controls self-explanatory

- Replace alignment letters with familiar icons.
- Use full panel names where space allows.
- Add tooltips with names and shortcuts.
- Disable unavailable actions and explain the requirement.
- Use consistent destructive-action icons and labels.
- Confirm consequential operations, including symbol-definition deletion and instance expansion.
- Increase very small labels and metadata to a readable minimum size.

### 4.4 Add contextual assistance

Keep the comprehensive manual, but supplement it with:

- Contextual links from advanced panels.
- Short descriptions in empty states.
- A searchable command palette.
- A shortcut reference opened from the Help menu.
- First-run guidance that can be dismissed and reopened.

Avoid persistent tutorial text inside the main working surface.

### Acceptance Criteria

- A first-time user can import, convert, edit, save, reopen, and export without reading the manual.
- Invalid input and unavailable actions explain what the user can do next.
- Preset state always reflects the actual settings.
- The default document is framed correctly on entry.
- Usability testing reveals no critical blockers in the primary workflow.

---

## Phase 5: Accessibility and Keyboard Workflow

**Goal:** Make core workflows operable and understandable without relying exclusively on a mouse.

### 5.1 Implement desktop menu semantics

For menus and menu items:

- Move focus into an opened menu.
- Support arrow keys, Home, End, Enter, Space, and Escape.
- Restore focus when a menu closes.
- Use correct menu-item roles and disabled semantics.
- Display and implement consistent shortcuts.

### 5.2 Make panels keyboard operable

Layers, artboards, and symbols should support:

- Focusable rows.
- Arrow-key navigation.
- Selection and multiselection.
- Keyboard rename.
- Keyboard reorder where feasible.
- Delete with confirmation rules.
- Clear focus-visible styling.

Use an appropriate listbox or tree pattern rather than clickable `<div>` elements.

### 5.3 Define canvas accessibility

- Give the canvas a focus target and accessible name.
- Scope editor shortcuts to the active editor context.
- Expose selection count, active tool, zoom, and important operation results through accessible status text.
- Provide a non-canvas object/layer route for selecting and editing document content.
- Ensure text editing and property inputs do not trigger canvas shortcuts.

### 5.4 Verify visual accessibility

- Test text and control contrast.
- Do not rely on color alone for selected, warning, or error states.
- Ensure focus indicators remain visible over all surfaces.
- Support Windows text scaling and high-contrast modes where practical.
- Keep touch targets and icon buttons comfortably sized.

### Acceptance Criteria

- The primary file and conversion workflow is usable with the keyboard alone.
- Menus and panel lists follow recognized accessibility patterns.
- Automated accessibility checks pass for DOM-based views.
- Manual checks pass with Windows Narrator, high contrast, and 200% text scaling.

---

## Phase 6: Performance Architecture

**Goal:** Keep interaction responsive as traced-document complexity grows.

### 6.1 Replace the perpetual render loop

Schedule a frame only when document, camera, selection, hover, or transient tool state changes. Coalesce multiple invalidations into one animation frame.

### 6.2 Cache derived geometry

Cache by node identity and revision:

- `Path2D` instances.
- Local and world transforms.
- Local and world bounds.
- Flattened paths.
- Brush stamps.
- Raster previews.

Invalidate only affected nodes and descendants when possible.

### 6.3 Accelerate hit testing

Use staged rejection:

1. Spatial index or artboard partition.
2. World-space bounding box.
3. Geometry-specific precise test.

Search topmost visible candidates first and stop when selection semantics permit.

### 6.4 Reduce React and store churn

- Subscribe components to narrow store slices.
- Avoid writing hover or pointer state into broad persistent stores when local state is sufficient.
- Virtualize large layer and symbol lists.
- Batch updates during drag operations.
- Commit one undo record per completed gesture.
- Keep selection changes out of document undo history unless explicitly required.

### 6.5 Move heavy work off the interaction path

- Run conversion, complex booleans, simplification, and large exports in bounded background tasks.
- Report progress through typed events.
- Support cancellation.
- Limit concurrent jobs.
- Keep the window responsive while work runs.

### 6.6 Control bundle and startup cost

- Lazy-load advanced tools and font-outline support.
- Inspect the large `fontOutlines` chunk and load it only when required.
- Avoid loading duplicate static and variable font families unless both are necessary.
- Track compressed frontend size in CI.

### Acceptance Criteria

- Clean documents do not trigger a continuous animation loop.
- Pointer movement does not rebuild unchanged paths.
- Standard benchmark documents meet agreed frame-time and selection-latency budgets.
- Long conversion and export operations remain cancellable and do not freeze the UI.
- Undo memory stays within a documented budget on the 10,000-path fixture.

---

## Phase 7: Visual and Interaction Polish

**Goal:** Create a coherent, professional interface after correctness and workflow foundations are stable.

### 7.1 Consolidate the visual identity

- Choose one primary SaVaGe mark and wordmark system.
- Align converter branding with the graphite, lime, Syne, and DM Sans editor direction.
- Reduce secondary studio branding within the work surface.
- Define application icon, title-bar, splash, installer, and document-icon usage.

### 7.2 Formalize design tokens

Define tokens for:

- Neutral surfaces and elevation.
- Text hierarchy.
- Accent, success, warning, error, and selection colors.
- Borders, focus rings, and disabled states.
- Spacing and control sizes.
- Typography roles.
- Animation durations and easing.

Use these tokens across converter, editor, dialogs, notifications, and menus.

### 7.3 Refine workspace hierarchy

- Keep the canvas visually dominant.
- Distinguish global commands, active-tool options, and contextual object properties.
- Avoid overloading the narrow sidebar with equally weighted tabs.
- Preserve panel sizes between sessions.
- Support sensible minimum window dimensions and overflow behavior.
- Ensure controls never overlap or truncate critically at supported sizes.

### 7.4 Add complete visual states

Design and implement:

- Empty.
- Loading.
- Converting.
- Cancelling.
- Success.
- Recoverable failure.
- Blocking failure.
- No selection.
- Mixed selection.
- Disabled operation.
- Modified document.
- Offline or unavailable external resource, if applicable.

### 7.5 Add visual regression coverage

Capture stable screenshots for:

- Converter empty, loaded, converting, and completed states.
- Editor empty and populated states.
- Open menus and dialogs.
- Layers and properties with large content.
- Error and recovery prompts.
- Minimum and standard supported window sizes.
- Windows scaling and high-contrast scenarios where automation allows.

### Acceptance Criteria

- Branding is consistent across application, installer, documents, and help.
- No critical text or controls overlap at supported window sizes.
- Focus, selection, disabled, warning, and error states are visually distinct.
- Visual regression tests protect the primary states.
- A small usability study confirms that tool and panel hierarchy is understandable.

---

## Phase 8: High-Value Functional Expansion

**Goal:** Add features that strengthen the core converter/editor workflow after quality foundations are complete.

Prioritize based on user research and telemetry, not feature count.

### Recommended Candidates

1. **Export workflow improvements**
   - Export presets.
   - Repeat Export.
   - Batch export.
   - Transparent/background options.
   - Scale and target-size previews.

2. **Batch conversion**
   - Queue multiple raster files.
   - Apply shared or per-file presets.
   - Show progress, failures, and retry controls.
   - Limit concurrency and memory use.

3. **Comparison and quality tooling**
   - Raster/vector overlay.
   - Difference visualization.
   - Path-count and complexity estimates.
   - Before/after file-size comparison.

4. **Desktop integration**
   - File associations for `.savage`.
   - Open With support.
   - Recent files and jump-list integration.
   - Drag files onto the installed application.

5. **Plugin maturity**
   - Versioned plugin API.
   - Explicit permissions.
   - Signing or trust prompts.
   - Per-plugin failure isolation.
   - Disable and safe-start mechanisms.

### Acceptance Criteria

- New features have validated user demand.
- Every feature includes loading, failure, cancellation, undo, accessibility, and persistence behavior where applicable.
- New native work respects established resource limits and capability boundaries.
- New workflows include unit, integration, and E2E coverage.

---

## Test Strategy

### Unit Tests

Use unit tests for:

- Transform composition and coordinate conversion.
- Bounds and hit-testing primitives.
- Document graph validation.
- SVG path and transform parsing.
- Serialization escaping.
- Resource-limit calculations.
- Undo transaction boundaries.

### Integration Tests

Use integration tests for:

- Document store plus file lifecycle.
- Group, ungroup, copy, paste, and symbols.
- Converter command validation.
- Native save/export failure handling.
- Recovery snapshots.
- Renderer, bounds, hit-test, and export agreement.

### End-to-End Tests

Automate these critical journeys:

1. Import raster → configure → convert → compare → open in editor → save → reopen → export.
2. Create document → draw/edit/group → undo/redo → save → close → reopen.
3. Modify document → attempt New/Open/Close → Save/Discard/Cancel outcomes.
4. Open malformed and oversized inputs → controlled error → current work preserved.
5. Keyboard-only open, convert, edit properties, save, and export.
6. Trigger native I/O failure → visible error → retry succeeds.
7. Crash/restart simulation → recovery prompt → recovered content saved.

### Manual Release Tests

- Clean Windows installation and uninstall.
- Upgrade from the previous released version.
- File association behavior.
- WebView2 prerequisite behavior.
- Manual opening from the packaged application.
- High DPI, multiple monitors, and display scaling.
- Non-administrator account and protected folders.
- Large-document responsiveness and cancellation.

---

## Release Gates

### Alpha Quality Gate

- Phase 1 document correctness complete.
- Phase 2 unsaved-work protection and standard Save behavior complete.
- Critical malformed-input crashes fixed.
- Existing and new critical tests pass.

### Beta Quality Gate

- Phases 3 through 5 complete.
- Security capabilities reduced and CSP enabled.
- Core workflow E2E and accessibility checks pass.
- No known critical or high-severity data-loss defects.
- Recovery behavior verified in a packaged build.

### 1.0 Quality Gate

- Performance budgets pass on standard fixtures.
- Visual regression suite covers primary states.
- Installer and upgrade smoke tests pass.
- Documentation matches actual behavior.
- No unresolved critical or high-severity defects.
- Medium-severity defects have explicit disposition.
- Release notes document format compatibility and known limitations.

---

## Suggested Delivery Sequence

A practical delivery sequence is:

1. CI, fixtures, and baseline measurements.
2. Shared transform traversal and regression tests.
3. Boolean operand safety.
4. Persistence revisions, Save/Save As, and unsaved-change prompts.
5. Atomic saves and crash recovery.
6. Strict project validation and graph checks.
7. SVG fidelity, sanitization, CSP, and Tauri capability reduction.
8. Raster and export resource limits.
9. Converter feedback and editor onboarding.
10. Keyboard navigation and accessibility.
11. Render scheduling, caching, hit-test acceleration, and undo optimization.
12. Visual-system consolidation and regression coverage.
13. User-validated functional expansion.

Do not begin a later item when it depends on an unresolved correctness or safety issue from an earlier item.

## Initial Backlog

The first implementation milestone should contain these work items:

- Add failing nested-group transform tests.
- Implement shared transformed document traversal.
- Fix renderer, bounds, hit testing, and flattening to use it.
- Fix boolean operations to delete only participating operands.
- Add document revision and current-path state.
- Implement Save, Save As, title, and modified marker.
- Add unsaved-change prompts for New, Open, Convert replacement, and Close.
- Make save/export errors visible.
- Make project writes atomic.
- Define and enforce the `.savage` schema and graph invariants.
- Add CI checks for TypeScript, Vitest, Rust formatting, Clippy, and Rust tests.

This milestone should be considered complete only when the new tests demonstrate that the old failure modes are no longer possible.

## Documentation Updates

Update documentation alongside implementation:

- Keep `README.md` focused on setup, supported platforms, and development commands.
- Update `USER_MANUAL.md` whenever behavior or shortcuts change.
- Replace the stale manual checklist with automated coverage references and a smaller release-only manual checklist.
- Document supported SVG features and known lossy cases.
- Document `.savage` version compatibility and migrations.
- Add security reporting and responsible disclosure guidance.
- Add release notes and upgrade notes for every packaged version.

## Definition of Done

A work item is complete when:

- User-visible behavior and failure behavior are defined.
- The root cause is addressed at the owning abstraction.
- Relevant unit or integration tests are added.
- Critical user journeys receive E2E coverage where appropriate.
- Keyboard and accessibility behavior is included.
- Performance impact is measured for geometry or rendering changes.
- Errors are surfaced with actionable messaging.
- Documentation is updated.
- CI passes without warnings introduced by the change.
- The behavior is verified in the packaged Tauri application when native integration is involved.
