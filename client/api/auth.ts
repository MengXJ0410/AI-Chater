import { jsonInit, requestJson, requestVoid } from "@/client/api/http";

export type AuthUser = { id: string; username: string };
export type Credentials = { username: string; password: string };

export async function login(credentials: Credentials): Promise<AuthUser> {
  const data = await requestJson<{ user: AuthUser }>("/api/auth/login", jsonInit(credentials), "登录失败，请重试。");
  return data.user;
}

export async function register(credentials: Credentials): Promise<AuthUser> {
  const data = await requestJson<{ user: AuthUser }>("/api/auth/register", jsonInit(credentials), "注册失败，请重试。");
  return data.user;
}

export async function logout(): Promise<void> {
  await requestVoid("/api/auth/logout", { method: "POST" }, "退出登录失败。");
}
