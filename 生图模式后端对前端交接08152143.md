# 生图模式后端对前端交接

更新时间：2026-08-15 21:43

## 联调结论

生图后端已采用独立账号配置和异步任务队列。前端只访问本站 API，不直接请求 Provider，不保存 API Key 或 base64。Web 服务与 `npm run image:worker` 必须同时运行；`一键启动.bat` 已包含 worker。

首期约束：每次只生成 1 张图，只支持文本生图，不支持参考图编辑、自动重试或 Agent 工具调用。`grok-4.5` 是聊天模型，不是图片模型；YYAPI 用户必须填写其控制台实际提供的图片模型 ID。

## 前端评估结论

当前前端请求结构与本交接契约一致，可以直接联调。已确认的适配点：

- 生图入口固定为 `/chat?tool=image`，不新增独立路由。
- 预设解析兼容当前扁平能力字段；不会把普通对话预设当作图片模型。
- 创建任务不发送 `count`，`referenceAttachmentIds` 在 `supportsImageEdit=false` 时保持为空。
- `conversationId` 必须是当前账号已有会话；没有会话时前端先创建，再提交任务。
- `202` 响应进入轮询，`200` 终态响应直接消费；结果从 `attachments` 读取。
- 保存或删除生图配置后，前端立即重新读取 `/api/ai/image-presets`，不继续使用旧能力。
- API 返回的可读 `error` 优先于 HTTP 通用文案，不能把“任务不存在”等所有 `404` 错误误报为“接口未接入”。
- 前端不根据错误自动重复 `POST`；用户点击重试时生成新的 `requestId`。

仍需共同遵守的边界：图片历史目前不在刷新后恢复，前端不保存 generation 列表；参考图入口仅作能力占位；图片附件宽高当前未知，结果卡片必须允许仅显示 MIME 类型。

## 生图配置

所有接口都要求登录；`PUT/DELETE/POST test` 还要求同源请求。

### `GET /api/me/image-config`

无配置时 `config` 为 `null`。API Key 永不返回明文。

```json
{
  "config": {
    "name": "我的生图模型",
    "provider": "xai-compatible",
    "baseUrl": "https://api.x.ai/v1",
    "model": "grok-imagine-image",
    "apiKeyConfigured": true,
    "apiKeyLast4": "1234"
  },
  "providers": [
    {
      "id": "xai-compatible",
      "label": "xAI Compatible",
      "capabilities": {
        "supportsImageGeneration": true,
        "supportsImageEdit": false,
        "aspectRatios": ["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16", "2:1", "1:2"],
        "resolutions": ["1k", "2k"],
        "qualities": ["low", "medium", "high"],
        "maxImages": 1
      }
    },
    {
      "id": "openai-compatible",
      "label": "OpenAI Compatible",
      "capabilities": {
        "supportsImageGeneration": true,
        "supportsImageEdit": false,
        "aspectRatios": ["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16", "2:1", "1:2"],
        "resolutions": [],
        "qualities": [],
        "maxImages": 1
      }
    }
  ]
}
```

### `PUT /api/me/image-config`

请求为 strict JSON，不能附加其他字段。首次保存必须提供 `apiKey`；已有配置时省略表示保留原 Key。保存、切换或替换配置会取消该账号尚未完成的旧任务。

```json
{
  "name": "我的生图模型",
  "provider": "xai-compatible",
  "baseUrl": "https://api.x.ai/v1",
  "model": "grok-imagine-image",
  "apiKey": "仅首次或替换时提交"
}
```

成功返回 `{ "config": <与 GET.config 相同的脱敏对象> }`。

### `POST /api/me/image-config/test`

请求体与 PUT 相同。已有配置时可省略 API Key。接口真实生成一张最小测试图并立即删除，可能产生 Provider 费用，不写配置、消息、附件或 generation。

```json
{
  "ok": true,
  "model": "grok-imagine-image",
  "chargedImageGenerated": true
}
```

### `DELETE /api/me/image-config`

