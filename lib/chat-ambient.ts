export type PointerPoint = { x: number; y: number };

export function clampPointerPoint(point: PointerPoint, width: number, height: number): PointerPoint {
  return {
    x: Math.min(width, Math.max(0, point.x)),
    y: Math.min(height, Math.max(0, point.y)),
  };
}

export function getPointerStrength(active: boolean, distance = 0) {
  if (!active) return 0;
  return Math.min(1, Math.max(0, 1 - distance));
}

export function interpolatePointerPoint(current: PointerPoint, target: PointerPoint, factor: number): PointerPoint {
  const amount = Math.min(1, Math.max(0, factor));
  return { x: current.x + (target.x - current.x) * amount, y: current.y + (target.y - current.y) * amount };
}

export function getGlowStyleValues(brightness: number, motion: number) {
  return {
    brightness: Math.min(2, Math.max(0, brightness / 100)),
    motion: Math.min(2, Math.max(0, motion / 100)),
  };
}

export function isNearScrollBottom(scrollTop: number, clientHeight: number, scrollHeight: number, threshold = 80) {
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}

export function getFollowScrollTop(scrollHeight: number, clientHeight: number) {
  return Math.max(0, scrollHeight - clientHeight);
}

export function canTrackChatPointer(reducedMotion: boolean, coarsePointer: boolean) {
  return !reducedMotion && !coarsePointer;
}
