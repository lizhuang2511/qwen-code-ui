@echo off
setlocal enabledelayedexpansion

:: Switch to UTF-8 for better character support
chcp 65001 >nul

cd /d "%~dp0"
echo ==========================================
echo  QWENCODE Quick Startup Script
echo  Steps: Checking Frontend -^> Start Backend
echo ==========================================

set "FRONTEND_DIR=%~dp0frontend"

echo [1/2] Checking frontend build artifacts...
if not exist "%FRONTEND_DIR%\dist\index.html" (
  echo [Error] "%FRONTEND_DIR%\dist\index.html" not found.
  echo It seems the frontend has not been built yet. 
  echo Please run start.bat first or build the frontend manually.
  pause
  exit /b 1
)
echo Frontend build found. Skipping build process.

echo [2/2] Starting application...
where py >nul 2>&1
if !errorlevel! equ 0 (
  py -3 quick_start.py
  goto :eof
)

where python >nul 2>&1
if !errorlevel! equ 0 (
  python quick_start.py
  goto :eof
)

echo [Error] Python 3 not found. Please install Python and add it to PATH.
pause
exit /b 1
