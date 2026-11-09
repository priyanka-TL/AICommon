import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Info } from 'lucide-react'
import type { DataClassification, ProviderRequest, ProviderWorkload } from '@/data/types'
import { useAppStore, useCurrentUser, type ProviderRequestInput } from '@/store/useAppStore'
import { latestRateCard } from '@/lib/cost'
import { DATA_CLASSES } from '@/lib/labels'
import { approvalFor, providersOfferedTo, WORKLOAD_LABELS } from '@/lib/providers'
import { formatDate, formatInt } from '@/lib/format'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/controls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const WORKLOADS = Object.keys(WORKLOAD_LABELS) as ProviderWorkload[]

/**
 * Ask for access to an infrastructure provider. A Tenant Admin's request goes to the Super Admin;
 * a User's goes to their Tenant Admin first. Also used to edit and resubmit after changes are requested.
 */
export function ProviderRequestDialog({
  open,
  onOpenChange,
  providerId,
  existing,
  onSent,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  providerId?: string
  existing?: ProviderRequest
  onSent?: (id: string) => void
}) {
  const user = useCurrentUser()!
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === user.tenantId))
  const providers = useAppStore((s) => s.infraProviders)
  const submit = useAppStore((s) => s.submitProviderRequest)
  const offered = tenant ? providersOfferedTo(providers, tenant.id).filter((p) => !approvalFor(tenant, p.id) || p.id === existing?.providerId) : []
  const [form, setForm] = useState<ProviderRequestInput>({ providerId: '', regionIds: [], justification: '', workloads: [], expectedMonthlySpend: 0, requestedCap: 0, dataClassification: 'internal' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (existing) {
      const { providerId: pid, regionIds, justification, workloads, expectedMonthlySpend, requestedCap, dataClassification } = existing
      setForm({ providerId: pid, regionIds: [...regionIds], justification, workloads: [...workloads], expectedMonthlySpend, requestedCap, dataClassification })
    } else {
      const pid = providerId ?? offered[0]?.id ?? ''
      const p = providers.find((x) => x.id === pid)
      setForm({ providerId: pid, regionIds: p?.regions.filter((r) => r.indiaResident).map((r) => r.id) ?? [], justification: '', workloads: [], expectedMonthlySpend: 50000, requestedCap: 75000, dataClassification: 'internal' })
    }
    // Reset each time the dialog opens.
  }, [open])

  const provider = providers.find((p) => p.id === form.providerId)
  const sensitive = form.dataClassification === 'personal' || form.dataClassification === 'children'
  const regions = (provider?.regions ?? []).filter((r) => !sensitive || r.indiaResident)
  const card = latestRateCard(provider)
  const up = (patch: Partial<ProviderRequestInput>) => {
    setForm((f) => ({ ...f, ...patch }))
    setError(null)
  }
  const isTa = user.role === 'tenant_admin'

  const send = () => {
    const res = submit(form, existing?.id)
    if (!res.ok) return setError(res.error)
    toast.success(existing ? 'Request sent again.' : isTa ? `Asked the Super Admin for ${provider?.name}.` : `Asked your Tenant Admin to enable ${provider?.name}.`, {
      description: isTa ? 'The Super Admin reviews it and sets the budget cap.' : 'They can forward it to the Super Admin.',
    })
    onSent?.(res.id!)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={existing ? 'Edit and resubmit provider request' : isTa ? 'Request provider access' : 'Ask your admin to enable a provider'}
          description={isTa ? 'The Super Admin reviews it, sets the regions and a monthly budget cap, and approves it.' : `${tenant?.name ?? 'Your'} Tenant Admin reviews it first and can forward it to the Super Admin.`}
        />
        <DialogBody className="flex max-h-[66vh] flex-col gap-5 overflow-y-auto">
          <Field label="Provider" required>
            <Select
              value={form.providerId}
              disabled={!!existing}
              onValueChange={(v) => {
                const p = providers.find((x) => x.id === v)
                up({ providerId: v, regionIds: (p?.regions ?? []).filter((r) => r.indiaResident).map((r) => r.id) })
              }}
            >
              <SelectTrigger aria-label="Provider">
                <SelectValue placeholder="Choose a provider" />
              </SelectTrigger>
              <SelectContent>
                {offered.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {card && (
            <p className="-mt-3 text-caption text-text-muted">
              Rate card v{card.version}, effective from {formatDate(card.effectiveFrom)}: from ₹{formatInt(Math.min(...card.instanceTypes.map((i) => i.hourlyRate)))} an hour, storage ₹{card.storageRate} per GB-month.
            </p>
          )}

          <Field label="Data classification" required>
            <Select
              value={form.dataClassification}
              onValueChange={(v) => {
                const d = v as DataClassification
                const sens = d === 'personal' || d === 'children'
                up({ dataClassification: d, regionIds: sens ? form.regionIds.filter((rid) => provider?.regions.find((r) => r.id === rid)?.indiaResident) : form.regionIds })
              }}
            >
              <SelectTrigger aria-label="Data classification">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATA_CLASSES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Regions" required>
            {sensitive && (
              <p className="mb-2 flex gap-2 rounded-control bg-status-change-bg px-3 py-2 text-caption text-status-change-fg">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                {form.dataClassification === 'children' ? 'Children’s' : 'Personal'} data must stay in India, so only India-resident regions are shown.
              </p>
            )}
            <div role="group" aria-label="Regions" className="flex flex-wrap gap-x-6 gap-y-2">
              {regions.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                  <Checkbox checked={form.regionIds.includes(r.id)} onCheckedChange={(v) => up({ regionIds: v ? [...form.regionIds, r.id] : form.regionIds.filter((x) => x !== r.id) })} aria-label={r.name} />
                  {r.name}
                  {!r.indiaResident && <span className="text-caption text-text-muted">outside India</span>}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Expected workloads" required>
            <div role="group" aria-label="Expected workloads" className="flex flex-wrap gap-x-6 gap-y-2">
              {WORKLOADS.map((w) => (
                <label key={w} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                  <Checkbox checked={form.workloads.includes(w)} onCheckedChange={(v) => up({ workloads: v ? [...form.workloads, w] : form.workloads.filter((x) => x !== w) })} aria-label={WORKLOAD_LABELS[w]} />
                  {WORKLOAD_LABELS[w]}
                </label>
              ))}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Expected monthly spend (₹)" htmlFor="pr-spend" required>
              <Input id="pr-spend" type="number" min={0} step={5000} value={form.expectedMonthlySpend} onChange={(e) => up({ expectedMonthlySpend: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Requested budget cap (₹ a month)" htmlFor="pr-cap" required helper="Requests that would go over it are flagged to reviewers.">
              <Input id="pr-cap" type="number" min={1} step={5000} value={form.requestedCap} onChange={(e) => up({ requestedCap: Number(e.target.value) || 0 })} />
            </Field>
          </div>

          <Field label="Why does your organisation need this provider?" htmlFor="pr-why" required>
            <Textarea id="pr-why" value={form.justification} onChange={(e) => up({ justification: e.target.value })} placeholder="For example: A100s for speech fine-tuning, cheaper than our current provider, data stays in Mumbai." />
          </Field>
        </DialogBody>
        {error && (
          <p className="mx-6 mb-2 rounded-control bg-status-rejected-bg px-3 py-2 text-caption text-status-rejected-fg" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={send} disabled={!offered.length}>
            {existing ? 'Resubmit request' : isTa ? 'Send to Super Admin' : 'Send to my admin'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
