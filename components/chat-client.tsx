"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, ChevronLeft, ChevronRight, Command, FileImage, ImagePlus, LayoutPanelLeft, LoaderCircle, LogOut, Menu, MessageSquarePlus, MoreHorizontal, Pencil, SendHorizontal, Settings2, Sparkles, Square, Trash2, Video, WandSparkles, X } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { CHAT_BACKGROUND_CHANGE_EVENT, CHAT_BACKGROUND_STORAGE_KEY } from "@/lib/appearance";
import type { MessagePart } from "@/lib/messages";

type User = { id: string; username: string };
type Conversation = { id: string; title: string; createdAt: string; updatedAt: string };
type ChatMessage = { id: string; role: "user" | "assistant"; parts: MessagePart[]; presetId: string | null; model: string | null; createdAt: string };
type AiPreset = { id: string; label: string; model: string; supportsImages: boolean };
type PendingAttachment = { id: string; originalName: string };
type ToolId = "chat" | "image" | "video" | "agent";
type ConfigDraft = { provider: string; baseUrl: string; model: string };
type SavedAiConfig = ConfigDraft & { apiKeyConfigured: true; apiKeyLast4: string };

const SIDEBAR_STORAGE_KEY = "ai-chater-chat-sidebar-v1";
const TOOL_ITEMS: Array<{ id: ToolId; label: string; description: string; icon: typeof Command }> = [
  { id: "chat", label: "对话", description: "与模型进行连续对话", icon: Command },
  { id: "image", label: "生图", description: "从文字生成图像", icon: FileImage },
  { id: "video", label: "视频", description: "生成和编辑视频", icon: Video },
  { id: "agent", label: "Agent", description: "组合工具完成任务", icon: WandSparkles },
];

const DEFAULT_CONFIG_DRAFT: ConfigDraft = { provider: "openai-compatible", baseUrl: "", model: "" };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "请求失败，请重试。");
  return payload as T;
}

