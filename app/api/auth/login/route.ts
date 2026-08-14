import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { credentialsSchema, normalizeUsername } from "@/lib/validators";

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
