# 用户模型自定义预设后端交接

更新时间：2026-08-15

## 后端已完成

- `user_ai_configs` 新增可空 `name VARCHAR(80)` 字段，兼容已有账号记录。
- 自定义预设保存时可提交配置名称，名称与当前账号绑定并持久化到 MySQL。
- 旧记录没有名称时，服务端回退显示“自定义预设”或“我的配置”。
- 固定连接方案不接受自定义 `name`、Provider、Base URL 或 Model，避免客户端覆盖服务端目录。
- 自定义方案仍复用现有 Provider、Base URL、SSRF、HTTPS 和 API Key 加密校验。
- 删除用户模型配置时名称和加密凭据一起删除；软删除账号时由外键级联清理配置。

## 连接方案修正

YYAPI 固定方案为：

```text
presetId: yyapi
provider: openai-compatible
baseUrl: https://www.yyapi.cloud/v1
model: grok-4
```

另有固定方案 `yyapi-grok-01`，参数为 `openai-compatible`、`https://www.yyapi.cloud/v1`、`grok-4.5`，用于当前 YYAPI Grok 4.5 通道。

用户提供的 `https://www.yyapi.cloud` 是根地址，服务端方案会转换为带 `/v1` 的兼容地址。请求最终使用 `/v1/chat/completions`。API Key 必须来自 YYAPI 控制台；聊天中暴露的旧 Key 未写入代码、`.env`、数据库或日志，应撤销后重新生成。

## 接口契约

### `GET /api/me/ai-config`

响应中的 `config` 在有保存配置时包含：

```json
{
  "presetId": "custom",
  "name": "我的 YYAPI",
  "provider": "openai-compatible",
  "baseUrl": "https://www.yyapi.cloud/v1",
  "model": "grok-4",
  "apiKeyConfigured": true,
  "apiKeyLast4": "1234"
}
```

`presets` 继续返回固定方案和 `custom`。已保存的自定义名称会作为 `custom` 方案的显示名称；没有名称的历史记录显示“自定义预设”。API Key 永远不返回明文。

### `PUT /api/me/ai-config`

固定方案请求只能提交方案 ID 和可选 API Key：

```json
{
  "presetId": "yyapi",
  "apiKey": "<YYAPI API Key>"
}
```

自定义方案请求：

```json
{
  "presetId": "custom",
  "name": "我的 YYAPI",
  "provider": "openai-compatible",
  "baseUrl": "https://www.yyapi.cloud/v1",
  "model": "grok-4",
  "apiKey": "<YYAPI API Key>"
}
```

首次保存必须提供 `apiKey`；已有配置可省略 API Key，服务端保留原加密密钥。名称长度为 1-80 个字符，服务端会 trim；自定义方案的 Provider、Base URL 和 Model 仍为必填。保存成功响应中的 `config` 会包含 `name`（如果有）。

### `POST /api/me/ai-config/test`

测试接口与保存请求字段相同，支持 `name` 但不会写入配置；API Key 省略时复用当前账号已保存密钥。测试只发起一次最小模型请求，不创建会话或消息。

### `GET /api/ai/presets`

已保存用户配置时追加虚拟预设 `id: "user-config"`。其 `label` 使用自定义名称；没有名称时为“我的配置”。该预设不支持图片输入。

## 前端对接要点

1. 仅在选择 `presetId === "custom"` 时显示并提交名称输入框。
2. 固定方案不要提交 `name`、`provider`、`baseUrl` 或 `model`，否则会被 Zod 校验拒绝。
3. 打开配置抽屉时使用 `GET /api/me/ai-config` 的 `config.name` 恢复名称。
4. 保存成功后清空 API Key 输入，但保留名称和方案；刷新 `/api/ai/presets` 后选择 `user-config`。
5. 聊天模型列表使用 `/api/ai/presets` 返回的 `label`，因此自定义名称会显示在“我的配置”位置。
6. 不要把 API Key 写入 `localStorage`、URL、前端日志或错误提示。

## 数据库与验证

新增 migration：`drizzle/0005_jittery_rumiko_fujikawa.sql`。执行：

```powershell
npm run db:migrate
npm test
npx tsc --noEmit
npm run lint
npm run build
```
