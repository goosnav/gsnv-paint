@echo off
rem Windows: double-click this file. It runs run.ps1 from the same folder.
rem The execution-policy flag applies to this one process only; no system setting changes.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
if errorlevel 1 pause
