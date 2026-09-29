/**
 * A minimal bounded memo cache.
 *
 * Calendar navigation asks for the same days repeatedly (paging back and forth,
 * switching views), and a `DaySummary` is a pure function of its date, so
 * caching is safe. Entries are plain DTOs that callers must treat as immutable.
 */
export interface LruCache<T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
  clear(): void
  readonly size: number
}

export function createLruCache<T>(limit: number): LruCache<T> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`cache limit must be a positive integer, received ${limit}`)
  }

  const entries = new Map<string, T>()

  return {
    get(key) {
      const hit = entries.get(key)
      if (hit === undefined) return undefined
      // Refresh recency so hot keys survive eviction.
      entries.delete(key)
      entries.set(key, hit)
      return hit
    },
    set(key, value) {
      if (entries.has(key)) entries.delete(key)
      entries.set(key, value)
      while (entries.size > limit) {
        const oldest = entries.keys().next()
        if (oldest.done === true) break
        entries.delete(oldest.value)
      }
    },
    clear() {
      entries.clear()
    },
    get size() {
      return entries.size
    }
  }
}
