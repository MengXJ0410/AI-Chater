# AI Chater 交接文档

更新时间：2026-08-15

## 项目定位

AI Chater 是面向本机 Node.js 部署的单体 AI 聊天应用。它提供开放注册、账号登录、多会话聊天、流式 AI 回复、模型预设切换、图片输入，以及仅存于浏览器的外观自定义。

技术栈：Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4、Drizzle ORM、mysql2、Vercel AI SDK、Argon2id、Zod、React Markdown 和 Lucide。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `app/` | 页面和 Route Handler。`/` 是公开展示首页，认证页在 `app/(auth)`，聊天页在 `app/(chat)`。 |
| `components/` | 客户端界面组件：认证表单、聊天工作区、首页展示、外观控制与 Markdown 渲染。 |
| `lib/` | 认证、数据库、AI provider、上传、输入校验、外观和首页数据等业务逻辑。 |
| `lib/db/schema.ts` | Drizzle 的 MySQL 数据表定义。 |
| `drizzle/` | 已生成的数据库 migration。 |
| `data/uploads/` | 默认的本地图片上传目录，运行时生成，已被 Git 忽略。 |
| `public/home-backgrounds/` | 首页背景图目录，支持 JPG、JPEG、PNG、WebP、AVIF。 |
| `tests/` | Vitest 单元测试。 |

## 数据与认证

MySQL 8.0+ 是必要依赖。`users` 保存用户名、Argon2id 密码哈希和可选的 `deleted_at`；`sessions` 保存随机会话令牌的 SHA-256 摘要及过期时间；`conversations`、`messages` 和 `attachments` 分别保存会话、消息 parts 和图片元信息。数据库初始化 SQL 位于 `docs/local-mysql-init.sql`，应用使用专用的 `ai_chater_app` 账号，不使用 root。

登录成功后服务端生成 30 天有效期的 `ai_chater_session` Cookie。Cookie 采用 `HttpOnly`、`SameSite=Lax`，生产环境启用 `Secure`。`getCurrentUser()` 和 `requireUser()` 是所有受保护服务端路径的统一鉴权入口；过期或已停用账号的当前令牌会被删除。`PATCH /api/me/password` 修改密码并撤销全部会话；`DELETE /api/me` 通过密码确认软删除账号、写入唯一墓碑用户名并撤销全部会话，历史数据保留且原用户名可重新注册。各会话、消息和附件查询都按用户归属校验，避免跨账号读取。

## AI 与图片处理

模型预设由环境变量 `AI_PRESETS_JSON` 提供，支持 `openai`、`openai-compatible`、`xai`、`anthropic`、`google`。每个预设的密钥只通过其 `apiKeyEnv` 从环境变量读取，绝不能写入客户端代码或 JSON 配置。每位用户还可保存一套加密模型配置；`user_ai_configs` 用 AES-256-GCM 保存 API Key 密文、密钥 ID、IV、认证标签和末四位，不保存明文。

`GET/PUT/DELETE /api/me/ai-config` 分别读取脱敏配置、加密保存配置和删除当前用户配置。首次保存必须提交 API Key；后续保存可省略 API Key 以保留旧值。`/api/ai/presets` 始终返回系统预设，并在用户已配置时追加固定的 `user-config`（“我的配置”）预设。`/api/chat` 会校验用户、会话、预设和附件，再按系统预设或用户配置通过 Vercel AI SDK 流式返回模型输出，结束后保存实际模型名。用户配置默认不支持图片输入。图片上传限制为 PNG、JPEG、WebP、GIF，最大值由 `MAX_UPLOAD_BYTES` 控制，默认 10 MB；文件保存在 `UPLOAD_DIR`，由鉴权读取路由提供。

## 页面与外观

- `/`：公开展示首页。服务端读取登录状态和 `public/home-backgrounds` 图片列表；客户端处理 9 秒轮播、1.4 秒淡入淡出、气泡词汇与鼠标排斥。未登录的启动按钮进入 `/register`，已登录进入 `/chat`。
- `/login`、`/register`：独立认证页面，复用 `components/auth-form.tsx`，不改变认证接口。
- `/chat`：会话侧栏、模型选择、消息流、图片上传与流式生成界面。
- 根布局始终加载右下角 `😋` 外观控制。主题色、背景图透明度和模糊度、浏览器端压缩后的背景图片都保存在当前浏览器的 `localStorage` 键 `ai-chater-appearance-v1`，不写入数据库。

首页轮播背景优先于外观控制上传的全局背景；认证和聊天页面继续使用外观控制背景。

## 本机启动

1. 使用本机 MySQL 管理员执行 `docs/local-mysql-init.sql`，并替换其中的应用账号密码。
2. 复制 `.env.example` 为 `.env`，至少填写 `DATABASE_URL`、`AI_PRESETS_JSON` 及相应 API Key；数据库 URL 中的特殊密码字符必须 URL 编码。
3. 执行 `npm install`、`npm run db:migrate`、`npm run dev`；启用生图时另开终端执行 `npm run image:worker`，或直接使用 `一键启动.bat` 同时启动两者。
4. 访问 `http://localhost:3000`。

常用验证命令：`npx tsc --noEmit`、`npm run lint`、`npm run test`、`npm run build`。

## 运行注意事项

