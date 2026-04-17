@echo off
setlocal

cd /d "%~dp0"

set "PORT=5500"
set "URL=http://localhost:%PORT%/"

where py >nul 2>nul
if %errorlevel%==0 (
  start "EchoAI Remix Server" cmd /k "cd /d ""%~dp0"" && py -m http.server %PORT%"
  timeout /t 2 /nobreak >nul
  start "" "%URL%"
  exit /b 0
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "EchoAI Remix Server" cmd /k "cd /d ""%~dp0"" && python -m http.server %PORT%"
  timeout /t 2 /nobreak >nul
  start "" "%URL%"
  exit /b 0
)

echo Python was not found.
echo Install Python or make sure "py" or "python" is available in PATH.
pause
