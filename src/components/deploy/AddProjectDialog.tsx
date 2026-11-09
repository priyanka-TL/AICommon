import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, ArrowUpCircle, FolderPlus, Plus } from 'lucide-react'
import type { Deployment, Environment } from '@/data/types'
import { useAppStore, type ProjectInput } from '@/store/useAppStore'
import { useScope } from '@/store/selectors'
import { attachedItemIds, capacityShortfall, defaultDependencies, envCapacity, limitsUsed, shortfallText } from '@/lib/deploy'
import { requestPath } from '@/lib/paths'
import { canViewProject } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { emptyProjectInput, ProjectForm } from '@/components/projects/ProjectForm'
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

export function AddProjectDialog({
  env,
  deployments,
  open,
  onOpenChange,
  initialMode = 'existing',
  onAdded,
}: {
  env: Environment
  deployments: Deployment[]
  open: boolean
  onOpenChange: (o: boolean) => void
  initialMode?: 'existing' | 'create'
  /** Called with the new deployment's id when one project was added. */
  onAdded?: (depId: string) => void
}) {
  const scope = useScope()!
  const projects = useAppStore((s) => s.projects)
  const users = useAppStore((s) => s.users)
  const createProject = useAppStore((s) => s.createProject)
  const [mode, setMode] = useState<'existing' | 'create'>(initialMode)
  const [draft, setDraft] = useState<ProjectInput>(emptyProjectInput)
  const [limits, setLimits] = useState({ vcpu: 1, ramGb: 2 })
  const [formError, setFormError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setMode(initialMode)
      setDraft(emptyProjectInput())
      setLimits({ vcpu: 1, ramGb: 2 })
      setFormError(null)
    }
  }, [open, initialMode])
  const canCreate = scope.role === 'user' || scope.role === 'tenant_admin'
  const catalog = useAppStore((s) => s.catalog)
  const addProjectsToEnv = useAppStore((s) => s.addProjectsToEnv)
  const attachDependencies = useAppStore((s) => s.attachDependencies)
  const requestEnvUpgrade = useAppStore((s) => s.requestEnvUpgrade)
  const [picked, setPicked] = useState<Record<string, Pick>>({})

  const available = useMemo(
    () => projects.filter((p) => p.tenantId === env.tenantId && p.status === 'active' && !deployments.some((d) => d.projectId === p.id) && canViewProject(scope.user, p)),
    [projects, env.tenantId, deployments, scope.user],
  )
  const attached = new Set(attachedItemIds(env))
  const missingFor = (projectId: string) => {
    const p = projects.find((x) => x.id === projectId)
    return p ? defaultDependencies(p, catalog).filter((id) => !attached.has(id)) : []
  }
  const itemName = (id: string) => catalog.find((c) => c.id === id)?.name ?? id

  const chosen = Object.entries(picked)
  const extra = mode === 'create' ? limits : chosen.reduce((s, [, v]) => ({ vcpu: s.vcpu + (v.vcpu || 0), ramGb: s.ramGb + (v.ramGb || 0) }), { vcpu: 0, ramGb: 0 })
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
    if (chosen.length === 1 && res.id) onAdded?.(res.id)
    if (toAttach.length) {
      const att = attachDependencies(env.id, toAttach)
      if (att.mode === 'error') toast.error(`${toAttach.map(itemName).join(', ')} wasn’t attached: ${att.error}`)
      else if (att.mode === 'requested') toast.success(`Attaching ${toAttach.map(itemName).join(', ')} needs approval. A change request was sent.`)
      else toast.success(`Attached ${toAttach.map(itemName).join(', ')} to this environment.`)
    }
    reset(false)
  }

  const createAndAdd = () => {
    const created = createProject(draft)
    if (!created.ok) return setFormError(created.error)
    const res = addProjectsToEnv(env.id, [{ projectId: created.id!, limits }])
    if (!res.ok) {
      toast.error(`${draft.name.trim()} was created, but not added: ${res.error}`)
      return reset(false)
    }
    toast.success(`Created ${draft.name.trim()} and added it to “${env.spec.name}”. Configure it and deploy when ready.`)
    if (res.id) onAdded?.(res.id)
    reset(false)
  }

  const upgrade = () => {
    const names = mode === 'create' ? draft.name.trim() || 'A new project' : chosen.map(([id]) => projects.find((p) => p.id === id)?.name).join(', ')
    const res = requestEnvUpgrade(env.id, extra, `Room for more projects: ${names} need ${shortfallText(short!)} more than “${env.spec.name}” has.`)
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
        <DialogHeader title="Add a project to this environment" description="Each project gets its own service, port and route. Set how much CPU and RAM it may use; the total must fit the environment." />
        <DialogBody className="flex flex-col gap-5">
          {canCreate && (
            <div className="flex w-fit rounded-control border border-border p-0.5" role="tablist" aria-label="Add an existing project or create one">
              {(
                [
                  ['existing', 'Pick existing'],
                  ['create', 'Create new'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={mode === v}
                  onClick={() => setMode(v)}
                  className={cn('rounded-[8px] px-3 py-1 text-caption font-semibold', mode === v ? 'bg-indigo-50 text-indigo-text' : 'text-text-secondary hover:text-text-primary')}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {mode === 'create' ? (
            <div className="flex flex-col gap-4">
              <ProjectForm
                value={draft}
                onChange={(v) => {
                  setDraft(v)
                  setFormError(null)
                }}
                error={formError}
                people={users.filter((u) => u.tenantId === env.tenantId && u.status === 'active' && u.role === 'user')}
                ownerId={scope.user.id}
                compact
                idPrefix="add-pj"
              />
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-caption font-semibold text-text-secondary">
                  vCPU on this environment
                  <Input type="number" min={0.5} step={0.5} value={limits.vcpu} onChange={(e) => setLimits({ ...limits, vcpu: Number(e.target.value) })} className="w-28" />
                </label>
                <label className="flex flex-col gap-1 text-caption font-semibold text-text-secondary">
                  RAM (GB)
                  <Input type="number" min={0.5} step={0.5} value={limits.ramGb} onChange={(e) => setLimits({ ...limits, ramGb: Number(e.target.value) })} className="w-28" />
                </label>
              </div>
            </div>
          ) : available.length === 0 ? (
            <EmptyState
              icon={FolderPlus}
              title="No other projects to add"
              description="Every project you can see is already on this environment."
              action={
                canCreate ? (
                  <Button variant="secondary" onClick={() => setMode('create')}>
                    <Plus /> Create project
                  </Button>
                ) : undefined
              }
              className="py-6"
            />
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
          {mode === 'existing' && invalid && <p className="text-caption text-red-text">Give every chosen project some CPU and RAM.</p>}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          {mode === 'create' ? (
            <Button onClick={createAndAdd} disabled={!!short || !(limits.vcpu > 0 && limits.ramGb > 0) || draft.name.trim().length < 3}>
              <Plus /> Create and add
            </Button>
          ) : (
            <Button onClick={add} disabled={!chosen.length || !!short || invalid}>
              <FolderPlus /> {chosen.length > 1 ? `Add ${chosen.length} projects` : 'Add project'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
