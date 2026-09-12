import { randomUUID } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import sharp, { type Metadata } from "sharp";
import { uploadPath } from "@/server/services/uploads";
import { RequestError } from "@/server/http/errors";

export const AVATAR_WIDTH = 512;
export const AVATAR_HEIGHT = 512;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const MIME_BY_FORMAT = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

function assertAvatarMetadata(format: string | undefined, width: number | undefined, height: number | undefined, declaredType: string) {
  if (!(format && format in MIME_BY_FORMAT)) throw new RequestError("头像只支持 JPEG、PNG 或 WebP 图片。");
  const expectedType = MIME_BY_FORMAT[format as keyof typeof MIME_BY_FORMAT];
  if (declaredType && declaredType !== expectedType) throw new RequestError("头像文件类型与内容不匹配。");
  if (width !== AVATAR_WIDTH || height !== AVATAR_HEIGHT) throw new RequestError("头像必须是 512×512 图片。");
  return expectedType;
}

export async function normalizeAvatar(file: File) {
  if (file.size === 0) throw new RequestError("头像图片不能为空。");
  if (file.size > AVATAR_MAX_BYTES) throw new RequestError("头像图片不能超过 2 MB。");

  const input = Buffer.from(await file.arrayBuffer());
  let metadata: Metadata;
  try {
    metadata = await sharp(input).metadata();
  } catch {
    throw new RequestError("头像图片格式无效。");
  }
  const mimeType = assertAvatarMetadata(metadata.format, metadata.width, metadata.height, file.type);

  try {
    const normalized = await sharp(input).webp({ quality: 90 }).toBuffer();
    return { buffer: normalized, mimeType: "image/webp" as const, sourceMimeType: mimeType };
  } catch {
    throw new RequestError("头像图片无法处理。");
  }
}

export async function saveAvatar(buffer: Buffer) {
  const storageKey = `avatar_${randomUUID()}.webp`;
  const destination = uploadPath(storageKey);
  await mkdir(/* turbopackIgnore: true */ path.dirname(destination), { recursive: true });
  await writeFile(destination, buffer, { flag: "wx" });
  return storageKey;
}

export async function readAvatar(storageKey: string) {
  return readFile(uploadPath(storageKey));
}

export async function removeAvatar(storageKey: string | null | undefined) {
  if (!storageKey) return;
  await rm(uploadPath(storageKey), { force: true });
}

export function avatarUrl(updatedAt: Date | string | null | undefined) {
  return updatedAt ? `/api/me/avatar?v=${encodeURIComponent(new Date(updatedAt).toISOString())}` : null;
}