- 没有 `DATABASE_URL` 或尚未执行 `npm run db:migrate` 时，注册和登录会失败；这是配置未完成，不是前端问题。
- 软删除账号不会删除数据库记录或 `data/uploads` 中的图片文件；本轮没有普通用户恢复接口。
- 用户 API Key 使用 `AI_CONFIG_ENCRYPTION_KEY` 提供的 32 字节 Base64 主密钥，以 AES-256-GCM 加密保存；读取接口只返回是否配置和末四位。
- 连接方案中的 Base URL 必须为服务端目录中的 HTTPS 公网域名。服务端拒绝凭据、私网、链路本地、内部主机名和未经允许的重定向；客户端不能提交任意 URL。
- 应用按本机使用设计。对公网开放前需补充 HTTPS、注册策略、限流、日志与运维监控。
- 首页背景不内置图片。将图片放入 `public/home-backgrounds` 后，下一次请求首页会按文件名顺序自动纳入轮播。
- 文件上传目录需要由运行 Node 进程拥有读写权限，并应定期管理磁盘空间。
- 生图任务是数据库队列，Web 服务不会自行消费；生产或手工启动时必须同时运行单实例 `npm run image:worker`。worker 使用 MySQL advisory lock 防止重复实例并发计费。

## Chat 用户级模型配置

前端配置抽屉已接入服务端：打开工作台时读取脱敏配置和连接方案目录，常用方案只选择并填写 API Key，选择“自定义预设”后可编辑配置名称、Provider、Base URL 和 Model。保存后刷新模型列表并选择“我的配置”，删除后回退到首个系统预设。API Key 只用于当前次保存请求，不写入 `localStorage`，成功后立即清空输入状态；配置名称、方案 ID 和连接参数保存在 `user_ai_configs`，重新登录自动恢复。无法匹配新目录的旧记录仍以只读兼容项保留。用户配置按文本模型处理，不支持图片输入。

配置连接的实际流程：确认 `.env` 已设置 `DATABASE_URL`、`AI_CONFIG_ENCRYPTION_KEY`、`USER_AI_ALLOWED_BASE_URLS`；登录后打开“配置”抽屉；选择连接方案并核对 Provider、Base URL、Model；输入对应 Provider 的 API Key；点击“测试连接”；测试成功后点击“保存配置”；选择聊天顶部的“我的配置”；发送普通文本消息验证正式链路。测试连接只使用当前输入（API Key 为空时复用当前账号已保存密钥）发起一次最小请求，不写入 `user_ai_configs`，也不创建会话或消息。测试可能产生极少量调用费用。

排错要点：YYAPI 使用 `https://www.yyapi.cloud/v1`，且 Key 必须来自 YYAPI 控制台；401 多为 Key 无效或 Provider 不匹配，404 多为 `/v1` 路径、模型 ID 或接口路径不兼容，429 多为额度、频率或账户权限；URL 错误通常是 HTTP 公网地址、IP/内网主机、账号信息、查询参数或片段导致。连接测试和正式聊天均对上游错误返回通用提示，不向客户端暴露 API Key 或上游响应正文。

## 用户头像服务

`users` 通过 migration 增加 `avatar_storage_key`、`avatar_mime_type` 和 `avatar_updated_at`。`GET /api/me/profile` 返回当前用户及头像缓存 URL；`PUT/GET/DELETE /api/me/avatar` 只按当前登录账号操作，不接受用户 ID。上传文件由服务端使用 Sharp 解码并校验 JPEG、PNG、WebP 真实格式、512×512 尺寸和 2 MB 上限，随后统一保存为 `UPLOAD_DIR` 下的随机 WebP 文件，不写入 `attachments`。替换头像先写新文件再更新数据库，删除账号时清理头像文件；头像不存在时读取返回 404。

## 生图后端

## 多模型配置、审计与限流

数据库迁移 `0008_multi_model_configs.sql` 将原来每账号一条的 `user_ai_configs` 和 `user_image_configs` 升级为 UUID 主键、多记录表，迁移时原有 AES 密文、IV、认证标签、密钥 ID 和末四位原样保留。`image_generations.image_config_id` 记录创建任务的图片配置，因此编辑或删除一条配置只会取消该配置尚未完成的任务。

多配置 API 是 `GET/POST /api/me/model-configs`、`PUT/DELETE /api/me/model-configs/:id`、`POST /api/me/model-configs/:id/test`。所有 ID 都必须属于当前登录账号，跨账号访问返回 404。配置写入、测试、生成会写入 `model_config_audit_events`，不会写 API Key、提示词、上游正文或私有路径。`rate_limit_states` 使用 MySQL 事务行锁实现固定一小时窗口，多实例共享同一额度；环境变量及默认值见 `.env.example`。

旧 `/api/me/ai-config` 和 `/api/me/image-config` 继续代理最近更新的一条同类配置，供旧客户端过渡。`user-config` 与 `user-image-config` 也仍可在运行时解析到最近记录；新客户端使用带 UUID 的运行时 ID。worker 启动时和每 24 小时执行审计清理，清理失败仅记录错误类型，不能影响生图队列。

生图配置独立存放于 `user_image_configs`，支持 `xai-compatible` 与 `openai-compatible`，密钥加密和活动密钥轮换与聊天配置一致。`GET/PUT/DELETE /api/me/image-config` 管理当前账号配置，`POST /api/me/image-config/test` 会真实生成并删除一张收费测试图。Base URL 必须命中 `USER_AI_ALLOWED_BASE_URLS`，返回 URL 仅允许同域或 `USER_IMAGE_ALLOWED_OUTPUT_HOSTS` 中的公共域名。

`POST /api/image-generations` 创建 `queued` 任务并以 `(user_id, request_id)` 保证幂等；worker 单并发调用 Provider、校验真实图片并统一保存 PNG，再把真实宽高写入 assistant 图片消息关联的 generated attachment。历史和普通上传附件允许没有宽高。配置变更、配置删除和账号软删除会取消排队任务并请求中止运行任务。首期每次一张、无自动重试、无参考图编辑；完整前端契约见 `生图模式后端对前端交接08152143.md`。
