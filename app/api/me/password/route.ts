import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { clearSessionCookie, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { passwordChangeSchema } from "@/lib/validators";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { currentPassword, newPassword } = passwordChangeSchema.parse(await request.json());
    const account = await getDb().select({ passwordHash: users.passwordHash }).from(users)
      .where(and(eq(users.id, user.id), isNull(users.deletedAt))).limit(1);
    if (!account[0] || !(await verifyPassword(account[0].passwordHash, currentPassword))) {
      return errorResponse("当前密码错误。", 401);
    }

    const passwordHash = await hashPassword(newPassword);
    await getDb().transaction(async (tx) => {
      await tx.update(users).set({ passwordHash }).where(and(eq(users.id, user.id), isNull(users.deletedAt)));
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
    });
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
