@echo off
REM Setup Windows Scheduled Task for hourly git sync
REM Run this file as Administrator

setlocal enabledelayexpansion

echo.
echo ============================================================
echo   Setting up GitHub hourly sync scheduler
echo ============================================================
echo.

REM Check if running as admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must run as Administrator
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

REM Define variables
set TASK_NAME=GitHubHourlySync
set SCRIPT_PATH=D:\ai-workspace\github-repo-windows-update\git-hourly-sync.ps1
set LOG_PATH=%USERPROFILE%\AppData\Local\git-hourly-sync.log

REM Check if script exists
if not exist "%SCRIPT_PATH%" (
    echo ERROR: Script not found at %SCRIPT_PATH%
    pause
    exit /b 1
)

REM Delete existing task if it exists
echo Checking for existing task...
tasklist /FI "TASKNAME eq %TASK_NAME%" 2>NUL | find /I /N "%TASK_NAME%">NUL
if "%ERRORLEVEL%"=="0" (
    echo Removing existing task...
    schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
)

REM Create new scheduled task
echo Creating new scheduled task...
schtasks /create /tn "%TASK_NAME%" ^
    /tr "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%SCRIPT_PATH%\" >> \"%LOG_PATH%\" 2>&1" ^
    /sc hourly /mo 1 ^
    /ru "%USERNAME%" ^
    /f >nul 2>&1

if %errorLevel% equ 0 (
    echo.
    echo ✓ SUCCESS: Task created!
    echo.
    echo Task Details:
    echo   Name: %TASK_NAME%
    echo   Frequency: Every 1 hour
    echo   Script: %SCRIPT_PATH%
    echo   Logs: %LOG_PATH%
    echo.
    echo The script will now run automatically every hour.
    echo.
    echo To verify setup:
    echo   schtasks /query /tn "%TASK_NAME%" /v
    echo.
    echo To view logs:
    echo   type "%LOG_PATH%"
    echo.
) else (
    echo ERROR: Failed to create scheduled task
    echo Please check that you're running as Administrator
    pause
    exit /b 1
)

pause
