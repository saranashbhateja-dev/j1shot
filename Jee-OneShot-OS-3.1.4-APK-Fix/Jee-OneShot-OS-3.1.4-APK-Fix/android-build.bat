@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (echo Node.js 22+ is required.& pause & exit /b 1)
if not exist node_modules (
  echo Installing Android wrapper dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)
echo Preparing mobile web assets...
if exist www rmdir /s /q www
mkdir www
copy /y index.html www\index.html >nul
copy /y app.js www\app.js >nul
copy /y one-shots.json www\one-shots.json >nul
echo Syncing Android project...
if not exist android call npx cap add android
if errorlevel 1 exit /b 1
call npx cap sync android
if errorlevel 1 exit /b 1
cd android
call gradlew.bat assembleDebug
if errorlevel 1 exit /b 1
cd ..
echo.
echo APK created at:
echo android\app\build\outputs\apk\debug\app-debug.apk
endlocal
