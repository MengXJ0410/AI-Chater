export const HOME_PAGE_COUNT = 3;

export function clampHomePageIndex(index: number, pageCount = HOME_PAGE_COUNT) {
  const lastIndex = Math.max(0, pageCount - 1);
  return Math.min(lastIndex, Math.max(0, Math.round(index)));
}

export function nextHomePageIndex(currentIndex: number, deltaY: number, pageCount = HOME_PAGE_COUNT) {
  if (deltaY === 0) return clampHomePageIndex(currentIndex, pageCount);
  const direction = deltaY > 0 ? 1 : -1;
  return clampHomePageIndex(currentIndex + direction, pageCount);
}

export function getHomePageIndexFromScroll(scrollTop: number, viewportHeight: number, pageCount = HOME_PAGE_COUNT) {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0;
  return clampHomePageIndex(scrollTop / viewportHeight, pageCount);
}
