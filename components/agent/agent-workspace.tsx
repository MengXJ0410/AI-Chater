"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Command, LoaderCircle, PlugZap, SendHorizontal, Square, Wrench } from "lucide-react";
import { Markdown } from "@/components/chat/markdown";
import { streamAgentRun } from "@/client/api/agent";
import { listSavedModelConfigs } from "@/client/api/model-configs";
import type { SavedWorkspaceConfig } from "@/client/workspace-configs";
import type { AgentRunEvent } from "@/shared/agent";

type Props = {
  conversationId: string | null;
  ensureConversation: () => Promise<string>;
  onOpenConfig: () => void;
};

function describeEvent(event: AgentRunEvent) {
  switch (event.type) {
    case "agent.started": return "Agent 启动";
    case "agent.completed": return "Agent 完成";
    case "agent.failed": return `Agent 失败（${event.errorCode ?? "UNKNOWN"}）`;
    case "agent.cancelled": return "Agent 已取消";
    case "step.started": return `步骤 ${(event.stepNumber ?? 0) + 1} 开始`;
    case "step.completed": return `步骤 ${(event.stepNumber ?? 0) + 1} 完成（${event.finishReason ?? "unknown"}）`;
    case "tool.started": return `调用工具 ${event.toolName ?? ""}`;
    case "tool.completed": return `工具 ${event.toolName ?? ""} 完成`;
    case "tool.failed": return `工具 ${event.toolName ?? ""} 失败（${event.errorCode ?? "UNKNOWN"}）`;
    default: return event.type;
  }
}

export function AgentWorkspace({ conversationId, ensureConversation, onOpenConfig }: Props) {
  const [configs, setConfigs] = useState<SavedWorkspaceConfig[]>([]);
  const [presetId, setPresetId] = useState("");
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState("");
  const [events, setEvents] = useState<AgentRunEvent[]>([]);
  const [error, setError] = useState("");
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { ok, status, configs: loaded } = await listSavedModelConfigs();
        if (cancelled) return;
        if (!ok) throw new Error(status === 404 || status === 501 ? "Agent 需要先保存一个对话模型配置。" : "读取模型配置失败。");
        const chatConfigs = (loaded as SavedWorkspaceConfig[]).filter((config) => config.kind === "chat");
        setConfigs(chatConfigs);
        setPresetId((current) => current && chatConfigs.some((config) => config.runtimePresetId === current) ? current : chatConfigs[0]?.runtimePresetId ?? "");
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "读取模型配置失败。");
      } finally {
        if (!cancelled) setIsLoadingConfigs(false);
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  async function run(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const prompt = text.trim();
    if (!prompt || isRunning || !presetId) return;
    setError("");
    setAnswer("");
    setEvents([]);
    setIsRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const targetConversationId = conversationId ?? await ensureConversation();
      for await (const chunk of streamAgentRun({ conversationId: targetConversationId, presetId, text: prompt }, controller.signal)) {
        if (chunk.type === "text") setAnswer((current) => current + chunk.text);
        else if (chunk.type === "event") setEvents((current) => [...current, chunk.event]);
        else if (chunk.type === "error") setError(chunk.message);
      }
      setText("");
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "Agent 执行失败。");
      }
    } finally {
      abortRef.current = null;
      setIsRunning(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  const toolEventCount = events.filter((event) => event.type.startsWith("tool.")).length;

  return (
    <div className="image-workspace agent-workspace">
      <div className="image-workspace-header">
        <div>
          <span className="chat-tool-eyebrow">AGENT MODE</span>
          <h2>工具链工作区</h2>
        </div>
        {isLoadingConfigs ? <span className="image-loading-label"><LoaderCircle size={14} className="image-loading-spinner" aria-hidden="true" />加载配置</span> : null}
      </div>
      <div className="image-workspace-grid">
        <section className="image-composer-panel">
          <label className="image-field">
            <span>模型配置</span>
            <select value={presetId} onChange={(event) => setPresetId(event.target.value)} disabled={isRunning || !configs.length}>
              {configs.length ? configs.map((config) => <option value={config.runtimePresetId} key={config.id}>{config.name} · {config.model}</option>) : <option value="">暂无对话配置</option>}
            </select>
          </label>
          <form className="chat-config-form" onSubmit={run}>
            <label className="image-field image-prompt-field">
              <span>任务</span>
              <textarea value={text} onChange={(event) => setText(event.target.value)} rows={6} maxLength={16000} disabled={isRunning} placeholder="例如：现在东京几点？再帮我算一下 (12+3)^2/5" />
            </label>
            <div className="chat-config-actions">
              <button className="chat-secondary-button" type="button" onClick={onOpenConfig}><PlugZap size={16} />配置模型</button>
              {isRunning
                ? <button className="chat-primary-button" type="button" onClick={stop}><Square size={15} fill="currentColor" />停止</button>
                : <button className="chat-primary-button" type="submit" disabled={!presetId || !text.trim() || isLoadingConfigs}><SendHorizontal size={16} />运行 Agent</button>}
            </div>
          </form>
          <div className="agent-capabilities">
            <Command size={14} />
            <span>可用工具：当前时间 · 数学计算</span>
          </div>
        </section>
        <section className="image-results-panel">
          <div className="image-results-heading">
            <span>执行过程</span>
            {toolEventCount ? <small>{toolEventCount} 次工具调用</small> : null}
          </div>
          {error ? <p className="composer-error">{error}</p> : null}
          {events.length ? (
            <ol className="agent-timeline">
              {events.map((event, index) => (
                <li className={`agent-timeline-item agent-timeline-${event.type.replace(".", "-")}`} key={`${event.type}-${index}`}>
                  <span className="agent-timeline-type">{describeEvent(event)}</span>
                  {event.durationMs !== undefined ? <small>{event.durationMs} ms</small> : null}
                </li>
              ))}
            </ol>
          ) : (
            <div className="image-result-empty">
              <Wrench size={26} />
              <strong>{isRunning ? "正在执行…" : "等待任务"}</strong>
            </div>
          )}
          {answer ? <div className="agent-answer"><Markdown>{answer}</Markdown></div> : null}
        </section>
      </div>
    </div>
  );
}
