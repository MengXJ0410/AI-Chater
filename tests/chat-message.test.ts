import { describe, expect, it } from "vitest";
import { appendStreamText, getGenerationLabel, getMessageSide } from "@/client/chat-message";
import { textFromParts } from "@/shared/messages";

describe("chat message presentation", () => {
  it("keeps users on the right and assistants on the left", () => {
    expect(getMessageSide("user")).toBe("right");
    expect(getMessageSide("assistant")).toBe("left");
  });

  it("shows deterministic generation labels", () => {
    expect(getGenerationLabel("thinking")).toBe("思考中…");
    expect(getGenerationLabel("streaming")).toBe("对话生成中…");
    expect(getGenerationLabel("complete")).toBeNull();
    expect(getGenerationLabel("error")).toBe("生成失败，请重试");
  });

  it("preserves Markdown source while joining streamed chunks", () => {
    const markdown = appendStreamText(appendStreamText("## 标题\n\n", "| A | B |\n|---|---|\n"), "| 1 | 2 |\n\n```ts\nconst ok = true;\n```");
    expect(textFromParts([{ type: "text", text: markdown }])).toContain("## 标题");
    expect(textFromParts([{ type: "text", text: markdown }])).toContain("```ts");
  });
});
