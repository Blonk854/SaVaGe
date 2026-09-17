# M8.6 Rollback Rehearsal

Recorded: 2026-09-17

Policy: [rollback-policy.json](rollback-policy.json). Planner:
`pnpm release:rollback`. Halt/withdraw of a bad tag remains
[M8.5](m8-withdraw.md).

A binary downgrade is **not** document rollback. Installing an older NSIS must
keep app data and must not rewrite or delete newer-format `.savage` files or
recovery snapshots.

## What this slice proves

| Step | Evidence now | Live NSIS |
|---|---|---|
| Reinstall a previous binary while retaining app data | Same `identifier`, `allowDowngrades: true`, uninstall default keeps `%APPDATA%\com.savage.svgstudio` | Blocked for 0.1.0 — [verified-installers.json](verified-installers.json) is empty |
| Open preserved compatible originals | Copies of `legacy-v1.savage` and `skew-nested.savage` parse as schema 1 without write-back | Same copies after a real prior-NSIS install |
| Recover newer work | This reader cannot open schema ≥2. Message tells the user to use a newer SaVaGe or **Save As** a version-1 copy from that version. Future recovery envelopes are left in place | Do not delete those files after downgrade |

Do not mark the live column from Vite or `tauri:dev`.

## Procedure (when a prior verified installer exists)

1. Copy user documents and the compatibility fixtures. Work only on copies.
2. Close `SaVaGe.exe`.
3. Run the prior tagged NSIS (`allowDowngrades`). Do **not** check **Delete the application data**.
4. Confirm `%LOCALAPPDATA%\SaVaGe` is the older binary and `%APPDATA%\com.savage.svgstudio` still has recovery.
5. Open the schema 1 copies. They must load.
6. Open (or attempt to open) the schema ≥2 copy and a future recovery file. They must fail in memory and keep their original bytes.
7. Newer work that must be edited in the older app was **Save As** schema 1 from the newer writer **before** this downgrade. This 0.1.0 binary cannot produce that copy from a file it cannot read.

## 0.1.0

There is no previous tagged installer. Live prior-NSIS rehearsal is recorded as
blocked in [rollback-records/v0.1.0.md](rollback-records/v0.1.0.md). Automated
leave-in-place tests still run.

## Revert

Do not add an updater to “roll back.” Do not coerce schema 2 to 1 on Open to
make a downgrade look successful. Keep prior installers per [M8.7](m8-retain.md).
