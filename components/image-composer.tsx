"use client";

import { ChangeEvent, useRef } from "react";
import { LoaderCircle, Paperclip, SendHorizontal, Square, X } from "lucide-react";
import type { ImageCapabilities, ImageGenerationDraft, ImagePreset } from "@/lib/image-generation-client";

type ReferenceImage = { id: string; originalName: string };

export function ImageComposer({ presets, presetId, draft, references, isGenerating, isUploading, onPresetChange, onDraftChange, onUpload, onRemove, onGenerate, onStop, onOpenConfig }: {
  presets: ImagePreset[]; presetId: string; draft: ImageGenerationDraft; references: ReferenceImage[]; isGenerating: boolean; isUploading: boolean;
  onPresetChange: (id: string) => void; onDraftChange: (draft: ImageGenerationDraft) => void; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onRemove: (id: string) => void;
  onGenerate: () => void; onStop: () => void; onOpenConfig: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const preset = presets.find((item) => item.id === presetId);
  const capabilities: ImageCapabilities = preset?.capabilities ?? { aspectRatios: [], resolutions: [], qualities: [], maxImages: 1, supportsImageEdit: false };
  const update = (next: Partial<ImageGenerationDraft>) => onDraftChange({ ...draft, ...next });
  const noPresets = !presets.length;
  return <section className="image-composer-panel" aria-label="生图参数">
    <div className="image-panel-heading"><span className="chat-tool-eyebrow">IMAGE WORKSPACE</span><h2>生成一张图片</h2></div>
    {noPresets ? <div className="image-service-notice"><strong>尚未配置生图模型</strong><p>请先配置支持图片生成的模型，不能使用普通聊天模型代替。</p><button className="chat-secondary-button" type="button" onClick={onOpenConfig}>打开配置</button></div> : null}
    <label className="image-field image-prompt-field"><span>提示词</span><textarea value={draft.prompt} maxLength={4000} onChange={(event) => update({ prompt: event.target.value })} placeholder="描述你想生成的画面、风格和细节…" disabled={isGenerating || noPresets} rows={7} /><small>{draft.prompt.length}/4000</small></label>
    <label className="image-field"><span>生图模型</span><select value={presetId} onChange={(event) => onPresetChange(event.target.value)} disabled={isGenerating || noPresets}>{presets.map((item) => <option value={item.id} key={item.id}>{item.label} · {item.model}</option>)}</select></label>
    <div className="image-field-grid">
      <label className="image-field"><span>比例</span><select value={draft.aspectRatio} onChange={(event) => update({ aspectRatio: event.target.value })} disabled={isGenerating || !capabilities.aspectRatios.length}>{capabilities.aspectRatios.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      <label className="image-field"><span>清晰度</span><select value={draft.resolution} onChange={(event) => update({ resolution: event.target.value })} disabled={isGenerating || !capabilities.resolutions.length}>{capabilities.resolutions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
    </div>
    <div className="image-field-grid">
      <label className="image-field"><span>质量</span><select value={draft.quality} onChange={(event) => update({ quality: event.target.value })} disabled={isGenerating || !capabilities.qualities.length}>{capabilities.qualities.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      <label className="image-field"><span>数量 <output>{draft.count} 张</output></span><input type="range" min="1" max={capabilities.maxImages} step="1" value={draft.count} onChange={(event) => update({ count: Number(event.target.value) })} disabled={isGenerating || noPresets} /></label>
    </div>
    <div className={`image-reference ${capabilities.supportsImageEdit ? "" : "is-disabled"}`}><div><span>参考图</span><small>{capabilities.supportsImageEdit ? "可选，最多 4 张" : "当前模型不支持参考图"}</small></div><input ref={inputRef} className="chat-file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onUpload} disabled={!capabilities.supportsImageEdit || isUploading || isGenerating} /><button className="chat-icon-button" data-tooltip="上传参考图" type="button" aria-label="上传参考图" onClick={() => inputRef.current?.click()} disabled={!capabilities.supportsImageEdit || isUploading || isGenerating}><Paperclip size={17} /></button></div>
    {references.length ? <div className="image-reference-list">{references.map((item) => <span className="attachment-chip" key={item.id}>{item.originalName}<button className="chat-icon-button" type="button" aria-label={`移除 ${item.originalName}`} onClick={() => onRemove(item.id)}><X size={12} /></button></span>)}</div> : null}
    <button className="chat-primary-button image-generate-button" type="button" onClick={isGenerating ? onStop : onGenerate} disabled={!isGenerating && (noPresets || !draft.prompt.trim() || isUploading)}>{isGenerating ? <><Square size={15} fill="currentColor" />停止生成</> : isUploading ? <><LoaderCircle size={16} className="image-loading-spinner" aria-hidden="true" />上传中…</> : <><SendHorizontal size={16} />生成图片</>}</button>
  </section>;
}
