export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return fallback;
}

export function jsonInit(body: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function requestJson<T>(url: string, init?: RequestInit, fallbackError = "请求失败，请重试。"): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new ApiRequestError(await readErrorMessage(response, fallbackError), response.status);
  return response.json() as Promise<T>;
}

export async function requestVoid(url: string, init?: RequestInit, fallbackError = "请求失败，请重试。"): Promise<void> {
  const response = await fetch(url, init);
  if (!response.ok) throw new ApiRequestError(await readErrorMessage(response, fallbackError), response.status);
}

export type JsonResponse<T> = { ok: boolean; status: number; data: Partial<T> };

export async function requestJsonStatus<T>(url: string, init?: RequestInit): Promise<JsonResponse<T>> {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => ({}))) as Partial<T>;
  return { ok: response.ok, status: response.status, data };
}
