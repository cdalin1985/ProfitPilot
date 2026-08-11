[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$postgresDistribution = '17.10-2'
$archiveName = "postgresql-$postgresDistribution-windows-x64-binaries.zip"
$archiveUrl = "https://get.enterprisedb.com/postgresql/$archiveName"
$archiveSha256 = 'EF9B1E5E23D2E8A83914BA13D9DC536A72210FBA53FD1808FF1F7E06BB22B106'
$databasePort = 5432
$databaseName = 'profit_pilot'
$adminRole = 'profit_pilot_admin'
$adminPassword = 'profit_pilot_admin_local'

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dataRoot = Join-Path $repositoryRoot '.data'
$archivePath = Join-Path $dataRoot $archiveName
$downloadPath = "$archivePath.download"
$distributionRoot = Join-Path $dataRoot "postgresql-$postgresDistribution"
$postgresRoot = Join-Path $distributionRoot 'pgsql'
$postgresBin = Join-Path $postgresRoot 'bin'
$clusterPath = Join-Path $dataRoot 'postgres17'
$serverLogPath = Join-Path $dataRoot 'postgres17.log'
$initSqlPath = Join-Path $repositoryRoot 'scripts\postgres\init.sql'

$initdbPath = Join-Path $postgresBin 'initdb.exe'
$pgControlPath = Join-Path $postgresBin 'pg_ctl.exe'
$psqlPath = Join-Path $postgresBin 'psql.exe'
$snowballLibraryPath = Join-Path $postgresRoot 'lib\dict_snowball.dll'

function Assert-ArchiveHash {
  param([Parameter(Mandatory = $true)][string]$Path)

  $actualHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  if ($actualHash -cne $archiveSha256) {
    throw "PostgreSQL archive checksum mismatch at $Path"
  }
}

function Test-ClusterRunning {
  if (-not (Test-Path -LiteralPath $pgControlPath)) {
    return $false
  }
  if (-not (Test-Path -LiteralPath (Join-Path $clusterPath 'PG_VERSION'))) {
    return $false
  }

  & $pgControlPath -D $clusterPath status *> $null
  return $LASTEXITCODE -eq 0
}

function Invoke-PostgresCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$Command
  )

  & $psqlPath `
    --host=127.0.0.1 `
    --port=$databasePort `
    --username=$adminRole `
    --dbname=$Database `
    --set=ON_ERROR_STOP=1 `
    --command=$Command
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL command failed against database $Database"
  }
}

if ($env:OS -ne 'Windows_NT') {
  throw 'The native PostgreSQL helper currently supports Windows only.'
}

[void][System.IO.Directory]::CreateDirectory($dataRoot)

if (-not (Test-Path -LiteralPath $archivePath)) {
  if (Test-Path -LiteralPath $downloadPath) {
    Remove-Item -LiteralPath $downloadPath -Force
  }

  try {
    Write-Host "Downloading PostgreSQL $postgresDistribution from EDB..."
    Invoke-WebRequest -Uri $archiveUrl -OutFile $downloadPath -UseBasicParsing
    Assert-ArchiveHash -Path $downloadPath
    Move-Item -LiteralPath $downloadPath -Destination $archivePath
  }
  finally {
    if (Test-Path -LiteralPath $downloadPath) {
      Remove-Item -LiteralPath $downloadPath -Force
    }
  }
}
else {
  Assert-ArchiveHash -Path $archivePath
}

if (-not (Test-Path -LiteralPath $distributionRoot)) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $distributionPrefix = [System.IO.Path]::GetFullPath($distributionRoot) + [System.IO.Path]::DirectorySeparatorChar
  $archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    foreach ($entry in $archive.Entries) {
      $entryPath = [System.IO.Path]::GetFullPath((Join-Path $distributionRoot $entry.FullName))
      if (-not $entryPath.StartsWith($distributionPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'The PostgreSQL archive contains an unsafe path.'
      }
    }
  }
  finally {
    $archive.Dispose()
  }

  Write-Host 'Extracting the verified PostgreSQL archive...'
  [System.IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $distributionRoot)
}

if (-not (Test-Path -LiteralPath $initdbPath)) {
  throw "PostgreSQL initdb was not found at $initdbPath"
}
if (-not (Test-Path -LiteralPath $snowballLibraryPath)) {
  throw "PostgreSQL extension library was not found at $snowballLibraryPath"
}

