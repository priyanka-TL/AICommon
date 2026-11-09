import { AlertTriangle } from 'lucide-react'
import type { EnvRequest, EnvSpec, Environment, InfraProvider, Tenant, CatalogItem } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { budgetCheck, type BudgetCheck } from '@/lib/cost'
import { formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Inputs {
  providers: InfraProvider[]
  catalog: CatalogItem[]
  tenants: Tenant[]
  environments: Environment[]
}

/** Budget check for an environment request (new or change), against the tenant's approved cap. */
export function requestBudget(req: Pick<EnvRequest, 'spec' | 'tenantId' | 'kind' | 'envId' | 'previousSpec'>, d: Inputs, spec = req.spec) {
  const tenant = d.tenants.find((t) => t.id === req.tenantId)
  const changeOf = req.kind === 'change' && req.envId && req.previousSpec?.providerId === spec.providerId ? req.envId : undefined
  return budgetCheck(spec, req.kind === 'change' ? req.previousSpec : null, tenant, d.environments, { providers: d.providers, catalog: d.catalog }, changeOf)
}

export function useBudgetInputs(): Inputs {
  const providers = useAppStore((s) => s.infraProviders)
  const catalog = useAppStore((s) => s.catalog)
  const tenants = useAppStore((s) => s.tenants)
  const environments = useAppStore((s) => s.environments)
  return { providers, catalog, tenants, environments }
}

export function useSpecBudget(spec: EnvSpec, tenantId: string, editingEnvId?: string) {
  const d = useBudgetInputs()
  const tenant = d.tenants.find((t) => t.id === tenantId)
  const editing = editingEnvId ? d.environments.find((e) => e.id === editingEnvId) : undefined
  return budgetCheck(spec, editing?.spec, tenant, d.environments, { providers: d.providers, catalog: d.catalog }, editing && editing.spec.providerId === spec.providerId ? editing.id : undefined)
}

export function BudgetCapWarning({ check, audience, className }: { check: BudgetCheck | null; audience: 'requester' | 'reviewer'; className?: string }) {
  if (!check?.over) return null
  const after = check.committed + check.adds
  return (
    <div className={cn('flex gap-2.5 rounded-card bg-status-over-bg p-4 text-status-over-fg', className)} role="status">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="text-caption">
        <p className="font-semibold">Over budget cap</p>
        <p className="mt-0.5">
          This brings {check.providerName} to about {formatInt(after)} credits a month against a cap of {formatInt(check.cap)} ({formatInt(after - check.cap)} over).{' '}
          {audience === 'requester'
            ? 'You can still submit it; your Tenant Admin and the Super Admin will see the warning. Lower the instance size or count to stay within the cap.'
            : 'The Super Admin decides. They can approve it, ask for changes, or raise the cap on the tenant’s approved providers.'}
        </p>
      </div>
    </div>
  )
}
