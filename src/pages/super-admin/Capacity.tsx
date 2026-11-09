import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import type { Quota } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useVisibleTenants } from '@/store/selectors'
import { formatInt } from '@/lib/format'
import { addQuota, RESOURCES, tenantAllocated, usagePct, ZERO } from '@/lib/quota'
import { PageHeader } from '@/components/layout/PageHeader'
import { QuotaBar } from '@/components/shared/QuotaBar'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'

export default function Capacity() {
  const capacity = useAppStore((s) => s.capacity)
  const environments = useAppStore((s) => s.environments)
  const setCapacity = useAppStore((s) => s.setCapacity)
  const providerGpuMax = useAppStore((s) => s.infraProviders.filter((p) => p.status === 'active').reduce((n, p) => n + p.maxGpus, 0))
  const tenants = useVisibleTenants(true)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<keyof Quota, string>>({ vcpu: '', ramGb: '', gpus: '', storageGb: '' })
  const [error, setError] = useState<string | null>(null)

  const promised = tenants.reduce((s, t) => addQuota(s, t.quota), ZERO)
  const allocated = tenants.reduce((s, t) => addQuota(s, tenantAllocated(environments, t.id)), ZERO)

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Platform capacity"
        description="Hardware in the shared pool, how much is promised to tenants as quota, and how much environments actually hold."
        actions={
          <Button
            onClick={() => {
              setDraft({ vcpu: String(capacity.vcpu), ramGb: String(capacity.ramGb), gpus: String(capacity.gpus), storageGb: String(capacity.storageGb) })
              setError(null)
              setOpen(true)
            }}
          >
            <Pencil /> Edit capacity
          </Button>
        }
      />

      <p className="mb-4 text-caption text-text-secondary">
        GPUs are also capped per provider: {formatInt(providerGpuMax)} across all active infrastructure providers.{' '}
        <Link to="/super-admin/infra-providers" className="link">
          See Infrastructure Providers
        </Link>
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {RESOURCES.map((r) => (
          <section key={r.key} className="card flex flex-col gap-4 p-5">
            <div>
              <p className="eyebrow">{r.label}</p>
              <p className="tabular mt-1 font-heading text-kpi text-text-primary">{formatInt(capacity[r.key])}</p>
              <p className="text-caption text-text-secondary">{r.unit} in the pool</p>
            </div>
            <QuotaBar compact label="In use by environments" used={allocated[r.key]} total={capacity[r.key]} unit="" />
            <QuotaBar compact label="Promised as quota" used={promised[r.key]} total={capacity[r.key]} unit="" />
            {promised[r.key] > capacity[r.key] && <p className="text-caption text-status-over-fg">Quota promised is {Math.round(usagePct(promised[r.key], capacity[r.key]))}% of capacity.</p>}
          </section>
        ))}
      </div>

      <section className="card mt-6 overflow-x-auto p-6">
        <h2 className="mb-4 font-heading text-h3 text-text-primary">By tenant</h2>
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-caption text-text-secondary">
            <tr>
              <th className="pb-2 font-semibold">Tenant</th>
              {RESOURCES.map((r) => (
                <th key={r.key} className="pb-2 text-right font-semibold">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tenants.map((t) => {
              const a = tenantAllocated(environments, t.id)
              return (
                <tr key={t.id} className="h-12">
                  <td className="font-semibold text-text-primary">{t.name}</td>
                  {RESOURCES.map((r) => (
                    <td key={r.key} className="tabular text-right text-text-secondary">
                      <span className="text-text-primary">{formatInt(a[r.key])}</span> / {formatInt(t.quota[r.key])}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-3 text-caption text-text-muted">In use / quota. Change a tenant’s quota from the Tenants page.</p>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader title="Edit platform capacity" description="Update this when hardware is added to or removed from the pool." />
          <DialogBody className="grid grid-cols-2 gap-4">
            {RESOURCES.map((r) => (
              <Field key={r.key} label={r.unit === 'GB' ? `${r.label} (GB)` : r.label} htmlFor={`cap-${r.key}`}>
                <Input id={`cap-${r.key}`} type="number" min={0} value={draft[r.key]} onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })} />
              </Field>
            ))}
            {error && <p className="col-span-2 text-caption text-red-text">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                const next = Object.fromEntries(RESOURCES.map((r) => [r.key, Number(draft[r.key])])) as unknown as Quota
                const short = RESOURCES.find((r) => !Number.isFinite(next[r.key]) || next[r.key] < allocated[r.key])
                if (short) {
                  setError(`${short.label} can’t be lower than what environments already use (${formatInt(allocated[short.key])}).`)
                  return
                }
                setCapacity(next)
                setOpen(false)
                toast.success('Platform capacity updated.')
              }}
            >
              Save capacity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
