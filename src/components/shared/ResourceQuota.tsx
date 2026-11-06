import type { Quota } from '@/data/types'
import { RESOURCES } from '@/lib/quota'
import { cn } from '@/lib/utils'
import { QuotaBar } from './QuotaBar'

interface Props {
  used: Quota
  total: Quota
  /** Extra amount to preview (a request), drawn lighter on top of `used`. */
  projected?: Quota
  compact?: boolean
  className?: string
}

export function ResourceQuota({ used, total, projected, compact, className }: Props) {
  return (
    <div className={cn('grid gap-4', compact ? 'grid-cols-1' : 'sm:grid-cols-2', className)}>
      {RESOURCES.map((r) => (
        <QuotaBar
          key={r.key}
          compact={compact}
          label={r.label}
          used={used[r.key]}
          total={total[r.key]}
          unit={r.unit === 'vCPU' || r.unit === 'GPUs' ? '' : r.unit}
          projected={projected?.[r.key]}
        />
      ))}
    </div>
  )
}
