import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export function routeError(error: unknown) {
  if (error instanceof UnauthorizedError) return errorResponse(error.message, 401);
  if (error instanceof ZodError) return errorResponse(error.issues[0]?.message ?? "请求参数无效。");
  if (error instanceof Error && error.message === "Invalid request origin.") return errorResponse("请求来源无效。", 403);
  if (error instanceof Error) return errorResponse(error.message, 400);
  return errorResponse("请求处理失败。", 500);
}
