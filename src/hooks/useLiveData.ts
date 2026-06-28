import { useMemo, type DependencyList } from 'react'
import { useLocation } from 'react-router-dom'
import { useSyncStore } from '../store/syncStore'

// Finding L8: every data-display page re-implemented "read from the storage seam,
// recompute on navigation + after a background sync" as
//   useMemo(() => getX(), [location.key, dataVersion])
// each guarded by its own eslint-disable, with subtly inconsistent dep arrays.
// useLiveData centralizes the pattern so the dependency set is uniform and the
// single eslint-disable lives here.

/**
 * Reads derived data from the storage layer and recomputes it on navigation
 * (location.key) and after a background sync merges remote data (dataVersion),
 * plus any page-local `extraDeps` (e.g. a manual `rev` bump after a mutation).
 *
 * `read` closes over non-reactive storage getters, so they intentionally are not
 * — and cannot be — dependencies; the keys below are the real invalidators.
 */
export function useLiveData<T>(read: () => T, extraDeps: DependencyList = []): T {
  const location = useLocation()
  const dataVersion = useSyncStore((s) => s.dataVersion)
  // The dep set is built from a spread (not a literal) and `read` is intentionally
  // excluded, so both hook lint rules are disabled for this single line.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  return useMemo(read, [location.key, dataVersion, ...extraDeps])
}