无请求体。成功返回 `{ "ok": true }`，同时取消排队任务并请求中止运行任务；已完成图片不删除。

## 图片预设

### `GET /api/ai/image-presets`

无配置时返回 `{ "presets": [] }`。有配置时返回一个固定 ID 的扁平能力对象：

```json
{
  "presets": [
    {
      "id": "user-image-config",
      "label": "我的生图模型",
      "model": "grok-imagine-image",
      "supportsImageGeneration": true,
      "supportsImageEdit": false,
      "aspectRatios": ["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16", "2:1", "1:2"],
      "resolutions": ["1k", "2k"],
      "qualities": ["low", "medium", "high"],
      "maxImages": 1
    }
  ]
}
```

`openai-compatible` 的 `resolutions/qualities` 为空；提交生成时仍使用默认 `resolution="1k"`、`quality="high"`。

前端不能因为能力数组为空而把对应控件渲染成可选的伪参数。当前实现会禁用空能力控件，并仅在提交时使用上述后端默认值。

## 创建与轮询任务

### `POST /api/image-generations`

请求为 strict JSON，当前不接受 `count`。`referenceAttachmentIds` 必须为空。

```json
{
  "requestId": "客户端生成的 UUID",
  "conversationId": "当前用户会话 UUID",
  "imagePresetId": "user-image-config",
  "prompt": "雨夜的东京街道",
  "referenceAttachmentIds": [],
  "aspectRatio": "16:9",
  "resolution": "1k",
  "quality": "high",
  "source": "image-mode"
}
```

新任务返回 HTTP `202`；相同用户、相同 `requestId` 和相同内容返回原任务，不重复生成或新增消息。相同 `requestId` 改变内容返回 `409`。任务已是终态时幂等响应可为 HTTP `200`。

```json
{
  "generation": {
    "id": "generation UUID",
    "requestId": "request UUID",
    "status": "queued",
    "provider": "xai-compatible",
    "model": "grok-imagine-image",
    "aspectRatio": "16:9",
    "resolution": "1k",
    "quality": "high",
    "errorCode": null,
    "createdAt": "2026-08-15T13:43:00.000Z",
    "startedAt": null,
    "completedAt": null,
    "attachments": []
  }
}
```

### `GET /api/image-generations/:id`

每约 1 秒轮询。只允许读取当前账号任务；其他账号看到 `404`。状态集合：

- `queued`：等待 worker。
- `running`：Provider 调用中。
- `cancel_requested`：已请求取消，继续轮询到终态。
- `completed`：生成成功。
- `failed`：失败，读取脱敏 `errorCode`。
- `cancelled`：已取消。

前端轮询状态机：

| 后端状态 | 前端行为 |
| --- | --- |
| `queued` | 保持生成骨架并继续轮询；连续约 60 秒仍未离开队列时停止轮询，提示检查 `image:worker`，不得自动重新 POST。 |
| `running` | 保持生成状态，每约 1 秒轮询。 |
| `cancel_requested` | 显示正在取消并继续轮询，直至终态。 |
| `completed` | 停止轮询，使用受保护附件 URL 展示和下载。 |
| `failed` | 停止轮询，根据脱敏 `errorCode` 显示操作建议。 |
| `cancelled` | 停止轮询，不显示失败重试为自动动作。 |

浏览器卸载组件、切换功能或账号时只终止本地轮询；只有用户明确点击“停止生成”时才调用 DELETE。浏览器中止 GET 不等于后端任务取消。

完成响应不返回 `prompt` 或 warnings。新生成附件会返回服务端最终保存 PNG 的真实宽高；历史附件没有尺寸记录时省略 `width/height`：

