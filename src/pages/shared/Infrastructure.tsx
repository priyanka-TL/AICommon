import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Plus, SearchX, ServerOff } from 'lucide-react'
import type { Environment, EnvStatus } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useHostedProjectIds, useScope, useScopedEnvironments, useScopedProjects } from '@/store/selectors'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { formatDate, formatInt } from '@/lib/format'
import { computeLabel, STATUS_LABELS } from '@/lib/labels'
import { needsMigration } from '@/lib/providers'
import { MigrateBadge } from '@/components/shared/TenantProviders'
import { allocationOf, tenantAllocated } from '@/lib/quota'
import { envPath, newEnvPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { RowActions } from '@/components/shared/RowActions'
import { SearchInput } from '@/components/shared/SearchInput'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ResourceQuota } from '@/components/shared/ResourceQuota'
import { useEnvLifecycle } from '@/components/shared/useEnvLifecycle'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/controls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const STATUSES: EnvStatus[] = ['active', 'provisioning', 'provisioning_failed', 'stopped', 'suspended', 'terminated']

export default function Infrastructure() {
  const loading = useSimulatedLoading()
  const scope = useScope()!
  const [showTerminated, setShowTerminated] = useState(false)
  const environments = useScopedEnvironments(true)
  const tenantsAll = useAppStore((s) => s.tenants)
  const projects = useScopedProjects()
  const hosted = useHostedProjectIds()
  const projectNames = (envId: string) => (hosted.get(envId) ?? []).map((pid) => projects.find((p) => p.id === pid)?.name).filter(Boolean).join(', ') || 'No projects yet'
  const tenants = useAppStore((s) => s.tenants)
  const users = useAppStore((s) => s.users)
  const allEnvs = useAppStore((s) => s.environments)
  const navigate = useNavigate()
  const { actionsFor, dialogs } = useEnvLifecycle()
  const [query, setQuery] = useState('')
  const [projectId, setProjectId] = useState('all')
  const [status, setStatus] = useState<'all' | EnvStatus>('all')
  const isSuper = scope.role === 'super_admin'
  const myTenant = tenants.find((t) => t.id === scope.user.tenantId)

  const base = useMemo(() => {
    const q = query.trim().toLowerCase()
    return environments.filter(
      (e) =>
        (showTerminated || e.status !== 'terminated') &&
        (projectId === 'all' || !!hosted.get(e.id)?.includes(projectId)) &&
        (!q || [e.spec.name, users.find((u) => u.id === e.ownerId)?.name ?? ''].some((s) => s.toLowerCase().includes(q))),
    )
  }, [environments, showTerminated, projectId, query, users, hosted])

  const counts = Object.fromEntries(STATUSES.map((s) => [s, base.filter((e) => e.status === s).length])) as Record<EnvStatus, number>
  const rows = base.filter((e) => status === 'all' || e.status === status).sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status))

  const columns: Column<Environment>[] = [
    {
      key: 'name',
      header: 'Environment',
      cell: (e) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-text-primary">{e.spec.name}</p>
          <p className="truncate text-caption text-text-muted">{users.find((u) => u.id === e.ownerId)?.name}</p>
        </div>
      ),
    },
    ...(isSuper ? [{ key: 'tenant', header: 'Tenant', cell: (e: Environment) => <span>{tenants.find((t) => t.id === e.tenantId)?.name}</span> }] : []),
    { key: 'project', header: 'Project', cell: (e) => <span className="text-text-secondary">{projectNames(e.id)}</span>, className: 'hidden xl:table-cell' },
    {
      key: 'compute',
      header: 'Allocation',
      cell: (e) => {
        const a = allocationOf(e.spec)
        return (
          <span className="tabular text-text-secondary">
            {computeLabel(e.spec.compute)}
            {a.gpus > 1 ? ` × ${a.gpus}` : ''} · {a.vcpu} vCPU · {formatInt(a.storageGb)} GB
          </span>
        )
      },
      className: 'hidden lg:table-cell',
    },
    { key: 'expires', header: 'Expires', cell: (e) => <span className="text-text-secondary">{e.expiresAt ? formatDate(e.expiresAt) : '—'}</span>, className: 'hidden xl:table-cell' },
    {
      key: 'status',
      header: 'Status',
      cell: (e) => (
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={e.status} />
          {needsMigration(e, tenantsAll) && <MigrateBadge />}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      cell: (e) => (
        <RowActions
          label={e.spec.name}
          actions={[
            { label: 'View details', icon: Eye, onSelect: () => navigate(envPath(scope.role, e.id)) },
            ...actionsFor(e).map((a, i) => ({ label: a.label, icon: a.icon, onSelect: a.run, destructive: a.tone === 'destructive', separatorBefore: i === 0 })),
          ]}
        />
      ),
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow={isSuper ? 'All tenants' : myTenant?.name}
        title="Infrastructure"
        description={
          isSuper
            ? 'Every environment across tenants. Suspend anything that breaks platform rules, and resume it once fixed.'
            : 'Environments in your tenant. Start, stop, restart or terminate them, and change setups that need no new infrastructure.'
        }
        actions={
          !isSuper && (
            <Button onClick={() => navigate(newEnvPath(scope.role))}>
              <Plus /> Request infrastructure
            </Button>
          )
        }
      />

      {!isSuper && myTenant && (
        <section className="card mb-6 p-5">
          <p className="eyebrow mb-3">Allocated against {myTenant.name}’s quota</p>
          <ResourceQuota compact used={tenantAllocated(allEnvs, myTenant.id)} total={myTenant.quota} className="sm:grid-cols-2 lg:grid-cols-4" />
        </section>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_240px_auto] sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by environment or owner" />
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger aria-label="Filter by project">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                {isSuper ? ` · ${tenants.find((t) => t.id === p.tenantId)?.name}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex cursor-pointer items-center gap-2 text-caption font-semibold text-text-secondary">
          <Switch checked={showTerminated} onCheckedChange={setShowTerminated} aria-label="Show terminated environments" /> Show terminated
        </label>
      </div>

      <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="group" aria-label="Filter by status">
        {(['all', ...STATUSES.filter((s) => showTerminated || s !== 'terminated')] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-caption font-semibold transition-colors',
              status === s ? 'border-indigo bg-indigo-50 text-indigo-text dark:border-indigo-text' : 'border-border bg-bg-surface text-text-secondary hover:border-border-strong',
            )}
          >
            {s === 'all' ? 'All' : STATUS_LABELS[s]}
            <span className="tabular text-text-muted">{s === 'all' ? base.length : counts[s]}</span>
          </button>
        ))}
      </div>

      <DataTable
        loading={loading}
        rows={rows}
        columns={columns}
        rowKey={(e) => e.id}
        rowLabel={(e) => `Open ${e.spec.name}`}
        onRowClick={(e) => navigate(envPath(scope.role, e.id))}
        empty={
          query || projectId !== 'all' || status !== 'all' ? (
            <EmptyState icon={SearchX} title="No environments match these filters" action={<Button variant="secondary" onClick={() => { setQuery(''); setProjectId('all'); setStatus('all') }}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={ServerOff} title="No environments yet" description="They appear here once a request is approved." />
          )
        }
        mobileCard={(e) => (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-text-primary">{e.spec.name}</p>
              <StatusBadge status={e.status} />
            </div>
            <p className="text-caption text-text-muted">
              {isSuper ? `${tenants.find((t) => t.id === e.tenantId)?.name} · ` : ''}
              {projectNames(e.id)} · {computeLabel(e.spec.compute)}
            </p>
          </div>
        )}
      />
      {dialogs}
    </>
  )
}
