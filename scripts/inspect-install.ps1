param(
  [string]$ProductName = "SaVaGe",
  [string]$BundleId = "com.savage.svgstudio"
)

$ErrorActionPreference = "Stop"

function Get-WebView2Version {
  $keys = @(
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
  )
  foreach ($key in $keys) {
    if (Test-Path $key) {
      $version = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).pv
      if ($version) { return $version }
    }
  }
  return $null
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$admin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$ProductName"
if (-not (Test-Path $uninstallKey)) {
  throw "No current-user uninstall entry for $ProductName. Install the NSIS setup as this account first."
}

$uninstall = Get-ItemProperty -Path $uninstallKey
$installLocation = ($uninstall.InstallLocation -replace '^"|"$', "").Trim()
if (-not $installLocation) {
  $installLocation = Join-Path $env:LOCALAPPDATA $ProductName
}

$exe = Join-Path $installLocation "$ProductName.exe"
$manualCandidates = @(
  (Join-Path $installLocation "resources\USER_MANUAL.pdf"),
  (Join-Path $installLocation "USER_MANUAL.pdf")
)
$manual = $manualCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$appData = Join-Path $env:APPDATA $BundleId
$recovery = Join-Path $appData "recovery"
$diagnostics = Join-Path $appData "diagnostics.json"
$association = Get-ItemProperty -Path "HKCU:\Software\Classes\.savage" -ErrorAction SilentlyContinue

$record = [ordered]@{
  product = $ProductName
  account = $identity.Name
  administrator = $admin
  displayVersion = $uninstall.DisplayVersion
  installLocation = $installLocation
  executablePresent = Test-Path $exe
  bundledManual = $manual
  webView2 = Get-WebView2Version
  appDataDirectory = $appData
  recoveryDirectoryPresent = Test-Path $recovery
  diagnosticsPresent = Test-Path $diagnostics
  savageFileAssociation = [bool]$association
}

$record | ConvertTo-Json

if ($admin) {
  Write-Error "M8.2 requires a non-admin account. Re-run inspect without elevation."
}
if (-not $record.executablePresent) {
  Write-Error "SaVaGe.exe was not found under $installLocation"
}
if (-not $manual) {
  Write-Error "Bundled USER_MANUAL.pdf was not found next to the installed executable"
}
if ($record.savageFileAssociation) {
  Write-Error ".savage is registered; file associations are not part of this release"
}

Write-Host "Install inspect passed for $ProductName $($record.displayVersion) (unsigned current-user NSIS)."
