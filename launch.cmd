@echo off
chcp 65001 >nul
REM ============================================
REM  网课伴学 · 桌面启动器 (Windows)
REM  1) 本地服务(node server.cjs)没起就起一个(最小化窗口,关掉即停)
REM  2) 用 Edge 应用模式打开软件(独立窗口,无地址栏)
REM  需要先 npm install && npm run build
REM ============================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"
set "LOG=%~dp0launch.log"
echo [%date% %time%] ===== launcher start ===== >> "%LOG%"

if not exist "server.cjs" (
    echo 请把本脚本放在项目根目录下运行
    pause
    exit /b 1
)
if not exist "dist\index.html" (
    echo 还没有构建产物,请先执行:  npm install ^&^& npm run build
    pause
    exit /b 1
)

REM ---- 找 node ----
where node >nul 2>nul
if errorlevel 1 (
    echo 找不到 node,请先安装 Node.js 18+ 并加入 PATH
    pause
    exit /b 1
)

REM ---- 服务没起就起一个 ----
netstat -ano | findstr ":4174 " | findstr "LISTENING" >nul
if not errorlevel 1 goto :ready

echo [%time%] starting server... >> "%LOG%"
start "" /min node server.cjs
for /l %%i in (1,1,15) do (
    timeout /t 1 /nobreak >nul
    netstat -ano | findstr ":4174 " | findstr "LISTENING" >nul && goto :ready
)
echo 服务启动失败,请手动运行: node server.cjs
pause
exit /b 1

:ready
echo [%time%] server ready, opening app >> "%LOG%"
set "EDGE86=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "EDGE64=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE86%" (
    start "" "%EDGE86%" --app=http://localhost:4174/
) else if exist "%EDGE64%" (
    start "" "%EDGE64%" --app=http://localhost:4174/
) else (
    start http://localhost:4174/
)
echo [%time%] launcher done >> "%LOG%"
exit
