"use client";
/* eslint-disable @next/next/no-img-element */

import { Download, Eye, ImageIcon, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import type { GeneratedImage } from "@/lib/image-generation-client";

export function GeneratedImageGrid({ images, isGenerating, error, onRetry }: { images: GeneratedImage[]; isGenerating: boolean; error: string; onRetry: () => void }) {
  const [preview, setPreview] = useState<GeneratedImage | null>(null);
  if (isGenerating) return <div className="image-result-grid" aria-live="polite">{[0, 1].map((item) => <div className="image-result-skeleton" key={item}><LoaderCircle size={22} className="image-loading-spinner" aria-hidden="true" /><span>正在生成图片…</span></div>)}</div>;
  if (error) return <div className="image-result-empty image-result-error"><ImageIcon size={26} /><strong>生成失败</strong><p>{error}</p><button className="chat-secondary-button" type="button" onClick={onRetry}><RefreshCw size={15} />重试</button></div>;
  if (!images.length) return <div className="image-result-empty"><ImageIcon size={28} /><strong>等待生成结果</strong><p>输入描述后，生成的图片会显示在这里。</p></div>;
  return <>
    <div className="image-result-grid">{images.map((image) => <figure className="image-result-card" key={image.attachmentId}><img src={image.url} alt="生成结果" /><figcaption><span>{image.width && image.height ? `${image.width} × ${image.height}` : image.mimeType}</span><span className="image-result-actions"><button className="chat-icon-button" data-tooltip="预览" type="button" aria-label="预览图片" onClick={() => setPreview(image)}><Eye size={15} /></button><a className="chat-icon-button" data-tooltip="下载" aria-label="下载图片" href={image.url} download><Download size={15} /></a></span></figcaption></figure>)}</div>
    {preview ? <div className="image-preview-backdrop" role="presentation" onClick={() => setPreview(null)}><section className="image-preview-dialog" role="dialog" aria-modal="true" aria-label="图片预览" onClick={(event) => event.stopPropagation()}><button className="chat-icon-button" type="button" aria-label="关闭预览" title="关闭预览" onClick={() => setPreview(null)}><X size={18} /></button><img src={preview.url} alt="生成结果预览" /></section></div> : null}
  </>;
}
