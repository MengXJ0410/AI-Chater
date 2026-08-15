import { describe, expect, it } from "vitest";
import { clampAvatarCropPosition, getAvatarCropScale } from "@/lib/avatar-crop";
import { AVATAR_MAX_BYTES, getAvatarFileError, getAvatarInitial } from "@/lib/user-avatar";

describe("user avatar helpers", () => {
  it("uses the username initial when an avatar is unavailable", () => {
    expect(getAvatarInitial("alice")).toBe("A");
    expect(getAvatarInitial(" 猫娘 ")).toBe("猫");
    expect(getAvatarInitial(" ")).toBe("我");
  });

  it("accepts supported avatar images within the 2 MB limit", () => {
    expect(getAvatarFileError({ type: "image/webp", size: AVATAR_MAX_BYTES })).toBeNull();
    expect(getAvatarFileError({ type: "image/gif", size: 10 })).toBe("仅支持 JPG、PNG 或 WebP 图片。");
    expect(getAvatarFileError({ type: "image/png", size: 0 })).toBe("头像图片不能为空。");
    expect(getAvatarFileError({ type: "image/jpeg", size: AVATAR_MAX_BYTES + 1 })).toBe("头像图片不能超过 2 MB。");
  });
});

describe("avatar crop helpers", () => {
  it("scales the smaller image edge to cover the crop frame", () => {
    expect(getAvatarCropScale(400, 200, 280, 1)).toBe(1.4);
    expect(getAvatarCropScale(400, 200, 280, 2)).toBe(2.8);
  });

  it("keeps dragged images covering the entire crop frame", () => {
    expect(clampAvatarCropPosition({ x: 999, y: 20 }, 400, 200, 280, 1)).toEqual({ x: 140, y: 0 });
    expect(clampAvatarCropPosition({ x: -999, y: -20 }, 400, 200, 280, 1)).toEqual({ x: -140, y: 0 });
  });
});
