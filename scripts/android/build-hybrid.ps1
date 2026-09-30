param([switch]$SkipWebBundle, [switch]$Offline)
$ErrorActionPreference = 'Stop'
$hybridRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$hybridProject = Join-Path $hybridRoot 'android-hybrid'
if (-not $env:JAVA_HOME) {
    $hybridJdk = Join-Path $env:USERPROFILE '.bubblewrap/jdk/jdk-17.0.11+9'
    if (Test-Path -LiteralPath $hybridJdk) { $env:JAVA_HOME = $hybridJdk }
}
if (-not $env:ANDROID_HOME) {
    $hybridSdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
    if (Test-Path -LiteralPath $hybridSdk) { $env:ANDROID_HOME = $hybridSdk }
}
Push-Location $hybridRoot
try {
    if (-not $SkipWebBundle) {
        & node scripts/android/prepare-hybrid.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Hybrid web bundle failed' }
    }
    $hybridGradleArgs = @('-p', $hybridProject, ':app:assembleDebug', ':app:lintDebug', '--console=plain')
    if ($Offline) { $hybridGradleArgs += '--offline' }
    & (Join-Path $hybridProject 'gradlew.bat') @hybridGradleArgs
    if ($LASTEXITCODE -ne 0) { throw 'Hybrid Android build failed' }
    Write-Output (Join-Path $hybridProject 'app/build/outputs/apk/debug/app-debug.apk')
} finally { Pop-Location }
