@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "VM_USER=freebox"
set "VM_HOST=192.168.1.84"
set "REMOTE_HOME=/home/freebox"
set "ARCHIVE=%TEMP%\gobble-upload-%RANDOM%%RANDOM%.tar.gz"
set "VM_LOG=%~dp0deploy-vm.log"

if not exist "%~dp0deploy-tools\deploy_remote.sh" (
  echo ERREUR: deploy-tools\deploy_remote.sh introuvable.
  pause
  exit /b 1
)
if not exist "%~dp0deploy-tools\vm_build.sh" (
  echo ERREUR: deploy-tools\vm_build.sh introuvable.
  pause
  exit /b 1
)

echo === 1) Mise a jour majeure: preparation de l'archive locale SANS GIT ===
if exist "%ARCHIVE%" del /q "%ARCHIVE%" >nul 2>&1

tar -czf "%ARCHIVE%" ^
  --exclude=.git ^
  --exclude=node_modules ^
  --exclude=server/node_modules ^
  --exclude=dist ^
  --exclude=server/data-runtime ^
  --exclude=server/data/gobble.db ^
  --exclude=server/data/daily ^
  --exclude=server/data/weekly-stats.json ^
  --exclude=server/data/team-duel.json ^
  --exclude=server/data/install-aliases.json ^
  --exclude=data/playtime-limits.json ^
  --exclude=data/*.sqlite ^
  --exclude=data/*.sqlite-* ^
  --exclude=data/*.db ^
  --exclude=data/*.db-* ^
  --exclude=server/data/*.sqlite ^
  --exclude=server/data/*.sqlite-* ^
  --exclude=server/data/*.db ^
  --exclude=server/data/*.db-* ^
  --exclude=.env ^
  --exclude=.env.* ^
  --exclude=server/.env ^
  --exclude=server/.env.* ^
  --exclude=deploy-tools ^
  --exclude=deploy-vm.log ^
  --exclude=gobble-upload-*.tar.gz ^
  .
if errorlevel 1 (
  echo ERREUR: creation de l'archive impossible.
  if exist "%ARCHIVE%" del /q "%ARCHIVE%" >nul 2>&1
  pause
  exit /b 1
)

echo === 2) Envoi vers la VM ===
scp -o BatchMode=yes -o ConnectTimeout=20 "%ARCHIVE%" %VM_USER%@%VM_HOST%:%REMOTE_HOME%/gobble_upload.tar.gz
if errorlevel 1 goto :upload_error

scp -o BatchMode=yes -o ConnectTimeout=20 "%~dp0deploy-tools\deploy_remote.sh" %VM_USER%@%VM_HOST%:%REMOTE_HOME%/deploy_gobble.sh
if errorlevel 1 goto :upload_error

scp -o BatchMode=yes -o ConnectTimeout=20 "%~dp0deploy-tools\vm_build.sh" %VM_USER%@%VM_HOST%:%REMOTE_HOME%/gobble_vm_build.sh
if errorlevel 1 goto :upload_error

del /q "%ARCHIVE%" >nul 2>&1

echo === 3) Build + bascule + verification ===
ssh -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=10 -o ServerAliveCountMax=12 %VM_USER%@%VM_HOST% "chmod +x %REMOTE_HOME%/deploy_gobble.sh %REMOTE_HOME%/gobble_vm_build.sh && %REMOTE_HOME%/deploy_gobble.sh" > "%VM_LOG%" 2>&1
set "VM_EXIT=!errorlevel!"

type "%VM_LOG%"

if not "!VM_EXIT!"=="0" (
  echo.
  echo ERREUR: deploiement VM echoue.
  echo L'ancienne version a ete redemarree ou restauree automatiquement si possible.
  echo Voir le log complet: %VM_LOG%
  pause
  exit /b 1
)

echo.
echo === OK: Gobble deploye SANS GIT ===
echo Une sauvegarde de la version precedente est conservee sur la VM dans ~/gobble_backup
pause
exit /b 0

:upload_error
echo ERREUR: envoi vers la VM impossible.
if exist "%ARCHIVE%" del /q "%ARCHIVE%" >nul 2>&1
paUSE
exit /b 1
