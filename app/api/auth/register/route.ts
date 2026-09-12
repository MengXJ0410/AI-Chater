import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { isDuplicateEntryError } from "@/server/security/account";
import { createSession, hashPassword } from "@/server/security/auth";
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
    const existing = await getDb().select({ id: users.id }).from(users).where(eq(users.username, normalizedUsername)).limit(1);
    if (existing.length) return errorResponse("该用户名已被使用。", 409);

    const id = randomUUID();
    try {
      await getDb().insert(users).values({ id, username: normalizedUsername, passwordHash: await hashPassword(password) });
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        return errorResponse("该用户名已被使用。", 409);
      }
      throw error;
    }
    await createSession(id);
    return NextResponse.json({ user: { id, username: normalizedUsername } }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
