#!/bin/bash

set -euo pipefail

echo "===== 计算机学院团委办公系统 - 一键部署 ====="

if [ ! -f ".env" ]; then
    echo "复制环境变量模板..."
    cp .env.example .env
    echo "⚠️  请编辑 .env 文件，修改 JWT_SECRET 和 DB_PASSWORD"
    echo "    重新运行本脚本前，确保 JWT_SECRET 已改为随机长密钥，DB_PASSWORD 已脱离弱口令。"
    exit 1
fi

# 校验 .env 中的关键安全配置
JWT_SECRET=$(grep -E '^JWT_SECRET=' .env | cut -d'=' -f2- | tr -d '[:space:]')
DB_PASSWORD=$(grep -E '^DB_PASSWORD=' .env | cut -d'=' -f2- | tr -d '[:space:]')
NODE_ENV_VAL=$(grep -E '^NODE_ENV=' .env | cut -d'=' -f2- | tr -d '[:space:]')

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "your_jwt_secret_here_change_in_production" ]; then
    echo "❌ JWT_SECRET 未配置或仍为默认占位符，请设置一个不少于 32 字节的随机密钥后重试。"
    exit 1
fi
if [ ${#JWT_SECRET} -lt 16 ]; then
    echo "❌ JWT_SECRET 长度不足（少于 16 字符），存在被破解风险，请使用更长的随机密钥。"
    exit 1
fi
if [ "$DB_PASSWORD" = "123456" ]; then
    echo "❌ DB_PASSWORD 仍为默认弱口令 '123456'，请修改后再部署。"
    exit 1
fi
if [ "$NODE_ENV_VAL" != "production" ]; then
    echo "⚠️  建议在 .env 中设置 NODE_ENV=production，当前为 '$NODE_ENV_VAL'。"
fi

echo "安装依赖..."
npm install --omit=dev

echo "初始化数据库..."
npm run init-db

echo "创建必要目录..."
mkdir -p uploads logs

echo "启动服务..."
# 必须带 --env production 才会加载 env_production（NODE_ENV=production）
# 否则会以 development 模式运行，绕过 server.js 中的 DB_PASSWORD 守护
pm2 start ecosystem.config.js --env production
pm2 save

echo "===== 部署完成 ====="
echo "服务已通过 PM2 启动（production 模式）"
echo "使用 npm run pm2:status 查看状态"
echo "使用 npm run pm2:logs 查看日志"
