import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, Archive, ArchiveRestore, ArrowUpCircle, GitBranch, Plus, Rocket, Save, Server, Trash2 } from 'lucide-react'
import type { CatalogItem, Environment, ModelPlacement, Project } from '@/data/types'
import { useAppStore, type ProjectInput } from '@/store/useAppStore'
import { useScope, useScopedEnvironments, useScopedProjects } from '@/store/selectors'
import { canEditProject } from '@/lib/roles'
import { canOperateDeployment, capacityShortfall, deploymentUrl, envCapacity, isStatic, limitsUsed, runtimeLabel, shortfallText } from '@/lib/deploy'
import { effectiveCapabilities, isModelItem, isServiceItem, missingServices, projectVersion, SOURCE_LABELS } from '@/lib/capabilities'
import { summariseProject } from '@/lib/projects'
import { CATEGORY_SINGULAR, dataClassLabel } from '@/lib/labels'
import { isPlatformModel, modelPriceAt, placementProblem, unitPrices } from '@/lib/modelCost'
import { useProjectModelCost } from '@/hooks/useModelCost'
import { KeyManagedBy, PlatformModelPicker, priceLabel } from '@/components/shared/PlatformModelPicker'
import { ProjectCostCard } from '@/components/shared/ProjectCostCard'
import { envPath, projectsPath, requestPath } from '@/lib/paths'
import { formatCompact, formatDate, formatDateTime, formatINR, relativeTime } from '@/lib/format'
import { PageHeader } from '@/components/layout/PageHeader'
import { ActivityFeed } from '@/components/shared/ActivityFeed'
import { Avatar } from '@/components/shared/Avatar'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { QuotaBar } from '@/components/shared/QuotaBar'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Tooltip } from '@/components/ui/tooltip'
import { DeploymentSheet, type DeploymentTab } from '@/components/deploy/DeploymentSheet'
import { ACCESS_LABELS, ProjectForm, projectToInput, projectTypeLabel } from '@/components/projects/ProjectForm'
import { ProjectStatusBadge } from './Projects'
import NotFound from '@/pages/NotFound'

type Tab = 'overview' | 'capabilities' | 'environments' | 'settings' | 'activity'
const TABS: Tab[] = ['overview', 'capabilities', 'environments', 'settings', 'activity']

