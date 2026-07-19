@echo off
setlocal EnableExtensions

rem Wrapper: call rebuild.bat (ASCII) so Chinese path names still work when double-clicked.
rem Do not put non-ASCII text in this file beyond the filename.

cd /d "%~dp0"
if not exist "%~dp0rebuild.bat" (
  echo [ERROR] rebuild.bat not found next to this script.
  pause
  exit /b 1
)

call "%~dp0rebuild.bat" %*
exit /b %ERRORLEVEL%
