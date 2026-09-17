# Promotion record — vX.Y.Z

Copy this file to `vX.Y.Z.md`. Fill it before changing channel.

- Version / git tag:
- Artifact SHA-256:
- Commit:
- Unsigned: yes / no
- Proposed channel: internal / beta / stable
- Date:

## Internal corpus

- [ ] `pnpm test` passed
- [ ] Rust tests passed (`cargo test --manifest-path src-tauri/Cargo.toml --locked`)
- [ ] Compatibility fixtures recorded (copies, not originals)
- [ ] Native smoke / M8.2 install notes attached or waived with reason
- Operators (names):

## Beta

- Invite list (named, opt-in):
- Feedback interval start / end (7 days):
- Reports received (2 minimum):
- [ ] No confirmed corruption
- [ ] No missing recovery on accepted crash/restart fixtures
- [ ] No critical/high security defect
- [ ] Non-admin install/update of this artifact succeeded

## Gate review

- Reviewer names:
- Decision: stay internal / enter beta / remain beta / promote stable / halt
- Notes:

## Halt / withdraw

- Halt trigger (if any): none / confirmed-corruption / missing-recovery / critical-security / failed-install
- [ ] Promotion stopped
- Prior verified installer offered (or **none**):
- [ ] User files and recovery left in place
- [ ] Diagnostics collected only with consent

Stable requires Authenticode. Do not mark the GitHub Release as latest stable if
Unsigned is yes.
