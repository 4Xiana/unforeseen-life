#!/bin/sh
set -eu
cd "$(dirname "$0")"
: "${PORT:?The platform must provide PORT}"

# 依赖与构建都可由锁文件恢复，首次启动或容器重建后也能运行。
if [ ! -f node_modules/.package-lock.json ]; then
  npm ci --ignore-scripts --no-audit --no-fund
fi
if [ ! -f server/node_modules/.package-lock.json ]; then
  npm ci --prefix server --ignore-scripts --no-audit --no-fund
fi
npm run build
npm --prefix server run build
cd server
exec node dist/index.js
