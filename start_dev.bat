@echo off
setlocal enabledelayedexpansion

:: Switch to UTF-8 for better character support
chcp 65001 >nul

cd /d "%~dp0"
echo ==========================================
echo  QWENCODE Startup Script
echo  Steps: Build Frontend -> Start Backend
echo ==========================================

set "FRONTEND_DIR=%~dp0frontend"

if not exist "%FRONTEND_DIR%\package.json" (
  echo [Error] "%FRONTEND_DIR%\package.json" not found.
  echo Please check if the frontend directory exists.
  pause
  exit /b 1
)

echo [1/3] Installing dependencies and building frontend...

:: Use pushd to change directory
pushd "%FRONTEND_DIR%"
if errorlevel 1 (
    echo [Error] Failed to enter directory "%FRONTEND_DIR%"
    pause
    exit /b 1
)

:: Check for pnpm
where pnpm.cmd >nul 2>&1
if !errorlevel! equ 0 (
  echo Using pnpm...
  call pnpm.cmd install
  if errorlevel 1 goto build_error
  call pnpm.cmd run build
  if errorlevel 1 goto build_error
) else (
  :: Check for npm
  where npm.cmd >nul 2>&1
  if !errorlevel! equ 0 (
    echo pnpm not found, using npm...
    call npm.cmd install
    if errorlevel 1 goto build_error
    call npm.cmd run build
    if errorlevel 1 goto build_error
  ) else (
    echo [Error] Neither pnpm nor npm found. Please install Node.js.
    popd
    pause
    exit /b 1
  )
)

popd

echo [2/3] Checking frontend build artifacts...
if not exist "%FRONTEND_DIR%\dist\index.html" (
  echo [Error] "%FRONTEND_DIR%\dist\index.html" not found.
  echo Build failed. Please check the logs above.
  pause
  exit /b 1
)

echo [3/3] Starting application...
where py >nul 2>&1
if !errorlevel! equ 0 (
  py -3 start.py
  goto :eof
)

where python >nul 2>&1
if !errorlevel! equ 0 (
  python start_dev.py
  goto :eof
)

echo [Error] Python 3 not found. Please install Python and add it to PATH.
pause
exit /b 1

:build_error
echo [Error] Frontend build failed.
popd
pause
exit /b 1
