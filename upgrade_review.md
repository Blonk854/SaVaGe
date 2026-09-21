# SaVaGe Upgrade: Architecture Review and Revised Build Plan

Review date: 2026-09-12

Original plan: [savage_upgrade.md](savage_upgrade.md)

## 1. Verdict

I agree with the overall approach: correctness and protection of user work should precede feature expansion. React, Zustand/Immer, Tauri, and Rust remain appropriate choices. A framework rewrite, general-purpose scene engine, plugin sandbox, or new persistence database is not justified by the evidence reviewed.

The original is a useful product roadmap, but it is not yet the best reasonable implementation plan. Material improvements are needed around transform representation, asynchronous document transactions, validation order, native job behavior, Windows persistence, testing feasibility, and compatibility/rollback. These are implementation-contract gaps, not objections to the product direction.

There is no blocker to beginning baseline tests and tooling. Findings B1 and B2 are blockers for their respective geometry and persistence workstreams: resolve them with focused tests and a short design decision before implementing those slices. They do not require stopping all other work.

This document contains the critique and a replacement execution plan. The original file is preserved as the historical roadmap.

## 2. Evidence and Assumptions

Evidence checked for this review:

- The complete original plan and its ordering, acceptance criteria, and release gates.
- [Document types](src/shared/document/types.ts#L3): decomposed transforms include skew fields, while the document version is fixed at 1.
- [Matrix implementation](src/shared/geometry/transform.ts#L33): current composition applies translation, rotation, and scale, but not those skew fields.
- [Document store](src/shared/stores/documentStore.ts#L76): document replacement and selection live in the temporal store; there is no session/save transaction contract.
- [Conversion command](src-tauri/src/commands/convert.rs#L21): one synchronous command returns the complete SVG string, with no job identity or cancellation protocol.
- [Plugin API](src/shared/plugins/api.ts#L45): registered commands execute in-process with document mutation access; supplied examples are built-in plugins.
- [Build scripts](package.json#L6) and [Tauri configuration](src-tauri/tauri.conf.json#L6): the native manifest is under `src-tauri`, scripts assume pnpm availability, packaging is Windows NSIS, and CSP is disabled.

The earlier review recorded 67 passing frontend tests, 4 passing Rust tests, and a successful frontend production build. Those checks were not rerun for this documentation-only review. They do not establish native UI automation, installer correctness, or SVG conformance. Browser-only startup previously failed at the Tauri boundary; native interactive startup was not verified because of local pnpm setup permissions.

Assumptions requiring confirmation during milestone M0:

1. Windows desktop is the supported release target. A browser harness is for development/testing, not a promise of a web product or mobile support.
2. Existing valid version-1 projects must remain readable. Strict validation must retain documented legacy defaults instead of rejecting valid older projects indiscriminately.
3. The editor has one active document per window. Separate application instances can still encounter the same destination file.
4. Inputs can be untrusted. The threat model includes malicious documents and a compromised webview, but not protection against an attacker already executing arbitrary code as the Windows user.
5. No automatic updater, third-party plugin marketplace, online account, or telemetry service is required for this quality release.
6. The team size, schedule, reference hardware, and existing user-file corpus are unknown. Milestones are dependency-ordered, not calendar estimates.
7. Ordinary close can be intercepted; forced process termination, power loss, and every OS shutdown cannot be prevented by a prompt. Recovery mitigates these cases with an explicit recovery-point objective.

## 3. Findings

Risk estimates below are qualitative engineering judgments, not measured incident probabilities.

### B1. Transform and fidelity contracts are incomplete

**Classification:** Blocker for M2 geometry implementation.

**Issue:** [Phase 1](savage_upgrade.md#L110) specifies one traversal and appearance-preserving reparenting, but not matrix representation, skew order, singular-transform behavior, or symbol/clip coordinate spaces. It also requires SVG export/import parity before the parser improvements in Phase 3. Current matrix composition ignores skew fields that exist in the model.

**Why it matters:** Composing nonuniform scale and rotation can produce shear. Traversal alone cannot make a result correct if it is converted back into a lossy representation. A monolithic shared traversal would also risk conflating group compositing, hit testing, and serialization, which legitimately have different responsibilities.

**Risk if unchanged:** High correctness risk and substantial rework; exported or reparented objects can change shape despite passing simple group tests.

**Concrete improvement:** Specify matrix order, coordinate spaces, determinant tolerance, and a lossless representation/decomposition policy first. Share affine math and bounded traversal context, not all rendering behavior. Use independent expected-coordinate fixtures. Move supported SVG transform/arc fidelity into the same milestone or narrow that milestone's acceptance to native-project parity. Explicitly reject unsupported destructive edits rather than silently losing geometry.

### B2. Save state is not defined across asynchronous work and undo

**Classification:** Blocker for M3 document-session implementation.

**Issue:** [Persistence revisions](savage_upgrade.md#L172) are listed, but snapshot identity, concurrent save ordering, document replacement, and undo-to-saved behavior are unspecified. Undo transaction work is deferred to [Phase 6](savage_upgrade.md#L493), despite being part of the saved-state contract.

**Why it matters:** A save that starts at state A and completes after edit B must not mark B saved. A delayed conversion or Open result must not replace a different document. A monotonic edit counter alone cannot recognize undo back to the saved history state.

**Risk if unchanged:** High data-loss risk: wrong clean indicators, stale results applied to current work, and an older save overwriting a newer save.

**Concrete improvement:** Introduce a session ID, committed history-state identity, immutable save snapshot, operation ID, and serialized writes per destination. Save completion acknowledges only the captured state in the matching session. Establish undo transaction boundaries and history reset on replacement in M3. Test edits during save, failed/cancelled Save As, undo/redo around a save, and out-of-order completion.

### S1. Dependencies are inconsistent and validation comes too late

**Classification:** Significant.

**Issue:** [The delivery sequence](savage_upgrade.md#L728) places recovery and geometry ahead of strict validation, although both consume persisted graphs. The first backlog also combines tooling, geometry, saves, recovery foundations, and validation into one oversized milestone. UI cancellation precedes the native job design that enables it.

**Why it matters:** Later validation can invalidate earlier assumptions or crash recovery itself. Oversized milestones have unclear completion boundaries and are difficult to review or revert.

**Risk if unchanged:** High integration and schedule risk; features can be declared complete before their dependencies exist.

**Concrete improvement:** Establish bounded ingestion and graph invariants early, split milestones into demonstrable increments, and express actual dependencies. Develop accessibility and error states with each control rather than waiting for a later retrofitting phase. Gate cancellation UI on a tested native job contract.

### S2. Atomic save and recovery lack Windows failure semantics

**Classification:** Significant.

**Issue:** [Atomic writes and recovery](savage_upgrade.md#L212) do not specify replacement of an existing Windows file, locked destinations, external modifications, multi-instance behavior, recovery-file identity, or cleanup while a newer edit exists.

**Why it matters:** An ordinary rename is not a portable atomic replacement guarantee. Deleting a destination before renaming creates a loss window. Removing recovery after any successful save can discard edits made while that save was in flight.

**Risk if unchanged:** High file-corruption or lost-recovery risk, especially on disk-full, antivirus/file-lock, and concurrent-write paths.

**Concrete improvement:** Prove a same-directory Windows replacement implementation with injected failures before adopting it. Keep the original intact on failure; do not silently fall back to delete-then-rename. Detect external changes and offer conflict resolution. Define session-specific recovery metadata, validated writes, retention and disk budgets, and cleanup only through the acknowledged saved state. Distinguish process-crash guarantees from power-loss durability and network-filesystem limitations.

### S3. Resource limits and cancellation need a feasible execution contract

**Classification:** Significant.

**Issue:** [Resource safeguards](savage_upgrade.md#L303) and [background tasks](savage_upgrade.md#L502) promise cancellation without testing whether the current decoder/vectorizer/rendering libraries can be interrupted. Path count, intermediate allocations, generated SVG size, and IPC copies are not covered by input dimensions alone.

**Why it matters:** Ignoring a late result or timing out a future does not stop blocking native computation or release its memory. A small source can also produce a costly vector result.

**Risk if unchanged:** High availability risk and misleading cancellation UI; nominal limits can still permit memory exhaustion.

**Concrete improvement:** Spike native job cancellation early. Bound source, decoded, intermediate, output, and concurrent memory/work. Track jobs by session and source revision. If cancellation is only cooperative between stages, say so and retain the occupied job slot until computation exits. Use a helper process only if hard termination is a confirmed requirement that cannot otherwise be met. Never advertise a hard deadline without an enforceable mechanism.

### S4. The security boundary is not fully specified

**Classification:** Significant.

**Issue:** [Native capability reduction](savage_upgrade.md#L292) mentions narrow commands and validated paths, but not who authorizes paths, reference/resource policies, or compatibility with current inline styles, bundled fonts, previews, and Help. Structural ownership is also different from reusable symbol and clipping references.

**Why it matters:** A custom command accepting an arbitrary path is not secured just by removing generic filesystem permissions. A single blanket graph rule may reject valid reusable references while missing recursive symbol expansion. A CSP can break the app without actually constraining privileged operations.

**Risk if unchanged:** High security risk or broad functional regressions.

**Concrete improvement:** Write a command/capability and resource policy matrix. Authorize destinations in the native layer and grant operation-specific access rather than trusting webview-provided strings. Validate ownership edges separately from reference edges, including symbol recursion and expansion limits. Allow only bounded, necessary local/embedded resources. Test CSP in packaged mode without weakening script policy to accommodate inline CSS. Treat in-process plugins as trusted code; signing is not isolation.

### S5. The test strategy lacks an executable native harness and independent oracles

**Classification:** Significant.

**Issue:** [E2E coverage](savage_upgrade.md#L674) has valuable journeys but no selected Windows/Tauri automation path, native dialog strategy, or proof that CI can execute it. Renderer/export agreement could be tested through shared buggy math rather than an independent reference. Exact image equality is not realistic for all fonts, effects, and unsupported SVG features.

**Why it matters:** Browser mocks cannot verify real filesystem IPC, native close events, WebView2, or the NSIS installation. Shared implementation tests can agree while both outputs are wrong.

**Risk if unchanged:** Medium-to-high false-confidence and schedule risk.

**Concrete improvement:** Prove one Windows packaged smoke journey in M0 using a supported driver approach, such as Tauri WebDriver with matching Edge WebDriver if viable. Keep a browser adapter for DOM/accessibility testing only. Use hand-calculated coordinates and pinned independent raster references for the supported SVG subset, with explicit tolerances. Provide a mandatory recorded manual native gate until automation works rather than calling mocked tests end-to-end native coverage.

### S6. Rollout, format compatibility, rollback, and support diagnostics are missing

**Classification:** Significant.

**Issue:** [Release gates](savage_upgrade.md#L699) list installer and upgrade checks but no cohort rollout, downgrade policy, failed-migration behavior, retained artifacts, or support evidence. Stricter validation and corrected transforms can change the behavior of existing files even without a version bump.

**Why it matters:** Reinstalling an old binary does not restore documents written in a new format or reverse changed interpretation. Undiagnosable save or recovery failures are difficult to repair in the field.

**Risk if unchanged:** High recovery risk after a problematic release and medium supportability risk.

**Concrete improvement:** Publish a reader/writer compatibility matrix; migrate in memory and never overwrite source files during migration. Require Save As and an original copy for incompatible writes. Retain prior verified installers and test reinstall plus document access. Release to an internal corpus, then opt-in beta, then stable. Add bounded local diagnostic logs with operation IDs and redaction; no automatic document upload or telemetry requirement.

### S7. CI and dependency work are not yet reproducible or scoped

**Classification:** Significant.

**Issue:** [Phase 0](savage_upgrade.md#L58) adds coverage, audits, strict Clippy, and installer output without specifying missing tools, baseline failures, manifest paths, or new-dependency evaluation. Root-level bare `cargo` commands do not select the manifest under `src-tauri`. A known-good non-admin pnpm setup is not demonstrated.

**Why it matters:** The first gate can remain red for unrelated debt or advisory noise, and package/tool churn can dominate a correctness upgrade. CI configuration alone cannot guarantee repository branch protection is configured.

**Risk if unchanged:** Medium implementation and supply-chain risk; unreliable or permanently bypassed gates.

**Concrete improvement:** Pin compatible Node/pnpm/Rust and workflow actions, use locked installs and explicit Cargo manifest paths, baseline existing warnings, and add ratcheted gates. Select compatible coverage, accessibility, native-driver, validation, and sanitizer dependencies only when needed; review licenses, maintenance, native/bundle cost, and API fit. Give audit exceptions owners and expiry dates. Configure required status checks separately from workflow creation and protect release signing credentials from untrusted PRs.

### M1. Performance work is over-prescribed before measurement

**Classification:** Minor.

**Issue:** [Phase 6](savage_upgrade.md#L470) prescribes many caches, a spatial index, virtualization, and lazy loading without bottleneck evidence. Path count alone is a weak measure of curves, meshes, effects, symbols, or bitmap cost. A two-second startup goal and 16 ms hit-test limit lack percentile and machine definitions.

**Why it matters:** Cache invalidation and extra indexing can introduce correctness bugs and memory cost while failing to address the actual bottleneck. Hit testing consuming the entire frame budget leaves no time for rendering.

**Risk if unchanged:** Medium maintenance cost and low-to-medium performance regression risk.

**Concrete improvement:** Measure representative feature-rich fixtures on named hardware. Start with render scheduling, narrow subscriptions, and only demonstrated hot-path caches. Add bounded eviction and invalidation tests, then indexing or virtualization only when profiling justifies them. Define percentile-based full-interaction budgets and cold/warm startup separately.

### M2. Required quality work and optional product expansion are mixed

**Classification:** Minor.

**Issue:** Overlay/comparison features appear in both [core usability](savage_upgrade.md#L345) and [functional expansion](savage_upgrade.md#L606). Plugin signing, jump lists, batch workflows, and broad first-run guidance are not necessary to fix the current release blockers.

**Why it matters:** Overlapping scope makes estimates and completion ambiguous and can delay a safe release. Retrofitting accessibility after controls are rebuilt also duplicates work.

**Risk if unchanged:** Medium delivery risk, with limited direct correctness impact.

**Concrete improvement:** Define a required quality release and a separately prioritized optional backlog. Implement keyboard/error/empty states with each touched workflow. Keep plugin distribution and sandboxing deferred unless untrusted third-party loading becomes an actual requirement.

## 4. Revised Scope and Architecture

### Required for the quality release

- Valid document invariants, consistent geometry, and safe booleans.
- Honest supported-format behavior and no silent destructive import.
- Correct save/undo/session lifecycle, atomic persistence, and bounded recovery.
- Bounded ingestion and native execution; least privilege and tested CSP.
- Clear conversion/file feedback, usable keyboard controls, and coherent visual states.
- Measured responsiveness and demonstrated native/installer behavior.
- Compatible document handling, staged releases, and an actionable rollback path.

### Deferred unless user evidence justifies inclusion

- Batch conversion/export, difference visualization, jump lists, file associations.
- New advanced drawing tools, a command palette, and elaborate onboarding.
- Third-party plugin loading, signing infrastructure, or process sandboxing.
- Automatic updates, accounts, hosted telemetry, or a public web edition.

Recent files and repeat export are useful small follow-ups, not prerequisites for safe Save/Open.

### Ownership boundaries

| Boundary                     | Responsibility                                                       | Deliberate limit                                                             |
| ---------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Document model and ingestion | Schema, legacy normalization, graph/reference invariants             | Does not manage dialogs or user notifications                                |
| Geometry helpers             | Affine composition, coordinate conversion, bounded traversal context | Does not force renderer, serializer, and hit testing into one generic engine |
| Document/session store       | Committed states, history, dirty state, active operation identity    | Viewport repaint and hover state remain separate                             |
| File workflow coordinator    | Save/Open/Close decisions and async state checks                     | Native code owns actual file authorization and writes                        |
| Native services              | Authorized I/O, limits, job execution, typed results                 | No arbitrary-path convenience command or unbounded task launch               |
| UI components                | Accessible controls, progress, errors, and user decisions            | No ad hoc direct document replacement from async callbacks                   |

Extend current modules and libraries where practical. Add a helper or service only when it owns one of these concrete responsibilities. Do not introduce a generic command bus or replace Zustand solely to implement this plan.

## 5. Milestone Dependency Map

| ID  | Milestone                                             | Prerequisites                      | Exit artifact                                                         |
| --- | ----------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------- |
| M0  | Reproducible checks and contract probes               | None                               | Passing baseline plus resolved geometry/save/native-harness decisions |
| M1  | Bounded ingestion and document invariants             | M0                                 | Validated immutable input candidates and adversarial tests            |
| M2  | Geometry and supported SVG fidelity                   | M0, M1                             | Independent conformance fixtures and appearance-preserving edits      |
| M3  | Session, undo, and safe file lifecycle                | M0, M1                             | Snapshot-correct Save/Open/Close and real Windows write tests         |
| M4  | Recovery and file compatibility                       | M2, M3                             | Recovery fault tests and reader/writer matrix                         |
| M5  | Native job lifecycle and complete boundary hardening  | M0, M1; M3 session contract        | Bounded work, honest cancellation, native authorization and CSP tests |

## 6. Remaining work checklist

This is the practical remaining-work list for the current repo state, based on the evidence reviewed in [savage_upgrade.md](savage_upgrade.md) and on the fresh verification runs for the frontend and Rust checks.

### 6.1 Geometry and correctness
- Finish the single transform contract for rendering, bounds, hit testing, selection handles, snapping, flattening, clipboard, grouping, and SVG export/import.
- Nested group/ungroup/copy now bake world matrices through `matrixToTransform` so rotated/scaled groups keep appearance. Symbol detach bakes instance world onto symbol roots and keeps nested locals. SVG import/export fidelity of symbol/use remains unsupported on the SVG interchange path.
- Correct boolean operand selection so unsupported or non-participating shapes are not deleted. **Done:** mixed selections keep non-participants (`booleanOps.test.ts`).
- Add geometry conformance coverage for mixed transforms, negative scale, rotation, translation, and multilevel groups.
- Evidence: [src/shared/stores/documentStore.ts](src/shared/stores/documentStore.ts), [src/shared/geometry/flatten.ts](src/shared/geometry/flatten.ts#L71-L78), [src/features/tools/booleanOps.ts](src/features/tools/booleanOps.ts#L1-L46)

### 6.2 Validation and safety
- Strengthen `.savage` validation to check required fields, finite geometry, paint values, ID uniqueness, ownership, reference integrity, depth, and resource limits before data enters the document store. **Done for Open:** finite transforms/geometry/paint, unique ownership, clip/symbol references, depth, and path-point limits.
- Harden SVG import and SVG serialization so loaded/exported files remain safe and faithful within the supported subset. **Done:** bounded ingest, internal IDs, local-only paint, escaped export, data-only image hrefs.
- Add adversarial tests for malformed JSON, deep nesting, duplicate IDs, oversized inputs, and non-finite numbers.
- Evidence: [src/shared/document/parseSavage.ts](src/shared/document/parseSavage.ts), [src/shared/document/deserialize.ts](src/shared/document/deserialize.ts), [src/shared/document/serialize.ts](src/shared/document/serialize.ts)

### 6.3 Native job and resource boundaries
- Add preflight resource checks for raster decode, conversion, and PNG export, including dimension, pixel-count, memory, and output-size limits. **Done for convert and PNG export:** 16,384 per side, 40 million pixels, 32 MiB SVG/text output. Live disk-full and removable-media remain manual.
- Confirm cancellation is truthful and bounded for heavy work, including conversion and export tasks.
- Keep job/session/source-revision identity explicit so stale results cannot replace newer work.
- Evidence: [src-tauri/src/commands/import.rs](src-tauri/src/commands/import.rs#L15-L90), [src-tauri/src/commands/export.rs](src-tauri/src/commands/export.rs#L200-L290), [src-tauri/src/commands/convert.rs](src-tauri/src/commands/convert.rs)

### 6.4 File lifecycle and user protection
- Finish the session-state model for project path, display name, revision tracking, modified status, save time, and recovery state.
- Verify Save, Save As, New, Open, Replace-with-conversion, Close, and app shutdown still present Save/Discard/Cancel decisions for modified documents.
- Keep recent projects and reopen-last-project behavior available and consistent with the plan.
- Evidence: [src/features/editor/fileIo.ts](src/features/editor/fileIo.ts), [src/shared/stores/projectSessionStore.ts](src/shared/stores/projectSessionStore.ts), [src/app/layout/TitleBar.tsx](src/app/layout/TitleBar.tsx#L263)

### 6.5 Recovery and persistence
- Confirm recovery snapshots are sequence-aware and newer-than-original aware.
- Ensure recovery does not overwrite newer user work or lose the original destination on a failed save.
- Finish cleanup rules so snapshots are removed only after verified success or explicit discard.
- Evidence: [src/features/editor/recovery.ts](src/features/editor/recovery.ts), [src-tauri/src/commands/recovery.rs](src-tauri/src/commands/recovery.rs)

### 6.6 CI and quality gates
- Add coverage reporting to CI and ensure the required quality gateways run on pull requests and protected release branches. Coverage upload remains optional and must not use a repository-wide percentage gate.
- Include JavaScript dependency auditing and release-artifact upload for tests, coverage, benchmark, and installer outputs. **Done for JS audit:** `pnpm audit:frontend` (`pnpm audit --prod`) on pull requests, `main`/`master`, weekly schedule, tagged NSIS, and local `release:package`. No owned CVE exceptions.
- Make the release pipeline reflect the plan’s acceptance gates rather than only the minimum build/test flow.
- Evidence: [.github/workflows/check.yml](.github/workflows/check.yml), [.github/workflows/release.yml](.github/workflows/release.yml), [package.json](package.json#L6-L28)

### 6.7 E2E, accessibility, and visual regression
- Add the critical journey tests called for by the plan: import/convert/save/reopen/export, malformed input handling, recovery, close prompts, and keyboard-only file workflows.
- Add accessibility checks for menus, list-based panels, focus, and live-region status updates.
- Add visual regression coverage for the main editor and converter states.
- Evidence: [savage_upgrade.md](savage_upgrade.md#L674-L794)

### 6.8 Performance and release-readiness baselines
- Establish benchmark fixtures and repeatable measurement commands for startup, import, render, pan/zoom, hit testing, save, reopen, and export.
- Record baseline results on a named reference machine and compare them against the plan’s targets.
- Finish the documented release gates for alpha/beta/1.0 quality.
- Evidence: [savage_upgrade.md](savage_upgrade.md#L27-L60), [docs/engineering/m0-baseline.md](docs/engineering/m0-baseline.md#L5-L50)

### 6.9 UX and workflow polish
- Finish the converter workflow: warning states, custom preset tracking, visible progress, compare modes, and open/export actions.
- Improve the empty editor, controls, contextual help, and command palette as described in the plan.
- Evidence: [src/features/converter/ConverterView.tsx](src/features/converter/ConverterView.tsx), [src/features/converter/ConvertPreview.tsx](src/features/converter/ConvertPreview.tsx#L35), [src/app/layout/TitleBar.tsx](src/app/layout/TitleBar.tsx), [src/app/layout/AppShell.tsx](src/app/layout/AppShell.tsx)

### 6.10 Deferred expansion work
- Export presets, batch conversion, comparison tooling, file associations, and plugin maturity remain future work and should stay deferred until the safety and correctness milestones are closed.
- Evidence: [savage_upgrade.md](savage_upgrade.md#L692-L751)

## 7. Verification summary

Fresh verification was run against the current repo state:
- Frontend: `npx --yes pnpm@10.17.1 check:frontend` → 206/206 frontend tests passed and the production build succeeded.
- Rust: `npx --yes pnpm@10.17.1 check:rust` → 25/25 Rust tests passed, formatting and Clippy checks succeeded.

These checks confirm the repo is in a strong state, but they do not prove the full upgrade plan is implemented. The checklist above still represents the remaining work required to satisfy the plan’s acceptance criteria and Definition of Done.
| M6  | Core usability and visual/accessibility consolidation | M2, M3, M5                         | Verified primary user journey and accessible interface states         |
| M7  | Measured performance improvements                     | Baseline M0; stable M2-M6 behavior | Before/after profiles and enforced regression budgets                 |
| M8  | Release qualification and staged rollout              | M1-M7                              | Verified installer, compatibility evidence, rollback rehearsal        |

M2 and M3 may proceed independently after shared invariants are established. Security fixes that already have clear contracts should land early, not wait for M5. Accessibility, tests, error handling, and documentation belong to every applicable milestone. No public alpha bypasses the input-security or data-loss gates.

## 6. Milestone Implementation Details

### M0. Establish the baseline and resolve short blocking decisions

Primary surfaces: [package.json](package.json), [Tauri configuration](src-tauri/tauri.conf.json), [Cargo manifest](src-tauri/Cargo.toml), and existing tests.

Tasks:

1. Record the starting commit, dependency versions, current test results, formatter/Clippy output, security advisories, and current installer behavior. Do not mass-upgrade dependencies while fixing geometry.
2. Select a currently supported Node version compatible with the project, pin pnpm and Rust, retain lockfiles, and document a user-writable pnpm/Corepack installation. Verify nested Tauri build hooks on a non-admin account; do not rely on writing into Program Files.
3. Add compatible coverage tooling only after checking the installed Vitest version. Establish per-risk coverage expectations; do not gate on an arbitrary repository-wide percentage.
4. Run frontend build/tests and Rust checks using `--manifest-path src-tauri/Cargo.toml`. Use `--locked` for supported Cargo build/test commands. Check formatting with `cargo fmt --manifest-path src-tauri/Cargo.toml --check`. Ratchet existing warnings with bounded exceptions, then enable strict Clippy once the baseline permits it.
5. Add a small platform adapter for browser tests if needed. Guard Tauri-only initialization; production builds must never silently substitute successful mock saves. Add a top-level error boundary and actionable native-unavailable state.
6. Prove one installed/native open-edit-save-reopen test using the chosen Windows driver. Validate driver/WebView2 compatibility, dialog control, close interception, and runner requirements. If unavailable, keep automated native service tests plus a recorded manual native gate; do not mark native E2E complete.
7. Create independent fixtures for skew/nested transforms, singular matrices, mixed boolean selections, legacy projects, clips/symbols, hostile input, and representative workloads. Run hostile memory tests in disposable bounded processes, not unrestricted CI workers.
8. Resolve B1 and B2 in short, repository-local design notes with executable probes. Evaluate native vectorizer cancellation without changing its public behavior yet.

Exit checks: reproducible clean-account setup; passing baseline checks or explicitly owned pre-existing exceptions; a demonstrated native testing path; selected transform/history contracts. Establish repository required checks and restricted release credentials separately from adding YAML.

Dependency gate: for each new runtime or dev dependency, record need, alternatives already installed, license, maintenance, compatibility, bundle/native footprint, and pin/lock strategy. Reuse existing rasterization and test tooling where suitable. Audits fail on newly introduced reachable high/critical exposure; other exceptions require owner, mitigation, expiry, and re-review. Run scheduled audits as well as PR checks.

### M1. Bound ingestion and enforce document invariants

Primary surfaces: [project parser](src/shared/document/parseSavage.ts), [SVG parser](src/shared/document/deserialize.ts), [types](src/shared/document/types.ts), [store](src/shared/stores/documentStore.ts), and native import commands.

Tasks:

1. Set byte limits before reading complete files or parsing JSON/XML. Inspect raster metadata before full decoding and configure decoder allocation limits where the library supports them. Reject unsupported formats explicitly.
2. Introduce a version-discriminated validation boundary. Parse a bounded candidate, apply only documented legacy defaults/migrations, then validate before committing anything to the current session. Unknown future versions fail with an actionable message.
3. Validate discriminants, field types, finite ranges, node/key agreement, collection sizes, aggregate path points, nesting, asset bytes, and mesh dimensions. Check arithmetic for overflow before allocation, not afterward.
4. Separate ownership edges from references. Enforce unique scene ownership and no ownership cycles, while allowing legitimate reuse of symbol/clip definitions. Validate reference targets, symbol-local namespaces, recursive symbol expansion, clip cycles, and total expanded-work limits.
5. Define policies for orphans, unknown fields, and duplicate identifiers. Reject ambiguous input rather than silently overwriting nodes. Allocate internal IDs and remap all supported references during SVG ingestion, including paint/clip/symbol references.
6. Validate internal import, clipboard, recovery, and plugin-command results at appropriate commit boundaries. Maintain invariants during ordinary edits without reparsing the whole document on every pointer movement.
7. Reject executable SVG constructs and remote resource fetches at entry; keep raw SVG out of privileged DOM previews. Permit only deliberately supported bounded embedded image types. Harden XML serialization for every attribute and text field.

Limit policy: maintain named, versioned constants and user-facing reasons for source bytes, pixels, path commands, graph depth, nodes, symbol expansion, embedded resources, and output bytes. Set initial values from the fixture corpus and measured memory envelope in M0/M1; the milestone cannot close with these values unspecified. Test exactly-at-limit, just-over-limit, overflow, and invalid-number cases.

Exit checks: valid legacy fixtures load; invalid input does not alter document/history/session state; malformed graphs cannot reach recursive consumers; parser and serializer adversarial cases pass. Test schemas against real stored projects, not only generated examples.

### M2. Make geometry correct without promising universal SVG parity

Primary surfaces: [transform helpers](src/shared/geometry/transform.ts), [renderer](src/features/editor/renderer/drawDocument.ts), [bounds](src/shared/geometry/bounds.ts), [hit testing](src/shared/geometry/hitTest.ts), [flattening](src/shared/geometry/flatten.ts), [SVG serialization](src/shared/document/serialize.ts), and tool mutations.

Contract:

- Document `world = parentWorld * local` using a fixed vector/matrix convention and test multiplication order. Define screen, world, node-local, symbol-local, and clipping coordinate spaces.
- Preserve a complete affine transform. Retain the current decomposed representation only if skew composition and canonical decomposition pass independent tests across the required cases. If an explicit matrix field is necessary, decide its versioned reader/writer compatibility before introducing it; do not silently change version-1 meaning.
- For reparenting, use the destination inverse only when it exists. Singular/near-singular transforms have explicit selection and edit rules; reject operations requiring an undefined inverse without deleting or moving content.
- Share math and traversal context, but leave compositing and export structure in their owners. Inherited visibility/locking, group opacity, clipping, symbol expansion, stroke/effect bounds, and object z-order need feature-specific tests.

Tasks:

1. Add red tests for nested nonuniform scale plus rotation, skew, reflection, zero scale, origin changes, and symbol/clip cases.
2. Fix renderer, bounds, hit testing, flattening, selection handles, and affected tools using the agreed contract in small tested changes.
3. Preserve appearance during group/ungroup, reparent, copy/paste, symbol detach, and other existing structural operations. For booleans, retain operand ID/shape pairs and delete only successful participants.
4. Implement supported SVG transform lists and arc conversion with bounded numerical tolerance. Use a tested parser/math library when it fits better than extending incomplete custom parsing; approve its dependency cost first.
5. Publish an import/export support matrix: exact/native lossless; bounded approximation; explicit warning with user consent; unsupported rejection. Cover paths, transforms, paint servers, text/fonts, meshes, clips, images, and effects. Do not claim exact round trips for every SVG feature.
6. Document the effect of correcting previously ignored transforms in existing projects. Preserve source files and provide a preview/warning for affected legacy cases; do not automatically bake geometry using an assumed prior visual intent.

Exit checks: native project save/reopen preserves the model; supported SVG fixtures meet numerical and visual tolerances; grouping/reparenting retains expected world coordinates; mixed boolean selections preserve nonparticipants. Include independent expected coordinates and pinned raster references so shared code cannot validate itself.

### M3. Implement session-aware history and safe persistence

Primary surfaces: [document store](src/shared/stores/documentStore.ts), [file workflow](src/features/editor/fileIo.ts), [app shell](src/app/layout/AppShell.tsx), and [native export/write commands](src-tauri/src/commands/export.rs).

Session contract:

- Keep session ID, display name, authorized project destination, committed history-state ID, saved-state ID, pending operations, and save timestamp outside repaint state. UI selection/camera changes do not mark project content modified.
- Each committed document transaction receives a unique state identity preserved through undo/redo. A saved checkpoint may remain identifiable after history eviction. Conservatively treating independently recreated equal content as modified is acceptable; never mark unequal content clean.
- Group one completed gesture or multi-object command into one history step. Define commit/cancel behavior for unfinished gestures and text editing before save. Reset history on confirmed New/Open/replacement; do not allow Undo to resurrect another session's document.
- A save captures an immutable snapshot plus session/state/operation IDs. Writes to one destination are serialized. Completion acknowledges only that snapshot and matching session; later edits remain modified. Failure or cancellation never updates the destination or saved checkpoint.
- Open/Convert results are staged candidates. Check source/session identity on completion and obtain explicit replacement consent at commit time. Stale results never overwrite the current document.

Tasks:

1. Implement New, Open, Save, Save As, filename/modified title, and conventional shortcuts. Save As changes the current path only after successful persistence. Export never marks the project saved.
2. Route New/Open/Convert replacement/ordinary Close through one Save/Discard/Cancel coordinator. Prevent duplicate prompts; failed/cancelled saves keep the document open. If edits occur during the save, re-evaluate before closing or replacing.
3. Add typed native results that distinguish user cancellation, invalid input, stale/conflicting writes, access denial, disk-full, and internal failure. Notifications provide destination/retry details where appropriate.
4. Create a unique temporary file in the destination directory, write and flush, and use a proven Windows replacement operation. Never delete the original before replacement. Test both new-file and existing-file paths; clean up abandoned temps without destroying recoverable user data.
5. Detect external modifications using a recorded file identity/fingerprint and recheck before replacement. Offer Reload, Save As, or explicit overwrite. Serialize writes in one process and test two-instance conflicts; do not claim universal protection against all external-writer races or network filesystems.
6. Use a native-owned destination grant for repeat Save. A selected extension is a UX check, not authorization. Validate handles/path resolution and replacement behavior within the defined threat model.

Exit checks: A-save/B-edit remains dirty; Save As cancel retains old path; old session completion has no effect on the new session; undo to saved state becomes clean and redo becomes dirty; a conflicting/failed save preserves both current edits and the original file. Inject failure at temporary create/write/flush/replace/cleanup on Windows. Test read-only folders, file locks, disk-full, Unicode/long paths, removable destinations, and first-save collisions.

### M4. Add bounded crash recovery and compatibility

Tasks:

1. Save versioned recovery envelopes in the current user's app-data directory, separate from project files. Include application/schema version, session ID, source identity/path where appropriate, committed state ID, sequence, timestamp, and integrity data. Do not rely on modification time alone.
2. Snapshot committed states after a measured idle debounce and also after a maximum dirty interval; continuous editing must not postpone recovery forever. Agree and document the recovery-point objective after measuring serialization cost. Never promise zero loss on forced termination.
3. Write recovery atomically and validate it through M1. For untitled projects and multiple instances, use collision-free session identities. A corrupt snapshot does not prevent startup; quarantine or offer removal with a diagnostic reason.
4. Set per-session and aggregate disk budgets and retention. Recovery failures are visible but do not block normal editing. Do not silently prune the only unsaved recovery candidate to make room; notify the user when the budget cannot safely retain more.
5. Remove only snapshots covered by the acknowledged successful save or an explicit discard decision. Preserve snapshots containing newer edits. Offer Recover as a new unsaved document, Open Original, and Discard Recovery.
6. Build a reader/writer matrix for legacy version 1 and any introduced version. Perform migrations in memory. For incompatible writes, require a distinct Save As destination and retain an original-copy path. Older binaries need not read new formats, but that limitation must be explicit and tested.

Exit checks: killed-process restart recovers a valid committed state; corrupted/incompatible recovery cannot crash startup; save-in-flight never deletes newer recovery; continuous editing meets the agreed recovery interval; upgrade/reinstall tests preserve existing projects and app-data recovery.

### M5. Bound native jobs and finish the security boundary

Job contract:

- Assign a job ID, session ID, source revision, and immutable options. Use states Queued, Running, CancelRequested, Succeeded, Failed, and Cancelled with one terminal result.
- Begin with one heavy job at a time and a bounded queue, or reject a second job explicitly. Include memory held by input, decoded image, intermediate tracing geometry, output string, and IPC copies in the budget.
- Run blocking work on an appropriate bounded native worker, not an unbounded thread per request. Report real stages; do not fabricate percentage progress.
- Discard stale results only as a correctness measure, not as proof computation stopped. A CancelRequested job retains its slot until the worker really exits.
- Prove cancellation checkpoints in the chosen libraries. If only between-stage cancellation exists, expose that limitation. If responsive hard cancellation/timeouts are essential and unsupported, approve a helper-process spike with output cleanup and packaging tests before committing to it. Otherwise reduce accepted work bounds and document the limitation.

Security tasks:

1. Enumerate every privileged command, caller, authorized resource, validation rule, and capability. Remove unused plugins/permissions only after matching actual call sites.
2. Use native dialog/open/drop/launch events or native-owned grants to authorize file operations; arbitrary webview strings cannot create grants. Document symlink/reparse-point and path-replacement limitations, and use safe handle/path operations appropriate to the boundary.
3. Permit only required resource schemes and bounded embedded formats. No SVG-triggered HTTP fetch, script, event handler, or shell opening. Maintain a specific safe native Help operation for the bundled manual if needed.
4. Enable production CSP and separately configure development needs. Inventory fonts, data/blob previews, inline style use, and asset protocols. Avoid inline-script/eval permissions and do not mistake broad style allowance for script authorization.
5. Treat built-in plugins as trusted application code. Wrap their failures and transactions, prevent accidental mutation through returned live references, and validate resulting invariants. Do not add an untrusted plugin loader or claim CSP/signing sandboxes these commands.
6. Keep error logs bounded and local, with operation/job IDs, versions, elapsed stages, and error codes. Do not log document bodies, embedded assets, secrets, or full user paths by default. Provide an explicit user-reviewed diagnostic export.

Exit checks: input/output/queue limits are enforced natively; cancellation state is truthful; stale conversion/export cannot modify the current session or wrong destination; native work does not make the UI unresponsive on accepted fixtures; packaged CSP permits supported functionality and denies hostile cases. Run a separate native capability test instead of relying only on browser sanitization tests.

###  M6. Complete core workflows and presentation

Tasks:

1. Converter: show invalid-drop reasons, source metadata, accurate Custom preset state, pre-conversion preview state, real progress/cancellation state, and completion/error actions. Keep settings/results consistent with source and job revisions.
2. Editor: fit the initial artboard, offer concise empty-state actions, provide explicit disabled-action reasons, replace ambiguous alignment letters with accessible icons/tooltips, and show saved/modified status.
3. Keyboard: implement correct menu focus/arrow/Escape behavior, focusable layer/artboard/symbol rows, keyboard rename/selection, canvas focus/context, and text-input shortcut protection. Selection/status announcements must not overwhelm assistive technology during pointer movement.
4. Visuals: retain the established design direction, unify branding, make text readable, and standardize focus, selection, warning, error, disabled, loading, and mixed-selection states. Avoid introducing a new design system dependency just for cosmetic consistency.
5. Validate supported native window sizes, high DPI, Windows text scaling, high contrast, and Narrator. If 200% scaling conflicts with the configured minimum window size, define responsive overflow/panel behavior rather than hiding required controls.
6. Keep the manual and shortcut reference accurate. Add contextual help where testing demonstrates need; do not make a tutorial, command palette, synchronized overlay, or recent-files subsystem a completion dependency.

Exit checks: representative first-time users complete import-convert-edit-save-reopen-export; keyboard users complete the corresponding DOM/property workflows; native manual checks pass; every long action has honest progress/failure behavior; no required controls overlap or become unreachable at supported sizes.

### M7. Optimize measured bottlenecks

Measurement contract:

- Record CPU/GPU/RAM, WebView2 version, DPI, build mode, fixture version, and cold/warm conditions. Compare release builds, not development builds.
- Fixtures include path-point count, curves, strokes, effects, mesh cells, nested groups, symbol expansion, bitmap bytes, and history depth, not just node count.
- Measure p50/p95 full interaction frame time, input-to-paint latency, hit-test cost, peak memory, idle activity, import/export/conversion time, and startup. Treat the original 60 FPS and two-second startup goals as provisional until M0 baselines establish reference budgets.

Implementation order:

1. Schedule/coalesce frames on relevant invalidation. Include canvas resize, device-pixel-ratio changes, font/image readiness, selection/hover, transient drawing, and any actual animation needs.
2. Narrow store subscriptions and avoid persistent pointer-state churn. Verify idle work drops without losing repaint events.
3. Cache only demonstrated hot derived data. Bound cache size and test invalidation for edits, ancestor transforms, reparenting, symbol changes, history changes, and document replacement. Compare cached results against an uncached oracle.
4. Add bounds rejection before precise hit testing. Introduce a spatial index only if profiles still justify its update/memory cost; retain topmost selection semantics.
5. Virtualize lists or further split code only when those costs are material. Inspect existing dynamic imports before duplicating lazy-loading work. Measure font asset changes instead of removing required weights blindly.
6. Establish undo-memory and aggregate memory budgets based on measured retained data; use state sharing and bounded history before replacing the history architecture.

Exit checks: named benchmark budgets and an agreed regression allowance are committed; changes show before/after evidence; correctness tests pass in cached and uncached modes; long-session and document-switch memory tests show bounded retention. Prefer dedicated/scheduled performance runs for noisy hardware measurements over flaky PR thresholds.

### M8. Qualify, release, and rehearse rollback

Tasks:

1. Build a version-consistent NSIS artifact from a tagged commit with locked dependencies. Pin release actions, restrict signing credentials, and keep checksums plus build/test provenance. Decide code-signing before broad stable distribution; document any unsigned internal-build warnings.
2. Verify installation, update, uninstall, and reinstall under a non-admin account. Test WebView2 missing/outdated scenarios, bundled Help, application-data retention, file locks, and high DPI. File-association tests are required only if that optional feature ships.
3. Test the format compatibility matrix using copies of real old projects, corrected-transform fixtures, and recovery snapshots. New readers must not silently repair/overwrite unknown versions. Record known unsupported SVG cases in release notes.
4. Stage rollout: internal corpus and fault tests, opt-in beta with a defined test population/feedback interval, then stable only after explicit gate review. Set beta exit criteria before the beta starts; do not use an unexplained percentage rollout without distribution infrastructure.
5. Halt promotion on confirmed corruption, missing recovery, critical security defects, or failed install/upgrade. Preserve affected documents and diagnostic evidence with user consent, withdraw the bad artifact, and offer the prior verified installer.
6. Rehearse rollback: install previous binary while retaining app data; open preserved compatible originals; recover newer work using the appropriate reader or an explicit compatible export. A binary downgrade alone is not document rollback. Never silently downgrade or delete newer-format files or recovery snapshots.
7. Keep previous verified installers and compatibility notes available. Use manual reinstall for this scope; do not add an automatic updater simply to implement rollout.

Exit checks: no unresolved critical/high security, corruption, or data-loss defects; medium defects have documented acceptance/mitigation; installer and downgrade rehearsal pass; support diagnostics and recovery instructions are usable; documentation reflects tested guarantees rather than aspirations.

## 7. Required Test Matrix

| Risk                       | Focused automated evidence                                             | Native/manual evidence                                           |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Transform corruption       | Independent coordinates, property tests, supported SVG raster fixtures | Native visual checks for fonts/effects and imported legacy files |
| Graph/resource attacks     | Bounded parser/schema/reference tests and isolated fuzz corpus         | Packaged denial cases with no privileged resource access         |
| Wrong saved-state marker   | Deferred-promise tests for save/edit/undo/session races                | Slow/delayed real write followed by close/replacement            |
| Partial/conflicting writes | Native filesystem fault injection at every write stage                 | Windows locks, read-only/disk-full and two-instance conflicts    |
| Recovery loss              | Sequence/state cleanup tests, killed-child recovery tests              | Packaged crash/restart and update/reinstall retention            |
| Stale or uncancelled jobs  | Out-of-order completions, queue limits, state-machine tests            | Accepted worst-case job while interacting/cancelling/closing     |
| Privileged access          | Command authorization tests, CSP/sanitization cases                    | Production WebView2 with real capabilities and bundled Help      |
| Workflow/accessibility     | Browser adapter component tests, focus/keyboard checks                 | Native open-convert-edit-save-reopen-export, Narrator/scaling    |
| Performance regressions    | Benchmark fixtures and cache/oracle comparison                         | Named-machine release-build p95 latency/peak memory              |
| Bad release/rollback       | Artifact checks, version/reader-writer matrix                          | Clean install, upgrade, prior-installer reinstall with user data |

Independent raster references must pin fonts and renderer versions, restrict comparisons to supported features, and document pixel/geometry tolerances. Exact cross-renderer pixels are not a universal correctness requirement. Fuzzing is scheduled and resource-bounded; minimized failures become deterministic regression fixtures.

## 8. Review and Delivery Rules

1. Deliver one behavior-scoped change at a time: red regression test, smallest implementation, focused check, then broad suite. Avoid coupling tooling upgrades to geometry fixes.
2. Every work item identifies owner/boundary, prerequisites, failure behavior, tests, dependency additions, format impact, and how to revert code without damaging user files.
3. Geometry fixes need conformance review; save/recovery changes need failure-injection review; authorization changes need native boundary review. These can be review roles rather than separate full-time people.
4. Keep the existing application operable between milestones. Merge behind a temporary internal switch only when necessary, and never maintain two production writers for the same new format without explicit compatibility rules.
5. Estimate milestone effort after M0 probes resolve native automation, affine representation, and cancellation feasibility. Split any item lacking one demonstrable acceptance result before scheduling it.
6. Update user documentation with behavior changes and maintain a small manual release checklist that references actual automated coverage. Do not mark a checklist satisfied merely because a test exists.

## 9. First Executable Backlog

1. Capture baseline build/test/audit results and prove non-admin tooling setup.
2. Add two short probes: affine skew/reparent preservation and async-save/edit/undo acknowledgement.
3. Demonstrate one Windows native save/reopen smoke test and document driver constraints.
4. Implement bounded project parsing plus legacy normalization and graph/reference validation.
5. Land mixed-selection boolean operand safety with a regression test.
6. Implement the chosen affine contract across one complete nested-group fixture, then expand coverage to clips/symbols and tools.
7. Implement session/history identity, snapshot-correct Save/Save As, and the shared replacement/close coordinator.
8. Prove Windows atomic replacement and conflict handling with injected failures.

M0 closes after items 1-3; the remaining items are separate reviewable slices in M1-M3, not one giant initial release. Recovery follows validated ingestion and persistence; cancellation UI follows the demonstrated native job contract.

## 10. Definition of Done

A change is complete when its behavior and failure modes are specified, its owning boundary is correct, focused regression tests distinguish the old failure, relevant broader checks pass, compatibility and dependencies are reviewed, and user-facing errors/accessibility/docs are included. Native claims require native evidence. Performance claims require measurements. Release claims require a tested rollback path that preserves user data.

The revised plan preserves the original product direction while replacing broad promises with contracts, dependency gates, and evidence that can actually be delivered.
