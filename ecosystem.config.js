module.exports = {
  apps: [{
    name: 'youth-league-office',
    script: 'backend/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    // 启动即崩保护：min_uptime 内崩溃视为异常，触发 max_restarts 限制
    min_uptime: '10s',
    max_restarts: 10,
    // 异常重启指数退避，避免快速循环崩溃
    exp_backoff_restart_delay: 200,
    // 优雅关闭：给应用 5 秒处理完请求再 SIGKILL
    kill_timeout: 5000,
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
