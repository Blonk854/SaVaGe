# M8.7 Retain Prior Installers

Recorded: 2026-09-17; catalog updated 2026-09-18 (`v0.1.2`, then `v0.1.3`)

Catalog: [verified-installers.json](verified-installers.json). Compatibility notes
stay in-tree with the fixtures. Binaries live on each tagged GitHub Release.
Optional local copies: [artifacts/verified](../../artifacts/verified).

This slice keeps previous verified NSIS setups and their notes available. It does
not add an automatic updater. Install a retained setup by running that tagged
file (manual reinstall).

## What is retained

| Item | Where | Catalog |
|---|---|---|
| NSIS + SHA-256 + provenance | GitHub Release for that git tag; optional local `artifacts/verified/` | `v0.1.2` `660206b7…4575`; `v0.1.3` `b54b1a75…5726`. `.exe` is not in git. |
| Compatibility matrix | [m8-compatibility.md](m8-compatibility.md), [release-notes-0.1.0.md](release-notes-0.1.0.md), `fixtures/compatibility/` | Present now |
| Catalog rows | `verified-installers.json` `installers` | `v0.1.2`, `v0.1.3`. Do not replace those SHAs. |

`retainPrevious: true`. Adding a later tag **appends**. The same tag with
different bytes is refused. `v0.1.0` and `v0.1.1` are not catalogued: Guest
found close did not quit.

## Record after a real tagged package

```powershell
npx --yes pnpm@10.17.1 exec node scripts/retain-installer.mjs list
npx --yes pnpm@10.17.1 exec node scripts/retain-installer.mjs record --installer src-tauri\target\release\bundle\nsis\SaVaGe_0.1.3_x64-setup.exe
```

`record` checks `provenance.json` and `SHA256SUMS.txt` beside the setup. It does
not delete earlier catalog rows and does not commit the `.exe`.

The tag workflow creates the current GitHub Release only. It must not delete
older tags’ releases. Withdrawn releases stay as drafts (M8.5) with sidecars
intact.

## Revert

Do not add `tauri-plugin-updater` to “keep old builds available.” Do not git-add
NSIS executables. Do not rewrite catalog history to hide a withdrawn SHA.
