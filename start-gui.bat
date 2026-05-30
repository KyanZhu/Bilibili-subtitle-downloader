@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Please install Node.js, then run this file again.
  pause
  exit /b 1
)

echo Starting Bilibili Subtitle Downloader GUI...
echo.
echo URL: http://127.0.0.1:4757/
echo Keep this window open while using the app.
echo Use the Stop Service button in the page or close this window to stop it.
echo.

start "" "http://127.0.0.1:4757/"
node bin\gui.js

echo.
echo GUI service stopped.
pause
