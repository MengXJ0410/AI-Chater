export const CHAT_ENTRY_STORAGE_KEY = "ai-chater:chat-entry-transition";
export const CHAT_ENTRY_REQUEST_EVENT = "ai-chater:chat-entry-request";
export const CHAT_ENTRY_READY_EVENT = "ai-chater:chat-entry-ready";
export const CHAT_ENTRY_TOKEN_TTL_MS = 5_000;

export type TransitionPointerEvent = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export function isPlainPrimaryClick(event: TransitionPointerEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function createChatEntryToken(now = Date.now()) {
  return String(now);
}

export function isPendingChatEntry(token: string | null, now = Date.now()) {
  if (!token || !/^\d+$/.test(token)) return false;
  const startedAt = Number(token);
  return Number.isFinite(startedAt) && now >= startedAt && now - startedAt <= CHAT_ENTRY_TOKEN_TTL_MS;
}
