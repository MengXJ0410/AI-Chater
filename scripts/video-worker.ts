import nextEnv from "@next/env";
import { createConnection } from "mysql2/promise";

nextEnv.loadEnvConfig(process.cwd());

const { processNextVideoGeneration, recoverInterruptedVideoGenerations } = await import("../server/services/video-generation");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL 未配置。");

const lock = await createConnection(process.env.DATABASE_URL);
const [rows] = await lock.query("SELECT GET_LOCK('ai_chater_video_worker', 0) AS acquired");
if (!Array.isArray(rows) || Number((rows[0] as { acquired?: number })?.acquired) !== 1) {
  await lock.end();
  process.exit(0);
}

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

await recoverInterruptedVideoGenerations();
try {
  while (!stopping) {
    const processed = await processNextVideoGeneration().catch((e) => {
      console.error("Video worker iteration failed", e);
      return false;
    });
    if (!processed) await new Promise((r) => setTimeout(r, 1000));
  }
} finally {
  await lock.query("SELECT RELEASE_LOCK('ai_chater_video_worker')").catch(() => undefined);
  await lock.end();
}
