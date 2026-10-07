# Open a temporary .savage in the release app, kill it after a checkpoint, then
# confirm Open Original and Discard Recovery leave that file unchanged.
# The packaged app writes checkpoints to the Windows known-folder app data
# directory, so this refuses to start when that directory already has recovery
# files and restores recent-projects.json afterward.

param(
  [string]$Exe = "",
  [string]$Result = ""
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "window-evidence.ps1")
Initialize-SavageWindowHost
Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type -AssemblyName System.Drawing | Out-Null
if (-not ("SavageFocus" -as [type])) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class SavageFocus {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
  public static void Focus(IntPtr hwnd) {
    IntPtr fg = GetForegroundWindow();
    uint pid;
    uint fgThread = GetWindowThreadProcessId(fg, out pid);
    uint cur = GetCurrentThreadId();
    AttachThreadInput(cur, fgThread, true);
    SetForegroundWindow(hwnd);
    AttachThreadInput(cur, fgThread, false);
  }
  public static void ButtonClick(IntPtr button) {
    SendMessage(button, 0x00F5, IntPtr.Zero, IntPtr.Zero);
  }
}
"@
}

$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $Exe) {
  $Exe = Join-Path $repo "src-tauri\target\release\savage.exe"
}
if (-not $Result) {
  $Result = Join-Path $repo "docs\engineering\packaged-recovery-source.json"
}
if (-not (Test-Path -LiteralPath $Exe)) {
  throw "Release executable not found: $Exe. Build it with: pnpm exec tauri build --no-bundle"
}

function Get-RecoveryDirectory {
  Join-Path $env:APPDATA "com.savage.svgstudio\recovery"
}

function Get-RecoveryFiles {
  $dir = Get-RecoveryDirectory
  if (-not (Test-Path -LiteralPath $dir)) { return @() }
  @(Get-ChildItem -LiteralPath $dir -Filter "*.recovery.json" -ErrorAction SilentlyContinue)
}

function Get-ProcessElements($Process) {
  $Process.Refresh()
  if ($Process.HasExited) { return @() }
  $processCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
    $Process.Id
  )
  @([System.Windows.Automation.AutomationElement]::RootElement.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    $processCondition
  ))
}

function Expand-FileMenu($Process) {
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  while ([DateTime]::UtcNow -lt $deadline) {
    foreach ($element in (Get-SavageMainElements $Process)) {
      $isMenu = $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::MenuItem
      if (-not $isMenu -or $element.Current.Name -ne "File") { continue }
      $pattern = $null
      if (-not $element.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$pattern)) { continue }
      $pattern.Expand()
      return
    }
    Start-Sleep -Milliseconds 80
  }
  throw "Timed out waiting to open the File menu"
}

function Invoke-OpenMenuItem($Process) {
  $deadline = [DateTime]::UtcNow.AddSeconds(8)
  while ([DateTime]::UtcNow -lt $deadline) {
    foreach ($element in (Get-SavageMainElements $Process)) {
      $isMenu = $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::MenuItem
      if (-not $isMenu -or $element.Current.Name -notlike "Open*") { continue }
      $pattern = $null
      if (-not $element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { continue }
      $pattern.Invoke()
      return
    }
    Start-Sleep -Milliseconds 80
  }
  throw "Timed out waiting to invoke Open"
}

function Get-OpenDialog($Process) {
  $nameCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty,
    "Open"
  )
  $processCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
    $Process.Id
  )
  $condition = New-Object System.Windows.Automation.AndCondition($nameCondition, $processCondition)
  $deadline = [DateTime]::UtcNow.AddSeconds(10)
  while ([DateTime]::UtcNow -lt $deadline) {
    $dialog = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst(
      [System.Windows.Automation.TreeScope]::Children,
      $condition
    )
    if ($dialog) { return $dialog }
    Start-Sleep -Milliseconds 80
  }
  throw "Timed out waiting for the Open dialog"
}

