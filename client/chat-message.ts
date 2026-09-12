export type ChatMessageRole = "user" | "assistant";
export type GenerationStatus = "thinking" | "streaming" | "complete" | "error";

export function getMessageSide(role: ChatMessageRole) {
  return role === "user" ? "right" : "left";
}

export function getGenerationLabel(status?: GenerationStatus) {
  if (status === "thinking") return "思考中…";
  if (status === "streaming") return "对话生成中…";
  if (status === "error") return "生成失败，请重试";
  return null;
}

export function appendStreamText(current: string, chunk: string) {
  return current + chunk;
}
