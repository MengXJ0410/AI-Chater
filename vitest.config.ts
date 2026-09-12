import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: { environment: "node", exclude: ["**/node_modules/**", "**/.runtime/**"] },
});
