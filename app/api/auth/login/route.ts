import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { getDb } from "@/server/db";
import { users } from "@/server/db/schema";
import { assertSameOrigin, errorResponse } from "@/server/http/errors";
import { credentialsSchema, normalizeUsername } from "@/shared/validators";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { username, password } = credentialsSchema.parse(await request.json());
    const normalizedUsername = normalizeUsername(username);
    const user = await getDb().select().from(users).where(and(eq(users.username, normalizedUsername), isNull(users.deletedAt))).limit(1);
    if (!user[0] || !(await verifyPassword(user[0].passwordHash, password))) {
      return errorResponse("用户名或密码错误。", 401);
    }

    await createSession(user[0].id);
    return NextResponse.json({ user: { id: user[0].id, username: user[0].username } });
  } catch (error) {
    return routeError(error);
  }
}
