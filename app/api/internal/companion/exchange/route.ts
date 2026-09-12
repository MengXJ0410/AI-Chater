import { NextResponse } from "next/server";
import { exchangeCompanionLaunch } from "@/lib/companion-auth";
import { routeError } from "@/lib/api";
import { companionOptions, withCompanionCors } from "@/lib/companion-http";
import { companionExchangeSchema } from "@/lib/validators";

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
