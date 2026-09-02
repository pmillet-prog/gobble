@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"

echo === 1) GOBBLE: commit + push ===

git add -A
if !errorlevel! neq 0 (
  echo ERREUR: git add a echoue. Verifie notamment la presence de .git\index.lock
  pause
  exit /b 1
)

REM Si rien n'a change, on skip le commit
git diff --cached --quiet
set "DIFF_EXIT=!errorlevel!"
if "!DIFF_EXIT!"=="0" (
  echo Rien a commit.
) else if "!DIFF_EXIT!"=="1" (
  set "MSG=%*"
  if "!MSG!"=="" set "MSG=update"
  git commit -m "!MSG!"
  if !errorlevel! neq 0 (
    echo ERREUR: git commit a echoue
    pause
    exit /b 1
  )
) else (
  echo ERREUR: impossible de verifier les changements Git
  pause
  exit /b 1
)

git push origin HEAD:main
if !errorlevel! neq 0 (
  echo ERREUR: git push a echoue
  pause
  exit /b 1
)

echo === 2) VM: pull + build + restart ===
set "VM_LOG=%~dp0deploy-vm.log"
set "VM_CMD=cd ~/gobble_git && (GIT_TERMINAL_PROMPT=0 git -c http.version=HTTP/1.1 fetch origin || (echo WARN: git fetch a echoue, nouvel essai dans 3 secondes... && sleep 3 && GIT_TERMINAL_PROMPT=0 git -c http.version=HTTP/1.1 fetch origin) || (echo WARN: git fetch a encore echoue, dernier essai dans 8 secondes... && sleep 8 && GIT_TERMINAL_PROMPT=0 git -c http.version=HTTP/1.1 fetch origin)) && git reset --hard origin/main && git clean -fd -e data/ -e server/data/ -e server/data-runtime/ && bash scripts/vm_update.sh"

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
