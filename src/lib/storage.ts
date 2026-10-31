/** Namespace for everything this app persists in localStorage. */
export const STORAGE_PREFIX = "openplan:";

/** The namespace used before the product was renamed. */
const LEGACY_STORAGE_PREFIX = "openmarkdown:";

/**
 * Re-namespaces preferences written before the rename. Values already stored
 * under the current prefix win, so a half-migrated store converges instead of
 * losing the newer value. Persistence is best-effort, so a storage that throws
 * (private mode, disabled cookies) leaves the app running with defaults.
 */
export function migrateLegacyStorageKeys(storage: Storage = localStorage): void {
  try {
    const legacyKeys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(LEGACY_STORAGE_PREFIX)) legacyKeys.push(key);
    }
    for (const legacyKey of legacyKeys) {
      const key = STORAGE_PREFIX + legacyKey.slice(LEGACY_STORAGE_PREFIX.length);
      const value = storage.getItem(legacyKey);
      if (value != null && storage.getItem(key) == null) storage.setItem(key, value);
      storage.removeItem(legacyKey);
    }
  } catch {
    // best-effort
  }
}
