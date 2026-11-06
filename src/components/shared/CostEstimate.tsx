import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { CatalogItem, EnvSpec, Tenant } from '@/data/types'
import { checkQuota, estimateCost } from '@/lib/cost'
import { formatINR, formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CostBreakdown } from './CostBreakdown'
import { QuotaBar } from './QuotaBar'

interface Props {
  spec: EnvSpec
  tenant: Tenant
  catalog: CatalogItem[]
  className?: string
}

export function CostEstimate({ spec, tenant, catalog, className }: Props) {
  const est = estimateCost(spec, catalog)
  const quota = checkQuota(tenant, est)

  return (
    <aside className={cn('flex flex-col gap-5 rounded-card border border-border bg-bg-subtle p-5', className)} aria-label="Cost estimate" aria-live="polite">
      <div>
        <p className="eyebrow">Estimated cost</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="tabular font-heading text-kpi text-text-primary">{formatInt(est.credits)}</span>
          <span className="text-sm text-text-secondary">credits / month</span>
        </p>
        <p className="text-caption text-text-muted">About {formatINR(est.credits)} a month · {formatInt(est.gpuHours)} GPU-hours</p>
      </div>

      <CostBreakdown est={est} />

      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <p className="eyebrow">{tenant.name} this month</p>
        <QuotaBar compact label="Credits" used={tenant.creditsUsed} total={tenant.creditQuota} unit="" projected={est.credits} />
        <QuotaBar compact label="GPU-hours" used={tenant.gpuUsed} total={tenant.gpuQuota} unit="" projected={est.gpuHours} />
        <p className="text-caption text-text-muted">The lighter part of each bar shows this request.</p>
      </div>

      {quota.over ? (
        <div className="flex gap-2.5 rounded-control bg-status-over-bg p-3 text-status-over-fg" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="text-caption">
            <p className="font-semibold">Over quota</p>
            <p className="mt-0.5">{quota.message}</p>
            <p className="mt-1.5">You can still submit. Your admin will see the overage and may suggest changes.</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-2.5 rounded-control bg-status-running-bg p-3 text-status-running-fg" role="status">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-caption">
            Within quota. {formatInt(quota.creditsRemaining - est.credits)} credits would remain this month.
          </p>
        </div>
      )}
    </aside>
  )
}
