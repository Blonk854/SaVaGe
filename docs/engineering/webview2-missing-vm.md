# Missing-WebView2 VM runbook

Recorded: 2026-10-06

This is the manual 1.0 check in [m8-install.md](m8-install.md). It runs the unsigned
`v0.1.3` NSIS setup on a Windows 10 virtual machine that does not already have the
Evergreen WebView2 runtime. The script is [scripts/webview2-missing.ps1](../../scripts/webview2-missing.ps1).

The Windows 11 Home host cannot supply this machine. Windows 11 includes the
Evergreen runtime, and Home cannot enable Windows Sandbox or Hyper-V. A refusal
recorded on that host does not close the gate.

## Guest

- Windows 10 x64, a clean install. Windows 11 guests include the runtime.
- A local account that is not an administrator. The setup is `currentUser` and does not elevate.
- Do not install Microsoft Edge, and do not install the WebView2 runtime by hand.
- Take a snapshot before Windows Update. Update can pull the runtime in and make the script refuse.
- VirtualBox on the Windows 11 Home host is enough. Firmware virtualization is already enabled. Leave the Windows hypervisor off.

Copy the SaVaGe tree into the guest. Node, pnpm, and Rust are not required. The script
only needs `scripts/webview2-missing.ps1` and `scripts/window-evidence.ps1` under that tree.

## Installer

Place the tagged setup here, on the guest:

`C:\Users\Public\SaVaGe-0.1.3-internal\SaVaGe_0.1.3_x64-setup.exe`

That is the same staging folder as the `v0.1.3` promotion record. The executable stays
out of git. Confirm the hash before setup:

```powershell
Get-FileHash -Algorithm SHA256 C:\Users\Public\SaVaGe-0.1.3-internal\SaVaGe_0.1.3_x64-setup.exe
```

Expected SHA-256: `b54b1a75d53d8bce8ab01977345bd08c59b188654d72d714335c5b4a62b85726`

Then unblock the unsigned file so SmartScreen does not turn a silent `/S` run into a failed result:

```powershell
Unblock-File C:\Users\Public\SaVaGe-0.1.3-internal\SaVaGe_0.1.3_x64-setup.exe
```

## Preflight

From the SaVaGe tree in the guest:

```powershell
$keys = @(
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
  "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
  "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
)
foreach ($key in $keys) {
  $pv = (Get-ItemProperty -Path $key -Name pv -ErrorAction SilentlyContinue).pv
  Write-Output "$key => $pv"
}
Test-Path "$env:LOCALAPPDATA\SaVaGe"
```

Every `pv` value must be empty. `%LOCALAPPDATA%\SaVaGe` must not exist. If either check
fails, restore the pre-update snapshot. Do not uninstall the runtime on the Windows 11 host and rerun there.

## Offline, then online

Run offline first. The online run installs the runtime, and a later run on that same
guest refuses.

Disconnect the guest network adapter, then:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\webview2-missing.ps1 -Setup C:\Users\Public\SaVaGe-0.1.3-internal\SaVaGe_0.1.3_x64-setup.exe -Network offline -Result C:\Users\Public\SaVaGe-0.1.3-internal\webview2-missing-offline.json
```

A pass exits 0 and writes `result` `offline-aborted`, a non-zero `setupExitCode`, and
`installDirectoryCreated` false. `%LOCALAPPDATA%\SaVaGe\savage.exe` must still be absent.

Reconnect the adapter. Confirm `www.msftconnecttest.com` answers, then:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\webview2-missing.ps1 -Setup C:\Users\Public\SaVaGe-0.1.3-internal\SaVaGe_0.1.3_x64-setup.exe -Network online
```

A pass exits 0 and writes [webview2-missing.json](webview2-missing.json) with `result`
`downloaded-and-installed`, `setupExitCode` 0, and `installDirectoryCreated` true.
`%LOCALAPPDATA%\SaVaGe\savage.exe` exists. The bundled bootstrapper is silent
(`downloadBootstrapper` in `src-tauri/tauri.conf.json`).

`online-failed` and `offline-failed` leave the gate open. Copy both JSON files back to
the host. Replace `docs/engineering/webview2-missing.json` only with the online pass.
Keep the offline file next to the promotion notes. Then check the WebView2 row in
[m8-install.md](m8-install.md).
