"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, ImagePlus, LoaderCircle, LogOut, MessageSquarePlus, Pencil, SendHorizontal, Sparkles, Square, Trash2, X } from "lucide-react";
import { Markdown } from "@/components/markdown";
import type { MessagePart } from "@/lib/messages";

type User = { id: string; username: string };
type Conversation = { id: string; title: string; createdAt: string; updatedAt: string };
type ChatMessage = { id: string; role: "user" | "assistant"; parts: MessagePart[]; presetId: string | null; model: string | null; createdAt: string };
type AiPreset = { id: string; label: string; model: string; supportsImages: boolean };
type PendingAttachment = { id: string; originalName: string };

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((item) => item.id === activeConversationId) ?? null;
  const selectedPreset = presets.find((preset) => preset.id === presetId);

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
        const [conversationData, presetData] = await Promise.all([
          requestJson<{ conversations: Conversation[] }>("/api/conversations"),
          requestJson<{ presets: AiPreset[] }>("/api/ai/presets"),
        ]);
        if (cancelled) return;
        setConversations(conversationData.conversations);
        setPresets(presetData.presets);
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

  return (
    <main className="chat-app flex h-screen overflow-hidden bg-[var(--background)]">
      <aside className="chat-sidebar flex w-72 shrink-0 flex-col border-r border-[var(--border)] bg-white max-md:w-56">
        <div className="sidebar-header flex h-16 items-center justify-between border-b border-[var(--border)] px-4">
          <div className="brand-lockup flex items-center gap-2 font-semibold"><span className="brand-icon grid h-7 w-7 place-items-center rounded-md"><Sparkles size={16} /></span><span>AI Chater</span></div>
          <button className="icon-button sidebar-new grid h-8 w-8 place-items-center rounded-md hover:bg-slate-100" title="新建会话" aria-label="新建会话" onClick={() => createConversation().catch((cause) => setError(cause.message))} disabled={isSending}><MessageSquarePlus size={18} /></button>
        </div>
        <nav className="conversation-list min-h-0 flex-1 overflow-y-auto p-2" aria-label="会话列表">
          {conversations.map((conversation) => (
            <div className={`conversation-row group mb-1 flex h-10 items-center gap-1 rounded-md px-2 ${conversation.id === activeConversationId ? "is-active bg-emerald-50 text-[var(--accent-strong)]" : "hover:bg-slate-100"}`} key={conversation.id}>
              <button className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => setActiveConversationId(conversation.id)}>{conversation.title}</button>
              <button className="icon-button conversation-delete invisible grid h-7 w-7 place-items-center rounded hover:bg-white group-hover:visible" title="删除会话" aria-label={`删除 ${conversation.title}`} onClick={() => deleteConversation(conversation.id)}><Trash2 size={15} /></button>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer flex items-center gap-2 border-t border-[var(--border)] p-3">
          <div className="user-avatar grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-sm font-semibold text-[var(--accent-strong)]">{user.username.slice(0, 1).toUpperCase()}</div>
          <span className="min-w-0 flex-1 truncate text-sm">{user.username}</span>
          <button className="icon-button grid h-8 w-8 place-items-center rounded-md hover:bg-slate-100" title="退出登录" aria-label="退出登录" onClick={logout}><LogOut size={17} /></button>
        </div>
      </aside>

      <section className="chat-main flex min-w-0 flex-1 flex-col">
        <header className="chat-toolbar flex h-16 shrink-0 items-center justify-between border-b border-[var(--border)] bg-white px-4">
          <div className="flex min-w-0 items-center gap-1">
            <h1 className="chat-title m-0 truncate text-base font-semibold">{activeConversation?.title ?? "新对话"}</h1>
            {activeConversation ? <button className="icon-button grid h-8 w-8 place-items-center rounded-md hover:bg-slate-100" title="重命名会话" aria-label="重命名会话" onClick={renameConversation}><Pencil size={15} /></button> : null}
          </div>
          <select className="model-select h-9 max-w-52 rounded-md border border-[var(--border)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]" value={presetId} onChange={(event) => choosePreset(event.target.value)} disabled={!presets.length || isSending}>
            {presets.length ? presets.map((preset) => <option value={preset.id} key={preset.id}>{preset.label} · {preset.model}</option>) : <option value="">未配置模型</option>}
          </select>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="message-scroll flex-1 overflow-y-auto" ref={messageListRef}>
            <div className="message-stream mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-7">
              {!messages.length ? <div className="empty-chat-state mt-20 text-center text-sm text-[var(--muted)]"><span><Sparkles size={22} /></span><strong>新对话</strong></div> : null}
              {messages.map((message) => <MessageView message={message} key={message.id} />)}
            </div>
          </div>
          <div className="composer-shell border-t border-[var(--border)] bg-white px-4 py-3">
            <div className="composer-inner mx-auto max-w-3xl">
              {attachments.length ? <div className="attachment-list mb-2 flex flex-wrap gap-2">{attachments.map((attachment) => <div className="attachment-chip flex items-center gap-1 rounded-md border border-[var(--border)] bg-slate-50 px-2 py-1 text-xs" key={attachment.id}><span className="max-w-36 truncate">{attachment.originalName}</span><button className="icon-button grid h-4 w-4 place-items-center rounded hover:bg-slate-200" title="移除图片" aria-label={`移除 ${attachment.originalName}`} onClick={() => removeAttachment(attachment)}><X size={12} /></button></div>)}</div> : null}
              {error ? <p className="composer-error mb-2 text-sm text-[var(--danger)]">{error}</p> : null}
              <div className="composer-box flex items-end gap-2 rounded-md border border-[var(--border)] bg-white p-2 focus-within:border-[var(--accent)]">
                <input ref={fileInputRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={uploadFiles} />
                <button className="icon-button attachment-button grid h-9 w-9 shrink-0 place-items-center rounded-md hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" title="添加图片" aria-label="添加图片" onClick={() => fileInputRef.current?.click()} disabled={isUploading || !selectedPreset?.supportsImages || isSending}><ImagePlus size={19} /></button>
                <textarea className="composer-input max-h-36 min-h-9 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm outline-none" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder={selectedPreset ? "发送消息" : "请先在 .env 中配置模型"} rows={1} disabled={isSending || !presetId} />
                {isSending ? <button className="stop-button grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-800 text-white hover:bg-slate-700" title="停止生成" aria-label="停止生成" onClick={stopGenerating}><Square size={15} fill="currentColor" /></button> : <button className="primary-icon grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-40" title="发送消息" aria-label="发送消息" onClick={sendMessage} disabled={isUploading || !presetId || (!text.trim() && !attachments.length)}>{isUploading ? <LoaderCircle className="animate-spin" size={18} /> : <SendHorizontal size={18} />}</button>}
              </div>
            </div>
          </div>
        </div>
      </section>
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
