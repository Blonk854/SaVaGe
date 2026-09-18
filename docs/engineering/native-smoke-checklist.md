# Windows Native Smoke Gate

Record the date, commit, Windows version, WebView2 version, account privilege, and artifact
checksum with each run. Use a copy of every input document.

Release artifact: `src-tauri/target/release/bundle/nsis/SaVaGe_0.1.2_x64-setup.exe`
with `SHA256SUMS.txt` and `provenance.json` from the same tagged commit. Debug NSIS
packages are not release evidence. Current installers are unsigned; confirm the SHA-256 before installing.
Install/update/uninstall evidence is recorded in
[m8-install.md](m8-install.md), not from a Vite run.

- [ ] Install as a non-admin user without changing the machine-wide pnpm setup.
- [ ] Launch the installed application and confirm bundled fonts, icons, and Help render.
- [ ] Open a valid `.savage` project through the native dialog.
- [ ] Edit one visible object and save to a new `.savage` destination.
- [ ] Close, reopen the saved project, and verify the edit is present.
- [ ] Cancel Save As and verify no destination or document content changes.
- [ ] Two-instance Save: save in a second window, then Save in the first. Confirm Reload / Save As /
      Overwrite / Cancel. Cancel leaves the on-disk file as the second window wrote it.
- [ ] Attempt to open malformed and over-limit input; verify the active document is unchanged.
- [ ] Convert a raster with Cancel during tracing; confirm the UI stays busy until the job exits and retry still works.
- [ ] Exercise Undo/Redo, keyboard menu dismissal, and window close behavior.
- [ ] Resize to the minimum (about 960×600) and confirm Convert stacks, Edit chrome wraps, and
      no required control is clipped or overlapping.
- [ ] At 150% and 200% display scaling (and Windows text size 200% if available), confirm menus,
      Convert, Layers, and Properties remain reachable. Maximize on 1080p @ 200% if needed.
- [ ] High Contrast: focus rings, selected tabs, and disabled buttons remain distinguishable.
- [ ] Narrator: F10 File menu, Tab to a layer row, canvas named Artboard, selection count announced.
- [ ] Reopen after a process kill and confirm the recovery prompt. Recover opens Unsaved work;
      Discard or Open Original does not overwrite the source `.savage`.
- [ ] Uninstall **without** deleting application data and confirm user project files remain intact.
- [ ] Reinstall and confirm leftover recovery can still be offered.
- [ ] If a prior verified NSIS exists: install it without deleting app data, open schema 1
      copies, and confirm schema ≥2 files and future recovery are left unchanged. Skip and
      record “no prior installer” for 0.1.0 ([m8-rollback.md](m8-rollback.md)).
- [ ] **Help → About SaVaGe** shows this version and the unsigned-installer notice.
- [ ] **Help → User Manual (PDF)…** opens the bundled guide; spot-check Save/Save As and the
      shortcut table against the running menus.

Do not mark this gate complete from a Vite browser run. Native dialogs, filesystem IPC,
WebView2, installation, and process-close behavior must be observed in the packaged app.