#!/bin/bash

set -e

echo "===== 计算机学院团委办公系统 - 一键部署 ====="

if [ ! -f ".env" ]; then
    echo "复制环境变量模板..."
    cp .env.example .env
    echo "⚠️  请编辑 .env 文件，修改 JWT_SECRET 和 DB_PASSWORD"
    exit 1
fi

echo "安装依赖..."
npm install --production

echo "初始化数据库..."
npm run init-db

echo "创建必要目录..."
mkdir -p uploads logs

echo "启动服务..."
npm run start:prod

echo "===== 部署完成 ====="
echo "服务已通过 PM2 启动"
echo "使用 npm run pm2:status 查看状态"
echo "使用 npm run pm2:logs 查看日志"
