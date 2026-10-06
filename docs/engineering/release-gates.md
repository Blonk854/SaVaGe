# Release gates

Recorded: 2026-10-06

This is the alpha, beta, and 1.0 checklist from the upgrade plan, with the evidence
that exists in this repository today. A green `pnpm check:ci` does not close a gate
whose evidence is still manual or unmeasured.

Performance numbers and the machine they were taken on live in
[benchmark-baseline.json](benchmark-baseline.json). Re-measure with `pnpm bench`.
That command fails when the standard 1,000-path fixture is more than 25% slower than
the committed p95. It does not run in pull-request CI.

## Alpha Quality Gate

| Criterion | Status | Evidence |
|---|---|---|
| Document correctness for nested transforms | Met for native projects | Geometry conformance fixtures. SVG symbol/use interchange stays unsupported. |
| Unsaved-work protection and Save / Save As | Met | One Save/Discard/Cancel decision for New, Open, convert replacement, Close, and exit. |
| Malformed input does not replace open work | Met | Adversarial `.savage` and SVG tests, plus the browser-adapter open journeys. |
| Critical tests pass | Met as a failing check | `pnpm check:ci` on pull requests, `main`/`master`, and tagged NSIS. |

## Beta Quality Gate

| Criterion | Status | Evidence |
|---|---|---|
| Recovery, native job bounds, and the security boundary | Met in automated tests, with named manual leftovers | Recovery sequence rules, exclusive convert/export jobs, CSP, and grant checks. Live disk-full and removable media stay manual. |
| Capabilities reduced and CSP enabled | Met in source | Production CSP tests. Packaged WebView2 enforcement of that policy is still a native observation. |
| Core workflow and accessibility checks | Met for the browser adapter | Convert/save/reopen/export, close prompts, keyboard file commands, menu/list/focus/live region, and structural visual contracts. This is not WebView2, Narrator, or pixel evidence. |
| No known critical or high-severity data-loss defects | Open | This repository has withdrawal records, not a defect tracker. A green check is not that review. |
| Recovery verified in a packaged build | Met for the release executable | `scripts/verify-packaged-recovery.ps1` killed `src-tauri/target/release/savage.exe` after a 512 artboard checkpoint. Restart showed the native prompt, Recover opened an unsaved copy, and the killed session's checkpoint was removed. The window capture shows Recovered Untitled. This is not an NSIS install. The known-folder recovery directory has to start empty because the packaged app does not follow an overridden APPDATA. |

## 1.0 Quality Gate

| Criterion | Status | Evidence |
|---|---|---|
| Performance budgets on the standard fixtures | Window target met; frame present time open | `pnpm bench` against [benchmark-baseline.json](benchmark-baseline.json). CPU command time is inside the provisional 60 FPS and 16 ms targets. On 2026-10-06 the release executable on DESKTOP-SCI395N reached Open Image in 1,867 ms on a new WebView2 profile and 312 ms warm p95, under the 2 second target ([window-timing.json](window-timing.json)). That is accessibility-tree time, not WebView2 present time. |
| Visual regression of primary states | Packaged pixels recorded | Eleven stable 1440×900 captures from the release window are in [pixel-baselines/manifest.json](pixel-baselines/manifest.json). Structural DOM and CSS contracts still fail `pnpm check:ci`. Narrator, display scaling, and high contrast stay on the manual native gate. |
| Installer and upgrade smoke | Partial | Tagged NSIS is a failing release check. Guest sign-off covers `v0.1.2` and `v0.1.3` items. On 2026-10-06 `pnpm webview2:missing` refused on DESKTOP-SCI395N: WebView2 154.0.4258.53 is already installed, and Windows 10 Home cannot host Sandbox or Hyper-V ([webview2-missing.json](webview2-missing.json)). The missing-runtime gate stays open. |
| Documentation matches behavior | Met for the recorded manual slice | `USER_MANUAL.md` matches the file commands, inspector tabs, and recovery prompts checked in M6. |
| No unresolved critical or high-severity defects | Open | Same review gap as the beta gate. |
| Medium-severity defects have an explicit disposition | Open | No medium-defect log is kept in this repository. |
| Release notes cover format compatibility and limitations | Met for the current notes | [release-notes-0.1.0.md](release-notes-0.1.0.md) and [m8-compatibility.md](m8-compatibility.md). |

## What `pnpm bench` measures

On the standard 1,000-path document, and recorded alongside the 100-path and
10,000-path documents:

| Step | What is timed |
|---|---|
| Startup | Cold Vitest import of parse, serialize, hit testing, draw, and camera. Packaged window time is [window-timing.json](window-timing.json), not this command. |
| Import | `parseSavageDocument` of the fixture JSON. |
| Render | One editor frame: grid, document, and overlays. |
| Pan/zoom | `setZoomCentered` or `setPan`, then the same frame. |
| Hit testing | Warm `hitTestTopNode` on path centers and on points outside every shape. The 10,000-path file is one probe: matrices are not bulk-cached above 8,192 nodes. |
| Save | `JSON.stringify` plus a temp-file write. |
| Reopen | Read that file and parse it. |
| Export | `documentToSvgString`. |

The canvas context records draw calls and does not present pixels. A p95 under
16.67 ms means the CPU work fits in a 60 FPS budget. It does not prove the
packaged WebView2 frame rate. Native save replacement and PNG export are outside
this command.

Re-record the reference file only on the named machine, with
`BENCH_RECORD=1` set for that run. Other machines can miss the 25% allowance
without a product regression.
