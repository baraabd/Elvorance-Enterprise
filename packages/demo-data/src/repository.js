/** Browser-local adapter. Never a server authority or a multi-device synchronization layer. */
export function createDemoRepository({ storage, key, seed, onUnavailable = () => {} }) {
  let available = true;
  const unavailable = () => {
    available = false;
    onUnavailable();
  };
  return {
    read() {
      try {
        const raw = storage.getItem(key);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved._version === 1 && Array.isArray(saved.clients)) return saved;
        }
      } catch {
        unavailable();
      }
      return seed();
    },
    write(next) {
      if (!available) return;
      storage.setItem(key, JSON.stringify(next));
    },
    latest(fallback) {
      if (!available) return fallback;
      try {
        const value = JSON.parse(storage.getItem(key) || 'null');
        return value?._version === 1 && value._revision > fallback._revision ? value : fallback;
      } catch {
        return fallback;
      }
    },
    get available() {
      return available;
    },
  };
}
