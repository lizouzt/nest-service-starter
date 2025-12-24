module.exports = {
  apps : [{
    name: "efficiency-nest",
    script: "dist/src/main.js",
    instances : "1",
    watch: false,
    max_restarts: 10,
    autorestart: true,
    max_memory_restart: '300M',
    error_file: './logs/pm2-err.log',
    out_file: './logs/pm2-out.log',
    log_date_format:"YYYY-MM-DD HH:mm Z",
    merge_logs: true,
    env: {
      NODE_ENV: "production"
    },
    env_local: {
      NODE_ENV: "local"
    }
  }]
};