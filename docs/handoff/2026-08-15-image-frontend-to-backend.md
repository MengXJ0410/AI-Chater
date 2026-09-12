# 生图模式前端对后端交接

更新时间：2026-08-15 23:00

## 验收结论

前端 `/chat?tool=image` 与首期生图后端已经按异步任务方式接通。前端负责配置表单、参数选择、任务轮询、取消、预览和下载；后端负责账号配置、API Key 加密、Provider 调用、幂等、文件校验、消息和附件持久化。

Web 服务与 `npm run image:worker` 必须同时运行，`一键启动.bat` 已包含 worker。任务长期停留在 `queued` 时应检查 worker，不应重复提交新的 `requestId`。

首期固定为单图文本生图，不包含多图、参考图编辑、聊天自动转生图、应用级限流、额度审计或生图工作区历史恢复。这些能力属于后续版本，不作为本轮后端缺陷。

## 图片预设

### `GET /api/ai/image-presets`

要求登录。没有生图配置时返回：

```json
{ "presets": [] }
```

配置存在时返回扁平能力字段：

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

`openai-compatible` 的 `resolutions` 和 `qualities` 为空，提交时仍使用默认 `1k/high`。普通聊天模型不会出现在图片预设中；`grok-4.5` 不能作为图片模型。

## 生图配置

接口均要求登录，写操作要求同源：

- `GET /api/me/image-config`
- `PUT /api/me/image-config`
- `POST /api/me/image-config/test`
- `DELETE /api/me/image-config`

保存或测试请求为 strict JSON：

```json
{
  "name": "我的生图配置",
  "provider": "xai-compatible",
  "baseUrl": "https://api.x.ai/v1",
  "model": "grok-imagine-image",
  "apiKey": "仅首次或替换时提交"
}
```

Provider 只允许 `xai-compatible`、`openai-compatible`，Base URL 必须命中服务端 `USER_AI_ALLOWED_BASE_URLS`。首次保存或首次测试必须提供 API Key；已有配置时省略 API Key 会复用加密密钥。GET 和保存响应只返回名称、连接字段、`apiKeyConfigured` 和 `apiKeyLast4`，永不返回明文。

连接测试会真实生成并立即删除一张图片，可能收费，不写入配置、generation、消息或附件。成功响应：

```json
{
  "ok": true,
  "model": "grok-imagine-image",
  "chargedImageGenerated": true
}
```

保存、替换或删除配置会取消排队任务并请求中止运行任务；已完成图片继续保留。

## 创建任务

### `POST /api/image-generations`

请求为 strict JSON，不接受 `count`，`referenceAttachmentIds` 必须为空：

```json
{
  "requestId": "客户端 UUID",
  "conversationId": "当前用户会话 UUID",
  "imagePresetId": "user-image-config",
  "prompt": "雨夜东京街道",
  "referenceAttachmentIds": [],
  "aspectRatio": "16:9",
  "resolution": "1k",
  "quality": "high",
  "source": "image-mode"
}
```

新建或仍在执行的任务返回 HTTP `202`；幂等命中终态任务时可返回 `200`。同一用户使用相同 `requestId` 和相同请求体会返回原任务，不新增消息、不重复计费；相同 ID 改变请求内容返回 `409`。

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
    "createdAt": "2026-08-15T15:00:00.000Z",
    "startedAt": null,
    "completedAt": null,
    "attachments": []
  }
}
```

## 轮询与取消

### `GET /api/image-generations/:id`

前端约每秒轮询一次，直到 `completed`、`failed` 或 `cancelled`。只允许读取当前账号任务，跨账号统一返回 `404`。

状态含义：

- `queued`：等待 worker。
- `running`：Provider 请求执行中。
- `cancel_requested`：取消已提交，继续轮询至终态。
- `completed`：图片和数据库记录均已持久化。
- `failed`：失败，`errorCode` 为脱敏分类。
- `cancelled`：已取消，不会返回生成附件。

完成响应不包含 prompt、warnings、base64、磁盘路径或上游 URL。新生成图片返回最终 PNG 的真实像素尺寸：

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
    "createdAt": "2026-08-15T15:00:00.000Z",
    "startedAt": "2026-08-15T15:00:01.000Z",
    "completedAt": "2026-08-15T15:00:08.000Z",
    "attachments": [
      {
        "id": "attachment UUID",
        "mimeType": "image/png",
        "size": 123456,
        "width": 1536,
        "height": 864,
        "url": "/api/attachments/attachment-uuid"
      }
    ]
  }
}
```

历史生成附件没有尺寸记录时会省略 `width/height`。前端现有可选字段和 MIME 回退显示可以兼容。

### `DELETE /api/image-generations/:id`

要求登录和同源。排队任务直接变为 `cancelled`，运行任务先变为 `cancel_requested`；前端应继续轮询到终态。已完成、失败或取消任务保持原状态，不删除成功资产。

## 错误边界

同步接口错误统一为 `{ "error": "用户可读消息" }`：参数或能力不匹配为 `400`，未登录为 `401`，同源或 Base URL 拒绝为 `403`，配置、会话或任务不存在为 `404`，幂等冲突为 `409`，Provider 或图片输出失败的同步测试为 `502`。

正式生成是异步任务。Provider 的 401、403、429、超时、网络和输出错误不会在创建任务响应中直接映射为 HTTP 401/429/504，而会进入 `failed`，由轮询读取脱敏 `errorCode`：

- `UPSTREAM_AUTH`
- `UPSTREAM_RATE_LIMIT`
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_FAILED`
- `OUTPUT_INVALID`
- `CONFIG_INVALID`
- `CONFIG_MISSING`
- `WORKER_INTERRUPTED`

响应和日志不得包含 API Key、Authorization、完整提示词、Provider 原始正文、base64 或私有存储路径。

## 首期验收

- 无配置时预设为空，保存配置后立即出现 `user-image-config`。
- 测试连接明确提示可能收费，测试结果不写入历史。
- 同一 `requestId` 重放不会生成第二条用户消息或第二次计费。
- 任务可轮询、取消，取消与完成竞态不会留下错误附件。
- 完成附件为受保护 PNG URL，并返回服务端解码得到的真实宽高。
- 配置、任务、会话和附件均按账号隔离。
- API Key、base64、上游正文和磁盘路径不出现在客户端响应。

后续版本再评估多图、参考图编辑、`chat-handoff`、历史结果恢复、应用级限流与额度审计。
