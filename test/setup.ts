import { beforeEach } from 'vitest'

// Minimal in-memory localStorage so src/lib/storage.ts runs under the node env
// without jsdom. storage.ts only ever touches localStorage inside functions, so
// installing it here (before any test calls them) is enough. emitWrite() no-ops
// because `window` is undefined in node — exactly the "merge bypasses the event"
// behavior the sync engine relies on.
class MemoryStorage {
  private store = new Map<string, string>()
  get length(): number {
    return this.store.size
  }
  clear(): void {
    this.store.clear()
  }
  getItem(key: string): string | null {
    const v = this.store.get(key)
    return v === undefined ? null : v
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

globalThis.localStorage = new MemoryStorage() as unknown as Storage

beforeEach(() => {
  localStorage.clear()
})
