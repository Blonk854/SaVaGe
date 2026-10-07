# Time a release SaVaGe.exe from process start until WebView2 presents the
# first frame that contains the Open Image control.
# presentMs uses element-timing presentationTime. It is not accessibility-tree time.

param(
  [string]$Exe = "",
  [int]$WarmSamples = 5,
  [string]$Result = ""
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "window-evidence.ps1")
Initialize-SavageWindowHost

$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $Exe) {
  $Exe = Join-Path $repo "src-tauri\target\release\savage.exe"
}
if (-not $Result) {
  $Result = Join-Path $repo "docs\engineering\present-timing.json"
}
if (-not (Test-Path -LiteralPath $Exe)) {
  throw "Release executable not found: $Exe. Build it with: pnpm exec tauri build --no-bundle"
}
if ($WarmSamples -lt 1) { throw "WarmSamples must be at least 1" }

function Get-UnixMilliseconds([DateTimeOffset]$Instant) {
  $epoch = [DateTimeOffset]::new(1970, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
  return ($Instant - $epoch).TotalMilliseconds
}

function Read-PresentPayload([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  try {
    $text = [System.IO.File]::ReadAllText($Path)
  } catch {
    return $null
  }
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  try {
    return ($text | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Get-PresentElapsed($Payload, [DateTimeOffset]$StartedAt, [double]$ObservedMs) {
  if ($Payload.status -ne "presented") {
    throw "WebView2 did not expose presentationTime ($($Payload.reason))"
  }
  $startedUnix = Get-UnixMilliseconds $StartedAt
  $presented = [double]$Payload.presentedUnixMs
  $received = [double]$Payload.receivedUnixMs
  $presentMs = [Math]::Round($presented - $startedUnix, 3)
  $receiveLagMs = [Math]::Round($received - $presented, 3)
  $receivedFromStart = [Math]::Round($received - $startedUnix, 3)
  $clockGapMs = [Math]::Round($ObservedMs - $receivedFromStart, 3)
  if ($presentMs -le 0 -or $presentMs -gt 20000) {
    throw "WebView2 present time $presentMs ms is outside the measured launch"
  }
  if ($receiveLagMs -lt -20 -or $receiveLagMs -gt 2000) {
    throw "WebView2 presentation timestamp is $receiveLagMs ms from the host receive time"
  }
  if ([Math]::Abs($clockGapMs) -gt 250) {
    throw "Host clock and process stopwatch differ by $clockGapMs ms"
  }
  return @{
    presentMs = $presentMs
    receiveLagMs = $receiveLagMs
    clockGapMs = $clockGapMs
    stopwatchPresentMs = [Math]::Round($ObservedMs - $receiveLagMs, 3)
  }
}

function Invoke-PresentSample([string]$Label, [string]$PresentFile) {
  if (Test-Path -LiteralPath $PresentFile) {
    Remove-Item -LiteralPath $PresentFile -Force
  }
  $started = Start-SavagePackaged -Exe $Exe -AppProfile $appProfile -PresentFile $PresentFile
  $process = $started.Process
  $watch = $started.Watch
  $startedAt = [DateTimeOffset]$started.StartedAt
  $visibleMs = $null
  $handle = [IntPtr]::Zero
  $payload = $null
  $observedMs = $null
  $accessibleMs = $null
  $deadline = [DateTime]::UtcNow.AddMilliseconds(20000)
  try {
    while ([DateTime]::UtcNow -lt $deadline) {
      $process.Refresh()
      if ($process.HasExited) { throw "SaVaGe exited before the first usable frame was presented" }
      if ($null -eq $visibleMs) {
        $candidate = $process.MainWindowHandle
        if ($candidate -ne [IntPtr]::Zero -and [SavageWindow]::IsWindowVisible($candidate)) {
          $handle = $candidate
          $visibleMs = [Math]::Round($watch.Elapsed.TotalMilliseconds, 3)
        }
      }
      if ($null -eq $payload) {
        $parsed = Read-PresentPayload $PresentFile
        if ($null -ne $parsed -and $parsed.status) {
          $payload = $parsed
          $observedMs = [Math]::Round($watch.Elapsed.TotalMilliseconds, 3)
        }
      }
      if ($null -eq $accessibleMs -and $null -ne $visibleMs) {
        try {
          foreach ($element in (Get-SavageMainElements $process)) {
            $name = $element.Current.Name
            if ($name -and $name.StartsWith("Open Image")) {
              $accessibleMs = [Math]::Round($watch.Elapsed.TotalMilliseconds, 3)
              break
            }
          }
        } catch {
        }
      }
      if ($null -ne $visibleMs -and $null -ne $payload -and $null -ne $accessibleMs) { break }
      Start-Sleep -Milliseconds 15
    }
    if ($null -eq $visibleMs) { throw "Timed out waiting for a visible SaVaGe window" }
    if ($null -eq $payload) { throw "Timed out waiting for WebView2 present time" }
    if ($null -eq $accessibleMs) { throw "Timed out waiting for Open Image in the accessibility tree" }
    $elapsed = Get-PresentElapsed $payload $startedAt ([double]$observedMs)
    $dpi = [SavageWindow]::GetDpiForWindow($handle)
    return @{
      label = $Label
      visibleMs = $visibleMs
      accessibleMs = $accessibleMs
      presentMs = $elapsed.presentMs
      stopwatchPresentMs = $elapsed.stopwatchPresentMs
      receiveLagMs = $elapsed.receiveLagMs
      clockGapMs = $elapsed.clockGapMs
      presentationTimeMs = [double]$payload.presentationTimeMs
      dpi = [int]$dpi
    }
  } finally {
    Stop-SavagePackaged $process
    Start-Sleep -Milliseconds 300
  }
}

$others = @(Get-OtherSavageProcesses)
$appProfile = New-SavageProfile
$presentFile = Join-Path $appProfile.Root "present.json"
$launches = @()

try {
  Write-Host "Cold launch (new WebView2 profile)"
  $launches += Invoke-PresentSample "cold" $presentFile
  for ($index = 1; $index -le $WarmSamples; $index++) {
    Write-Host "Warm launch $index / $WarmSamples"
    $launches += Invoke-PresentSample "warm" $presentFile
  }
} finally {
  Remove-SavageProfile $appProfile
}

$cold = @($launches | Where-Object { $_.label -eq "cold" })
$warm = @($launches | Where-Object { $_.label -eq "warm" })
$warmPresent = @($warm | ForEach-Object { [double]$_.presentMs })
$targetMs = 2000
$presentP95 = Get-SavagePercentile $warmPresent 95
$coldPresent = [double]$cold[0].presentMs
$computer = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpu = @(Get-CimInstance Win32_VideoController) | Select-Object -First 1
$os = Get-CimInstance Win32_OperatingSystem
$commit = ""
$dirty = $false
try {
  $commit = (git -C $repo rev-parse HEAD).Trim()
  $dirty = -not [string]::IsNullOrWhiteSpace((git -C $repo status --porcelain -- src scripts docs package.json README.md src-tauri/src src-tauri/Cargo.toml))
} catch {
  $commit = ""
}

$within = ($coldPresent -le $targetMs) -and ($presentP95 -le $targetMs)
$report = [ordered]@{
  definition = "presentMs is process start until WebView2's element-timing presentationTime for the empty-converter title painted in the same frame as Open Image. Button text does not emit element timing. accessibleMs is the same launch until Open Image is in the accessibility tree. visibleMs is the main window becoming visible. presentMs is the present time."
  targetMs = $targetMs
  versusPlan = $(if ($within) { "within-provisional-target" } else { "above-provisional-target" })
  cold = $cold[0]
  warm = [ordered]@{
    samples = $WarmSamples
    present = [ordered]@{
      p50 = (Get-SavagePercentile $warmPresent 50)
      p95 = $presentP95
    }
  }
  launches = $launches
  machine = [ordered]@{
    name = $env:COMPUTERNAME
    os = "$($os.Caption) $($os.Version)"
    cpu = $cpu.Name.Trim()
    logicalProcessors = [int]$computer.NumberOfLogicalProcessors
    memoryBytes = [int64]$computer.TotalPhysicalMemory
    gpu = $(if ($gpu) { [string]$gpu.Name } else { $null })
    webView2 = (Get-SavageWebView2Version)
    dpi = [int]$warm[0].dpi
  }
  executable = [ordered]@{
    path = (Resolve-Path -LiteralPath $Exe).Path
    sha256 = (Get-FileHash -LiteralPath $Exe -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  commit = $commit
  workingTreeDirty = $dirty
  profile = "Isolated APPDATA and LOCALAPPDATA. The signed-in user's recovery files were not used."
  otherInstances = $others
  recordedAt = (Get-Date).ToUniversalTime().ToString("o")
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Result) | Out-Null
$json = $report | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($Result, $json + "`n")
Write-Host "Cold present $coldPresent ms; warm present p95 $presentP95 ms versus $targetMs ms ($($report.versusPlan))"
Write-Host $Result
