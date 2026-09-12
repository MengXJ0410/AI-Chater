"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, ChevronLeft, ChevronRight, Command, FileImage, LayoutPanelLeft, LoaderCircle, LogOut, Menu, MessageSquarePlus, MoreHorizontal, Paperclip, Pencil, PlugZap, SendHorizontal, Settings2, Sparkles, Square, Trash2, UserRound, Video, WandSparkles, X } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { ChatAmbientLayer } from "@/components/chat-ambient-layer";
import { UserAvatar } from "@/components/user-avatar";
import { ImageWorkspace } from "@/components/image-workspace";
import { VideoWorkspace } from "@/components/video-workspace";
import { SavedConfigList } from "@/components/saved-config-list";
import { CHAT_BACKGROUND_CHANGE_EVENT, CHAT_BACKGROUND_STORAGE_KEY } from "@/client/appearance";
import { CHAT_ENTRY_READY_EVENT, CHAT_ENTRY_STORAGE_KEY, isPendingChatEntry } from "@/client/chat-entry-transition";
import { appendStreamText, getGenerationLabel, type GenerationStatus } from "@/client/chat-message";
import { getFollowScrollTop, isNearScrollBottom } from "@/client/chat-ambient";
import { createLegacyWorkspaceConfigs, isWorkspaceConfigFallbackStatus, normalizeSavedWorkspaceConfigs, type SavedWorkspaceConfig, type WorkspaceConfigFilter, type WorkspaceConfigMode } from "@/client/workspace-configs";
import type { MessagePart } from "@/shared/messages";

type User = { id: string; username: string; avatarUrl?: string | null };
type Conversation = { id: string; title: string; createdAt: string; updatedAt: string };
type ChatMessage = { id: string; role: "user" | "assistant"; parts: MessagePart[]; presetId: string | null; model: string | null; createdAt: string; status?: GenerationStatus };
type AiPreset = { id: string; label: string; model: string; supportsImages: boolean };
type ConnectionPreset = { id: string; label: string; provider: string; baseUrl: string; model: string; readOnly?: boolean };
type CustomDraft = { provider: "openai" | "openai-compatible" | "xai" | "anthropic" | "google"; baseUrl: string; model: string };
type PendingAttachment = { id: string; originalName: string };
type ToolId = "chat" | "image" | "video" | "agent";
type SavedAiConfig = ConnectionPreset & { presetId: string; name?: string; apiKeyConfigured: true; apiKeyLast4: string };
type ImageConfigDraft = { name: string; provider: "xai-compatible" | "openai-compatible"; baseUrl: string; model: string };
type SavedImageConfig = ImageConfigDraft & { apiKeyConfigured: true; apiKeyLast4: string };

