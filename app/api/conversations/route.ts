import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { getDb } from "@/server/db";
import { conversations } from "@/server/db/schema";
import { assertSameOrigin } from "@/server/http/errors";
import { conversationSchema } from "@/shared/validators";

export async function GET() {
  try {
    const user = await requireUser();
    const items = await getDb().select().from(conversations)
      .where(and(eq(conversations.userId, user.id), eq(conversations.kind, "chat")))
      .orderBy(desc(conversations.updatedAt));
    return NextResponse.json({ conversations: items });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { title } = conversationSchema.parse(await request.json());
    const conversation = { id: randomUUID(), userId: user.id, title, kind: "chat" as const };
    await getDb().insert(conversations).values(conversation);
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
