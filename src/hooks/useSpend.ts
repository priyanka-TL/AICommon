import { useMemo } from 'react'
import type { Environment } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { addLines, monthStart, spendBetween, ZERO_COST, type CostLines } from '@/lib/cost'

export interface EnvSpend {
  env: Environment
  lines: CostLines
}

/** Spend per environment between two instants, from the shared cost engine. */
export function useEnvSpend(from: number, to: number): EnvSpend[] {
  const environments = useAppStore((s) => s.environments)
  const providers = useAppStore((s) => s.infraProviders)
  const tenants = useAppStore((s) => s.tenants)
  const catalog = useAppStore((s) => s.catalog)
  return useMemo(
    () => environments.map((env) => ({ env, lines: spendBetween(env, from, to, { providers, catalog, tenant: tenants.find((t) => t.id === env.tenantId) }) })),
    [environments, providers, tenants, catalog, from, to],
  )
}

/** Month-to-date spend per environment. */
export function useMonthToDate() {
  // Recompute at most once a minute; the boundaries only need minute precision.
  const minute = Math.floor(Date.now() / 60_000)
  const from = useMemo(() => monthStart(), [minute])
  const to = useMemo(() => minute * 60_000, [minute])
  return useEnvSpend(from, to)
}

export const sumLines = (rows: EnvSpend[]) => rows.reduce((s, r) => addLines(s, r.lines), { ...ZERO_COST })

/** The last `n` calendar months (oldest first), with their start and end instants. */
export function lastMonths(n: number) {
  const out: { key: string; label: string; from: number; to: number }[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
    out.push({ key: `${d.getFullYear()}-${d.getMonth() + 1}`, label: d.toLocaleString('en-IN', { month: 'short', year: 'numeric' }), from: d.getTime(), to: Math.min(end, Date.now()) })
  }
  return out
}
