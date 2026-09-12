import { createHash, randomBytes, randomUUID } from "crypto";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/server/db";
import { companionRuntimeTokens, sessions, users } from "@/server/db/schema";
import { getSessionTtlDays } from "@/server/config";
import { avatarUrl } from "@/server/services/avatar";

const SESSION_COOKIE = "ai_chater_session";

export class UnauthorizedError extends Error {}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(passwordHash: string, password: string) {
  return argon2.verify(passwordHash, password);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + getSessionTtlDays() * 24 * 60 * 60 * 1000);
  await getDb().insert(sessions).values({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  try {
    if (token) {
      const session = await getDb().select({ id: sessions.id }).from(sessions).where(eq(sessions.tokenHash, hashToken(token))).limit(1);
      if (session[0]) {
        await getDb().delete(companionRuntimeTokens).where(eq(companionRuntimeTokens.sessionId, session[0].id));
        await getDb().delete(sessions).where(eq(sessions.id, session[0].id));
      }
    }
  } finally {
    cookieStore.delete(SESSION_COOKIE);
  }
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export async function getCurrentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const result = await getDb()
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      id: users.id,
      username: users.username,
      deletedAt: users.deletedAt,
      avatarStorageKey: users.avatarStorageKey,
      avatarUpdatedAt: users.avatarUpdatedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);

  const session = result[0];
  if (!session) return null;
  if (session.expiresAt <= new Date() || session.deletedAt) {
    await getDb().delete(sessions).where(eq(sessions.id, session.sessionId));
    return null;
  }

  return {
    sessionId: session.sessionId,
    user: { id: session.id, username: session.username, avatarUrl: avatarUrl(session.avatarStorageKey ? session.avatarUpdatedAt : null) },
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError("请先登录。");
  return user;
}
