import { useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { useMonthToDate, sumLines } from '@/hooks/useSpend'
import { formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CostBreakdown } from './CostBreakdown'

/** Month-to-date spend with the shared breakdown, for a tenant or a set of environments. */
export function SpendThisMonth({ tenantId, envIds, title = 'Spend this month', className }: { tenantId: string; envIds?: string[]; title?: string; className?: string }) {
  const providers = useAppStore((s) => s.infraProviders)
  const mtd = useMonthToDate()
  const rows = useMemo(() => mtd.filter((r) => r.env.tenantId === tenantId && (!envIds || envIds.includes(r.env.id))), [mtd, tenantId, envIds])
  const total = sumLines(rows)
  const byProvider = providers
    .map((p) => ({ p, total: rows.filter((r) => r.env.spec.providerId === p.id).reduce((s, r) => s + r.lines.total, 0) }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total)
  return (
    <section className={cn('card p-6', className)}>
      <h2 className="mb-1 font-heading text-h3 text-text-primary">{title}</h2>
      <p className="mb-4 text-caption text-text-secondary">Month to date, from each provider’s rate card</p>
      <div className="grid gap-6 md:grid-cols-2">
        <CostBreakdown est={total} title="Total this month" />
        <div>
          <p className="eyebrow mb-2">By provider</p>
          {byProvider.length === 0 ? (
            <p className="text-sm text-text-secondary">Nothing running this month yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-caption">
              {byProvider.map(({ p, total: t }) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span className="text-text-secondary">{p.name}</span>
                  <span className="tabular font-semibold text-text-primary">{formatInt(t)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
