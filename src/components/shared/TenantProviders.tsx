import { useAppStore } from '@/store/useAppStore'
import { providersFor, AI_SERVICE_LABELS, PROVIDER_TYPE_LABELS } from '@/lib/providers'
import { cn } from '@/lib/utils'
import { Tag } from './StatusBadge'

/** Infrastructure providers a tenant may use. Access is set on each provider by the Super Admin. */
export function TenantProviders({ tenantId, className, action }: { tenantId: string; className?: string; action?: React.ReactNode }) {
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === tenantId))
  const providers = providersFor(useAppStore((s) => s.infraProviders), tenant ?? { id: tenantId, providerIds: [] })
  return (
    <section className={cn('card p-6', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 font-heading text-h3 text-text-primary">Infrastructure providers</h2>
          <p className="text-caption text-text-secondary">Environments in this organisation can only be requested on these. The Super Admin chooses them.</p>
        </div>
        {action}
      </div>
      {providers.length === 0 ? (
        <p className="text-sm text-text-secondary">No providers chosen yet, so no one can request an environment.</p>
      ) : (
        <ul className="divide-y divide-border rounded-control border border-border">
          {providers.map((p) => (
            <li key={p.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-text-primary">
                  {p.name} <span className="font-mono text-xs font-normal text-text-muted">{p.code}</span>
                </p>
                <p className="text-caption text-text-secondary">
                  {PROVIDER_TYPE_LABELS[p.type]} · {p.regions.map((r) => `${r.name}${r.indiaResident ? '' : ' (outside India)'}`).join(', ')}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.aiServices.map((s) => (
                  <Tag key={s}>{AI_SERVICE_LABELS[s]}</Tag>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
