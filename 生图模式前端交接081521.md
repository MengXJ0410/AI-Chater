# 生图模式前端交接

更新时间：2026-08-15 21:00

## 目标

在现有聊天工作台中把“生图”占位页改为可用工作区，支持两条入口：

1. 用户主动进入“生图”模式，填写提示词和参数后生成图片。
2. 用户在“对话”模式明确提出生图请求，经意图路由确认后切换到“生图”模式，并使用同一套生图接口开始生成。

前端不接触 API Key，不直接调用 xAI 或 YYAPI，也不根据聊天模型名称猜测生图能力。生图模型、能力和参数范围全部以后端返回为准。

## 关键产品结论

当前配置的 `grok-4.5` 是文本模型，不应显示为可直接生图的模型。它可以用于理解生图意图或整理提示词，真正生成图片需要后端配置 `grok-imagine-image`、`grok-imagine-image-pro`，或经验证实现图片端点的兼容模型。

首期以“生图模式直接生成”为主路径。对话模式自动转入按以下优先级实现：

1. `/image <提示词>`、`/生图 <提示词>`：确定性切换并立即生成。
2. “生成一张……”“画一幅……”等明确请求：调用后端意图识别接口；只有 `intent=image` 且 `confidence >= 0.9` 时切换并开始生成。
3. “这张图怎么样”“如何画画”等含糊内容继续作为普通对话，不自动产生费用。

模式切换后必须保留原始提示词。一次提交只能进入 `/api/chat` 或 `/api/image-generations` 其中之一，禁止先发聊天请求再重复发起生图。

## 当前代码基础

- `components/chat-client.tsx` 已有 `activeTool: "chat" | "image" | "video" | "agent"`，但非对话模式目前只显示占位页。
- `MessagePart` 已支持 `{ type: "image", attachmentId }`，现有消息列表也能通过 `/api/attachments/:id` 展示图片。
- 当前 `supportsImages` 表示“聊天模型支持图片输入”，不是“支持图片生成”。新 UI 不得复用这个字段判断生图能力。
- 当前聊天响应是纯文本流。生图返回二进制资产元数据，不能复用文本流读取逻辑。

## 建议组件拆分

不要继续把全部逻辑堆入 `components/chat-client.tsx`。建议新增：

| 文件 | 职责 |
| --- | --- |
| `components/image-workspace.tsx` | 生图工作区、历史结果和空状态 |
| `components/image-composer.tsx` | 提示词、参考图、比例、清晰度和发送/取消 |
| `components/generated-image-grid.tsx` | 生成中骨架、图片预览、下载和重试 |
| `lib/image-generation-client.ts` | 请求类型、响应解析和状态转换，不保存密钥 |
| `lib/image-intent.ts` | 只实现 `/image` 等确定性命令识别；自然语言最终判断由后端完成 |

`ChatClient` 只负责工具模式、当前会话、共享消息状态和把对话意图移交给生图工作区。

## 生图工作区

顶部模型选择器改为读取 `GET /api/ai/image-presets`，不要使用聊天模型列表。没有可用生图模型时，显示“请先配置生图模型”并提供打开配置抽屉的命令按钮。

首期控件：

- 提示词多行输入框，最大长度以后端契约为准。
- 比例使用分段控件或菜单，候选值来自预设能力；常用值为 `1:1`、`16:9`、`9:16`、`4:3`、`3:4` 和 `auto`。
- 清晰度使用菜单。只有能力声明支持时显示 `1k/2k`；`2k` 只对支持的模型开放。
- 质量使用 `low/medium/high` 菜单，仅在能力声明支持时显示。
- 数量默认 `1`，首期最多 `4`；发送按钮附近需要显示数量，避免意外产生多份费用。
- 参考图复用现有上传入口，但按 `supportsImageEdit` 控制是否可用，最多 4 张。

生成期间保持稳定的图片画布尺寸，按所选比例显示骨架状态。发送按钮切换为停止按钮；取消通过同一个 `AbortController` 中止 `/api/image-generations` 请求。

成功后展示真实图片，不显示 base64。图片地址固定使用后端返回的受保护 URL。每张图片提供预览和下载图标按钮，陌生图标带 tooltip。失败状态保留提示词和参数，提供重试命令；重试必须生成新的 `requestId`。

