# M8.5 Halt and Withdraw

Recorded: 2026-09-17

Policy: [rollout-policy.json](rollout-policy.json) `halt`. Prior installers:
[verified-installers.json](verified-installers.json). Planner:
`pnpm release:withdraw -- plan --tag vX.Y.Z --reason <trigger>`.

This slice stops promotion of a bad tagged NSIS artifact. It does not add an
automatic updater, delete user files, or rehearse a binary downgrade (M8.6).

## Halt triggers

Stop further promotion (no extra testers, no channel raise, no unchecking GitHub
Pre-release) when any of these is confirmed:

| Trigger | Meaning |
|---|---|
| `confirmed-corruption` | A `.savage` document or accepted corpus file was damaged by this build |
| `missing-recovery` | Crash/restart of an accepted fixture did not keep a usable checkpoint |
| `critical-security` | Critical or high security defect in this artifact |
| `failed-install` | Tagged NSIS install or upgrade failed on a non-admin account |

Record the trigger on the promotion record the same day. Do not wait for the beta
interval to expire.

## Preserve

Leave in place:

- User `.savage` files wherever they were saved
- Recovery under `%APPDATA%\com.savage.svgstudio\recovery`
- The local diagnostic ring until the user exports it or uninstalls with
  **Delete the application data**

Do not migrate, overwrite, or “fix” unknown format versions as part of withdraw.
Do not uninstall with **Delete the application data**.

Diagnostics are optional and consent-based: **Help → Export Diagnostics…**, then
the user reviews the JSON. There is no automatic upload.

## Withdraw the artifact

1. Run `pnpm release:withdraw -- plan --tag vX.Y.Z --reason <trigger>` and keep
   the JSON with the promotion record.
2. Tell every named tester on that record to stop using the setup.
3. `pnpm release:withdraw -- apply --tag vX.Y.Z --reason <trigger>` drafts the
   GitHub Release (`gh release edit --draft --prerelease`). Notes are passed to
   `gh` from a temp file, not written into the repo.
4. Copy [withdrawals/TEMPLATE.md](withdrawals/TEMPLATE.md) to
   `withdrawals/vX.Y.Z.md`.

Do **not** `gh release delete`, `git tag -d`, or delete `SHA256SUMS.txt` /
`provenance.json`. Those sidecars identify the withdrawn bytes.

## Offer the prior verified installer

Offer the last entry in `verified-installers.json` that is not the withdrawn
version, with its SHA-256. The registry is empty until a build completes the
M8.4 gate, so **0.1.0 has no prior installer to offer**. Do not invent one.

Users who already installed the withdrawn build keep their documents. If a prior
setup exists, they close SaVaGe and run that NSIS file (allowDowngrades is on).
That is a binary change only. Opening newer-format files after a downgrade is
[M8.6](m8-rollback.md).

## Revert

Do not add `tauri-plugin-updater` to “pull back” a bad build. Do not delete
recovery or project files to hide a halt.
