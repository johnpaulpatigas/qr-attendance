/**
 * Multi-platform safe storage utility for Web and Capacitor Android/iOS.
 * Handles localStorage quota limits, WebView exceptions, and provides in-memory fallback.
 */

class MemoryStorageFallback {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  getAllKeys(): string[] {
    return Array.from(this.store.keys());
  }
}

const memoryFallback = new MemoryStorageFallback();

export const AppStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch {
      // localStorage might be disabled or restricted in Android WebView
    }
    return memoryFallback.getItem(key);
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
        return;
      }
    } catch {
      // Quota exceeded or WebView restriction
    }
    memoryFallback.setItem(key, value);
  },

  removeItem(key: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
        return;
      }
    } catch {
      // Ignore
    }
    memoryFallback.removeItem(key);
  },

  clear(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
    } catch {
      // Ignore
    }
    memoryFallback.clear();
  },

  getJSON<T>(key: string, defaultValue: T): T {
    const raw = this.getItem(key);
    if (!raw) return defaultValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  },

  setJSON<T>(key: string, value: T): void {
    try {
      this.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore
    }
  },

  findKeysStartingWith(prefix: string): string[] {
    const keys = new Set<string>();
    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) {
            keys.add(k);
          }
        }
      }
    } catch {
      // Ignore
    }
    for (const k of memoryFallback.getAllKeys()) {
      if (k.startsWith(prefix)) {
        keys.add(k);
      }
    }
    return Array.from(keys);
  },
};

/**
 * Executes a Promise or PromiseLike with a strict timeout.
 * Prevents hanging network requests when Android device is disconnected or on spotty signal.
 */
export async function withNetworkTimeout<T>(
  promise: PromiseLike<T> | Promise<T>,
  timeoutMs: number = 3500,
  fallbackValue?: T
): Promise<T> {
  let timer: NodeJS.Timeout | number | undefined;

  const timeoutPromise = new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      if (fallbackValue !== undefined) {
        resolve(fallbackValue);
      } else {
        reject(new Error('Network request timed out'));
      }
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([Promise.resolve(promise), timeoutPromise]);
    if (timer !== undefined) clearTimeout(timer as NodeJS.Timeout);
    return result;
  } catch (err) {
    if (timer !== undefined) clearTimeout(timer as NodeJS.Timeout);
    if (fallbackValue !== undefined) {
      return fallbackValue;
    }
    throw err;
  }
}
