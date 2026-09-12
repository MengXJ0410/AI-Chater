export type HomeStarKind = "tiny" | "medium" | "bright";

export type HomeStarPoint = {
  left: number;
  top: number;
  size: number;
  opacity: number;
  delay: number;
  duration: number;
  kind: HomeStarKind;
  color: "blue" | "cyan" | "violet" | "white";
};

export const HOME_STAR_POINTS: readonly HomeStarPoint[] = [
  { left: 4, top: 8, size: 1, opacity: 0.3, delay: 0, duration: 5.4, kind: "tiny", color: "blue" },
  { left: 9, top: 22, size: 1, opacity: 0.42, delay: 1.7, duration: 4.1, kind: "tiny", color: "white" },
  { left: 14, top: 72, size: 2, opacity: 0.55, delay: 0.8, duration: 5.8, kind: "medium", color: "cyan" },
  { left: 19, top: 38, size: 1, opacity: 0.34, delay: 2.9, duration: 6.2, kind: "tiny", color: "violet" },
  { left: 24, top: 12, size: 1, opacity: 0.38, delay: 1.1, duration: 4.8, kind: "tiny", color: "blue" },
  { left: 29, top: 84, size: 2, opacity: 0.5, delay: 2.4, duration: 5.2, kind: "medium", color: "white" },
  { left: 34, top: 27, size: 1, opacity: 0.32, delay: 3.8, duration: 6.5, kind: "tiny", color: "cyan" },
  { left: 39, top: 61, size: 1, opacity: 0.4, delay: 0.5, duration: 4.5, kind: "tiny", color: "blue" },
  { left: 44, top: 9, size: 2, opacity: 0.62, delay: 1.8, duration: 5.6, kind: "medium", color: "violet" },
  { left: 49, top: 46, size: 1, opacity: 0.35, delay: 2.7, duration: 6.1, kind: "tiny", color: "white" },
  { left: 54, top: 78, size: 1, opacity: 0.38, delay: 0.9, duration: 4.7, kind: "tiny", color: "cyan" },
  { left: 59, top: 18, size: 1, opacity: 0.4, delay: 3.1, duration: 5.9, kind: "tiny", color: "blue" },
  { left: 64, top: 66, size: 2, opacity: 0.58, delay: 1.3, duration: 5, kind: "medium", color: "white" },
  { left: 69, top: 35, size: 1, opacity: 0.34, delay: 2.1, duration: 6.4, kind: "tiny", color: "violet" },
  { left: 74, top: 88, size: 1, opacity: 0.4, delay: 4.2, duration: 4.4, kind: "tiny", color: "cyan" },
  { left: 79, top: 16, size: 2, opacity: 0.64, delay: 0.4, duration: 5.1, kind: "bright", color: "blue" },
  { left: 84, top: 53, size: 1, opacity: 0.4, delay: 2.8, duration: 6.8, kind: "tiny", color: "white" },
  { left: 89, top: 76, size: 1, opacity: 0.36, delay: 1.6, duration: 5.7, kind: "tiny", color: "violet" },
  { left: 95, top: 29, size: 2, opacity: 0.56, delay: 3.4, duration: 4.9, kind: "medium", color: "cyan" },
  { left: 7, top: 51, size: 1, opacity: 0.35, delay: 4.6, duration: 6.3, kind: "tiny", color: "blue" },
  { left: 12, top: 91, size: 1, opacity: 0.38, delay: 2.3, duration: 5.3, kind: "tiny", color: "white" },
  { left: 18, top: 17, size: 2, opacity: 0.6, delay: 1.2, duration: 5.9, kind: "bright", color: "violet" },
  { left: 23, top: 59, size: 1, opacity: 0.32, delay: 3.7, duration: 4.6, kind: "tiny", color: "cyan" },
  { left: 28, top: 45, size: 1, opacity: 0.4, delay: 0.7, duration: 6.7, kind: "tiny", color: "blue" },
  { left: 33, top: 7, size: 1, opacity: 0.36, delay: 4.1, duration: 5.5, kind: "tiny", color: "white" },
  { left: 38, top: 93, size: 2, opacity: 0.54, delay: 2.6, duration: 4.2, kind: "medium", color: "cyan" },
  { left: 43, top: 72, size: 1, opacity: 0.33, delay: 1.4, duration: 6.9, kind: "tiny", color: "violet" },
  { left: 48, top: 31, size: 1, opacity: 0.42, delay: 3.5, duration: 5.6, kind: "tiny", color: "blue" },
  { left: 53, top: 56, size: 2, opacity: 0.62, delay: 0.2, duration: 5.3, kind: "bright", color: "white" },
  { left: 58, top: 5, size: 1, opacity: 0.3, delay: 2.5, duration: 4.8, kind: "tiny", color: "cyan" },
  { left: 63, top: 42, size: 1, opacity: 0.4, delay: 4.3, duration: 6.2, kind: "tiny", color: "violet" },
  { left: 68, top: 95, size: 1, opacity: 0.36, delay: 1.9, duration: 5.1, kind: "tiny", color: "blue" },
  { left: 73, top: 59, size: 2, opacity: 0.57, delay: 3.2, duration: 4.7, kind: "medium", color: "white" },
  { left: 78, top: 7, size: 1, opacity: 0.34, delay: 0.6, duration: 6.6, kind: "tiny", color: "cyan" },
  { left: 83, top: 31, size: 1, opacity: 0.42, delay: 4.7, duration: 5.8, kind: "tiny", color: "violet" },
  { left: 88, top: 67, size: 1, opacity: 0.35, delay: 2, duration: 4.5, kind: "tiny", color: "blue" },
  { left: 94, top: 90, size: 2, opacity: 0.6, delay: 1.5, duration: 5.4, kind: "bright", color: "cyan" },
  { left: 3, top: 78, size: 1, opacity: 0.32, delay: 3.9, duration: 6.4, kind: "tiny", color: "white" },
  { left: 10, top: 33, size: 1, opacity: 0.38, delay: 0.3, duration: 5.2, kind: "tiny", color: "violet" },
  { left: 16, top: 63, size: 2, opacity: 0.52, delay: 2.2, duration: 4.9, kind: "medium", color: "blue" },
  { left: 22, top: 4, size: 1, opacity: 0.3, delay: 4.8, duration: 6.8, kind: "tiny", color: "cyan" },
  { left: 27, top: 69, size: 1, opacity: 0.36, delay: 1, duration: 5.7, kind: "tiny", color: "white" },
  { left: 32, top: 36, size: 1, opacity: 0.4, delay: 3, duration: 4.4, kind: "tiny", color: "violet" },
  { left: 37, top: 16, size: 2, opacity: 0.58, delay: 1.7, duration: 5.9, kind: "medium", color: "cyan" },
  { left: 42, top: 88, size: 1, opacity: 0.34, delay: 4.4, duration: 6.1, kind: "tiny", color: "blue" },
  { left: 47, top: 68, size: 1, opacity: 0.4, delay: 0.8, duration: 5.5, kind: "tiny", color: "white" },
  { left: 52, top: 23, size: 1, opacity: 0.35, delay: 2.9, duration: 4.6, kind: "tiny", color: "violet" },
  { left: 57, top: 84, size: 2, opacity: 0.56, delay: 3.6, duration: 5.2, kind: "medium", color: "blue" },
  { left: 62, top: 52, size: 1, opacity: 0.34, delay: 1.1, duration: 6.5, kind: "tiny", color: "cyan" },
  { left: 67, top: 14, size: 1, opacity: 0.39, delay: 4.5, duration: 4.3, kind: "tiny", color: "white" },
  { left: 72, top: 75, size: 1, opacity: 0.33, delay: 2.4, duration: 5.8, kind: "tiny", color: "violet" },
  { left: 77, top: 46, size: 2, opacity: 0.61, delay: 0.5, duration: 5.1, kind: "bright", color: "blue" },
  { left: 82, top: 87, size: 1, opacity: 0.36, delay: 3.3, duration: 6.7, kind: "tiny", color: "cyan" },
  { left: 87, top: 20, size: 1, opacity: 0.4, delay: 1.8, duration: 4.8, kind: "tiny", color: "white" },
  { left: 92, top: 58, size: 2, opacity: 0.55, delay: 4.1, duration: 5.6, kind: "medium", color: "violet" },
  { left: 98, top: 12, size: 1, opacity: 0.34, delay: 2.7, duration: 6.3, kind: "tiny", color: "blue" },
  { left: 6, top: 64, size: 1, opacity: 0.38, delay: 0.9, duration: 4.7, kind: "tiny", color: "cyan" },
  { left: 25, top: 94, size: 1, opacity: 0.3, delay: 3.8, duration: 5.5, kind: "tiny", color: "white" },
  { left: 46, top: 96, size: 2, opacity: 0.53, delay: 1.6, duration: 6.1, kind: "medium", color: "violet" },
  { left: 71, top: 28, size: 1, opacity: 0.35, delay: 4.6, duration: 5.3, kind: "tiny", color: "blue" },
  { left: 91, top: 42, size: 1, opacity: 0.4, delay: 2.1, duration: 4.9, kind: "tiny", color: "cyan" },
];

export const HOME_BRIGHT_STAR_COUNT = HOME_STAR_POINTS.filter((star) => star.kind === "bright").length;
