# 生图模式后端交接

更新时间：2026-08-15 21:00

## 结论

当前 `grok-4.5` 配置只能按 `LanguageModel` 调用，不是生图模型。建议保留它负责聊天、意图识别和可选的提示词整理；真正生图使用独立 `ImageModelV4`：

- xAI 官方：`grok-imagine-image` 或 `grok-imagine-image-pro`。
- OpenAI Compatible 中转：必须确认 Base URL 实现 `/images/generations`，并使用中转实际公布的图像模型 ID。

已安装的 `@ai-sdk/xai` 支持 `createXai(...).image("grok-imagine-image")`，AI SDK 使用 `generateImage()` 调用。xAI 模型使用 `aspectRatio`，不支持通用 `size`；Pro 支持 `1k/2k`。`grok-imagine-image` 和 Pro 均支持无蒙版的提示词图片编辑。

当前 YYAPI 方案是 `openai-compatible + grok-4.5`。不能仅因文本连接测试成功就宣称它能生图。兼容图片 Adapter 会请求 `/images/generations`；需要用 YYAPI 提供的图像模型名进行独立测试。

## 架构边界

新增独立图片模型 Adapter 和生图服务，不把图片二进制逻辑放进 `/api/chat`，也不让前端直接访问 Provider。

建议目录：

| 路径 | 职责 |
| --- | --- |
| `lib/ai/image.ts` | Image Provider Adapter、能力描述和 `generateImage` 包装 |
| `lib/image-generation.ts` | 参数校验、生成流程、输出校验、落盘和记录编排 |
| `lib/image-intent.ts` | 可选的结构化意图识别，不执行生图 |
| `app/api/ai/image-presets/route.ts` | 返回当前用户可用生图预设和能力 |
| `app/api/me/image-config/route.ts` | 生图配置读取、保存和删除 |
| `app/api/me/image-config/test/route.ts` | 明确收费的生图连接测试 |
| `app/api/image-generations/route.ts` | 鉴权后的统一生成入口 |

对话模式自动切换和生图模式直接发送都调用同一个 `POST /api/image-generations`。`/api/chat` 继续只负责文本模型流式输出。

## Image Provider Adapter

不要复用只返回 `LanguageModel` 的现有 `ProviderAdapter.create`。增加独立接口：

```ts
type ImageModelConnection = {
  provider: "xai" | "openai" | "openai-compatible";
  baseUrl?: string;
  model: string;
  apiKey: string;
};

type ImageModelCapabilities = {
  aspectRatios: string[];
  sizes: string[];
  resolutions: Array<"1k" | "2k">;
  qualities: Array<"low" | "medium" | "high">;
  maxImages: number;
  supportsImageEdit: boolean;
};

type ImageProviderAdapter = {
  create(connection: ImageModelConnection): ImageModelV4;
  capabilities(connection: ImageModelConnection): ImageModelCapabilities;
  toGenerateOptions(input: ValidatedImageGenerationInput): ProviderGenerateOptions;
};
```

实现要求：

- `xai` 使用 `createXai({ apiKey, baseURL, fetch: guardedFetch }).image(model)`。
- `openai-compatible` 使用 `createOpenAICompatible(...).imageModel(model)`，但其通用实现使用 `size` 而不是 `aspectRatio`，响应要求 `data[].b64_json`。
- 如果 YYAPI 只返回 `data[].url`，当前兼容 Adapter 会校验失败。必须先取得实际响应契约，再实现限定域名、禁止重定向、限制大小和 MIME 的安全下载；不要放宽全局 SSRF 规则。
- xAI Adapter 请求 `response_format=b64_json`，结果可直接从 `GeneratedFile.uint8Array` 落盘，不要把 base64 返回客户端。
- `guardedFetch` 和 Base URL 校验沿用当前模型配置安全策略；生成图片返回 URL 时还需单独校验资源域名、DNS 解析、重定向和下载字节上限。
- Provider 特有参数只保留在 Adapter 内。路由层只处理规范化的比例、尺寸、分辨率和质量。

