# M8.4 Staged Rollout

Recorded: 2026-09-17

Machine-checked policy: [rollout-policy.json](rollout-policy.json). Promotion is a
human gate, not a percentage of clients. There is no automatic updater.

## Channels

| Channel | Who | How they get the build | Unsigned allowed |
|---|---|---|---|
| **internal** | Named operators | Tagged NSIS + SHA-256, handed over | Yes |
| **beta** | Named opt-in testers | Same, plus a written invite list | Yes (max for unsigned) |
| **stable** | Broad users | Same manual reinstall after gate review | **No** — Authenticode required |

GitHub Releases created by `.github/workflows/release.yml` are **prereleases**.
Marking a release as the latest stable is a separate, recorded decision.

## Internal corpus and fault tests

Before inviting beta testers, run and record:

1. `pnpm test` and `cargo test --manifest-path src-tauri/Cargo.toml --locked`
2. Copies of [fixtures/compatibility](../../fixtures/compatibility) (legacy v1, skew, future version, hostile SVG)
3. Native smoke + [M8.2 install checklist](m8-install.md) on a non-admin account when an NSIS artifact exists
4. Fault tests already in-tree: save/open races, locked writes, recovery leave-unchanged, future `.savage` reject

Do not treat a Vite browser run as corpus evidence.

## Opt-in beta (criteria set before beta starts)

- **Population:** named people, recorded in the promotion record. Not “X% of users.”
- **Minimum testers:** 2
- **Feedback interval:** 7 days of real use, then a written report each
- **Feedback channel:** notes, plus optional user-reviewed diagnostic export. No telemetry.

### Beta exit criteria

All of the following, recorded before promotion toward stable:

- Interval elapsed with reports from the minimum testers
- No confirmed document corruption
- No missing recovery on crash/restart of accepted fixtures
- No critical or high security defect
- Tagged NSIS install/update works for a non-admin account
- Compatibility fixtures still pass on that commit
- Explicit gate review (names, date, artifact SHA-256)

Halt further promotion on corruption, missing recovery, critical security, or failed
install/upgrade. Withdraw procedure: [m8-withdraw.md](m8-withdraw.md).

## Stable

Stable also requires an Authenticode-signed installer. Unsigned 0.1.0 cannot be
stable. Do not uncheck GitHub **Pre-release** until the promotion record says so.

## Promotion record

Copy [promotion-records/TEMPLATE.md](promotion-records/TEMPLATE.md) to
`promotion-records/vX.Y.Z.md` and fill it before moving a tag off internal.

## Revert

Do not add `tauri-plugin-updater` or a percentage rollout to “speed up” this slice.
Keep `--prerelease` on the tag workflow until a signed stable gate exists.
