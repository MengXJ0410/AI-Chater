import { requestJson, requestVoid } from "@/client/api/http";

export type UploadedAttachment = { id: string; mimeType: string; originalName: string };

export async function uploadImage(file: File): Promise<UploadedAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  const data = await requestJson<{ attachment: UploadedAttachment }>("/api/uploads", { method: "POST", body: formData }, "图片上传失败。");
  return data.attachment;
}

export async function removeUpload(id: string): Promise<void> {
  await requestVoid(`/api/uploads/${id}`, { method: "DELETE" }, "移除图片失败。");
}
