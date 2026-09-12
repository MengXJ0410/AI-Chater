import { NextResponse } from "next/server";
import { requireUser } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { assertSameOrigin, errorResponse } from "@/server/http/errors";
import { deleteUserAvatar, readUserAvatar, replaceUserAvatar } from "@/server/services/avatar";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const { content, mimeType } = await readUserAvatar(user.id);
    return new Response(content, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const formData = await request.formData();
    const file = formData.get("avatar");
    if (!(file instanceof File)) return errorResponse("请选择头像文件。", 400);
    const result = await replaceUserAvatar(user.id, file);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await deleteUserAvatar(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
