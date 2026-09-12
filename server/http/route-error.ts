import { ZodError } from "zod";
import { UnauthorizedError } from "@/server/security/auth";
import { errorResponse, RequestError } from "@/server/http/errors";

export function routeError(error: unknown) {
  if (error instanceof UnauthorizedError) return errorResponse(error.message, 401);
  if (error instanceof ZodError) return errorResponse(error.issues[0]?.message ?? "请求参数无效。");
  if (error instanceof RequestError) return errorResponse(error.message, error.status, error.headers);
  if (error instanceof Error) console.error("API route failed", error);
  return errorResponse("请求处理失败。", 500);
}