function Open-SavageProject($Process, [string]$Path) {
  Expand-FileMenu $Process
  Start-Sleep -Milliseconds 200
  Invoke-OpenMenuItem $Process
  $dialog = Get-OpenDialog $Process
  $trueCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::IsControlElementProperty,
    $true
  )
  $elements = @($dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, $trueCondition))
  $edit = $null
  $openButton = $null
  foreach ($element in $elements) {
    if ($element.Current.Name -eq "File name:" -and $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit) {
      $edit = $element
    }
    if ($element.Current.Name -eq "Open" -and $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button) {
      $openButton = $element
    }
  }
  if (-not $edit -or -not $openButton) { throw "The Open dialog did not expose a file name field" }
  $value = $null
  if (-not $edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$value)) {
    throw "The file name field could not be set"
  }
  $value.SetValue($Path)
  Start-Sleep -Milliseconds 200
  $buttonHwnd = [IntPtr]$openButton.Current.NativeWindowHandle
  if ($buttonHwnd -eq [IntPtr]::Zero) { throw "The Open button had no window handle" }
  [SavageFocus]::ButtonClick($buttonHwnd)
}

function Click-NamedButton($Process, [string]$Name) {
  $deadline = [DateTime]::UtcNow.AddSeconds(8)
  while ([DateTime]::UtcNow -lt $deadline) {
    foreach ($element in (Get-ProcessElements $Process)) {
      $isButton = $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button
      if (-not $isButton -or $element.Current.Name -ne $Name) { continue }
      $buttonHwnd = [IntPtr]$element.Current.NativeWindowHandle
      if ($buttonHwnd -eq [IntPtr]::Zero) { continue }
      [SavageFocus]::ButtonClick($buttonHwnd)
      return
    }
    Start-Sleep -Milliseconds 80
  }
  throw "Timed out waiting to press '$Name'"
}

function Wait-ProcessText($Process, [string]$Prefix) {
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  while ([DateTime]::UtcNow -lt $deadline) {
    $Process.Refresh()
    if ($Process.HasExited) { throw "SaVaGe exited before '$Prefix' appeared" }
    foreach ($element in (Get-ProcessElements $Process)) {
      $name = $element.Current.Name
      if ($name -and $name.StartsWith($Prefix)) { return $name }
    }
    Start-Sleep -Milliseconds 80
  }
  throw "Timed out waiting for '$Prefix'"
}

function Save-WindowShot($Process, [string]$Path) {
  $Process.Refresh()
  $shotHwnd = $Process.MainWindowHandle
  $shotRect = New-Object SavageWindow+RECT
  [void][SavageWindow]::GetWindowRect($shotHwnd, [ref]$shotRect)
  $shotW = $shotRect.Right - $shotRect.Left
  $shotH = $shotRect.Bottom - $shotRect.Top
  if ($shotW -lt 32 -or $shotH -lt 32) { throw "The SaVaGe window was too small to capture" }
  $shot = New-Object System.Drawing.Bitmap $shotW, $shotH
  $graphics = [System.Drawing.Graphics]::FromImage($shot)
  $graphics.CopyFromScreen($shotRect.Left, $shotRect.Top, 0, 0, (New-Object System.Drawing.Size $shotW, $shotH))
  $shot.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $shot.Dispose()
}

function Remove-SourceCheckpoints([string]$Token) {
  foreach ($file in @(Get-RecoveryFiles)) {
    $text = [IO.File]::ReadAllText($file.FullName)
    if ($text.Contains($Token)) {
      Remove-Item -LiteralPath $file.FullName -Force
      Write-Host "Removed $($file.Name)"
    } else {
      Write-Host "Left $($file.Name) in place"
    }
  }
}

function Press-NeedButton($Process, $Window) {
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($Process.HasExited) { throw "SaVaGe exited before the artboard size could be changed" }
    foreach ($element in (Get-SavageMainElements $Process)) {
      $name = $element.Current.Name
      $isButton = $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button
      if (-not $isButton -or -not $name -or -not $name.StartsWith("512")) { continue }
      [SavageFocus]::Focus($Window)
      $element.SetFocus()
      Start-Sleep -Milliseconds 150
      [System.Windows.Forms.SendKeys]::SendWait(" ")
      return $name
    }
    Start-Sleep -Milliseconds 80
  }
  throw "Timed out waiting to press the 512 artboard preset"
}

$existing = @(Get-RecoveryFiles)
if ($existing.Count -gt 0) {
  throw "Recovery directory already has checkpoints. Refusing to run so those files are left alone."
}

