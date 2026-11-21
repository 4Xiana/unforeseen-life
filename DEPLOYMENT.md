# ASteam 部署

原仓库：https://github.com/4Xiana/unforeseen-life

导入版本：`464510a`（main）。原始 Git 克隆保存在 `/workspace/sources/unforeseen-life`。

此目录是平台独立产品仓库。平台通过 `app.toml` 托管 `start.sh`，注入 `PORT`；Express 监听 `0.0.0.0`，同时提供根路径前端、API、SSE 与证物图片。健康检查为 `/api/health`。

首次启动自动按两个 `package-lock.json` 安装依赖，每次启动构建前后端。使用包中自带的 Linux 二进制并关闭安装脚本，避免 npm 对已提供预编译文件的 SQLite 模块执行额外编译和下载 Node 头文件。依赖、构建产物、运行数据和密钥均不入库。当前环境验证为 Node.js 24，SQLite 依赖要求 Node.js 22 或更新版本。

## 模型配置

在 `server/.env` 或产品环境变量中配置：

```dotenv
OPENAI_API_KEY=填入模型服务密钥
OPENAI_BASE_URL=https://api.minimaxi.com/v1
OPENAI_MODEL=MiniMax-M3
```

不要在 `.env` 中设置 `PORT`，由平台分配。未配置模型密钥时可以打开页面，但 AI 对话和生成任务无法使用。`GET /api/health` 的 `aiConfigured` 只表示已配置密钥，不能证明模型服务可用。

语音合成可选配置 `MINIMAX_API_KEY`，其余配置参照 `server/.env.example`。原项目语音输入依赖浏览器 Web Speech API，需要浏览器支持及安全上下文。

## 数据

默认存储在 `server/data/`，包含 SQLite 会话数据库、喜好、手账、心愿及证物原图；保留该目录即可保留记录。也可用 `XIAN_DATA_DIR` 指定持久目录。当前部署不导入原服务器的历史数据。
