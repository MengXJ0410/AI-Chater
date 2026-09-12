import { randomUUID } from "crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/server/db";
import { imageGenerations, sessions, userAiConfigs, userImageConfigs, users } from "@/server/db/schema";
import { RequestError } from "@/server/http/errors";
import { createTombstoneUsername, isDuplicateEntryError } from "@/server/security/account";
import { hashPassword, verifyPassword } from "@/server/security/auth";
import { removeAvatar } from "@/server/services/avatar";

export async function registerUser(username: string, password: string) {
  const normalizedUsername = username;
  const existing = await getDb().select({ id: users.id }).from(users).where(eq(users.username, normalizedUsername)).limit(1);
  if (existing.length) throw new RequestError("该用户名已被使用。", 409);

  const id = randomUUID();
  try {
    await getDb().insert(users).values({ id, username: normalizedUsername, passwordHash: await hashPassword(password) });
  } catch (error) {
    if (isDuplicateEntryError(error)) throw new RequestError("该用户名已被使用。", 409);
    throw error;
  }
  return { id, username: normalizedUsername };
}

export async function authenticateUser(username: string, password: string) {
  const rows = await getDb().select().from(users)
    .where(and(eq(users.username, username), isNull(users.deletedAt))).limit(1);
  const user = rows[0];
  if (!user || !(await verifyPassword(user.passwordHash, password))) return null;
  return { id: user.id, username: user.username };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const account = await getDb().select({ passwordHash: users.passwordHash }).from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt))).limit(1);
  if (!account[0] || !(await verifyPassword(account[0].passwordHash, currentPassword))) {
    throw new RequestError("当前密码错误。", 401);
  }

  const passwordHash = await hashPassword(newPassword);
  await getDb().transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(and(eq(users.id, userId), isNull(users.deletedAt)));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(userAiConfigs).where(eq(userAiConfigs.userId, userId));
  });
}

export async function deleteAccount(userId: string, password: string) {
  const account = await getDb().select({ passwordHash: users.passwordHash, avatarStorageKey: users.avatarStorageKey }).from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt))).limit(1);
  if (!account[0] || !(await verifyPassword(account[0].passwordHash, password))) {
    throw new RequestError("当前密码错误。", 401);
  }

  const tombstoneUsername = createTombstoneUsername();
  await getDb().transaction(async (tx) => {
    await tx.update(users).set({ username: tombstoneUsername, deletedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(userAiConfigs).where(eq(userAiConfigs.userId, userId));
    await tx.delete(userImageConfigs).where(eq(userImageConfigs.userId, userId));
    await tx.update(imageGenerations).set({ status: "cancelled", completedAt: new Date() })
      .where(and(eq(imageGenerations.userId, userId), eq(imageGenerations.status, "queued")));
    await tx.update(imageGenerations).set({ status: "cancel_requested" })
      .where(and(eq(imageGenerations.userId, userId), inArray(imageGenerations.status, ["running", "cancel_requested"])));
  });
  await removeAvatar(account[0].avatarStorageKey).catch((error) => {
    console.error("Failed to remove deleted account avatar", { name: error instanceof Error ? error.name : typeof error });
  });
}