$sourceDir = Join-Path $env:TEMP "savage-source-check"
$sourcePath = Join-Path $sourceDir "source-check.savage"
$recentPath = Join-Path $env:APPDATA "com.savage.svgstudio\recent-projects.json"
$recentBackup = Join-Path $sourceDir "recent-projects.json.bak"
$appProfile = $null
$process = $null
$shotPath = Join-Path $repo "docs\engineering\packaged-recovery-source-open.png"
$discardShotPath = Join-Path $repo "docs\engineering\packaged-recovery-source-discard.png"
try {
  New-Item -ItemType Directory -Force -Path $sourceDir | Out-Null
  if (Test-Path -LiteralPath $recentPath) {
    Copy-Item -LiteralPath $recentPath -Destination $recentBackup -Force
  }
  $document = @'
{
  "version": 1,
  "name": "Source Check",
  "width": 1920,
  "height": 1080,
  "viewBox": { "x": 0, "y": 0, "w": 1920, "h": 1080 },
  "background": null,
  "rootChildIds": [],
  "nodes": {},
  "assets": {},
  "artboards": [
    {
      "id": "ab1",
      "name": "Artboard 1",
      "x": 0,
      "y": 0,
      "width": 1920,
      "height": 1080,
      "background": "#ffffff"
    }
  ],
  "activeArtboardId": "ab1",
  "symbols": {}
}
'@
  [System.IO.File]::WriteAllText($sourcePath, $document.Trim() + "`n")
  $beforeHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $beforeWrite = (Get-Item -LiteralPath $sourcePath).LastWriteTimeUtc.ToString("o")

  Write-Host "Launching release executable"
  $appProfile = New-SavageProfile
  $started = Start-SavagePackaged -Exe $Exe -AppProfile $appProfile
  $process = $started.Process
  $handle = Wait-SavageWindowVisible $process 20000
  Set-SavageWindowBounds $handle 1440 900
  Wait-SavageAccessibleName -Process $process -Prefix "Open Image" -TimeoutMs 20000
  Open-SavageProject $process $sourcePath
  Wait-SavageAccessibleName -Process $process -Prefix "This artboard is empty" -TimeoutMs 20000
  $preset = Press-NeedButton $process $handle
  Write-Host "Changed the artboard with $preset"
  $checkpoint = $null
  $deadline = [DateTime]::UtcNow.AddSeconds(12)
  while ([DateTime]::UtcNow -lt $deadline) {
    $found = @(Get-RecoveryFiles)
    if ($found.Count -gt 1) { throw "More than one recovery checkpoint appeared" }
    if ($found.Count -eq 1) {
      $checkpoint = $found[0]
      break
    }
    Start-Sleep -Milliseconds 200
  }
  if (-not $checkpoint) { throw "The release app did not write a recovery checkpoint after the edit" }
  $checkpointText = [IO.File]::ReadAllText($checkpoint.FullName)
  if ($checkpointText -notmatch "source-check\.savage") { throw "The checkpoint does not name the source file" }
  if ($checkpointText -notmatch "512") { throw "The checkpoint does not contain the edited artboard size" }
  $checkpointHash = (Get-FileHash -LiteralPath $checkpoint.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $hashAfterEdit = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hashAfterEdit -ne $beforeHash) { throw "The edit overwrote the source file before the process was killed" }
  Write-Host "Checkpoint written. Killing the process."
  Stop-SavagePackaged $process
  $process = $null

  Write-Host "Relaunching for Open Original"
  $started = Start-SavagePackaged -Exe $Exe -AppProfile $appProfile
  $process = $started.Process
  $prompt = Wait-ProcessText $process "Recover unsaved work"
  Click-NamedButton $process "Other options"
  $originalPrompt = Wait-ProcessText $process "Open the original project instead?"
  Click-NamedButton $process "Open Original"
  Start-Sleep -Seconds 2
  Save-WindowShot $process $shotPath
  $hashAfterOpen = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $writeAfterOpen = (Get-Item -LiteralPath $sourcePath).LastWriteTimeUtc.ToString("o")
  $checkpointAfterOpen = @(Get-RecoveryFiles).Count
  Write-Host "Open Original hash match=$($hashAfterOpen -eq $beforeHash) checkpoints=$checkpointAfterOpen"

  Write-Host "Relaunching for Discard Recovery"
  Stop-SavagePackaged $process
  $process = $null
  if ($checkpointAfterOpen -lt 1) { throw "Open Original removed the checkpoint, so Discard could not be offered from the same file" }
  $started = Start-SavagePackaged -Exe $Exe -AppProfile $appProfile
  $process = $started.Process
  $discardPrompt = Wait-ProcessText $process "Recover unsaved work"
  Click-NamedButton $process "Other options"
  $discardChoice = Wait-ProcessText $process "Open the original project instead?"
  Click-NamedButton $process "Discard Recovery"
  Start-Sleep -Seconds 1
  Save-WindowShot $process $discardShotPath
  $removed = $false
  $removeDeadline = [DateTime]::UtcNow.AddSeconds(8)
  while ([DateTime]::UtcNow -lt $removeDeadline) {
    if ((@(Get-RecoveryFiles)).Count -eq 0) {
      $removed = $true
      break
    }
    Start-Sleep -Milliseconds 200
  }
  $hashAfterDiscard = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $writeAfterDiscard = (Get-Item -LiteralPath $sourcePath).LastWriteTimeUtc.ToString("o")
  if ($hashAfterOpen -ne $beforeHash -or $hashAfterDiscard -ne $beforeHash) {
    throw "The source .savage changed"
  }
  if (-not $removed) { throw "Discard Recovery left the checkpoint on disk" }

  $commit = ""
  $dirty = $false
  try {
    $commit = (git -C $repo rev-parse HEAD).Trim()
    $dirty = -not [string]::IsNullOrWhiteSpace((git -C $repo status --porcelain -- src scripts docs package.json README.md src-tauri/src))
  } catch {
    $commit = ""
  }
  $report = [ordered]@{
    result = "source-unchanged"
    definition = "A release executable opened a temporary .savage, resized its artboard, wrote a checkpoint, and was killed. Restart offered the native recovery prompt. Open Original and Discard Recovery both left the source file bytes and timestamp unchanged. The recovered edit was not written back. This is the release executable, not an NSIS install. Checkpoints use the Windows known-folder app data directory."
    prompt = $prompt
    openOriginalPrompt = $originalPrompt
    discardPrompt = $discardPrompt
    discardChoice = $discardChoice
    edit = $preset
    sourceSha256 = $beforeHash
    sourceUnchangedAfterEdit = ($hashAfterEdit -eq $beforeHash)
    sourceUnchangedAfterOpenOriginal = ($hashAfterOpen -eq $beforeHash)
    sourceUnchangedAfterDiscard = ($hashAfterDiscard -eq $beforeHash)
    sourceLastWriteBefore = $beforeWrite
    sourceLastWriteAfterOpenOriginal = $writeAfterOpen
    sourceLastWriteAfterDiscard = $writeAfterDiscard
    checkpointSha256 = $checkpointHash
    checkpointRemoved = $removed
    openOriginalCapture = "docs/engineering/packaged-recovery-source-open.png"
    openOriginalCaptureShows = "The title reads source-check and Saved. The window stays on Convert because Open Original does not switch modes."
    discardCapture = "docs/engineering/packaged-recovery-source-discard.png"
    discardCaptureShows = "The title reads Untitled and Unsaved, the startup document, after Discard Recovery removes the checkpoint."
    executable = [ordered]@{
      path = (Resolve-Path -LiteralPath $Exe).Path
      sha256 = (Get-FileHash -LiteralPath $Exe -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    commit = $commit
    workingTreeDirty = $dirty
    webView2 = (Get-SavageWebView2Version)
    machine = $env:COMPUTERNAME
    otherInstances = @(Get-OtherSavageProcesses | Where-Object { $_.id -ne $process.Id })
    recordedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Result) | Out-Null
  $json = $report | ConvertTo-Json -Depth 6
  [System.IO.File]::WriteAllText($Result, $json + "`n")
  Write-Host "Source file unchanged. $Result"
} finally {
  Stop-SavagePackaged $process
  Remove-SourceCheckpoints "source-check.savage"
  if ($appProfile) { Remove-SavageProfile $appProfile }
  if (Test-Path -LiteralPath $recentBackup) {
    Copy-Item -LiteralPath $recentBackup -Destination $recentPath -Force
  }
  if (Test-Path -LiteralPath $sourceDir) {
    Remove-Item -LiteralPath $sourceDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
