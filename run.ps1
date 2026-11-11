# gsnv-paint launcher for Windows. Double-click run.cmd, or run this file in PowerShell.
# Uses the installed Node.js when it is new enough; otherwise downloads the pinned,
# checksum-verified copy listed in launcher/node-runtime.sha256 into %LOCALAPPDATA%.
# Then runs launcher/start.mjs, which opens the browser.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Fail($code, $message) { Write-Host "`ngsnv-paint [$code]: $message" -ForegroundColor Red; exit 1 }
# Any error output or nonzero exit means this Node.js cannot run the launcher.
function Usable($node) { try { & $node launcher/start.mjs --check 2>$null | Out-Null; return $LASTEXITCODE -eq 0 } catch { return $false } }

if (-not (Test-Path -LiteralPath 'launcher/start.mjs')) { Fail 'LAUNCH-ROOT' 'launcher/start.mjs is missing. Keep run.ps1 inside the complete gsnv-paint folder.' }

$system = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($system -and (Usable $system.Source)) { & $system.Source launcher/start.mjs @args; exit $LASTEXITCODE }

$processor = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
if ($processor -eq 'AMD64') { $arch = 'x64' } elseif ($processor -eq 'ARM64') { $arch = 'arm64' }
else { Fail 'LAUNCH-PLATFORM' "$processor processors are not supported by this launcher. Install Node.js 22.12 or newer, then start again." }

$line = Get-Content -LiteralPath 'launcher/node-runtime.sha256' | Where-Object { $_ -match "-win-$arch\.zip\s*$" } | Select-Object -First 1
if (-not $line) { Fail 'BOOT-INTEGRITY' "launcher/node-runtime.sha256 has no entry for win-$arch." }
$sum, $archive = $line.Trim() -split '\s+'
$name = $archive -replace '\.zip$', ''
$version = ($name -split '-')[1]
$runtime = Join-Path $env:LOCALAPPDATA 'gsnv-paint\runtime'
$nodeHome = Join-Path $runtime $name
$node = Join-Path $nodeHome 'node.exe'

if (-not ((Test-Path -LiteralPath $node) -and (Usable $node))) {
  Write-Host "Downloading Node.js $version for gsnv-paint. This happens once and needs a network connection..."
  $partial = Join-Path $runtime 'partial'
  try {
    if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Recurse -Force }
    New-Item -ItemType Directory -Path $partial -Force | Out-Null
  } catch { Fail 'BOOT-PERMISSION' "Cannot write to $runtime." }
  $zip = Join-Path $partial $archive
  $source = "https://nodejs.org/dist/$version/$archive"
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -UseBasicParsing -Uri $source -OutFile $zip
  } catch { Fail 'BOOT-NETWORK' "Could not download $source. Check the network connection, then start again. ($($_.Exception.Message))" }
  if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $sum) {
    Remove-Item -LiteralPath $partial -Recurse -Force
    Fail 'BOOT-INTEGRITY' 'The downloaded Node.js archive does not match its pinned checksum and was deleted. Start again; if this repeats, stop and report it.'
  }
  try {
    Expand-Archive -LiteralPath $zip -DestinationPath $partial
    if (Test-Path -LiteralPath $nodeHome) { Remove-Item -LiteralPath $nodeHome -Recurse -Force }
    Move-Item -LiteralPath (Join-Path $partial $name) -Destination $nodeHome
    Remove-Item -LiteralPath $partial -Recurse -Force
  } catch { Fail 'BOOT-DISK' "Could not unpack Node.js into $runtime. Check free disk space. ($($_.Exception.Message))" }
  if (-not (Usable $node)) { Fail 'LAUNCH-PLATFORM' 'The downloaded Node.js does not run on this system. Install Node.js 22.12 or newer, then start again.' }
}

$env:Path = "$nodeHome;$env:Path"
& $node launcher/start.mjs @args
exit $LASTEXITCODE
