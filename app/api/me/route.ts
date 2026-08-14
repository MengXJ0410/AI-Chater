import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createTombstoneUsername } from "@/lib/account";
import { clearSessionCookie, getCurrentUser, requireUser, verifyPassword } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { sessions, userAiConfigs, users } from "@/lib/db/schema";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { deleteAccountSchema } from "@/lib/validators";

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
    const account = await getDb().select({ passwordHash: users.passwordHash }).from(users)
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
    });
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