if (-not (Test-Path -LiteralPath (Join-Path $clusterPath 'PG_VERSION'))) {
  if (Test-Path -LiteralPath $clusterPath) {
    $existingClusterItems = Get-ChildItem -LiteralPath $clusterPath -Force
    if ($existingClusterItems.Count -gt 0) {
      throw "The PostgreSQL data directory is non-empty but uninitialized: $clusterPath"
    }
  }

  $temporaryBasePath = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $passwordFilePath = [System.IO.Path]::GetFullPath(
    (Join-Path $temporaryBasePath "profit-pilot-pg-$([guid]::NewGuid().ToString('N')).tmp")
  )
  if (-not $passwordFilePath.StartsWith($temporaryBasePath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to create the PostgreSQL password file outside the system temporary directory.'
  }

  try {
    [System.IO.File]::WriteAllText(
      $passwordFilePath,
      $adminPassword,
      [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host 'Initializing the local PostgreSQL cluster...'
    & $initdbPath `
      --pgdata=$clusterPath `
      --username=$adminRole `
      --pwfile=$passwordFilePath `
      --auth-local=scram-sha-256 `
      --auth-host=scram-sha-256 `
      --encoding=UTF8
    if ($LASTEXITCODE -ne 0) {
      throw "PostgreSQL initdb exited with code $LASTEXITCODE"
    }
  }
  finally {
    if (Test-Path -LiteralPath $passwordFilePath) {
      Remove-Item -LiteralPath $passwordFilePath -Force
    }
  }
}

if (-not (Test-ClusterRunning)) {
  $existingListener = Get-NetTCPConnection -State Listen -LocalPort $databasePort -ErrorAction SilentlyContinue
  if ($existingListener) {
    throw "Port $databasePort is already in use by another process."
  }

  Write-Host 'Starting native PostgreSQL on 127.0.0.1:5432...'
  & $pgControlPath `
    -D $clusterPath `
    -l $serverLogPath `
    -o "-h 127.0.0.1 -p $databasePort" `
    -w `
    start
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL pg_ctl exited with code $LASTEXITCODE"
  }
}

$previousPgPassword = $env:PGPASSWORD
$previousAdminUrl = $env:DATABASE_ADMIN_URL
try {
  $env:PGPASSWORD = $adminPassword

  $databaseExistsOutput = & $psqlPath `
    --host=127.0.0.1 `
    --port=$databasePort `
    --username=$adminRole `
    --dbname=postgres `
    --tuples-only `
    --no-align `
    --set=ON_ERROR_STOP=1 `
    --command="SELECT 1 FROM pg_database WHERE datname = '$databaseName';"
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to inspect the local PostgreSQL databases.'
  }
  $databaseExists = $databaseExistsOutput | Where-Object { $_.Trim() -eq '1' } | Select-Object -First 1
  if (-not $databaseExists) {
    Invoke-PostgresCommand -Database 'postgres' -Command "CREATE DATABASE $databaseName OWNER $adminRole;"
  }

  $applicationRoleOutput = & $psqlPath `
    --host=127.0.0.1 `
    --port=$databasePort `
    --username=$adminRole `
    --dbname=$databaseName `
    --tuples-only `
    --no-align `
    --set=ON_ERROR_STOP=1 `
    --command="SELECT 1 FROM pg_roles WHERE rolname = 'profit_pilot_app';"
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to inspect the local PostgreSQL roles.'
  }
  $applicationRoleExists = $applicationRoleOutput | Where-Object { $_.Trim() -eq '1' } | Select-Object -First 1
  if (-not $applicationRoleExists) {
    & $psqlPath `
      --host=127.0.0.1 `
      --port=$databasePort `
      --username=$adminRole `
      --dbname=$databaseName `
      --set=ON_ERROR_STOP=1 `
      --file=$initSqlPath
    if ($LASTEXITCODE -ne 0) {
      throw 'Failed to create the ProfitPilot application database role.'
    }
  }

  $env:DATABASE_ADMIN_URL = 'postgresql://profit_pilot_admin:profit_pilot_admin_local@127.0.0.1:5432/profit_pilot'
  Push-Location $repositoryRoot
  try {
    & pnpm --filter '@profit-pilot/db' db:migrate
    if ($LASTEXITCODE -ne 0) {
      throw "Database migrations exited with code $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }
}
finally {
  $env:PGPASSWORD = $previousPgPassword
  $env:DATABASE_ADMIN_URL = $previousAdminUrl
}

Write-Host 'Native PostgreSQL is ready, and ProfitPilot migrations are current.'
