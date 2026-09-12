# AIRI 后端交接

## 数据和范围

Companion 复用 AI Chater 现有用户、`conversations` 和 `messages`，不新增独立消息表。

- `drizzle/0009_companion_runtime.sql` 为 `conversations` 增加 `kind`，值为 `chat` 或 `companion`。
- 普通聊天接口默认只处理 `kind=chat`。
- Companion 接口只处理 `kind=companion`，并且每个查询都校验当前用户归属。
- `companion_launch_tickets` 保存启动票据摘要、用户、session、nonce、目标、过期和消费时间。
- `companion_runtime_tokens` 保存运行时令牌摘要、用户、session、过期和注销时间。

首期不新增角色配置、关系状态、长期记忆或 RAG 数据表。

## Companion Gateway

已实现接口：

| 接口 | 鉴权与行为 |
| --- | --- |
| `POST /api/companion/launch` | 需要 AI Chater 登录会话和同源请求；创建 2 分钟一次性启动票据。 |
| `POST /api/internal/companion/exchange` | AIRI bridge 提交票据；原子消费票据并返回 10 分钟运行时令牌。 |
| `GET/POST /api/companion/conversations` | 需要 Bearer 运行时令牌；读取或创建当前用户的 Companion 会话。 |
| `GET /api/companion/conversations/:id` | 需要 Bearer 运行时令牌；读取当前用户自己的 Companion 历史。 |
| `POST /api/companion/generate` | 需要 Bearer 运行时令牌；校验会话和模型配置 UUID，流式生成并持久化消息。 |

运行时令牌绑定创建它的登录 session。登录退出时，`lib/auth.ts` 会撤销该 session 的全部 Companion 运行时令牌；session 过期、令牌过期、重复兑换和跨用户资源访问必须返回失败。

## 模型和凭据

- 请求只传入已有对话模型配置 UUID，不传 API Key。
- `lib/model-configs.ts` 复用用户级加密模型配置；服务端解密后通过既有 Provider 链路调用模型。
- 默认角色提示词位于 `lib/companion.ts`，版本为 `catgirl-v1`。
- `POST /api/companion/generate` 保存用户和助手消息，并记录模型配置审计事件；客户端断开时通过请求 signal 取消上游流。

安全边界：API Key 不得出现在 API 响应、AIRI 配置、HTML、客户端 JSON、URL、浏览器存储、Cookie 或日志中。数据库仅保存票据和令牌的 SHA-256 摘要。

## 跨域和运行配置

`lib/companion-http.ts` 仅对 `COMPANION_RUNTIME_ORIGIN` 设置 Companion API 的 CORS 响应头。开发环境：

```env
AIRI_STAGE_URL=http://localhost:5173
COMPANION_RUNTIME_ORIGIN=http://localhost:5173
```

生产环境必须把两个值更新为 AIRI 的公开运行时 origin，并在反向代理中保留 AIRI 静态资源和 WebSocket 所需转发。生产域名、代理软件与进程托管尚未定稿。

## 验收与待办

已覆盖的单元契约包括 payload 校验、角色提示词版本以及 CORS origin 限制。端到端验收需要在 AIRI Stage Web 成功启动后完成：

- 未登录访问 `/companion` 跳转登录；
- 票据过期、重复兑换、退出后使用和跨用户访问失败；
- 选择已有模型配置 UUID 后流式回复并正确持久化；
- 普通聊天与 Companion 会话隔离；
- API Key 不泄露到浏览器或 AIRI 运行时；
- 运行 `tsc`、lint、test、build，以及 AIRI 自身 typecheck、build、test。

后续功能如长期记忆、RAG、关系状态或角色配置必须以新 migration 和独立授权边界实现，不能把数据混入当前基础会话链路。
