# AI Chater 项目总览

更新时间：2026-09-12

本机部署的单体 AI 应用：对话、生图、生视频、AIRI Companion、账号与外观自定义。技术栈为 Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4、Drizzle ORM + MySQL、Vercel AI SDK。

分层与依赖规则见 `docs/architecture.md`。

## 一、页面

| 路由 | 文件 | 功能 |
| --- | --- | --- |
| `/` | `app/page.tsx` + `components/home/home-hero.tsx` | 公开展示首页：三屏整页滚动、背景轮播、AI 词汇气泡、作者介绍、启动入口 |
| `/login` | `app/(auth)/login/page.tsx` | 登录 |
| `/register` | `app/(auth)/register/page.tsx` | 注册 |
| `/chat` | `app/(chat)/chat/page.tsx` + `components/chat/chat-client.tsx` | 主工作台：对话 / 生图 / 视频 / Agent 工具切换、会话管理、模型配置 |
| `/companion` | `app/(companion)/companion/page.tsx` | AIRI Live2D 伴侣（跨端口 Stage Web + bridge） |
| `/profile` | `app/(profile)/profile/page.tsx` | 个人资料与头像裁切上传 |

全局：`app/layout.tsx` 挂载右下角外观控制面板；主题、背景、字体等存于浏览器 `localStorage`。

## 二、功能模块

- **账号认证**：开放注册、登录、退出；Argon2id 密码哈希 + Cookie 会话；修改密码与软删除账号（历史数据保留、用户名释放）。
- **对话**：多会话、流式回复、图片输入、Markdown 渲染、模型预设切换、会话重命名/删除。
- **Agent 工具链**：聊天工作台的 Agent 页，使用账号自己的加密对话配置驱动多步工具调用；内置 `current_time` 与 `calculate` 只读工具，前端展示执行步骤与工具调用时间线。
- **用户模型配置**：多套加密配置（对话/生图），AES-256-GCM 保存 API Key，支持测试连接、审计与限流；兼容旧单条配置接口。
- **生图**：异步数据库队列 + 单并发 worker，提示词/比例/清晰度/质量，结果网格与下载。
- **视频**：本地 ComfyUI Wan 工作流（文生/图生/图文），可选 MiniMax-H3 提示词改写，异步任务轮询与取消。
- **AIRI Companion**：一次性启动票据 + 运行时令牌，复用用户加密对话配置，跨端口 CORS。
- **文件**：图片上传（PNG/JPEG/WebP/GIF）、附件鉴权读取、头像上传与管理。
- **外观**：主题色、日夜模式、背景图与模糊度、聊天字体、气泡参数（浏览器端）。

## 三、接口清单

所有业务接口位于 `app/api/**`，HTTP 层只做鉴权、校验与响应。

### 认证与账号

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册并建立会话 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 退出并删除会话 |
| GET | `/api/me` | 当前用户 |
| DELETE | `/api/me` | 软删除账号（密码确认） |
| PATCH | `/api/me/password` | 修改密码（撤销全部会话） |
| GET | `/api/me/profile` | 个人资料与头像可用性 |
| GET/PUT/DELETE | `/api/me/avatar` | 读取/上传/删除头像 |

### 模型配置

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/api/me/model-configs` | 列出/新建多套配置 |
| PUT/DELETE | `/api/me/model-configs/:id` | 更新/删除配置 |
| POST | `/api/me/model-configs/:id/test` | 测试已保存配置 |
| GET | `/api/ai/presets` | 对话预设（系统 + 我的配置） |
| GET | `/api/ai/image-presets` | 生图预设 |
| GET/PUT/DELETE | `/api/me/ai-config` | legacy 对话单条配置 |
| POST | `/api/me/ai-config/test` | legacy 对话测试 |
| GET/PUT/DELETE | `/api/me/image-config` | legacy 生图单条配置 |
| POST | `/api/me/image-config/test` | legacy 生图测试（真实出图计费） |
| GET/PUT/DELETE | `/api/me/video-config` | 视频（ComfyUI）配置 |
| POST | `/api/me/video-config/test` | 测试 ComfyUI 连通性 |

### 对话与会话

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/chat` | 流式对话（text stream） |
| POST | `/api/agent/runs` | Agent 工具链运行（NDJSON：事件 + 文本增量） |
| GET/POST | `/api/conversations` | 会话列表/新建 |
| GET/PATCH/DELETE | `/api/conversations/:id` | 会话详情/重命名/删除 |

