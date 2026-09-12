import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { rateLimitStates } from "@/server/db/schema";
import { RequestError } from "@/server/http/errors";

export type RateLimitScope = "config_mutation" | "chat_test" | "image_test" | "image_generation";

const scopeEnv: Record<RateLimitScope, string> = {
  config_mutation: "MODEL_CONFIG_MUTATION_LIMIT_PER_HOUR",
  chat_test: "MODEL_CHAT_TEST_LIMIT_PER_HOUR",
  image_test: "MODEL_IMAGE_TEST_LIMIT_PER_HOUR",
  image_generation: "MODEL_IMAGE_GENERATION_LIMIT_PER_HOUR",
};
const defaults: Record<RateLimitScope, number> = { config_mutation: 30, chat_test: 10, image_test: 3, image_generation: 20 };

function limit(scope: RateLimitScope) {
  const value = Number(process.env[scopeEnv[scope]] ?? defaults[scope]);
  return Number.isSafeInteger(value) && value > 0 ? value : defaults[scope];
}

type DatabaseTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export async function consumeRateLimitInTransaction(tx: DatabaseTransaction, userId: string, scope: RateLimitScope, now = new Date()) {
  const windowMs = 60 * 60 * 1000;
  const currentLimit = limit(scope);
  await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
  const rows = await tx.select().from(rateLimitStates).where(and(eq(rateLimitStates.userId, userId), eq(rateLimitStates.scope, scope))).limit(1);
  const state = rows[0];
  const expired = !state || now.getTime() - state.windowStartedAt.getTime() >= windowMs;
  const count = expired ? 0 : state.count;
  const retryAfter = expired ? 0 : Math.max(1, Math.ceil((state!.windowStartedAt.getTime() + windowMs - now.getTime()) / 1000));
  if (count >= currentLimit) throw new RequestError("操作过于频繁，请稍后再试。", 429, { "Retry-After": String(retryAfter) });
  if (state) await tx.update(rateLimitStates).set({ windowStartedAt: expired ? now : state.windowStartedAt, count: count + 1 }).where(and(eq(rateLimitStates.userId, userId), eq(rateLimitStates.scope, scope)));
  else await tx.insert(rateLimitStates).values({ userId, scope, windowStartedAt: now, count: 1 });
}

export async function consumeRateLimit(userId: string, scope: RateLimitScope, now = new Date()) {
  return getDb().transaction((tx) => consumeRateLimitInTransaction(tx, userId, scope, now));
}
