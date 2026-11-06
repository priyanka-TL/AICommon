import type { CostEstimate } from '@/lib/cost'
import { formatInt } from '@/lib/format'

export function CostBreakdown({ est }: { est: CostEstimate }) {
  const rows: [string, number][] = [
    ['Compute', est.compute],
    ['Language models', est.llm],
    ['Speech recognition', est.asr],
    ['Capabilities', est.capabilities],
    ['Storage', est.storage],
  ]
  return (
    <dl className="flex flex-col gap-1.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 text-caption">
          <dt className="text-text-secondary">{label}</dt>
          <dd className="tabular font-semibold text-text-primary">{formatInt(value)}</dd>
        </div>
      ))}
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-2 text-sm">
        <dt className="font-semibold text-text-primary">Total per month</dt>
        <dd className="tabular font-semibold text-text-primary">{formatInt(est.credits)} credits</dd>
      </div>
    </dl>
  )
}
