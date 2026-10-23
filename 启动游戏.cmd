@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "DUEL_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "D:\CODEX\node.exe" (
    set "DUEL_NODE=D:\CODEX\node.exe"
  ) else (
    echo 请先安装 Node.js 24 LTS，再双击此文件。
    pause
    exit /b 1
  )
)
"%DUEL_NODE%" start.mjs --open
pause
