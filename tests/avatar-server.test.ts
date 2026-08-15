import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { avatarUrl, normalizeAvatar, readAvatar, removeAvatar, saveAvatar } from "@/lib/avatar";

const originalUploadDir = process.env.UPLOAD_DIR;

afterEach(() => {
  if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = originalUploadDir;
});

async function imageFile(format: "png" | "jpeg" | "webp", width = 512, height = 512) {
  const buffer = await sharp({
    create: { width, height, channels: 4, background: { r: 40, g: 120, b: 80, alpha: 1 } },
  }).toFormat(format).toBuffer();
  return new File([buffer], `avatar.${format}`, { type: format === "jpeg" ? "image/jpeg" : `image/${format}` });
}

describe("server avatar storage", () => {
  it("validates real image content and normalizes supported avatars", async () => {
    const normalized = await normalizeAvatar(await imageFile("png"));
    expect(normalized.mimeType).toBe("image/webp");
    expect(normalized.buffer.subarray(0, 4).toString("hex")).toBe("52494646");
    await expect(normalizeAvatar(new File([Buffer.from("not-an-image")], "avatar.png", { type: "image/png" }))).rejects.toThrow("格式无效");
    await expect(normalizeAvatar(await imageFile("jpeg", 256, 256))).rejects.toThrow("512×512");
  });

  it("keeps avatar files behind random storage keys and removes them", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ai-chater-avatar-"));
    process.env.UPLOAD_DIR = directory;
    const normalized = await normalizeAvatar(await imageFile("webp"));
    const storageKey = await saveAvatar(normalized.buffer);
    expect(storageKey).toMatch(/^avatar_[0-9a-f-]{36}\.webp$/);
    await expect(readAvatar(storageKey)).resolves.toEqual(normalized.buffer);
    expect(avatarUrl(new Date("2026-08-15T14:58:00.000Z"))).toBe("/api/me/avatar?v=2026-08-15T14%3A58%3A00.000Z");
    await removeAvatar(storageKey);
    await expect(readAvatar(storageKey)).rejects.toMatchObject({ code: "ENOENT" });
    await rm(directory, { recursive: true, force: true });
  });
});
