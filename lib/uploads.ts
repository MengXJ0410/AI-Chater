import { randomUUID } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { getMaxUploadBytes, getUploadDirectory } from "@/lib/config";

const supportedTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function validateImage(file: File) {
  const extension = supportedTypes[file.type];
  if (!extension) throw new Error("仅支持 PNG、JPEG、WebP 或 GIF 图片。");
  if (file.size === 0) throw new Error("图片不能为空。");
  if (file.size > getMaxUploadBytes()) throw new Error("图片超过大小限制。");
  return extension;
}

function uploadPath(storageKey: string) {
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

export async function readImage(storageKey: string) {
  return readFile(uploadPath(storageKey));
}

export async function removeImages(storageKeys: string[]) {
  await Promise.all(storageKeys.map(async (storageKey) => {
    await rm(uploadPath(storageKey), { force: true });
  }));
}
