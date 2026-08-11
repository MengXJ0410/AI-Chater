# AI Chater

本机运行的 AI 聊天工具，支持账号注册、会话管理、流式回复、多个模型预设和图片输入。

## 环境要求

- Node.js 24+
- MySQL 8.0+

## 本机启动

1. 在 MySQL 中创建数据库：
   ```sql
   CREATE DATABASE ai_chater CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
2. 复制环境模板并填写数据库地址、模型预设和 API Key：
   ```powershell
   Copy-Item .env.example .env
   ```
3. 安装依赖、执行 migration、启动开发服务器：
   ```powershell
   npm install
   npm run db:migrate
   npm run dev
   ```
4. 浏览器打开 `http://localhost:3000`，注册账号后即可使用。

## 模型预设

`AI_PRESETS_JSON` 是 JSON 数组。密钥变量名由每项的 `apiKeyEnv` 指向，密钥值不写进 JSON。例如：

```env
AI_PRESETS_JSON=[{"id":"grok","label":"Grok","provider":"openai-compatible","model":"grok-4","apiKeyEnv":"XAI_API_KEY","baseUrl":"https://api.x.ai/v1","supportsImages":true},{"id":"claude","label":"Claude","provider":"anthropic","model":"claude-sonnet-4-5","apiKeyEnv":"ANTHROPIC_API_KEY","supportsImages":true}]
XAI_API_KEY=your-xai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

支持的 `provider`：`openai`、`openai-compatible`、`xai`、`anthropic`、`google`。图片只能发送给 `supportsImages: true` 的预设。

## 命令

```powershell
npm run dev          # 开发服务器
npm run build        # 生产构建
npm run start        # 运行生产构建
npm run lint         # ESLint
npm run test         # 单元测试
npm run db:generate  # 从 schema 生成 migration
npm run db:migrate   # 执行 migration
```

图片会保存至 `UPLOAD_DIR`（默认 `data/uploads`），该目录与 `.env` 均已排除在 Git 之外。此项目按本机使用设计；请勿在未增加访问控制、HTTPS 和注册策略前公开部署。
