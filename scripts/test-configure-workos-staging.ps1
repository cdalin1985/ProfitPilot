[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceScriptPath = Join-Path $PSScriptRoot 'configure-workos-staging.ps1'
$sourceExamplePath = Join-Path $repositoryRoot '.env.example'
$temporaryBasePath = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$temporaryRoot = [System.IO.Path]::GetFullPath(
  (Join-Path $temporaryBasePath ("ProfitPilot-WorkOS-Test-$([guid]::NewGuid().ToString('N'))"))
)

if (-not $temporaryRoot.StartsWith($temporaryBasePath, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to use a temporary test directory outside the system temporary directory.'
}

function Assert-Equal {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Actual,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Expected,
    [Parameter(Mandatory = $true)][string]$Description
  )

  if ($Actual -cne $Expected) {
    throw "$Description did not match the expected value."
  }
}

try {
  $temporaryScriptsPath = Join-Path $temporaryRoot 'scripts'
  [void][System.IO.Directory]::CreateDirectory($temporaryScriptsPath)
  [System.IO.File]::Copy(
    $sourceScriptPath,
    (Join-Path $temporaryScriptsPath 'configure-workos-staging.ps1')
  )
  [System.IO.File]::Copy($sourceExamplePath, (Join-Path $temporaryRoot '.env.example'))

  $fakeApiKeyPlaintext = 'sk_test_regression_only_not_a_real_credential'
  $fakeApiKey = ConvertTo-SecureString $fakeApiKeyPlaintext -AsPlainText -Force
  & (Join-Path $temporaryScriptsPath 'configure-workos-staging.ps1') `
    -ClientId 'client_REGRESSION123' `
    -ProvidedApiKey $fakeApiKey

  $values = @{}
  foreach ($line in [System.IO.File]::ReadAllLines((Join-Path $temporaryRoot '.env'))) {
    if ($line -match '^([^#=]+)=(.*)$') {
      $values[$matches[1]] = $matches[2]
    }
  }

  Assert-Equal $values['AUTH_MODE'] 'oidc' 'AUTH_MODE'
  Assert-Equal $values['AUTH_AUDIENCE'] 'urn:profit-pilot:control-plane' 'AUTH_AUDIENCE'
  Assert-Equal $values['WORKOS_CLIENT_ID'] 'client_REGRESSION123' 'WORKOS_CLIENT_ID'
  Assert-Equal $values['WORKOS_API_KEY'] $fakeApiKeyPlaintext 'WORKOS_API_KEY'

  if ($values['WORKOS_COOKIE_PASSWORD'] -notmatch '^[A-Za-z0-9_-]{43}$') {
    throw 'WORKOS_COOKIE_PASSWORD was not generated as a 256-bit base64url secret.'
  }
  if ($values['AUDIT_IP_HASH_KEY'] -notmatch '^[A-Za-z0-9_-]{43}$') {
    throw 'AUDIT_IP_HASH_KEY was not generated as a 256-bit base64url secret.'
  }

  Write-Host 'WorkOS staging configuration regression test passed.'
}
finally {
  $fakeApiKeyPlaintext = $null
  $temporaryLeafName = [System.IO.Path]::GetFileName($temporaryRoot)
  if (
    [System.IO.Directory]::Exists($temporaryRoot) -and
    $temporaryRoot.StartsWith($temporaryBasePath, [System.StringComparison]::OrdinalIgnoreCase) -and
    $temporaryLeafName -like 'ProfitPilot-WorkOS-Test-*'
  ) {
    [System.IO.Directory]::Delete($temporaryRoot, $true)
  }
}
