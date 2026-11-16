@echo off
setlocal EnableExtensions EnableDelayedExpansion
title The Good Treasurer

rem ---------------------------------------------------------------------------
rem  One-click launcher for the local app.
rem
rem  Double-click this file: it starts the Vite dev server, waits until the app
rem  answers, and opens http://localhost:5173/ in your browser.
rem
rem  Run "start-app.bat shortcut" once to create a desktop shortcut named
rem  "The Good Treasurer" that launches this file.
rem ---------------------------------------------------------------------------

cd /d "%~dp0"

set "APP_URL=http://localhost:5173/"
set "APP_TITLE=The Good Treasurer"

if /i "%~1"=="shortcut" goto :make_shortcut

echo.
echo   %APP_TITLE% - local launcher
echo   -----------------------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js was not found on your PATH.
  echo       Install Node.js 20 or newer from https://nodejs.org/ and try again.
  echo.
  pause
  exit /b 1
)

where curl.exe >nul 2>nul
if errorlevel 1 (
  echo   [X] curl.exe was not found on your PATH.
  echo       It ships with Windows 10 and 11. Update Windows, or add it to PATH.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo   [..] Installing dependencies with npm ci. This happens only once.
  call npm ci
  if errorlevel 1 (
    echo.
    echo   [X] npm ci failed. Fix the problem shown above and run this file again.
    echo.
    pause
    exit /b 1
  )
  echo   [ok] Dependencies installed.
  echo.
)

rem --- Already running? Then just open it. -----------------------------------
call :is_ready
if "%READY%"=="1" goto :open

rem --- Port taken by something else? ------------------------------------------
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', 5173); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo   [X] Port 5173 is already used by another program.
  echo       Close that program or free the port, then run this file again.
  echo.
  pause
  exit /b 1
)

rem --- Start the dev server in its own window. --------------------------------
echo   [..] Starting the dev server in a new window...
start "%APP_TITLE% - dev server" cmd /k npm run dev -- --port 5173 --strictPort
echo.

echo   [..] Waiting for the app to answer...
set /a tries=0
:wait
call :is_ready
if "%READY%"=="1" goto :open
set /a tries+=1
if !tries! gtr 60 (
  echo.
  echo   [X] The dev server did not answer within 60 seconds.
  echo       Look at the "%APP_TITLE% - dev server" window for the real error.
  echo.
  pause
  exit /b 1
)
ping -n 2 127.0.0.1 >nul
goto :wait

rem --- Open the browser. -------------------------------------------------------
:open
echo   [ok] The app is running at %APP_URL%
start "" "%APP_URL%"
echo.
echo   The dev server keeps running in the "%APP_TITLE% - dev server" window.
echo   To stop the app, close that window or press Ctrl+C inside it.
echo.
ping -n 6 127.0.0.1 >nul
exit /b 0

rem --- Helpers ----------------------------------------------------------------
:is_ready
set "READY="
curl -s -m 2 "%APP_URL%" 2>nul | findstr /c:"<title>%APP_TITLE%</title>" >nul
if not errorlevel 1 set "READY=1"
exit /b 0

:make_shortcut
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$shell = New-Object -ComObject WScript.Shell;" ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$link = $shell.CreateShortcut((Join-Path $desktop '%APP_TITLE%.lnk'));" ^
  "$link.TargetPath = '%~f0';" ^
  "$link.WorkingDirectory = '%~dp0';" ^
  "$link.Description = 'Start The Good Treasurer locally';" ^
  "$link.IconLocation = \"$env:SystemRoot\System32\shell32.dll,13\";" ^
  "$link.Save();" ^
  "Write-Host ('Desktop shortcut created: ' + (Join-Path $desktop '%APP_TITLE%.lnk'))"
if errorlevel 1 (
  echo   [X] Could not create the desktop shortcut.
  pause
  exit /b 1
)
echo   [ok] Desktop shortcut created.
ping -n 3 127.0.0.1 >nul
exit /b 0
