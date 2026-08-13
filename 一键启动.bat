@echo off
setlocal
title AI Chater Launcher

cd /d "%~dp0"
set "APP_URL=http://localhost:3000"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 24 or newer, then run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo package.json was not found. Run this file from the AI-Chater project folder.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing project dependencies...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } exit 1"
if errorlevel 1 (
  echo Starting AI Chater server...
  start "AI Chater Server" /D "%~dp0" cmd /k "npm run dev"
)

echo Waiting for AI Chater...
set /a ATTEMPTS=0
:wait_for_server
powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing '%APP_URL%' -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } } catch {} exit 1"
if not errorlevel 1 goto open_browser

set /a ATTEMPTS+=1
if %ATTEMPTS% GEQ 30 (
  echo The server did not respond within 30 seconds. Check the AI Chater Server window.
  pause
  exit /b 1
)

timeout /t 1 /nobreak >nul
goto wait_for_server

:open_browser
start "" "%APP_URL%"
echo AI Chater is ready: %APP_URL%
timeout /t 2 /nobreak >nul
exit /b 0
