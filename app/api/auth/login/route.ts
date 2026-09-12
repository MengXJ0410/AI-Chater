import { NextResponse } from "next/server";
import { createSession } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { assertSameOrigin, errorResponse } from "@/server/http/errors";
import { credentialsSchema, normalizeUsername } from "@/shared/validators";
import { authenticateUser } from "@/server/services/account";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { username, password } = credentialsSchema.parse(await request.json());
    const user = await authenticateUser(normalizeUsername(username), password);
    if (!user) return errorResponse("用户名或密码错误。", 401);

    await createSession(user.id);
    return NextResponse.json({ user });
  } catch (error) {
    return routeError(error);
  }
}
