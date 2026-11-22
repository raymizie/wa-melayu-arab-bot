@echo off
title Bot WhatsApp Melayu - Arab
cd /d "%~dp0"
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
echo ==================================================
echo   Memulakan Bot WhatsApp Melayu ^<^-^> Arab...
echo   Buka http://localhost:3000 untuk imbas QR Code
echo ==================================================
echo.
node src/index.js
pause
