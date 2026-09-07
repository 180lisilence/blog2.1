# ============================================
# 项目中心服务 Dockerfile
# 构建：docker build -t myself-blog .
# 运行：docker run -p 3000:3000 --env-file qrcode-login/.env myself-blog
# ============================================

FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 安装依赖（利用 Docker 缓存）
COPY qrcode-login/package*.json ./qrcode-login/
RUN cd qrcode-login && npm install --production

# 复制项目文件
COPY . .

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/qrcode/generate').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

# 启动服务
WORKDIR /app/qrcode-login
CMD ["node", "server.js"]
