"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { ImagePlus, Palette, RotateCcw, Trash2 } from "lucide-react";
import {
  ACCENT_SWATCHES,
  APPEARANCE_CHANGE_EVENT,
  APPEARANCE_STORAGE_KEY,
  deriveAccentTheme,
  defaultAppearance,
  parseAppearance,
  type AppearancePreferences,
} from "@/lib/appearance";

const maxSourceBytes = 15 * 1024 * 1024;
const maxStoredBytes = 2.5 * 1024 * 1024;
const maxImageDimension = 1920;

function applyAppearance(appearance: AppearancePreferences) {
  const root = document.documentElement;
  const theme = deriveAccentTheme(appearance.accent);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-strong", theme.strong);
  root.style.setProperty("--accent-soft", theme.soft);
  root.style.setProperty("--accent-muted", theme.muted);
  root.style.setProperty("--accent-border", theme.border);
  root.style.setProperty("--accent-action", theme.action);
  root.style.setProperty("--accent-action-alt", theme.actionAlt);
  root.style.setProperty("--accent-action-text", theme.actionText);
  root.style.setProperty("--appearance-background", appearance.background ? `url(${appearance.background})` : "none");
  root.style.setProperty("--appearance-surface-opacity", String(appearance.surfaceOpacity / 100));
  root.style.setProperty("--appearance-background-blur", `${appearance.backgroundBlur}px`);
  root.dataset.hasBackground = appearance.background ? "true" : "false";
  window.dispatchEvent(new CustomEvent(APPEARANCE_CHANGE_EVENT, {
    detail: { accent: theme.accent, bubbleColorRange: appearance.bubbleColorRange, bubbleActivity: appearance.bubbleActivity },
  }));
}

function persistAppearance(appearance: AppearancePreferences) {
  window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取该图片。"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("无法解析该图片。"));
    image.onload = () => resolve(image);
    image.src = source;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片转换失败。")), "image/webp", quality);
  });
}

async function compressBackground(file: File) {
  if (!/image\/(jpeg|png|webp|gif)/.test(file.type)) throw new Error("仅支持 JPEG、PNG、WebP 或 GIF 图片。");
  if (file.size > maxSourceBytes) throw new Error("原始图片不能超过 15 MB。" );

  const image = await loadImage(await readFileAsDataUrl(file));
  const scale = Math.min(1, maxImageDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.86, 0.72, 0.58]) {
    const blob = await canvasToBlob(canvas, quality);
    if (blob.size <= maxStoredBytes) return readFileAsDataUrl(new File([blob], "background.webp", { type: "image/webp" }));
  }
  throw new Error("图片压缩后仍超过浏览器可保存的大小限制。" );
}

export function AppearanceControl() {
  const [appearance, setAppearance] = useState<AppearancePreferences>(defaultAppearance);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentAppearance = { ...defaultAppearance, ...appearance };

  useEffect(() => {
    void Promise.resolve().then(() => {
      const saved = parseAppearance(window.localStorage.getItem(APPEARANCE_STORAGE_KEY));
      applyAppearance(saved);
      setAppearance(saved);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function updateAppearance(next: AppearancePreferences) {
    const normalized = { ...defaultAppearance, ...next };
    applyAppearance(normalized);
    setAppearance(normalized);
    try {
      persistAppearance(normalized);
      setError("");
    } catch {
      setError("浏览器空间不足，外观无法保存。" );
    }
  }

  function selectAccent(accent: string) {
    updateAppearance({ ...currentAppearance, accent });
  }

  async function handleBackgroundUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      updateAppearance({ ...currentAppearance, background: await compressBackground(file) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "图片上传失败。" );
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="appearance-backdrop" aria-hidden="true" />
      <div className="appearance-control" ref={rootRef}>
        {open ? (
          <section className="appearance-panel" aria-label="自定义外观">
          <div className="appearance-panel-header">
            <span>主题色</span>
            <button className="appearance-icon-button" data-tooltip="恢复默认" type="button" aria-label="恢复默认外观" onClick={() => updateAppearance(defaultAppearance)}><RotateCcw size={16} /></button>
          </div>
          <div className="appearance-swatches" role="group" aria-label="主题色选择">
            {ACCENT_SWATCHES.map((accent) => <button className={`appearance-swatch ${currentAppearance.accent.toLowerCase() === accent ? "is-selected" : ""}`} style={{ backgroundColor: accent }} type="button" aria-label={`选择主题色 ${accent}`} aria-pressed={currentAppearance.accent.toLowerCase() === accent} key={accent} onClick={() => selectAccent(accent)} />)}
            <label className="appearance-custom-color" data-tooltip="自定义颜色">
              <Palette size={16} />
              <input type="color" value={currentAppearance.accent} aria-label="自定义主题色" onChange={(event) => selectAccent(event.target.value)} />
            </label>
          </div>
          <label className="appearance-slider appearance-color-range">
            <span>气泡色差 <output>±{currentAppearance.bubbleColorRange}</output></span>
            <input type="range" min="0" max="100" step="5" value={currentAppearance.bubbleColorRange} onChange={(event) => updateAppearance({ ...currentAppearance, bubbleColorRange: Number(event.target.value) })} />
          </label>
          <label className="appearance-slider appearance-bubble-activity">
            <span>气泡活跃度 <output>{currentAppearance.bubbleActivity}%</output></span>
            <input type="range" min="0" max="200" step="5" value={currentAppearance.bubbleActivity} onChange={(event) => updateAppearance({ ...currentAppearance, bubbleActivity: Number(event.target.value) })} />
          </label>
          <div className="appearance-divider" />
          <div className="appearance-panel-header">
            <span>背景图</span>
            <div className="appearance-actions">
              <button className="appearance-icon-button" data-tooltip="上传背景" type="button" aria-label="上传背景图" disabled={uploading} onClick={() => fileInputRef.current?.click()}><ImagePlus size={16} /></button>
              <button className="appearance-icon-button" data-tooltip="移除背景" type="button" aria-label="移除背景图" disabled={!currentAppearance.background} onClick={() => updateAppearance({ ...currentAppearance, background: null })}><Trash2 size={16} /></button>
            </div>
          </div>
          <input className="appearance-file-input" ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleBackgroundUpload} />
          <div className={`appearance-preview ${currentAppearance.background ? "has-background" : ""}`} style={currentAppearance.background ? { backgroundImage: `url(${currentAppearance.background})` } : undefined}>
            {uploading ? "正在处理图片..." : currentAppearance.background ? "" : "尚未设置背景"}
          </div>
          <div className="appearance-sliders">
            <label className="appearance-slider">
              <span>背景透明度 <output>{currentAppearance.surfaceOpacity}%</output></span>
              <input type="range" min="20" max="100" value={currentAppearance.surfaceOpacity} onChange={(event) => updateAppearance({ ...currentAppearance, surfaceOpacity: Number(event.target.value) })} />
            </label>
            <label className="appearance-slider">
              <span>背景模糊度 <output>{currentAppearance.backgroundBlur}px</output></span>
              <input type="range" min="0" max="24" value={currentAppearance.backgroundBlur} onChange={(event) => updateAppearance({ ...currentAppearance, backgroundBlur: Number(event.target.value) })} />
            </label>
          </div>
          {error ? <p className="appearance-error" role="alert">{error}</p> : null}
          </section>
        ) : null}
        <button className="appearance-trigger" data-tooltip="自定义外观" type="button" aria-label="自定义外观" aria-expanded={open} onClick={() => setOpen((current) => !current)}>😋</button>
      </div>
    </>
  );
}