### 文件与媒体

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/uploads` | 上传图片 |
| DELETE | `/api/uploads/:id` | 删除未发送图片 |
| GET | `/api/attachments/:id` | 鉴权读取附件（图片/视频） |
| POST | `/api/image-generations` | 创建生图任务（幂等） |
| GET/DELETE | `/api/image-generations/:id` | 查询/取消生图任务 |
| POST | `/api/video-generations` | 创建视频任务 |
| GET/DELETE | `/api/video-generations/:id` | 查询/取消视频任务 |

### AIRI Companion

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/companion/launch` | 创建一次性启动票据 |
| GET/POST | `/api/companion/conversations` | 伴侣会话列表/新建（CORS） |
| GET | `/api/companion/conversations/:id` | 伴侣会话历史（CORS） |
| POST | `/api/companion/generate` | 伴侣流式生成（运行时令牌） |
| POST | `/api/internal/companion/exchange` | 票据换取运行时令牌 |

## 四、项目结构

```
app/                    页面与 HTTP 接口层
  (auth)/ (chat)/ (companion)/ (profile)/    路由分组页面
  api/**/route.ts                             Route Handler
  layout.tsx  globals.css  page.tsx
components/             前端组件（按功能域）
  home/ auth/ chat/ image/ video/ companion/ profile/ appearance/ agent/ pet/
client/                 前端能力层
  api/                  typed fetch 客户端（auth/chat/agent/conversations/uploads/presets/image/video/model-configs/profile/companion/http）
  home/ image/ video/ pet/ appearance 等纯前端工具
shared/                 前后端共享（messages / validators / config / video）
server/                 后端应用层
  http/                 RequestError、errorResponse、assertSameOrigin、routeError、Companion CORS
  security/             auth、account、api-key-crypto、url-safety、rate-limit、companion-auth
  db/                   Drizzle schema 与连接
  providers/            ai、ai-image、comfyui、minimax-h3
  services/             会话/聊天/Agent/账号/配置/生图/视频/伴侣/上传/头像/首页背景/审计/测试
  agent/                工具调用内核与内置工具（current_time、calculate）
  config.ts             环境变量读取
scripts/                image-worker.ts、video-worker.ts、部署脚本
drizzle/                数据库 migration
tests/                  Vitest 测试
data/uploads/           本地上传目录（Git 忽略）
data/comfyui-workflows/ ComfyUI 工作流模板
public/home-backgrounds/ 首页背景图
docs/                   architecture.md、project-overview.md、handoff/（历史交接）、roles/
integrations/airi/      AIRI 固定版本 bridge 与启动脚本
```

## 五、数据表（MySQL）

| 表 | 用途 |
| --- | --- |
| `users` | 账号、密码哈希、头像元信息、软删除 |
| `sessions` | 会话令牌摘要与过期时间 |
| `user_ai_configs` / `user_image_configs` | 加密的多套模型配置 |
| `user_video_configs` | ComfyUI/改写模型配置 |
| `conversations` | 会话（`kind`：chat / companion） |
| `messages` | 消息 parts（文本/图片/视频） |
| `attachments` | 附件元信息与生成来源 |
| `image_generations` / `video_generations` | 异步任务队列 |
| `model_config_audit_events` | 配置与生成审计（脱敏） |
| `rate_limit_states` | 账号级固定窗口限流 |
| `companion_launch_tickets` / `companion_runtime_tokens` | Companion 票据与运行时令牌 |

## 六、后台 worker

- `npm run image:worker`：消费 `image_generations`，调用图片模型并保存 PNG。
- `npm run video:worker`：消费 `video_generations`，调用 ComfyUI 工作流并保存视频。
- 两者使用 MySQL advisory lock 防止重复实例，启动时恢复被中断的任务。

## 七、常用命令

```powershell
npm run dev          # 开发服务器
npm run build        # 生产构建
npm run start        # 运行生产构建
npm run lint         # ESLint（含分层护栏）
npm run test         # 单元测试
npm run image:worker # 生图 worker
npm run video:worker # 视频 worker
npm run airi:dev     # AIRI Stage Web（端口 5173）
npm run db:generate  # 生成 migration
npm run db:migrate   # 执行 migration
npx tsc --noEmit     # 类型检查
```
