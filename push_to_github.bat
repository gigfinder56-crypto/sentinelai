@echo off
echo =========================================================
echo   Pushing Sentinel AI Codebase to GitHub Repository
echo   https://github.com/gigfinder56-crypto/sentinelai.git
echo =========================================================

cd /d %~dp0

git init
git remote remove origin
git remote add origin https://github.com/gigfinder56-crypto/sentinelai.git
git branch -M main

git add .
git commit -m "Complete Sentinel AI Autonomous Emergency Officer prototype with Supabase, Twilio SMS/Voice, Email Dispatches, and CCTV Live Tracking Station"
git push -u origin main --force

echo.
echo =========================================================
echo   Successfully Pushed Codebase to GitHub!
echo =========================================================
pause
