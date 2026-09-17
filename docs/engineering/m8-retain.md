# M8.7 Retain Prior Installers

Recorded: 2026-09-17

Catalog: [verified-installers.json](verified-installers.json). Compatibility notes
stay in-tree with the fixtures. Binaries live on each tagged GitHub Release.
Optional local copies: [artifacts/verified](../../artifacts/verified).

This slice keeps previous verified NSIS setups and their notes available. It does
not add an automatic updater. Install a retained setup by running that tagged
file (manual reinstall).

## What is retained

| Item | Where | 0.1.0 |
|---|---|---|
| NSIS + SHA-256 + provenance | GitHub Release for that git tag; optional local `artifacts/verified/` | Not recorded until a tagged artifact exists and is listed |
| Compatibility matrix | [m8-compatibility.md](m8-compatibility.md), [release-notes-0.1.0.md](release-notes-0.1.0.md), `fixtures/compatibility/` | Present now |
| Catalog rows | `verified-installers.json` `installers` | Empty — do not invent a SHA |

`retainPrevious: true`. Adding a later tag **appends**. The same tag with
different bytes is refused.

## Record after a real tagged package

```powershell
npx --yes pnpm@10.17.1 release:retain -- list
npx --yes pnpm@10.17.1 release:retain -- record --installer src-tauri\target\release\bundle\nsis\SaVaGe_0.1.0_x64-setup.exe
```

`record` checks `provenance.json` and `SHA256SUMS.txt` beside the setup. It does
not delete earlier catalog rows and does not commit the `.exe`.

The tag workflow creates the current GitHub Release only. It must not delete
older tags’ releases. Withdrawn releases stay as drafts (M8.5) with sidecars
intact.

## Revert

Do not add `tauri-plugin-updater` to “keep old builds available.” Do not git-add
NSIS executables. Do not rewrite catalog history to hide a withdrawn SHA.
