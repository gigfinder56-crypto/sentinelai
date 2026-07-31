@echo off
echo =========================================================
echo   Starting Sentinel AI Ecosystem (Backend & Frontend)
echo =========================================================

start "Sentinel AI Backend (Port 8001)" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --reload --port 8001"
start "Sentinel AI Frontend (Vite UI)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Sentinel AI Backend launching on: http://127.0.0.1:8001
echo Sentinel AI Frontend launching on: http://localhost:5174
echo.
pause
