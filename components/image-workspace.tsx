"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { ImageComposer } from "@/components/image-composer";
import { GeneratedImageGrid } from "@/components/generated-image-grid";
import { getImageGenerationFailureMessage, imagesFromGeneration, normalizeImagePreset, type GeneratedImage, type ImageGenerationDraft, type ImagePreset } from "@/client/image/generation-client";
import { getImagePresets } from "@/client/api/presets";
import { removeUpload, uploadImage } from "@/client/api/uploads";
import { cancelImageGeneration, createImageGeneration, getImageGeneration } from "@/client/api/image";

type ReferenceImage = { id: string; originalName: string };

const MAX_QUEUED_WAIT_MS = 60_000;

export function ImageWorkspace({ configRevision, preferredPresetId, onPreferredPresetChange, conversationId, ensureConversation, onOpenConfig }: { configRevision: number; preferredPresetId: string; onPreferredPresetChange: (id: string) => void; conversationId: string | null; ensureConversation: () => Promise<string>; onOpenConfig: () => void }) {
  const [presets, setPresets] = useState<ImagePreset[]>([]);
  const [presetId, setPresetId] = useState("");
  const [draft, setDraft] = useState<ImageGenerationDraft>({ prompt: "", aspectRatio: "", resolution: "", quality: "", count: 1, referenceAttachmentIds: [] });
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const generationIdRef = useRef<string | null>(null);

  const selectDefaults = useCallback((items: ImagePreset[], preferred?: string) => {
    const next = items.find((item) => item.id === preferred) ?? items[0];
    if (!next) {
      setPresetId("");
      setDraft((current) => ({ ...current, aspectRatio: "", resolution: "", quality: "", count: 1 }));
      return;
    }
    setPresetId(next.id);
    const capabilities = next.capabilities;
    setDraft((current) => ({ ...current, aspectRatio: capabilities.aspectRatios[0] ?? "", resolution: capabilities.resolutions[0] ?? "", quality: capabilities.qualities[0] ?? "", count: Math.min(current.count, capabilities.maxImages) }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoadingPresets(true);
      setError("");
      try {
        const rawPresets = await getImagePresets();
        if (cancelled) return;
        const normalized = rawPresets.map(normalizeImagePreset).filter((item): item is ImagePreset => Boolean(item));
        setPresets(normalized);
        selectDefaults(normalized, preferredPresetId);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "生图模型加载失败。请等待后端接口接入。");
      } finally {
        if (!cancelled) setIsLoadingPresets(false);
      }
    }
    void load();
    return () => { cancelled = true; abortRef.current?.abort(); };
  }, [configRevision, preferredPresetId, selectDefaults]);

  const selectedPreset = presets.find((item) => item.id === presetId);
  function changePreset(id: string) { setPresetId(id); onPreferredPresetChange(id); selectDefaults(presets, id); }

  async function uploadReference(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, Math.max(0, 4 - references.length));
    event.target.value = "";
    if (!files.length) return;
    setIsUploading(true); setError("");
    try {
      const uploaded = await Promise.all(files.map((file) => uploadImage(file)));
      setReferences((current) => [...current, ...uploaded]);
      setDraft((current) => ({ ...current, referenceAttachmentIds: [...current.referenceAttachmentIds, ...uploaded.map((item) => item.id)] }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "参考图上传失败。"); } finally { setIsUploading(false); }
  }

  async function removeReference(id: string) {
    try { await removeUpload(id); } catch { /* The local reference can still be removed when cleanup is unavailable. */ }
    setReferences((current) => current.filter((item) => item.id !== id));
    setDraft((current) => ({ ...current, referenceAttachmentIds: current.referenceAttachmentIds.filter((item) => item !== id) }));
  }

  async function generate() {
    if (!selectedPreset || !draft.prompt.trim() || isGenerating) return;
    setIsGenerating(true); setError(""); setImages([]);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const targetConversationId = conversationId ?? await ensureConversation();
      let generation = await createImageGeneration({ requestId: crypto.randomUUID(), conversationId: targetConversationId, imagePresetId: selectedPreset.id, prompt: draft.prompt.trim(), referenceAttachmentIds: draft.referenceAttachmentIds, aspectRatio: draft.aspectRatio, resolution: draft.resolution || "1k", quality: draft.quality || "high", source: "image-mode" }, controller.signal);
      generationIdRef.current = generation.id;
      const queuedAt = Date.now();
      while (["queued", "running", "cancel_requested"].includes(generation.status)) {
        if (generation.status === "queued" && Date.now() - queuedAt >= MAX_QUEUED_WAIT_MS) {
          throw new Error("任务排队时间较长，请确认后端 image worker 已启动。未重复提交请求。");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        generation = await getImageGeneration(generation.id, controller.signal);
      }
      if (generation.status === "failed") throw new Error(getImageGenerationFailureMessage(generation.errorCode));
      if (generation.status === "cancelled") return;
      setImages(imagesFromGeneration(generation));
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "生图失败，请稍后重试。");
    } finally { abortRef.current = null; generationIdRef.current = null; setIsGenerating(false); }
  }

  async function stopGeneration() {
    const id = generationIdRef.current;
    if (id) await cancelImageGeneration(id).catch(() => undefined);
    abortRef.current?.abort();
  }

  return <div className="image-workspace"><div className="image-workspace-header"><div><span className="chat-tool-eyebrow">IMAGE MODE</span><h2>生图工作区</h2></div>{isLoadingPresets ? <span className="image-loading-label"><LoaderCircle size={14} className="image-loading-spinner" aria-hidden="true" />加载模型</span> : null}</div><div className="image-workspace-grid"><ImageComposer presets={presets} presetId={presetId} draft={draft} references={references} isGenerating={isGenerating} isUploading={isUploading} onPresetChange={changePreset} onDraftChange={setDraft} onUpload={uploadReference} onRemove={removeReference} onGenerate={generate} onStop={() => void stopGeneration()} onOpenConfig={onOpenConfig} /><section className="image-results-panel" aria-label="生图结果"><div className="image-results-heading"><span>生成结果</span>{images.length ? <small>{images.length} 张</small> : null}</div><GeneratedImageGrid images={images} isGenerating={isGenerating} error={error} onRetry={generate} /></section></div></div>;
}