export default function ProjectDetail() {
  const { id } = useParams()
  const scope = useScope()!
  const [params, setParams] = useSearchParams()
  const projects = useScopedProjects()
  const project = projects.find((p) => p.id === id)
  const deployments = useAppStore((s) => s.deployments)
  const environments = useAppStore((s) => s.environments)
  const users = useAppStore((s) => s.users)
  const audit = useAppStore((s) => s.audit)
  const [deployOpen, setDeployOpen] = useState(false)
  const [sheet, setSheet] = useState<{ depId: string; tab?: DeploymentTab } | null>(null)

  const summary = useMemo(() => (project ? summariseProject(project, deployments, environments) : null), [project, deployments, environments])
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'overview'
  const setTab = (t: string) => {
    const next = new URLSearchParams(params)
    if (t === 'overview') next.delete('tab')
    else next.set('tab', t)
    setParams(next, { replace: true })
  }

  if (!project || !summary) return <NotFound message="This project doesn’t exist or you aren’t a member of it." />

  const canEdit = canEditProject(scope.user, project)
  const userName = (uid: string) => users.find((u) => u.id === uid)?.name ?? 'Someone'
  const depIds = new Set(deployments.filter((d) => d.projectId === project.id).map((d) => d.id))
  const activity = audit.filter((a) => (a.entityType === 'project' && a.entityId === project.id) || (a.entityType === 'deployment' && depIds.has(a.entityId)))
  const sheetDep = sheet ? deployments.find((d) => d.id === sheet.depId) : undefined
  const sheetEnv = sheetDep ? environments.find((e) => e.id === sheetDep.envId) : undefined

  return (
    <>
      <PageHeader
        eyebrow={`Project · ${projectTypeLabel(project.type)}`}
        title={project.name}
        description={project.description || 'No description yet.'}
        actions={
          project.status === 'active' &&
          canEdit && (
            <Button onClick={() => setDeployOpen(true)}>
              <Rocket /> Deploy to environment
            </Button>
          )
        }
      />
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-2 text-caption text-text-secondary">
        <ProjectStatusBadge project={project} summary={summary} />
        <span data-testid="last-updated">
          Last updated by {userName(project.updatedById)} on {formatDateTime(project.updatedAt)}
        </span>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="capabilities">AI Models &amp; Capabilities ({project.capabilityIds.length})</TabsTrigger>
          <TabsTrigger value="environments">Environments &amp; Deployments ({summary.deployments.length})</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-5">
          <Overview project={project} summary={summary} onOpenTab={setTab} />
        </TabsContent>
        <TabsContent value="capabilities" className="pt-5">
          {tab === 'capabilities' && <CapabilitiesTab project={project} canEdit={canEdit} envs={summary.environments} />}
        </TabsContent>
        <TabsContent value="environments" className="pt-5">
          {tab === 'environments' && (
            <EnvironmentsTab project={project} summary={summary} canEdit={canEdit} onDeploy={() => setDeployOpen(true)} onOpen={(depId, t) => setSheet({ depId, tab: t })} />
          )}
        </TabsContent>
        <TabsContent value="settings" className="pt-5">
          {tab === 'settings' && <SettingsTab project={project} canEdit={canEdit} summary={summary} />}
        </TabsContent>
        <TabsContent value="activity" className="pt-5">
          <section className="card p-6">
            <h2 className="mb-1 font-heading text-h3 text-text-primary">Activity</h2>
            <p className="mb-4 text-caption text-text-secondary">Every change to this project and its deployments.</p>
            {activity.length === 0 ? <p className="text-sm text-text-secondary">Nothing yet.</p> : <ActivityFeed items={activity} />}
          </section>
        </TabsContent>
      </Tabs>

      {deployOpen && (
        <DeployToEnvironmentDialog
          project={project}
          onOpenChange={setDeployOpen}
          onAdded={(depId) => {
            setTab('environments')
            setSheet({ depId, tab: 'review' })
          }}
        />
      )}
      {sheetEnv && <DeploymentSheet depId={sheet?.depId ?? null} env={sheetEnv} initialTab={sheet?.tab} onOpenChange={(o) => !o && setSheet(null)} />}
    </>
  )
}

/* ---------- overview ---------- */