核心调用示意：

```ts
const result = await generateImage({
  model: getImageModel(connection),
  prompt: referenceImages.length
    ? { text: input.prompt, images: referenceImages }
    : input.prompt,
  n: input.count,
  aspectRatio: adapterSupportsAspectRatio ? input.aspectRatio : undefined,
  size: adapterSize,
  providerOptions: adapterProviderOptions,
  maxImagesPerCall: Math.min(input.count, capabilities.maxImages),
  maxRetries: 0,
  abortSignal,
});
```

生图默认不自动重试，避免一次客户端重试产生多组计费图片。由 `requestId` 提供幂等保护。

## 配置模型

当前 `user_ai_configs` 每个账号只有一套文本配置，不能表达“YYAPI Grok 4.5 聊天 + xAI Imagine 生图”这类双连接。不要把 `imageModel` 硬塞进现有 `model` 字段。

首期建议新增一对一 `user_image_configs`：

- `user_id` 主键并级联删除。
- `preset_id`、`name`、`provider`、`base_url`、`model`。
- `api_key_ciphertext`、`api_key_iv`、`api_key_auth_tag`、`encryption_key_id`、`api_key_last4`。
- `created_at`、`updated_at`。

复用现有 AES-256-GCM 密钥环和密钥替换语义，但通过独立配置接口管理。以后需要多套媒体连接时再规范化为连接表；首期独立表对现有聊天链路影响最小。

生图配置接口：

- `GET /api/me/image-config`：只返回脱敏摘要和能力，不返回 Key。
- `PUT /api/me/image-config`：首次必须提供 Key，更新省略 Key 时保留旧值。
- `DELETE /api/me/image-config`：删除密文并撤销该用户的生图入口。
- `POST /api/me/image-config/test`：生成最小 1 张 `1k` 图片后立即安全删除测试文件；响应明确表示测试可能收费。

连接测试不能只请求模型列表，因为模型存在不代表图片端点、参数和响应格式可用。

## 数据模型与持久化

建议新增 `image_generations` 表：

- `id`、`request_id`、`user_id`、`conversation_id`。
- `user_message_id`、可空 `assistant_message_id`。
- `image_preset_id`、`provider`、`model`。
- `prompt`、参考附件 ID JSON、`aspect_ratio`、`resolution`、`quality`、`image_count`。
- `source`: `image-mode | chat-handoff`。
- `status`: `running | completed | failed | cancelled`。
- 脱敏 `error_code`，以及创建、开始、完成时间。

对 `(user_id, request_id)` 建唯一索引，避免网络重试重复计费。

现有 `MessagePart` 已能保存图片。生成成功后创建 assistant message，并把生成文件作为 `attachments` 关联到该消息。建议为 `attachments` 增加可空 `generation_id` 和 `origin: upload | generated`，便于清理、审计和资产库扩展。

生成流程：

1. 校验登录用户、同源请求、会话归属、图片预设、参数和参考附件归属。
2. 以短事务创建用户消息、占用参考附件并插入 `image_generations(status=running)`；不要在数据库事务内等待 Provider。
3. 解析并解密当前用户的 ImageModel 连接，调用 `generateImage()`，传入请求取消信号和服务端总超时。
4. 用 Sharp 解码返回字节，校验真实格式、像素、单图字节和总字节；统一转为 WebP 或保留经过允许的 PNG/JPEG。
5. 先以随机 storage key 写入文件，再以事务插入 assistant message、attachments 并把 generation 更新为 `completed`。
6. 数据库写入失败时删除本轮新文件；Provider、校验、超时或取消失败时更新脱敏状态，不保存上游正文。

用户请求消息可以在失败后保留，便于重试；失败记录不得包含 API Key、完整请求头、base64、参考图内容或未经清理的上游响应。

## 生成接口

### `GET /api/ai/image-presets`

返回系统生图预设与当前用户生图配置，能力字段明确区分：

