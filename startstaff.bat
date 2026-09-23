@echo off
cd /d "%~dp0"
echo.
echo  Starting Staff Portal dev server
echo  https://localhost:9200
echo  (Ctrl+C to stop)
echo.
REM Load secrets from .dev.vars (do not commit this file)
if exist ".dev.vars" (
  for /f "usebackq tokens=1,* delims==" %%a in (".dev.vars") do (
    set "%%a=%%b"
  )
)
npx -y wrangler@4 pages dev . --port 9200
