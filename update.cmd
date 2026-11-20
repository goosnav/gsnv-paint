@echo off
rem Update a clean official main checkout, then start the current local app.
call "%~dp0run.cmd" --update %*
exit /b %errorlevel%
