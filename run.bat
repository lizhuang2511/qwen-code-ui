@echo off
REM Switch to the script's directory
cd /d "%~dp0"

REM Activate the conda environment
call conda activate python312
if errorlevel 1 (
    echo Failed to activate conda environment 'pyqtchat'.
    echo Please ensure conda is in your PATH or run this from an Anaconda Prompt.
    pause
    exit /b 1
)

REM Run the Python script
python start.py
