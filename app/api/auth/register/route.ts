import { NextResponse } from "next/server";
import { createSession } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { assertSameOrigin } from "@/server/http/errors";
import { credentialsSchema, normalizeUsername } from "@/shared/validators";
import { registerUser } from "@/server/services/account";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { username, password } = credentialsSchema.parse(await request.json());
    const user = await registerUser(normalizeUsername(username), password);
    await createSession(user.id);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
