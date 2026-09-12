import { NextResponse } from "next/server";

export function companionRuntimeOrigin() {
  return process.env.COMPANION_RUNTIME_ORIGIN || "http://localhost:5173";
}

export function companionCorsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowedOrigin = companionRuntimeOrigin();
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  });
  if (!origin || origin === allowedOrigin) headers.set("Access-Control-Allow-Origin", origin ?? allowedOrigin);
  return headers;
}

export function companionOptions(request: Request) {
  return new NextResponse(null, { status: 204, headers: companionCorsHeaders(request) });
}

export function withCompanionCors(response: Response, request: Request) {
  const headers = new Headers(response.headers);
  for (const [key, value] of companionCorsHeaders(request)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
