@echo off
setlocal EnableExtensions

rem Wrapper: call start.bat (ASCII) so Chinese path names still work when double-clicked.
rem Double-click = smart start (rebuild if source newer than exe).
rem Args pass through: /exe /dev /web /rebuild

cd /d "%~dp0"
if not exist "%~dp0start.bat" (
  echo [ERROR] start.bat not found next to this script.
  pause
  exit /b 1
)

call "%~dp0start.bat" %*
exit /b %ERRORLEVEL%
