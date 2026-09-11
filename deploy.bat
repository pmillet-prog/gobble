@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "VM_LOG=%~dp0deploy-vm.log"

if not exist "%~dp0scripts\deploy_git.sh" (
  echo ERREUR: scripts\deploy_git.sh introuvable.
  pause
  exit /b 1
)

echo === 1) GOBBLE: commit + push ===
git add -A
if errorlevel 1 (
  echo ERREUR: git add a echoue. Verifie notamment .git\index.lock
  pause
  exit /b 1
)

git diff --cached --quiet
set "DIFF_EXIT=!errorlevel!"
if "!DIFF_EXIT!"=="0" (
  echo Rien a commit.
) else if "!DIFF_EXIT!"=="1" (
  set "MSG=%*"
  if "!MSG!"=="" set "MSG=update"
  git commit -m "!MSG!"
  if errorlevel 1 (
    echo ERREUR: git commit a echoue.
    pause
    exit /b 1
  )
) else (
  echo ERREUR: impossible de verifier les changements Git.
  pause
  exit /b 1
)

git push origin HEAD:main
if errorlevel 1 (
  echo ERREUR: git push a echoue.
  pause
  exit /b 1
)

echo === 2) VM: mise a jour Git + build + redemarrage ===
ssh -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=10 -o ServerAliveCountMax=12 freebox@192.168.1.84 "bash -s" < "%~dp0scripts\deploy_git.sh" > "%VM_LOG%" 2>&1
set "VM_EXIT=!errorlevel!"
type "%VM_LOG%"
if not "!VM_EXIT!"=="0" (
  echo ERREUR: mise a jour VM echouee.
  echo Voir le log complet: %VM_LOG%
  pause
  exit /b 1
)

echo === OK: local push + VM updated ===
pause
exit /b 0
