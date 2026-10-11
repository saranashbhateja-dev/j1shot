@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo Starting Jee OneShot OS...
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22+ is required. Install Node.js and run this again.
  pause
  exit /b 1
)

start "Jee OneShot OS Server" /min cmd /c "cd /d ""%~dp0"" && node server.js"

set "READY=0"
for /l %%i in (1,1,30) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 1; if($r.StatusCode -eq 200){$ok=$true} } catch {}; if($ok){exit 0}else{exit 1}"
  if not errorlevel 1 (
    set "READY=1"
    goto ready
  )
  timeout /t 1 /nobreak >nul
)

if "%READY%"=="0" (
  echo.
  echo Jee OneShot OS did not respond on http://127.0.0.1:3001
  echo Check the Jee OneShot OS Server window for the error.
  pause
  exit /b 1
)

:ready
echo Jee OneShot OS is ready. Opening browser...
"%SystemRoot%\explorer.exe" "http://127.0.0.1:3001/"
exit /b 0
