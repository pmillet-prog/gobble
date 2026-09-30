$ErrorActionPreference = 'Stop'
$mediaRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$mediaJdk = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { Join-Path $env:USERPROFILE '.bubblewrap/jdk/jdk-17.0.11+9' }
$mediaRun = Join-Path $mediaRoot ('.tmp/native-media-tests/' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $mediaRun -Force | Out-Null
& (Join-Path $mediaJdk 'bin/javac.exe') -d $mediaRun (Join-Path $mediaRoot 'android-hybrid/app/src/main/java/fr/gobble/hybrid/MediaCache.java') (Join-Path $mediaRoot 'android-hybrid/tests/MediaCacheTest.java')
if ($LASTEXITCODE -ne 0) { throw 'Native media compilation failed' }
& (Join-Path $mediaJdk 'bin/java.exe') -cp $mediaRun fr.gobble.hybrid.MediaCacheTest (Join-Path $mediaRun 'cache')
if ($LASTEXITCODE -ne 0) { throw 'Native media checks failed' }
# Only this invocation's generated directory is removed.
if ([IO.Path]::GetFullPath($mediaRun).StartsWith((Join-Path $mediaRoot '.tmp/native-media-tests') + [IO.Path]::DirectorySeparatorChar)) {
    Remove-Item -LiteralPath $mediaRun -Recurse -Force
}
