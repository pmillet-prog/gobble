@echo off
setlocal
set LOG=%~dp0..\server\logs\connections.log

if not exist "%LOG%" (
  echo No log yet: "%LOG%"
  echo (Start the server and login at least once.)
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Path '%LOG%' -Tail 200"
