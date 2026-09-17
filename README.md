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
| `pnpm build` | Frontend-only build |
| `pnpm check` | Frontend build/tests plus Rust fmt/tests/Clippy |
| `pnpm audit:frontend` | Audit production JavaScript dependencies |

## Brand assets

Icons/logos live in `icons/` and are copied into `src/assets` + `public/`.
