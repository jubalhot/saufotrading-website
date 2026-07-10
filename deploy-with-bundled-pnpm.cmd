@echo off
setlocal
cd /d "%~dp0"
set PNPM=C:\Users\t_vev\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd

echo Installing Cloudflare Wrangler...
"%PNPM%" install
if errorlevel 1 goto failed

echo.
echo Login to Cloudflare if prompted...
"%PNPM%" exec wrangler login
if errorlevel 1 goto failed

echo.
echo Creating D1 tables in sme_payroll...
"%PNPM%" exec wrangler d1 execute sme_payroll --remote --file=schema.sql
if errorlevel 1 goto failed

echo.
echo Deploying SME Payroll API Worker...
"%PNPM%" exec wrangler deploy
if errorlevel 1 goto failed

echo.
echo Done. Now route the Worker to www.saufotrading.com/api/* in Cloudflare.
pause
exit /b 0

:failed
echo.
echo A step failed. Read the message above, then try again.
pause
exit /b 1
