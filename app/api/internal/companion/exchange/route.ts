import { NextResponse } from "next/server";
import { exchangeCompanionLaunch } from "@/server/security/companion-auth";
import { routeError } from "@/server/http/route-error";
import { companionOptions, withCompanionCors } from "@/server/http/companion-http";
import { companionExchangeSchema } from "@/shared/validators";

export const runtime = "nodejs";

export function OPTIONS(request: Request) { return companionOptions(request); }

export async function POST(request: Request) {
  try {
    const { ticket } = companionExchangeSchema.parse(await request.json());
    return withCompanionCors(NextResponse.json(await exchangeCompanionLaunch(ticket)), request);
  } catch (error) {
    return withCompanionCors(routeError(error), request);
  }
}
