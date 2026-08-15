import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { avatarUrl, normalizeAvatar, readAvatar, removeAvatar, saveAvatar } from "@/lib/avatar";
import { requireUser } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { assertSameOrigin, errorResponse } from "@/lib/http";

export const runtime = "nodejs";

async function getAvatarRecord(userId: string) {
  const rows = await getDb().select({
    storageKey: users.avatarStorageKey,
    mimeType: users.avatarMimeType,
    updatedAt: users.avatarUpdatedAt,
  }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt))).limit(1);
  return rows[0] ?? null;
}

export async function GET() {
  try {
    const user = await requireUser();
    const avatar = await getAvatarRecord(user.id);
    if (!avatar?.storageKey || !avatar.mimeType) return errorResponse("头像不存在。", 404);
    const content = await readAvatar(avatar.storageKey);
    return new Response(content, {
      headers: {
        "Content-Type": avatar.mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request) {
  let newStorageKey: string | undefined;
  let committed = false;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const formData = await request.formData();
    const file = formData.get("avatar");
    if (!(file instanceof File)) return errorResponse("请选择头像文件。", 400);

    const normalized = await normalizeAvatar(file);
    newStorageKey = await saveAvatar(normalized.buffer);
    const current = await getAvatarRecord(user.id);
    if (!current) {
      await removeAvatar(newStorageKey);
      newStorageKey = undefined;
      return errorResponse("账号不存在。", 401);
    }

    const updatedAt = new Date();
    await getDb().update(users).set({
      avatarStorageKey: newStorageKey,
      avatarMimeType: normalized.mimeType,
      avatarUpdatedAt: updatedAt,
    }).where(and(eq(users.id, user.id), isNull(users.deletedAt)));
    committed = true;
    await removeAvatar(current.storageKey);
    return NextResponse.json({ avatarUrl: avatarUrl(updatedAt) });
  } catch (error) {
    if (newStorageKey && !committed) await removeAvatar(newStorageKey).catch(() => undefined);
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const current = await getAvatarRecord(user.id);
    if (!current) return errorResponse("账号不存在。", 401);
    await getDb().update(users).set({
      avatarStorageKey: null,
      avatarMimeType: null,
      avatarUpdatedAt: null,
    }).where(and(eq(users.id, user.id), isNull(users.deletedAt)));
    await removeAvatar(current.storageKey);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
