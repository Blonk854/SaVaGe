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
Display scaling: (not recorded)
Artifact / SHA-256: 2b1dc92a9f28a2e0dba78602a92ad49c7d48ed0f54189c0fa8ee2ea9a236b6fb
Commit / tag: fd54d8fb59a24052bd39784cdfca720247500d84 / v0.1.0
```

- [x] SHA-256 matches `SHA256SUMS.txt`. SmartScreen warning is expected for unsigned builds.
- [x] Install as the current user with no UAC elevation. Start Menu **SaVaGe** launches.
- [x] `scripts/inspect-install.ps1` reports per-user install, bundled Help present, no `.savage` association.
- [x] **Help → About SaVaGe** shows this version and the unsigned notice.
- [x] **Help → User Manual (PDF)…** opens the bundled guide.
- [ ] Save a `.savage` outside the install directory. Convert, edit, undo, and window close still work.
      Guest: Open/Save As/reopen, Save As cancel, future-v2 reject, and Convert cancel+retry passed. **Window close Discard did not close** (see promotion record). Undo/Redo/F10 not recorded.
- [ ] At 150% and 200% scaling, Convert/Edit required controls remain reachable (maximize on 1080p @ 200% if needed).
- [x] While SaVaGe is open, running setup or uninstall asks to close the app; the install directory is not deleted out from under the running process.
- [ ] Close the app. Run the same tagged setup again (update/reinstall). App data recovery files remain. The project file still opens.
- [x] Uninstall **without** checking Delete application data. `%LOCALAPPDATA%\SaVaGe` is gone; `%APPDATA%\com.savage.svgstudio` and the user `.savage` remain. Guest 2026-09-18: app data remained.
- [x] Reinstall. Recovery prompt still appears for leftover checkpoints.
      Guest 2026-09-18: `%APPDATA%\com.savage.svgstudio\recovery` remained after uninstall without deleting app data. Kill-process relaunch already showed the recovery prompt.
- [ ] WebView2 missing: on a machine/VM without the runtime, setup downloads it when online, or aborts with a WebView2 error when offline. Do not mark this item from a machine that already has WebView2.

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
