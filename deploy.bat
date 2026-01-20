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

git push
if !errorlevel! neq 0 (
  echo ERREUR: git push a echoue
  pause
  exit /b 1
)

echo === 2) VM: pull + build + restart ===
ssh freebox@192.168.1.84 "cd ~/gobble_git && git fetch origin && git reset --hard origin/main && git clean -fd -e server/data-runtime/ -e server/data/gobble.db && bash scripts/vm_update.sh"


if !errorlevel! neq 0 (
  echo ERREUR: update VM a echoue
  pause
  exit /b 1
)

echo === OK: local push + VM updated ===
pause
