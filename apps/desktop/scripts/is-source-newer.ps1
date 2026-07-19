# Exit 1 if any watched source is newer than the packaged exe; else 0.
param(
  [Parameter(Mandatory = $true)][string]$ExePath,
  [Parameter(Mandatory = $true)][string]$DesktopDir
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ExePath)) { exit 0 }

$exeTime = (Get-Item -LiteralPath $ExePath).LastWriteTime
$roots = @(
  (Join-Path $DesktopDir 'src'),
  (Join-Path $DesktopDir 'index.html'),
  (Join-Path $DesktopDir 'package.json'),
  (Join-Path $DesktopDir 'vite.config.ts'),
  (Join-Path $DesktopDir 'src-tauri\src'),
  (Join-Path $DesktopDir 'src-tauri\Cargo.toml'),
  (Join-Path $DesktopDir 'src-tauri\tauri.conf.json')
)

$newest = $null
foreach ($root in $roots) {
  if (Test-Path -LiteralPath $root -PathType Leaf) {
    $t = (Get-Item -LiteralPath $root).LastWriteTime
    if (-not $newest -or $t -gt $newest) { $newest = $t }
  } elseif (Test-Path -LiteralPath $root -PathType Container) {
    Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
      ForEach-Object {
        if (-not $newest -or $_.LastWriteTime -gt $newest) { $newest = $_.LastWriteTime }
      }
  }
}

if ($newest -and $newest -gt $exeTime) { exit 1 }
exit 0
