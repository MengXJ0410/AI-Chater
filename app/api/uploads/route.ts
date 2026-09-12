import { NextResponse } from "next/server";
import { requireUser } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { assertSameOrigin, errorResponse } from "@/server/http/errors";
import { createUploadedAttachment } from "@/server/services/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return errorResponse("请选择图片文件。");
    const attachment = await createUploadedAttachment(user.id, file);
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
