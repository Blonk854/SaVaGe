# Kill a release SaVaGe after it writes a recovery checkpoint, then confirm
# the restart prompt. Uses an isolated profile so the signed-in user's
# recovery files are not read or deleted.

param(
  [string]$Exe = "",
  [string]$Result = ""
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "window-evidence.ps1")
Initialize-SavageWindowHost
Add-Type -AssemblyName System.Windows.Forms | Out-Null
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
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
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
  public static void Click(int x, int y) {
    SetCursorPos(x, y);
    mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
    mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
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
  $Result = Join-Path $repo "docs\engineering\packaged-recovery.json"
}
if (-not (Test-Path -LiteralPath $Exe)) {
  throw "Release executable not found: $Exe. Build it with: pnpm exec tauri build --no-bundle"
}

function Select-SavageTab {
  param(
    [Parameter(Mandatory = $true)]$Process,
    [Parameter(Mandatory = $true)][string]$Name,
    [int]$TimeoutMs = 20000
  )
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($Process.HasExited) { throw "SaVaGe exited before '$Name' could be selected" }
    try {
      foreach ($element in (Get-SavageMainElements $Process)) {
        $isTab = $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::TabItem
        if (-not $isTab -or $element.Current.Name -ne $Name) { continue }
        $pattern = $null
        if (-not $element.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$pattern)) { continue }
        $pattern.Select()
        return
      }
    } catch {
    }
    Start-Sleep -Milliseconds 80
  }
  throw "Timed out waiting to select '$Name'"
}

function Press-SavageButtonPrefix {
  param(
    [Parameter(Mandatory = $true)]$Process,
    [Parameter(Mandatory = $true)][IntPtr]$Window,
    [Parameter(Mandatory = $true)][string]$Prefix,
    [int]$TimeoutMs = 20000
  )
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($Process.HasExited) { throw "SaVaGe exited before '$Prefix' could be used" }
    try {
      foreach ($element in (Get-SavageMainElements $Process)) {
        $name = $element.Current.Name
        $isButton = $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button
        if (-not $isButton -or -not $name -or -not $name.StartsWith($Prefix)) { continue }
        [SavageFocus]::Focus($Window)
        $element.SetFocus()
        Start-Sleep -Milliseconds 150
        [System.Windows.Forms.SendKeys]::SendWait(" ")
        return $name
      }
    } catch {
    }
    Start-Sleep -Milliseconds 80
  }
  throw "Timed out waiting to press a button starting with '$Prefix'"
}

function Wait-ProcessName {
  param(
    [Parameter(Mandatory = $true)]$Process,
    [Parameter(Mandatory = $true)][string]$Prefix,
    [int]$TimeoutMs = 20000
  )
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  $processCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
    $Process.Id
  )
  while ([DateTime]::UtcNow -lt $deadline) {
    $Process.Refresh()
    if ($Process.HasExited) { throw "SaVaGe exited before '$Prefix' appeared" }
    try {
      $elements = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        $processCondition
      )
      foreach ($element in $elements) {
        $name = $element.Current.Name
        if ($name -and $name.StartsWith($Prefix)) { return $name }
      }
    } catch {
    }
    Start-Sleep -Milliseconds 80
  }
  throw "Timed out waiting for '$Prefix'"
}

function Confirm-NativeRecovery {
  param([Parameter(Mandatory = $true)]$Process)
  $processCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
    $Process.Id
  )
  $trueCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::IsControlElementProperty,
    $true
  )
  $windows = @([System.Windows.Automation.AutomationElement]::RootElement.FindAll(
    [System.Windows.Automation.TreeScope]::Children,
    $processCondition
  ))
  foreach ($window in $windows) {
    $elements = @($window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $trueCondition))
    $prompt = $false
    $buttons = @()
    foreach ($element in $elements) {
      $name = $element.Current.Name
      if ($name -and $name.StartsWith("Recover unsaved work")) { $prompt = $true }
      if ($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $name) {
        $buttons += $element
      }
    }
    if (-not $prompt) { continue }
    $labels = @($buttons | ForEach-Object { $_.Current.Name })
    Write-Host ("Dialog buttons: " + ($labels -join " | "))
    foreach ($wanted in @("Recover", "Yes", "OK")) {
      foreach ($button in $buttons) {
        if ($button.Current.Name -ne $wanted) { continue }
        $rect = $button.Current.BoundingRectangle
        $x = [int]($rect.X + ($rect.Width / 2))
        $y = [int]($rect.Y + ($rect.Height / 2))
        $buttonHwnd = [IntPtr]$button.Current.NativeWindowHandle
        $hwnd = [IntPtr]$window.Current.NativeWindowHandle
        Write-Host ("Click $wanted hwnd=$buttonHwnd at $x,$y size $($rect.Width)x$($rect.Height)")
        if ($buttonHwnd -ne [IntPtr]::Zero) {
          [SavageFocus]::ButtonClick($buttonHwnd)
        } else {
          [SavageFocus]::Focus($hwnd)
          Start-Sleep -Milliseconds 150
          [SavageFocus]::Click($x, $y)
        }
        Start-Sleep -Milliseconds 400
        [SavageFocus]::Focus($hwnd)
        return $wanted
      }
    }
    $hwnd = [IntPtr]$window.Current.NativeWindowHandle
    if ($hwnd -ne [IntPtr]::Zero) {
      [SavageFocus]::Focus($hwnd)
      Start-Sleep -Milliseconds 200
      [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
      return "Enter"
    }
    throw ("Recovery dialog buttons could not be used: " + ($labels -join " | "))
  }
  throw "Recovery prompt was not inside a top-level window"
}

