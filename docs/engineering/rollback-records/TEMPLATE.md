# Rollback rehearsal — vX.Y.Z → prior

- Current tag / SHA-256:
- Prior verified installer tag / SHA-256:
- Date:
- Account: (non-admin)

## Binary

- [ ] `SaVaGe.exe` was closed
- [ ] Prior NSIS ran without **Delete the application data**
- [ ] Install directory is the prior binary
- [ ] `%APPDATA%\com.savage.svgstudio` recovery still present

## Documents

- [ ] Schema 1 copies opened
- [ ] Schema ≥2 copy rejected; original bytes unchanged
- [ ] Future recovery left in place (not quarantined, not overwritten)
- [ ] No silent coerce to schema 1

Binary downgrade is not document rollback. Compatible export of newer work is
**Save As** schema 1 from the newer writer before this step.
