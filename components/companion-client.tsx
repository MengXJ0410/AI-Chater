"use client";

import { AlertTriangle, ArrowLeft, ExternalLink, LoaderCircle, Radio, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { launchCompanion } from "@/client/api/companion";
import { listSavedModelConfigs } from "@/client/api/model-configs";

type ModelConfig = {
  id: string;
  kind: "chat" | "image";
  name: string;
  provider: string;
  model: string;
  apiKeyLast4: string;
};

type Props = { username: string; runtimeUrl: string };

const protocol = "ai-chater:companion";

async function assertRuntimeAvailable(runtimeUrl: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(runtimeUrl, { method: "GET", mode: "no-cors", cache: "no-store", signal: controller.signal });
  } catch {
    throw new Error("AIRI Stage Web 未启动，请在另一个终端执行 npm run airi:dev。", { cause: "runtime-unavailable" });
  } finally {
    window.clearTimeout(timeout);
  }
}

export function CompanionClient({ username, runtimeUrl }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridgeTimeoutRef = useRef<number | null>(null);
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [ticket, setTicket] = useState("");
  const [frameState, setFrameState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("正在准备 Companion");
  const runtimeOrigin = useMemo(() => new URL(runtimeUrl).origin, [runtimeUrl]);

  const send = useCallback((message: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage({ protocol, ...message }, runtimeOrigin);
  }, [runtimeOrigin]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    setTicket("");
    setFrameState("loading");
    setLoadingMessage("正在读取模型配置");
    try {
      const { ok, configs: loadedConfigs } = await listSavedModelConfigs();
      if (!ok) throw new Error("无法读取模型配置。");
      const chatConfigs = (loadedConfigs as ModelConfig[]).filter((config) => config.kind === "chat");
      setConfigs(chatConfigs);
      let nextConfigId = "";
      setSelectedConfigId((current) => {
        nextConfigId = current && chatConfigs.some((config) => config.id === current) ? current : chatConfigs[0]?.id ?? "";
        return nextConfigId;
      });
      setSelectedConfigId(nextConfigId);
      if (!nextConfigId) {
        setFrameState("error");
        setError("请先在聊天配置中保存一个对话模型。");
        return;
      }

      setLoadingMessage("正在检查 AIRI Stage Web");
      await assertRuntimeAvailable(runtimeUrl);
      setLoadingMessage("正在加载 AIRI 角色");
      const launch = await launchCompanion();
      setTicket(launch.ticket);
      setFrameState("loading");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Companion 启动失败。");
      setFrameState("error");
    } finally {
      setIsLoading(false);
    }
  }, [runtimeUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== runtimeOrigin || event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { protocol?: string; type?: string; message?: string } | null;
      if (!data || data.protocol !== protocol) return;
      if (data.type === "ready") {
        setLoadingMessage("正在连接 Companion Gateway");
        send({ type: "bootstrap", ticket, modelConfigId: selectedConfigId, gatewayOrigin: window.location.origin });
      }
      if (data.type === "bootstrapped") {
        setFrameState("ready");
      }
      if (data.type === "error") {
        setFrameState("error");
        setError(data.message || "AIRI bridge 启动失败，请确认固定版本和 Companion 配置正确。");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [runtimeOrigin, selectedConfigId, send, ticket]);

  useEffect(() => {
    if (!ticket || frameState === "ready") return;
    bridgeTimeoutRef.current = window.setTimeout(() => {
      setFrameState("error");
      setError("AIRI bridge 在 10 秒内未响应，请确认 AIRI Stage Web 已按固定版本启动。");
    }, 10_000);
    return () => {
      if (bridgeTimeoutRef.current !== null) window.clearTimeout(bridgeTimeoutRef.current);
      bridgeTimeoutRef.current = null;
    };
  }, [frameState, ticket]);

  useEffect(() => {
    if (frameState === "ready") send({ type: "model-config", modelConfigId: selectedConfigId });
  }, [frameState, selectedConfigId, send]);

  return (
    <main className="companion-page">
      <header className="companion-toolbar">
        <Link className="companion-back" href="/chat"><ArrowLeft size={16} />返回聊天</Link>
        <div className="companion-title"><Radio size={18} /><span>AIRI Companion</span><small>{username}</small></div>
        <label className="companion-model">模型
          <select value={selectedConfigId} onChange={(event) => { setSelectedConfigId(event.target.value); send({ type: "model-config", modelConfigId: event.target.value }); }} disabled={!configs.length}>
            {!configs.length && <option value="">暂无对话配置</option>}
            {configs.map((config) => <option key={config.id} value={config.id}>{config.name} · {config.model}</option>)}
          </select>
        </label>
      </header>
      <section className="companion-stage" aria-label="AIRI 虚拟角色工作区">
        {isLoading && <div className="companion-state"><LoaderCircle className="companion-spin" size={22} /><span>{loadingMessage}</span></div>}
        {frameState === "error" && !isLoading && <div className="companion-state companion-state-error"><AlertTriangle size={22} /><strong>{error}</strong><div><button type="button" onClick={() => void load()}><RotateCcw size={15} />重试</button><Link href="/chat"><ExternalLink size={15} />打开聊天配置</Link></div></div>}
        {ticket && <iframe ref={frameRef} className="companion-frame" title="AIRI 虚拟角色" src={runtimeUrl} onLoad={() => setLoadingMessage("AIRI 页面已加载，正在连接角色适配") } onError={() => { setFrameState("error"); setError("AIRI Stage Web 资源加载失败。"); }} allow="autoplay; microphone" />}
      </section>
    </main>
  );
}
