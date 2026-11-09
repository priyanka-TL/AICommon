import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, Cloud, Plus } from 'lucide-react'
import { useAppStore, useCurrentTenant } from '@/store/useAppStore'
import { latestRateCard } from '@/lib/cost'
import { approvalFor, indiaResidency, PROVIDER_TYPE_LABELS, providersOfferedTo } from '@/lib/providers'
import { formatDate, formatInt, relativeTime } from '@/lib/format'
import { providerRequestPath } from '@/lib/paths'
import { PageHeader } from '@/components/layout/PageHeader'
import { TenantProviders } from '@/components/shared/TenantProviders'
import { ProviderRequestDialog } from '@/components/shared/ProviderRequestDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { ProviderRequestBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { ProviderMark } from '@/pages/super-admin/ProviderEditors'

const OPEN = ['submitted', 'under_review', 'escalated', 'changes_requested', 'resubmitted']

export default function TenantInfraProviders() {
  const tenant = useCurrentTenant()!
  const providers = useAppStore((s) => s.infraProviders)
  const requests = useAppStore((s) => s.providerRequests.filter((r) => r.tenantId === tenant.id))
  const users = useAppStore((s) => s.users)
  const navigate = useNavigate()
  const [asking, setAsking] = useState<string | undefined>()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const others = providersOfferedTo(providers, tenant.id).filter((p) => !approvalFor(tenant, p.id))
  const inProgress = requests.filter((r) => OPEN.includes(r.status))
  const pendingFor = (pid: string) => inProgress.find((r) => r.providerId === pid)

  const ask = (pid?: string) => {
    setAsking(pid)
    setOpen(true)
  }

  return (
    <>
      <PageHeader
        eyebrow={tenant.name}
        title="Infrastructure Providers"
        description="Where your environments can run, the monthly budget cap on each, and other providers you can ask the Super Admin for."
        actions={
          <Button onClick={() => ask(others.find((p) => !pendingFor(p.id))?.id)} disabled={!others.some((p) => !pendingFor(p.id))}>
            <Plus /> Request access
          </Button>
        }
      />

      <TenantProviders tenantId={tenant.id} />

      {inProgress.length > 0 && (
        <section className="card mt-6 p-6">
          <h2 className="mb-4 font-heading text-h3 text-text-primary">Requests in progress</h2>
          <ul className="divide-y divide-border rounded-control border border-border">
            {inProgress.map((r) => (
              <li key={r.id}>
                <Link to={providerRequestPath('tenant_admin', r.id)} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg-subtle">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-text-primary">{providers.find((p) => p.id === r.providerId)?.name} access</span>
                    <span className="text-caption text-text-muted">
                      {users.find((u) => u.id === r.requesterId)?.name} · {relativeTime(r.updatedAt)} · cap asked ₹{formatInt(r.requestedCap)}
                    </span>
                  </span>
                  <ProviderRequestBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-3 font-heading text-h2 text-text-primary">Other providers</h2>
        {others.length === 0 ? (
          <div className="card">
            <EmptyState icon={Cloud} title="Every available provider is already approved" />
          </div>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {others.map((p) => {
              const card = latestRateCard(p)
              const pending = pendingFor(p.id)
              const isOpen = expanded === p.id
              return (
                <li key={p.id} className="card flex flex-col gap-3 p-5">
                  <div className="flex items-start gap-3">
                    <ProviderMark provider={p} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-text-primary">{p.name}</p>
                      <p className="text-caption text-text-secondary">
                        {PROVIDER_TYPE_LABELS[p.type]} · India residency: {indiaResidency(p)}
                      </p>
                      <p className="text-caption text-text-muted">{p.regions.map((r) => r.name).join(', ')}</p>
                    </div>
                  </div>
                  {card && (
                    <div>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setExpanded(isOpen ? null : p.id)}
                        className="flex items-center gap-1 text-caption font-semibold text-indigo-text"
                      >
                        <ChevronDown className={isOpen ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'} aria-hidden /> Rate card v{card.version}, effective from {formatDate(card.effectiveFrom)}
                      </button>
                      {isOpen && (
                        <div className="mt-2 rounded-control bg-bg-subtle p-3">
                          <ul className="flex flex-col gap-1 text-caption">
                            {card.instanceTypes.map((i) => (
                              <li key={i.id} className="flex justify-between gap-3">
                                <span className="text-text-secondary">
                                  {i.name} · {i.gpuType === 'none' ? 'CPU' : `${i.gpuCount}× ${i.gpuType}`}
                                </span>
                                <span className="tabular font-semibold text-text-primary">₹{formatInt(i.hourlyRate)}/h</span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-caption text-text-muted">
                            Storage ₹{card.storageRate}/GB-month · egress ₹{card.egressRate}/GB · fee {card.platformFeePct}% · NGO discount {card.ngoDiscountPct}% · GST {card.gstPct}% · {card.source}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
                    {pending ? (
                      <>
                        <ProviderRequestBadge status={pending.status} />
                        <Button variant="ghost" size="compact" onClick={() => navigate(providerRequestPath('tenant_admin', pending.id))}>
                          View request
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-caption text-text-muted">Not approved for {tenant.name}</span>
                        <Button variant="secondary" size="compact" onClick={() => ask(p.id)} aria-label={`Request access to ${p.name}`}>
                          Request access
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <ProviderRequestDialog open={open} onOpenChange={setOpen} providerId={asking} onSent={(id) => navigate(providerRequestPath('tenant_admin', id))} />
    </>
  )
}
