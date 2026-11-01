@echo off
setlocal
cd /d "%~dp0"
rem Support the portable Node folder used beside the website folder in VS Code.
if exist "%~dp0..\node\node.exe" set "PATH=%~dp0..\node;%PATH%"
if exist "%~dp0node\node.exe" set "PATH=%~dp0node;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js or place your portable node folder beside this website folder.
  pause
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found in PATH. Check your Node.js folder.
  pause
  exit /b 1
)
echo NOOLTHARI V2 - checking and deploying to the already linked Vercel project...
call npm.cmd run check
if errorlevel 1 goto failed
call npm.cmd run deploy
if errorlevel 1 goto failed
echo.
echo Vercel deployment command completed. Verify the live store and test checkout in Razorpay Test Mode.
pause
exit /b 0
:failed
echo.
echo Deployment stopped. Read the error above; do not bypass failed checks.
pause
exit /b 1
