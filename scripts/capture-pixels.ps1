# Capture packaged WebView2 pixels for the primary visual fixtures.
# Requires a release savage.exe that includes the SAVAGE_VISUAL host hook.

param(
  [string]$Exe = "",
  [string]$OutDir = ""
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "window-evidence.ps1")
Initialize-SavageWindowHost
Add-Type -AssemblyName System.Drawing | Out-Null
Add-Type -AssemblyName System.Windows.Forms | Out-Null

$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $Exe) {
  $Exe = Join-Path $repo "src-tauri\target\release\savage.exe"
}
if (-not $OutDir) {
  $OutDir = Join-Path $repo "docs\engineering\pixel-baselines"
}
if (-not (Test-Path -LiteralPath $Exe)) {
  throw "Release executable not found: $Exe. Build it with: pnpm exec tauri build --no-bundle"
}

$fixtures = @(
  "converter-empty",
  "converter-loaded",
  "converter-tracing",
  "converter-completed",
  "converter-stale",
  "converter-error",
  "editor-empty",
  "editor-populated",
  "menu-file",
  "dialog-unsaved",
  "dialog-conflict"
)

function Get-WindowBitmap([IntPtr]$Handle) {
  $rect = Get-SavageWindowRect $Handle
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) { throw "SaVaGe window has no pixels" }
  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $width, $height))
  } finally {
    $graphics.Dispose()
  }
  return $bitmap
}

if (-not ("SavagePixels" -as [type])) {
  Add-Type @"
using System;
public static class SavagePixels {
  public static double DifferenceRatio(byte[] left, byte[] right, int width, int height, int stride) {
    int different = 0;
    int pixels = width * height;
    for (int y = 0; y < height; y++) {
      int row = y * stride;
      for (int x = 0; x < width; x++) {
        int offset = row + (x * 4);
        int delta = Math.Abs(left[offset] - right[offset])
          + Math.Abs(left[offset + 1] - right[offset + 1])
          + Math.Abs(left[offset + 2] - right[offset + 2]);
        if (delta > 24) different++;
      }
    }
    return pixels == 0 ? 1.0 : (double)different / pixels;
  }
}
"@
}

function Get-PixelDifferenceRatio($Left, $Right) {
  if ($Left.Width -ne $Right.Width -or $Left.Height -ne $Right.Height) { return 1.0 }
  $bounds = New-Object System.Drawing.Rectangle 0, 0, $Left.Width, $Left.Height
  $format = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  $leftBits = $Left.LockBits($bounds, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $format)
  $rightBits = $Right.LockBits($bounds, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $format)
  try {
    $stride = [Math]::Abs($leftBits.Stride)
    $bytes = $stride * $Left.Height
    $leftBytes = New-Object byte[] $bytes
    $rightBytes = New-Object byte[] $bytes
    [System.Runtime.InteropServices.Marshal]::Copy($leftBits.Scan0, $leftBytes, 0, $bytes)
    [System.Runtime.InteropServices.Marshal]::Copy($rightBits.Scan0, $rightBytes, 0, $bytes)
    return [SavagePixels]::DifferenceRatio($leftBytes, $rightBytes, $Left.Width, $Left.Height, $stride)
  } finally {
    $Left.UnlockBits($leftBits)
    $Right.UnlockBits($rightBits)
  }
}

$others = @(Get-OtherSavageProcesses)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$appProfile = New-SavageProfile
$captures = @()
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

try {
  foreach ($fixture in $fixtures) {
    Write-Host "Capturing $fixture"
    $started = Start-SavagePackaged -Exe $Exe -AppProfile $appProfile -Fixture $fixture
    $process = $started.Process
    try {
      $handle = Wait-SavageWindowVisible $process 20000
      $outerWidth = [Math]::Min(1440, $screen.Width)
      $outerHeight = [Math]::Min(900, $screen.Height)
      Set-SavageWindowBounds $handle $outerWidth $outerHeight
      Wait-SavageAccessibleName -Process $process -Prefix "savage-visual-$fixture" -TimeoutMs 20000
      Start-Sleep -Milliseconds 800
      [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point 0, 0
      $process.Refresh()
      $handle = $process.MainWindowHandle
      $first = Get-WindowBitmap $handle
      Start-Sleep -Milliseconds 250
      $second = Get-WindowBitmap $handle
      $ratio = Get-PixelDifferenceRatio $first $second
      $path = Join-Path $OutDir "$fixture.png"
      $second.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
      $captures += [ordered]@{
        fixture = $fixture
        file = "docs/engineering/pixel-baselines/$fixture.png"
        width = $second.Width
        height = $second.Height
        sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        consecutiveDifference = [Math]::Round($ratio, 6)
        stable = ($ratio -le 0.005)
      }
      $first.Dispose()
      $second.Dispose()
    } finally {
      Stop-SavagePackaged $process
      Start-Sleep -Milliseconds 250
    }
  }
} finally {
  Remove-SavageProfile $appProfile
}

$commit = ""
$dirty = $false
try {
  $commit = (git -C $repo rev-parse HEAD).Trim()
  $dirty = -not [string]::IsNullOrWhiteSpace((git -C $repo status --porcelain -- src scripts docs package.json README.md src-tauri/src src-tauri/Cargo.toml))
} catch {
  $commit = ""
}
$manifest = [ordered]@{
  definition = "Pixels are the decorated release window on WebView2. SAVAGE_VISUAL seeds the primary states. The noise overlay and CSS animation are suppressed, and the frame meter stays at 0.0 ms, so the capture can be compared. This is not Narrator, high contrast, or display-scaling evidence."
  differenceRule = "A fixture is stable when two captures about 250 ms apart differ in at most 0.5 percent of pixels, ignoring per-channel RGB changes of 8 or less."
  windowOuter = "Up to 1440x900 device pixels, placed at 8,8 and kept topmost during the capture."
  captures = $captures
  executable = [ordered]@{
    path = (Resolve-Path -LiteralPath $Exe).Path
    sha256 = (Get-FileHash -LiteralPath $Exe -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  commit = $commit
  workingTreeDirty = $dirty
  webView2 = (Get-SavageWebView2Version)
  machine = $env:COMPUTERNAME
  otherInstances = $others
  recordedAt = (Get-Date).ToUniversalTime().ToString("o")
}
$manifestPath = Join-Path $OutDir "manifest.json"
$json = $manifest | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($manifestPath, $json + "`n")
$unstable = @($captures | Where-Object { -not $_.stable })
Write-Host "Wrote $($captures.Count) captures to $OutDir"
if ($unstable.Count -gt 0) {
  Write-Host ("Unstable: " + (($unstable | ForEach-Object { $_.fixture }) -join ", "))
}
