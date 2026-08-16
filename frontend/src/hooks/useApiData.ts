/**
 * useApiData — fetch with loading/error state, an abort guard, and a session
 * cache.
 *
 * The cache is what stops tab switching feeling broken: without it every panel
 * refetches on mount, so moving between sections blanks the screen and rebuilds
 * it even though the backend answers from its own lru_cache in milliseconds.
 * A revisit now paints the previous answer immediately and revalidates behind
 * it.
 *
 * `key` must be unique per endpoint. Deps alone are not enough — several
 * panels key on [ticker, freq] and would otherwise read each other's data.
 */

import { useState, useEffect, useCallback, useRef } from "react"

const cache = new Map<string, unknown>()

export interface ApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
  /** True only when there is nothing on screen yet — drives skeleton vs dim. */
  firstLoad: boolean
  reload: () => void
}

export function useApiData<T = any>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  key: string,
): ApiState<T> {
  const cacheKey = `${key}:${JSON.stringify(deps)}`
  const [data, setData] = useState<T | null>(() => (cache.get(cacheKey) as T) ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const acRef = useRef<AbortController | null>(null)

  const load = useCallback(() => {
    acRef.current?.abort()
    const ac = new AbortController()
    acRef.current = ac

    const hit = cache.get(cacheKey)
    if (hit !== undefined) setData(hit as T)

    setLoading(true)
    setError(null)

    fetcher(ac.signal)
      .then((result) => {
        if (ac.signal.aborted) return
        cache.set(cacheKey, result)
        setData(result)
      })
      .catch((err: Error) => {
        if (ac.signal.aborted || err.name === "AbortError") return
        setError(err.message || "Request failed")
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    // `fetcher` is intentionally excluded: callers pass a fresh arrow every
    // render, so including it would refetch forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  useEffect(() => {
    load()
    return () => acRef.current?.abort()
  }, [load])

  return { data, loading, error, firstLoad: loading && data === null, reload: load }
}

export default useApiData
