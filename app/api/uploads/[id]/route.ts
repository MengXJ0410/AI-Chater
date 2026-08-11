import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { removeImages } from "@/lib/uploads";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const attachment = await getDb().select().from(attachments).where(and(
      eq(attachments.id, id),
      eq(attachments.userId, user.id),
      isNull(attachments.messageId),
    )).limit(1);
    if (!attachment[0]) return errorResponse("图片不存在或已发送。", 404);
    await getDb().delete(attachments).where(eq(attachments.id, id));
    await removeImages([attachment[0].storageKey]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
