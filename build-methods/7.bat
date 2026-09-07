@echo off
cd /d "%~dp07" || (echo CD FAILED & pause & exit /b 1)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js first.
  echo Download: https://nodejs.org/
  pause
  exit /b 1
)

echo ========================================
echo   7. PWA Progressive Web App
echo   Open in browser: http://localhost:3007
echo ========================================
echo.
node server.js

echo.
echo Program exited. Press any key to close...
pause >nul
