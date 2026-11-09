import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { CatalogItem, EnvSpec, Quota, Role, Tenant } from '@/data/types'
import { costBreakdown } from '@/lib/cost'
import { useCostContext } from '@/store/selectors'
import { allocationOf, checkQuota, quotaMessage, subQuota } from '@/lib/quota'
import { formatINR, formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CostBreakdown } from './CostBreakdown'
import { ResourceQuota } from './ResourceQuota'
import { BudgetCapWarning, useSpecBudget } from './BudgetCapWarning'

interface Props {
  spec: EnvSpec
  tenant: Tenant
  /** Resources the tenant already holds. */
  used: Quota
  /** When editing, the current spec; only the difference counts against quota. */
  previous?: EnvSpec | null
  catalog: CatalogItem[]
  audience: Role
  className?: string
  /** When editing, the environment being changed (its own cost isn't counted twice). */
  editingEnvId?: string
  /** Admin create: number of identical environments (quota and cost scale with it). */
  count?: number
  /** Admin create: no approval step, so the copy changes. */
  adminCreate?: boolean
}

export function CostEstimate({ spec, tenant, used, previous, catalog, audience, className, editingEnvId, count = 1, adminCreate }: Props) {
  const budget = useSpecBudget(spec, tenant.id, editingEnvId)
  const ctx = useCostContext(tenant.id)
  const est = costBreakdown(spec, { ...ctx, catalog })
  const alloc = allocationOf(spec)
  const n = Math.max(1, count)
  const extra = previous ? subQuota(alloc, allocationOf(previous)) : alloc
  const positive: Quota = { vcpu: Math.max(0, extra.vcpu) * n, ramGb: Math.max(0, extra.ramGb) * n, gpus: Math.max(0, extra.gpus) * n, storageGb: Math.max(0, extra.storageGb) * n }
  const quota = checkQuota(tenant.quota, used, positive)
  const message = adminCreate
    ? `${quotaMessage(quota.items, tenant.name, 'user')?.split('.')[0]}.${audience === 'tenant_admin' ? ' Escalate it to the Super Admin, or reduce the configuration.' : ' You can still create it with an override reason.'}`
    : quotaMessage(quota.items, tenant.name, audience)

  return (
    <aside className={cn('flex flex-col gap-5 rounded-card border border-border bg-bg-subtle p-5', className)} aria-label="Resources and estimated cost" aria-live="polite">
      <div>
        <p className="eyebrow">{previous ? 'Change in resources' : n > 1 ? `Resources, each of ${n} environments` : 'Resources'}</p>
        <p className="tabular mt-1 text-sm text-text-primary">
          <span className="font-heading text-h3">{alloc.vcpu}</span> vCPU · <span className="font-heading text-h3">{alloc.ramGb}</span> GB RAM
          {alloc.gpus > 0 && (
            <>
              {' '}
              · <span className="font-heading text-h3">{alloc.gpus}</span> GPU{alloc.gpus > 1 ? 's' : ''}
            </>
          )}{' '}
          · <span className="font-heading text-h3">{formatInt(alloc.storageGb)}</span> GB
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <p className="eyebrow">{tenant.name} quota</p>
        <ResourceQuota compact used={used} total={tenant.quota} projected={positive} />
        <p className="text-caption text-text-muted">The lighter part of each bar shows this request.</p>
      </div>

      {quota.over ? (
        <div className="flex gap-2.5 rounded-control bg-status-over-bg p-3 text-status-over-fg" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="text-caption">
            <p className="font-semibold">Over quota</p>
            <p className="mt-0.5">{message}</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-2.5 rounded-control bg-status-running-bg p-3 text-status-running-fg" role="status">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-caption">
            Within {tenant.name}’s quota. {adminCreate ? 'Created as soon as you confirm; no approval is needed.' : 'The Super Admin gives final approval for new infrastructure.'}
          </p>
        </div>
      )}

      <BudgetCapWarning check={budget} audience="requester" />

      <div className="border-t border-border pt-4">
        <p className="eyebrow">Estimated cost</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="tabular font-heading text-kpi text-text-primary">{formatInt(est.total)}</span>
          <span className="text-sm text-text-secondary">credits / month</span>
        </p>
        <p className="mb-3 text-caption text-text-muted">
          {formatINR(est.total)} a month incl. GST{est.gpuHours > 0 ? ` · ${formatInt(est.gpuHours)} GPU-hours` : ''}
          {n > 1 ? ` · per environment; ${formatInt(est.total * n)} credits a month for all ${n}` : ''}
        </p>
        <CostBreakdown est={est} />
      </div>
    </aside>
  )
}
