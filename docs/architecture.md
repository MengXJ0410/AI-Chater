# AI Chater 架构说明

更新时间：2026-09-12

## 项目定位

AI Chater 是面向本机 Node.js 部署的单体 AI 应用。技术栈：Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4、Drizzle ORM、mysql2、Vercel AI SDK、Argon2id、Zod、React Markdown、Sharp 和 Lucide。

> 页面、接口清单与目录总览见 `docs/project-overview.md`。

## 分层总览

代码按四层组织，依赖方向单一，禁止反向依赖：

```
app/            路由层（HTTP 适配）：同源校验 → 鉴权 → schema 解析 → 调用 server service → 响应
components/     前端表现层：按功能域分目录，只依赖 client/ 与 shared/
client/         前端能力层：typed API 客户端 + 纯前端工具，只依赖 shared/
shared/         共享层：类型、Zod schema、常量，不依赖 server 或 client
server/         后端应用层：HTTP 基础设施、安全、上游适配、业务服务、Agent 内核
```

依赖规则由 `eslint.config.mjs` 的 `no-restricted-imports` 护栏强制执行：

- `components/**`、`client/**` 不得导入 `@/server/**`
- `shared/**` 不得导入 `@/server/**` 或 `@/client/**`
- `server/**` 不得导入 `@/client/**`（共享类型请放 `shared/`）

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `app/` | 页面与 Route Handler。页面是薄壳，业务逻辑在 `server/services`。 |
| `app/api/` | HTTP 接口层。只做校验、鉴权、调用 service 与响应，不直接写业务 SQL/流式逻辑。 |
| `components/{home,auth,chat,image,video,companion,profile,appearance}/` | 按功能域组织的前端组件。 |
| `client/api/` | 按域拆分的 typed fetch 客户端，统一错误处理与请求构造。 |
| `client/` | 纯浏览器工具：外观、聊天视觉、首页数据、头像裁切、媒体生成客户端辅助等。 |
| `shared/` | `messages.ts`（消息 parts）、`validators.ts`（Zod）、`config.ts`（Provider/连接方案）、`video.ts`（视频模式）。 |
| `server/http/` | `RequestError`、`errorResponse`、`assertSameOrigin`、`routeError`、Companion CORS。 |
| `server/security/` | 会话认证、账号辅助、API Key 加密密钥环（`api-key-crypto`）、URL/SSRF 安全校验（`url-safety`）、固定窗口限流（`rate-limit`）、Companion 票据与运行时令牌。 |
| `server/db/` | Drizzle schema 与连接池。 |
| `server/providers/` | 上游适配：`ai`、`ai-image`、`comfyui`、`minimax-h3`。 |
| `server/services/` | 业务用例：会话、聊天、账号、模型配置、模型审计（`model-audit`）、生图、视频、伴侣、上传、头像、首页背景。 |
| `server/agent/` | 无路由、无数据库依赖的工具调用内核（v1 只读工具）。 |
| `server/config.ts` | 读取环境变量：预设、上传目录、上传上限、会话时长。 |
| `scripts/` | `image-worker.ts`、`video-worker.ts` 异步任务 worker 与部署脚本。 |
| `drizzle/` | 已生成的数据库 migration。 |
| `tests/` | Vitest 单元与集成测试。 |
| `docs/handoff/` | 历史前后端交接与部署记录归档。 |

## 数据与认证

MySQL 8.0+ 为必要依赖。`users` 保存用户名、Argon2id 密码哈希、头像元信息和可选的 `deleted_at`；`sessions` 保存会话令牌的 SHA-256 摘要及过期时间；`conversations`、`messages`、`attachments` 保存会话、消息 parts 与图片元信息。数据库初始化 SQL 位于 `docs/local-mysql-init.sql`，应用使用专用的 `ai_chater_app` 账号，不使用 root。

登录成功后服务端生成 30 天有效期的 `ai_chater_session` Cookie（`HttpOnly`、`SameSite=Lax`，生产启用 `Secure`）。`requireUser()` / `getCurrentUser()` 是受保护路径的统一鉴权入口。各会话、消息、附件与配置查询都按用户归属校验，避免跨账号读取。

## AI 与媒体

