import { NextResponse } from "next/server";
import { requireUser } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { assertSameOrigin } from "@/server/http/errors";
import { deleteUnsentAttachment } from "@/server/services/uploads";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    await deleteUnsentAttachment(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
