# Defect disposition

Recorded: 2026-10-06

This is the review the 1.0 gate asked for: no unresolved critical or high defect, and an
explicit disposition for each medium defect. The beta data-loss row uses the same
review. The checklist stays in [release-gates.md](release-gates.md). There is no
separate tracker. A green `pnpm check:ci` does not replace the classifications below.

The review reads records already in this repository. It does not re-run Guest smoke
on the current tree.

## How an item is classed

| Class | Rule for this gate |
|---|---|
| Critical | Confirmed corruption of a user or corpus file, missing recovery of an accepted fixture, or a security defect that crosses the command boundary. An unresolved critical item keeps 1.0 open and is a halt trigger ([m8-withdraw.md](m8-withdraw.md)). |
| High | Committed work lost outside the documented recovery window, a modified document replaced without Save / Discard / Cancel, or a security defect that breaks a stated safety contract. An unresolved high item keeps 1.0 open. |
| Medium | Incorrect behavior a user can hit that leaves committed files intact. 1.0 requires a disposition: fix before 1.0, accept, or mitigate. |
| Not a defect | A contract or the user manual already states the behavior. |
| Unverified | The check has not been run. It stays on its own gate. A missing run is not a defect. |

## Records read

- [withdrawals/v0.1.0.md](withdrawals/v0.1.0.md) — no halt is recorded.
- Promotion records [v0.1.0](promotion-records/v0.1.0.md), [v0.1.1](promotion-records/v0.1.1.md), [v0.1.2](promotion-records/v0.1.2.md), and [v0.1.3](promotion-records/v0.1.3.md).
- [release-notes-0.1.0.md](release-notes-0.1.0.md), [m8-compatibility.md](m8-compatibility.md), and `USER_MANUAL.md` §12.
- [architecture-contracts.md](architecture-contracts.md) for recovery, conversion, export, and the derived-geometry cache.
- [benchmark-baseline.json](benchmark-baseline.json), [packaged-recovery.json](packaged-recovery.json), and [packaged-recovery-source.json](packaged-recovery-source.json).

## Critical and high

No unresolved critical or high defect is in that record.

| Item | Where it was seen | Disposition |
|---|---|---|
| Close **Discard** did not quit | Guest on unsigned 0.1.0 and 0.1.1 | **Resolved.** Guest on 0.1.2 confirmed Discard quits and Cancel leaves the app open. |
| **Open in Editor** Discard kept the previous destination | Guest on 0.1.1 | **Resolved.** Guest on 0.1.2 confirmed that choice starts an unsaved session. |
| Undo did not run with focus off the canvas | Guest on 0.1.1 | **Resolved.** 0.1.2 handles Ctrl+Z / Ctrl+Y app-wide. Guest confirmed Ctrl+Z off the canvas. |

`v0.1.2` and `v0.1.3` promotion records list no halt. The withdrawal placeholder for
0.1.0 records none. The packaged recovery run killed the release executable, offered
Recover, opened an unsaved copy, and left the source `.savage` bytes and timestamp
unchanged. That run used the release executable. NSIS install evidence stays on the
installer row.

## Medium

| Item | Evidence | Disposition |
|---|---|---|
| Hit testing above 8,192 nodes | On 2026-10-06, DESKTOP-SCI395N, the 10,000-path probe in [benchmark-baseline.json](benchmark-baseline.json) took 12,381 ms for a hit and 12,004 ms for a miss. The standard 1,000-path hit p95 is 0.649 ms, inside the 16 ms target. | **Accept** for 1.0. |

The performance gate is the standard fixture. The derived-cache contract caps a bulk
fill at 8,192 nodes and waits for a spatial index until a named-machine profile shows
the linear pass is the bottleneck on that fixture. This probe is above the cap, so
each hit recomputes matrices. The manual already tells a lagging trace to simplify
paths. Reopen this item if a later baseline puts the 1,000-path hit test over 16 ms.

## Reviewed and not filed

These are stated behavior. They are not open defects.

| Behavior | Where it is stated |
|---|---|
| Tracing and PNG rasterize finish the current stage after Cancel. The job stays busy, then reports Cancelled. A cancelled export does not write the destination. | Conversion and export contracts; user manual troubleshooting |
| Forced termination can lose edits inside the recovery window (1.5 s idle, at most 10 s plus write latency). | Recovery contract |
| SVG import drops arcs-as-curves, skew, `use` / `symbol`, clip paths, and raster images. | [m8-compatibility.md](m8-compatibility.md), release notes |
| Schema 2 and newer recovery envelopes are refused and left on disk. | Format compatibility contract |
| The installer is unsigned until Authenticode exists. Stable distribution waits on that. | [m8-release.md](m8-release.md) |
| This release does not register a `.savage` file association. | Install contract; user manual |
| Pattern and scatter spacing are fixed. Vanishing points are not draggable. Text outlines use the bundled faces. Browsers may skip mesh paint. | User manual §12.1 |

## What this review leaves open

- The missing-WebView2 run. [webview2-missing.json](webview2-missing.json) refused on this PC because the runtime is already installed and Windows 10 Home cannot host Sandbox or Hyper-V.
- Live disk-full and removable-media injection beyond the missing-volume unit test.
- Narrator, display scaling, and high contrast. Guest signed those on the 0.1.2 installer. This review does not repeat them on the current executable.
- Authenticode. Unsigned internal builds stay below stable.
