"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { ChangeEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Crop, ImagePlus, LoaderCircle, Trash2, Upload, X } from "lucide-react";
import { clampAvatarCropPosition, getAvatarCropScale, type AvatarCropPosition } from "@/client/avatar-crop";
import { getAvatarFileError } from "@/client/user-avatar";
import { ApiRequestError } from "@/client/api/http";
import { getProfile, removeAvatar as removeAvatarRequest, uploadAvatar } from "@/client/api/profile";
import { UserAvatar } from "@/components/user-avatar";

type ProfileUser = { id: string; username: string; avatarUrl?: string | null };
type ProfilePayload = { user: ProfileUser; avatarServiceAvailable: boolean };
type CropSource = { file: File; url: string; width: number; height: number; zoom: number; position: AvatarCropPosition };

const PREVIEW_SIZE = 280;
const OUTPUT_SIZE = 512;

export function ProfileClient({ initialUser }: { initialUser: ProfileUser }) {
  const [profile, setProfile] = useState<ProfilePayload>({ user: initialUser, avatarServiceAvailable: false });
  const [serviceState, setServiceState] = useState<"checking" | "available" | "unavailable">("checking");
  const [crop, setCrop] = useState<CropSource | null>(null);
  const [frameSize, setFrameSize] = useState(PREVIEW_SIZE);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; position: AvatarCropPosition } | null>(null);
  const cropUrl = crop?.url;

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const payload = await getProfile();
        if (!cancelled) {
          setProfile(payload);
          setServiceState(payload.avatarServiceAvailable ? "available" : "unavailable");
        }
      } catch (cause) {
        if (cancelled) return;
        if (cause instanceof ApiRequestError && cause.status === 404) {
          setServiceState("unavailable");
          return;
        }
        setError(cause instanceof Error ? cause.message : "无法读取个人资料。");
        setServiceState("unavailable");
      }
    }
    void loadProfile();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!cropUrl || !cropFrameRef.current) return;
    const frame = cropFrameRef.current;
    const updateSize = () => setFrameSize(Math.max(1, Math.round(frame.clientWidth)));
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [cropUrl]);

  function closeCrop() {
    if (crop) URL.revokeObjectURL(crop.url);
    dragRef.current = null;
    setCrop(null);
  }

  function clampPosition(position: AvatarCropPosition, source = crop) {
    if (!source) return position;
    return clampAvatarCropPosition(position, source.width, source.height, frameSize, source.zoom);
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const fileError = getAvatarFileError(file);
    if (fileError) {
      setError(fileError);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const next: CropSource = { file, url, width: image.naturalWidth, height: image.naturalHeight, zoom: 1, position: { x: 0, y: 0 } };
      next.position = clampAvatarCropPosition(next.position, next.width, next.height, PREVIEW_SIZE, next.zoom);
      setError("");
      setCrop(next);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError("无法读取这张图片，请选择其他文件。");
    };
    image.src = url;
  }

  function updateZoom(zoom: number) {
    setCrop((current) => current ? { ...current, zoom, position: clampAvatarCropPosition(current.position, current.width, current.height, frameSize, zoom) } : current);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!crop) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, position: crop.position };
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!crop || !dragRef.current) return;
    const next = clampPosition({ x: dragRef.current.position.x + event.clientX - dragRef.current.startX, y: dragRef.current.position.y + event.clientY - dragRef.current.startY });
    setCrop((current) => current ? { ...current, position: next } : current);
  }

  function stopDrag() {
    dragRef.current = null;
  }

  async function saveCrop() {
    if (!crop || serviceState !== "available") return;
    setIsSaving(true);
    setError("");
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("无法处理这张图片。")); image.src = crop.url; });
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("当前浏览器不支持头像裁切。");
      const position = clampAvatarCropPosition(crop.position, crop.width, crop.height, frameSize, crop.zoom);
      const scale = getAvatarCropScale(crop.width, crop.height, frameSize, crop.zoom) * OUTPUT_SIZE / frameSize;
      const scaledWidth = crop.width * scale;
      const scaledHeight = crop.height * scale;
      const baseX = (OUTPUT_SIZE - scaledWidth) / 2;
      const baseY = (OUTPUT_SIZE - scaledHeight) / 2;
      context.drawImage(image, baseX + position.x * OUTPUT_SIZE / frameSize, baseY + position.y * OUTPUT_SIZE / frameSize, scaledWidth, scaledHeight);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
      if (!blob) throw new Error("头像导出失败，请重试。");
      const { avatarUrl } = await uploadAvatar(new File([blob], "avatar.webp", { type: "image/webp" }));
      setProfile((current) => ({ ...current, user: { ...current.user, avatarUrl } }));
      closeCrop();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "头像上传失败。");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeAvatar() {
    if (serviceState !== "available" || !profile.user.avatarUrl || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      await removeAvatarRequest();
      setProfile((current) => ({ ...current, user: { ...current.user, avatarUrl: null } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "头像删除失败。");
    } finally {
      setIsSaving(false);
    }
  }

  const cropPosition = crop ? clampAvatarCropPosition(crop.position, crop.width, crop.height, frameSize, crop.zoom) : { x: 0, y: 0 };
  const scale = crop ? getAvatarCropScale(crop.width, crop.height, frameSize, crop.zoom) : 1;
  const imageStyle = crop ? {
    width: `${crop.width * scale}px`, height: `${crop.height * scale}px`, left: `${(frameSize - crop.width * scale) / 2 + cropPosition.x}px`, top: `${(frameSize - crop.height * scale) / 2 + cropPosition.y}px`,
  } : undefined;

  return (
    <main className="profile-page">
      <Link className="profile-home" href="/chat"><ArrowLeft size={17} />返回工作台</Link>
      <section className="profile-panel" aria-labelledby="profile-title">
        <header><span className="profile-kicker">个人资料</span><h1 id="profile-title">你的头像</h1><p>头像会显示在你的聊天消息和工作台账号区域。</p></header>
        <div className="profile-avatar-stage"><UserAvatar className="profile-avatar" username={profile.user.username} src={profile.user.avatarUrl} /><div><strong>{profile.user.username}</strong><span>账号头像</span></div></div>
        {serviceState === "unavailable" ? <p className="profile-service-notice" role="status">等待服务端头像服务接入</p> : null}
        {error ? <p className="profile-error" role="alert">{error}</p> : null}
        <div className="profile-actions"><input ref={fileInputRef} className="profile-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} disabled={serviceState !== "available" || isSaving} /><button className="chat-primary-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={serviceState !== "available" || isSaving}>{serviceState === "checking" || isSaving ? <LoaderCircle className="animate-spin" size={16} /> : <ImagePlus size={16} />}更换头像</button><button className="chat-secondary-button" type="button" onClick={() => void removeAvatar()} disabled={serviceState !== "available" || !profile.user.avatarUrl || isSaving}><Trash2 size={16} />删除头像</button></div>
      </section>
      {crop ? <div className="avatar-crop-backdrop" role="presentation"><section className="avatar-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title"><header><div><span className="profile-kicker">头像裁切</span><h2 id="avatar-crop-title">调整显示区域</h2></div><button className="chat-icon-button" type="button" aria-label="关闭裁切" title="关闭裁切" onClick={closeCrop} disabled={isSaving}><X size={18} /></button></header><div className="avatar-crop-frame" ref={cropFrameRef} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}><img src={crop.url} alt="头像裁切预览" style={imageStyle} draggable={false} /><span className="avatar-crop-grid" aria-hidden="true" /></div><label className="avatar-crop-zoom"><span><Crop size={16} />缩放</span><input type="range" min="1" max="2.5" step="0.01" value={crop.zoom} onChange={(event) => updateZoom(Number(event.target.value))} /></label><footer><button className="chat-secondary-button" type="button" onClick={closeCrop} disabled={isSaving}>取消</button><button className="chat-primary-button" type="button" onClick={() => void saveCrop()} disabled={isSaving}>{isSaving ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />}保存头像</button></footer></section></div> : null}
    </main>
  );
}
