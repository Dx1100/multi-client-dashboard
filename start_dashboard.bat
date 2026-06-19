@echo off
title Client Dashboard App
echo ===================================================
echo   Starting Multi-Client CSV Analytics Dashboard
echo ===================================================
echo.
cd /d "C:\Users\My time\Desktop\Testing\LAB_EXPERIMENTS\client-dashboard-app"
echo App is running at http://localhost:3000
echo Opening browser...
start http://localhost:3000
echo.
npm run dev
pause
