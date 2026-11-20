@echo off
setlocal
rem Windows: double-click this file. It runs run.ps1 from the same folder.
rem The execution-policy flag applies to this one process only; no system setting changes.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
set "gsnv_exit=%errorlevel%"
if not "%gsnv_exit%"=="0" if not defined GSNV_PAINT_NO_PAUSE pause
exit /b %gsnv_exit%