模型预设由 `AI_PRESETS_JSON` 提供，支持 `openai`、`openai-compatible`、`xai`、`anthropic`、`google`；密钥只通过每项的 `apiKeyEnv` 从环境变量读取。用户还可保存多套加密模型配置：`user_ai_configs`、`user_image_configs` 用 AES-256-GCM 保存密文、IV、认证标签、密钥 ID 与末四位，读取只返回脱敏信息。

生图与视频任务为数据库队列，由独立 worker 单并发消费：

- 生图：`POST /api/image-generations` 入队，`npm run image:worker` 处理，前端轮询 `/api/image-generations/:id`。
- 视频：`POST /api/video-generations` 入队，`npm run video:worker` 处理本地 ComfyUI 工作流，前端轮询 `/api/video-generations/:id`。

模型连接 Base URL 受白名单与 SSRF 校验约束，禁止凭据、私网、链路本地、内部主机名与重定向。

## 前端接口层

组件不直接调用 `fetch`，统一经 `client/api/*`：

| 模块 | 覆盖接口 |
| --- | --- |
| `auth.ts` | 注册、登录、登出 |
| `conversations.ts` | 会话增删改查 |
| `chat.ts` | 流式对话（异步文本迭代器） |
| `uploads.ts` | 图片上传与删除 |
| `presets.ts` | 对话/生图预设 |
| `image.ts` / `video.ts` | 异步任务创建、轮询、取消 |
| `model-configs.ts` | 多配置 CRUD 与 legacy 单条配置 |
| `profile.ts` | 个人资料与头像 |
| `companion.ts` | Companion 启动票据 |
| `http.ts` | `requestJson`、`requestVoid`、`requestJsonStatus`、`ApiRequestError` |

## API 路由索引

认证与账号：

- `POST /api/auth/register`、`POST /api/auth/login`、`POST /api/auth/logout`
- `GET /api/me`、`DELETE /api/me`、`PATCH /api/me/password`
- `GET /api/me/profile`、`GET/PUT/DELETE /api/me/avatar`

模型配置：

- 多配置：`GET/POST /api/me/model-configs`、`PUT/DELETE /api/me/model-configs/:id`、`POST /api/me/model-configs/:id/test`
- 预设：`GET /api/ai/presets`、`GET /api/ai/image-presets`
- legacy 单条（旧客户端过渡）：`/api/me/ai-config`、`/api/me/image-config`、`/api/me/video-config` 及其 `/test`

对话与会话：

- `POST /api/chat`
- `GET/POST /api/conversations`、`GET/PATCH/DELETE /api/conversations/:id`

文件与媒体：

- `POST /api/uploads`、`DELETE /api/uploads/:id`、`GET /api/attachments/:id`
- `POST /api/image-generations`、`GET/DELETE /api/image-generations/:id`
- `POST /api/video-generations`、`GET/DELETE /api/video-generations/:id`

Companion：

- `POST /api/companion/launch`
- `GET/POST /api/companion/conversations`、`GET/DELETE /api/companion/conversations/:id`
- `POST /api/companion/generate`
- `POST /api/internal/companion/exchange`

## 常用命令

```powershell
npm run dev          # 开发服务器
npm run build        # 生产构建
npm run start        # 运行生产构建
npm run lint         # ESLint（含分层护栏）
npm run test         # 单元测试
npm run image:worker # 生图 worker
npm run video:worker # 视频 worker
npm run airi:dev     # 启动 AIRI Stage Web（端口 5173）
npm run db:generate  # 从 schema 生成 migration
npm run db:migrate   # 执行 migration
npx tsc --noEmit     # 类型检查
```

## 运行注意事项

- 没有 `DATABASE_URL` 或未执行 `npm run db:migrate` 时，注册与登录会失败。
- 用户 API Key 使用 `AI_CONFIG_ENCRYPTION_KEY`（32 字节 Base64 主密钥）以 AES-256-GCM 加密。
- 生图/视频 worker 必须单独启动；Web 服务不会自行消费队列。
- 图片保存至 `UPLOAD_DIR`（默认 `data/uploads`），与 `.env` 均被 Git 忽略。
- 本项目按本机使用设计。对公网开放前需补充 HTTPS、注册策略、限流、日志与运维监控。
