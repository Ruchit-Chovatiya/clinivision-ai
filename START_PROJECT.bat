@echo off
echo ============================================
echo   CLINIVISION AI - Starting Project...
echo ============================================
echo.

:: Start Backend
echo [1/2] Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "Clinivision Backend" cmd /k "cd /d d:\database\backend && python main.py"

:: Wait 3 seconds for backend to initialize
timeout /t 3 /nobreak >nul

:: Start Frontend
echo [2/2] Starting React Frontend on http://localhost:5173 ...
start "Clinivision Frontend" cmd /k "cd /d d:\database\frontend && npm run dev"

:: Wait 3 seconds then open browser
timeout /t 3 /nobreak >nul
echo.
echo ============================================
echo   Opening browser...
echo ============================================
start http://localhost:5173

echo.
echo Both servers are running!
echo   Backend  : http://127.0.0.1:8000
echo   Frontend : http://localhost:5173
echo   API Docs : http://127.0.0.1:8000/docs
echo.
echo Close the two terminal windows to stop the servers.
pause
