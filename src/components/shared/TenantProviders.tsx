import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Ban, SlidersHorizontal } from 'lucide-react'
import type { ProviderApproval } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { providerBudget } from '@/lib/cost'
import { PROVIDER_TYPE_LABELS } from '@/lib/providers'
import { formatDate, formatInt } from '@/lib/format'
import { envPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/controls'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { QuotaBar } from './QuotaBar'
import { StatusBadge } from './StatusBadge'

/**
 * Approved providers for a tenant: regions, monthly cap, approval date and spend against the cap.
 * The Super Admin can adjust or revoke; everyone else sees it read-only.
 */
export function TenantProviders({ tenantId, className, manage = false, action }: { tenantId: string; className?: string; manage?: boolean; action?: React.ReactNode }) {
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === tenantId))
  const providers = useAppStore((s) => s.infraProviders)
  const catalog = useAppStore((s) => s.catalog)
  const environments = useAppStore((s) => s.environments)
  const users = useAppStore((s) => s.users)
  const [adjusting, setAdjusting] = useState<ProviderApproval | null>(null)
  const [revoking, setRevoking] = useState<ProviderApproval | null>(null)

  const rows = useMemo(() => {
    if (!tenant) return []
    return tenant.approvedProviders
      .filter((a) => a.status === 'approved' || a.migrateLater)
      .map((a) => ({ a, p: providers.find((x) => x.id === a.providerId), budget: providerBudget(tenant, a.providerId, environments, { providers, catalog }) }))
      .filter((r) => r.p)
  }, [tenant, providers, catalog, environments])

  if (!tenant) return null

  return (
    <section className={cn('card p-6', className)} aria-label="Approved providers">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 font-heading text-h3 text-text-primary">Approved providers</h2>
          <p className="text-caption text-text-secondary">Environments in {tenant.name} can only be requested on these, in the approved regions. Caps are monthly, in credits (₹).</p>
        </div>
        {action}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-text-secondary">No providers approved yet, so no one can request an environment.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-control border border-border">
          {rows.map(({ a, p, budget }) => {
            const revoked = a.status === 'revoked'
            return (
              <li key={a.providerId} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-text-primary">
                    {p!.name} <span className="font-mono text-xs font-normal text-text-muted">{p!.code}</span>
                    {revoked && <StatusBadge status="over-quota" label="Revoked · migrate later" />}
                  </p>
                  <p className="text-caption text-text-secondary">
                    {PROVIDER_TYPE_LABELS[p!.type]} · {p!.regions.filter((r) => a.regionIds.includes(r.id)).map((r) => `${r.name}${r.indiaResident ? '' : ' (outside India)'}`).join(', ')}
                  </p>
                  <p className="text-caption text-text-muted">
                    {revoked ? `Revoked ${formatDate(a.revokedAt!)}` : `Approved ${formatDate(a.approvedAt)} by ${users.find((u) => u.id === a.approvedById)?.name ?? 'the Super Admin'}`} · {formatInt(budget.mtd)} credits so far this month
                  </p>
                </div>
                {!revoked && (
                  <div className="w-full lg:w-72">
                    <QuotaBar compact label={`Monthly run rate vs cap`} used={budget.committed} total={budget.cap} unit="credits" />
                  </div>
                )}
                {manage && !revoked && (
                  <div className="flex shrink-0 gap-2">
                    <Button variant="secondary" size="compact" onClick={() => setAdjusting(a)}>
                      <SlidersHorizontal /> Adjust
                    </Button>
                    <Button variant="ghost" size="compact" className="text-red-text hover:text-red-text" onClick={() => setRevoking(a)}>
                      <Ban /> Revoke
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {manage && adjusting && <AdjustApprovalDialog tenantId={tenant.id} approval={adjusting} onClose={() => setAdjusting(null)} />}
      {manage && revoking && <RevokeDialog tenantId={tenant.id} approval={revoking} onClose={() => setRevoking(null)} />}
    </section>
  )
}

function AdjustApprovalDialog({ tenantId, approval, onClose }: { tenantId: string; approval: ProviderApproval; onClose: () => void }) {
  const provider = useAppStore((s) => s.infraProviders.find((p) => p.id === approval.providerId))!
  const adjust = useAppStore((s) => s.adjustProviderApproval)
  const [regionIds, setRegionIds] = useState(approval.regionIds)
  const [cap, setCap] = useState(String(approval.budgetCap))
  const [error, setError] = useState<string | null>(null)
  const save = () => {
    const res = adjust(tenantId, approval.providerId, { regionIds, budgetCap: Number(cap) })
    if (!res.ok) return setError(res.error)
    toast.success(`Updated ${provider.name} access.`)
    onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader title={`Adjust ${provider.name}`} description="Change the approved regions or the monthly budget cap." />
        <DialogBody className="flex flex-col gap-4">
          <Field label="Monthly budget cap (credits)" htmlFor="adj-cap" required>
            <Input id="adj-cap" type="number" min={1} step={5000} value={cap} onChange={(e) => { setCap(e.target.value); setError(null) }} />
          </Field>
          <Field label="Approved regions">
            <div className="flex flex-col gap-2">
              {provider.regions.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-3 text-sm">
                  <Checkbox checked={regionIds.includes(r.id)} onCheckedChange={(v) => { setRegionIds(v ? [...regionIds, r.id] : regionIds.filter((x) => x !== r.id)); setError(null) }} />
                  {r.name} <span className="text-caption text-text-muted">{r.indiaResident ? 'India' : 'Outside India'}</span>
                </label>
              ))}
            </div>
          </Field>
          {error && (
            <p className="rounded-control bg-status-rejected-bg px-3 py-2 text-caption text-status-rejected-fg" role="alert">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={save}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RevokeDialog({ tenantId, approval, onClose }: { tenantId: string; approval: ProviderApproval; onClose: () => void }) {
  const provider = useAppStore((s) => s.infraProviders.find((p) => p.id === approval.providerId))!
  const environments = useAppStore((s) => s.environments)
  const revoke = useAppStore((s) => s.revokeProviderAccess)
  const [comment, setComment] = useState('')
  const inUse = environments.filter((e) => e.tenantId === tenantId && e.spec.providerId === approval.providerId && !['terminated', 'provisioning_failed'].includes(e.status))
  const run = (migrateLater: boolean) => {
    const res = revoke(tenantId, approval.providerId, { migrateLater, comment })
    if (!res.ok) return toast.error(res.error)
    toast.success(migrateLater ? `Revoked ${provider.name}. ${inUse.length} environment${inUse.length === 1 ? ' is' : 's are'} flagged to move.` : `Revoked ${provider.name}.`)
    onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader
          title={`Revoke ${provider.name}?`}
          description={
            inUse.length
              ? `${inUse.length} environment${inUse.length === 1 ? '' : 's'} still use it, so it can’t simply be revoked. Choose “Migrate later” to revoke now and flag them to move.`
              : 'No environment uses it. New environments can’t be requested on it after this.'
          }
        />
        <DialogBody className="flex flex-col gap-4">
          {inUse.length > 0 && (
            <ul className="divide-y divide-border rounded-control border border-border" aria-label="Environments on this provider">
              {inUse.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <Link to={envPath('super_admin', e.id)} className="min-w-0 truncate text-sm font-semibold text-text-primary hover:text-indigo-text" onClick={onClose}>
                    {e.spec.name}
                  </Link>
                  <StatusBadge status={e.status} />
                </li>
              ))}
            </ul>
          )}
          <Field label="Note for the Tenant Admin" htmlFor="rv-note" helper="Optional">
            <Textarea id="rv-note" value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          {inUse.length ? (
            <Button variant="destructive" onClick={() => run(true)}>
              Revoke and migrate later
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => run(false)}>
              Revoke access
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Small tag for environments whose provider was revoked with "migrate later". */
export function MigrateBadge({ className }: { className?: string }) {
  return <StatusBadge status="over-quota" label="Provider revoked · migrate" className={className} />
}

