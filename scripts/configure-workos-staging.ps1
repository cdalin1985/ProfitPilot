[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^client_[A-Za-z0-9]+$')]
  [string]$ClientId,

  [Parameter(DontShow = $true)]
  [securestring]$ApiKey
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$examplePath = Join-Path $repositoryRoot '.env.example'
$environmentPath = Join-Path $repositoryRoot '.env'

if (-not [System.IO.File]::Exists($examplePath)) {
  throw "The environment template was not found at $examplePath"
}

if (-not [System.IO.File]::Exists($environmentPath)) {
  [System.IO.File]::Copy($examplePath, $environmentPath)
}

$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)

function Get-EnvironmentValue {
  param([Parameter(Mandatory = $true)][string]$Name)

  $content = [System.IO.File]::ReadAllText($environmentPath)
  $match = [regex]::Match($content, "(?m)^$([regex]::Escape($Name))=(.*)$")
  if ($match.Success) {
    return $match.Groups[1].Value.Trim()
  }

  return ''
}

function Set-EnvironmentValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value
  )

  if ($Value.Contains("`r") -or $Value.Contains("`n")) {
    throw "$Name cannot contain a newline"
  }

  $content = [System.IO.File]::ReadAllText($environmentPath)
  $pattern = "(?m)^$([regex]::Escape($Name))=.*$"
  $line = "$Name=$Value"

  if ([regex]::IsMatch($content, $pattern)) {
    $content = [regex]::Replace($content, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $line }, 1)
  }
  else {
    if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) {
      $content += [Environment]::NewLine
    }
    $content += $line + [Environment]::NewLine
  }

  [System.IO.File]::WriteAllText($environmentPath, $content, $utf8WithoutBom)
}

function New-RandomSecret {
  $bytes = [byte[]]::new(32)
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }

  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

Set-EnvironmentValue -Name 'AUTH_MODE' -Value 'oidc'
Set-EnvironmentValue -Name 'AUTH_JWKS_URL' -Value "https://api.workos.com/sso/jwks/$ClientId"
Set-EnvironmentValue -Name 'AUTH_ISSUER' -Value 'https://api.workos.com'
Set-EnvironmentValue -Name 'AUTH_AUDIENCE' -Value 'urn:profit-pilot:control-plane'
Set-EnvironmentValue -Name 'WORKOS_CLIENT_ID' -Value $ClientId
Set-EnvironmentValue -Name 'NEXT_PUBLIC_WORKOS_REDIRECT_URI' -Value 'http://localhost:3000/auth/callback'
Set-EnvironmentValue -Name 'WORKOS_OWNER_ROLE_SLUG' -Value 'admin'

if ([string]::IsNullOrWhiteSpace((Get-EnvironmentValue -Name 'WORKOS_API_KEY'))) {
  if ($null -eq $ApiKey) {
    $ApiKey = Read-Host 'Paste the WorkOS staging API key' -AsSecureString
  }
  $apiKeyPointer = [IntPtr]::Zero
  try {
    $apiKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ApiKey)
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($apiKeyPointer)
    if ($apiKey -notmatch '^sk_') {
      throw 'The WorkOS API key must start with sk_'
    }
    Set-EnvironmentValue -Name 'WORKOS_API_KEY' -Value $apiKey
  }
  finally {
    $apiKey = $null
    if ($apiKeyPointer -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($apiKeyPointer)
    }
  }
}

if ([string]::IsNullOrWhiteSpace((Get-EnvironmentValue -Name 'WORKOS_COOKIE_PASSWORD'))) {
  Set-EnvironmentValue -Name 'WORKOS_COOKIE_PASSWORD' -Value (New-RandomSecret)
}

if ([string]::IsNullOrWhiteSpace((Get-EnvironmentValue -Name 'AUDIT_IP_HASH_KEY'))) {
  Set-EnvironmentValue -Name 'AUDIT_IP_HASH_KEY' -Value (New-RandomSecret)
}

Write-Host 'WorkOS staging configuration is ready in the ignored root .env file.'
Write-Host 'Secret values were not printed. Start the stack with: pnpm dev'
