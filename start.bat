@echo off
title BookLeaf Author Portal (dev)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node 22 from https://nodejs.org then run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies, this takes a minute or two...
  call npm install
  if errorlevel 1 (
    echo npm install failed - copy the red text above and send it to Claude.
    pause
    exit /b 1
  )
)
echo.
echo Starting API (http://localhost:4000) and web app (http://localhost:5173)
echo Your browser opens in ~15 seconds. Keep this window open. Close it to stop.
start "" cmd /c "timeout /t 15 >nul & start http://localhost:5173"
call npm run dev
echo.
echo The server stopped. Scroll up for the error, copy it and send it to Claude.
pause
