import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentUser, requireUser } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { assertSameOrigin } from "@/server/http/errors";
import { deleteAccountSchema } from "@/shared/validators";
import { deleteAccount } from "@/server/services/account";

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
    await deleteAccount(user.id, password);
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