export function ChatClient({ user }: { user: User }) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [presets, setPresets] = useState<AiPreset[]>([]);
  const [presetId, setPresetId] = useState("");
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [activeTool, setActiveTool] = useState<ToolId>("chat");
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(() => typeof window === "undefined" || window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "collapsed");
  const [isChatBackgroundEnabled, setIsChatBackgroundEnabled] = useState(() => typeof window !== "undefined" && window.localStorage.getItem(CHAT_BACKGROUND_STORAGE_KEY) === "enabled");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAccountPanelOpen, setIsAccountPanelOpen] = useState(false);
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState<ConfigDraft>(DEFAULT_CONFIG_DRAFT);
  const [apiKey, setApiKey] = useState("");
  const [configNotice, setConfigNotice] = useState("");
  const [configError, setConfigError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((item) => item.id === activeConversationId) ?? null;
  const selectedPreset = presets.find((preset) => preset.id === presetId);
  const activeToolMeta = TOOL_ITEMS.find((item) => item.id === activeTool) ?? TOOL_ITEMS[0];

  const loadConversations = useCallback(async () => {
    const data = await requestJson<{ conversations: Conversation[] }>("/api/conversations");
    setConversations(data.conversations);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const data = await requestJson<{ conversation: Conversation; messages: ChatMessage[] }>(`/api/conversations/${id}`);
    setMessages(data.messages);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const [conversationData, presetData, configData] = await Promise.all([
          requestJson<{ conversations: Conversation[] }>("/api/conversations"),
          requestJson<{ presets: AiPreset[] }>("/api/ai/presets"),
          requestJson<{ config: SavedAiConfig | null }>("/api/me/ai-config"),
        ]);
        if (cancelled) return;
        setConversations(conversationData.conversations);
        setPresets(presetData.presets);
        if (configData.config) {
          setConfigDraft({ provider: configData.config.provider, baseUrl: configData.config.baseUrl, model: configData.config.model });
          setConfigNotice(`已保存服务端配置，API Key 末四位：${configData.config.apiKeyLast4}`);
        }
        const savedPreset = window.localStorage.getItem("ai-chater-preset");
        setPresetId(presetData.presets.some((preset) => preset.id === savedPreset) ? savedPreset! : presetData.presets[0]?.id ?? "");
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "加载失败。");
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSelectedConversation() {
      if (!activeConversationId) {
        setMessages([]);
        return;
      }
      try {
        const data = await requestJson<{ conversation: Conversation; messages: ChatMessage[] }>(`/api/conversations/${activeConversationId}`);
        if (!cancelled) setMessages(data.messages);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "加载会话失败。");
      }
    }
    void loadSelectedConversation();
    return () => { cancelled = true; };
  }, [activeConversationId, loadConversation]);

  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isSending]);

  async function createConversation() {
    const data = await requestJson<{ conversation: Conversation }>("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "新对话" }),
    });
    setConversations((current) => [data.conversation, ...current]);
    setActiveConversationId(data.conversation.id);
    return data.conversation.id;
  }

  async function choosePreset(id: string) {
    setPresetId(id);
    window.localStorage.setItem("ai-chater-preset", id);
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (!selectedPreset?.supportsImages) {
      setError("当前模型不支持图片输入。");
      return;
    }
    setIsUploading(true);
    setError("");
    try {
      const uploaded = await Promise.all(files.slice(0, Math.max(0, 4 - attachments.length)).map(async (file) => {
        const formData = new FormData();
        formData.append("file", file);
        const response = await requestJson<{ attachment: PendingAttachment }>("/api/uploads", { method: "POST", body: formData });
        return response.attachment;
      }));
      setAttachments((current) => [...current, ...uploaded]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "图片上传失败。");
    } finally {
      setIsUploading(false);
    }
  }

  async function removeAttachment(attachment: PendingAttachment) {
    try {
      await requestJson(`/api/uploads/${attachment.id}`, { method: "DELETE" });
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "移除图片失败。");
    }
  }

  async function sendMessage() {
    if (isSending || isUploading || !presetId || (!text.trim() && !attachments.length)) return;
    setError("");
    setIsSending(true);
    const outgoingText = text.trim();
    const outgoingAttachments = attachments;
    setText("");
    setAttachments([]);
    const optimisticUser: ChatMessage = {
      id: `pending-user-${Date.now()}`,
      role: "user",
      parts: [
        ...(outgoingText ? [{ type: "text" as const, text: outgoingText }] : []),
        ...outgoingAttachments.map((attachment) => ({ type: "image" as const, attachmentId: attachment.id })),
      ],
      presetId: null,
      model: null,
      createdAt: new Date().toISOString(),
    };
    const optimisticAssistantId = `pending-assistant-${Date.now()}`;
    setMessages((current) => [...current, optimisticUser, {
      id: optimisticAssistantId,
      role: "assistant",
      parts: [{ type: "text", text: "" }],
      presetId,
      model: selectedPreset?.model ?? null,
      createdAt: new Date().toISOString(),
    }]);

    let conversationId = activeConversationId;
    try {
      conversationId ??= await createConversation();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, presetId, text: outgoingText, attachmentIds: outgoingAttachments.map((item) => item.id) }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "模型请求失败。");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages((current) => current.map((message) => message.id === optimisticAssistantId
          ? { ...message, parts: [{ type: "text", text: answer }] }
          : message));
      }
      answer += decoder.decode();
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "模型请求失败。");
      }
    } finally {
      abortControllerRef.current = null;
      setIsSending(false);
      if (conversationId) {
        await Promise.all([loadConversation(conversationId), loadConversations()]).catch(() => undefined);
      } else {
        setMessages((current) => current.filter((message) => !message.id.startsWith("pending-")));
      }
    }
  }

  async function renameConversation() {
    if (!activeConversation) return;
    const title = window.prompt("会话标题", activeConversation.title)?.trim();
    if (!title || title === activeConversation.title) return;
    try {
      await requestJson(`/api/conversations/${activeConversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      setConversations((current) => current.map((item) => item.id === activeConversation.id ? { ...item, title } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "重命名失败。");
    }
  }

  async function deleteConversation(id: string) {
    if (!window.confirm("确定删除这个会话吗？图片和消息将一并删除。")) return;
    try {
      await requestJson(`/api/conversations/${id}`, { method: "DELETE" });
      const next = conversations.filter((item) => item.id !== id);
      setConversations(next);
      if (activeConversationId === id) setActiveConversationId(next[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败。");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function stopGenerating() {
    abortControllerRef.current?.abort();
  }

  function toggleSidebar() {
    setIsSidebarExpanded((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "expanded" : "collapsed");
      return next;
    });
  }

  function selectTool(tool: ToolId) {
    setActiveTool(tool);
    setIsSidebarOpen(false);
  }

  async function refreshPresets(selectedId?: string) {
    const presetData = await requestJson<{ presets: AiPreset[] }>("/api/ai/presets");
    setPresets(presetData.presets);
    const nextPresetId = presetData.presets.some((preset) => preset.id === selectedId)
      ? selectedId!
      : presetData.presets[0]?.id ?? "";
    setPresetId(nextPresetId);
    window.localStorage.setItem("ai-chater-preset", nextPresetId);
  }

  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfigError("");
    setConfigNotice("");
    try {
      const payload = await requestJson<{ config: SavedAiConfig }>("/api/me/ai-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...configDraft, ...(apiKey ? { apiKey } : {}) }),
      });
      setConfigDraft({ provider: payload.config.provider, baseUrl: payload.config.baseUrl, model: payload.config.model });
      setApiKey("");
      setConfigNotice(`已保存服务端配置，API Key 末四位：${payload.config.apiKeyLast4}`);
      await refreshPresets("user-config");
    } catch (cause) {
      setConfigError(cause instanceof Error ? cause.message : "保存配置失败。");
    }
  }

  async function clearConfig() {
    setConfigError("");
    try {
      await requestJson("/api/me/ai-config", { method: "DELETE" });
      setConfigDraft(DEFAULT_CONFIG_DRAFT);
      setApiKey("");
      setConfigNotice("已删除服务端模型配置。");
      await refreshPresets();
    } catch (cause) {
      setConfigError(cause instanceof Error ? cause.message : "清空配置失败。");
    }
  }

  function toggleChatBackground() {
    const next = !isChatBackgroundEnabled;
    setIsChatBackgroundEnabled(next);
    window.localStorage.setItem(CHAT_BACKGROUND_STORAGE_KEY, next ? "enabled" : "disabled");
    window.dispatchEvent(new CustomEvent(CHAT_BACKGROUND_CHANGE_EVENT, { detail: { enabled: next } }));
  }

  return (
    <main className={`chat-app ${isChatBackgroundEnabled ? "has-background" : ""}`}>
      <div className={`chat-mobile-scrim ${isSidebarOpen || isAccountPanelOpen || isConfigDrawerOpen ? "is-visible" : ""}`} onClick={() => { setIsSidebarOpen(false); setIsAccountPanelOpen(false); setIsConfigDrawerOpen(false); }} aria-hidden="true" />
      <aside className={`chat-sidebar ${isSidebarExpanded ? "is-expanded" : "is-collapsed"} ${isSidebarOpen ? "is-mobile-open" : ""}`}>
        <div className="chat-sidebar-header">
          <div className="chat-brand"><span className="chat-brand-icon"><Sparkles size={16} /></span><span className="chat-sidebar-label">AI Chater</span></div>
          <button className="chat-icon-button chat-sidebar-toggle" title={isSidebarExpanded ? "收起工具栏" : "展开工具栏"} aria-label={isSidebarExpanded ? "收起工具栏" : "展开工具栏"} onClick={toggleSidebar}>{isSidebarExpanded ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}</button>
        </div>
        <div className="chat-sidebar-scroll">
          <button className="chat-config-entry" onClick={() => { setIsConfigDrawerOpen((current) => !current); setIsAccountPanelOpen(false); setIsSidebarOpen(false); }} title="配置大模型" aria-expanded={isConfigDrawerOpen}>
            <Settings2 size={18} /><span className="chat-sidebar-label">配置</span><span className="chat-config-status chat-sidebar-label">服务端配置</span>
          </button>
          <div className="chat-section-heading chat-sidebar-label">功能</div>
          <nav className="chat-tool-nav" aria-label="功能导航">
            {TOOL_ITEMS.map((item) => { const Icon = item.icon; return <button className={`chat-tool-item ${activeTool === item.id ? "is-active" : ""}`} key={item.id} onClick={() => selectTool(item.id)} title={item.label} aria-current={activeTool === item.id ? "page" : undefined}><Icon size={18} /><span className="chat-sidebar-label">{item.label}</span></button>; })}
          </nav>
          {activeTool === "chat" ? <section className="chat-history-section" aria-label="会话列表">
            <div className="chat-section-heading chat-sidebar-label"><span>最近会话</span><button className="chat-icon-button" title="新建会话" aria-label="新建会话" onClick={() => createConversation().catch((cause) => setError(cause instanceof Error ? cause.message : "新建会话失败。"))} disabled={isSending}><MessageSquarePlus size={16} /></button></div>
            <div className="chat-history-list">
              {conversations.map((conversation) => <div className={`chat-history-row group ${conversation.id === activeConversationId ? "is-active" : ""}`} key={conversation.id}><button className="chat-history-title" onClick={() => { setActiveConversationId(conversation.id); setIsSidebarOpen(false); }}>{conversation.title}</button><button className="chat-icon-button chat-history-delete" title="删除会话" aria-label={`删除 ${conversation.title}`} onClick={() => deleteConversation(conversation.id)}><Trash2 size={14} /></button></div>)}
              {!conversations.length ? <p className="chat-history-empty chat-sidebar-label">还没有会话</p> : null}
            </div>
          </section> : null}
        </div>
        <div className="chat-sidebar-footer chat-sidebar-footer-stack">
          <label className="chat-background-toggle" title="在聊天工作台显示当前外观背景图">
            <input type="checkbox" checked={isChatBackgroundEnabled} onChange={toggleChatBackground} />
            <span className="chat-toggle-track" aria-hidden="true"><span /></span>
            <span className="chat-sidebar-label">开启背景图</span>
          </label>
          <div className="chat-user-footer">
          <div className="chat-avatar">{user.username.slice(0, 1).toUpperCase()}</div><span className="chat-sidebar-label chat-user-name">{user.username}</span>
          <button className="chat-icon-button" title="退出登录" aria-label="退出登录" onClick={logout}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <section className="chat-main">
        <header className="chat-toolbar">
          <div className="chat-toolbar-leading"><button className="chat-icon-button chat-mobile-menu" title="打开工具栏" aria-label="打开工具栏" onClick={() => setIsSidebarOpen(true)}><Menu size={19} /></button><div className="chat-tool-heading"><span className="chat-tool-eyebrow">{activeToolMeta.label}</span><h1>{activeTool === "chat" ? (activeConversation?.title ?? "新对话") : activeToolMeta.description}</h1></div>{activeTool === "chat" && activeConversation ? <button className="chat-icon-button" title="重命名会话" aria-label="重命名会话" onClick={renameConversation}><Pencil size={15} /></button> : null}</div>
          <div className="chat-toolbar-actions"><select className="model-select" value={presetId} onChange={(event) => choosePreset(event.target.value)} disabled={activeTool !== "chat" || !presets.length || isSending}>{presets.length ? presets.map((preset) => <option value={preset.id} key={preset.id}>{preset.label} · {preset.model}</option>) : <option value="">未配置模型</option>}</select><button className="chat-account-trigger" title="账号面板" aria-label="打开账号面板" aria-expanded={isAccountPanelOpen} onClick={() => setIsAccountPanelOpen((current) => !current)}><span className="chat-avatar">{user.username.slice(0, 1).toUpperCase()}</span><span className="chat-account-trigger-name">{user.username}</span></button></div>
        </header>

        {activeTool !== "chat" ? <div className="chat-placeholder"><div className="chat-placeholder-icon"><MoreHorizontal size={26} /></div><span className="chat-tool-eyebrow">{activeToolMeta.label}</span><h2>{activeToolMeta.description}</h2><p>这个功能正在准备中，之后会在这里成为你的新工作窗口。</p><button className="chat-primary-button" onClick={() => selectTool("chat")}><Command size={16} />返回对话</button></div> : <div className="chat-conversation-workspace">
          <div className="message-scroll" ref={messageListRef}><div className="message-stream">
            {!messages.length ? <div className="empty-chat-state"><span><Sparkles size={22} /></span><strong>开始一段新对话</strong><small>输入问题，或从左侧切换其他工作功能。</small></div> : null}
            {messages.map((message) => <MessageView message={message} key={message.id} />)}
          </div></div>
          <div className="composer-shell"><div className="composer-inner">
            {attachments.length ? <div className="attachment-list">{attachments.map((attachment) => <div className="attachment-chip" key={attachment.id}><span>{attachment.originalName}</span><button className="chat-icon-button" title="移除图片" aria-label={`移除 ${attachment.originalName}`} onClick={() => removeAttachment(attachment)}><X size={12} /></button></div>)}</div> : null}
            {error ? <p className="composer-error">{error}</p> : null}
            <div className="composer-box"><input ref={fileInputRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={uploadFiles} /><button className="chat-icon-button attachment-button" title="添加图片" aria-label="添加图片" onClick={() => fileInputRef.current?.click()} disabled={isUploading || !selectedPreset?.supportsImages || isSending}><ImagePlus size={19} /></button><textarea className="composer-input" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder={selectedPreset ? "发送消息" : "请先在 .env 中配置模型"} rows={1} disabled={isSending || !presetId} />{isSending ? <button className="chat-send-button is-stop" title="停止生成" aria-label="停止生成" onClick={stopGenerating}><Square size={15} fill="currentColor" /></button> : <button className="chat-send-button" title="发送消息" aria-label="发送消息" onClick={sendMessage} disabled={isUploading || !presetId || (!text.trim() && !attachments.length)}>{isUploading ? <LoaderCircle className="animate-spin" size={18} /> : <SendHorizontal size={18} />}</button>}</div>
          </div></div>
        </div>}
      </section>

      <aside className={`chat-account-panel ${isAccountPanelOpen ? "is-open" : ""}`} aria-label="账号面板">
        <div className="chat-drawer-header"><div><span className="chat-tool-eyebrow">账号</span><h2>个人空间</h2></div><button className="chat-icon-button" title="关闭账号面板" aria-label="关闭账号面板" onClick={() => setIsAccountPanelOpen(false)}><X size={18} /></button></div>
        <div className="chat-account-card"><div className="chat-account-avatar">{user.username.slice(0, 1).toUpperCase()}</div><strong>{user.username}</strong><span><i />在线</span></div>
        <div className="chat-account-placeholder"><LayoutPanelLeft size={17} /><span>更多账号与工作区设置即将开放</span></div>
        <button className="chat-secondary-button" onClick={logout}><LogOut size={16} />退出登录</button>
      </aside>

      <aside className={`chat-config-drawer ${isConfigDrawerOpen ? "is-open" : ""}`} aria-label="模型配置">
        <div className="chat-drawer-header"><div><span className="chat-tool-eyebrow">工作台配置</span><h2>连接你的模型</h2></div><button className="chat-icon-button" title="关闭配置" aria-label="关闭配置" onClick={() => setIsConfigDrawerOpen(false)}><X size={18} /></button></div>
        <p className="chat-drawer-intro">配置和密钥会加密保存在当前账号中。API Key 留空时保留已保存的密钥。</p>
        <form className="chat-config-form" onSubmit={saveConfig}><label>Provider<select value={configDraft.provider} onChange={(event) => setConfigDraft((current) => ({ ...current, provider: event.target.value }))}><option value="openai-compatible">OpenAI Compatible</option><option value="openai">OpenAI</option><option value="xai">xAI</option><option value="anthropic">Anthropic</option><option value="google">Google</option></select></label><label>Base URL<input type="url" value={configDraft.baseUrl} onChange={(event) => setConfigDraft((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://www.yyapi.cloud/v1" /></label><label>API Key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="首次保存时必填" autoComplete="off" /></label><label>Model<input value={configDraft.model} onChange={(event) => setConfigDraft((current) => ({ ...current, model: event.target.value }))} placeholder="例如 gpt-4o-mini" /></label>{configError ? <p className="chat-form-error" role="alert">{configError}</p> : null}{configNotice ? <p className="chat-form-notice" role="status">{configNotice}</p> : null}<div className="chat-config-actions"><button className="chat-secondary-button" type="button" onClick={() => void clearConfig()}>删除配置</button><button className="chat-primary-button" type="submit">保存配置</button></div></form>
      </aside>
    </main>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <article className={`message-row flex gap-3 ${isUser ? "is-user flex-row-reverse" : ""}`}>
      <div className={`message-avatar grid h-8 w-8 shrink-0 place-items-center rounded-md ${isUser ? "bg-slate-200 text-slate-700" : "bg-[var(--accent)] text-white"}`}>{isUser ? "我" : <Bot size={18} />}</div>
      <div className={`message-body min-w-0 max-w-[82%] ${isUser ? "text-right" : ""}`}>
        {!isUser && message.model ? <div className="message-model mb-1 text-xs text-[var(--muted)]">{message.model}</div> : null}
        <div className={`message-bubble inline-block max-w-full text-left ${isUser ? "rounded-md bg-emerald-50 px-4 py-3" : "py-1"}`}>
          {message.parts.map((part, index) => part.type === "text"
            ? <Markdown key={`${message.id}-text-${index}`}>{part.text || "正在生成..."}</Markdown>
            : <img className="mt-2 max-h-80 max-w-full rounded-md border border-[var(--border)] object-contain" src={`/api/attachments/${part.attachmentId}`} alt="发送的图片" key={part.attachmentId} />)}
        </div>
      </div>
    </article>
  );
}
