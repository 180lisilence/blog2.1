#!/bin/bash
# ============================================
# 云客 · 一键 Docker 启动脚本
# 用法：chmod +x docker-start.sh && ./docker-start.sh
# ============================================

set -e

echo "🚀 云客 · Docker 一键启动"
echo "============================"

# 检查 docker-compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ 未找到 docker-compose，请先安装 Docker"
    exit 1
fi

# 检查 .env 是否存在
if [ ! -f "qrcode-login/.env" ]; then
    echo "📝 首次运行，正在生成 .env 配置文件..."
    cp qrcode-login/.env.example qrcode-login/.env
    
    # 生成随机密码
    MYSQL_PASS=$(openssl rand -hex 16)
    ADMIN_PASS=$(openssl rand -hex 12)
    CAPTCHA_SECRET=$(openssl rand -hex 32)
    
    # 替换默认密码
    sed -i "s/MYSQL_PASSWORD=CHANGE_ME/MYSQL_PASSWORD=$MYSQL_PASS/g" qrcode-login/.env
    sed -i "s/DEFAULT_ADMIN_PASSWORD=CHANGE_ME_STRONG/DEFAULT_ADMIN_PASSWORD=$ADMIN_PASS/g" qrcode-login/.env
    sed -i "s/CAPTCHA_SECRET=/CAPTCHA_SECRET=$CAPTCHA_SECRET/g" qrcode-login/.env
    
    echo ""
    echo "✅ 已自动生成随机密码，保存在 qrcode-login/.env"
    echo "   管理员账号：admin"
    echo "   管理员密码：$ADMIN_PASS"
    echo ""
    echo "⚠️  请记住这个密码！或者编辑 qrcode-login/.env 修改"
    read -p "按回车继续..."
fi

# 启动服务
echo "🐳 启动 Docker 服务..."
docker-compose up -d --build

echo ""
echo "============================"
echo "✅ 启动完成！"
echo "   访问地址：http://localhost:3000"
echo "   管理员账号：admin"
echo "   查看密码：cat qrcode-login/.env | grep DEFAULT_ADMIN_PASSWORD"
echo ""
echo "   常用命令："
echo "   查看日志：docker-compose logs -f"
echo "   停止服务：docker-compose down"
echo "   重启服务：docker-compose restart"
