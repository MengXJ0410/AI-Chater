export type AvatarCropPosition = { x: number; y: number };

export function getAvatarCropScale(width: number, height: number, frameSize: number, zoom: number) {
  return frameSize / Math.min(width, height) * zoom;
}

export function clampAvatarCropPosition(
  position: AvatarCropPosition,
  width: number,
  height: number,
  frameSize: number,
  zoom: number,
): AvatarCropPosition {
  const scale = getAvatarCropScale(width, height, frameSize, zoom);
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const baseX = (frameSize - scaledWidth) / 2;
  const baseY = (frameSize - scaledHeight) / 2;
  const minX = frameSize - scaledWidth - baseX;
  const maxX = -baseX;
  const minY = frameSize - scaledHeight - baseY;
  const maxY = -baseY;

  const x = Math.min(maxX, Math.max(minX, position.x));
  const y = Math.min(maxY, Math.max(minY, position.y));
  return {
    x: Object.is(x, -0) ? 0 : x,
    y: Object.is(y, -0) ? 0 : y,
  };
}
