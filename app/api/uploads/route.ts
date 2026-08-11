import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { removeImages, saveImage, validateImage } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let storageKey: string | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return errorResponse("请选择图片文件。");
    validateImage(file);
    storageKey = await saveImage(file);
    const attachment = {
      id: randomUUID(),
      userId: user.id,
      storageKey,
      mimeType: file.type,
      size: file.size,
      originalName: file.name.slice(0, 255) || "image",
    };
    await getDb().insert(attachments).values(attachment);
    return NextResponse.json({ attachment: { id: attachment.id, mimeType: attachment.mimeType, originalName: attachment.originalName } }, { status: 201 });
  } catch (error) {
    if (storageKey) await removeImages([storageKey]);
    return routeError(error);
  }
}
