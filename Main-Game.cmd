@echo off
REM Klik dua kali file ini (atau jalankan dari CMD) untuk langsung main AI Hand Battle.
REM Butuh Node.js. Download gratis di https://nodejs.org jika belum ada.
title AI Hand Battle
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js tidak ditemukan.
  echo.
  echo   Pilih salah satu:
  echo     1. Install Node.js dari https://nodejs.org lalu jalankan file ini lagi, atau
  echo     2. Pakai aplikasi desktop ^(.exe^) dari GitHub Actions - tidak butuh Node.js.
  echo.
  pause
  exit /b 1
)

echo.
echo   Menyalakan AI Hand Battle...
node "%~dp0scripts\serve.mjs" %*
pause
