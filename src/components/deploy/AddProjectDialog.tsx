import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, ArrowUpCircle, FolderPlus } from 'lucide-react'
import type { Deployment, Environment } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useScope } from '@/store/selectors'
import { attachedItemIds, capacityShortfall, defaultDependencies, envCapacity, limitsUsed, shortfallText } from '@/lib/deploy'
import { requestPath } from '@/lib/paths'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { Input } from '@/components/ui/input'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { QuotaBar } from '@/components/shared/QuotaBar'
import { EmptyState } from '@/components/shared/EmptyState'

interface Pick {
  vcpu: number
  ramGb: number
  attach: boolean
}

export function AddProjectDialog({ env, deployments, open, onOpenChange }: { env: Environment; deployments: Deployment[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const scope = useScope()!
  const projects = useAppStore((s) => s.projects)
  const catalog = useAppStore((s) => s.catalog)
  const addProjectsToEnv = useAppStore((s) => s.addProjectsToEnv)
  const attachDependencies = useAppStore((s) => s.attachDependencies)
  const requestEnvUpgrade = useAppStore((s) => s.requestEnvUpgrade)
  const [picked, setPicked] = useState<Record<string, Pick>>({})

  const available = useMemo(
    () => projects.filter((p) => p.tenantId === env.tenantId && p.status === 'active' && !deployments.some((d) => d.projectId === p.id)),
    [projects, env.tenantId, deployments],
  )
  const attached = new Set(attachedItemIds(env))
  const missingFor = (projectId: string) => {
    const p = projects.find((x) => x.id === projectId)
    return p ? defaultDependencies(p, catalog).filter((id) => !attached.has(id)) : []
  }
  const itemName = (id: string) => catalog.find((c) => c.id === id)?.name ?? id

  const chosen = Object.entries(picked)
  const extra = chosen.reduce((s, [, v]) => ({ vcpu: s.vcpu + (v.vcpu || 0), ramGb: s.ramGb + (v.ramGb || 0) }), { vcpu: 0, ramGb: 0 })
  const cap = envCapacity(env)
  const used = limitsUsed(deployments)
  const short = capacityShortfall(env, deployments, extra)
  const invalid = chosen.some(([, v]) => !(v.vcpu > 0 && v.ramGb > 0))
  const toAttach = [...new Set(chosen.filter(([, v]) => v.attach).flatMap(([id]) => missingFor(id)))]

  const reset = (o: boolean) => {
    if (!o) setPicked({})
    onOpenChange(o)
  }

  const toggle = (id: string, on: boolean) =>
    setPicked((p) => {
      const next = { ...p }
      if (on) next[id] = { vcpu: 1, ramGb: 2, attach: true }
      else delete next[id]
      return next
    })
  const patch = (id: string, v: Partial<Pick>) => setPicked((p) => ({ ...p, [id]: { ...p[id]!, ...v } }))

  const add = () => {
    const res = addProjectsToEnv(
      env.id,
      chosen.map(([projectId, v]) => ({ projectId, limits: { vcpu: v.vcpu, ramGb: v.ramGb } })),
    )
    if (!res.ok) return toast.error(res.error)
    toast.success(`${chosen.length === 1 ? 'Project' : `${chosen.length} projects`} added. Configure ${chosen.length === 1 ? 'it' : 'them'} and deploy when ready.`)
    if (toAttach.length) {
      const att = attachDependencies(env.id, toAttach)
      if (att.mode === 'error') toast.error(`${toAttach.map(itemName).join(', ')} wasn’t attached: ${att.error}`)
      else if (att.mode === 'requested') toast.success(`Attaching ${toAttach.map(itemName).join(', ')} needs approval. A change request was sent.`)
      else toast.success(`Attached ${toAttach.map(itemName).join(', ')} to this environment.`)
    }
    reset(false)
  }

  const upgrade = () => {
    const res = requestEnvUpgrade(env.id, extra, `Room for more projects: ${chosen.map(([id]) => projects.find((p) => p.id === id)?.name).join(', ')} need ${shortfallText(short!)} more than “${env.spec.name}” has.`)
    if (res.mode === 'error') return toast.error(res.error)
    if (res.mode === 'applied') return toast.success('The environment was upgraded. You can add the projects now.')
    toast.success(
      <span>
        Upgrade request sent for review.{' '}
        <Link to={requestPath(scope.role, res.id)} className="font-semibold underline underline-offset-2">
          See the request
        </Link>
      </span>,
    )
    reset(false)
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent size="lg">
        <DialogHeader title="Add projects to this environment" description="Each project gets its own service, port and route. Set how much CPU and RAM it may use; the total must fit the environment." />
        <DialogBody className="flex flex-col gap-5">
          {available.length === 0 ? (
            <EmptyState icon={FolderPlus} title="Every project is already here" description="All active projects in your organisation are on this environment. Your Tenant Admin can create a new project." className="py-6" />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
              {available.map((p) => {
                const sel = picked[p.id]
                const missing = missingFor(p.id)
                return (
                  <li key={p.id} className="flex flex-col gap-3 p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <Checkbox checked={!!sel} onCheckedChange={(c) => toggle(p.id, c === true)} aria-label={`Add ${p.name}`} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-text-primary">{p.name}</span>
                        <span className="block text-caption text-text-secondary">{p.description}</span>
                      </span>
                    </label>
                    {sel && (
                      <div className="ml-7 flex flex-col gap-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="flex flex-col gap-1 text-caption font-semibold text-text-secondary">
                            vCPU
                            <Input type="number" min={0.5} step={0.5} value={sel.vcpu} onChange={(e) => patch(p.id, { vcpu: Number(e.target.value) })} className="w-24" />
                          </label>
                          <label className="flex flex-col gap-1 text-caption font-semibold text-text-secondary">
                            RAM (GB)
                            <Input type="number" min={0.5} step={0.5} value={sel.ramGb} onChange={(e) => patch(p.id, { ramGb: Number(e.target.value) })} className="w-24" />
                          </label>
                        </div>
                        {missing.length > 0 && (
                          <label className="flex cursor-pointer items-start gap-2.5 rounded-control bg-status-review-bg px-3 py-2 text-caption text-status-review-fg">
                            <Checkbox checked={sel.attach} onCheckedChange={(c) => patch(p.id, { attach: c === true })} className="mt-0.5" aria-label="Attach the models it needs" />
                            <span>
                              Uses {missing.map(itemName).join(', ')}, which {missing.length === 1 ? 'isn’t' : 'aren’t'} on this environment yet. <span className="font-semibold">Attach {missing.length === 1 ? 'it' : 'them'} too.</span>
                            </span>
                          </label>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <QuotaBar label="vCPU reserved" used={used.vcpu} projected={extra.vcpu} total={cap.vcpu} unit="vCPU" compact />
            <QuotaBar label="RAM reserved" used={used.ramGb} projected={extra.ramGb} total={cap.ramGb} unit="GB" compact />
          </div>

          {short && (
            <div className="flex flex-col gap-3 rounded-card bg-status-over-bg p-4 text-sm text-status-over-fg sm:flex-row sm:items-center">
              <AlertTriangle className="size-5 shrink-0" aria-hidden />
              <p className="flex-1">
                <span className="font-semibold">Not enough room.</span> These projects need {shortfallText(short)} more than this environment has. Lower their limits, or request an upgrade to a larger instance.
              </p>
              <Button variant="secondary" onClick={upgrade} className="shrink-0">
                <ArrowUpCircle /> Request upgrade
              </Button>
            </div>
          )}
          {invalid && <p className="text-caption text-red-text">Give every chosen project some CPU and RAM.</p>}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={add} disabled={!chosen.length || !!short || invalid}>
            <FolderPlus /> {chosen.length > 1 ? `Add ${chosen.length} projects` : 'Add project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
