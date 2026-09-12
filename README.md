# AI Chater

本机运行的 AI 聊天工具，支持账号注册、会话管理、流式回复、多个模型预设和图片输入。

> 页面、接口与目录总览见 [`docs/project-overview.md`](docs/project-overview.md)；分层与依赖规则见 [`docs/architecture.md`](docs/architecture.md)；首页桌宠框架见 [`docs/pet-framework.md`](docs/pet-framework.md)。

## 后端技术栈

- **Next.js Route Handlers + TypeScript**：提供登录、会话、聊天、上传和模型配置 API。
- **MySQL + Drizzle ORM**：保存用户、登录会话、聊天记录、附件和用户模型配置；表结构通过 migration 管理。
- **Argon2id + Cookie Session**：密码只保存哈希，会话令牌只保存摘要，浏览器使用 `HttpOnly` Cookie。
- **Vercel AI SDK**：统一连接 OpenAI、Anthropic、Google、xAI 和兼容接口，并以流式方式返回模型回复。
- **AES-256-GCM**：加密保存用户填写的模型 API Key，接口只返回是否已配置和末四位。

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
   使用生图模式时还需在另一个终端启动任务 worker：
   ```powershell
   npm run image:worker
   ```
   `一键启动.bat` 会同时启动开发服务器和 worker。
4. 浏览器打开 `http://localhost:3000`，注册账号后即可使用。

## 用户模型配置

### 多配置、审计与限流

一个账号可以保存多条对话和生图连接；配置名称可以重复，前端以配置 UUID 区分。新接口为 `GET/POST /api/me/model-configs`、`PUT/DELETE /api/me/model-configs/:id` 和 `POST /api/me/model-configs/:id/test`。读取仅返回名称、Provider、Base URL、模型、运行时预设 ID 和 Key 末四位。旧的单条接口仍保留，始终代理该类型最近更新的一条配置，绝不会删除或覆盖其它记录。

对话运行时 ID 是 `user-chat-config:<uuid>`，生图运行时 ID 是 `user-image-config:<uuid>`；旧 `user-config` 与 `user-image-config` 仍映射到最近更新记录，保证已打开的旧浏览器继续可用。配置写入限制为每账号每小时 30 次，对话测试 10 次、生图测试 3 次、正式生图 20 次。超限返回 `429` 和 `Retry-After`，不会泄露剩余额度。审计事件只记录账号、配置、Provider/Model 快照、请求 ID 和脱敏错误码；worker 按 `MODEL_AUDIT_RETENTION_DAYS`（默认 180 天）清理到期记录。

聊天工作台的“配置”抽屉可为当前账号保存一套模型连接。常用连接方案只需选择并填写 API Key；选择“自定义预设”时可以自行填写 Provider、Base URL 和 Model。保存后配置写入当前账号的 MySQL 记录，下次登录会自动恢复“我的配置”。API Key 仅通过 HTTPS 请求提交，服务端使用 AES-256-GCM 加密保存，读取接口不会返回明文。

在启用此功能前，为 `.env` 生成并填写 32 字节的加密主密钥：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

```env
AI_CONFIG_ENCRYPTION_KEY=<generated-base64-key>
```

连接方案中的云端 Base URL 必须是 HTTPS 公网域名，服务端会拒绝凭据、私网、链路本地和内部主机名，并禁止跟随重定向。API Key 轮换通过重新保存新 Key 完成；主密钥整体轮换需要后续迁移工具支持。

默认连接方案包括 OpenAI、Anthropic、Google、xAI、YYAPI、YYAPI Grok 4.5、OpenRouter 和 DeepSeek。YYAPI Grok 4.5（`yyapi-grok-01`）使用 `openai-compatible`、`https://www.yyapi.cloud/v1` 和 `grok-4.5`。固定兼容方案由 `USER_AI_ALLOWED_BASE_URLS` 白名单约束；自定义 OpenAI-compatible 地址允许 HTTPS 公网域名，但仍会拒绝凭据、查询参数、片段、IP、私网和内部主机名。

### 测试并保存连接

使用用户模型配置时，先确认 `.env` 已配置 `DATABASE_URL`、`AI_CONFIG_ENCRYPTION_KEY` 和 `USER_AI_ALLOWED_BASE_URLS`。登录后打开聊天工作台的“配置”抽屉，选择连接方案，核对只读的 Provider、Base URL 和 Model，输入对应平台的 API Key，点击“测试连接”。测试会发起一次最小文本请求，不保存配置，也不会创建聊天消息；测试成功后再点击“保存配置”，然后在聊天顶部选择“我的配置”发送普通文本消息。保存的配置绑定当前账号，下次登录会自动恢复。

