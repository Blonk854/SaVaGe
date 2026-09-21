# M8.1 Release Artifact

Recorded: 2026-09-17

This slice produces a version-consistent Windows NSIS installer from a tagged commit
with locked dependencies, SHA-256 checksums, and build/test provenance. Install,
update, and uninstall qualification is [M8.2](m8-install.md). The reader/writer
matrix and unsupported SVG notes are [M8.3](m8-compatibility.md). Staged rollout
(internal → opt-in beta → stable) is [M8.4](m8-rollout.md). Halt and withdraw of a
bad artifact is [M8.5](m8-withdraw.md). Rollback rehearsal (prior binary, compatible
originals, leave newer files in place) is [M8.6](m8-rollback.md). Retaining prior
installers and compatibility notes is [M8.7](m8-retain.md).

## Signing decision

Current NSIS artifacts are **unsigned internal builds**. Authenticode signing is
required before a broad stable distribution. Until a certificate is provisioned:

- Windows SmartScreen/UAC may warn that the publisher is unknown.
- Those warnings are not a vendor signature. Verify the installer SHA-256 against
  `SHA256SUMS.txt` and `provenance.json` from the same git tag.
- **Help → About SaVaGe** states the same unsigned-build limitation.
- Signing credentials must live only in the GitHub `release` environment. They are
  not present now, and they must never be available to `pull_request` jobs.

Do not add `bundle.windows.certificateThumbprint` or `TAURI_SIGNING_*` secrets until
the certificate owner, expiry, timestamp server, and protected environment reviewers
are recorded here.

## Version identity

These fields must be identical:

- `package.json` `version`
- `src-tauri/Cargo.toml` `[package].version`
- `src-tauri/tauri.conf.json` `version`
- `USER_MANUAL.md` “matches application vX.Y.Z”

The git tag must be `v` plus that version (`v0.1.0`). `pnpm release:check` and the
Vitest release tests enforce the manifests. The release workflow refuses a tag that
does not match.

## Local unsigned package

From a clean tagged commit on a Windows account that already has the M0 toolchain:

```powershell
npx --yes pnpm@10.17.1 install --frozen-lockfile
npx --yes pnpm@10.17.1 release:check
npx --yes pnpm@10.17.1 release:package
```

`scripts/release-package.ps1` runs frozen install, `pnpm audit:frontend`, `pnpm check`, `cargo fetch --locked`,
`pnpm tauri:build -- --ci --bundles nsis`, then writes checksums next to
`src-tauri/target/release/bundle/nsis/SaVaGe_<version>_x64-setup.exe`.

`-AllowUntagged` is only for a local dry run. It still records `signed: false` and
must not be used for a distributed artifact.

## GitHub Actions

| Workflow | Trigger | Secrets | Output |
|---|---|---|---|
| `.github/workflows/check.yml` | pull requests, `main`/`master`, Monday 08:17 UTC | default `GITHUB_TOKEN` for cargo-audit | version check + `pnpm audit:frontend` + `pnpm check` + Rust advisory audit |
| `.github/workflows/release.yml` | tags `v*.*.*` | GitHub `GITHUB_TOKEN` only | JS audit + checks + NSIS + checksums + provenance |

Actions are pinned by commit SHA. Third-party actions used here:

| Action | Pin | Need | Alternative considered |
|---|---|---|---|
| `actions/checkout` | `11d5960a326750d5838078e36cf38b85af677262` (v4.4.0) | clone the tagged commit | runner `git` clone scripts |
| `actions/setup-node` | `820762786026740c76f36085b0efc47a31fe5020` (v7.0.0) | Node from `.node-version` | preinstalled Node, unpinned |
| `dtolnay/rust-toolchain` | `6c977a6ca4077a0ceb28ffbe03f59d46e9ac8772` (v1) | Rust 1.96.0 plus clippy/rustfmt | downloading `rustup-init` unpinned |
| `rustsec/audit-check` | `69366f33c96575abad1ee0dba8212993eecbe998` (v2.0.0) | `cargo audit` against `src-tauri/Cargo.lock` | installing `cargo-audit` unpinned on the runner |
| `actions/upload-artifact` | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` (v7.0.1) | retain the installer if release attach fails | `gh` only |

pnpm comes from Corepack using `package.json` `packageManager`. Cargo and pnpm installs
are locked. Create a GitHub Environment named `release` and restrict who can approve
it before the first tag. Required status checks are a repository-settings step, not
part of this YAML.

## Provenance sidecar

Each tagged installer is published with:

- `SHA256SUMS.txt` — SHA-256 of the NSIS setup executable
- `provenance.json` — product version, git commit/tag, toolchain versions, lockfile
  hashes, check results, artifact hash, and `signed: false`

Keep previous verified installers and their sidecars. A later binary downgrade is not
document rollback. See [m8-retain.md](m8-retain.md).

## Revert

Delete `.github/workflows/release.yml` and stop tagging if a workflow is untrusted.
Unsigned installers already in circulation remain unsigned; do not delete user
project files or recovery snapshots to “roll back” a package.
