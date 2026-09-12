"use client";

import { useEffect, useRef, useState } from "react";
import { CHAT_ENTRY_READY_EVENT, CHAT_ENTRY_REQUEST_EVENT, CHAT_ENTRY_STORAGE_KEY } from "@/client/chat-entry-transition";

type TransitionPhase = "idle" | "covering" | "revealing";

export function ChatEntryTransition() {
  const [phase, setPhase] = useState<TransitionPhase>("idle");
  const fallbackTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearTimers = () => {
      if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current);
      if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
      fallbackTimerRef.current = null;
      exitTimerRef.current = null;
    };
    const start = () => {
      clearTimers();
      setPhase("covering");
      fallbackTimerRef.current = window.setTimeout(() => {
        window.sessionStorage.removeItem(CHAT_ENTRY_STORAGE_KEY);
        setPhase("idle");
      }, 2_500);
    };
    const reveal = () => {
      clearTimers();
      setPhase("revealing");
      exitTimerRef.current = window.setTimeout(() => setPhase("idle"), 300);
    };
    window.addEventListener(CHAT_ENTRY_REQUEST_EVENT, start);
    window.addEventListener(CHAT_ENTRY_READY_EVENT, reveal);
    return () => {
      clearTimers();
      window.removeEventListener(CHAT_ENTRY_REQUEST_EVENT, start);
      window.removeEventListener(CHAT_ENTRY_READY_EVENT, reveal);
    };
  }, []);

  return <div className={`chat-entry-transition is-${phase}`} aria-hidden="true"><span /></div>;
}
