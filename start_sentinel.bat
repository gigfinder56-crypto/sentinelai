@echo off
echo =========================================================
echo   Starting Sentinel AI Ecosystem (Backend & Frontend)
echo =========================================================

start "Sentinel AI Backend" cmd /k "cd /d %~dp0 && python main.py"
start "Sentinel AI Frontend (Vite UI)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Sentinel AI Backend launching on: http://127.0.0.1:8000
echo Sentinel AI Frontend launching on: http://localhost:5174
echo.
pause
