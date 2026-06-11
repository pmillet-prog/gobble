@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"

echo === 1) GOBBLE: commit + push ===

git add -A

REM Si rien n'a change, on skip le commit
git diff --cached --quiet
if !errorlevel! == 0 (
  echo Rien a commit.
) else (
  set "MSG=%*"
  if "!MSG!"=="" set "MSG=update"
  git commit -m "!MSG!"
  if !errorlevel! neq 0 (
    echo ERREUR: git commit a echoue
    pause
    exit /b 1
  )
)

git push origin HEAD:main
if !errorlevel! neq 0 (
  echo ERREUR: git push a echoue
  pause
  exit /b 1
)

echo === 2) VM: pull + build + restart ===
set "VM_LOG=%~dp0deploy-vm.log"
set "VM_CMD=cd ~/gobble_git && git fetch origin && git reset --hard origin/main && git clean -fd -e data/ -e server/data/ -e server/data-runtime/ && bash scripts/vm_update.sh"

ssh -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=10 -o ServerAliveCountMax=6 freebox@192.168.1.84 "!VM_CMD!" > "!VM_LOG!" 2>&1
set "VM_EXIT=!errorlevel!"

type "!VM_LOG!"

if !VM_EXIT! neq 0 (
  echo ERREUR: update VM a echoue
  echo Voir le log complet: !VM_LOG!
  pause
  exit /b 1
)

echo === OK: local push + VM updated ===
pause
