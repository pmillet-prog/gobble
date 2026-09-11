@echo off
setlocal
set "VM_USER=freebox"
set "VM_HOST=192.168.1.84"

echo === ROLLBACK GOBBLE vers la version precedente ===
ssh -o BatchMode=yes -o ConnectTimeout=20 %VM_USER%@%VM_HOST% "/home/freebox/deploy_gobble.sh --rollback"
if errorlevel 1 (
  echo ERREUR: rollback echoue.
  pause
  exit /b 1
)

echo === OK: ancienne version restauree ===
pause
