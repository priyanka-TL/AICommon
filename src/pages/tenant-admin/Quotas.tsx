import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowUpRight, Save } from 'lucide-react'
import type { Quota } from '@/data/types'
import { useAppStore, useCurrentTenant } from '@/store/useAppStore'
import { useScopedProjects } from '@/store/selectors'
import { formatInt, relativeTime } from '@/lib/format'
import { addQuota, projectAllocated, RESOURCES, tenantAllocated, ZERO } from '@/lib/quota'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { SpendThisMonth } from '@/components/shared/SpendThisMonth'
import { ModelCosts } from '@/components/shared/ModelCosts'
import { ResourceQuota } from '@/components/shared/ResourceQuota'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'

type Draft = Record<string, Record<keyof Quota, string>>

export default function Quotas() {
  const tenant = useCurrentTenant()!
  const projects = useScopedProjects(false)
  const environments = useAppStore((s) => s.environments)
  const deployments = useAppStore((s) => s.deployments)
  const quotaRequests = useAppStore((s) => s.quotaRequests.filter((q) => q.tenantId === tenant.id))
  const usage = useAppStore((s) => s.usage)
  const updateProject = useAppStore((s) => s.updateProject)
  const requestIncrease = useAppStore((s) => s.requestQuotaIncrease)
  const [draft, setDraft] = useState<Draft>({})
  const [askOpen, setAskOpen] = useState(false)
  const [asked, setAsked] = useState<Record<keyof Quota, string>>({ vcpu: '', ramGb: '', gpus: '', storageGb: '' })
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const { hash } = useLocation()

  // Links to #model-costs (dashboard KPI, budget alerts) land on the Model Costs section.
  useEffect(() => {
    if (hash === '#model-costs') requestAnimationFrame(() => document.getElementById('model-costs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [hash])

  useEffect(() => {
    setDraft(Object.fromEntries(projects.map((p) => [p.id, Object.fromEntries(RESOURCES.map((r) => [r.key, String(p.limits[r.key])])) as Record<keyof Quota, string>])))
    // Reset only when the project list changes.
  }, [projects.length])

  const used = tenantAllocated(environments, tenant.id)
  const sums = projects.reduce((s, p) => addQuota(s, Object.fromEntries(RESOURCES.map((r) => [r.key, Number(draft[p.id]?.[r.key] ?? 0) || 0])) as unknown as Quota), ZERO)
  const overSplit = RESOURCES.filter((r) => sums[r.key] > tenant.quota[r.key])
  const pending = quotaRequests.find((q) => q.status === 'pending')
  const credits30 = usage.filter((u) => u.tenantId === tenant.id).reduce((s, u) => s + u.credits, 0)

  const save = () => {
    if (overSplit.length) return
    for (const p of projects) {
      const limits = Object.fromEntries(RESOURCES.map((r) => [r.key, Number(draft[p.id]?.[r.key] ?? 0) || 0])) as unknown as Quota
      if (RESOURCES.some((r) => limits[r.key] !== p.limits[r.key])) updateProject(p.id, { limits })
    }
    toast.success('Project limits saved.')
  }

  return (
    <>
      <PageHeader
        eyebrow={tenant.name}
        title="Quotas & Usage"
        description="Your tenant’s quota from the Super Admin, how much is in use, how it is split across projects, and what platform models cost."
        actions={
          <Button
            variant="secondary"
            disabled={!!pending}
            onClick={() => {
              setAsked({ vcpu: String(tenant.quota.vcpu), ramGb: String(tenant.quota.ramGb), gpus: String(tenant.quota.gpus), storageGb: String(tenant.quota.storageGb) })
              setReason('')
              setReasonError(null)
              setAskOpen(true)
            }}
          >
            <ArrowUpRight /> {pending ? 'Increase requested' : 'Request quota increase'}
          </Button>
        }
      />

      <section className="card p-6">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-h3 text-text-primary">Tenant quota</h2>
          <span className="tabular text-caption text-text-secondary">{formatInt(credits30)} credits used in the last 30 days</span>
        </div>
        <ResourceQuota used={used} total={tenant.quota} className="lg:grid-cols-4" />
      </section>

      <SpendThisMonth tenantId={tenant.id} className="mt-6" />

      <ModelCosts tenantId={tenant.id} className="mt-8" />

      <section className="card mt-6 p-6">
        <h2 className="mb-1 font-heading text-h3 text-text-primary">Split across projects</h2>
        <p className="mb-5 text-caption text-text-secondary">Requests over a project’s limit are flagged to reviewers. The split can’t add up to more than the tenant quota.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-caption text-text-secondary">
              <tr>
                <th className="pb-2 font-semibold">Project</th>
                {RESOURCES.map((r) => (
                  <th key={r.key} className="pb-2 font-semibold">
                    {r.label}
                    {r.unit === 'GB' ? ' (GB)' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {projects.map((p) => {
                const pu = projectAllocated(environments, p.id, deployments)
                return (
                  <tr key={p.id}>
                    <td className="py-3 pr-3 font-semibold text-text-primary">{p.name}</td>
                    {RESOURCES.map((r) => (
                      <td key={r.key} className="py-3 pr-3">
                        <Input
                          type="number"
                          min={0}
                          className="h-9 w-24"
                          value={draft[p.id]?.[r.key] ?? ''}
                          onChange={(e) => setDraft({ ...draft, [p.id]: { ...draft[p.id]!, [r.key]: e.target.value } })}
                          aria-label={`${p.name} ${r.label} limit`}
                        />
                        <span className="tabular mt-1 block text-caption text-text-muted">{formatInt(pu[r.key])} in use</span>
                      </td>
                    ))}
                  </tr>
                )
              })}
              <tr className="bg-bg-subtle">
                <td className="px-2 py-3 font-semibold text-text-primary">Total</td>
                {RESOURCES.map((r) => (
                  <td key={r.key} className={cn('tabular py-3 pr-3 font-semibold', sums[r.key] > tenant.quota[r.key] ? 'text-status-over-fg' : 'text-text-primary')}>
                    {formatInt(sums[r.key])} / {formatInt(tenant.quota[r.key])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {overSplit.length > 0 && (
          <p className="mt-3 text-caption text-red-text">The split is more than the tenant quota for {overSplit.map((r) => r.label).join(', ')}. Lower a project’s limit or request a quota increase.</p>
        )}
        <Button className="mt-4" onClick={save} disabled={overSplit.length > 0}>
          <Save /> Save project limits
        </Button>
      </section>

      <section className="card mt-6 p-6">
        <h2 className="mb-4 font-heading text-h3 text-text-primary">Quota requests</h2>
        {quotaRequests.length === 0 ? (
          <p className="text-sm text-text-secondary">You haven’t asked for a quota increase yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {quotaRequests.map((qr) => (
              <li key={qr.id} className="flex flex-wrap items-center gap-3 py-3">
                <StatusBadge status={qr.status === 'pending' ? 'escalated' : qr.status === 'approved' ? 'approved' : 'rejected'} label={qr.status === 'pending' ? 'With Super Admin' : qr.status === 'approved' ? 'Approved' : 'Rejected'} />
                <span className="min-w-0 flex-1 text-sm text-text-primary">
                  {RESOURCES.filter((r) => qr.requested[r.key] !== qr.current[r.key]).map((r) => `${r.label} ${formatInt(qr.current[r.key])} → ${formatInt(qr.requested[r.key])}`).join(' · ')}
                </span>
                <span className="text-caption text-text-muted">{relativeTime(qr.createdAt)}</span>
                {qr.comment && <p className="w-full text-caption text-text-secondary">Note: {qr.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={askOpen} onOpenChange={setAskOpen}>
        <DialogContent size="md">
          <DialogHeader title="Request a quota increase" description="The Super Admin reviews it. Your current quota stays until they decide." />
          <DialogBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              {RESOURCES.map((r) => (
                <Field key={r.key} label={`${r.label}${r.unit === 'GB' ? ' (GB)' : ''}`} htmlFor={`ask-${r.key}`} helper={`Now ${formatInt(tenant.quota[r.key])}`}>
                  <Input id={`ask-${r.key}`} type="number" min={0} value={asked[r.key]} onChange={(e) => setAsked({ ...asked, [r.key]: e.target.value })} />
                </Field>
              ))}
            </div>
            <Field label="Why do you need it?" htmlFor="ask-reason" required error={reasonError}>
              <Textarea id="ask-reason" value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(null) }} placeholder="For example: Two district pilots start in January and both need GPU environments." />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                const requested = Object.fromEntries(RESOURCES.map((r) => [r.key, Number(asked[r.key]) || 0])) as unknown as Quota
                if (!RESOURCES.some((r) => requested[r.key] > tenant.quota[r.key])) {
                  setReasonError('Ask for more of at least one resource.')
                  return
                }
                if (reason.trim().length < 10) {
                  setReasonError('Explain in a sentence why your teams need more.')
                  return
                }
                requestIncrease(requested, reason.trim())
                setAskOpen(false)
                toast.success('Quota increase requested.', { description: 'The Super Admin has been notified.' })
              }}
            >
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
