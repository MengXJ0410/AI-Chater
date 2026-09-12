import { describe, expect, it } from "vitest";
import { createTombstoneUsername, isDuplicateEntryError } from "@/server/security/account";
import { hashPassword, verifyPassword } from "@/server/security/auth";
import { deleteAccountSchema, normalizeUsername, passwordChangeSchema } from "@/shared/validators";

describe("account lifecycle helpers", () => {
  it("normalizes usernames without changing the public validation rules", () => {
    expect(normalizeUsername(" Demo_User ")).toBe("demo_user");
    expect(() => deleteAccountSchema.parse({ password: "short" })).toThrow();
    expect(passwordChangeSchema.parse({ currentPassword: "password123", newPassword: "new-password123" })).toMatchObject({
      currentPassword: "password123",
      newPassword: "new-password123",
    });
  });

  it("creates a unique database-safe tombstone username", () => {
    const tombstone = createTombstoneUsername("00000000-0000-0000-0000-000000000000");
    expect(tombstone).toBe("deleted_00000000-0000-0000-0000-000000000000");
    expect(tombstone.length).toBeLessThanOrEqual(64);
    expect(tombstone).toMatch(/^deleted_[0-9a-f-]{36}$/);
  });

  it("hashes passwords with a verifiable Argon2id hash", async () => {
    const hash = await hashPassword("password123");
    expect(hash).toContain("$argon2id$");
    await expect(verifyPassword(hash, "password123")).resolves.toBe(true);
    await expect(verifyPassword(hash, "wrong-password")).resolves.toBe(false);
  });

  it("recognizes MySQL duplicate-entry errors for concurrent registration", () => {
    const error = Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
    expect(isDuplicateEntryError(error)).toBe(true);
    expect(isDuplicateEntryError(new Error("other"))).toBe(false);
  });
});
