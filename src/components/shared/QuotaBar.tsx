import { cn } from '@/lib/utils'
import { formatInt } from '@/lib/format'

interface QuotaBarProps {
  label: string
  used: number
  total: number
  unit: string
  /** Additional amount to preview on top of `used` (e.g. a request estimate). */
  projected?: number
  compact?: boolean
  className?: string
}

export function quotaFill(pct: number) {
  if (pct > 95) return 'bg-vermilion'
  if (pct > 80) return 'bg-tangerine'
  return 'bg-indigo dark:bg-indigo-text'
}

export function QuotaBar({ label, used, total, unit, projected = 0, compact, className }: QuotaBarProps) {
  const pct = total > 0 ? (used / total) * 100 : 0
  const projectedPct = total > 0 ? Math.min(((used + projected) / total) * 100, 100) : 0
  const clamped = Math.min(pct, 100)
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn('font-semibold text-text-primary', compact ? 'text-caption' : 'text-sm')}>{label}</span>
        <span className="tabular text-caption text-text-secondary">
          <span className="font-semibold text-text-primary">{formatInt(used)}</span> of {formatInt(total)} {unit}
        </span>
      </div>
      <div
        className={cn('relative w-full overflow-hidden rounded-full bg-bg-subtle', compact ? 'h-1.5' : 'h-2.5')}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={used}
      >
        {projected > 0 && (
          <div
            className={cn('absolute inset-y-0 left-0 rounded-full opacity-35', quotaFill(projectedPct))}
            style={{ width: `${projectedPct}%` }}
          />
        )}
        <div className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-500', quotaFill(pct))} style={{ width: `${clamped}%` }} />
      </div>
      {!compact && (
        <span className="tabular text-caption text-text-muted">
          {pct >= 100 ? 'Quota used up' : `${formatInt(Math.max(total - used, 0))} ${unit} remaining · ${Math.round(pct)}% used`}
        </span>
      )}
    </div>
  )
}
