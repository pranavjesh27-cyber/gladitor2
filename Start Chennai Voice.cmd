@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js first, then open this launcher again.
  pause
  exit /b 1
)
node scripts/start-local.mjs
pause
