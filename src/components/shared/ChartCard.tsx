import type { TooltipProps } from 'recharts'
import { cn } from '@/lib/utils'
import { formatInt } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'

interface ChartCardProps {
  title: string
  description?: string
  actions?: React.ReactNode
  loading?: boolean
  height?: number
  className?: string
  children: React.ReactNode
}

export function ChartCard({ title, description, actions, loading, height = 280, className, children }: ChartCardProps) {
  return (
    <section className={cn('card flex flex-col p-6', className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-h3 text-text-primary">{title}</h2>
          {description && <p className="mt-0.5 text-caption text-text-secondary">{description}</p>}
        </div>
        {actions}
      </header>
      <div style={{ height }} className="w-full min-w-0">
        {loading ? <Skeleton className="h-full w-full" /> : children}
      </div>
    </section>
  )
}

type ChartTooltipProps = TooltipProps<number, string> & {
  valueFormatter?: (v: number) => string
  labelFormatter?: (l: string) => string
}

export function ChartTooltip({ active, payload, label, valueFormatter = formatInt, labelFormatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-[160px] rounded-control border border-border bg-bg-surface px-3 py-2 shadow-pop">
      {label !== undefined && (
        <p className="mb-1.5 text-caption font-semibold text-text-primary">{labelFormatter ? labelFormatter(String(label)) : label}</p>
      )}
      <ul className="flex flex-col gap-1">
        {payload.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center justify-between gap-4 text-caption">
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
              {p.name}
            </span>
            <span className="tabular font-semibold text-text-primary">{valueFormatter(Number(p.value))}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-caption text-text-secondary">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  )
}