const SIDEBAR_STORAGE_KEY = "ai-chater-chat-sidebar-v1";
const IMAGE_PRESET_STORAGE_KEY = "ai-chater-image-preset";
const TOOL_ITEMS: Array<{ id: ToolId; label: string; description: string; icon: typeof Command }> = [
  { id: "chat", label: "对话", description: "与模型进行连续对话", icon: Command },
  { id: "image", label: "生图", description: "从文字生成图像", icon: FileImage },
  { id: "video", label: "视频", description: "生成和编辑视频", icon: Video },
  { id: "agent", label: "Agent", description: "组合工具完成任务", icon: WandSparkles },
];

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
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [isChatBackgroundEnabled, setIsChatBackgroundEnabled] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAccountPanelOpen, setIsAccountPanelOpen] = useState(false);
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = useState(false);
  const [isEntering, setIsEntering] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [connectionPresets, setConnectionPresets] = useState<ConnectionPreset[]>([]);
  const [connectionPresetId, setConnectionPresetId] = useState("");
  const [chatConfigName, setChatConfigName] = useState("我的对话配置");
  const [customDraft, setCustomDraft] = useState<CustomDraft>({ provider: "openai-compatible", baseUrl: "", model: "" });
  const [apiKey, setApiKey] = useState("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [configNotice, setConfigNotice] = useState("");
  const [configError, setConfigError] = useState("");
  const [configTab, setConfigTab] = useState<"chat" | "image">("chat");
  const [configView, setConfigView] = useState<"editor" | "saved">("editor");
  const [savedConfigFilter, setSavedConfigFilter] = useState<WorkspaceConfigFilter>("all");
  const [savedConfigs, setSavedConfigs] = useState<SavedWorkspaceConfig[]>([]);
  const [savedConfigMode, setSavedConfigMode] = useState<WorkspaceConfigMode>("legacy");
  const [savedConfigsError, setSavedConfigsError] = useState("");
  const [isSavedConfigsLoading, setIsSavedConfigsLoading] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [imageConfigDraft, setImageConfigDraft] = useState<ImageConfigDraft>({ name: "我的生图模型", provider: "xai-compatible", baseUrl: "", model: "" });
  const [imageApiKey, setImageApiKey] = useState("");
  const [imageConfigRevision, setImageConfigRevision] = useState(0);
  const [preferredImagePresetId, setPreferredImagePresetId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const shouldFollowMessagesRef = useRef(true);
  const loadingConversationRef = useRef(0);

  useEffect(() => {
    const tool = new URLSearchParams(window.location.search).get("tool");
    if (tool === "image" || tool === "video" || tool === "agent" || tool === "chat") void Promise.resolve().then(() => setActiveTool(tool));
  }, []);

  useEffect(() => {
    if (!isConfigDrawerOpen || configView !== "editor" || configTab !== "image" || editingConfigId) return;
    let cancelled = false;
    void requestJson<{ config?: SavedImageConfig | null }>("/api/me/image-config")
      .then((data) => { if (!cancelled && data.config) setImageConfigDraft({ name: data.config.name, provider: data.config.provider, baseUrl: data.config.baseUrl, model: data.config.model }); })
      .catch((cause) => { if (!cancelled) setConfigNotice(cause instanceof Error ? cause.message : "生图配置服务尚未接入。"); });
    return () => { cancelled = true; };
  }, [configTab, configView, editingConfigId, isConfigDrawerOpen]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setIsSidebarExpanded(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "collapsed");
      setIsChatBackgroundEnabled(window.localStorage.getItem(CHAT_BACKGROUND_STORAGE_KEY) === "enabled");
      setPreferredImagePresetId(window.localStorage.getItem(IMAGE_PRESET_STORAGE_KEY) ?? "");
    });
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const entryToken = window.sessionStorage.getItem(CHAT_ENTRY_STORAGE_KEY);
    if (!isPendingChatEntry(entryToken)) return;
    window.sessionStorage.removeItem(CHAT_ENTRY_STORAGE_KEY);
    void Promise.resolve().then(() => {
      setIsEntering(true);
      window.dispatchEvent(new Event(CHAT_ENTRY_READY_EVENT));
      window.setTimeout(() => setIsEntering(false), 460);
    });
  }, []);

  const activeConversation = conversations.find((item) => item.id === activeConversationId) ?? null;
  const selectedPreset = presets.find((preset) => preset.id === presetId);
  const selectedConnectionPreset = connectionPresets.find((preset) => preset.id === connectionPresetId);
  const isCustomConnection = connectionPresetId === "custom";
  const activeToolMeta = TOOL_ITEMS.find((item) => item.id === activeTool) ?? TOOL_ITEMS[0];

  const loadSavedConfigs = useCallback(async () => {
    setIsSavedConfigsLoading(true);
    setSavedConfigsError("");
    try {
      const response = await fetch("/api/me/model-configs");
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        setSavedConfigs(normalizeSavedWorkspaceConfigs(payload.configs));
        setSavedConfigMode("multi");
        return;
      }
      if (!isWorkspaceConfigFallbackStatus(response.status)) throw new Error(payload.error ?? "读取我的配置失败。");
      const [chatData, imageData] = await Promise.all([
        requestJson<{ config: SavedAiConfig | null }>("/api/me/ai-config"),
        requestJson<{ config: SavedImageConfig | null }>("/api/me/image-config"),
      ]);
      setSavedConfigs(createLegacyWorkspaceConfigs(chatData.config, imageData.config));
      setSavedConfigMode("legacy");
    } catch (cause) {
      setSavedConfigsError(cause instanceof Error ? cause.message : "读取我的配置失败。");
    } finally {
      setIsSavedConfigsLoading(false);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    const data = await requestJson<{ conversations: Conversation[] }>("/api/conversations");
    setConversations(data.conversations);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const data = await requestJson<{ conversation: Conversation; messages: ChatMessage[] }>(`/api/conversations/${id}`);
    setMessages(data.messages);
  }, []);

  useEffect(() => {
    if (!isConfigDrawerOpen) return;
    void Promise.resolve().then(loadSavedConfigs);
  }, [configView, isConfigDrawerOpen, loadSavedConfigs]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    const handleScroll = () => {
      const nearBottom = isNearScrollBottom(list.scrollTop, list.clientHeight, list.scrollHeight);
      shouldFollowMessagesRef.current = nearBottom;
      setShowScrollToBottom(!nearBottom && isSending);
    };
    handleScroll();
    list.addEventListener("scroll", handleScroll, { passive: true });
    return () => list.removeEventListener("scroll", handleScroll);
  }, [isSending]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const [conversationData, presetData, configData] = await Promise.all([
          requestJson<{ conversations: Conversation[] }>("/api/conversations"),
          requestJson<{ presets: AiPreset[] }>("/api/ai/presets"),
          requestJson<{ config: SavedAiConfig | null; presets: ConnectionPreset[] }>("/api/me/ai-config"),
        ]);
        if (cancelled) return;
        setConversations(conversationData.conversations);
        setPresets(presetData.presets);
        setConnectionPresets(configData.presets);
        if (configData.config) {
          setConnectionPresetId(configData.config.presetId);
          setChatConfigName(configData.config.name || configData.config.label || "我的对话配置");
          if (configData.config.presetId === "custom") {
            setCustomDraft({ provider: configData.config.provider as CustomDraft["provider"], baseUrl: configData.config.baseUrl, model: configData.config.model });
          }
          setConfigNotice(`已保存服务端配置，API Key 末四位：${configData.config.apiKeyLast4}`);
          setPresetId(presetData.presets.some((preset) => preset.id === "user-config") ? "user-config" : presetData.presets[0]?.id ?? "");
          return;
        }
        const savedPreset = window.localStorage.getItem("ai-chater-preset");
        setPresetId(presetData.presets.some((preset) => preset.id === savedPreset) ? savedPreset! : presetData.presets[0]?.id ?? "");
        setConnectionPresetId(configData.presets[0]?.id ?? "");
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "加载失败。");
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++loadingConversationRef.current;
    async function loadSelectedConversation() {
      if (!activeConversationId) {
        setMessages([]);
        return;
      }
      try {
        const data = await requestJson<{ conversation: Conversation; messages: ChatMessage[] }>(`/api/conversations/${activeConversationId}`);
        if (!cancelled && requestId === loadingConversationRef.current && !isSending) setMessages(data.messages);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "加载会话失败。");
      }
    }
    void loadSelectedConversation();
    return () => { cancelled = true; };
  }, [activeConversationId, isSending, loadConversation]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list || !shouldFollowMessagesRef.current) return;
    list.scrollTop = getFollowScrollTop(list.scrollHeight, list.clientHeight);
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
      status: "complete",
    };
    const optimisticAssistantId = `pending-assistant-${Date.now()}`;
    setMessages((current) => [...current, optimisticUser, {
      id: optimisticAssistantId,
      role: "assistant",
      parts: [{ type: "text", text: "" }],
      presetId,
      model: selectedPreset?.model ?? null,
      createdAt: new Date().toISOString(),
      status: "thinking",
    }]);
    shouldFollowMessagesRef.current = true;
    window.requestAnimationFrame(() => {
      const list = messageListRef.current;
      if (list) list.scrollTop = getFollowScrollTop(list.scrollHeight, list.clientHeight);
    });

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
        answer = appendStreamText(answer, decoder.decode(value, { stream: true }));
        setMessages((current) => current.map((message) => message.id === optimisticAssistantId
          ? { ...message, status: "streaming", parts: [{ type: "text", text: answer }] }
          : message));
      }
      answer = appendStreamText(answer, decoder.decode());
      setMessages((current) => current.map((message) => message.id === optimisticAssistantId
        ? { ...message, status: "complete", parts: [{ type: "text", text: answer }] }
        : message));
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "模型请求失败。");
      }
      setMessages((current) => current.map((message) => message.id === optimisticAssistantId
        ? { ...message, status: "error" }
        : message));
    } finally {
      abortControllerRef.current = null;
      setIsSending(false);
      if (conversationId) {
        if (conversationId === activeConversationId || !activeConversationId) {
          await Promise.all([loadConversation(conversationId), loadConversations()]).catch(() => undefined);
        }
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
    router.replace(tool === "chat" ? "/chat" : `/chat?tool=${tool}`, { scroll: false });
    setIsSidebarOpen(false);
  }

  async function saveImageConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setConfigError(""); setConfigNotice("");
    try {
      const payload = { kind: "image", ...imageConfigDraft, ...(imageApiKey ? { apiKey: imageApiKey } : {}) };
      const isMultiEdit = savedConfigMode === "multi" && editingConfigId && !editingConfigId.startsWith("legacy-");
      await requestJson(isMultiEdit ? `/api/me/model-configs/${editingConfigId}` : savedConfigMode === "multi" ? "/api/me/model-configs" : "/api/me/image-config", { method: isMultiEdit || savedConfigMode === "legacy" ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(savedConfigMode === "legacy" ? { ...imageConfigDraft, ...(imageApiKey ? { apiKey: imageApiKey } : {}) } : payload) });
      setImageApiKey(""); setEditingConfigId(null); setImageConfigRevision((current) => current + 1); setConfigNotice("已保存生图配置。");
      await loadSavedConfigs();
      setConfigView("saved");
    } catch (cause) { setConfigError(cause instanceof Error ? cause.message : "生图配置服务尚未接入。"); }
  }

  async function testImageConfig() {
    setConfigError(""); setConfigNotice("测试生图连接可能会真实生成图片并产生费用。");
    try { await requestJson("/api/me/image-config/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...imageConfigDraft, ...(imageApiKey ? { apiKey: imageApiKey } : {}) }) }); setConfigNotice("生图连接测试成功。"); }
    catch (cause) { setConfigError(cause instanceof Error ? cause.message : "生图配置服务尚未接入。"); }
  }

  async function clearImageConfig(skipConfirmation = false) {
    if (!skipConfirmation && !window.confirm("确定删除这个生图配置吗？已保存的 API Key 也会一并删除。")) return;
    setConfigError("");
    try {
      const isMultiEdit = savedConfigMode === "multi" && editingConfigId && !editingConfigId.startsWith("legacy-");
      await requestJson(isMultiEdit ? `/api/me/model-configs/${editingConfigId}` : "/api/me/image-config", { method: "DELETE" });
      setImageApiKey(""); setEditingConfigId(null); setImageConfigDraft({ name: "我的生图模型", provider: "xai-compatible", baseUrl: "", model: "" }); setImageConfigRevision((current) => current + 1); setConfigNotice("已删除生图配置。");
      await loadSavedConfigs();
    }
    catch (cause) { setConfigError(cause instanceof Error ? cause.message : "生图配置服务尚未接入。"); }
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
      const configPayload = getConfigPayload();
      const multiConfigPayload = getMultiChatConfigPayload();
      const isMultiEdit = savedConfigMode === "multi" && editingConfigId && !editingConfigId.startsWith("legacy-");
      const payload = await requestJson<{ config: SavedAiConfig | SavedWorkspaceConfig }>(isMultiEdit ? `/api/me/model-configs/${editingConfigId}` : savedConfigMode === "multi" ? "/api/me/model-configs" : "/api/me/ai-config", {
        method: isMultiEdit || savedConfigMode === "legacy" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(savedConfigMode === "legacy" ? configPayload : multiConfigPayload),
      });
      if (savedConfigMode === "legacy") {
        const saved = payload.config as SavedAiConfig;
        setConnectionPresetId(saved.presetId);
        if (saved.presetId === "custom") setCustomDraft({ provider: saved.provider as CustomDraft["provider"], baseUrl: saved.baseUrl, model: saved.model });
      }
      setConnectionPresets((current) => current.filter((preset) => !preset.readOnly));
      setApiKey("");
      setEditingConfigId(null);
      setConfigNotice(`已保存服务端配置，API Key 末四位：${payload.config.apiKeyLast4}`);
      await refreshPresets(savedConfigMode === "multi" ? (payload.config as SavedWorkspaceConfig).runtimePresetId : "user-config");
      await loadSavedConfigs();
      setConfigView("saved");
    } catch (cause) {
      setConfigError(cause instanceof Error ? cause.message : "保存配置失败。");
    }
  }

  function getConfigPayload() {
    const name = chatConfigName.trim() || selectedConnectionPreset?.label || "我的对话配置";
    if (connectionPresetId === "custom") return { presetId: "custom", name, ...customDraft, ...(apiKey ? { apiKey } : {}) };
    if (selectedConnectionPreset) return { presetId: "custom", name, provider: selectedConnectionPreset.provider, baseUrl: selectedConnectionPreset.baseUrl, model: selectedConnectionPreset.model, ...(apiKey ? { apiKey } : {}) };
    return { presetId: connectionPresetId, ...(apiKey ? { apiKey } : {}) };
  }

  function getMultiChatConfigPayload() {
    const connection = connectionPresetId === "custom" ? customDraft : selectedConnectionPreset;
    return {
      kind: "chat" as const,
      name: chatConfigName.trim() || selectedConnectionPreset?.label || "我的对话配置",
      connectionPresetId,
      ...(connection ? { provider: connection.provider, baseUrl: connection.baseUrl, model: connection.model } : {}),
      ...(apiKey ? { apiKey } : {}),
    };
  }

  async function testConfig() {
    if (isTestingConnection || isSending) return;
    setConfigError("");
    setConfigNotice("");
    setIsTestingConnection(true);
    try {
      const result = await requestJson<{ ok: true; model: string }>("/api/me/ai-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getConfigPayload()),
      });
      setConfigNotice(`连接测试成功，可以保存配置（${result.model}）`);
    } catch (cause) {
      setConfigError(cause instanceof Error ? cause.message : "连接测试失败，请检查 API Key、Base URL 和 Model。");
    } finally {
      setIsTestingConnection(false);
    }
  }

  async function clearConfig(skipConfirmation = false) {
    if (!skipConfirmation && !window.confirm("确定删除这个对话配置吗？已保存的 API Key 也会一并删除。")) return;
    setConfigError("");
    try {
      const isMultiEdit = savedConfigMode === "multi" && editingConfigId && !editingConfigId.startsWith("legacy-");
      await requestJson(isMultiEdit ? `/api/me/model-configs/${editingConfigId}` : "/api/me/ai-config", { method: "DELETE" });
      setConnectionPresetId(connectionPresets[0]?.id ?? "");
      setChatConfigName("我的对话配置");
      setCustomDraft({ provider: "openai-compatible", baseUrl: "", model: "" });
      setConnectionPresets((current) => current.filter((preset) => !preset.readOnly));
      setApiKey("");
      setEditingConfigId(null);
      setConfigNotice("已删除服务端模型配置。");
      await refreshPresets();
      await loadSavedConfigs();
    } catch (cause) {
      setConfigError(cause instanceof Error ? cause.message : "清空配置失败。");
    }
  }

  async function applySavedConfig(config: SavedWorkspaceConfig) {
    setSavedConfigsError("");
    try {
      if (config.kind === "chat") {
        await refreshPresets(config.runtimePresetId);
        selectTool("chat");
      } else {
        setPreferredImagePresetId(config.runtimePresetId);
        window.localStorage.setItem(IMAGE_PRESET_STORAGE_KEY, config.runtimePresetId);
        setImageConfigRevision((current) => current + 1);
        selectTool("image");
      }
      setIsConfigDrawerOpen(false);
    } catch (cause) {
      setSavedConfigsError(cause instanceof Error ? cause.message : "切换配置失败。");
    }
  }

  function editSavedConfig(config: SavedWorkspaceConfig) {
    setEditingConfigId(config.id);
    setConfigView("editor");
    setConfigTab(config.kind);
    setConfigError("");
    setConfigNotice(`API Key 已安全保存，末四位：${config.apiKeyLast4 || "未知"}。留空表示保持不变。`);
    if (config.kind === "chat") {
      const nextPresetId = config.connectionPresetId && connectionPresets.some((preset) => preset.id === config.connectionPresetId) ? config.connectionPresetId : "custom";
      setConnectionPresetId(nextPresetId);
      setChatConfigName(config.name);
      setCustomDraft({ provider: config.provider as CustomDraft["provider"], baseUrl: config.baseUrl, model: config.model });
      setApiKey("");
    } else {
      setImageConfigDraft({ name: config.name, provider: config.provider as ImageConfigDraft["provider"], baseUrl: config.baseUrl, model: config.model });
      setImageApiKey("");
    }
  }

  async function deleteSavedConfig(config: SavedWorkspaceConfig) {
    if (!window.confirm(`确定删除“${config.name}”吗？已保存的 API Key 也会一并删除。`)) return;
    setSavedConfigsError("");
    try {
      if (savedConfigMode === "legacy" || config.id.startsWith("legacy-")) {
        if (config.kind === "chat") await clearConfig(true);
        else await clearImageConfig(true);
      } else {
        await requestJson(`/api/me/model-configs/${config.id}`, { method: "DELETE" });
        if (config.kind === "chat") await refreshPresets(config.runtimePresetId === presetId ? undefined : presetId);
        else {
          if (config.runtimePresetId === preferredImagePresetId) {
            setPreferredImagePresetId("");
            window.localStorage.removeItem(IMAGE_PRESET_STORAGE_KEY);
          }
          setImageConfigRevision((current) => current + 1);
        }
        await loadSavedConfigs();
      }
    } catch (cause) {
      setSavedConfigsError(cause instanceof Error ? cause.message : "删除配置失败。");
    }
  }

  function toggleChatBackground() {
    const next = !isChatBackgroundEnabled;
    setIsChatBackgroundEnabled(next);
    window.localStorage.setItem(CHAT_BACKGROUND_STORAGE_KEY, next ? "enabled" : "disabled");
    window.dispatchEvent(new CustomEvent(CHAT_BACKGROUND_CHANGE_EVENT, { detail: { enabled: next } }));
  }

  return (
    <main className={`chat-app ${isChatBackgroundEnabled ? "has-background" : ""} ${isEntering ? "is-entering" : ""}`}>
      <ChatAmbientLayer />
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
            <Link className="chat-tool-item chat-tool-link" href="/companion" title="AIRI" onClick={() => setIsSidebarOpen(false)}>
              <Bot size={18} /><span className="chat-sidebar-label">AIRI</span>
            </Link>
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
          <UserAvatar className="chat-avatar" username={user.username} src={user.avatarUrl} /><span className="chat-sidebar-label chat-user-name">{user.username}</span>
          <button className="chat-icon-button" title="退出登录" aria-label="退出登录" onClick={logout}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <section className="chat-main">
        <header className="chat-toolbar">
          <div className="chat-toolbar-leading"><button className="chat-icon-button chat-mobile-menu" title="打开工具栏" aria-label="打开工具栏" onClick={() => setIsSidebarOpen(true)}><Menu size={19} /></button><div className="chat-tool-heading"><span className="chat-tool-eyebrow">{activeToolMeta.label}</span><h1>{activeTool === "chat" ? (activeConversation?.title ?? "新对话") : activeToolMeta.description}</h1></div>{activeTool === "chat" && activeConversation ? <button className="chat-icon-button" title="重命名会话" aria-label="重命名会话" onClick={renameConversation}><Pencil size={15} /></button> : null}</div>
          <div className="chat-toolbar-actions">{activeTool === "chat" ? <select className="model-select" value={presetId} onChange={(event) => choosePreset(event.target.value)} disabled={!presets.length || isSending}>{presets.length ? presets.map((preset) => <option value={preset.id} key={preset.id}>{preset.label} · {preset.model}</option>) : <option value="">未配置模型</option>}</select> : null}<button className="chat-account-trigger" title="账号面板" aria-label="打开账号面板" aria-expanded={isAccountPanelOpen} onClick={() => setIsAccountPanelOpen((current) => !current)}><UserAvatar className="chat-avatar" username={user.username} src={user.avatarUrl} /><span className="chat-account-trigger-name">{user.username}</span></button></div>
        </header>

        {activeTool === "video" ? <VideoWorkspace conversationId={activeConversationId} ensureConversation={async () => activeConversationId ?? createConversation()} onOpenConfig={() => setIsConfigDrawerOpen(true)} /> : activeTool === "image" ? <ImageWorkspace configRevision={imageConfigRevision} preferredPresetId={preferredImagePresetId} onPreferredPresetChange={(id) => { setPreferredImagePresetId(id); window.localStorage.setItem(IMAGE_PRESET_STORAGE_KEY, id); }} conversationId={activeConversationId} ensureConversation={async () => activeConversationId ?? createConversation()} onOpenConfig={() => { setConfigView("editor"); setEditingConfigId(null); setConfigTab("image"); setIsConfigDrawerOpen(true); }} /> : activeTool !== "chat" ? <div className="chat-placeholder"><div className="chat-placeholder-icon"><MoreHorizontal size={26} /></div><span className="chat-tool-eyebrow">{activeToolMeta.label}</span><h2>{activeToolMeta.description}</h2><p>这个功能正在准备中，之后会在这里成为你的新工作窗口。</p><button className="chat-primary-button" onClick={() => selectTool("chat")}><Command size={16} />返回对话</button></div> : <div className="chat-conversation-workspace">
          <div className="message-scroll" ref={messageListRef}><div className="message-stream">
            {!messages.length ? <div className="empty-chat-state"><span><Sparkles size={22} /></span><strong>开始一段新对话</strong><small>输入问题，或从左侧切换其他工作功能。</small></div> : null}
            {messages.map((message) => <MessageView message={message} user={user} key={message.id} />)}
          </div>{showScrollToBottom ? <button className="chat-scroll-bottom" type="button" onClick={() => { const list = messageListRef.current; if (!list) return; shouldFollowMessagesRef.current = true; setShowScrollToBottom(false); list.scrollTo({ top: getFollowScrollTop(list.scrollHeight, list.clientHeight), behavior: "smooth" }); }}>回到底部</button> : null}</div>
          <div className="composer-shell"><div className="composer-inner">
            {attachments.length ? <div className="attachment-list">{attachments.map((attachment) => <div className="attachment-chip" key={attachment.id}><span>{attachment.originalName}</span><button className="chat-icon-button" title="移除图片" aria-label={`移除 ${attachment.originalName}`} onClick={() => removeAttachment(attachment)}><X size={12} /></button></div>)}</div> : null}
            {error ? <p className="composer-error">{error}</p> : null}
            <div className="composer-box"><input ref={fileInputRef} className="chat-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={uploadFiles} /><button className="chat-icon-button attachment-button" data-tooltip="文件" type="button" aria-label="上传文件" onClick={() => fileInputRef.current?.click()} disabled={isUploading || !selectedPreset?.supportsImages || isSending}><Paperclip size={19} /></button><textarea className="composer-input" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder={selectedPreset ? "发送消息" : "请先在 .env 中配置模型"} rows={1} disabled={isSending || !presetId} />{isSending ? <button className="chat-send-button is-stop" title="停止生成" aria-label="停止生成" onClick={stopGenerating}><Square size={15} fill="currentColor" /></button> : <button className="chat-send-button" title="发送消息" aria-label="发送消息" onClick={sendMessage} disabled={isUploading || !presetId || (!text.trim() && !attachments.length)}>{isUploading ? <LoaderCircle className="animate-spin" size={18} /> : <SendHorizontal size={18} />}</button>}</div>
          </div></div>
        </div>}
      </section>

      <aside className={`chat-account-panel ${isAccountPanelOpen ? "is-open" : ""}`} aria-label="账号面板">
        <div className="chat-drawer-header"><div><span className="chat-tool-eyebrow">账号</span><h2>个人空间</h2></div><button className="chat-icon-button" title="关闭账号面板" aria-label="关闭账号面板" onClick={() => setIsAccountPanelOpen(false)}><X size={18} /></button></div>
        <div className="chat-account-card"><UserAvatar className="chat-account-avatar" username={user.username} src={user.avatarUrl} /><strong>{user.username}</strong><span><i />在线</span></div>
        <Link className="chat-profile-link" href="/profile" onClick={() => setIsAccountPanelOpen(false)}><UserRound size={16} />个人资料</Link>
        <div className="chat-account-placeholder"><LayoutPanelLeft size={17} /><span>更多账号与工作区设置即将开放</span></div>
        <button className="chat-secondary-button" onClick={logout}><LogOut size={16} />退出登录</button>
      </aside>

      <aside className={`chat-config-drawer ${isConfigDrawerOpen ? "is-open" : ""}`} aria-label="模型配置">
        <div className="chat-drawer-header"><div><span className="chat-tool-eyebrow">工作台配置</span><h2>{configView === "saved" ? "我的配置" : configTab === "chat" ? "连接你的模型" : "连接生图模型"}</h2></div><div className="chat-drawer-header-actions"><button className="chat-drawer-view-link" type="button" onClick={() => { setConfigView((current) => current === "editor" ? "saved" : "editor"); setConfigError(""); setSavedConfigsError(""); }}>{configView === "editor" ? ">>我的配置" : ">>前往配置"}</button><button className="chat-icon-button" title="关闭配置" aria-label="关闭配置" onClick={() => setIsConfigDrawerOpen(false)}><X size={18} /></button></div></div>
        {configView === "saved" ? <SavedConfigList configs={savedConfigs} filter={savedConfigFilter} isLegacyMode={savedConfigMode === "legacy"} isLoading={isSavedConfigsLoading} error={savedConfigsError} activeChatPresetId={presetId} activeImagePresetId={preferredImagePresetId} onFilterChange={setSavedConfigFilter} onUse={(config) => void applySavedConfig(config)} onEdit={editSavedConfig} onDelete={(config) => void deleteSavedConfig(config)} /> : <>
        <div className="chat-config-tabs" role="tablist" aria-label="模型配置类型"><button type="button" role="tab" aria-selected={configTab === "chat"} className={configTab === "chat" ? "is-active" : ""} onClick={() => { setConfigTab("chat"); setEditingConfigId(null); setConfigError(""); }}>对话模型</button><button type="button" role="tab" aria-selected={configTab === "image"} className={configTab === "image" ? "is-active" : ""} onClick={() => { setConfigTab("image"); setEditingConfigId(null); setConfigError(""); }}>生图模型</button></div>
        {configTab === "chat" ? <><p className="chat-drawer-intro">配置和密钥会加密保存在当前账号中。API Key 留空时保留已保存的密钥。</p>
        <form className="chat-config-form" onSubmit={saveConfig}>
          <label>配置名称<input value={chatConfigName} maxLength={80} onChange={(event) => setChatConfigName(event.target.value)} placeholder="我的对话配置" /></label>
          <label>连接方案<select value={connectionPresetId} onChange={(event) => setConnectionPresetId(event.target.value)}>{connectionPresets.map((preset) => <option value={preset.id} key={preset.id} disabled={preset.readOnly}>{preset.label}</option>)}</select></label>
          {isCustomConnection ? <div className="chat-config-details"><label>Provider<select value={customDraft.provider} onChange={(event) => setCustomDraft((current) => ({ ...current, provider: event.target.value as CustomDraft["provider"] }))}><option value="openai-compatible">OpenAI Compatible</option><option value="openai">OpenAI</option><option value="xai">xAI</option><option value="anthropic">Anthropic</option><option value="google">Google</option></select></label><label>Base URL<input type="url" value={customDraft.baseUrl} onChange={(event) => setCustomDraft((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.example.com/v1" /></label><label>Model<input value={customDraft.model} onChange={(event) => setCustomDraft((current) => ({ ...current, model: event.target.value }))} placeholder="模型 ID" /></label></div> : selectedConnectionPreset ? <div className="chat-config-details"><label>Provider<input value={selectedConnectionPreset.provider} readOnly /></label><label>Base URL<input value={selectedConnectionPreset.baseUrl} readOnly /></label><label>Model<input value={selectedConnectionPreset.model} readOnly /></label>{selectedConnectionPreset.readOnly ? <p className="chat-form-notice">这是旧账号的自定义配置。请选择新的连接方案后保存以迁移。</p> : null}</div> : null}
          <label>API Key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="首次保存时必填" autoComplete="off" /></label>
          {configNotice && !apiKey ? <p className="chat-form-notice" role="status">{configNotice}</p> : null}
          {configError ? <p className="chat-form-error" role="alert">{configError}</p> : null}
          <div className="chat-config-actions"><button className="chat-secondary-button" type="button" onClick={() => void clearConfig()}>删除配置</button><button className="chat-secondary-button" type="button" onClick={() => void testConfig()} disabled={isTestingConnection || isSending || !connectionPresetId || selectedConnectionPreset?.readOnly}><PlugZap size={16} />{isTestingConnection ? "测试中..." : "测试连接"}</button><button className="chat-primary-button" type="submit" disabled={!chatConfigName.trim() || !connectionPresetId || selectedConnectionPreset?.readOnly || isTestingConnection}>{editingConfigId ? "保存修改" : "保存配置"}</button></div>
        </form></> : <><p className="chat-drawer-intro">生图模型配置由后端独立管理，不会复用对话模型密钥。</p><form className="chat-config-form" onSubmit={saveImageConfig}><label>配置名称<input value={imageConfigDraft.name} maxLength={80} onChange={(event) => setImageConfigDraft((current) => ({ ...current, name: event.target.value }))} placeholder="我的生图模型" /></label><label>Provider<select value={imageConfigDraft.provider} onChange={(event) => setImageConfigDraft((current) => ({ ...current, provider: event.target.value as ImageConfigDraft["provider"] }))}><option value="xai-compatible">xAI Compatible</option><option value="openai-compatible">OpenAI Compatible</option></select></label><label>Base URL<input type="url" value={imageConfigDraft.baseUrl} onChange={(event) => setImageConfigDraft((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.example.com/v1" /></label><label>Image Model<input value={imageConfigDraft.model} onChange={(event) => setImageConfigDraft((current) => ({ ...current, model: event.target.value }))} placeholder="grok-imagine-image" /></label><label>API Key<input type="password" value={imageApiKey} onChange={(event) => setImageApiKey(event.target.value)} placeholder="首次保存时必填，留空保持原密钥" autoComplete="off" /></label>{configNotice ? <p className="chat-form-notice" role="status">{configNotice}</p> : null}{configError ? <p className="chat-form-error" role="alert">{configError}</p> : null}<div className="chat-config-actions"><button className="chat-secondary-button" type="button" onClick={() => void clearImageConfig()}>删除配置</button><button className="chat-secondary-button" type="button" onClick={() => void testImageConfig()}><PlugZap size={16} />测试连接（可能收费）</button><button className="chat-primary-button" type="submit" disabled={!imageConfigDraft.name.trim()}>{editingConfigId ? "保存修改" : "保存配置"}</button></div></form></>}
        </>}
      </aside>
    </main>
  );
}

function MessageView({ message, user }: { message: ChatMessage; user: User }) {
  const isUser = message.role === "user";
  const generationLabel = !isUser ? getGenerationLabel(message.status) : null;
  const hasText = message.parts.some((part) => part.type === "text" && part.text.length > 0);
  return (
    <article className={`message-row ${isUser ? "is-user" : "is-assistant"}`}>
      {isUser ? <UserAvatar className="message-avatar message-user-avatar" username={user.username} src={user.avatarUrl} /> : <div className="message-avatar message-ai-avatar"><Bot size={18} /></div>}
      <div className={`message-body ${isUser ? "is-user-body" : "is-assistant-body"}`}>
        {!isUser && message.model ? <div className="message-model">{message.model}</div> : null}
        <div className={`message-bubble ${isUser ? "user-message-bubble" : "assistant-message-bubble"}`}>
          {!isUser && generationLabel && (!hasText || message.status !== "complete") ? <div className={`message-status ${message.status === "error" ? "is-error" : ""}`} aria-live="polite"><span className="message-status-dot" aria-hidden="true" />{generationLabel}</div> : null}
          {message.parts.map((part, index) => part.type === "text"
            ? part.text ? <Markdown key={`${message.id}-text-${index}`}>{part.text}</Markdown> : null
            : <img className="mt-2 max-h-80 max-w-full rounded-md border border-[var(--border)] object-contain" src={`/api/attachments/${part.attachmentId}`} alt="发送的图片" key={part.attachmentId} />)}
        </div>
      </div>
    </article>
  );
}
