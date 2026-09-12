# 工作台多模型配置后端交接

更新时间：2026-08-16 01:53

## 实施状态

本交接中的后端迁移与接口已完成，并已在本机 MySQL 执行 `0008_multi_model_configs.sql`。前端应以本文的多配置 UUID 接口为主；旧单条接口和 `user-config` / `user-image-config` 仅作过渡兼容。账号级限流默认值、审计字段和保留期见 `.env.example` 与根 `README.md`。

## 目标

“工作台配置”已经增加“我的配置”视图，统一展示对话和生图配置。当前前端会优先调用多配置接口；接口返回 `404` 或 `501` 时回退现有单条接口，因此后端可以独立完成升级而不阻塞现有功能。

多配置上线后，每个账号可以保存多条对话配置和多条生图配置。配置与账号绑定，但“当前使用哪一条”只由当前浏览器选择，不保存账号全局 active 状态，避免多个设备互相覆盖。

## 数据库迁移

当前 `user_ai_configs.user_id` 和 `user_image_configs.user_id` 均为主键，只允许每账号一条记录。需要分别改为：

- 新增 `id VARCHAR(36)` UUID 主键。
- `user_id` 改为普通非空外键并增加索引。
- 保留名称、Provider、Base URL、Model、密文、IV、认证标签、密钥版本、末四位和时间字段。
- 对话配置增加 `connection_preset_id`，记录配置来源；固定方案也必须保存用户自定义名称。
- 现有每个账号的单条记录迁移为一条新 UUID 记录，密文字节原样迁移，不能解密后重新写明文迁移文件。
- 账号删除继续通过外键级联删除全部配置。
- 同一账号允许同名配置；前端使用 UUID 区分，不依赖名称唯一性。

## 统一公开模型

所有响应中的公开配置统一为：

```json
{
  "id": "配置 UUID",
  "kind": "chat",
  "name": "工作用 YYAPI",
  "provider": "openai-compatible",
  "baseUrl": "https://www.yyapi.cloud/v1",
  "model": "grok-4.5",
  "apiKeyConfigured": true,
  "apiKeyLast4": "1234",
  "runtimePresetId": "user-chat-config:配置 UUID",
  "connectionPresetId": "yyapi-grok-01",
  "createdAt": "ISO 时间",
  "updatedAt": "ISO 时间"
}
```

生图配置的 `kind` 为 `image`，运行时 ID 为 `user-image-config:<uuid>`，可省略 `connectionPresetId`。禁止返回 API Key 明文、密文、IV、认证标签、存储路径或 Provider 私有错误。

## CRUD 接口

所有接口要求当前登录账号；写操作沿用同源校验。

### `GET /api/me/model-configs`

返回当前账号全部配置：

```json
{ "configs": ["公开配置对象"] }
```

按 `updatedAt` 倒序。无配置返回空数组。不能根据客户端用户 ID 查询其他账号。

### `POST /api/me/model-configs`

创建配置。对话请求：

```json
{
  "kind": "chat",
  "name": "工作用 YYAPI",
  "connectionPresetId": "yyapi-grok-01",
  "provider": "openai-compatible",
  "baseUrl": "https://www.yyapi.cloud/v1",
  "model": "grok-4.5",
  "apiKey": "首次创建必填"
}
```

生图请求：

```json
{
  "kind": "image",
  "name": "主生图配置",
  "provider": "xai-compatible",
  "baseUrl": "https://api.x.ai/v1",
  "model": "grok-imagine-image",
  "apiKey": "首次创建必填"
}
```

固定连接方案也允许自定义 `name`。后端不能信任前端提交的固定方案 Provider/Base URL/Model，应使用 `connectionPresetId` 的服务端目录校验或覆盖；自定义方案继续执行 SSRF、HTTPS、公网域名和允许列表校验。成功返回 `{ "config": <公开配置> }`。

### `PUT /api/me/model-configs/:id`

只允许更新当前账号配置。请求结构与创建相同；省略 `apiKey` 表示保留原密钥，提交非空值表示安全替换。修改配置不能覆盖同账号其他记录。成功返回最新公开配置。

### `DELETE /api/me/model-configs/:id`

删除当前账号指定配置及其加密凭据，返回 `{ "ok": true }`。删除生图配置时取消仅属于该配置且尚未完成的任务；已完成图片和历史消息不删除。跨账号 ID 统一返回 `404`。

### `POST /api/me/model-configs/:id/test`

使用已保存密钥测试指定配置，不接受或返回明文密钥。对话配置发送一次最小请求；生图配置会真实生成并立即删除一张测试图片，响应必须标明可能计费。

现有 `/api/me/ai-config/test` 和 `/api/me/image-config/test` 在迁移期继续保留，用于测试尚未保存的表单草稿。

## 运行时预设

- `/api/ai/presets` 追加当前账号全部对话配置，ID 为 `user-chat-config:<uuid>`。
- `/api/ai/image-presets` 返回当前账号全部生图配置，ID 为 `user-image-config:<uuid>`。
- `/api/chat` 根据运行时预设 ID 解析配置 UUID，并同时校验 `user_id`。
- `/api/image-generations` 不再把 `imagePresetId` 限制为固定字面量，改为解析当前账号的生图配置 UUID。
- 客户端不能通过修改 UUID 使用其他账号配置；越权统一表现为预设不存在。
- 旧 `user-config` 和 `user-image-config` 在迁移期可以映射到迁移后的第一条配置，待旧浏览器本地选择自然淘汰后再移除。
- 消息和任务应记录实际运行时预设 ID、Provider 和 Model 快照，历史记录不依赖配置仍然存在。

## 安全与兼容

- 每条 API Key 独立使用现有 AES-256-GCM 密钥环加密和惰性轮换。
- 列表接口只返回 `apiKeyConfigured` 和末四位；末四位不是认证凭据。
- 禁止把 API Key 写入日志、错误、URL、消息记录或任务载荷。
- 创建、修改、测试和删除都需要账号隔离、频率限制及审计元数据。
- 现有 `/api/me/ai-config` 与 `/api/me/image-config` 暂时作为单条兼容接口，内部可以代理账号最近更新的一条配置；不得静默删除其他配置。
- 多配置接口稳定前不要让旧 PUT 接口覆盖或清空账号的全部配置。

## 联调验收

- 历史用户升级后原配置、密钥末四位和聊天/生图能力不丢失。
- 同账号可分别创建多条对话和生图配置，并在列表中完整返回。
- 固定方案和自定义方案均可设置名称。
- 每条运行时预设准确解析到对应密钥，不能跨账号访问。
- 修改一条配置不会影响其他配置；API Key 留空时保持原值。
- 删除当前浏览器正在使用的配置后，前端刷新预设并回退到可用项。
- 多设备可选择不同配置，不存在账号全局 active 状态竞争。
- 接口响应、页面源码和日志均不包含真实 API Key 或加密内部字段。
