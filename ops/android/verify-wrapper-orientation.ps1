param(
  [string]$WrapperRoot = (Join-Path $PSScriptRoot '../../.tmp/wrapp')
)

$ErrorActionPreference = 'Stop'
$orientationRoot = (Resolve-Path -LiteralPath $WrapperRoot).Path
$manifest = Get-Content -LiteralPath (Join-Path $orientationRoot 'twa-manifest.json') -Raw | ConvertFrom-Json
$gradle = [IO.File]::ReadAllText((Join-Path $orientationRoot 'app/build.gradle'))

if ($manifest.orientation -ne 'portrait' -or $gradle -notmatch "orientation:\s*'portrait'") {
  throw 'Le wrapper doit garder portrait comme orientation native par défaut.'
}
if ($gradle -notmatch "versionCode\s*=\s*$($manifest.appVersionCode)\b") {
  throw 'Les codes de version Bubblewrap et Gradle ne correspondent pas.'
}
Write-Output "Configuration Android $($manifest.appVersionName) ($($manifest.appVersionCode)) : portrait par défaut."
Write-Output 'Ce contrôle ne valide ni le binaire publié ni le comportement du téléphone.'
