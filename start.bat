@echo off
title StockRadar Launcher

echo.
echo  ========================================
echo   StockRadar - NSE Real-Time Screener
echo  ========================================
echo.

:: Check Node is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

:: Install backend deps if needed
if not exist "backend\node_modules" (
    echo [Setup] Installing backend dependencies...
    cd backend
    npm install
    cd ..
)

:: Install frontend deps if needed
if not exist "frontend\node_modules" (
    echo [Setup] Installing frontend dependencies...
    cd frontend
    npm install
    cd ..
)

echo [Starting] Backend on http://localhost:5000
start "StockRadar Backend" cmd /k "cd /d %~dp0backend && npm start"

timeout /t 3 /nobreak >nul

echo [Starting] Frontend on http://localhost:5173
start "StockRadar Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 4 /nobreak >nul

echo [Opening] Browser...
start http://localhost:5173

echo.
echo  Both servers are running in separate windows.
echo  Close those windows to stop the app.
echo.
pause
