import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", ".runtime/**", "node_modules/**", "data/**"]),
  {
    files: ["client/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@/server", "@/server/*"], message: "前端层（client/components）不得依赖后端层 server，请改用 client/api 或 shared。" }],
      }],
    },
  },
  {
    files: ["shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@/server", "@/server/*", "@/client", "@/client/*"], message: "共享层 shared 只能依赖自身，不得依赖 server 或 client。" }],
      }],
    },
  },
  {
    files: ["server/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@/client", "@/client/*"], message: "后端层 server 不得依赖前端层 client，请把共享类型移入 shared。" }],
      }],
    },
  },
]);
