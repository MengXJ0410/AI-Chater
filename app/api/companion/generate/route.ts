import { requireCompanionRuntime } from "@/lib/companion-auth";
import { generateCompanionReply } from "@/lib/companion";
import { routeError } from "@/lib/api";
import { companionOptions, withCompanionCors } from "@/lib/companion-http";
import { companionGenerateSchema } from "@/lib/validators";

export const runtime = "nodejs";

export function OPTIONS(request: Request) { return companionOptions(request); }

export async function POST(request: Request) {
  try {
    const runtime = await requireCompanionRuntime(request);
    const input = companionGenerateSchema.parse(await request.json());
    return withCompanionCors(await generateCompanionReply(request, input, runtime.userId), request);
  } catch (error) {
    return withCompanionCors(routeError(error), request);
  }
}
