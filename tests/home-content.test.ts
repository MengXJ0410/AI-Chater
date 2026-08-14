import { describe, expect, it } from "vitest";
import { AI_TERMS, pickAiTerms } from "@/lib/ai-terms";
import { isHomeBackgroundFile, toHomeBackgroundUrl } from "@/lib/home-backgrounds";
import { clampHomePageIndex, getHomePageIndexFromScroll, nextHomePageIndex } from "@/lib/home-sections";

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

describe("home page navigation", () => {
  it("moves one page per wheel direction and clamps the ends", () => {
    expect(nextHomePageIndex(0, -120)).toBe(0);
    expect(nextHomePageIndex(0, 120)).toBe(1);
    expect(nextHomePageIndex(1, -120)).toBe(0);
    expect(nextHomePageIndex(1, 120)).toBe(2);
    expect(nextHomePageIndex(2, 120)).toBe(2);
  });

  it("keeps page indexes and scroll measurements within the three-page range", () => {
    expect(clampHomePageIndex(-4)).toBe(0);
    expect(clampHomePageIndex(99)).toBe(2);
    expect(getHomePageIndexFromScroll(0, 900)).toBe(0);
    expect(getHomePageIndexFromScroll(901, 900)).toBe(1);
    expect(getHomePageIndexFromScroll(2400, 900)).toBe(2);
    expect(getHomePageIndexFromScroll(100, 0)).toBe(0);
  });
});