```json
{
  "generation": {
    "id": "generation UUID",
    "requestId": "request UUID",
    "status": "completed",
    "provider": "xai-compatible",
    "model": "grok-imagine-image",
    "aspectRatio": "16:9",
    "resolution": "1k",
    "quality": "high",
    "errorCode": null,
    "createdAt": "2026-08-15T13:43:00.000Z",
    "startedAt": "2026-08-15T13:43:01.000Z",
    "completedAt": "2026-08-15T13:43:08.000Z",
    "attachments": [
      {
        "id": "attachment UUID",
        "mimeType": "image/png",
        "size": 123456,
        "width": 1536,
        "height": 864,
        "url": "/api/attachments/attachment UUID"
      }
    ]
  }
}
```

### `DELETE /api/image-generations/:id`

排队任务直接变为 `cancelled`，运行任务先变为 `cancel_requested`。已完成、失败或取消的任务保持原状态，成功响应结构仍为 `{ "generation": ... }`。取消不会删除已完成资产。

## 错误与前端行为

错误统一为 `{ "error": "用户可读消息" }`。常见状态：`400` 参数或能力不匹配、`401` 未登录、`403` Base URL/同源拒绝、`404` 配置/会话/任务不存在、`409` requestId 冲突、`502` Provider 或图片输出无效。

`errorCode` 只可能是脱敏内部分类，例如 `UPSTREAM_AUTH`、`UPSTREAM_RATE_LIMIT`、`UPSTREAM_TIMEOUT`、`UPSTREAM_FAILED`、`OUTPUT_INVALID`、`CONFIG_INVALID`、`CONFIG_MISSING`、`WORKER_INTERRUPTED`。正式生成中的 Provider 错误通过异步终态返回，不承诺 HTTP `429/504`。前端不要展示上游正文，也不要据此拼接 API Key 或 Provider 请求。

前端展示建议：

- `UPSTREAM_AUTH`：提示检查生图配置和 API Key，并提供打开配置入口。
- `UPSTREAM_RATE_LIMIT`：提示稍后重试，不启动倒计时自动提交。
- `UPSTREAM_TIMEOUT`：提示 Provider 超时，允许用户主动重试。
- `OUTPUT_INVALID`：提示模型可能不支持图片输出或返回格式不兼容。
- `WORKER_INTERRUPTED`：提示 worker 中断，原任务不会由前端自动重发。
- `CONFIG_MISSING`：提示重新保存生图配置。
- 未识别错误码：使用统一“生图任务失败”文案，不直接展示错误码细节。

建议流程：读取配置和预设，明确提示测试会收费；测试成功后保存；创建任务后轮询至终态；`completed` 使用附件 URL 展示和下载；切换账号或卸载组件时停止轮询，用户主动停止时先发 DELETE。worker 未启动时任务会停留在 `queued`，此时应提示后端运维检查 worker，而不是自动重复 POST。

## 联调验收清单

- 未登录访问配置、预设、任务接口返回 `401`，前端沿用全局登录失效处理。
- 未配置时预设为空，生图工作区提供“打开配置”，不提交生成请求。
- 首次保存缺少 API Key、Base URL 不在允许列表、模型名为空时，前端展示服务端可读错误。
- 测试按钮明确标注可能收费，测试成功不会在结果区新增图片。
- 保存、切换、删除配置后预设立即刷新；被取消的旧任务最终进入 `cancelled`。
- 同一 `requestId` 重放不会新增用户消息或重复计费；冲突内容返回 `409`。
- `queued/running/cancel_requested` 正常轮询，完成后只请求本站附件 URL。
- 任务长时间排队时前端停止本地轮询并提示检查 worker，不自动创建第二个任务。
- 其他账号的会话、任务和附件均不可枚举；跨账号访问统一表现为不存在。
- 页面源码、浏览器存储、接口响应和日志中均不出现 API Key、base64、上游私有 URL 或磁盘路径。

## 后续版本需重新协商的字段

下列能力不能仅由前端开放控件，必须先升级后端 schema、预设能力和任务持久化：多图 `count`、参考图 `referenceAttachmentIds`、宽高/种子/负面提示词、持久化历史列表、自动重试、Agent 调用和公开图片分享。新增字段前应保持 strict schema，避免前后端对“已支持”产生不同理解。
