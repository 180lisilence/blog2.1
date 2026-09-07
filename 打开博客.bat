@echo off
chcp 65001 >nul
title Blog Server
echo ========================================
echo    Blog Project Center
echo ========================================
echo.

cd /d "%~dp0qrcode-login"

:: ?? server.js
if not exist "server.js" (
    echo [ERROR] server.js not found in %CD%
    pause
    exit
)

:: ????
if not exist "node_modules" (
    echo [WARN] node_modules not found, running npm install...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed
        pause
        exit
    )
)

:: ????? 3000 ??
echo [1/3] Checking port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo   Killing old process PID=%%a
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 >nul
echo   Port ready

:: ???????????????
echo.
echo [2/3] Starting server...
echo   Log file: %CD%\server.log
start "blog-server" /min cmd /c "node server.js > server.log 2>&1"

:: ??????
echo [3/3] Waiting for server...
set /a wait=0
:check
timeout /t 1 >nul
set /a wait+=1
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if not errorlevel 1 goto success
if %wait% lss 15 goto check

:: ????
echo.
echo ========================================
echo   [ERROR] Server failed to start!
echo ========================================
echo.
echo Possible reasons:
echo   1. Node.js not installed
echo   2. Dependencies not installed
echo   3. MySQL not running
echo   4. server.js has syntax error
echo.
echo Check log file for details:
echo   %CD%\server.log
echo.
echo Opening log file...
notepad server.log
echo.
pause
exit

:success
echo   Server started!
echo.
echo Opening browser...
start "" "http://127.0.0.1:3000/"
echo.
echo ========================================
echo   Server is running
echo   URL: http://127.0.0.1:3000/
echo   Health: http://127.0.0.1:3000/health
echo   Log: %CD%\server.log
echo.
echo   Close "blog-server" window to stop
echo ========================================
echo.
timeout /t 3 >nul
exit