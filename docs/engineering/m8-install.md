# M8.2 Install Qualification

Recorded: 2026-09-17

This slice qualifies the unsigned NSIS installer from [M8.1](m8-release.md) on a
non-admin Windows account. It does not add file associations, an automatic updater,
or a WebView2 embed. Format-compatibility corpus tests remain M8.3. Staged rollout
is [M8.4](m8-rollout.md). Halt and withdraw is [M8.5](m8-withdraw.md). Rollback
rehearsal is [M8.6](m8-rollback.md). Retaining prior installers is
[M8.7](m8-retain.md).

## Installer contract

- NSIS only, `installMode: currentUser`. Default destination is
  `%LOCALAPPDATA%\SaVaGe`. No elevation.
- Missing WebView2: the installer downloads the Evergreen bootstrapper
  (`downloadBootstrapper`, silent). That needs internet. Offline + missing runtime
  aborts install. Outdated runtimes that still launch are accepted; no
  `minimumWebview2Version` is set yet.
- Update/reinstall: running the same or older tagged setup over an existing install
  is allowed (`allowDowngrades: true`). The NSIS `/UPDATE` path keeps app data.
- Uninstall removes the install directory, Start Menu shortcut, and HKCU uninstall
  key. Recovery and diagnostics live under `%APPDATA%\com.savage.svgstudio\` and are
  deleted **only** if the user checks **Delete the application data**. Leave that
  box unchecked to retain recovery. User `.savage` files are never in the install
  directory.
- File associations are not shipped. `.savage` does not register under
  `HKCU\Software\Classes`.
- Installing or uninstalling while `SaVaGe.exe` is running hits NSIS
  `CheckIfAppIsRunning`. Close the app first. A locked project file must fail the
  save without deleting the original (native lock test).
- High DPI: native minimum 960×600 so a 1080p display at 200% scaling can host the
  window. Canvas backing store follows `devicePixelRatio`.

## App-data map

| Location | Contents | Uninstall (checkbox off) |
|---|---|---|
| `%LOCALAPPDATA%\SaVaGe` | `SaVaGe.exe`, bundled `USER_MANUAL.pdf` | Removed |
| `%APPDATA%\com.savage.svgstudio\recovery` | Crash checkpoints | Kept |
| `%APPDATA%\com.savage.svgstudio\diagnostics.json` | Redacted log ring | Kept |
| User-chosen folders | `.savage` / SVG / PNG | Kept |

## Recorded run

```
Date: 2026-09-18
Windows: 10 Home 10.0.19045
Account: Guest (non-admin)
WebView2: 153.0.4234.32 (machine)
Display scaling: 150% and 200% (Guest sign-off)
Artifact / SHA-256: 660206b722e3f284ea447758fc3434af74744c6a2fbb31ff1e203e6a8c5d4575
Commit / tag: 918834b25e3372821aa296491ca71695ea24be91 / v0.1.2
```

Guest signed off this non-admin install on 2026-09-18. Earlier 0.1.0 / 0.1.1 notes stay under the workflow bullets.

Guest `v0.1.3` (`b54b1a75…5726`, commit `665851be19cec99e29b4c645cbb886d587ec2947`) signed off 2026-09-18: two-instance Save presents Reload / Save As / Overwrite / Cancel, then live prior-NSIS rollback to `v0.1.2` without deleting app data. Install/uninstall/scaling evidence remains on `v0.1.2`. WebView2-missing is still open.

- [x] SHA-256 matches `SHA256SUMS.txt`. SmartScreen warning is expected for unsigned builds.
- [x] Install as the current user with no UAC elevation. Start Menu **SaVaGe** launches.
- [x] `scripts/inspect-install.ps1` reports per-user install, bundled Help present, no `.savage` association.
- [x] **Help → About SaVaGe** shows this version and the unsigned notice.
- [x] **Help → User Manual (PDF)…** opens the bundled guide.
- [x] Save a `.savage` outside the install directory. Convert, edit, undo, and window close still work.
      Guest 0.1.0: Open/Save As/reopen, Save As cancel, future-v2 reject, and Convert cancel+retry passed; **Discard on close did not quit**.
      Guest 0.1.2 (`660206b7…4575`): Discard on close quits, Cancel leaves the app open, Open in Editor Discard starts unsaved, Ctrl+Z works off the canvas.
- [x] At 150% and 200% scaling, Convert/Edit required controls remain reachable (maximize on 1080p @ 200% if needed).
      Guest 0.1.2 sign-off 2026-09-18, including High Contrast and Narrator.
- [x] While SaVaGe is open, running setup or uninstall asks to close the app; the install directory is not deleted out from under the running process.
- [x] Close the app. Run the same tagged setup again (update/reinstall). App data recovery files remain. The project file still opens.
      Guest 0.1.2 sign-off 2026-09-18.
- [x] Uninstall **without** checking Delete application data. `%LOCALAPPDATA%\SaVaGe` is gone; `%APPDATA%\com.savage.svgstudio` and the user `.savage` remain. Guest 2026-09-18: app data remained.
- [x] Reinstall. Recovery prompt still appears for leftover checkpoints.
      Guest 2026-09-18: `%APPDATA%\com.savage.svgstudio\recovery` remained after uninstall without deleting app data. Kill-process relaunch already showed the recovery prompt.
- [ ] WebView2 missing: on a machine/VM without the runtime, setup downloads it when online, or aborts with a WebView2 error when offline. Do not mark this item from a machine that already has WebView2.
      Guest sign-off does not cover this: this PC already has WebView2 153.

Do not mark this gate from `pnpm tauri:dev` or a Vite browser tab.

## Local inspect

After a current-user install:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/inspect-install.ps1
```

## Revert

Unset `webviewInstallMode` / `allowDowngrades` only together with this document.
Do not add file associations to close a checklist item. Changing `identifier`
moves app data and is a compatibility break.
