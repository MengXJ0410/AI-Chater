import nextEnv from "@next/env";
import { createConnection } from "mysql2/promise";

nextEnv.loadEnvConfig(process.cwd());

const { processNextImageGeneration, recoverInterruptedImageGenerations } = await import("../server/services/image-generation");
const { cleanupModelAudit } = await import("../server/services/model-controls");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL 未配置。");

const lockConnection = await createConnection(databaseUrl);
const [lockRows] = await lockConnection.query("SELECT GET_LOCK('ai_chater_image_worker', 0) AS acquired");
const acquired = Array.isArray(lockRows) && Number((lockRows[0] as { acquired?: number } | undefined)?.acquired) === 1;
if (!acquired) {
  console.log("Image worker is already running.");
  await lockConnection.end();
  process.exit(0);
}

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

console.log("Image worker started.");
await recoverInterruptedImageGenerations();
await cleanupModelAudit().catch((error) => console.error("Model audit cleanup failed", { name: error instanceof Error ? error.name : typeof error }));
let nextAuditCleanupAt = Date.now() + 24 * 60 * 60 * 1000;

try {
  while (!stopping) {
    if (Date.now() >= nextAuditCleanupAt) {
      await cleanupModelAudit().catch((error) => console.error("Model audit cleanup failed", { name: error instanceof Error ? error.name : typeof error }));
      nextAuditCleanupAt = Date.now() + 24 * 60 * 60 * 1000;
    }
    const processed = await processNextImageGeneration().catch((error) => {
      console.error("Image worker iteration failed", { name: error instanceof Error ? error.name : typeof error });
      return false;
    });
    if (!processed) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  await lockConnection.query("SELECT RELEASE_LOCK('ai_chater_image_worker')").catch(() => undefined);
  await lockConnection.end();
}
