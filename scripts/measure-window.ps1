# Time a release SaVaGe.exe from process start until the converter is usable.
# Usable means the Open Image control is in the WebView2 accessibility tree.
# This does not measure WebView2 present time.

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
  $Result = Join-Path $repo "docs\engineering\window-timing.json"
}
if (-not (Test-Path -LiteralPath $Exe)) {
  throw "Release executable not found: $Exe. Build it with: pnpm exec tauri build --no-bundle"
}
if ($WarmSamples -lt 1) { throw "WarmSamples must be at least 1" }

$others = @(Get-OtherSavageProcesses)
$appProfile = New-SavageProfile
$launches = @()

function Invoke-WindowSample([string]$Label) {
  $started = Start-SavagePackaged -Exe $Exe -AppProfile $appProfile
  $process = $started.Process
  $watch = $started.Watch
  try {
    $handle = Wait-SavageWindowVisible $process 20000
    $visibleMs = [Math]::Round($watch.Elapsed.TotalMilliseconds, 3)
    Wait-SavageAccessibleName -Process $process -Prefix "Open Image" -TimeoutMs 20000
    $usableMs = [Math]::Round($watch.Elapsed.TotalMilliseconds, 3)
    $dpi = [SavageWindow]::GetDpiForWindow($handle)
    return @{
      label = $Label
      visibleMs = $visibleMs
      usableMs = $usableMs
      dpi = [int]$dpi
    }
  } finally {
    Stop-SavagePackaged $process
    Start-Sleep -Milliseconds 300
  }
}

try {
  Write-Host "Cold launch (new WebView2 profile)"
  $launches += Invoke-WindowSample "cold"
  for ($index = 1; $index -le $WarmSamples; $index++) {
    Write-Host "Warm launch $index / $WarmSamples"
    $launches += Invoke-WindowSample "warm"
  }
} finally {
  Remove-SavageProfile $appProfile
}

$cold = @($launches | Where-Object { $_.label -eq "cold" })
$warm = @($launches | Where-Object { $_.label -eq "warm" })
$warmUsable = @($warm | ForEach-Object { [double]$_.usableMs })
$warmVisible = @($warm | ForEach-Object { [double]$_.visibleMs })
$targetMs = 2000
$usableP95 = Get-SavagePercentile $warmUsable 95
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

$report = [ordered]@{
  definition = "usableMs is process start until the Open Image control is in the WebView2 accessibility tree. visibleMs is the main window becoming visible. Neither is WebView2 present time."
  targetMs = $targetMs
  versusPlan = $(if ($usableP95 -le $targetMs) { "within-provisional-target" } else { "above-provisional-target" })
  cold = $cold[0]
  warm = [ordered]@{
    samples = $WarmSamples
    visible = [ordered]@{
      p50 = (Get-SavagePercentile $warmVisible 50)
      p95 = (Get-SavagePercentile $warmVisible 95)
    }
    usable = [ordered]@{
      p50 = (Get-SavagePercentile $warmUsable 50)
      p95 = $usableP95
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
Write-Host "Warm usable p95 ${usableP95} ms versus ${targetMs} ms ($($report.versusPlan))"
Write-Host $Result
