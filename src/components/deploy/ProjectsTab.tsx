import { useState } from 'react'
import { toast } from 'sonner'
import { ExternalLink, FolderKanban, FolderPlus, History, Plus, Rocket, Settings2, Square, Trash2 } from 'lucide-react'
import type { Deployment, Environment } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useEnvDeployments, useScope } from '@/store/selectors'
import { canManageEnvProjects, canOperateDeployment, deploymentUrl, envCapacity, isStatic, limitsUsed, missingDependencies, runtimeLabel } from '@/lib/deploy'
import { capabilityConflicts, missingServices } from '@/lib/capabilities'
import { formatInt } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { DataTable, StopRowClick, type Column } from '@/components/shared/DataTable'
import { RowActions } from '@/components/shared/RowActions'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { QuotaBar } from '@/components/shared/QuotaBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { AddProjectDialog } from './AddProjectDialog'
import { DeploymentSheet, type DeploymentTab } from './DeploymentSheet'

export function ProjectsTab({ env, openId, onOpen }: { env: Environment; openId: string | null; onOpen: (id: string | null) => void }) {
  const scope = useScope()!
  const deployments = useEnvDeployments(env.id)
  const projects = useAppStore((s) => s.projects)
  const catalog = useAppStore((s) => s.catalog)
  const stop = useAppStore((s) => s.stopDeployment)
  const remove = useAppStore((s) => s.removeDeployment)
  const [adding, setAdding] = useState<null | 'existing' | 'create'>(null)
  const [sheetTab, setSheetTab] = useState<DeploymentTab | undefined>(undefined)
  const open = (id: string, tab?: DeploymentTab) => {
    setSheetTab(tab)
    onOpen(id)
  }
  const [removing, setRemoving] = useState<Deployment | null>(null)

  const canManage = canManageEnvProjects(scope.user, env)
  const canAdd = canManage && (env.status === 'active' || env.status === 'stopped')
  const project = (d: Deployment) => projects.find((p) => p.id === d.projectId)
  const name = (d: Deployment) => project(d)?.name ?? d.serviceName
  const cap = envCapacity(env)
  const used = limitsUsed(deployments)

  const act = (r: { ok: true } | { ok: false; error: string }, msg: string) => (r.ok ? toast.success(msg) : toast.error(r.error))

  const columns: Column<Deployment>[] = [
    {
      key: 'project',
      header: 'Project',
      cell: (d) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-text-primary">{name(d)}</p>
          <p className="truncate text-caption text-text-muted">
            {runtimeLabel(d.config.runtime, d.config.runtimeVersion)} · {d.serviceName}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (d) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={d.status === 'stopped' ? 'stopped' : d.status} />
          {missingDependencies(env, d.config).length > 0 && <Tag>Needs model</Tag>}
          {project(d) && capabilityConflicts(project(d)!, env, catalog, d.config.capabilityChoice).length > 0 && <Tag>Version conflict</Tag>}
          {project(d) && missingServices(project(d)!, env, catalog, d.config.serviceAccess).length > 0 && <Tag>Missing service</Tag>}
        </div>
      ),
    },
    { key: 'port', header: 'Port', align: 'right', cell: (d) => <span className="tabular">{isStatic(d.config) ? '—' : d.config.port}</span> },
    {
      key: 'url',
      header: 'URL',
      className: 'hidden lg:table-cell',
      cell: (d) => (
        <StopRowClick>
          <a href={deploymentUrl(d.config, env)} target="_blank" rel="noreferrer" className="link inline-flex max-w-[240px] items-center gap-1 truncate font-mono text-caption">
            <span className="truncate">{deploymentUrl(d.config, env).replace(/^https:\/\//, '')}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        </StopRowClick>
      ),
    },
    {
      key: 'usage',
      header: 'Usage',
      className: 'hidden xl:table-cell',
      cell: (d) => (
        <div className="w-40">
          <QuotaBar label={`${d.usage.cpuPct}% CPU`} used={d.usage.ramGb} total={d.config.limits.ramGb} unit="GB RAM" compact />
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (d) => {
        const can = canOperateDeployment(scope.user, env, project(d))
        const good = d.history.filter((h) => h.status === 'running' || h.status === 'superseded')
        return (
          <RowActions
            label={name(d)}
            actions={[
              { label: 'Configure', icon: Settings2, onSelect: () => open(d.id, 'config') },
              can && d.status !== 'deploying' && {
                // Never deploys directly: opens the review with the checklist and generated steps.
                label: d.status === 'not_deployed' ? 'Deploy' : 'Redeploy',
                icon: Rocket,
                onSelect: () => open(d.id, 'review'),
              },
              can && (d.status === 'running' || d.status === 'deploying') && { label: 'Stop', icon: Square, onSelect: () => act(stop(d.id), `${name(d)} stopped.`) },
              can && env.status === 'active' && d.status !== 'deploying' && good.length > (d.status === 'running' ? 1 : 0) && {
                label: 'History and rollback',
                icon: History,
                onSelect: () => open(d.id, 'history'),
              },
              canManage && { label: 'Remove from environment', icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => setRemoving(d) },
            ]}
          />
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-h3 text-text-primary">Projects on this environment</h2>
            <p className="mt-0.5 text-caption text-text-secondary">
              {deployments.length === 0
                ? 'No projects yet.'
                : `${deployments.length} project${deployments.length === 1 ? '' : 's'} · ${deployments.filter((d) => d.status === 'running').length} running. Each has its own service, port and Nginx route.`}
            </p>
          </div>
          {canAdd && deployments.length > 0 && (
            <Button variant="secondary" onClick={() => setAdding('existing')}>
              <FolderPlus /> Add project
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <QuotaBar label="vCPU reserved by projects" used={used.vcpu} total={cap.vcpu} unit="vCPU" compact />
          <QuotaBar label="RAM reserved by projects" used={used.ramGb} total={cap.ramGb} unit="GB" compact />
        </div>
        {env.status !== 'active' && (
          <p className="rounded-control bg-bg-subtle px-3 py-2 text-caption text-text-secondary">
            {env.status === 'stopped' ? 'The environment is stopped. You can still add and configure projects; start it to deploy.' : 'Projects can be deployed once the environment is active.'}
          </p>
        )}
      </section>

      <DataTable
        rows={deployments}
        columns={columns}
        rowKey={(d) => d.id}
        rowLabel={(d) => `Open ${name(d)}`}
        onRowClick={(d) => open(d.id)}
        mobileCard={(d) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-text-primary">{name(d)}</p>
                <p className="truncate text-caption text-text-muted">
                  {runtimeLabel(d.config.runtime, d.config.runtimeVersion)}
                  {!isStatic(d.config) && ` · port ${d.config.port}`}
                </p>
              </div>
              <StatusBadge status={d.status === 'stopped' ? 'stopped' : d.status} />
            </div>
            <p className="truncate font-mono text-caption text-text-secondary">{deploymentUrl(d.config, env).replace(/^https:\/\//, '')}</p>
            <p className="text-caption text-text-muted">
              {d.usage.cpuPct}% CPU · {d.usage.ramGb} of {formatInt(d.config.limits.ramGb)} GB RAM
            </p>
          </div>
        )}
        empty={
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description={canAdd ? 'Add an existing project or create a new one, then configure how it is built, started and routed.' : 'The environment owner or an admin can add projects to it.'}
            action={
              canAdd ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => setAdding('existing')}>
                    <FolderPlus /> Add project
                  </Button>
                  <Button variant="secondary" onClick={() => setAdding('create')}>
                    <Plus /> Create project
                  </Button>
                </div>
              ) : undefined
            }
          />
        }
      />

      {canAdd && <AddProjectDialog env={env} deployments={deployments} open={!!adding} initialMode={adding ?? 'existing'} onOpenChange={(o) => !o && setAdding(null)} onAdded={(depId) => open(depId, 'config')} />}
      <DeploymentSheet depId={openId} env={env} initialTab={sheetTab} onOpenChange={(o) => !o && onOpen(null)} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing ? name(removing) : ''}?`}
        description={
          removing && (removing.status === 'running' || removing.status === 'deploying')
            ? 'Its service will be stopped and its Nginx route removed. Its deployment settings and history are deleted. You can add the project again later.'
            : 'Its deployment settings and history are deleted. You can add the project again later.'
        }
        confirmLabel="Stop and remove"
        destructive
        onConfirm={() => {
          if (!removing) return
          act(remove(removing.id), `${name(removing)} removed from this environment.`)
          setRemoving(null)
        }}
      />
    </div>
  )
}
