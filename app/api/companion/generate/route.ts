import { requireCompanionRuntime } from "@/server/security/companion-auth";
import { generateCompanionReply } from "@/server/services/companion";
import { routeError } from "@/server/http/route-error";
import { companionOptions, withCompanionCors } from "@/server/http/companion-http";
import { companionGenerateSchema } from "@/shared/validators";

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
