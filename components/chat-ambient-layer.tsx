"use client";

import { useEffect, useRef } from "react";
import { canTrackChatPointer, clampPointerPoint, getPointerStrength, interpolatePointerPoint } from "@/lib/chat-ambient";

export function ChatAmbientLayer() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const workbench = layer?.parentElement;
    if (!layer || !workbench) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    if (!canTrackChatPointer(reducedMotion, coarsePointer)) return;

    let frame = 0;
    let point = { x: 0, y: 0 };
    let trailingPoint = { x: 0, y: 0 };
    let active = false;

    const render = () => {
      frame = 0;
      const rect = workbench.getBoundingClientRect();
      const normalized = clampPointerPoint(point, rect.width, rect.height);
      trailingPoint = interpolatePointerPoint(trailingPoint, normalized, 0.13);
      const distance = Math.hypot(normalized.x - rect.width / 2, normalized.y - rect.height / 2) / Math.max(rect.width, rect.height);
      layer.style.setProperty("--chat-pointer-x", `${normalized.x}px`);
      layer.style.setProperty("--chat-pointer-y", `${normalized.y}px`);
      layer.style.setProperty("--chat-trail-x", `${trailingPoint.x}px`);
      layer.style.setProperty("--chat-trail-y", `${trailingPoint.y}px`);
      layer.style.setProperty("--chat-pointer-strength", String(getPointerStrength(active, distance * 0.7)));
      if (active) scheduleRender();
    };

    const scheduleRender = () => {
      if (!frame) frame = window.requestAnimationFrame(render);
    };
    const handleMove = (event: PointerEvent) => {
      const rect = workbench.getBoundingClientRect();
      point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      active = true;
      scheduleRender();
    };
    const handleLeave = () => {
      active = false;
      scheduleRender();
    };
    const handleVisibilityChange = () => {
      const paused = document.hidden;
      layer.dataset.paused = paused ? "true" : "false";
      if (paused) {
        active = false;
        scheduleRender();
      }
    };

    workbench.addEventListener("pointermove", handleMove);
    workbench.addEventListener("pointerleave", handleLeave);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      workbench.removeEventListener("pointermove", handleMove);
      workbench.removeEventListener("pointerleave", handleLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <div className="chat-ambient" ref={layerRef} aria-hidden="true">
      <div className="chat-ambient-grid" />
      <div className="chat-ambient-trail" />
      <div className="chat-ambient-scanline" />
      <span className="chat-ambient-node chat-ambient-node-a" />
      <span className="chat-ambient-node chat-ambient-node-b" />
      <span className="chat-ambient-node chat-ambient-node-c" />
      <span className="chat-ambient-corner chat-ambient-corner-a" />
      <span className="chat-ambient-corner chat-ambient-corner-b" />
    </div>
  );
}
