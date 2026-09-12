import { lookup } from "dns/promises";
import { isIP } from "net";
import { RequestError } from "@/server/http/errors";
import type { AiProvider } from "@/shared/config";

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isPrivateIp(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const version = isIP(normalized);
  if (version === 4) {
    const octets = normalized.split(".").map(Number);
    return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168);
  }
  if (version === 6) {
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:") || normalized.startsWith("::ffff:");
  }
  return false;
}

function isInternalHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local") || normalized.endsWith(".internal");
}

export function assertSafeRequestUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RequestError("模型请求地址无效。", 502);
  }
  const loopback = isLoopbackHost(url.hostname);
  if (url.username || url.password || (isPrivateIp(url.hostname) && !loopback)) {
    throw new RequestError("模型请求地址指向不允许的内网地址。", 502);
  }
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new RequestError("模型请求地址必须使用 HTTPS。", 502);
  }
  if (!loopback && isInternalHostname(url.hostname)) {
    throw new RequestError("模型请求地址使用了不允许的内部主机名。", 502);
  }
}

export async function assertSafeResolvedRequestUrl(value: string) {
  assertSafeRequestUrl(value);
  const url = new URL(value);
  if (isIP(url.hostname) || isLoopbackHost(url.hostname)) return;
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.some(({ address }) => isPrivateIp(address))) {
    throw new RequestError("模型请求地址解析到了不允许的内网地址。", 502);
  }
}

export function assertPublicCompatibleBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || isIP(url.hostname) || isLoopbackHost(url.hostname)) {
    throw new RequestError("自定义 Base URL 必须是 HTTPS 公网域名。", 403);
  }
}

export function normalizeBaseUrl(value: string, provider: AiProvider = "openai-compatible") {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RequestError("Base URL 格式无效。");
  }
  const loopback = isLoopbackHost(url.hostname);
  if (url.username || url.password || url.search || url.hash || (isPrivateIp(url.hostname) && !loopback)) {
    throw new RequestError("Base URL 不能包含账号、查询参数、片段或内网地址。");
  }
  if (url.protocol !== "https:" && !(provider === "openai-compatible" && loopback && url.protocol === "http:")) {
    throw new RequestError("Base URL 必须使用 HTTPS；本地兼容模型可使用 HTTP loopback 地址。");
  }
  if (loopback && provider !== "openai-compatible") {
    throw new RequestError("只有 OpenAI Compatible Provider 可以连接本机地址。", 403);
  }
  if (!loopback && isInternalHostname(url.hostname)) {
    throw new RequestError("Base URL 不允许使用内部主机名。", 403);
  }
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.origin}${pathname}`;
}
