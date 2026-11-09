import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, ChevronRight, Circle, KeyRound, Loader2, MinusCircle, Play, Plus, Rocket, Save, Square, Trash2, Undo2, Upload, Wrench, XCircle } from 'lucide-react'
import type { Deployment, DeploymentConfig, DeployStepStatus, Environment, Project, Runtime } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useScope } from '@/store/selectors'
import {
  canOperateDeployment,
  deploymentUrl,
  envCapacity,
  guideSteps,
  isKeyRef,
  isStatic,
  keyRefs,
  maskValue,
  limitsUsed,
  missingDependencies,
  platformVars,
  PROCESS_MANAGERS,
  RUNTIMES,
  runtimeLabel,
  STEP_LABELS,
  switchRuntime,
  validateConfig,
  type CheckKey,
  type GenContext,
} from '@/lib/deploy'
import { effectiveCapabilities, missingServices, SERVICE_ACCESS_LABELS, SOURCE_LABELS } from '@/lib/capabilities'
import { ReviewDeployment, type ReviewMode } from './ReviewDeployment'
import { formatTime, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip } from '@/components/ui/tooltip'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { CodeBlock } from '@/components/shared/CodeBlock'
import { CopyButton } from '@/components/shared/CopyButton'

type Tab = 'config' | 'review' | 'runs' | 'history'

/** `initialTab`: open straight on the review (Deploy pressed elsewhere) or another tab. */
export function DeploymentSheet({ depId, env, onOpenChange, initialTab }: { depId: string | null; env: Environment; onOpenChange: (open: boolean) => void; initialTab?: Tab }) {
  const dep = useAppStore((s) => s.deployments.find((d) => d.id === depId))
  return (
    <Sheet open={!!depId && !!dep} onOpenChange={onOpenChange}>
      <SheetContent className="sm:w-[min(860px,100vw)]">{dep && <SheetBody key={`${dep.id}-${initialTab ?? ''}`} dep={dep} env={env} initialTab={initialTab} />}</SheetContent>
    </Sheet>
  )
}

export type DeploymentTab = Tab

