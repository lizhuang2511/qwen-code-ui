@echo off
cd /d "%~dp0"
python -m pytest -s -vv test
pause