## 前端状态机

```text
idle
  -> resolving-intent
  -> generating
  -> complete
  -> error
  -> cancelled
```

约束：

- `resolving-intent` 只用于对话模式自然语言识别；直接生图不经过它。
- 进入 `generating` 后禁用模型和参数修改，但允许取消。
- 组件卸载、切换账号或开始新请求前应中止旧请求。
- 请求取消不显示普通错误；服务端已成功完成并返回资产时，以服务端结果为准。
- 自动转入时先更新 `activeTool="image"`、回填提示词和参数，再开始请求，让用户看得见当前动作并可立即取消。

## 接口契约

### `GET /api/ai/image-presets`

```json
{
  "presets": [
    {
      "id": "user-image-config",
      "label": "我的生图模型",
      "provider": "xai",
      "model": "grok-imagine-image",
      "capabilities": {
        "aspectRatios": ["1:1", "16:9", "9:16", "auto"],
        "resolutions": ["1k"],
        "qualities": ["low", "medium", "high"],
        "maxImages": 4,
        "supportsImageEdit": true
      }
    }
  ]
}
```

### `POST /api/image-intents`

第二阶段接口。只有客户端命中候选生图表达时调用，避免每条聊天都增加一次模型请求。

请求：

```json
{ "text": "帮我生成一张雨夜东京街道", "chatPresetId": "user-config" }
```

响应：

```json
{
  "intent": "image",
  "confidence": 0.97,
  "prompt": "雨夜的东京街道，霓虹灯倒映在湿润路面上",
  "suggestedAspectRatio": "16:9"
}
```

后端返回 `intent=chat`、置信度不足、接口失败或当前没有生图预设时，继续走普通聊天或显示一次确认提示，不得静默丢失用户输入。

### `POST /api/image-generations`

请求：

```json
{
  "requestId": "客户端生成的 UUID",
  "conversationId": "当前会话 UUID",
  "imagePresetId": "user-image-config",
  "prompt": "雨夜的东京街道，电影感，霓虹灯倒影",
  "referenceAttachmentIds": [],
  "aspectRatio": "16:9",
  "resolution": "1k",
  "quality": "high",
  "count": 1,
  "source": "image-mode"
}
```

从对话自动转入时 `source` 为 `chat-handoff`。后端同步实现首期返回 `201`：

```json
{
  "generation": {
    "id": "generation UUID",
    "status": "completed",
    "model": "grok-imagine-image",
    "prompt": "雨夜的东京街道，电影感，霓虹灯倒影",
    "images": [
      {
        "attachmentId": "attachment UUID",
        "url": "/api/attachments/attachment UUID",
        "mimeType": "image/webp",
        "width": 1376,
        "height": 768
      }
    ],
    "warnings": []
  }
}
```

接口失败按现有 `{ "error": "用户可读消息" }` 处理。不要展示上游响应正文、请求头或 Provider 错误对象。

## 配置抽屉调整

配置抽屉建议增加“对话模型 / 生图模型”标签页。生图配置读取 `GET /api/me/image-config`，保存、测试和删除分别使用对应接口。测试生图连接会真实生成一张图片并可能收费，按钮文案和确认提示必须明确这一点。

生图模型配置至少包含 Provider、Base URL、Image Model 和 API Key。即使对话和生图使用同一 Key，也由后端处理复用；前端不得从已保存的对话配置读取或拼接密钥。

## 验收

- 直接进入生图模式可以生成、取消、重试、预览和下载。
- `/image` 路由和高置信意图路由只发起一次生图请求，并保留原提示词。
- 含糊文本不会自动生图；没有生图模型时不会错误使用 `grok-4.5`。
- 参考图只在模型支持编辑时启用，比例、分辨率和质量选项严格来自能力字段。
- 刷新会话后生成图片仍能通过现有鉴权附件路由展示。
- API Key、完整上游错误和 base64 图片不会进入 React state、localStorage、日志或页面源码。
- 桌面与移动端检查工具栏、固定比例画布、长提示词、4 张结果和错误状态无重叠或溢出。
- 完成后运行 `npx tsc --noEmit`、`npm run lint`、`npm test` 和 `npm run build`。

