import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { assertSameOrigin } from "@/lib/http";
import { conversationSchema } from "@/lib/validators";

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