function SheetBody({ dep, env, initialTab }: { dep: Deployment; env: Environment; initialTab?: Tab }) {
  const scope = useScope()!
  const catalog = useAppStore((s) => s.catalog)
  const projects = useAppStore((s) => s.projects)
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === env.tenantId))
  const allDeps = useAppStore((s) => s.deployments)
  const updateConfig = useAppStore((s) => s.updateDeploymentConfig)
  const deploy = useAppStore((s) => s.deploy)
  const stop = useAppStore((s) => s.stopDeployment)
  const rollback = useAppStore((s) => s.rollbackDeployment)
  const setChoices = useAppStore((s) => s.setDeploymentChoices)
  const attachDependencies = useAppStore((s) => s.attachDependencies)

  const project = projects.find((p) => p.id === dep.projectId)
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id
  const siblings = useMemo(() => allDeps.filter((d) => d.envId === env.id && d.id !== dep.id), [allDeps, env.id, dep.id])
  const canOperate = canOperateDeployment(scope.user, env, project)

  const [draft, setDraft] = useState<DeploymentConfig>(dep.config)
  const [tab, setTab] = useState<Tab>(initialTab ?? (dep.status === 'failed' || dep.status === 'deploying' ? 'runs' : 'config'))
  const [reviewMode, setReviewMode] = useState<ReviewMode>({ kind: 'deploy' })
  // When the stored config changes (save, rollback), start the form from it again.
  useEffect(() => setDraft(dep.config), [dep.config])

  const dirty = JSON.stringify(draft) !== JSON.stringify(dep.config)
  const errors = validateConfig(draft, { env, siblings, projectName })
  const valid = Object.keys(errors).length === 0
  const set = (patch: Partial<DeploymentConfig>) => setDraft((d) => ({ ...d, ...patch }))

  const ctx: GenContext = { dep: { ...dep, config: draft }, env, projectName: project?.name ?? dep.serviceName, catalog, project }
  const missing = missingDependencies(env, dep.config)
  const itemName = (id: string) => catalog.find((c) => c.id === id)?.name ?? id
  const goodVersions = dep.history.filter((h) => h.status === 'running' || h.status === 'superseded')
  const currentVersion = dep.status === 'running' ? goodVersions[goodVersions.length - 1] : undefined
  const previous = [...goodVersions].reverse().find((h) => h !== currentVersion)
  const envActive = env.status === 'active'
  const reviewBlocked = !canOperate ? 'You can’t deploy this project.' : !valid ? 'Fix the configuration first.' : null
  const reviewConfig =
    reviewMode.kind === 'rollback'
      ? { ...(dep.history.find((h) => h.version === reviewMode.version)?.config ?? dep.config), capabilityChoice: draft.capabilityChoice, serviceAccess: draft.serviceAccess }
      : draft

  /** Every deploy, redeploy and rollback starts here: the review screen, never a run. */
  const openReview = (mode: ReviewMode = { kind: 'deploy' }) => {
    setReviewMode(mode)
    setTab('review')
  }

  const save = () => {
    const res = updateConfig(dep.id, draft)
    if (!res.ok) {
      toast.error(res.error)
      return false
    }
    toast.success('Deployment settings saved.')
    return true
  }
  const confirm = (overrides: CheckKey[]) => {
    if (reviewMode.kind === 'rollback') {
      const choicesChanged = JSON.stringify([draft.capabilityChoice, draft.serviceAccess]) !== JSON.stringify([dep.config.capabilityChoice, dep.config.serviceAccess])
      if (choicesChanged) {
        const r = setChoices(dep.id, { capabilityChoice: draft.capabilityChoice, serviceAccess: draft.serviceAccess })
        if (!r.ok) return toast.error(r.error)
      }
      const res = rollback(dep.id, { version: reviewMode.version, overrides })
      if (!res.ok) return toast.error(res.error)
      toast.success(`Rolling back to v${reviewMode.version}.`)
    } else {
      if (dirty && !save()) return
      const res = deploy(dep.id, { overrides })
      if (!res.ok) return toast.error(res.error)
      toast.success(`Deploying ${project?.name ?? dep.serviceName}.`)
    }
    setReviewMode({ kind: 'deploy' })
    setTab('runs')
  }
  const attach = (ids: string[]) => {
    const res = attachDependencies(env.id, ids)
    if (res.mode === 'error') toast.error(res.error)
    else if (res.mode === 'requested') toast.success(`Attaching ${ids.map(itemName).join(', ')} needs more infrastructure, so a change request was sent for approval.`)
    else toast.success(`Attached ${ids.map(itemName).join(', ')} to “${env.spec.name}”.`)
  }

  const primaryLabel = dep.status === 'not_deployed' ? 'Deploy' : 'Redeploy'

  return (
    <>
      <div className="border-b border-border px-6 pb-4 pr-14 pt-6">
        <p className="eyebrow">{env.spec.name}</p>
        <SheetTitle className="mt-1 font-heading text-h2 text-text-primary">{project?.name ?? dep.serviceName}</SheetTitle>
        <SheetDescription className="sr-only">Deployment configuration, generated guide and run history</SheetDescription>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={dep.status === 'stopped' ? 'stopped' : dep.status} />
          <Tag>{runtimeLabel(dep.config.runtime, dep.config.runtimeVersion)}</Tag>
          {!isStatic(dep.config) && <Tag>{PROCESS_MANAGERS.find((p) => p.value === dep.config.processManager)!.label}</Tag>}
          {!isStatic(dep.config) && <Tag>Port {dep.config.port}</Tag>}
          {dep.history.length > 0 && <Tag>v{dep.history[dep.history.length - 1]!.version}</Tag>}
        </div>
        <div className="mt-2 flex items-center gap-1 text-caption text-text-secondary">
          <code className="truncate font-mono">{deploymentUrl(dep.config, env)}</code>
          <CopyButton value={deploymentUrl(dep.config, env)} what="URL" />
        </div>
        {canOperate && (
          <div className="mt-3 flex flex-wrap gap-2">
            {reviewBlocked ? (
              <Tooltip content={reviewBlocked}>
                <span>
                  <Button disabled>
                    <Rocket /> {primaryLabel}
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button onClick={() => openReview()} disabled={dep.status === 'deploying' || (tab === 'review' && reviewMode.kind === 'deploy')}>
                {dep.status === 'deploying' ? <Loader2 className="animate-spin" /> : <Rocket />} {dep.status === 'deploying' ? 'Deploying…' : primaryLabel}
              </Button>
            )}
            {(dep.status === 'running' || dep.status === 'deploying') && (
              <Button
                variant="secondary"
                onClick={() => {
                  const r = stop(dep.id)
                  if (r.ok) toast.success(`${project?.name} stopped.`)
                  else toast.error(r.error)
                }}
              >
                <Square /> Stop
              </Button>
            )}
            {previous && envActive && dep.status !== 'deploying' && (
              <Button variant="secondary" onClick={() => openReview({ kind: 'rollback', version: previous.version })}>
                <Undo2 /> Rollback to v{previous.version}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        {missing.length > 0 && (
          <div className="flex flex-col gap-3 rounded-card bg-status-review-bg p-4 text-sm text-status-review-fg sm:flex-row sm:items-center">
            <p className="flex-1">
              This project uses {missing.map(itemName).join(', ')}, which {missing.length === 1 ? 'isn’t' : 'aren’t'} attached to this environment yet. Attach {missing.length === 1 ? 'it' : 'them'} before deploying.
            </p>
            {canOperate && (
              <Button variant="secondary" size="compact" onClick={() => attach(missing)}>
                <Plus /> Attach to environment
              </Button>
            )}
          </div>
        )}
        {dep.status === 'failed' && dep.lastRun?.error && (
          <div className="flex gap-3 rounded-card bg-status-rejected-bg p-4 text-sm text-status-rejected-fg">
            <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Failed at step: {dep.lastRun.failedStep ? STEP_LABELS[dep.lastRun.failedStep] : 'unknown'}</p>
              <p className="mt-0.5">{dep.lastRun.error}</p>
              {canOperate && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" size="compact" onClick={() => setTab('config')}>
                    <Wrench /> Fix configuration
                  </Button>
                  <Button variant="secondary" size="compact" onClick={() => openReview()} disabled={!!reviewBlocked}>
                    <Rocket /> Redeploy
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="review">Review &amp; steps</TabsTrigger>
            <TabsTrigger value="runs">Runs</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="pt-5">
            <ConfigForm
              draft={draft}
              set={set}
              errors={errors}
              readOnly={!canOperate || dep.status === 'deploying'}
              env={env}
              siblings={siblings}
              ctx={ctx}
              enabledItems={tenant?.enabledItemIds ?? []}
              connectedKeys={tenant?.connectedKeys ?? []}
              onAttach={(id) => attach([id])}
            />
            {canOperate && (
              <div className="sticky bottom-0 -mx-6 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-bg-surface px-6 py-3">
                {dirty && <span className="mr-auto text-caption text-text-secondary">Unsaved changes</span>}
                <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(dep.config)}>
                  Discard changes
                </Button>
                <Button variant="secondary" disabled={!dirty || !valid || dep.status === 'deploying'} onClick={save}>
                  <Save /> Save configuration
                </Button>
                <Button disabled={!!reviewBlocked || dep.status === 'deploying'} onClick={() => openReview()}>
                  Review deployment <ChevronRight />
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="review" className="pt-5">
            <ReviewDeployment
              dep={dep}
              env={env}
              project={project}
              config={reviewConfig}
              mode={reviewMode}
              dirty={dirty && reviewMode.kind === 'deploy'}
              canOperate={canOperate && !reviewBlocked}
              onChoices={(patch) =>
                set({
                  capabilityChoice: { ...draft.capabilityChoice, ...(patch.capabilityChoice ?? {}) },
                  serviceAccess: { ...draft.serviceAccess, ...(patch.serviceAccess ?? {}) },
                })
              }
              onEdit={() => {
                setReviewMode({ kind: 'deploy' })
                setTab('config')
              }}
              onConfirm={confirm}
            />
          </TabsContent>

          <TabsContent value="runs" className="pt-5">
            <Runs dep={dep} env={env} project={project} />
          </TabsContent>

          <TabsContent value="history" className="pt-5">
            <History dep={dep} canRollback={canOperate && envActive && dep.status !== 'deploying'} onRollback={(version) => openReview({ kind: 'rollback', version })} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}

/* ---------- configuration form ---------- */

function ConfigForm({
  draft,
  set,
  errors,
  readOnly,
  env,
  siblings,
  ctx,
  enabledItems,
  connectedKeys,
  onAttach,
}: {
  draft: DeploymentConfig
  set: (p: Partial<DeploymentConfig>) => void
  errors: ReturnType<typeof validateConfig>
  readOnly: boolean
  env: Environment
  siblings: Deployment[]
  ctx: GenContext
  enabledItems: string[]
  connectedKeys: string[]
  onAttach: (id: string) => void
}) {
  const catalog = useAppStore((s) => s.catalog)
  const runtime = RUNTIMES.find((r) => r.value === draft.runtime)!
  const cap = envCapacity(env)
  const others = limitsUsed(siblings)
  const left = { vcpu: cap.vcpu - others.vcpu, ramGb: cap.ramGb - others.ramGb }
  const missing = new Set(missingDependencies(env, draft))
  const addable = catalog.filter((c) => enabledItems.includes(c.id) && !draft.dependencies.includes(c.id) && c.status !== 'deprecated')
  const statik = isStatic(draft)
  const caps = ctx.project ? effectiveCapabilities(ctx.project, env, catalog, draft.capabilityChoice) : []
  const missingSvc = new Set(ctx.project ? missingServices(ctx.project, env, catalog, draft.serviceAccess).map((m) => m.id) : [])
  const usedKeys = new Set(draft.env.flatMap((v) => keyRefs(v.value)))

  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-6">
      <Section title="Runtime">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Runtime" htmlFor="dep-runtime">
            <Select value={draft.runtime} onValueChange={(v) => set(switchRuntime(draft, v as Runtime))} disabled={readOnly}>
              <SelectTrigger id="dep-runtime">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RUNTIMES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {runtime.versions.length > 0 && (
            <Field label="Version" htmlFor="dep-version" error={errors.runtimeVersion}>
              <Select value={draft.runtimeVersion} onValueChange={(v) => set({ runtimeVersion: v })} disabled={readOnly}>
                <SelectTrigger id="dep-version">
                  <SelectValue placeholder="Choose a version" />
                </SelectTrigger>
                <SelectContent>
                  {runtime.versions.map((v) => (
                    <SelectItem key={v} value={v}>
                      {runtime.label} {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
      </Section>

      <Section title="Source">
        <div className="flex w-fit rounded-control border border-border p-0.5" role="group" aria-label="Source">
          {(
            [
              ['git', 'Git repository'],
              ['upload', 'Upload build'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={draft.source.kind === v}
              onClick={() => set({ source: v === 'git' ? { kind: 'git', repoUrl: '', branch: 'main' } : { kind: 'upload', fileName: '' } })}
              className={cn('rounded-[8px] px-3 py-1 text-caption font-semibold', draft.source.kind === v ? 'bg-indigo-50 text-indigo-text' : 'text-text-secondary hover:text-text-primary')}
            >
              {label}
            </button>
          ))}
        </div>
        {draft.source.kind === 'git' ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <Field label="Repository URL" htmlFor="dep-repo" required error={errors.repoUrl} helper="HTTPS or SSH. The repository is checked, not cloned, until you deploy.">
              <Input
                id="dep-repo"
                value={draft.source.repoUrl}
                onChange={(e) => set({ source: { kind: 'git', repoUrl: e.target.value, branch: draft.source.kind === 'git' ? draft.source.branch : 'main' } })}
                placeholder="https://github.com/org/repo.git"
                aria-invalid={!!errors.repoUrl}
                className="font-mono text-caption"
              />
            </Field>
            <Field label="Branch" htmlFor="dep-branch" required error={errors.branch}>
              <Input
                id="dep-branch"
                value={draft.source.branch}
                onChange={(e) => set({ source: { kind: 'git', repoUrl: draft.source.kind === 'git' ? draft.source.repoUrl : '', branch: e.target.value } })}
                aria-invalid={!!errors.branch}
                className="font-mono text-caption"
              />
            </Field>
          </div>
        ) : (
          <Field label="Build archive" htmlFor="dep-upload" required error={errors.fileName} helper="A .zip or .tar.gz of your built project. It stays in your browser; nothing is uploaded.">
            <label className="flex cursor-pointer items-center gap-3 rounded-control border border-dashed border-border-strong px-4 py-3 text-sm text-text-secondary hover:bg-bg-subtle">
              <Upload className="size-4" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{draft.source.fileName || 'Choose a file'}</span>
              <input id="dep-upload" type="file" accept=".zip,.tar.gz,.tgz" className="sr-only" onChange={(e) => set({ source: { kind: 'upload', fileName: e.target.files?.[0]?.name ?? '' } })} />
            </label>
          </Field>
        )}
      </Section>

      <Section title="Commands">
        <div className="grid gap-4">
          <Field label="Install command" htmlFor="dep-install" helper={draft.runtime === 'python' ? 'Runs inside a virtualenv (.venv).' : 'For example: npm ci'}>
            <Input id="dep-install" value={draft.installCmd} onChange={(e) => set({ installCmd: e.target.value })} className="font-mono text-caption" />
          </Field>
          <Field label="Build command" htmlFor="dep-build" helper={statik ? 'Should write the site to dist/.' : 'Leave empty if there is no build step.'}>
            <Input id="dep-build" value={draft.buildCmd} onChange={(e) => set({ buildCmd: e.target.value })} className="font-mono text-caption" />
          </Field>
          {!statik && (
            <Field label="Start command" htmlFor="dep-start" required={draft.runtime !== 'docker'} error={errors.startCmd} helper={draft.runtime === 'docker' ? 'Optional: overrides the image’s default command.' : 'Used as ExecStart in the service file.'}>
              <Input id="dep-start" value={draft.startCmd} onChange={(e) => set({ startCmd: e.target.value })} aria-invalid={!!errors.startCmd} className="font-mono text-caption" />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pre-deploy command" htmlFor="dep-pre" helper="Optional. Runs after the build, before the service starts (for example migrations).">
              <Input id="dep-pre" value={draft.preDeployCmd} onChange={(e) => set({ preDeployCmd: e.target.value })} placeholder="python -m app.migrate" className="font-mono text-caption" />
            </Field>
            <Field label="Post-deploy command" htmlFor="dep-post" helper="Optional. Runs after the health check passes.">
              <Input id="dep-post" value={draft.postDeployCmd} onChange={(e) => set({ postDeployCmd: e.target.value })} placeholder="curl -X POST http://127.0.0.1:3000/warm" className="font-mono text-caption" />
            </Field>
          </div>
          {caps.length > 0 && (draft.runtime === 'node' || draft.runtime === 'python') && (
            <p className="text-caption text-text-secondary">Libraries from this project’s capabilities are added to the install step automatically. See them in Review &amp; steps.</p>
          )}
        </div>
      </Section>

      <Section title="Serving">
        <div className="grid gap-4 sm:grid-cols-2">
          {!statik && (
            <Field label="Process manager" htmlFor="dep-pm">
              <Select value={draft.processManager} onValueChange={(v) => set({ processManager: v as DeploymentConfig['processManager'] })} disabled={readOnly}>
                <SelectTrigger id="dep-pm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROCESS_MANAGERS.filter((p) => draft.runtime !== 'docker' || p.value !== 'pm2').map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {!statik && (
            <Field label="Port" htmlFor="dep-port" required error={errors.port} helper={!errors.port ? `Used here: ${siblings.filter((s) => !isStatic(s.config)).map((s) => s.config.port).join(', ') || 'none'}` : undefined}>
              <Input id="dep-port" type="number" min={1024} max={65535} value={draft.port || ''} onChange={(e) => set({ port: Number(e.target.value) })} aria-invalid={!!errors.port} />
            </Field>
          )}
          <Field label="Base path" htmlFor="dep-base" required error={errors.basePath} helper="Nginx routes this path to the project.">
            <Input id="dep-base" value={draft.basePath} onChange={(e) => set({ basePath: e.target.value })} aria-invalid={!!errors.basePath} className="font-mono text-caption" />
          </Field>
          <Field label="Domain" htmlFor="dep-domain" error={errors.domain} helper="Optional. Empty uses the environment’s own address.">
            <Input id="dep-domain" value={draft.domain} onChange={(e) => set({ domain: e.target.value })} placeholder="tutor.example.org" aria-invalid={!!errors.domain} className="font-mono text-caption" />
          </Field>
        </div>
        <p className="text-caption text-text-secondary">
          Reverse proxy: an Nginx route is generated for <code className="font-mono text-text-primary">{deploymentUrl(draft, env)}</code>. See it in the deployment guide.
        </p>
      </Section>

      <Section title="Environment variables">
        <div className="flex flex-col gap-2">
          {draft.env.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={v.key}
                onChange={(e) => set({ env: draft.env.map((x, j) => (j === i ? { ...x, key: e.target.value.toUpperCase() } : x)) })}
                placeholder="NAME"
                aria-label={`Variable ${i + 1} name`}
                className="w-2/5 font-mono text-caption"
              />
              {isKeyRef(v.value) ? (
                <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-control border border-border-strong bg-bg-subtle px-3" aria-label={`Variable ${i + 1} value: key ${keyRefs(v.value)[0]}, masked`}>
                  <KeyRound className="size-4 shrink-0 text-text-muted" aria-hidden />
                  <span className="truncate font-mono text-caption text-text-primary">{keyRefs(v.value)[0]}</span>
                  <span className="font-mono text-caption text-text-muted">••••••••</span>
                  {connectedKeys.includes(keyRefs(v.value)[0]!) ? <Tag>Connected</Tag> : <StatusBadge status="suspended" label="Not connected" />}
                </div>
              ) : (
                <Input
                  value={v.value}
                  onChange={(e) => set({ env: draft.env.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                  placeholder="value, or ${KEY_NAME} to use an organisation key"
                  aria-label={`Variable ${i + 1} value`}
                  className="flex-1 font-mono text-caption"
                />
              )}
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${v.key || 'variable'}`} onClick={() => set({ env: draft.env.filter((_, j) => j !== i) })}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {errors.env && <p className="text-caption text-red-text">{errors.env}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => set({ env: [...draft.env, { key: '', value: '' }] })}>
              <Plus /> Add variable
            </Button>
            {!readOnly && connectedKeys.some((k) => !usedKeys.has(k)) && (
              <Select value="" onValueChange={(k) => set({ env: [...draft.env, { key: k, value: `\${${k}}` }] })}>
                <SelectTrigger className="h-8 w-auto gap-2 text-caption" aria-label="Use an organisation key">
                  <KeyRound className="size-3.5" aria-hidden />
                  <SelectValue placeholder="Use a key" />
                </SelectTrigger>
                <SelectContent>
                  {connectedKeys
                    .filter((k) => !usedKeys.has(k))
                    .map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <p className="text-caption text-text-muted">Keys are referenced by name and never shown. They are written to .env on the server when you deploy.</p>
          {platformVars(ctx).length > 0 && (
            <div className="rounded-control bg-bg-subtle px-3 py-2">
              <p className="mb-1 text-caption font-semibold text-text-secondary">Added automatically (platform and capability connections)</p>
              <ul className="font-mono text-[12px] leading-5 text-text-primary">
                {platformVars(ctx).map((v) => (
                  <li key={v.key} className="truncate">
                    {v.key}={maskValue(v.value)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      <Section title="Health check">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Path" htmlFor="dep-health" required error={errors.healthPath}>
            <Input id="dep-health" value={draft.healthPath} onChange={(e) => set({ healthPath: e.target.value })} aria-invalid={!!errors.healthPath} className="font-mono text-caption" />
          </Field>
          <Field label="Expected status" htmlFor="dep-health-status" required error={errors.healthStatus}>
            <Input id="dep-health-status" type="number" value={draft.healthStatus} onChange={(e) => set({ healthStatus: Number(e.target.value) })} aria-invalid={!!errors.healthStatus} />
          </Field>
        </div>
      </Section>

      <Section title="Resource limits">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="vCPU" htmlFor="dep-cpu">
            <Input id="dep-cpu" type="number" min={0.5} step={0.5} value={draft.limits.vcpu} onChange={(e) => set({ limits: { ...draft.limits, vcpu: Number(e.target.value) } })} aria-invalid={!!errors.limits} />
          </Field>
          <Field label="RAM (GB)" htmlFor="dep-ram">
            <Input id="dep-ram" type="number" min={0.5} step={0.5} value={draft.limits.ramGb} onChange={(e) => set({ limits: { ...draft.limits, ramGb: Number(e.target.value) } })} aria-invalid={!!errors.limits} />
          </Field>
        </div>
        <p className={cn('text-caption', errors.limits ? 'text-red-text' : 'text-text-secondary')}>
          {errors.limits ?? `Up to ${left.vcpu} vCPU and ${left.ramGb} GB RAM are free for this project (environment total ${cap.vcpu} vCPU, ${cap.ramGb} GB).`}
        </p>
      </Section>

      <Section title="Capabilities">
        <p className="-mt-1 text-caption text-text-secondary">What this deployment uses: the project’s own capabilities plus the shared ones on this environment.</p>
        {caps.length === 0 ? (
          <p className="text-sm text-text-secondary">None. Add capabilities to the project or to the environment.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-control border border-border">
            {caps.map((c) => (
              <li key={c.item.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {c.item.name} <span className="text-text-secondary">{c.version}</span>
                </span>
                <Tag>{SOURCE_LABELS[c.source]}</Tag>
                {c.conflict && <StatusBadge status="changes_requested" label={`Conflict: ${c.conflict.project} vs ${c.conflict.environment}`} />}
                {missingSvc.has(c.item.id) && <StatusBadge status="suspended" label="Missing on this environment" />}
                {draft.serviceAccess[c.item.id] && draft.serviceAccess[c.item.id] !== 'environment' && <Tag>{SERVICE_ACCESS_LABELS[draft.serviceAccess[c.item.id]!]}</Tag>}
              </li>
            ))}
          </ul>
        )}
        {caps.some((c) => c.conflict) || missingSvc.size ? <p className="text-caption text-text-secondary">Resolve conflicts and missing services on the Review &amp; steps tab before deploying.</p> : null}
      </Section>

      <Section title="Model dependencies">
        <p className="-mt-1 text-caption text-text-secondary">Models and services this project calls. They must be attached to the environment; add new ones at any time.</p>
        {draft.dependencies.length === 0 ? (
          <p className="text-sm text-text-secondary">None yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-control border border-border">
            {draft.dependencies.map((id) => {
              const item = catalog.find((c) => c.id === id)
              return (
                <li key={id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{item?.name ?? id}</span>
                  {missing.has(id) ? (
                    !readOnly && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => onAttach(id)}>
                        <Plus /> Attach to environment
                      </Button>
                    )
                  ) : (
                    <StatusBadge status="active" label="Attached" />
                  )}
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${item?.name ?? id}`} onClick={() => set({ dependencies: draft.dependencies.filter((d) => d !== id) })}>
                    <Trash2 />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        {addable.length > 0 && !readOnly && (
          <Select value="" onValueChange={(v) => set({ dependencies: [...draft.dependencies, v] })}>
            <SelectTrigger className="sm:max-w-sm" aria-label="Add a dependency">
              <SelectValue placeholder="Add a model or service" />
            </SelectTrigger>
            <SelectContent>
              {addable.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Section>
    </fieldset>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-heading text-h3 text-text-primary">{title}</h3>
      {children}
    </section>
  )
}

/* ---------- runs and history ---------- */

const STEP_ICON: Record<DeployStepStatus, { icon: typeof Circle; className: string; label: string }> = {
  pending: { icon: Circle, className: 'text-text-muted', label: 'Waiting' },
  running: { icon: Loader2, className: 'animate-spin text-blue', label: 'Running' },
  ok: { icon: CheckCircle2, className: 'text-teal', label: 'Done' },
  failed: { icon: XCircle, className: 'text-red-text', label: 'Failed' },
  skipped: { icon: MinusCircle, className: 'text-text-muted', label: 'Skipped' },
}

function Runs({ dep, env, project }: { dep: Deployment; env: Environment; project: Project | undefined }) {
  const users = useAppStore((s) => s.users)
  const catalog = useAppStore((s) => s.catalog)
  const run = dep.lastRun
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [run?.log.length])
  const runConfig = (run && dep.history.find((h) => h.version === run.version)?.config) ?? dep.config
  const steps = guideSteps({ dep: { ...dep, config: runConfig }, env, projectName: project?.name ?? dep.serviceName, catalog, project })
  const statusOf = (key: string) => run?.steps.find((s) => s.key === key)?.status ?? 'pending'

  return (
    <div className="flex flex-col gap-6">
      {!run ? (
        <p className="text-sm text-text-secondary">Not deployed yet. Review the steps, then confirm to deploy.</p>
      ) : (
        <>
          <div>
            <p className="eyebrow mb-2">
              Latest run · v{run.version} · {relativeTime(run.startedAt)} by {users.find((u) => u.id === run.actorId)?.name ?? 'System'}
            </p>
            <ol className="grid gap-1.5 sm:grid-cols-2">
              {run.steps.map((s, i) => {
                const st = STEP_ICON[s.status]
                return (
                  <li key={s.key} data-step={s.key} data-status={s.status} className={cn('flex items-center gap-2 rounded-control px-2.5 py-1.5 text-caption', s.status === 'failed' ? 'bg-status-rejected-bg text-status-rejected-fg' : 'bg-bg-subtle text-text-primary')}>
                    <st.icon className={cn('size-4 shrink-0', st.className)} aria-label={st.label} />
                    <span className="truncate">
                      {i + 1}. {STEP_LABELS[s.key]}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
          <div
            ref={box}
            className="h-72 overflow-y-auto rounded-control border border-border bg-bg-subtle p-3 font-mono text-[12px] leading-5"
            role="log"
            aria-live="polite"
            aria-label="Deployment log"
          >
            {run.log.map((l, i) => (
              <div key={i} className="flex gap-3 whitespace-pre-wrap">
                <span className="shrink-0 text-text-muted">{formatTime(l.at)}</span>
                <span className={cn('min-w-0', l.level === 'ERROR' ? 'font-semibold text-red-text' : l.text.startsWith('▸') ? 'font-semibold text-indigo-text' : 'text-text-primary')}>{l.text}</span>
              </div>
            ))}
            {dep.status === 'deploying' && <div className="mt-1 text-text-muted">…</div>}
          </div>
          <div>
            <h3 className="mb-1 font-heading text-h3 text-text-primary">Steps for this deployment</h3>
            <p className="mb-3 text-caption text-text-secondary">The exact steps v{run.version} ran, kept here for reference.</p>
            <ol className="flex flex-col gap-2">
              {steps.map((s) => {
                const st = STEP_ICON[statusOf(s.step)]
                return (
                  <li key={s.key}>
                    <details className="group rounded-control border border-border">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
                        <st.icon className={cn('size-4 shrink-0', st.className)} aria-label={st.label} />
                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                          {s.key}. {s.title}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-90" aria-hidden />
                      </summary>
                      <div className="px-3 pb-3">
                        <CodeBlock code={s.code} label={s.codeLabel} />
                      </div>
                    </details>
                  </li>
                )
              })}
            </ol>
          </div>
        </>
      )}
      <p className="flex items-center gap-1.5 text-caption text-text-muted">
        <Play className="size-3.5" aria-hidden /> Runs are simulated: no server is contacted.
      </p>
    </div>
  )
}

function History({ dep, canRollback, onRollback }: { dep: Deployment; canRollback: boolean; onRollback: (version: number) => void }) {
  const users = useAppStore((s) => s.users)
  const current = dep.status === 'running' ? [...dep.history].reverse().find((h) => h.status === 'running') : undefined
  return (
    <div>
      <h3 className="mb-1 font-heading text-h3 text-text-primary">Deployment history</h3>
      <p className="mb-3 text-caption text-text-secondary">Who deployed, when, which configuration version and the result. Rolling back opens the review first.</p>
      {dep.history.length === 0 ? (
        <p className="text-sm text-text-secondary">No versions yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-control border border-border">
          {[...dep.history].reverse().map((h) => (
            <li key={h.version} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
              <span className="w-10 font-semibold text-text-primary">v{h.version}</span>
              <code className="font-mono text-caption text-text-secondary">{h.commit}</code>
              <span className="min-w-0 flex-1 truncate text-caption text-text-secondary">
                {runtimeLabel(h.config.runtime, h.config.runtimeVersion)}
                {h.config.startCmd ? ` · ${h.config.startCmd}` : ''}
                {h.note ? ` · ${h.note}` : ''}
              </span>
              <span className="text-caption text-text-muted">
                {users.find((u) => u.id === h.byId)?.name ?? 'System'} · {relativeTime(h.at)}
              </span>
              {h.status === 'running' ? (
                <StatusBadge status="running" label="Current" />
              ) : h.status === 'failed' ? (
                <StatusBadge status="failed" />
              ) : h.status === 'rolled_back' ? (
                <StatusBadge status="stopped" label="Rolled back" />
              ) : (
                <Tag>Previous</Tag>
              )}
              {canRollback && h !== current && h.status !== 'failed' && (
                <Button variant="ghost" size="sm" onClick={() => onRollback(h.version)}>
                  <Undo2 /> Rollback to this version
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
