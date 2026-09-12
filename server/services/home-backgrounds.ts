import { readdir } from "fs/promises";
import path from "path";

const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

export function isHomeBackgroundFile(fileName: string) {
  return supportedExtensions.has(path.extname(fileName).toLowerCase());
}

export function toHomeBackgroundUrl(fileName: string) {
  return `/home-backgrounds/${encodeURIComponent(fileName)}`;
}

export async function getHomeBackgrounds() {
  try {
    const directory = path.join(process.cwd(), "public", "home-backgrounds");
    const files = await readdir(directory, { withFileTypes: true });
    return files
      .filter((file) => file.isFile() && isHomeBackgroundFile(file.name))
      .map((file) => file.name)
      .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }))
      .map(toHomeBackgroundUrl);
  } catch {
    return [];
  }
}
