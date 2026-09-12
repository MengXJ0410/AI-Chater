# AIRI 项目部署

文档日期：2026-08-18

文档性质：部署与接入方案，供后续协作 AI 实施时参考。本文件不代表已经完成 AIRI 接入，也不包含具体代码实现喵。

## 1. 项目目标

将 [AIRI](https://github.com/moeru-ai/airi) 作为 AI Chater 的独立虚拟人物运行时接入：用户登录现有 AI Chater 后进入 `/companion`，在网页中与 Live2D 或 VRM 虚拟人物互动喵。

整体目标包括：

- 使用当前 AI Chater 的用户账号和权限体系。
- 支持用户在服务端安全配置自己的模型 API Key。
- 首期提供默认猫娘角色、角色形象和文字流式对话。
- 后续逐步扩展语音、生图、生视频、记忆、RAG、工具调用和多 Agent 工作流喵。

## 2. AIRI 项目概况

- 官方仓库：<https://github.com/moeru-ai/airi>
- 许可证：MIT License。集成或分发时保留版权和许可证声明喵。
- 技术形态：TypeScript/pnpm 多包仓库，不是可直接安装的单一 React 聊天组件。
- 主要能力：Stage Web、Live2D、VRM、模型 Provider、语音、记忆和 Agent 扩展。
- AIRI 的 Web 端主要使用自己的应用和运行时结构，与当前项目的 Next.js/React 单体架构不同喵。

因此，第一阶段采用独立运行时接入，不把 AIRI 全量源码复制到 AI Chater，也不直接把 AIRI 当作普通 npm 依赖安装喵。

## 3. 推荐部署架构

```text
浏览器
  |
  | 访问 AI Chater
  v
Next.js :3000
  |-- 用户注册、登录、MySQL、模型配置
  |-- /companion 入口
  |-- Companion Model Gateway
  |
  | 内部票据与模型请求
  v
AIRI Stage Web 独立服务
```

职责边界：

- AI Chater 负责账号、权限、MySQL 数据、API Key 加密配置和审计。
- AIRI 负责角色渲染、角色状态、Live2D/VRM、互动界面和运行时表现。
- AIRI 不直接读取 AI Chater 数据库，通过受控接口获取必要的身份和模型能力喵。
- API Key 不进入浏览器、AIRI 静态资源、URL、localStorage 或普通客户端 JSON。
- 开发环境使用独立端口；生产环境通过反向代理统一域名，并正确转发 WebSocket、音频和静态资源喵。

## 4. 部署阶段

### 阶段一：独立运行验证

- 固定 AIRI 的 release 或 commit，不直接跟随未经验证的 `main` 分支。
- 按 AIRI 官方 pnpm 流程安装并启动 Stage Web。
- 验证角色资源加载、文字输入、流式回复和本地模型配置。
- 记录端口、静态资源基路径、WebSocket 路径、浏览器要求和启动命令。
- 本阶段不修改 AI Chater 的业务代码喵。

### 阶段二：网站入口

- 新增受保护的 `/companion` 页面，未登录用户跳转 `/login`。
- 增加 AIRI 运行时地址配置和加载容器。
- 增加运行时离线、资源加载失败、浏览器不支持 WebGPU/音频等降级状态。
- 扩展一键启动脚本，同时启动 Next.js 和 AIRI 两个服务，避免重复启动喵。

### 阶段三：账号桥接

- Next.js 登录后创建一次性、短期有效的启动票据。
- AIRI 服务端兑换票据，获取最小化用户身份与能力范围。
- 票据绑定用户、随机 nonce、目标运行时和过期时间，只能兑换一次。
- 票据只保存摘要，不放入长期 Cookie，不写入日志，也不作为 API Key 的替代品喵。

### 阶段四：模型网关

- 复用 AI Chater 现有的用户级加密模型配置。
- 由 Next.js 服务端解密 API Key 并调用 Provider。
- AIRI 通过统一的 Companion Model Gateway 获取文本流式回复。
- Gateway 必须支持取消生成、超时、上游错误转换和调用审计喵。

### 阶段五：角色能力

首期只包含：

- 一个默认猫娘角色。
- Live2D 或 VRM 形象展示。
- 文字输入和流式文字回复。
- 基础角色提示词和短期上下文。

首期暂不包含：

- 语音识别和语音合成。
- 长期记忆和 RAG。
- 生图、生视频和媒体工作流。
- 游戏控制、联网搜索和多 Agent 工作流喵。

## 5. 目录规划

```text
integrations/
  airi/
    README.md
    VERSION
    patches/
    config/
    scripts/

app/
  (companion)/
    companion/
      page.tsx

app/api/companion/
  launch/
  generate/

app/api/internal/companion/
  exchange/
  revoke/
```

目录约束：

- `integrations/airi` 只保存 AIRI 版本、启动配置、必要补丁和本地脚本。
- 不把 AIRI 全量源码复制到 `app/` 或 `components/`。
- 任何 AIRI 上游补丁都必须记录来源 commit、修改原因和升级影响。
- 新增的 Companion 业务逻辑应保持在现有 `app/`、`components/`、`lib/` 边界内，不修改无关聊天功能喵。

## 6. 安全要求

- API Key 只允许存在服务端加密配置中。
- 禁止将 API Key 放入 iframe URL、浏览器 localStorage、HTML、静态资源或客户端 JSON。
- 启动票据使用摘要存储，设置短过期时间并支持一次性消费。
- 所有 Companion API 必须验证当前登录用户和资源归属。
- 用户只能访问自己的角色配置、对话、任务和生成结果。
- AIRI 上游升级前必须重新检查依赖、许可证、WebSocket、模型调用和浏览器权限行为喵。

## 7. 启动与配置

实施阶段需要补充并记录以下配置：

- Node.js 版本、pnpm 版本、MySQL 版本和 AIRI 固定版本。
- AI Chater 服务端口：`3000`。
- AIRI Stage Web 独立服务端口。
- AIRI 运行时地址和生产反向代理路径。
- Companion 内部桥接密钥，使用服务端环境变量保存。
- 允许的模型 Base URL 列表。
- Next.js 和 AIRI 的一键启动、停止与日志查看命令喵。

本机实施顺序：

1. 先按 AIRI 官方文档独立启动并验证 Stage Web。
2. 再启动 AI Chater 并确认登录、数据库和用户级模型配置正常。
3. 最后接入 `/companion`、票据桥接和 Companion Model Gateway。

## 8. 验收标准

- 登录用户可以进入 `/companion`，未登录用户无法直接访问。
- AIRI 角色页面和角色资源能正常加载。
- 文本消息可以通过模型网关流式返回。
- API Key 不出现在客户端响应、浏览器存储、URL 和日志中。
- 票据过期、重复使用、跨用户使用和退出后使用都会失败。
- Next.js 与 AIRI 可以通过一键脚本启动，且端口冲突有明确提示。
- 桌面端和移动端都有基本可用的工作区布局。
- 运行 `npx tsc --noEmit`、`npm run lint`、`npm run test` 和 `npm run build` 通过。
- AIRI 自身的 typecheck、build 和 test 也在固定版本上通过喵。

## 明确不包含

本文档不负责直接实施以下工作：

- 直接下载、复制或修改 AIRI 源码。
- 直接实现 `/companion` 页面和接口。
- 直接设计或执行数据库 migration。
- 直接接入语音、生图、生视频或游戏 Agent。
- 直接替换当前 AI Chater 的聊天系统喵。

后续 AI 小弟实施时，必须先阅读本文档、根目录 `CLAUDE.md`、`AGENTS.md` 和 `交接文档.md`，并在完成对应阶段后更新 `更新日志.md` 喵。
