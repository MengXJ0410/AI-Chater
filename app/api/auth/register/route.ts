import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { credentialsSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { username, password } = credentialsSchema.parse(await request.json());
    const normalizedUsername = username.toLowerCase();
    const existing = await getDb().select({ id: users.id }).from(users).where(eq(users.username, normalizedUsername)).limit(1);
    if (existing.length) return errorResponse("该用户名已被使用。", 409);

    const id = randomUUID();
    await getDb().insert(users).values({ id, username: normalizedUsername, passwordHash: await hashPassword(password) });
    await createSession(id);
    return NextResponse.json({ user: { id, username: normalizedUsername } }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
