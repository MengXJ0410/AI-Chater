import type { PetKind, PetPreferences } from "./types";

export const PET_STORAGE_KEY = "ai-chater-pet-v1";
export const PET_CHANGE_EVENT = "ai-chater:pet-change";

export const defaultPetPreferences: PetPreferences = {
  kind: null,
  activity: 70,
  chaseCursor: true,
};

export function isPetKind(value: unknown): value is PetKind {
  return value === "spider";
}

function numberOf(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
}

export function parsePetPreferences(value: string | null): PetPreferences {
  if (!value) return { ...defaultPetPreferences };
  try {
    const candidate: unknown = JSON.parse(value);
    if (!candidate || typeof candidate !== "object") return { ...defaultPetPreferences };
    const record = candidate as Record<string, unknown>;
    return {
      kind: isPetKind(record.kind) ? record.kind : null,
      activity: numberOf(record.activity, defaultPetPreferences.activity, 0, 200),
      chaseCursor: typeof record.chaseCursor === "boolean" ? record.chaseCursor : defaultPetPreferences.chaseCursor,
    };
  } catch {
    return { ...defaultPetPreferences };
  }
}

export function savePetPreferences(preferences: PetPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PET_STORAGE_KEY, JSON.stringify(preferences));
}

export function dispatchPetChange(preferences: PetPreferences): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PetPreferences>(PET_CHANGE_EVENT, { detail: preferences }));
}
