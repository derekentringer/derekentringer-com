/**
 * Secure storage abstraction.
 * - In Tauri: uses Stronghold encrypted vault via tauri-plugin-stronghold
 * - In browser (Vite dev): falls back to localStorage
 */

const isTauri = typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;

let storeInstance: import("@tauri-apps/plugin-stronghold").Store | null = null;
let strongholdRef: import("@tauri-apps/plugin-stronghold").Stronghold | null = null;

async function getStore() {
  if (storeInstance) return { store: storeInstance, stronghold: strongholdRef! };

  const { Stronghold } = await import("@tauri-apps/plugin-stronghold");
  const { appDataDir } = await import("@tauri-apps/api/path");

  const dataDir = await appDataDir();
  const vaultPath = `${dataDir}/notesync-keychain.hold`;

  const stronghold = await Stronghold.load(vaultPath, "");

  let client;
  try {
    client = await stronghold.loadClient("tokens");
  } catch {
    client = await stronghold.createClient("tokens");
  }

  storeInstance = client.getStore();
  strongholdRef = stronghold;
  return { store: storeInstance, stronghold };
}

export async function getSecureItem(key: string): Promise<string | null> {
  if (!isTauri) {
    return localStorage.getItem(key);
  }

  try {
    const { store } = await getStore();
    const value = await store.get(key);
    if (!value || value.length === 0) return null;
    return new TextDecoder().decode(value);
  } catch {
    return null;
  }
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (!isTauri) {
    localStorage.setItem(key, value);
    return;
  }

  try {
    const { store, stronghold } = await getStore();
    await store.insert(key, Array.from(new TextEncoder().encode(value)));
    await stronghold.save();
  } catch {
    // Fall back to localStorage if Stronghold fails
    localStorage.setItem(key, value);
  }
}

export async function removeSecureItem(key: string): Promise<void> {
  if (!isTauri) {
    localStorage.removeItem(key);
    return;
  }

  try {
    const { store, stronghold } = await getStore();
    await store.remove(key);
    await stronghold.save();
  } catch {
    localStorage.removeItem(key);
  }
}
