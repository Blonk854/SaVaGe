# Missing-WebView2 installer check.
# A machine that already has the Evergreen runtime cannot mark this gate.
# Pass -Setup only when the runtime registry value is absent.

param(
  [string]$Setup = "",
  [string]$Result = "",
  [ValidateSet("auto", "online", "offline")]
  [string]$Network = "auto"
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "window-evidence.ps1")

$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $Result) {
  $Result = Join-Path $repo "docs\engineering\webview2-missing.json"
}

function Get-HostFacts {
  $os = Get-CimInstance Win32_OperatingSystem
  $edition = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion").ProductName
  return [ordered]@{
    name = $env:COMPUTERNAME
    os = "$edition $($os.Version)"
    sandbox = (Test-Path "$env:WINDIR\System32\WindowsSandbox.exe")
    webView2 = (Get-SavageWebView2Version)
  }
}

function Write-WebView2Result($Report, [int]$Code) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Result) | Out-Null
  $json = $Report | ConvertTo-Json -Depth 6
  [System.IO.File]::WriteAllText($Result, $json + "`n")
  Write-Host $Result
  exit $Code
}

$hostFacts = Get-HostFacts
$recordedAt = (Get-Date).ToUniversalTime().ToString("o")

if ($hostFacts.webView2) {
  $next = "Run scripts/webview2-missing.ps1 on a Windows machine or virtual machine whose Evergreen WebView2 runtime key is absent. Online setup should download the bootstrapper. Offline setup should abort and leave no install directory."
  if (-not $hostFacts.sandbox) {
    $next = "This host cannot supply that machine: Windows Sandbox is not installed, and Windows 10 Home cannot enable Sandbox or Hyper-V. " + $next
  }
  Write-WebView2Result ([ordered]@{
    result = "refused"
    reason = "The Evergreen WebView2 runtime is already installed. This run does not mark the missing-runtime gate."
    host = $hostFacts
    nextStep = $next
    recordedAt = $recordedAt
  }) 2
}

if (-not $Setup -or -not (Test-Path -LiteralPath $Setup)) {
  throw "The runtime is missing, but -Setup must point at the NSIS installer to exercise."
}

$online = $false
if ($Network -eq "online") {
  $online = $true
} elseif ($Network -eq "auto") {
  $online = [bool](Test-Connection -ComputerName "www.msftconnecttest.com" -Count 1 -Quiet -ErrorAction SilentlyContinue)
}

$installDir = Join-Path $env:LOCALAPPDATA "SaVaGe"
$before = Test-Path -LiteralPath $installDir
$process = Start-Process -FilePath $Setup -ArgumentList "/S" -Wait -PassThru
$after = Test-Path -LiteralPath (Join-Path $installDir "savage.exe")
$installed = (-not $before) -and $after

if ($online) {
  $ok = ($process.ExitCode -eq 0) -and $installed
  $result = $(if ($ok) { "downloaded-and-installed" } else { "online-failed" })
} else {
  $ok = ($process.ExitCode -ne 0) -and (-not $installed)
  $result = $(if ($ok) { "offline-aborted" } else { "offline-failed" })
}

Write-WebView2Result ([ordered]@{
  result = $result
  online = $online
  setupExitCode = $process.ExitCode
  installDirectoryCreated = $installed
  setup = (Resolve-Path -LiteralPath $Setup).Path
  host = $hostFacts
  recordedAt = $recordedAt
}) $(if ($ok) { 0 } else { 1 })
