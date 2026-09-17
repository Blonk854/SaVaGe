# Withdrawal record — vX.Y.Z

Copy this file to `vX.Y.Z.md` when a tagged artifact is halted.

- Version / git tag:
- Artifact SHA-256:
- Halt trigger: confirmed-corruption / missing-recovery / critical-security / failed-install
- Date:
- Named testers notified:

## Preserve

- [ ] User `.savage` files left in place
- [ ] Recovery snapshots left in place
- [ ] Uninstall did **not** use Delete the application data
- [ ] Diagnostics exported only after Help → Export Diagnostics confirmation (or none)

## Withdraw

- [ ] GitHub Release drafted and still a prerelease
- [ ] Git tag, SHA256SUMS.txt, and provenance.json kept
- [ ] `gh release delete` / `git tag -d` not used
- Prior verified installer offered (tag + SHA-256, or **none**):

## Notes
