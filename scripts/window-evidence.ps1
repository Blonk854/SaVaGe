# Shared helpers for packaged-window evidence. Dot-source this file.

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

function Initialize-SavageWindowHost {
  if (-not ("SavageWindow" -as [type])) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class SavageWindow {
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  public static readonly IntPtr TopMost = new IntPtr(-1);
  public const uint ShowWindowFlag = 0x0040;
  public const int Restore = 9;
}
"@
    [SavageWindow]::SetProcessDPIAware() | Out-Null
  }
  Add-Type -AssemblyName UIAutomationClient | Out-Null
  Add-Type -AssemblyName UIAutomationTypes | Out-Null
}

function Get-OtherSavageProcesses {
  @(Get-Process -Name "savage", "SaVaGe" -ErrorAction SilentlyContinue | ForEach-Object {
    [ordered]@{
      id = $_.Id
      path = $_.Path
      started = $_.StartTime.ToUniversalTime().ToString("o")
    }
  })
}

function Get-SavageWebView2Version {
  $keys = @(
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
  )
  foreach ($key in $keys) {
    $version = (Get-ItemProperty -Path $key -Name pv -ErrorAction SilentlyContinue).pv
    if ($version) { return [string]$version }
  }
  return $null
}

function New-SavageProfile {
  $root = Join-Path $env:TEMP ("savage-evidence-" + [guid]::NewGuid().ToString("n"))
  $appData = Join-Path $root "Roaming"
  $localAppData = Join-Path $root "Local"
  New-Item -ItemType Directory -Force -Path $appData, $localAppData | Out-Null
  return @{
    Root = $root
    AppData = $appData
    LocalAppData = $localAppData
  }
}

function Remove-SavageProfile([hashtable]$Profile) {
  if ($Profile -and (Test-Path $Profile.Root)) {
    Remove-Item -LiteralPath $Profile.Root -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Start-SavagePackaged {
  param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [Parameter(Mandatory = $true)][hashtable]$AppProfile,
    [string]$Fixture = "",
    [string]$PresentFile = ""
  )
  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = $Exe
  $start.WorkingDirectory = Split-Path -Parent $Exe
  $start.UseShellExecute = $false
  $start.EnvironmentVariables["APPDATA"] = $AppProfile.AppData
  $start.EnvironmentVariables["LOCALAPPDATA"] = $AppProfile.LocalAppData
  if ($start.EnvironmentVariables.ContainsKey("SAVAGE_VISUAL")) {
    $start.EnvironmentVariables.Remove("SAVAGE_VISUAL")
  }
  if ($start.EnvironmentVariables.ContainsKey("SAVAGE_PRESENT_FILE")) {
    $start.EnvironmentVariables.Remove("SAVAGE_PRESENT_FILE")
  }
  if ($Fixture) {
    $start.EnvironmentVariables["SAVAGE_VISUAL"] = $Fixture
  }
  if ($PresentFile) {
    $start.EnvironmentVariables["SAVAGE_PRESENT_FILE"] = $PresentFile
  }
  $startedAt = [DateTimeOffset]::UtcNow
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $process = [Diagnostics.Process]::Start($start)
  if (-not $process) { throw "Could not start $Exe" }
  return @{ Process = $process; Watch = $watch; StartedAt = $startedAt }
}

function Stop-SavagePackaged($Process) {
  if (-not $Process) { return }
  try {
    if (-not $Process.HasExited) {
      Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
      $Process.WaitForExit(8000) | Out-Null
    }
  } catch {
  }
}

function Wait-SavageWindowVisible($Process, [int]$TimeoutMs) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  while ([DateTime]::UtcNow -lt $deadline) {
    $Process.Refresh()
    if ($Process.HasExited) { throw "SaVaGe exited before the window was visible" }
    $handle = $Process.MainWindowHandle
    if ($handle -ne [IntPtr]::Zero -and [SavageWindow]::IsWindowVisible($handle)) {
      return $handle
    }
    Start-Sleep -Milliseconds 20
  }
  throw "Timed out waiting for a visible SaVaGe window"
}

function Get-SavageMainElements($Process) {
  $Process.Refresh()
  if ($Process.HasExited) { return @() }
  $nameCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty,
    "SaVaGe"
  )
  $processCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
    $Process.Id
  )
  $windowCondition = New-Object System.Windows.Automation.AndCondition($nameCondition, $processCondition)
  $window = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst(
    [System.Windows.Automation.TreeScope]::Children,
    $windowCondition
  )
  if (-not $window) { return @() }
  $trueCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::IsControlElementProperty,
    $true
  )
  return @($window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $trueCondition))
}

function Wait-SavageAccessibleName {
  param(
    [Parameter(Mandatory = $true)]$Process,
    [Parameter(Mandatory = $true)][string]$Prefix,
    [int]$TimeoutMs = 20000
  )
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($Process.HasExited) { throw "SaVaGe exited before '$Prefix' was available" }
    try {
      foreach ($element in (Get-SavageMainElements $Process)) {
        $name = $element.Current.Name
        if ($name -and $name.StartsWith($Prefix)) { return }
      }
    } catch {
    }
    Start-Sleep -Milliseconds 80
  }
  throw "Timed out waiting for accessible name '$Prefix'"
}

function Get-SavagePercentile([double[]]$Samples, [double]$Percent) {
  $sorted = @($Samples | Sort-Object)
  $rank = [Math]::Ceiling(($Percent / 100) * $sorted.Count)
  $index = [Math]::Min($sorted.Count - 1, [Math]::Max(0, $rank - 1))
  return [Math]::Round($sorted[$index], 3)
}

function Set-SavageWindowBounds([IntPtr]$Handle, [int]$Width, [int]$Height) {
  [SavageWindow]::ShowWindow($Handle, [SavageWindow]::Restore) | Out-Null
  [SavageWindow]::SetWindowPos($Handle, [SavageWindow]::TopMost, 8, 8, $Width, $Height, [SavageWindow]::ShowWindowFlag) | Out-Null
  [SavageWindow]::SetForegroundWindow($Handle) | Out-Null
}

function Get-SavageWindowRect([IntPtr]$Handle) {
  $rect = New-Object SavageWindow+RECT
  if (-not [SavageWindow]::GetWindowRect($Handle, [ref]$rect)) {
    throw "Could not read the SaVaGe window rectangle"
  }
  return $rect
}
