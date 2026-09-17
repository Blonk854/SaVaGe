# Windows Native Smoke Gate

Record the date, commit, Windows version, WebView2 version, account privilege, and artifact
checksum with each run. Use a copy of every input document.

Artifact: `src-tauri/target/debug/bundle/nsis/SaVaGe_0.1.0_x64-setup.exe`

- [ ] Install as a non-admin user without changing the machine-wide pnpm setup.
- [ ] Launch the installed application and confirm bundled fonts, icons, and Help render.
- [ ] Open a valid `.savage` project through the native dialog.
- [ ] Edit one visible object and save to a new `.savage` destination.
- [ ] Close, reopen the saved project, and verify the edit is present.
- [ ] Cancel Save As and verify no destination or document content changes.
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
- [ ] Uninstall and confirm user project files remain intact.
- [ ] **Help → User Manual (PDF)…** opens the bundled guide; spot-check Save/Save As and the
      shortcut table against the running menus.

Do not mark this gate complete from a Vite browser run. Native dialogs, filesystem IPC,
WebView2, installation, and process-close behavior must be observed in the packaged app.