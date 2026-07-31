@echo off
echo =========================================================
echo   Pushing Sentinel AI Codebase to GitHub Repository
echo   https://github.com/gigfinder56-crypto/sentinelai.git
echo =========================================================

cd /d %~dp0

git add .
git commit -m "Update Sentinel AI: HTTP REST polling fallback, zero-dependency fail-safe mode, and instant UI connection"
git push origin main

echo.
echo =========================================================
echo   Successfully Updated GitHub Repository!
echo =========================================================
pause
