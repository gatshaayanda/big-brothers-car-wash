export type SavedFind = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  price?: number;
  type: "find" | "deal";
  category?: string;
  savedAt: string;
};

const STORAGE_KEY = "theplug-saved-finds-v1";
const CHANGE_EVENT = "theplug-saved-finds-changed";

export function readSavedFinds(): SavedFind[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is SavedFind =>
      !!item && typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      typeof item.description === "string" &&
      typeof item.imageUrl === "string" &&
      (item.type === "find" || item.type === "deal") &&
      (item.category === undefined || typeof item.category === "string") &&
      (item.price === undefined || (typeof item.price === "number" && Number.isFinite(item.price))) &&
      typeof item.savedAt === "string"
    );
  } catch {
    return [];
  }
}

function publish(items: SavedFind[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function isFindSaved(id: string) {
  return readSavedFinds().some(item => item.id === id);
}

export function toggleSavedFind(item: Omit<SavedFind, "savedAt">): boolean {
  const current = readSavedFinds();
  const exists = current.some(saved => saved.id === item.id);
  publish(exists ? current.filter(saved => saved.id !== item.id) : [{ ...item, savedAt: new Date().toISOString() }, ...current]);
  return !exists;
}

export function removeSavedFind(id: string) {
  publish(readSavedFinds().filter(item => item.id !== id));
}

export function savedFindsChangedEvent() {
  return CHANGE_EVENT;
}
