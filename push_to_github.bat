@echo off
echo =========================================================
echo   Pushing Sentinel AI Codebase to GitHub Repository
echo   https://github.com/gigfinder56-crypto/sentinelai.git
echo =========================================================

cd /d %~dp0

git add .
git commit -m "Fix root route to serve React index.html and multi-path FRONTEND_DIST resolution"
git push origin main

echo.
echo =========================================================
echo   Successfully Updated GitHub Repository!
echo =========================================================
pause
