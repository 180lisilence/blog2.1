@echo off
chcp 65001 >nul
:: ============================================
:: 云客 · Windows 一键 Docker 启动脚本
:: 用法：双击运行 docker-start.bat
:: ============================================

echo 🚀 云客 · Docker 一键启动
echo ============================

:: 检查 docker-compose
where docker-compose >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未找到 docker-compose，请先安装 Docker Desktop
    pause
    exit /b 1
)

:: 检查 .env 是否存在
if not exist "qrcode-login\.env" (
    echo 📝 首次运行，正在生成 .env 配置文件...
    copy qrcode-login\.env.example qrcode-login\.env >nul
    
    echo.
    echo ✅ 已生成默认配置文件：qrcode-login\.env
    echo ⚠️  请编辑 qrcode-login\.env 修改数据库密码和管理员密码
    echo.
    pause
)

:: 启动服务
echo 🐳 启动 Docker 服务...
docker-compose up -d --build

echo.
echo ============================
echo ✅ 启动完成！
echo    访问地址：http://localhost:3000
echo.
echo    常用命令：
echo    查看日志：docker-compose logs -f
echo    停止服务：docker-compose down
echo    重启服务：docker-compose restart
echo.
pause
