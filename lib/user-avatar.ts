export const AVATAR_SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export function getAvatarInitial(username: string) {
  return username.trim().slice(0, 1).toUpperCase() || "我";
}

export function getAvatarFileError(file: { type: string; size: number }) {
  if (!AVATAR_SUPPORTED_TYPES.includes(file.type as (typeof AVATAR_SUPPORTED_TYPES)[number])) {
    return "仅支持 JPG、PNG 或 WebP 图片。";
  }
  if (file.size === 0) return "头像图片不能为空。";
  if (file.size > AVATAR_MAX_BYTES) return "头像图片不能超过 2 MB。";
  return null;
}
