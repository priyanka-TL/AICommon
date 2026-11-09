import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Role } from '@/data/types'
import { statusOptions, type AnyStatus, type RequestFilters, type SortKey, type TypeFilter } from '@/lib/requestItems'

const TYPES: TypeFilter[] = ['all', 'environment', 'capability', 'provider']
const SORTS: SortKey[] = ['updated', 'submitted', 'status']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Request-list filters, kept in the URL query string so a view can be shared or bookmarked. */
export function useRequestFilters(role: Role) {
  const [params, setParams] = useSearchParams()

  const filters: RequestFilters = useMemo(() => {
    const t = params.get('type') as TypeFilter
    const type = TYPES.includes(t) ? t : 'all'
    const valid = new Set(statusOptions(type, role).map((o) => o.value))
    const s = params.get('sort') as SortKey
    const date = (k: string) => (DATE_RE.test(params.get(k) ?? '') ? params.get(k)! : '')
    return {
      type,
      statuses: (params.get('status') ?? '').split(',').filter((x): x is AnyStatus => valid.has(x as AnyStatus)),
      project: type === 'capability' || type === 'provider' ? '' : (params.get('project') ?? ''),
      from: date('from'),
      to: date('to'),
      q: params.get('q') ?? '',
      sort: SORTS.includes(s) ? s : 'updated',
    }
  }, [params, role])

  const update = useCallback(
    (patch: Partial<RequestFilters>, opts?: { replace?: boolean }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          const merged = { ...filters, ...patch }
          if (patch.type !== undefined) {
            const valid = new Set(statusOptions(merged.type, role).map((o) => o.value))
            merged.statuses = merged.statuses.filter((x) => valid.has(x))
            if (merged.type === 'capability' || merged.type === 'provider') merged.project = ''
          }
          const put = (k: string, v: string, def = '') => (v && v !== def ? next.set(k, v) : next.delete(k))
          put('type', merged.type, 'all')
          put('status', merged.statuses.join(','))
          put('project', merged.project)
          put('from', merged.from)
          put('to', merged.to)
          put('q', merged.q)
          put('sort', merged.sort, 'updated')
          return next
        },
        { replace: opts?.replace },
      )
    },
    [filters, role, setParams],
  )

  const clear = useCallback(() => update({ statuses: [], project: '', from: '', to: '', q: '' }), [update])
  const active = !!(filters.statuses.length || filters.project || filters.from || filters.to || filters.q.trim())

  return { filters, update, clear, active }
}
