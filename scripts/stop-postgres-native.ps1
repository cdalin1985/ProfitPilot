[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pgControlPath = Join-Path $repositoryRoot '.data\postgresql-17.10-2\pgsql\bin\pg_ctl.exe'
$clusterPath = Join-Path $repositoryRoot '.data\postgres17'

if (-not (Test-Path -LiteralPath $pgControlPath)) {
  Write-Host 'Native PostgreSQL is not installed for this checkout.'
  exit 0
}
if (-not (Test-Path -LiteralPath (Join-Path $clusterPath 'PG_VERSION'))) {
  Write-Host 'Native PostgreSQL has not been initialized for this checkout.'
  exit 0
}

& $pgControlPath -D $clusterPath status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Native PostgreSQL is already stopped.'
  exit 0
}

& $pgControlPath -D $clusterPath -m fast -w stop
if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL pg_ctl exited with code $LASTEXITCODE"
}

Write-Host 'Native PostgreSQL stopped cleanly.'