- `supportsImageInput`：聊天视觉输入。
- `supportsImageGeneration`：文本生图。
- `supportsImageEdit`：参考图编辑。

不要沿用当前含义模糊的 `supportsImages` 判断生成能力。

### `POST /api/image-generations`

请求字段：

```json
{
  "requestId": "UUID",
  "conversationId": "UUID",
  "imagePresetId": "user-image-config",
  "prompt": "string",
  "referenceAttachmentIds": [],
  "aspectRatio": "16:9",
  "resolution": "1k",
  "quality": "high",
  "count": 1,
  "source": "image-mode"
}
```

建议限制：提示词 1-4000 字符、参考图最多 4 张、数量 1-4、总执行 120 秒、单图 20 MB、总输出 50 MB、最大 4096×4096 像素。最终允许值还必须与所选 Adapter 能力求交集。

首期可采用同步 `201` 响应，返回 generation、实际 Provider/Model、附件 URL、尺寸、MIME 和清理后的 warnings。必须将 `request.signal` 组合进总超时。若部署环境不允许长请求，再升级为 `202 + 状态查询 + worker`；不能在 Route Handler 返回后用未托管 Promise 假装后台任务。

### `POST /api/image-intents`

第二阶段实现。使用已解析的文本 `LanguageModel` 做结构化输出，只返回 `chat | image`、置信度、整理后的提示词和可选比例，不调用 ImageModel。温度设低、输出 schema 固定、超时短、失败回退 `chat`。

用户输入 `/image` 或 `/生图` 时不需要调用模型分类。不得用前端关键词结果直接绕过服务端参数和权限校验。

## 与 Agent Runtime 的关系

图片生成会调用付费外部服务并写文件、消息和数据库，风险级别属于 `side-effect`。当前 Agent v1 没有批准通道，`AgentToolRegistry` 会拒绝暴露副作用工具，因此首期不要注册 `generate_image` 工具。

如需让聊天模型参与路由，可后续增加只读 `prepare_image_generation` 工具，只产生结构化草稿，不生成图片。UI 获得用户确认或识别到明确 `/image` 授权后，再调用专用生成接口。批准通道建成后，才允许将真实生成封装为受策略控制的副作用工具。

## 错误与安全

- 对客户端稳定返回配置错误、能力不支持、输入无效、上游鉴权、上游限流、超时、取消、输出无效、存储失败等错误码。
- 日志只记录 requestId、generationId、userId、Provider、Model、耗时、图片数量和脱敏错误码。
- 不记录 API Key、Authorization、原始 Provider 响应、base64、完整提示词或参考图。
- 所有配置、会话、参考附件、generation 和输出附件查询必须包含当前 userId。
- 账号删除时清理用户生图配置；按现有账号数据保留策略决定是否清理历史生成文件，并在交接文档中保持一致。
- 对生成结果进行真实图片解码，不能信任 Provider 声明的 MIME 或扩展名。
- 参考附件只能使用当前用户尚未被其他请求占用或属于当前会话的文件，防止跨会话和跨用户引用。

## 测试计划

- Adapter：xAI 参数映射、OpenAI Compatible `size` 映射、能力拒绝、鉴权失败、限流、超时和无效响应。
- 使用 `MockImageModelV4` 测试 `generateImage()`，不访问真实 Provider；另设显式人工连接测试验证 YYAPI 实际图片契约。
- 配置：加密往返、更新保留/替换 Key、GET 不回传明文、删除和跨用户隔离。
- 接口：未登录、跨用户会话、跨用户参考图、重复 requestId、非法比例/数量、取消和错误脱敏。
- 文件：真实格式、超大字节、超大像素、多图总量、写入失败回滚和数据库失败清理。
- 持久化：用户消息、assistant 图片消息、附件关联、generation 状态和会话删除后的文件清理。
- 意图：明确生图、明确聊天、含糊请求、模型异常回退和 `/image` 确定性路径。
- 完成后生成 migration，并运行 `npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`，更新 `更新日志.md` 与根交接文档。
