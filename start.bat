@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem Grok Forge quick start (ASCII-only for cmd.exe compatibility)
rem Double-click to launch, or:
rem   start.bat              smart: fresh exe, else rebuild if needed, else dev
rem   start.bat /exe         only launch packaged exe (may be stale)
rem   start.bat /dev         force native Tauri dev (always latest source)
rem   start.bat /web         force browser Vite preview
rem   start.bat /rebuild     rebuild release then launch exe

set "ROOT=%~dp0"
set "DESKTOP=%ROOT%apps\desktop"
set "MODE=%~1"
if "%MODE%"=="" set "MODE=/auto"

echo.
echo ========================================
echo   Grok Forge quick start
echo ========================================
echo   Root: %ROOT%
echo.

if not exist "%DESKTOP%\package.json" (
  echo [ERROR] Missing apps\desktop\package.json
  echo         Put this bat in the repo root next to the apps folder.
  goto fail
)

if /I "%MODE%"=="/exe" goto launch_exe_only
if /I "%MODE%"=="/dev" goto launch_dev
if /I "%MODE%"=="/web" goto launch_web
if /I "%MODE%"=="/rebuild" goto launch_rebuild
if /I not "%MODE%"=="/auto" (
  echo [ERROR] Unknown option: %MODE%
  echo         Use: start.bat  ^|  /exe  ^|  /dev  ^|  /web  ^|  /rebuild
  goto fail
)

rem ---------- /auto ----------
call :find_exe
if not defined APP_EXE (
  echo [info] No packaged exe found.
  echo        Starting Tauri dev so latest source is used.
  echo.
  goto launch_dev
)

call :source_newer_than_exe
if "!SOURCE_NEWER!"=="1" (
  echo [warn] Source is newer than the packaged exe.
  echo        Exe:     !APP_EXE!
  echo        Changes in apps\desktop\src will NOT appear until rebuild.
  echo.
  echo        Auto mode will rebuild then launch ^(same as /rebuild^).
  echo        Tip: use start.bat /dev for hot-reload, or /exe to force old binary.
  echo.
  goto launch_rebuild
)

echo [info] Packaged exe is up to date.
goto launch_found

:launch_exe_only
call :find_exe
if not defined APP_EXE (
  echo [ERROR] Built executable not found.
  echo         Run: start.bat /rebuild   or   rebuild.bat
  goto fail
)
call :source_newer_than_exe
if "!SOURCE_NEWER!"=="1" (
  echo [warn] Launching packaged exe, but source is NEWER.
  echo        You will NOT see the latest code changes.
  echo.
)
goto launch_found

:launch_found
echo [1/1] Launching:
echo       %APP_EXE%
echo.
start "" "%APP_EXE%"
echo Done. You can close this window.
timeout /t 2 /nobreak >nul
exit /b 0

:launch_rebuild
if not exist "%ROOT%rebuild.bat" (
  echo [ERROR] rebuild.bat not found next to this script.
  goto fail
)
echo [rebuild] Building release with latest source...
echo.
call "%ROOT%rebuild.bat" /launch
exit /b %ERRORLEVEL%

:launch_dev
call :ensure_npm
if errorlevel 1 goto fail
call :ensure_deps
if errorlevel 1 goto fail

echo [run] npm run desktop  ^(Tauri dev - always uses current source^)
echo       First run may compile Rust and take a few minutes.
echo.
pushd "%DESKTOP%"
call npm run desktop
set "RUN_EXIT=%ERRORLEVEL%"
popd
if not "%RUN_EXIT%"=="0" goto fail
exit /b 0

:launch_web
call :ensure_npm
if errorlevel 1 goto fail
call :ensure_deps
if errorlevel 1 goto fail

echo [run] npm run dev  ^(browser preview at http://localhost:5173^)
echo.
pushd "%DESKTOP%"
call npm run dev
set "RUN_EXIT=%ERRORLEVEL%"
popd
if not "%RUN_EXIT%"=="0" goto fail
exit /b 0

:find_exe
set "APP_EXE="
if exist "%ROOT%Grok Forge.exe" (
  set "APP_EXE=%ROOT%Grok Forge.exe"
  exit /b 0
)
if exist "%ROOT%grok-forge-desktop.exe" (
  set "APP_EXE=%ROOT%grok-forge-desktop.exe"
  exit /b 0
)
if exist "%DESKTOP%\src-tauri\target\release\Grok Forge.exe" (
  set "APP_EXE=%DESKTOP%\src-tauri\target\release\Grok Forge.exe"
  exit /b 0
)
if exist "%DESKTOP%\src-tauri\target\release\grok-forge-desktop.exe" (
  set "APP_EXE=%DESKTOP%\src-tauri\target\release\grok-forge-desktop.exe"
  exit /b 0
)
exit /b 0

:source_newer_than_exe
rem Returns SOURCE_NEWER=1 if key sources are newer than APP_EXE.
set "SOURCE_NEWER=0"
if not defined APP_EXE exit /b 0
if not exist "%APP_EXE%" exit /b 0
if not exist "%DESKTOP%\scripts\is-source-newer.ps1" exit /b 0

powershell -NoProfile -ExecutionPolicy Bypass -File "%DESKTOP%\scripts\is-source-newer.ps1" -ExePath "%APP_EXE%" -DesktopDir "%DESKTOP%"
if errorlevel 1 set "SOURCE_NEWER=1"
exit /b 0

:ensure_npm
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found. Install Node.js and add it to PATH.
  exit /b 1
)
exit /b 0

:ensure_deps
if exist "%DESKTOP%\node_modules\" exit /b 0
echo [setup] node_modules missing, running npm install ...
echo.
pushd "%DESKTOP%"
call npm install
set "INST_EXIT=%ERRORLEVEL%"
popd
if not "%INST_EXIT%"=="0" (
  echo [ERROR] npm install failed, exit code: %INST_EXIT%
  exit /b 1
)
exit /b 0

:fail
echo.
pause
exit /b 1
