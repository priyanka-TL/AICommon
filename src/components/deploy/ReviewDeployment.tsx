import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardCopy, Download, Pencil, Plus, Rocket, XCircle } from 'lucide-react'
import type { Deployment, DeploymentConfig, Environment, Project, ServiceAccess } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { checksPass, deployScript, guideSteps, preDeployChecks, type CheckKey, type GenContext } from '@/lib/deploy'
import { effectiveCapabilities, missingServices, SERVICE_ACCESS_LABELS, SOURCE_LABELS } from '@/lib/capabilities'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox, RadioGroup, RadioGroupItem } from '@/components/ui/controls'
import { CodeBlock } from '@/components/shared/CodeBlock'
import { Tag } from '@/components/shared/StatusBadge'

export type ReviewMode = { kind: 'deploy' } | { kind: 'rollback'; version: number }

/**
 * “Review deployment”: the pre-deploy checklist, the generated steps and the only way to start a deployment.
 * Nothing runs until the person presses “Confirm & deploy”.
 */
export function ReviewDeployment({
  dep,
  env,
  project,
  config,
  mode,
  dirty,
  canOperate,
  onChoices,
  onEdit,
  onConfirm,
}: {
  dep: Deployment
  env: Environment
  project: Project | undefined
  /** What will be deployed: the unsaved draft, or the version being rolled back to. */
  config: DeploymentConfig
  mode: ReviewMode
  dirty: boolean
  canOperate: boolean
  onChoices: (patch: { capabilityChoice?: Record<string, string>; serviceAccess?: Record<string, ServiceAccess> }) => void
  onEdit: () => void
  onConfirm: (overrides: CheckKey[]) => void
}) {
  const catalog = useAppStore((s) => s.catalog)
  const allDeps = useAppStore((s) => s.deployments)
  const projects = useAppStore((s) => s.projects)
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === env.tenantId))
  const addEnvCapability = useAppStore((s) => s.addEnvCapability)
  const [overrides, setOverrides] = useState<CheckKey[]>([])

  const siblings = useMemo(() => allDeps.filter((d) => d.envId === env.id && d.id !== dep.id), [allDeps, env.id, dep.id])
  const ctx: GenContext = { dep: { ...dep, config }, env, projectName: project?.name ?? dep.serviceName, catalog, project }
  const checks = preDeployChecks({ ...ctx, siblings, tenant, projectNameOf: (id) => projects.find((p) => p.id === id)?.name ?? id })
  const steps = guideSteps(ctx)
  const caps = project ? effectiveCapabilities(project, env, catalog, config.capabilityChoice) : []
  const conflicts = caps.filter((c) => c.source === 'both' && c.item.versions.length > 0 && (c.conflict || config.capabilityChoice[c.item.id]))
  const missing = project ? missingServices(project, env, catalog, config.serviceAccess) : []
  const ready = checksPass(checks, overrides)
  const failing = checks.filter((c) => !c.ok)

  const copyAll = () => {
    const text = steps.map((s) => `# ${s.key}. ${s.title}\n${s.code}`).join('\n\n')
    void navigator.clipboard?.writeText(text)
    toast.success('All steps copied.')
  }
  const download = () => {
    const blob = new Blob([deployScript(ctx)], { type: 'text/x-shellscript' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'deploy.sh'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success('deploy.sh downloaded.')
  }
  const addToEnv = (itemId: string) => {
    const r = addEnvCapability(env.id, itemId)
    if (r.ok) toast.success(`Added ${catalog.find((c) => c.id === itemId)?.name} to “${env.spec.name}”. It’s now available to every project on it.`)
    else toast.error(r.error)
  }

  return (
    <div className="flex flex-col gap-6" aria-label="Review deployment">
      <div className="rounded-card bg-indigo-50 px-4 py-3 text-sm text-indigo-text">
        {mode.kind === 'rollback' ? (
          <>
            Rolling back to <strong>v{mode.version}</strong>. Check the list and the steps below; nothing changes until you confirm.
          </>
        ) : (
          <>Nothing is deployed until you confirm. Check the list, read the steps, then press Confirm &amp; deploy.{dirty ? ' Your unsaved configuration changes are saved when you confirm.' : ''}</>
        )}
      </div>

      <section>
        <h3 className="mb-3 font-heading text-h3 text-text-primary">1. Pre-deploy checklist</h3>
        <ul className="flex flex-col gap-2">
          {checks.map((c) => {
            const overridden = !c.ok && c.severity === 'warning' && overrides.includes(c.key)
            return (
              <li
                key={c.key}
                data-check={c.key}
                data-ok={c.ok}
                className={cn(
                  'flex gap-3 rounded-control border px-3 py-2.5',
                  c.ok ? 'border-border bg-status-running-bg/40' : c.severity === 'warning' ? 'border-tangerine/40 bg-status-pending-bg' : 'border-red/30 bg-status-rejected-bg',
                )}
              >
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal" aria-label="Passed" />
                ) : c.severity === 'warning' ? (
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-status-pending-fg" aria-label="Warning" />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-red-text" aria-label="Failed" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-semibold', c.ok ? 'text-text-primary' : c.severity === 'warning' ? 'text-status-pending-fg' : 'text-status-rejected-fg')}>{c.label}</p>
                  <p className="text-caption text-text-secondary">{c.detail}</p>
                  {!c.ok && c.severity === 'warning' && canOperate && (
                    <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-caption font-semibold text-text-primary">
                      <Checkbox checked={overridden} onCheckedChange={(v) => setOverrides((o) => (v ? [...o, c.key] : o.filter((k) => k !== c.key)))} />
                      Deploy anyway
                    </label>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {(conflicts.length > 0 || missing.length > 0) && (
          <div className="mt-4 flex flex-col gap-3">
            {conflicts.map((c) => {
              const projectV = project?.capabilityVersions[c.item.id] ?? c.item.version
              const envV = env.capabilities.find((x) => x.itemId === c.item.id)?.version ?? c.item.version
              const chosen = config.capabilityChoice[c.item.id]
              return (
                <div key={c.item.id} className="rounded-control border border-border p-3" data-conflict={c.item.id}>
                  <p className="text-sm font-semibold text-text-primary">Version conflict: {c.item.name}</p>
                  <p className="mb-2 text-caption text-text-secondary">The project and the environment use different versions. Choose the one this deployment uses.</p>
                  <RadioGroup
                    value={chosen ?? ''}
                    onValueChange={(v) => onChoices({ capabilityChoice: { [c.item.id]: v } })}
                    className="flex flex-wrap gap-4"
                    aria-label={`Version of ${c.item.name}`}
                    disabled={!canOperate}
                  >
                    {[
                      [projectV, 'Project'],
                      [envV, 'Environment'],
                    ].map(([v, src]) => (
                      <label key={src} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                        <RadioGroupItem value={v!} aria-label={`${c.item.name} ${v} from ${src}`} /> {c.item.name} {v} <Tag>{src}</Tag>
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              )
            })}
            {missing.map((m) => (
              <div key={m.id} className="flex flex-col gap-2 rounded-control border border-border p-3 sm:flex-row sm:items-center" data-missing={m.id}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text-primary">Missing on this environment: {m.name}</p>
                  <p className="text-caption text-text-secondary">The project needs it as a service. Run it on this environment, or reach a platform or external one.</p>
                </div>
                {canOperate && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => addToEnv(m.id)}>
                      <Plus /> Add to environment
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onChoices({ serviceAccess: { [m.id]: 'platform' } })}>
                      Use {SERVICE_ACCESS_LABELS.platform.toLowerCase()}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onChoices({ serviceAccess: { [m.id]: 'external' } })}>
                      Use {SERVICE_ACCESS_LABELS.external.toLowerCase()}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {caps.length > 0 && (
          <div className="mt-4">
            <p className="eyebrow mb-2">Effective capabilities</p>
            <div className="flex flex-wrap gap-1.5">
              {caps.map((c) => (
                <Tag key={c.item.id}>
                  {c.item.name} {c.version} · {SOURCE_LABELS[c.source]}
                  {config.serviceAccess[c.item.id] && config.serviceAccess[c.item.id] !== 'environment' ? ` · ${SERVICE_ACCESS_LABELS[config.serviceAccess[c.item.id]!]}` : ''}
                </Tag>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-h3 text-text-primary">2. Deployment steps</h3>
          <span className="text-caption text-text-secondary">{steps.length} steps, run in this order</span>
        </div>
        <ol className="flex flex-col gap-2">
          {steps.map((s) => (
            <li key={s.key}>
              <details className="group rounded-control border border-border bg-bg-surface open:shadow-card">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-caption font-semibold text-indigo-text">{s.key}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text-primary">{s.title}</span>
                    <span className="block truncate text-caption text-text-secondary">{s.body}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <div className="px-3 pb-3">
                  <CodeBlock code={s.code} label={s.codeLabel} />
                </div>
              </details>
            </li>
          ))}
        </ol>
      </section>

      <section className="sticky bottom-0 -mx-6 flex flex-wrap items-center gap-2 border-t border-border bg-bg-surface px-6 py-3">
        <p className="mr-auto text-caption text-text-secondary" aria-live="polite">
          {ready ? 'All checks passed.' : `${failing.length} check${failing.length === 1 ? '' : 's'} need${failing.length === 1 ? 's' : ''} attention.`}
        </p>
        <Button variant="ghost" onClick={onEdit}>
          <Pencil /> Edit configuration
        </Button>
        <Button variant="secondary" onClick={copyAll}>
          <ClipboardCopy /> Copy all steps
        </Button>
        <Button variant="secondary" onClick={download}>
          <Download /> Download deploy.sh
        </Button>
        {canOperate && (
          <Button onClick={() => onConfirm(overrides)} disabled={!ready || dep.status === 'deploying'}>
            <Rocket /> Confirm &amp; deploy
          </Button>
        )}
      </section>
    </div>
  )
}
