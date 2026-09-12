import { randomUUID } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { and, eq, isNull } from "drizzle-orm";
import sharp from "sharp";
import { getMaxUploadBytes, getUploadDirectory } from "@/server/config";
import { getDb } from "@/server/db";
import { attachments } from "@/server/db/schema";
import { RequestError } from "@/server/http/errors";

const supportedTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function validateImage(file: File) {
  const extension = supportedTypes[file.type];
  if (!extension) throw new RequestError("仅支持 PNG、JPEG、WebP 或 GIF 图片。");
  if (file.size === 0) throw new RequestError("图片不能为空。");
  if (file.size > getMaxUploadBytes()) throw new RequestError("图片超过大小限制。");
  return extension;
}

export function uploadPath(storageKey: string) {
  if (path.basename(storageKey) !== storageKey) throw new Error("Invalid storage key.");
  // The upload directory is intentionally configured at runtime through .env.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), getUploadDirectory(), storageKey);
}

export async function saveImage(file: File) {
  const extension = validateImage(file);
  const storageKey = `${randomUUID()}.${extension}`;
  const destination = uploadPath(storageKey);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await file.arrayBuffer()));
  return storageKey;
}

export async function saveGeneratedPng(input: Uint8Array) {
  if (!input.length || input.byteLength > 20 * 1024 * 1024) throw new RequestError("生成图片超过大小限制。", 502);
  let output: Buffer;
  try {
    const image = sharp(input, { limitInputPixels: 4096 * 4096 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096) {
      throw new RequestError("生成图片尺寸无效。", 502);
    }
    output = await image.png({ compressionLevel: 9 }).toBuffer();
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("Provider 返回的图片格式无效。", 502);
  }
  if (output.byteLength > 20 * 1024 * 1024) throw new RequestError("生成图片超过大小限制。", 502);
  const storageKey = `${randomUUID()}.png`;
  const destination = uploadPath(storageKey);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, output);
  const metadata = await sharp(output).metadata();
  return { storageKey, mimeType: "image/png" as const, size: output.byteLength, width: metadata.width!, height: metadata.height! };
}

export async function readImage(storageKey: string) {
  return readFile(uploadPath(storageKey));
}

export async function saveGeneratedVideo(input: Uint8Array, mediaType = "video/mp4") {
  const max = Number(process.env.VIDEO_MAX_OUTPUT_BYTES ?? 209715200);
  if (!input.length || input.byteLength > max) throw new RequestError("生成视频超过大小限制。", 502);
  const extension = mediaType.includes("webm") ? "webm" : "mp4";
  const storageKey = `${randomUUID()}.${extension}`;
  const destination = uploadPath(storageKey);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(input));
  return { storageKey, mimeType: mediaType, size: input.byteLength };
}

export const readMedia = readImage;

export async function removeImages(storageKeys: string[]) {
  await Promise.all(storageKeys.map(async (storageKey) => {
    await rm(uploadPath(storageKey), { force: true });
  }));
}

export async function createUploadedAttachment(userId: string, file: File) {
  validateImage(file);
  const storageKey = await saveImage(file);
  try {
    const attachment = {
      id: randomUUID(),
      userId,
      storageKey,
      mimeType: file.type,
      size: file.size,
      originalName: file.name.slice(0, 255) || "image",
    };
    await getDb().insert(attachments).values(attachment);
    return { id: attachment.id, mimeType: attachment.mimeType, originalName: attachment.originalName };
  } catch (error) {
    await removeImages([storageKey]).catch(() => undefined);
    throw error;
  }
}

export async function deleteUnsentAttachment(userId: string, id: string) {
  const rows = await getDb().select().from(attachments).where(and(
    eq(attachments.id, id),
    eq(attachments.userId, userId),
    isNull(attachments.messageId),
  )).limit(1);
  if (!rows[0]) throw new RequestError("图片不存在或已发送。", 404);
  await getDb().delete(attachments).where(eq(attachments.id, id));
  await removeImages([rows[0].storageKey]);
}

export async function getUserAttachment(userId: string, id: string) {
  const rows = await getDb().select().from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, userId))).limit(1);
  if (!rows[0]) throw new RequestError("图片不存在。", 404);
  return rows[0];
}
