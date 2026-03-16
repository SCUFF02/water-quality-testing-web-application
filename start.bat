@echo off
title WaterLab Startup
color 0A

echo ========================================
echo   WaterLab — Starting all services
echo ========================================
echo.

:: Start XAMPP MySQL
echo [1/3] Starting MySQL...
"C:\xampp\mysql\bin\mysqld.exe" --defaults-file="C:\xampp\mysql\bin\my.ini" --standalone
start "" "C:\xampp\xampp-control.exe"
timeout /t 3 /nobreak > nul

:: Start Backend
echo [2/3] Starting FastAPI backend...
start "WaterLab Backend" cmd /k "cd /d C:\Users\ASUS\Documents\waterlab\backend && uvicorn app.main:app --reload --port 8000"
timeout /t 2 /nobreak > nul

:: Start Frontend
echo [3/3] Starting React frontend...
start "WaterLab Frontend" cmd /k "cd /d C:\Users\ASUS\Documents\waterlab\frontend && npm run dev"
timeout /t 3 /nobreak > nul

:: Open browser
echo.
echo Opening browser...
timeout /t 4 /nobreak > nul
start "" "http://localhost:5173"

echo.
echo ========================================
echo   WaterLab is running!
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:8000
echo   API docs: http://localhost:8000/docs
echo ========================================
pause
