@echo off
chcp 65001 >nul
title ChatRecord OCR 服务
echo ============================================
echo   ChatRecord 本地 OCR 服务  (RapidOCR)
echo   识别聊天截图时网页会自动连接本服务
echo ============================================
echo.

rem 1. 检查服务是否已在运行（端口 8765 被监听）
netstat -ano | findstr /R /C:":8765 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo [提示] OCR 服务已在运行 ^(127.0.0.1:8765^)
    echo 无需重复启动，直接去网页用即可。
    echo.
    pause
    exit /b 0
)

rem 2. 检查 python 是否可用
where python >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 python 命令，请先安装 Python 并加入 PATH。
    echo.
    pause
    exit /b 1
)

echo 正在启动 OCR 服务，请保持本窗口开启...
echo 关闭本窗口即停止服务。
echo.
python "%~dp0backend\ocr_server.py"
if errorlevel 1 (
    echo.
    echo [错误] OCR 服务启动失败，请查看上方报错信息。
    echo 常见原因：未安装识别引擎，可运行  pip install rapidocr-onnxruntime
)
echo.
pause
