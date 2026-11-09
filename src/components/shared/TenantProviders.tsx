import { useAppStore } from '@/store/useAppStore'
import { isAllowedFor, AI_SERVICE_LABELS, PROVIDER_TYPE_LABELS } from '@/lib/providers'
import { cn } from '@/lib/utils'
import { Tag } from './StatusBadge'

/** Infrastructure providers a tenant may use. Access is set on each provider by the Super Admin. */
export function TenantProviders({ tenantId, className }: { tenantId: string; className?: string }) {
  const providers = useAppStore((s) => s.infraProviders).filter((p) => p.status === 'active' && isAllowedFor(p, tenantId))
  return (
    <section className={cn('card p-6', className)}>
      <h2 className="mb-1 font-heading text-h3 text-text-primary">Infrastructure providers</h2>
      <p className="mb-4 text-caption text-text-secondary">Where this organisation’s environments can run. The Super Admin sets access on each provider.</p>
      {providers.length === 0 ? (
        <p className="text-sm text-text-secondary">No providers are available yet.</p>
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
