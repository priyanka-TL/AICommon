import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Boxes, Plus, Trash2 } from 'lucide-react'
import type { CatalogItem, Environment } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useEnvDeployments, useScope } from '@/store/selectors'
import { canManageEnvProjects } from '@/lib/deploy'
import { effectiveCapabilities, isServiceItem, missingServices, SOURCE_LABELS } from '@/lib/capabilities'
import { CATEGORY_SINGULAR } from '@/lib/labels'
import { projectPath } from '@/lib/paths'
import { relativeTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

/** Shared services on an environment (available to every project on it) and what each project ends up using. */
export function EnvCapabilitiesTab({ env }: { env: Environment }) {
  const scope = useScope()!
  const catalog = useAppStore((s) => s.catalog)
  const projects = useAppStore((s) => s.projects)
  const users = useAppStore((s) => s.users)
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === env.tenantId))
  const addEnvCapability = useAppStore((s) => s.addEnvCapability)
  const removeEnvCapability = useAppStore((s) => s.removeEnvCapability)
  const deployments = useEnvDeployments(env.id)
  const [itemId, setItemId] = useState('')
  const [version, setVersion] = useState('')
  const [removing, setRemoving] = useState<CatalogItem | null>(null)

  const canManage = canManageEnvProjects(scope.user, env) && !['terminated', 'provisioning_failed'].includes(env.status)
  const item = (id: string) => catalog.find((c) => c.id === id)
  const addable = useMemo(
    () =>
      catalog
        .filter((c) => c.category !== 'llm' && c.category !== 'asr' && c.status !== 'deprecated' && tenant?.enabledItemIds.includes(c.id) && !env.capabilities.some((x) => x.itemId === c.id))
        .sort((a, b) => Number(isServiceItem(b)) - Number(isServiceItem(a)) || a.name.localeCompare(b.name)),
    [catalog, tenant, env.capabilities],
  )
  const picked = item(itemId)
  const hosted = [...new Set(deployments.map((d) => d.projectId))].map((pid) => projects.find((p) => p.id === pid)).filter((p): p is NonNullable<typeof p> => !!p)

  const add = () => {
    if (!picked) return
    const r = addEnvCapability(env.id, picked.id, version || picked.version)
    if (!r.ok) return toast.error(r.error)
    toast.success(`Added ${picked.name} ${version || picked.version}. Every project on “${env.spec.name}” can use it.`)
    setItemId('')
    setVersion('')
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-5 p-6">
        <div>
          <h2 className="font-heading text-h3 text-text-primary">Shared on this environment</h2>
          <p className="mt-0.5 text-caption text-text-secondary">Services and libraries installed once on the environment and available to every project on it, such as a vector database or Langfuse.</p>
        </div>
        {env.capabilities.length === 0 ? (
          <EmptyState icon={Boxes} title="No shared capabilities yet" description="Add a shared service here, or add capabilities to each project instead." className="py-6" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {env.capabilities.map((c) => {
              const it = item(c.itemId)
              if (!it) return null
              return (
                <li key={c.itemId} className="flex items-start gap-3 rounded-control border border-border p-3" data-env-capability={c.itemId}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {it.name} <span className="font-normal text-text-secondary">{c.version}</span>
                    </p>
                    <p className="truncate text-caption text-text-muted">
                      {CATEGORY_SINGULAR[it.category]}
                      {isServiceItem(it) ? ' · service' : ' · library'} · added {relativeTime(c.at)}
                      {users.find((u) => u.id === c.addedById) ? ` by ${users.find((u) => u.id === c.addedById)!.name}` : ''}
                    </p>
                    <div className="mt-1.5">
                      <Tag>{SOURCE_LABELS.environment}</Tag>
                    </div>
                  </div>
                  {canManage && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${it.name}`} onClick={() => setRemoving(it)}>
                      <Trash2 />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {canManage && addable.length > 0 && (
          <div className="flex flex-col gap-2 rounded-control bg-bg-subtle p-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="env-cap-add" className="mb-1 block text-caption font-semibold text-text-secondary">
                Add a shared capability
              </label>
              <Select
                value={itemId}
                onValueChange={(v) => {
                  setItemId(v)
                  setVersion(item(v)?.version ?? '')
                }}
              >
                <SelectTrigger id="env-cap-add" className="bg-bg-surface">
                  <SelectValue placeholder="Choose a service or library" />
                </SelectTrigger>
                <SelectContent>
                  {addable.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {CATEGORY_SINGULAR[c.category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {picked && picked.versions.length > 1 && (
              <div className="sm:w-40">
                <label htmlFor="env-cap-version" className="mb-1 block text-caption font-semibold text-text-secondary">
                  Version
                </label>
                <Select value={version} onValueChange={setVersion}>
                  <SelectTrigger id="env-cap-version" className="bg-bg-surface">
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
              </div>
            )}
            <Button variant="secondary" onClick={add} disabled={!picked}>
              <Plus /> Add to environment
            </Button>
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-4 p-6">
        <div>
          <h2 className="font-heading text-h3 text-text-primary">What each project uses here</h2>
          <p className="mt-0.5 text-caption text-text-secondary">A project’s own capabilities plus the shared ones above. Each item shows where it comes from.</p>
        </div>
        {hosted.length === 0 ? (
          <p className="text-sm text-text-secondary">No projects on this environment yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {hosted.map((p) => {
              const dep = deployments.find((d) => d.projectId === p.id)
              const caps = effectiveCapabilities(p, env, catalog, dep?.config.capabilityChoice)
              const missing = new Set(missingServices(p, env, catalog, dep?.config.serviceAccess).map((m) => m.id))
              return (
                <li key={p.id} className="rounded-control border border-border p-4" data-project-caps={p.id}>
                  <Link to={projectPath(scope.role, p.id, 'capabilities')} className="font-semibold text-text-primary hover:text-indigo-text">
                    {p.name}
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

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? ''} from this environment?`}
        description="Projects that rely on it will show it as missing until they use their own, a platform service or an external one. Running services keep running until they are redeployed."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (!removing) return
          const r = removeEnvCapability(env.id, removing.id)
          if (r.ok) toast.success(`Removed ${removing.name} from “${env.spec.name}”.`)
          else toast.error(r.error)
          setRemoving(null)
        }}
      />
    </div>
  )
}
