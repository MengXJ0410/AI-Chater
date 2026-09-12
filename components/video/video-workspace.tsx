"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Paperclip, SendHorizontal, Square, X } from "lucide-react";
import type { VideoGeneration, VideoMode } from "@/client/video/generation-client";
import { videoErrorMessage } from "@/client/video/generation-client";
import { createVideoGeneration, cancelVideoGeneration, getVideoGeneration } from "@/client/api/video";
import { uploadImage } from "@/client/api/uploads";

type Ref = { id: string; originalName: string };

export function VideoWorkspace({ conversationId, ensureConversation, onOpenConfig }: { conversationId: string | null; ensureConversation: () => Promise<string>; onOpenConfig: () => void }) {
  const [mode, setMode] = useState<VideoMode>("text-to-video");
  const [prompt, setPrompt] = useState("");
  const [refs, setRefs] = useState<Ref[]>([]);
  const [generation, setGeneration] = useState<VideoGeneration | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);
  const busy = Boolean(generation && ["queued", "running", "cancel_requested"].includes(generation.status));

  useEffect(() => () => { if (pollRef.current) window.clearTimeout(pollRef.current); }, []);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const attachment = await uploadImage(file);
      setRefs([{ id: attachment.id, originalName: attachment.originalName }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "上传失败。");
    } finally {
      setUploading(false);
    }
  }

  async function poll(id: string) {
    const next = await getVideoGeneration(id);
    setGeneration(next);
    if (["queued", "running", "cancel_requested"].includes(next.status)) {
      pollRef.current = window.setTimeout(() => void poll(id), 1000);
    }
  }

  async function generate() {
    if (!prompt.trim() || busy || (mode === "image-to-video" && refs.length !== 1)) return;
    setError("");
    try {
      const id = conversationId ?? await ensureConversation();
      const next = await createVideoGeneration({ requestId: crypto.randomUUID(), conversationId: id, videoPresetId: "wan-local", mode, prompt: prompt.trim(), referenceAttachmentIds: refs.map((r) => r.id), width: 576, height: 320, frames: 49, fps: 8, steps: 20, source: "video-mode" });
      setGeneration(next);
      void poll(next.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交失败。");
    }
  }

  async function stop() {
    if (!generation) return;
    await cancelVideoGeneration(generation.id).catch(() => undefined);
    await poll(generation.id);
  }

  const attachment = generation?.attachments?.[0];
  return (
    <div className="image-workspace">
      <div className="image-workspace-header">
        <div>
          <span className="chat-tool-eyebrow">VIDEO MODE</span>
          <h2>本地 Wan 视频生成</h2>
        </div>
        <button className="chat-secondary-button" type="button" onClick={onOpenConfig}>视频配置</button>
      </div>
      <div className="image-workspace-grid">
        <section className="image-composer-panel">
          <div className="chat-config-tabs" role="tablist">
            <button type="button" className={mode === "text-to-video" ? "is-active" : ""} onClick={() => { setMode("text-to-video"); setRefs([]); }}>文生视频</button>
            <button type="button" className={mode === "image-to-video" ? "is-active" : ""} onClick={() => setMode("image-to-video")}>图生视频</button>
            <button type="button" className={mode === "text-image-to-video" ? "is-active" : ""} onClick={() => setMode("text-image-to-video")}>图文结合</button>
          </div>
          <label className="image-field image-prompt-field">
            <span>提示词</span>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={7} maxLength={4000} disabled={busy} placeholder="描述动作、镜头和风格…" />
          </label>
          <div className="image-field-grid">
            <label className="image-field">
              <span>分辨率</span>
              <select disabled>
                <option>576 × 320</option>
              </select>
            </label>
            <label className="image-field">
              <span>帧数</span>
              <input type="number" value={49} readOnly />
            </label>
          </div>
          <div className="image-reference">
            <div>
              <span>参考图片</span>
              <small>{mode === "text-to-video" ? "文生视频不需要参考图" : "图生视频需要 1 张"}</small>
            </div>
            <input ref={inputRef} className="chat-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} disabled={busy || uploading || mode === "text-to-video"} />
            <button className="chat-icon-button" type="button" onClick={() => inputRef.current?.click()} disabled={busy || uploading || mode === "text-to-video"}>
              <Paperclip size={17} />
            </button>
          </div>
          {refs.length ? (
            <div className="image-reference-list">
              {refs.map((r) => (
                <span className="attachment-chip" key={r.id}>
                  {r.originalName}
                  <button className="chat-icon-button" type="button" onClick={() => setRefs([])}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {error ? <p className="composer-error">{error}</p> : null}
          <button className="chat-primary-button image-generate-button" type="button" onClick={busy ? stop : generate} disabled={!busy && (!prompt.trim() || uploading || (mode === "image-to-video" && refs.length !== 1))}>
            {busy ? <>
              <Square size={15} fill="currentColor" />停止生成
            </> : <>
              <SendHorizontal size={16} />生成视频
            </>}
          </button>
        </section>
        <section className="image-results-panel">
          <div className="image-results-heading">
            <span>生成结果</span>
            {generation ? <small>{generation.status}</small> : null}
          </div>
          {generation?.status === "completed" && attachment ? (
            <div className="video-result-card">
              <video controls src={attachment.url} />
              <a className="chat-secondary-button" href={attachment.url} download>
                <Download size={15} />下载视频
              </a>
            </div>
          ) : generation?.status === "failed" ? (
            <div className="image-result-empty image-result-error">
              <strong>生成失败</strong>
              <p>{videoErrorMessage(generation.errorCode)}</p>
            </div>
          ) : (
            <div className="image-result-empty">
              <LoaderCircle size={28} />
              <strong>{busy ? "正在生成视频…" : "等待生成结果"}</strong>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
