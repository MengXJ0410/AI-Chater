import { afterEach, describe, expect, it } from "vitest";
import { validateImage } from "@/server/services/uploads";

const originalLimit = process.env.MAX_UPLOAD_BYTES;

afterEach(() => {
  if (originalLimit === undefined) delete process.env.MAX_UPLOAD_BYTES;
  else process.env.MAX_UPLOAD_BYTES = originalLimit;
});

describe("image upload validation", () => {
  it("accepts supported image types", () => {
    const file = new File([new Uint8Array([1])], "image.png", { type: "image/png" });
    expect(validateImage(file)).toBe("png");
  });

  it("rejects unsupported and oversized files", () => {
    expect(() => validateImage(new File(["x"], "file.txt", { type: "text/plain" }))).toThrow("仅支持");
    process.env.MAX_UPLOAD_BYTES = "1";
    expect(() => validateImage(new File([new Uint8Array([1, 2])], "image.png", { type: "image/png" }))).toThrow("超过");
  });
});
