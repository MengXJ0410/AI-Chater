import { requestJson, requestVoid } from "@/client/api/http";

export type ProfileUser = { id: string; username: string; avatarUrl?: string | null };
export type ProfilePayload = { user: ProfileUser; avatarServiceAvailable: boolean };

export async function getProfile(): Promise<ProfilePayload> {
  return requestJson<ProfilePayload>("/api/me/profile", { cache: "no-store" }, "无法读取个人资料。");
}

export async function uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
  const formData = new FormData();
  formData.append("avatar", file);
  return requestJson<{ avatarUrl: string }>("/api/me/avatar", { method: "PUT", body: formData }, "头像上传失败。");
}

export async function removeAvatar(): Promise<void> {
  await requestVoid("/api/me/avatar", { method: "DELETE" }, "头像删除失败。");
}
