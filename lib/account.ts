import { randomUUID } from "crypto";

export function createTombstoneUsername(id = randomUUID()) {
  return `deleted_${id}`;
}

export function isDuplicateEntryError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ER_DUP_ENTRY";
}
