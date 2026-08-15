# Agent Runtime v1 接入说明

## 定位与边界

`lib/agent` 是无数据库、无路由、无页面依赖的工具调用内核。它接收后端已经解析完成的 AI SDK `LanguageModel`，不读取 Provider、Base URL、API Key 或用户模型配置。

v1 只实现模型驱动的多步工具调用、工具策略、取消、限额与脱敏生命周期事件。当前不包含真实生产工具、人工批准、任务持久化、RAG、记忆、MCP、队列或 Agent 工作台。

生产注册表 `agentToolRegistry` 初始为空。后续能力必须作为显式注册工具接入，不能在 Runtime 内增加 Provider 或业务路由分支。

## 公共接口

入口统一从 `lib/agent/index.ts` 导出：

- `defineAgentTool(definition)`：校验并冻结工具定义。名称格式为 `^[a-z][a-z0-9_]{0,63}$`，描述长度为 1-512 个字符。
- `AgentToolRegistry.register/get/list/toToolSet`：注册、查询、枚举工具，并根据本次调用的允许列表生成 AI SDK `ToolSet`。
- `agentToolRegistry`：生产空注册表，后续由组合根注册经过审查的生产工具。
- `runAgent(options)`：执行非流式 Agent，返回最终文本、结束原因、总用量、步骤摘要和脱敏工具执行记录。
- `streamAgent(options)`：返回 `{ textStream, result }`。`textStream` 提供文本增量，`result` 在整轮结束后解析为与 `runAgent` 相同的结果结构。

工具定义包含名称、描述、Zod 输入/输出 schema、`read` 或 `side-effect` 风险级别、执行函数和可选的更短超时。工具执行函数收到 `requestId`、`userId`、可选 `conversationId`、`toolCallId` 和组合后的 `AbortSignal`。

## 最小接入示例

```ts
import { runAgent, agentToolRegistry } from "@/lib/agent";

const result = await runAgent({
  model: resolvedLanguageModel,
  messages,
  instructions: "Use tools only when needed.",
  registry: agentToolRegistry,
  allowedToolNames: [],
  context: {
    requestId,
    userId,
    conversationId,
  },
  abortSignal: request.signal,
  onEvent: (event) => publishSanitizedEvent(event),
});
```

调用方必须逐次提供 `allowedToolNames`。未知名称是配置错误；未列出的工具不会暴露给模型。v1 没有批准通道，因此 `side-effect` 工具不在默认工具集中，显式请求时也会以 `AGENT_POLICY` 失败关闭。

## 安全限额

默认上限固定为：

| 限额 | 默认及最大值 |
| --- | ---: |
| 模型步骤 | 6 |
| 单工具执行 | 10 秒 |
| 整轮执行 | 60 秒 |
| 单工具 JSON 结果 | 64 KiB |

调用方可通过 `limits` 下调，但不能提高。工具自己的 `timeoutMs` 也只能缩短全局单工具超时。工具不会自动重试。

输出通过 Zod schema 后会执行 JSON 序列化检查，并按 UTF-8 字节数限制大小。不可序列化、schema 不匹配或超限结果不会回传给模型。

## 生命周期与错误

`AgentExecutionEvent` 是稳定的判别联合，当前事件包括：

- `agent.started/completed/failed/cancelled`
- `step.started/completed`
- `tool.started/completed/failed`

步骤编号从 `0` 开始，与 AI SDK 回调一致。事件只含请求 ID、时间、步骤号、工具名、工具调用 ID、耗时、结果字节数和错误码，不含工具输入、工具输出、请求头或上游异常内容。

结构化错误码区分配置、策略、取消、超时、Agent 执行、工具输入、工具输出、结果过大和工具执行失败。Runtime 对外错误不附带原始 Provider 或工具异常作为 `cause`，避免日志系统间接记录敏感内容。

## 后续集成职责

后端负责用户鉴权、模型引用解析、任务与事件持久化、API 路由和将请求取消信号传给 Runtime。后端只能传入属于当前用户且已经完成安全解析的 `LanguageModel`。

前端负责未来 Agent 工作台、运行状态展示和副作用批准交互。在批准协议落地前，不得注册或开放可写文件、发消息、发起交易等副作用能力。

新增工具时需要补充注册、策略、输入输出校验、超时、取消、结果大小、脱敏失败和确定性模型循环测试。测试使用 `MockLanguageModelV4`，不得访问真实 Provider。
