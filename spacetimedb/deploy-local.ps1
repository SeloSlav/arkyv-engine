$ErrorActionPreference = 'Stop'
$modulePath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $modulePath '..'))
$outDir = Join-Path $projectRoot 'generated'
$spacetime = Join-Path $env:LOCALAPPDATA 'SpacetimeDB\bin\2.0.1\spacetimedb-cli.exe'

if (-not (Test-Path -LiteralPath $spacetime)) {
  throw 'SpacetimeDB CLI not found. Install SpacetimeDB 2.0.1 first.'
}

& $spacetime publish --no-config -p $modulePath arkyv-engine -y
if ($LASTEXITCODE -ne 0) { throw 'SpacetimeDB publish failed.' }

& $spacetime generate --no-config --include-private -p $modulePath -l typescript -o $outDir -y
if ($LASTEXITCODE -ne 0) { throw 'SpacetimeDB binding generation failed.' }

Write-Host 'Published arkyv-engine and regenerated TypeScript bindings.' -ForegroundColor Green
