import { NextResponse } from "next/server";
import { clearSessionCookie, requireUser } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { assertSameOrigin } from "@/server/http/errors";
import { passwordChangeSchema } from "@/shared/validators";
import { changePassword } from "@/server/services/account";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { currentPassword, newPassword } = passwordChangeSchema.parse(await request.json());
    await changePassword(user.id, currentPassword, newPassword);
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