function Overview({ project, summary, onOpenTab }: { project: Project; summary: ReturnType<typeof summariseProject>; onOpenTab: (t: Tab) => void }) {
  const users = useAppStore((s) => s.users)
  const catalog = useAppStore((s) => s.catalog)
  const owner = users.find((u) => u.id === project.ownerId)
  const caps = project.capabilityIds.map((cid) => catalog.find((c) => c.id === cid)).filter((c): c is CatalogItem => !!c)
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <ProjectCostCard project={project} envs={summary.environments} />
        <section className="card p-6">
          <h2 className="mb-4 font-heading text-h3 text-text-primary">Summary</h2>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Item label="Type">{projectTypeLabel(project.type)}</Item>
            <Item label="Data classification">{dataClassLabel(project.dataClassification)}</Item>
            <Item label="Default runtime">{runtimeLabel(project.defaultRuntime, project.defaultRuntimeVersion)}</Item>
            <Item label="Repository">
              {project.repoUrl ? (
                <span className="flex items-center gap-1.5 font-mono text-caption">
                  <GitBranch className="size-3.5 shrink-0 text-text-muted" aria-hidden />
                  <span className="truncate">{project.repoUrl}</span>
                  <span className="text-text-muted">#{project.defaultBranch}</span>
                </span>
              ) : (
                'Not set'
              )}
            </Item>
            <Item label="Owner">{owner?.name ?? 'Someone'}</Item>
            <Item label="Created">{formatDate(project.createdAt)}</Item>
            <Item label="Last deployed">{summary.lastDeployedAt ? relativeTime(summary.lastDeployedAt) : 'Never'}</Item>
          </dl>
        </section>
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-heading text-h3 text-text-primary">Environments ({summary.environments.length})</h2>
            <Button variant="ghost" size="sm" onClick={() => onOpenTab('environments')}>
              See deployments
            </Button>
          </div>
          {summary.deployments.length === 0 ? (
            <p className="text-sm text-text-secondary">Not on any environment yet. Use Deploy to environment to add it to one.</p>
          ) : (
            <ul className="divide-y divide-border">
              {summary.deployments.map((d) => {
                const env = summary.environments.find((e) => e.id === d.envId)!
                return (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="flex min-w-0 items-center gap-2 font-semibold text-text-primary">
                      <Server className="size-4 shrink-0 text-text-muted" aria-hidden /> <span className="truncate">{env.spec.name}</span>
                    </span>
                    <StatusBadge status={d.status === 'stopped' ? 'stopped' : d.status} />
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
      <div className="flex flex-col gap-6">
        <section className="card p-6">
          <h2 className="mb-4 font-heading text-h3 text-text-primary">Members ({project.memberIds.length + 1})</h2>
          <ul className="flex flex-col gap-3">
            {[project.ownerId, ...project.memberIds.filter((m) => m !== project.ownerId)].map((m) => {
              const u = users.find((x) => x.id === m)
              if (!u) return null
              return (
                <li key={m} className="flex items-center gap-3">
                  <Avatar name={u.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{u.name}</span>
                  <Tag>{m === project.ownerId ? 'Owner' : ACCESS_LABELS[project.memberAccess[m] ?? 'viewer']}</Tag>
                </li>
              )
            })}
          </ul>
        </section>
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-heading text-h3 text-text-primary">Capabilities ({caps.length})</h2>
            <Button variant="ghost" size="sm" onClick={() => onOpenTab('capabilities')}>
              Manage
            </Button>
          </div>
          {caps.length === 0 ? (
            <p className="text-sm text-text-secondary">None yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {caps.map((c) => (
                <Tag key={c.id}>
                  {c.name} {projectVersion(project, c)}
                </Tag>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="truncate text-text-primary">{children}</dd>
    </div>
  )
}

/* ---------- capabilities & models ---------- */

function CapabilitiesTab({ project, canEdit, envs }: { project: Project; canEdit: boolean; envs: Environment[] }) {
  const scope = useScope()!
  const catalog = useAppStore((s) => s.catalog)
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === project.tenantId))
  const infraProviders = useAppStore((s) => s.infraProviders)
  const deployments = useAppStore((s) => s.deployments)
  const add = useAppStore((s) => s.addProjectCapability)
  const remove = useAppStore((s) => s.removeProjectCapability)
  const setVersion = useAppStore((s) => s.setProjectCapabilityVersion)
  const [itemId, setItemId] = useState('')
  const [version, setVersionDraft] = useState('')
  const [placement, setPlacement] = useState<ModelPlacement | null>(null)
  const cost = useProjectModelCost(project.id)

  const own = project.capabilityIds.map((cid) => catalog.find((c) => c.id === cid)).filter((c): c is CatalogItem => !!c)
  const addable = catalog
    .filter((c) => tenant?.enabledItemIds.includes(c.id) && c.status !== 'deprecated' && !project.capabilityIds.includes(c.id))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  const picked = catalog.find((c) => c.id === itemId)
  const pickedIsModel = isPlatformModel(picked)

  const submit = () => {
    if (!picked) return
    const r = add(project.id, picked.id, pickedIsModel ? (placement ?? undefined) : undefined, version || picked.version)
    if (!r.ok) return toast.error(r.error)
    toast.success(`Added ${picked.name} ${version || picked.version} to ${project.name}.`)
    setItemId('')
    setVersionDraft('')
    setPlacement(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-4 p-6">
        <div>
          <h2 className="font-heading text-h3 text-text-primary">Used by this project</h2>
          <p className="mt-0.5 text-caption text-text-secondary">Libraries, models and services this project needs. They travel with it to every environment it is deployed on.</p>
        </div>
        {own.length === 0 ? (
          <p className="text-sm text-text-secondary">None yet.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {own.map((c) => {
              const place = project.platformModels[c.id]
              const provider = place ? infraProviders.find((p) => p.id === place.providerId) : undefined
              const region = provider?.regions.find((r) => r.id === place?.regionId)
              const { price, card } = modelPriceAt(provider, c.id)
              const unit = price ? unitPrices(price, card, tenant) : null
              const used = cost.byModel.find((g) => g.key === c.id)
              const problem = isPlatformModel(c) ? (place ? placementProblem(project, c.id, infraProviders, tenant) : 'No provider serves this model for the project yet. Remove it and add it again to choose one.') : null
              const projected = used ? (used.cost / Math.max(1, cost.total)) * cost.projected : 0
              return (
                <li key={c.id} className="flex items-start gap-3 rounded-control border border-border p-3" data-project-capability={c.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">{c.name}</p>
                    <p className="truncate text-caption text-text-muted">
                      {CATEGORY_SINGULAR[c.category]}
                      {isServiceItem(c) ? ' · service' : isModelItem(c) ? ' · model' : ' · library'}
                    </p>
                    {isPlatformModel(c) && provider && (
                      <div className="mt-2 flex flex-col gap-1 text-caption text-text-secondary" data-testid="platform-model-row">
                        <span>
                          <span className="font-semibold text-text-primary">{provider.name}</span>
                          {region ? ` · ${region.name}` : ''}
                        </span>
                        {unit && <span className="tabular">{priceLabel({ inputPer1M: unit.input, outputPer1M: unit.output, perMinute: unit.perMinute, speech: unit.speech })}</span>}
                        <dl className="mt-1 grid grid-cols-3 gap-2">
                          <div>
                            <dt className="text-text-muted">{unit?.speech ? 'Minutes' : 'Tokens'} this month</dt>
                            <dd className="tabular font-semibold text-text-primary">{used ? formatCompact(unit?.speech ? used.audioMinutes : used.inputTokens + used.outputTokens) : '0'}</dd>
                          </div>
                          <div>
                            <dt className="text-text-muted">Cost this month</dt>
                            <dd className="tabular font-semibold text-text-primary" data-testid="model-cost-mtd">{formatINR(used?.cost ?? 0)}</dd>
                          </div>
                          <div>
                            <dt className="text-text-muted">Projected</dt>
                            <dd className="tabular font-semibold text-text-primary">{formatINR(projected)}</dd>
                          </div>
                        </dl>
                        <KeyManagedBy providerName={provider.name} />
                      </div>
                    )}
                    {problem && (
                      <p className="mt-2 flex items-start gap-1.5 text-caption text-red-text" role="alert">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {problem}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Tag>{SOURCE_LABELS.project}</Tag>
                      {c.versions.length > 1 && canEdit ? (
                        <Select
                          value={projectVersion(project, c)}
                          onValueChange={(v) => {
                            const r = setVersion(project.id, c.id, v)
                            if (r.ok) toast.success(`${c.name} set to ${v}.`)
                            else toast.error(r.error)
                          }}
                        >
                          <SelectTrigger className="h-7 w-auto gap-1.5 px-2 text-caption" aria-label={`${c.name} version`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {c.versions.map((v) => (
                              <SelectItem key={v} value={v}>
                                {v}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-caption text-text-secondary">{projectVersion(project, c)}</span>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${c.name}`}
                      onClick={() => {
                        const r = remove(project.id, c.id)
                        if (r.ok) toast.success(`Removed ${c.name} from ${project.name}.`)
                        else toast.error(r.error)
                      }}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {canEdit && addable.length > 0 && (
          <div className="flex flex-col gap-4 rounded-control bg-bg-subtle p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <Field label="Add a capability or model" htmlFor="pj-cap-add" className="flex-1">
              <Select
                value={itemId}
                onValueChange={(v) => {
                  setItemId(v)
                  setVersionDraft(catalog.find((c) => c.id === v)?.version ?? '')
                  setPlacement(null)
                }}
              >
                <SelectTrigger id="pj-cap-add" className="bg-bg-surface">
                  <SelectValue placeholder="Choose from the marketplace" />
                </SelectTrigger>
                <SelectContent>
                  {addable.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {CATEGORY_SINGULAR[c.category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {picked && picked.versions.length > 1 && (
              <Field label="Version" htmlFor="pj-cap-version" className="md:w-44">
                <Select value={version} onValueChange={setVersionDraft}>
                  <SelectTrigger id="pj-cap-version" className="bg-bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {picked.versions.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {!pickedIsModel && (
              <Button variant="secondary" onClick={submit} disabled={!picked}>
                <Plus /> Add to project
              </Button>
            )}
          </div>
          {picked && pickedIsModel && (
            <>
              <PlatformModelPicker item={picked} tenant={tenant} classification={project.dataClassification} value={placement} onChange={setPlacement} />
              <div>
                <Button variant="secondary" onClick={submit} disabled={!placement}>
                  <Plus /> Add to project
                </Button>
              </div>
            </>
          )}
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-4 p-6">
        <div>
          <h2 className="font-heading text-h3 text-text-primary">From its environments</h2>
          <p className="mt-0.5 text-caption text-text-secondary">Shared capabilities on each environment this project is on, merged with the project’s own.</p>
        </div>
        {envs.length === 0 ? (
          <p className="text-sm text-text-secondary">Not on any environment yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {envs.map((env) => {
              const dep = deployments.find((d) => d.envId === env.id && d.projectId === project.id)
              const caps = effectiveCapabilities(project, env, catalog, dep?.config.capabilityChoice)
              const missing = new Set(missingServices(project, env, catalog, dep?.config.serviceAccess).map((m) => m.id))
              return (
                <li key={env.id} className="rounded-control border border-border p-4">
                  <Link to={`${envPath(scope.role, env.id)}?tab=capabilities`} className="font-semibold text-text-primary hover:text-indigo-text">
                    {env.spec.name}
                  </Link>
                  {caps.length === 0 ? (
                    <p className="mt-1 text-caption text-text-secondary">No capabilities.</p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {caps.map((c) => (
                        <li key={c.item.id} className="flex items-center gap-1" data-source={c.source} data-item={c.item.id}>
                          <Tag>
                            {c.item.name} {c.version} · {SOURCE_LABELS[c.source]}
                          </Tag>
                          {c.conflict && <StatusBadge status="changes_requested" label={`Conflict ${c.conflict.project} / ${c.conflict.environment}`} />}
                          {missing.has(c.item.id) && <StatusBadge status="suspended" label="Missing on this environment" />}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

/* ---------- environments & deployments ---------- */

function EnvironmentsTab({
  project,
  summary,
  canEdit,
  onDeploy,
  onOpen,
}: {
  project: Project
  summary: ReturnType<typeof summariseProject>
  canEdit: boolean
  onDeploy: () => void
  onOpen: (depId: string, tab?: DeploymentTab) => void
}) {
  const scope = useScope()!
  const users = useAppStore((s) => s.users)
  if (summary.deployments.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={Server}
          title="Not on any environment yet"
          description="Deploy this project to an Active environment you can use. You’ll see the checklist and every step before anything runs."
          action={
            canEdit && project.status === 'active' ? (
              <Button onClick={onDeploy}>
                <Rocket /> Deploy to environment
              </Button>
            ) : undefined
          }
        />
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-4">
      {summary.deployments.map((d) => {
        const env = summary.environments.find((e) => e.id === d.envId)!
        const can = canOperateDeployment(scope.user, env, project)
        const last = d.history[d.history.length - 1]
        return (
          <li key={d.id} className="card flex flex-col gap-3 p-5 md:flex-row md:items-center" data-deployment={d.id}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`${envPath(scope.role, env.id)}?tab=projects&deployment=${d.id}`} className="font-semibold text-text-primary hover:text-indigo-text">
                  {env.spec.name}
                </Link>
                <StatusBadge status={d.status === 'stopped' ? 'stopped' : d.status} />
                {env.status !== 'active' && <StatusBadge status={env.status} />}
              </div>
              <p className="mt-0.5 truncate text-caption text-text-secondary">
                {runtimeLabel(d.config.runtime, d.config.runtimeVersion)}
                {!isStatic(d.config) ? ` · port ${d.config.port}` : ''} · <span className="font-mono">{deploymentUrl(d.config, env).replace(/^https:\/\//, '')}</span>
              </p>
              <p className="text-caption text-text-muted">{last ? `v${last.version} by ${users.find((u) => u.id === last.byId)?.name ?? 'System'} · ${relativeTime(last.at)}` : 'Never deployed'}</p>
              {d.status === 'failed' && d.lastRun?.error && (
                <p className="mt-1 flex items-start gap-1.5 text-caption text-red-text">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Failed at {d.lastRun.failedStep}: {d.lastRun.error}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="compact" onClick={() => onOpen(d.id, 'config')}>
                Configure
              </Button>
              <Button variant="ghost" size="compact" onClick={() => onOpen(d.id, d.lastRun ? 'runs' : 'review')}>
                Steps and logs
              </Button>
              {can && d.status !== 'deploying' && (
                <Button variant="secondary" size="compact" onClick={() => onOpen(d.id, 'review')}>
                  <Rocket /> {d.status === 'not_deployed' ? 'Deploy' : 'Redeploy'}
                </Button>
              )}
            </div>
          </li>
        )
      })}
      {canEdit && project.status === 'active' && (
        <li>
          <Button variant="secondary" onClick={onDeploy}>
            <Plus /> Deploy to another environment
          </Button>
        </li>
      )}
    </ul>
  )
}

/** Pick an Active environment, check capacity, add the project, then open the review. */
function DeployToEnvironmentDialog({ project, onOpenChange, onAdded }: { project: Project; onOpenChange: (o: boolean) => void; onAdded: (depId: string) => void }) {
  const scope = useScope()!
  const environments = useScopedEnvironments()
  const deployments = useAppStore((s) => s.deployments)
  const addProjectsToEnv = useAppStore((s) => s.addProjectsToEnv)
  const requestEnvUpgrade = useAppStore((s) => s.requestEnvUpgrade)
  const navigate = useNavigate()
  const candidates = environments.filter((e) => e.status === 'active' && e.tenantId === project.tenantId && !deployments.some((d) => d.envId === e.id && d.projectId === project.id))
  const [envId, setEnvId] = useState(candidates[0]?.id ?? '')
  const [limits, setLimits] = useState({ vcpu: 1, ramGb: 2 })
  const env = candidates.find((e) => e.id === envId)
  const siblings = env ? deployments.filter((d) => d.envId === env.id) : []
  const short = env ? capacityShortfall(env, siblings, limits) : null
  const cap = env ? envCapacity(env) : { vcpu: 0, ramGb: 0 }
  const used = limitsUsed(siblings)
  useEffect(() => {
    if (!env && candidates[0]) setEnvId(candidates[0].id)
  }, [env, candidates])

  const add = () => {
    if (!env) return
    const r = addProjectsToEnv(env.id, [{ projectId: project.id, limits }])
    if (!r.ok) return toast.error(r.error)
    toast.success(`Added ${project.name} to “${env.spec.name}”. Review the steps, then confirm to deploy.`)
    onOpenChange(false)
    onAdded(r.id!)
  }
  const upgrade = () => {
    if (!env || !short) return
    const res = requestEnvUpgrade(env.id, limits, `Room for ${project.name}: it needs ${shortfallText(short)} more than “${env.spec.name}” has.`)
    if (res.mode === 'error') return toast.error(res.error)
    if (res.mode === 'applied') return toast.success('The environment was upgraded. You can add the project now.')
    toast.success('Upgrade request sent for review.', { action: { label: 'See request', onClick: () => navigate(requestPath(scope.role, res.id)) } })
    onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader title={`Deploy ${project.name}`} description="Choose an Active environment you can use. Nothing is deployed yet: you’ll review the checklist and every step first." />
        <DialogBody className="flex flex-col gap-4">
          {candidates.length === 0 ? (
            <EmptyState
              icon={Server}
              title="No Active environment available"
              description="This project is already on every Active environment you can use, or none are running. Request an environment, or start a stopped one."
              className="py-6"
            />
          ) : (
            <>
              <Field label="Environment" htmlFor="dte-env" required>
                <Select value={envId} onValueChange={setEnvId}>
                  <SelectTrigger id="dte-env">
                    <SelectValue placeholder="Choose an environment" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.spec.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="vCPU" htmlFor="dte-cpu">
                  <Input id="dte-cpu" type="number" min={0.5} step={0.5} value={limits.vcpu} onChange={(e) => setLimits({ ...limits, vcpu: Number(e.target.value) })} className="w-28" />
                </Field>
                <Field label="RAM (GB)" htmlFor="dte-ram">
                  <Input id="dte-ram" type="number" min={0.5} step={0.5} value={limits.ramGb} onChange={(e) => setLimits({ ...limits, ramGb: Number(e.target.value) })} className="w-28" />
                </Field>
              </div>
              {env && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <QuotaBar label="vCPU reserved" used={used.vcpu} projected={limits.vcpu} total={cap.vcpu} unit="vCPU" compact />
                  <QuotaBar label="RAM reserved" used={used.ramGb} projected={limits.ramGb} total={cap.ramGb} unit="GB" compact />
                </div>
              )}
              {short && (
                <div className="flex flex-col gap-3 rounded-card bg-status-over-bg p-4 text-sm text-status-over-fg sm:flex-row sm:items-center">
                  <AlertTriangle className="size-5 shrink-0" aria-hidden />
                  <p className="flex-1">
                    <span className="font-semibold">Not enough room.</span> {project.name} needs {shortfallText(short)} more than “{env?.spec.name}” has. Lower the limits or request an upgrade.
                  </p>
                  <Button variant="secondary" onClick={upgrade} className="shrink-0">
                    <ArrowUpCircle /> Request upgrade
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={add} disabled={!env || !!short || !(limits.vcpu > 0 && limits.ramGb > 0)}>
            Continue to review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- settings ---------- */

function SettingsTab({ project, canEdit, summary }: { project: Project; canEdit: boolean; summary: ReturnType<typeof summariseProject> }) {
  const scope = useScope()!
  const users = useAppStore((s) => s.users)
  const updateProject = useAppStore((s) => s.updateProject)
  const navigate = useNavigate()
  const [draft, setDraft] = useState<ProjectInput>(() => projectToInput(project))
  const [error, setError] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  useEffect(() => setDraft(projectToInput(project)), [project])
  const dirty = JSON.stringify(draft) !== JSON.stringify(projectToInput(project))
  const live = summary.deployments.filter((d) => d.status === 'running' || d.status === 'deploying')
  const archiveBlocked = live.length ? `Running on ${live.map((d) => `“${summary.environments.find((e) => e.id === d.envId)?.spec.name}”`).join(', ')}. Stop it there before archiving.` : null

  const save = () => {
    const r = updateProject(project.id, draft)
    if (!r.ok) return setError(r.error)
    setError(null)
    toast.success(`Saved ${draft.name.trim()}.`)
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="card p-6">
        <h2 className="mb-1 font-heading text-h3 text-text-primary">Project details</h2>
        <p className="mb-5 text-caption text-text-secondary">
          {canEdit ? 'Every change is recorded in the activity log.' : 'You can view this project. Ask its owner or your Tenant Admin for edit rights to change it.'}
        </p>
        <ProjectForm
          value={draft}
          onChange={(v) => {
            setDraft(v)
            setError(null)
          }}
          error={error}
          people={users.filter((u) => u.tenantId === project.tenantId && u.status === 'active' && (u.role === 'user' || u.role === 'tenant_admin'))}
          ownerId={project.ownerId}
          disabled={!canEdit}
        />
        {canEdit && (
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            {dirty && <span className="mr-auto self-center text-caption text-text-secondary">Unsaved changes</span>}
            <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(projectToInput(project))}>
              Discard changes
            </Button>
            <Button onClick={save} disabled={!dirty}>
              <Save /> Save project
            </Button>
          </div>
        )}
      </section>
      <section className="card flex h-fit flex-col gap-3 p-6">
        <h2 className="font-heading text-h3 text-text-primary">Status</h2>
        <div className="flex items-center gap-2">
          {project.status === 'archived' ? <StatusBadge status="stopped" label="Archived" /> : <StatusBadge status="active" label="Active" />}
        </div>
        <p className="text-caption text-text-secondary">
          {project.status === 'archived' ? 'Archived projects can’t be deployed or added to environments. Restore it to use it again.' : 'Archive a project you no longer work on. You can restore it later.'}
        </p>
        {canEdit &&
          (project.status === 'active' ? (
            archiveBlocked ? (
              <Tooltip content={archiveBlocked}>
                <span className="w-fit">
                  <Button variant="secondary" disabled>
                    <Archive /> Archive project
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button variant="secondary" className="w-fit" onClick={() => setArchiveOpen(true)}>
                <Archive /> Archive project
              </Button>
            )
          ) : (
            <Button
              variant="secondary"
              className="w-fit"
              onClick={() => {
                const r = updateProject(project.id, { status: 'active' })
                if (r.ok) toast.success(`${project.name} restored.`)
                else toast.error(r.error)
              }}
            >
              <ArchiveRestore /> Restore project
            </Button>
          ))}
        {archiveBlocked && project.status === 'active' && <p className="text-caption text-status-over-fg">{archiveBlocked}</p>}
      </section>
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archive ${project.name}?`}
        description="It can’t be deployed or added to environments while archived. Its deployment settings are kept. You can restore it later."
        confirmLabel="Archive project"
        destructive
        onConfirm={() => {
          const r = updateProject(project.id, { status: 'archived' })
          if (r.ok) {
            toast.success(`${project.name} archived.`)
            navigate(projectsPath(scope.role))
          } else toast.error(r.error)
        }}
      />
    </div>
  )
}
