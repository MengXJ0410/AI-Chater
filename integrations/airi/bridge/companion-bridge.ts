export {};

type CompanionBootstrap = {
  protocol?: string;
  type?: string;
  ticket?: string;
  modelConfigId?: string;
  gatewayOrigin?: string;
};

type CompanionRuntime = {
  token: string;
  gatewayOrigin: string;
  modelConfigId: string;
  conversationId: string;
  history: Array<{ role: "user" | "assistant"; parts: Array<{ type: string; text?: string }> }>;
};

declare global {
  interface Window {
    __AI_CHATER_COMPANION__?: CompanionRuntime;
  }
}

const protocol = "ai-chater:companion";
const parentOrigin = window.parent === window ? window.location.origin : new URL(document.referrer || window.location.origin).origin;

function notify(type: string, payload: Record<string, unknown> = {}) {
  window.parent.postMessage({ protocol, type, ...payload }, parentOrigin);
}

async function exchange(bootstrap: CompanionBootstrap) {
  if (!bootstrap.ticket || !bootstrap.gatewayOrigin || !bootstrap.modelConfigId) throw new Error("Companion bootstrap is incomplete.");
  const response = await fetch(`${bootstrap.gatewayOrigin}/api/internal/companion/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket: bootstrap.ticket }),
  });
  if (!response.ok) throw new Error("Companion ticket exchange failed.");
  const exchanged = await response.json() as { runtimeToken: string };
  const conversationsResponse = await fetch(`${bootstrap.gatewayOrigin}/api/companion/conversations`, {
    headers: { Authorization: `Bearer ${exchanged.runtimeToken}` },
  });
  if (!conversationsResponse.ok) throw new Error("Companion conversations could not be loaded.");
  const conversations = await conversationsResponse.json() as { conversations: Array<{ id: string }> };
  let conversationId = conversations.conversations[0]?.id;
  if (!conversationId) {
    const createResponse = await fetch(`${bootstrap.gatewayOrigin}/api/companion/conversations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${exchanged.runtimeToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "猫娘陪伴" }),
    });
    if (!createResponse.ok) throw new Error("Companion conversation could not be created.");
    conversationId = (await createResponse.json() as { conversation: { id: string } }).conversation.id;
  }
  const historyResponse = await fetch(`${bootstrap.gatewayOrigin}/api/companion/conversations/${conversationId}`, {
    headers: { Authorization: `Bearer ${exchanged.runtimeToken}` },
  });
  const history = historyResponse.ok
    ? (await historyResponse.json() as { messages: CompanionRuntime["history"] }).messages
    : [];
  window.__AI_CHATER_COMPANION__ = {
    token: exchanged.runtimeToken,
    gatewayOrigin: bootstrap.gatewayOrigin,
    modelConfigId: bootstrap.modelConfigId,
    conversationId,
    history,
  };
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part): part is { type?: string; text?: string } => typeof part === "object" && part !== null)
    .map((part) => part.type === "text" ? part.text || "" : "").join("\n");
}

function toOpenAiStream(response: Response) {
  const source = response.body;
  if (!source) return response;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();
      try {
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          const text = decoder.decode(item.value, { stream: true });
          if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
  return new Response(stream, { status: response.status, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const runtime = window.__AI_CHATER_COMPANION__;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!runtime || !url.includes("/chat/completions") || !init?.body) return originalFetch(input, init);
  try {
    const body = JSON.parse(typeof init.body === "string" ? init.body : await new Response(init.body).text()) as { messages?: Array<{ role?: string; content?: unknown }> };
    const lastUser = [...(body.messages || [])].reverse().find((message) => message.role === "user");
    const response = await originalFetch(`${runtime.gatewayOrigin}/api/companion/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${runtime.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: runtime.conversationId, modelConfigId: runtime.modelConfigId, text: extractText(lastUser?.content) }),
      signal: init.signal,
    });
    return toOpenAiStream(response);
  } catch {
    return originalFetch(input, init);
  }
};

window.addEventListener("message", async (event) => {
  if (event.source !== window.parent || event.origin !== parentOrigin) return;
  const message = event.data as CompanionBootstrap;
  if (!message || message.protocol !== protocol) return;
  if (message.type === "bootstrap") {
    try {
      await exchange(message);
      notify("bootstrapped");
    } catch (error) {
      notify("error", { message: error instanceof Error ? error.message : "Companion bootstrap failed." });
    }
  }
  if (message.type === "model-config" && window.__AI_CHATER_COMPANION__ && message.modelConfigId) window.__AI_CHATER_COMPANION__.modelConfigId = message.modelConfigId;
});

notify("ready");
