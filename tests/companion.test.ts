import { describe, expect, it } from "vitest";
import { COMPANION_PERSONA_VERSION, COMPANION_SYSTEM_PROMPT } from "@/lib/companion";
import { companionCorsHeaders } from "@/lib/companion-http";
import { companionConversationSchema, companionExchangeSchema, companionGenerateSchema } from "@/lib/validators";

describe("Companion contracts", () => {
  it("requires a user-owned model config and conversation for generation", () => {
    expect(companionGenerateSchema.parse({
      conversationId: "00000000-0000-0000-0000-000000000000",
      modelConfigId: "11111111-1111-4111-8111-111111111111",
      text: "你好，今天过得怎么样？",
    })).toMatchObject({ text: "你好，今天过得怎么样？" });
    expect(() => companionGenerateSchema.parse({ conversationId: "bad", modelConfigId: "bad", text: "" })).toThrow();
  });

  it("keeps launch exchange payloads opaque and bounded", () => {
    expect(companionExchangeSchema.parse({ ticket: "opaque-ticket" })).toEqual({ ticket: "opaque-ticket" });
    expect(() => companionExchangeSchema.parse({ ticket: "" })).toThrow();
    expect(companionConversationSchema.parse({})).toEqual({ title: "猫娘陪伴" });
  });

  it("uses a versioned fixed persona without credential material", () => {
    expect(COMPANION_PERSONA_VERSION).toBe("catgirl-v1");
    expect(COMPANION_SYSTEM_PROMPT).toContain(COMPANION_PERSONA_VERSION);
    expect(COMPANION_SYSTEM_PROMPT).not.toMatch(/api[_-]?key|bearer|token/i);
  });

  it("only grants runtime CORS to the configured AIRI origin", () => {
    const allowed = companionCorsHeaders(new Request("http://localhost:3000/api/companion/generate", { headers: { origin: "http://localhost:5173" } }));
    const denied = companionCorsHeaders(new Request("http://localhost:3000/api/companion/generate", { headers: { origin: "https://untrusted.example" } }));
    expect(allowed.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(denied.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
