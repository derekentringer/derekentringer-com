import { invoke } from "@tauri-apps/api/core";

const isTauri =
  typeof window !== "undefined" &&
  !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;

export async function getSecureItem(key: string): Promise<string | null> {
  if (!isTauri) return localStorage.getItem(key);
  return invoke<string | null>("get_secure_item", { key });
}

export async function setSecureItem(
  key: string,
  value: string,
): Promise<void> {
  if (!isTauri) {
    localStorage.setItem(key, value);
    return;
  }
  await invoke("set_secure_item", { key, value });
}

export async function removeSecureItem(key: string): Promise<void> {
  if (!isTauri) {
    localStorage.removeItem(key);
    return;
  }
  await invoke("remove_secure_item", { key });
}
