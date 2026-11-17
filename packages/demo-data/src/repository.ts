/** Browser-only preview adapter. It is never a production data authority. */
export interface PreviewStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PreviewState {
  _version: number;
  _revision?: number;
  clients: unknown[];
}

export interface PreviewRepositoryOptions<T extends PreviewState> {
  storage: PreviewStorage;
  key: string;
  seed: () => T;
  onUnavailable?: () => void;
}

function isPreviewState(value: unknown): value is PreviewState {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_version' in value &&
    value._version === 1 &&
    'clients' in value &&
    Array.isArray(value.clients)
  );
}

export function createDemoRepository<T extends PreviewState>({
  storage,
  key,
  seed,
  onUnavailable = () => {},
}: PreviewRepositoryOptions<T>) {
  let available = true;
  const unavailable = () => {
    available = false;
    onUnavailable();
  };
  return {
    read(): T {
      try {
        const raw = storage.getItem(key);
        if (raw) {
          const saved: unknown = JSON.parse(raw);
          if (isPreviewState(saved)) return saved as T;
        }
      } catch {
        unavailable();
      }
      return seed();
    },
    write(next: T): void {
      if (!available) return;
      storage.setItem(key, JSON.stringify(next));
    },
    latest(fallback: T): T {
      if (!available) return fallback;
      try {
        const value: unknown = JSON.parse(storage.getItem(key) || 'null');
        if (
          isPreviewState(value) &&
          typeof value._revision === 'number' &&
          value._revision > (fallback._revision ?? 0)
        ) {
          return value as T;
        }
      } catch {
        return fallback;
      }
      return fallback;
    },
    get available(): boolean {
      return available;
    },
  };
}