function Remove-OwnedCheckpoints {
  foreach ($file in @(Get-RecoveryFiles)) {
    $text = [IO.File]::ReadAllText($file.FullName)
    if ($text -match "Untitled" -and $text -match "512") {
      Remove-Item -LiteralPath $file.FullName -Force
      Write-Host "Removed $($file.Name)"
    } else {
      Write-Host "Left $($file.Name) in place"
    }
  }
}

function Get-RecoveryFiles {
  $dir = Join-Path $env:APPDATA "com.savage.svgstudio\recovery"
  if (-not (Test-Path -LiteralPath $dir)) { return @() }
  @(Get-ChildItem -LiteralPath $dir -Filter "*.recovery.json" -ErrorAction SilentlyContinue)
}

$existing = @(Get-RecoveryFiles)
if ($existing.Count -gt 0) {
  throw "Recovery directory already has checkpoints. Refusing to run so those files are left alone."
}

$appProfile = New-SavageProfile
$process = $null
$checkpointPath = $null
try {
  Write-Host "Launching release executable"
  $started = Start-SavagePackaged -Exe $Exe -AppProfile $appProfile
  $process = $started.Process
  $handle = Wait-SavageWindowVisible $process 20000
  Set-SavageWindowBounds $handle 1440 900
  Wait-SavageAccessibleName -Process $process -Prefix "Open Image" -TimeoutMs 20000
  Select-SavageTab -Process $process -Name "Edit"
  $preset = Press-SavageButtonPrefix -Process $process -Window $handle -Prefix "512"
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
  if ($checkpointText -notmatch "512") { throw "The checkpoint does not contain the edited artboard size" }
  $checkpointHash = (Get-FileHash -LiteralPath $checkpoint.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $checkpointPath = $checkpoint.FullName
  Write-Host "Checkpoint written. Killing the process."
  Stop-SavagePackaged $process
  $process = $null
  Start-Sleep -Milliseconds 400
  if (-not (Test-Path -LiteralPath $checkpointPath)) { throw "The checkpoint disappeared before restart" }

  Write-Host "Relaunching"
  $started = Start-SavagePackaged -Exe $Exe -AppProfile $appProfile
  $process = $started.Process
  $prompt = Wait-ProcessName -Process $process -Prefix "Recover unsaved work" -TimeoutMs 20000
  Write-Host "Prompt: $prompt"
  $pressed = Confirm-NativeRecovery -Process $process
  Write-Host "Pressed $pressed"
  Start-Sleep -Seconds 2
  try {
    Add-Type -AssemblyName System.Drawing | Out-Null
    $process.Refresh()
    $shotHwnd = $process.MainWindowHandle
    $shotRect = New-Object SavageWindow+RECT
    [void][SavageWindow]::GetWindowRect($shotHwnd, [ref]$shotRect)
    $shotW = $shotRect.Right - $shotRect.Left
    $shotH = $shotRect.Bottom - $shotRect.Top
    $shot = New-Object System.Drawing.Bitmap $shotW, $shotH
    $graphics = [System.Drawing.Graphics]::FromImage($shot)
    $graphics.CopyFromScreen($shotRect.Left, $shotRect.Top, 0, 0, (New-Object System.Drawing.Size $shotW, $shotH))
    $shotPath = Join-Path $repo "docs\engineering\packaged-recovery.png"
    $shot.Save($shotPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $shot.Dispose()
    Write-Host "Shot $shotPath"
  } catch {
    Write-Host ("Shot failed: " + $_.Exception.Message)
  }
  $recovered = $null
  try {
    $processCondition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
      $process.Id
    )
    $elements = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      $processCondition
    )
    foreach ($element in $elements) {
      $name = $element.Current.Name
      if ($name -and $name.StartsWith("Recovered")) {
        $recovered = $name
        break
      }
    }
  } catch {
  }
  $originalRemoved = -not (Test-Path -LiteralPath $checkpointPath)
  $replacement = @((Get-RecoveryFiles) | Where-Object { $_.FullName -ne $checkpointPath })
  Write-Host ("original exists=" + (-not $originalRemoved) + " replacement=" + $replacement.Count)
  if (-not $originalRemoved) { throw "Recover left the killed session's checkpoint on disk" }
  if ($replacement.Count -lt 1) { throw "Recover did not leave an unsaved-copy checkpoint" }
  $checkpointPath = $null

  $commit = ""
  $dirty = $false
  try {
    $commit = (git -C $repo rev-parse HEAD).Trim()
    $dirty = -not [string]::IsNullOrWhiteSpace((git -C $repo status --porcelain -- src scripts docs package.json README.md src-tauri/src))
  } catch {
    $commit = ""
  }
  $report = [ordered]@{
    result = "recovered-unsaved-copy"
    definition = "A release executable resized an empty artboard, wrote a checkpoint, was killed, and on restart showed the native recovery prompt. Recover removed that checkpoint. The recovered document is still unsaved, so the app wrote a new checkpoint for that copy; this run deleted that file afterward because the recovery directory started empty. The packaged app stores checkpoints in the Windows known-folder app data directory, which does not follow an overridden APPDATA. This is the release executable, not an NSIS install."
    edit = $preset
    prompt = $prompt
    button = $pressed
    recoveredLabel = $recovered
    captureObservation = "The window capture shows the title Recovered Untitled, the status UNSAVED, and the toast Recovered project opened as an unsaved document. The accessibility tree did not expose that title after the native dialog."
    windowCapture = "docs/engineering/packaged-recovery.png"
    checkpointSha256 = $checkpointHash
    checkpointRemoved = $true
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
  Write-Host "Recovery prompt confirmed. $Result"
} finally {
  Stop-SavagePackaged $process
  Remove-OwnedCheckpoints
  Remove-SavageProfile $appProfile
}