常见连接问题：YYAPI 必须使用 `https://www.yyapi.cloud/v1`，不能使用根地址；YYAPI Key 必须来自 YYAPI 控制台，不能替换成其他平台的 Key。401 通常是 Key 无效或 Provider 不匹配，404 通常是缺少 `/v1`、模型不存在或接口不兼容，429 通常是额度、频率或账户权限问题。Base URL 校验失败通常表示使用了 HTTP 公网地址、IP/内网地址、账号信息、查询参数或片段。测试请求会产生极少量模型调用费用。

## 模型预设

`AI_PRESETS_JSON` 是 JSON 数组。密钥变量名由每项的 `apiKeyEnv` 指向，密钥值不写进 JSON。例如：

```env
AI_PRESETS_JSON=[{"id":"grok","label":"Grok","provider":"openai-compatible","model":"grok-4","apiKeyEnv":"XAI_API_KEY","baseUrl":"https://api.x.ai/v1","supportsImages":true},{"id":"claude","label":"Claude","provider":"anthropic","model":"claude-sonnet-4-5","apiKeyEnv":"ANTHROPIC_API_KEY","supportsImages":true}]
XAI_API_KEY=your-xai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

支持的 `provider`：`openai`、`openai-compatible`、`xai`、`anthropic`、`google`。图片只能发送给 `supportsImages: true` 的预设。

## 生图模式

生图连接与聊天连接分开保存。当前账号通过 `/api/me/image-config` 保存一套 `xai-compatible` 或 `openai-compatible` 图片连接，API Key 复用同一 AES-256-GCM 密钥环加密。管理员必须把 Base URL 加入 `USER_AI_ALLOWED_BASE_URLS`；Provider 返回图片 URL 时，只允许连接地址同域或 `USER_IMAGE_ALLOWED_OUTPUT_HOSTS` 中明确列出的域名。

连接测试会真实生成并立即删除一张图片，可能产生费用。正式生成由 `POST /api/image-generations` 创建异步任务，`npm run image:worker` 以单并发处理，前端通过 `/api/image-generations/:id` 轮询和取消。任务不自动重试，每次固定生成一张 PNG；生成附件会保存服务端解码后的真实宽高，历史附件可没有尺寸。首期不支持参考图编辑。YYAPI 必须填写其实际支持的图片模型 ID，普通聊天模型 `grok-4.5` 不能直接用于生图。

## 首页背景

将 JPG、JPEG、PNG、WebP 或 AVIF 图片放入 `public/home-backgrounds`。首页会在下一次访问时按文件名顺序轮播这些图片；目录为空时使用纯色背景。

## 命令

```powershell
npm run dev          # 开发服务器
npm run build        # 生产构建
npm run start        # 运行生产构建
npm run lint         # ESLint
npm run test         # 单元测试
npm run image:worker # 异步生图任务 worker
npm run airi:dev      # 准备并启动固定版本 AIRI Stage Web（端口 5173）
npm run db:generate  # 从 schema 生成 migration
npm run db:migrate   # 执行 migration
```

登录后访问 `/companion` 进入 AIRI Companion。首次接入前先执行 `npm run db:migrate`，再执行 `npm run airi:dev`；AIRI 固定版本、bridge 和升级说明位于 `integrations/airi`，源码 checkout 只保存在被 Git 忽略的 `.runtime/airi`。

账号管理接口：`PATCH /api/me/password` 修改密码（请求体为 `currentPassword`、`newPassword`），`DELETE /api/me` 软删除当前账号（请求体为 `password`）。软删除会撤销全部会话、保留历史聊天和图片数据，并释放原用户名供重新注册。

个人资料接口：`GET /api/me/profile` 读取当前账号头像状态，`PUT/GET/DELETE /api/me/avatar` 上传、读取和删除头像。头像由服务端校验为 512×512 的 JPEG、PNG 或 WebP，统一保存为受控目录中的 WebP 文件，不写入消息附件表。

图片会保存至 `UPLOAD_DIR`（默认 `data/uploads`），该目录与 `.env` 均已排除在 Git 之外。此项目按本机使用设计；请勿在未增加访问控制、HTTPS 和注册策略前公开部署。
