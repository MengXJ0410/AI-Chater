import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth";

const integration = process.env.AUTH_TEST_DATABASE_URL ? it : it.skip;

describe("MySQL user AI configuration isolation (optional integration)", () => {
  integration("isolates configuration ownership and upgrades encrypted credentials to the active key", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalKeys = process.env.AI_CONFIG_ENCRYPTION_KEYS;
    const originalActiveKeyId = process.env.AI_CONFIG_ACTIVE_KEY_ID;
    const originalAllowedUrls = process.env.USER_AI_ALLOWED_BASE_URLS;
    process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL;
    process.env.USER_AI_ALLOWED_BASE_URLS = JSON.stringify(["https://www.yyapi.cloud/v1"]);
    const firstKey = Buffer.alloc(32, 1).toString("base64");
    const secondKey = Buffer.alloc(32, 2).toString("base64");
    process.env.AI_CONFIG_ENCRYPTION_KEYS = JSON.stringify({ v1: firstKey });
    process.env.AI_CONFIG_ACTIVE_KEY_ID = "v1";

    const [{ getDb }, { userAiConfigs, users }, { deleteUserAiConfig, getPublicUserAiConfig, getUserAiModelConfig, saveUserAiConfig }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/db/schema"),
      import("@/lib/user-ai-config"),
    ]);
    const db = getDb();
    const userA = { id: randomUUID(), username: `model_a_${randomUUID().slice(0, 8)}`, passwordHash: await hashPassword("password123") };
    const userB = { id: randomUUID(), username: `model_b_${randomUUID().slice(0, 8)}`, passwordHash: await hashPassword("password123") };

    try {
      await db.insert(users).values([userA, userB]);
      await saveUserAiConfig(userA.id, {
        provider: "openai-compatible",
        baseUrl: "https://www.yyapi.cloud/v1",
        model: "gpt-4o-mini",
        apiKey: "secret-key-1234",
      });
      expect(await getPublicUserAiConfig(userB.id)).toBeNull();

      process.env.AI_CONFIG_ENCRYPTION_KEYS = JSON.stringify({ v1: firstKey, v2: secondKey });
      process.env.AI_CONFIG_ACTIVE_KEY_ID = "v2";
      await expect(getUserAiModelConfig(userA.id)).resolves.toMatchObject({ apiKey: "secret-key-1234" });
      const upgraded = await db.select({ keyId: userAiConfigs.encryptionKeyId }).from(userAiConfigs)
        .where(eq(userAiConfigs.userId, userA.id)).limit(1);
      expect(upgraded).toEqual([{ keyId: "v2" }]);

      await deleteUserAiConfig(userB.id);
      expect(await getPublicUserAiConfig(userA.id)).toMatchObject({ model: "gpt-4o-mini", apiKeyLast4: "1234" });
      await deleteUserAiConfig(userA.id);
      expect(await getPublicUserAiConfig(userA.id)).toBeNull();
    } finally {
      await db.delete(users).where(inArray(users.id, [userA.id, userB.id]));
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalKeys === undefined) delete process.env.AI_CONFIG_ENCRYPTION_KEYS;
      else process.env.AI_CONFIG_ENCRYPTION_KEYS = originalKeys;
      if (originalActiveKeyId === undefined) delete process.env.AI_CONFIG_ACTIVE_KEY_ID;
      else process.env.AI_CONFIG_ACTIVE_KEY_ID = originalActiveKeyId;
      if (originalAllowedUrls === undefined) delete process.env.USER_AI_ALLOWED_BASE_URLS;
      else process.env.USER_AI_ALLOWED_BASE_URLS = originalAllowedUrls;
    }
  });
});
