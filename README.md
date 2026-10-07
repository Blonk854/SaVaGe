# SaVaGe

Desktop image→SVG converter and vector editor (Tauri 2 + React + Rust).

## Prerequisites

- Node.js 24.18.0 (see `.node-version`)
- pnpm 10.17.1 (pinned in `package.json`)
- Rust 1.96.0 (`rustup` reads `rust-toolchain.toml`)
- Visual Studio 2022 Build Tools (C++ workload) on Windows
- WebView2

No administrator-installed pnpm is required. On a clean Windows account, use the pinned
runner from npm's user cache:

```powershell
npx --yes pnpm@10.17.1 install --frozen-lockfile
npx --yes pnpm@10.17.1 check
```

## Develop

```powershell
pnpm install
pnpm tauri:dev
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm tauri:dev` | Run desktop app |
| `pnpm tauri:build` | Production installer |
| `pnpm test` | Vitest unit tests |
| `pnpm bench` | Run `src/shared/bench/startup.bench.ts`, then `src/shared/bench/measure.bench.ts` (`runBenchmark` in `src/shared/bench/run.ts`) on the 100 / 1,000 / 10,000 path fixtures from `src/shared/bench/corpus.ts`, and compare p95 with the reference baseline through `src/shared/bench/compare.ts` |
| `pnpm test:coverage` | Vitest plus a V8 coverage report (no percentage gate) |
| `pnpm build` | Frontend-only build |
| `pnpm check` | Frontend build/tests plus Rust fmt/tests/Clippy |
| `pnpm check:ci` | Coverage, frontend build, and Rust fmt/tests/Clippy (pull requests, `main`/`master`, and tagged NSIS) |
| `pnpm audit:frontend` | Audit production JavaScript dependencies (CI on PRs, `main`/`master`, weekly, and tagged NSIS) |
| `pnpm audit:rust` | Audit Rust crates (`cargo audit`; install the crate first) |
| `pnpm release:check` | Confirm package, Cargo, Tauri, and manual versions match |
| `pnpm release:package` | Production NSIS installer plus SHA-256 and provenance sidecars |
| `pnpm release:withdraw` | Plan or apply halt/withdraw of a tagged GitHub Release (no tag delete) |
| `pnpm release:rollback` | Copy compatibility fixtures and print a rollback rehearsal plan |
| `pnpm release:retain` | List or append-only-record a tagged NSIS in the verified installer catalog |
| `pnpm install:inspect` | Record a current-user NSIS install (WebView2, Help, no file association) |
| `pnpm window:measure` | Run `scripts/measure-window.ps1` and record accessibility-tree time until the converter is usable, into `docs/engineering/window-timing.json` |
| `pnpm present:measure` | Run `scripts/measure-present.ps1` and record WebView2 first-frame present time, into `docs/engineering/present-timing.json` |
| `pnpm pixels:capture` | Run `scripts/capture-pixels.ps1` and write packaged WebView2 pixels of the primary states to `docs/engineering/pixel-baselines/manifest.json` |
| `pnpm recovery:packaged` | Kill a release build after a checkpoint and record the recovery prompt |
| `pnpm recovery:source` | Confirm Open Original and Discard leave a `.savage` unchanged |
| `pnpm webview2:missing` | Deferred optional check: exercise the installer only when the WebView2 runtime is absent |

Tagged installers are unsigned until an Authenticode certificate is provisioned. Verify
`SHA256SUMS.txt` before running `SaVaGe_<version>_x64-setup.exe`. GitHub Releases are
prereleases; there is no automatic updater. See
[docs/engineering/m8-release.md](docs/engineering/m8-release.md),
[docs/engineering/m8-install.md](docs/engineering/m8-install.md),
[docs/engineering/m8-rollout.md](docs/engineering/m8-rollout.md),
[docs/engineering/m8-withdraw.md](docs/engineering/m8-withdraw.md),
[docs/engineering/m8-rollback.md](docs/engineering/m8-rollback.md), and
[docs/engineering/m8-retain.md](docs/engineering/m8-retain.md).

## Brand assets

Icons/logos live in `icons/` and are copied into `src/assets` + `public/`.
