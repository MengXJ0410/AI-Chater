import { createHash, randomBytes, randomUUID } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { companionLaunchTickets, companionRuntimeTokens, sessions } from "@/lib/db/schema";
import { RequestError } from "@/lib/http";

const LAUNCH_TICKET_TTL_MS = 2 * 60 * 1000;
const RUNTIME_TOKEN_TTL_MS = 10 * 60 * 1000;
const TARGET = "stage-web";

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function opaqueToken() {
  return randomBytes(32).toString("base64url");
}

export async function createCompanionLaunch() {
  const session = await getCurrentSession();
  if (!session) throw new RequestError("请先登录。", 401);

  const ticket = opaqueToken();
  const now = Date.now();
  await getDb().insert(companionLaunchTickets).values({
    id: randomUUID(),
    userId: session.user.id,
    sessionId: session.sessionId,
    tokenHash: hashToken(ticket),
    nonce: randomBytes(24).toString("base64url"),
    target: TARGET,
    expiresAt: new Date(now + LAUNCH_TICKET_TTL_MS),
  });

  return { ticket, target: TARGET, expiresIn: Math.floor(LAUNCH_TICKET_TTL_MS / 1000) };
}

export async function exchangeCompanionLaunch(ticket: string) {
  if (!ticket || ticket.length > 256) throw new RequestError("启动票据无效。", 401);
  const tokenHash = hashToken(ticket);
  const now = new Date();
  const result = await getDb().transaction(async (tx) => {
    const rows = await tx.select().from(companionLaunchTickets)
      .where(and(
        eq(companionLaunchTickets.tokenHash, tokenHash),
        isNull(companionLaunchTickets.consumedAt),
        gt(companionLaunchTickets.expiresAt, now),
      )).limit(1);
    const launch = rows[0];
    if (!launch) return null;

    const consumed = await tx.update(companionLaunchTickets).set({ consumedAt: now }).where(and(
      eq(companionLaunchTickets.id, launch.id),
      isNull(companionLaunchTickets.consumedAt),
    ));
    if (consumed[0].affectedRows !== 1) return null;
    const runtimeToken = opaqueToken();
    await tx.insert(companionRuntimeTokens).values({
      id: randomUUID(),
      userId: launch.userId,
      sessionId: launch.sessionId,
      tokenHash: hashToken(runtimeToken),
      expiresAt: new Date(Date.now() + RUNTIME_TOKEN_TTL_MS),
    });
    return { runtimeToken, userId: launch.userId, expiresIn: Math.floor(RUNTIME_TOKEN_TTL_MS / 1000) };
  });

  if (!result) throw new RequestError("启动票据已过期或已使用。", 401);
  return result;
}

export async function requireCompanionRuntime(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new RequestError("Companion 运行时令牌缺失。", 401);

  const rows = await getDb().select({
    userId: companionRuntimeTokens.userId,
    tokenExpiresAt: companionRuntimeTokens.expiresAt,
    sessionExpiresAt: sessions.expiresAt,
  }).from(companionRuntimeTokens)
    .innerJoin(sessions, eq(companionRuntimeTokens.sessionId, sessions.id))
    .where(and(
      eq(companionRuntimeTokens.tokenHash, hashToken(match[1])),
      isNull(companionRuntimeTokens.revokedAt),
      gt(companionRuntimeTokens.expiresAt, new Date()),
      gt(sessions.expiresAt, new Date()),
    )).limit(1);
  if (!rows[0]) throw new RequestError("Companion 运行时令牌无效或已过期。", 401);
  return { userId: rows[0].userId };
}

export async function revokeCompanionRuntimeTokens(sessionId: string) {
  await getDb().update(companionRuntimeTokens).set({ revokedAt: new Date() }).where(and(
    eq(companionRuntimeTokens.sessionId, sessionId),
    isNull(companionRuntimeTokens.revokedAt),
  ));
}

export const companionLaunchTarget = TARGET;
