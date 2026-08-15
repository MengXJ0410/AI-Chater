import { NextResponse } from "next/server";

export class RequestError extends Error {
  constructor(message: string, readonly status = 400, readonly headers?: HeadersInit) {
    super(message);
    this.name = "RequestError";
  }
}

export function errorResponse(message: string, status = 400, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    throw new RequestError("请求来源无效。", 403);
  }
}
