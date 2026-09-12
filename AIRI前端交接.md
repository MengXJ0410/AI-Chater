# AIRI 前端交接

## 当前目标

AI Chater 在保持既有聊天工作台的前提下，通过独立的 `/companion` 页面加载 AIRI Stage Web。首期只验收 Live2D 角色、文字输入和流式文本回复，不实现 VRM、语音、图像生成、工具调用或长期记忆。

## 入口和页面职责

- `components/chat-client.tsx` 的左侧“功能”导航提供 **AIRI** 入口，跳转 `/companion`；移动端跳转时关闭侧栏。
- `app/(companion)/companion/page.tsx` 要求现有登录会话，未登录时跳转 `/login`。
- `components/companion-client.tsx` 是 AI Chater 的运行时容器：读取用户已有的对话模型配置、获取一次性启动票据、加载 AIRI iframe，并显示加载、缺少模型、运行时不可用、bridge 超时和启动失败状态。
- AIRI iframe 使用 `AIRI_STAGE_URL`，开发环境默认 `http://localhost:5173`。页面是独立全屏舞台，不嵌入普通聊天工作区。

## 初始化协议

1. 页面请求 `GET /api/me/model-configs`，只展示 `kind=chat` 的既有配置。
2. 页面先探测 AIRI Stage Web 是否可连接；失败时显示“请执行 `npm run airi:dev`”。
3. 页面请求 `POST /api/companion/launch`，获得短期、一次性启动票据。
4. AIRI iframe 加载后，bridge 向父页面发送 `{ protocol: "ai-chater:companion", type: "ready" }`。
5. 父页面仅向 `AIRI_STAGE_URL` 的 origin 发送 bootstrap：票据、所选模型配置 UUID、AI Chater gateway origin。
6. bridge 兑换票据、创建或恢复 Companion 会话，并发回 `bootstrapped`。父页面在 10 秒内未收到 bridge 响应时显示诊断。

父页面和 bridge 只能接受协议名、发送方窗口和固定 origin 都匹配的消息。协议名为 `ai-chater:companion`。

## AIRI Bridge

Bridge 文件位于 `integrations/airi/bridge/companion-bridge.ts`。启动脚本会把它复制到被 Git 忽略的 `.runtime/airi/apps/stage-web/src/integrations/`，并在 AIRI 的 `main.ts` 导入。

Bridge 的职责：

- 在浏览器内存中保存短期运行时令牌、当前模型配置 UUID、Companion 会话 ID 和历史消息。
- 拦截 AIRI 对 `/chat/completions` 的请求，转发到 AI Chater 的 Companion Gateway。
- 将 AI Chater 的文本流转换为 AIRI 可消费的 OpenAI 风格 SSE 流。

禁止事项：

- 不得向 AIRI、HTML、iframe URL、`localStorage`、`sessionStorage`、Cookie 或日志传递 API Key。
- 不得把 AIRI 全量源码复制到 `app/`、`components/` 或提交到本仓库。
- 不得放宽 `postMessage` 的 target origin 或后端 CORS origin。

## 本地启动和验收

在两个终端分别运行：

```powershell
npm run dev
npm run airi:dev
```

确认 `.env` 包含：

```env
AIRI_STAGE_URL=http://localhost:5173
COMPANION_RUNTIME_ORIGIN=http://localhost:5173
```

浏览器验收：

- 登录后的聊天侧栏显示 AIRI；
- 点击后进入 `/companion`；
- AIRI 未启动时显示可行动错误和重试按钮；
- 保存至少一个对话模型后，AIRI Live2D 角色可见；
- bridge 完成启动，文字输入可获得流式回复；
- 刷新后能加载同一用户的 Companion 历史消息；
- 窄屏下侧栏跳转行为和舞台布局正常。

## 上游升级

升级 AIRI 前必须更新 `integrations/airi/VERSION` 中的 tag 与其指向的真实 commit（不能记录 annotated tag object），并重新验证：bridge 导入位置、聊天请求路径和请求体、Live2D 资源加载、pnpm 版本、依赖 patches、桌面与移动布局。Windows 证书链失败时脚本仅向 AIRI 子进程传递 Node 的 `--use-system-ca`，不会关闭 TLS 校验。Stage Web 启动使用 `--ignore-scripts` 跳过无关桌面原生安装脚本，但不使用 `--ignore-patches`；v0.11.3 的 MediaPipe 兼容性处理会校验 lockfile 标记。
