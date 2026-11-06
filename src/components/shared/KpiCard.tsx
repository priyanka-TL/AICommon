import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface KpiCardProps {
  label: string
  value: string
  icon?: LucideIcon
  trend?: { direction: 'up' | 'down' | 'flat'; text: string }
  loading?: boolean
  className?: string
}

export function KpiCard({ label, value, icon: Icon, trend, loading, className }: KpiCardProps) {
  return (
    <div className={cn('card flex flex-col gap-3 p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {Icon && (
          <span className="flex size-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-text">
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      {loading ? (
        <>
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-4 w-32" />
        </>
      ) : (
        <>
          <span className="tabular font-heading text-kpi text-text-primary">{value}</span>
          {trend && (
            <span className="flex items-center gap-1 text-caption text-text-secondary">
              {trend.direction === 'up' && <ArrowUpRight className="size-4 text-teal" aria-hidden />}
              {trend.direction === 'down' && <ArrowDownRight className="size-4 text-vermilion" aria-hidden />}
              {trend.text}
            </span>
          )}
        </>
      )}
    </div>
  )
}
