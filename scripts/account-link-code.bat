@echo off
setlocal EnableExtensions DisableDelayedExpansion

cd /d "%~dp0.."

echo.
echo ==============================
echo  Gobble - Generate Link Code
echo ==============================
echo.
set /p "INSTALL_ID=InstallID: "

if "%INSTALL_ID%"=="" (
  echo.
  echo Error: empty InstallID.
  echo.
  pause
  exit /b 1
)

set "LINK_CODE="
for /f "usebackq delims=" %%A in (`node scripts/account-link-code.js "%INSTALL_ID%" 2^>^&1`) do (
  if not defined LINK_CODE set "LINK_CODE=%%A"
)

if not defined LINK_CODE (
  echo.
  echo Error: unable to generate code.
  echo.
  pause
  exit /b 1
)

echo(%LINK_CODE% | findstr /B /C:"GBL1-" >nul
if errorlevel 1 (
  echo.
  echo Error: %LINK_CODE%
  echo.
  pause
  exit /b 1
)

<nul set /p "=%LINK_CODE%" | clip

echo.
echo Code:
echo %LINK_CODE%
echo.
echo Copied to clipboard.
echo.
pause

