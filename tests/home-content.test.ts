import { describe, expect, it } from "vitest";
import { AI_TERMS, pickAiTerms } from "@/lib/ai-terms";
import { isHomeBackgroundFile, toHomeBackgroundUrl } from "@/lib/home-backgrounds";

describe("home background files", () => {
  it("accepts supported image extensions only", () => {
    expect(isHomeBackgroundFile("hero.webp")).toBe(true);
    expect(isHomeBackgroundFile("CAT.JPG")).toBe(true);
    expect(isHomeBackgroundFile("notes.md")).toBe(false);
  });

  it("encodes image file names in public URLs", () => {
    expect(toHomeBackgroundUrl("猫娘 01.webp")).toBe("/home-backgrounds/%E7%8C%AB%E5%A8%98%2001.webp");
  });
});

describe("AI term bubbles", () => {
  it("returns unique terms from the text library", () => {
    const terms = pickAiTerms(10, () => 0.5);
    expect(terms).toHaveLength(10);
    expect(new Set(terms).size).toBe(10);
    expect(terms.every((term) => AI_TERMS.includes(term))).toBe(true);
  });
});
