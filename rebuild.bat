@echo off
setlocal EnableExtensions

rem Grok Forge rebuild script (ASCII-only for cmd.exe compatibility)
rem Double-click to rebuild, or: rebuild.bat /launch

set "ROOT=%~dp0"
set "DESKTOP=%ROOT%apps\desktop"
set "ENTRY=%ROOT%Grok Forge.exe"

echo.
echo ========================================
echo   Grok Forge rebuild
echo ========================================
echo   Root:    %ROOT%
echo   Desktop: %DESKTOP%
echo.

if not exist "%DESKTOP%\package.json" (
  echo [ERROR] Missing apps\desktop\package.json
  echo         Put this bat in the repo root next to the apps folder.
  goto fail
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found. Install Node.js and add it to PATH.
  goto fail
)

echo [1/3] Stopping running Grok Forge processes...
taskkill /F /IM "Grok Forge.exe" >nul 2>&1
taskkill /F /IM "grok-forge-desktop.exe" >nul 2>&1
timeout /t 1 /nobreak >nul

echo [2/3] Running npm run desktop:publish ...
echo       Frontend build + Rust release + copy exe. This may take a few minutes.
echo.
pushd "%DESKTOP%"
call npm run desktop:publish
set "BUILD_EXIT=%ERRORLEVEL%"
popd

if not "%BUILD_EXIT%"=="0" (
  echo.
  echo [ERROR] Build failed, exit code: %BUILD_EXIT%
  goto fail
)

if not exist "%ENTRY%" (
  echo.
  echo [ERROR] Build finished but exe not found:
  echo         %ENTRY%
  goto fail
)

echo.
echo [3/3] Done
echo ========================================
echo   App:
echo     %ENTRY%
echo     %ROOT%grok-forge-desktop.exe
if exist "%ROOT%dist\Grok Forge_0.1.0_x64-setup.exe" (
  echo   Installer:
  echo     %ROOT%dist\Grok Forge_0.1.0_x64-setup.exe
)
echo ========================================
echo.
echo Close old windows, then open "Grok Forge.exe".
echo.

if /I "%~1"=="/launch" (
  echo Launching...
  start "" "%ENTRY%"
)

if /I "%~1"=="" pause
exit /b 0

:fail
echo.
pause
exit /b 1
