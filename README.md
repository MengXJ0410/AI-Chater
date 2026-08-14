# AI Chater

本机运行的 AI 聊天工具，支持账号注册、会话管理、流式回复、多个模型预设和图片输入。

## 环境要求

- Node.js 24+
- MySQL 8.0+

## 本机启动

1. 使用本机 MySQL 管理员账号执行 `docs/local-mysql-init.sql`。执行前把文件中的 `REPLACE_WITH_A_URL_SAFE_PASSWORD` 替换成应用账号密码；管理员密码不要写入仓库。
   ```powershell
   Get-Content .\docs\local-mysql-init.sql | mysql -u root -p
   ```
2. 复制环境模板并填写数据库地址、模型预设和 API Key：
   ```powershell
   Copy-Item .env.example .env
   ```
   `.env` 中的 `DATABASE_URL` 使用 `mysql://ai_chater_app:<password>@127.0.0.1:3306/ai_chater`。密码包含 `@`、`#`、`/` 等特殊字符时必须先进行 URL 编码。
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

## 首页背景

将 JPG、JPEG、PNG、WebP 或 AVIF 图片放入 `public/home-backgrounds`。首页会在下一次访问时按文件名顺序轮播这些图片；目录为空时使用纯色背景。

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

账号管理接口：`PATCH /api/me/password` 修改密码（请求体为 `currentPassword`、`newPassword`），`DELETE /api/me` 软删除当前账号（请求体为 `password`）。软删除会撤销全部会话、保留历史聊天和图片数据，并释放原用户名供重新注册。

图片会保存至 `UPLOAD_DIR`（默认 `data/uploads`），该目录与 `.env` 均已排除在 Git 之外。此项目按本机使用设计；请勿在未增加访问控制、HTTPS 和注册策略前公开部署。
