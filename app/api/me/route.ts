import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createTombstoneUsername } from "@/server/security/account";
import { clearSessionCookie, getCurrentUser, requireUser, verifyPassword } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { getDb } from "@/server/db";
import { imageGenerations, sessions, userAiConfigs, userImageConfigs, users } from "@/server/db/schema";
import { assertSameOrigin, errorResponse } from "@/server/http/errors";
import { deleteAccountSchema } from "@/shared/validators";
import { removeAvatar } from "@/server/services/avatar";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ user });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { password } = deleteAccountSchema.parse(await request.json());
    const account = await getDb().select({ passwordHash: users.passwordHash, avatarStorageKey: users.avatarStorageKey }).from(users)
      .where(and(eq(users.id, user.id), isNull(users.deletedAt))).limit(1);
    if (!account[0] || !(await verifyPassword(account[0].passwordHash, password))) {
      return errorResponse("当前密码错误。", 401);
    }

    const tombstoneUsername = createTombstoneUsername();
    await getDb().transaction(async (tx) => {
      await tx.update(users).set({ username: tombstoneUsername, deletedAt: new Date() })
        .where(and(eq(users.id, user.id), isNull(users.deletedAt)));
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
      await tx.delete(userAiConfigs).where(eq(userAiConfigs.userId, user.id));
      await tx.delete(userImageConfigs).where(eq(userImageConfigs.userId, user.id));
      await tx.update(imageGenerations).set({ status: "cancelled", completedAt: new Date() })
        .where(and(eq(imageGenerations.userId, user.id), eq(imageGenerations.status, "queued")));
      await tx.update(imageGenerations).set({ status: "cancel_requested" })
        .where(and(eq(imageGenerations.userId, user.id), inArray(imageGenerations.status, ["running", "cancel_requested"])));
    });
    await removeAvatar(account[0].avatarStorageKey).catch((error) => {
      console.error("Failed to remove deleted account avatar", { name: error instanceof Error ? error.name : typeof error });
    });
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
