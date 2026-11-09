import type { CostBreakdown as Breakdown, CostLines } from '@/lib/cost'
import { formatDate, formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * The single cost breakdown. Wizard, request, environment, monitoring, quotas and
 * dashboards all render this, so the same inputs always read the same way.
 */
export function CostBreakdown({ est, title = 'Total per month', className, showSource = true }: { est: CostLines | Breakdown; title?: string; className?: string; showSource?: boolean }) {
  const rows: [string, number, boolean?][] = [
    ['Compute', est.compute],
    ['Storage', est.storage],
    ['Network egress', est.network],
    ['Model usage', est.models],
  ]
  const after: [string, number, string][] = [
    ['Platform fee', est.platformFee, ''],
    ['NGO discount', est.ngoDiscount, '−'],
    ['GST', est.gst, ''],
  ]
  const b = 'rateCard' in est ? est : null
  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="cost-breakdown">
      <dl className="flex flex-col gap-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-caption">
            <dt className="text-text-secondary">{label}</dt>
            <dd className="tabular font-semibold text-text-primary">{formatInt(value)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-1.5 text-caption">
          <dt className="text-text-secondary">Subtotal</dt>
          <dd className="tabular font-semibold text-text-primary">{formatInt(est.subtotal)}</dd>
        </div>
        {after.map(([label, value, sign]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-caption">
            <dt className="text-text-secondary">{label}</dt>
            <dd className="tabular font-semibold text-text-primary">
              {sign && value > 0 ? sign : ''}
              {formatInt(value)}
            </dd>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-2 text-sm">
          <dt className="font-semibold text-text-primary">{title}</dt>
          <dd className="tabular font-semibold text-text-primary">{formatInt(est.total)} credits</dd>
        </div>
      </dl>
      {showSource && b?.provider && b.rateCard && (
        <p className="text-caption text-text-muted">
          {b.provider.name}
          {b.region ? ` · ${b.region.name}` : ''} · rate card v{b.rateCard.version}, effective from {formatDate(b.rateCard.effectiveFrom)}
        </p>
      )}
    </div>
  )
}
