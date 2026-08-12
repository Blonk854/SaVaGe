# SaVaGe

Desktop image→SVG converter and vector editor (Tauri 2 + React + Rust).

## Prerequisites

- Node.js 22+
- pnpm
- Rust stable (`rustup`)
- Visual Studio 2022 Build Tools (C++ workload) on Windows
- WebView2

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

## Brand assets

Icons/logos live in `icons/` and are copied into `src/assets` + `public/`.
