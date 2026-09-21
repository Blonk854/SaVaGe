param(
  [switch]$SkipChecks,
  [switch]$AllowUntagged,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not available"
  }
}

function Invoke-Pnpm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$PnpmArgs)
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    & pnpm @PnpmArgs
  } else {
    & npx --yes pnpm@10.17.1 @PnpmArgs
  }
  if ($LASTEXITCODE -ne 0) { throw "pnpm $($PnpmArgs -join ' ') failed" }
}

Require-Command node
Require-Command cargo

$Version = (node "$Root\scripts\release-manifest.mjs" check).Trim()
if ($LASTEXITCODE -ne 0 -or -not $Version) {
  throw "Version consistency check failed"
}

if (-not $AllowUntagged) {
  $Tag = ""
  try { $Tag = (git describe --exact-match --tags HEAD).Trim() } catch { $Tag = "" }
  if ($Tag -ne "v$Version") {
    throw "HEAD must be tagged v$Version. Pass -AllowUntagged only for a local unsigned dry run."
  }
}

if (-not $SkipChecks) {
  Invoke-Pnpm install --frozen-lockfile
  Invoke-Pnpm audit:frontend
  Invoke-Pnpm check
  cargo fetch --locked --manifest-path src-tauri/Cargo.toml
  if ($LASTEXITCODE -ne 0) { throw "cargo fetch --locked failed" }
}

if (-not $SkipBuild) {
  Invoke-Pnpm tauri:build -- --ci --bundles nsis
}

$Installer = Join-Path $Root "src-tauri\target\release\bundle\nsis\SaVaGe_${Version}_x64-setup.exe"
if (-not (Test-Path $Installer)) {
  throw "Expected installer was not produced: $Installer"
}

$Commit = (git rev-parse HEAD).Trim()
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  $PnpmVersion = (pnpm --version).Trim()
} else {
  $PnpmVersion = (npx --yes pnpm@10.17.1 --version).Trim()
}
$RustcVersion = (rustc --version).Split(" ")[1]
$NodeVersion = (node --version).TrimStart("v")
$ProvenanceArgs = @(
  "$Root\scripts\release-manifest.mjs",
  "provenance",
  "--installer", $Installer,
  "--out", (Split-Path $Installer),
  "--commit", $Commit,
  "--node", $NodeVersion,
  "--pnpm", $PnpmVersion,
  "--rustc", $RustcVersion
)
if ($AllowUntagged) {
  $ProvenanceArgs += "--skip-tag"
} else {
  $ProvenanceArgs += @("--tag", "v$Version")
}

node @ProvenanceArgs
if ($LASTEXITCODE -ne 0) { throw "Failed to write release provenance" }

Write-Host "Unsigned NSIS installer: $Installer"
Write-Host "Checksums: $(Join-Path (Split-Path $Installer) 'SHA256SUMS.txt')"
Write-Host "Provenance: $(Join-Path (Split-Path $Installer) 'provenance.json')"
Write-Host "This artifact is not Authenticode-signed. Verify the SHA-256 before installing."
