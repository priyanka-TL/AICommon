import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderKanban, LayoutGrid, List, Plus } from 'lucide-react'
import type { Project } from '@/data/types'
import { useAppStore, useCurrentTenant } from '@/store/useAppStore'
import { useScope, useScopedProjects } from '@/store/selectors'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { relativeTime } from '@/lib/format'
import { newProjectPath, projectPath } from '@/lib/paths'
import { PROJECT_SORT_LABELS, summariseProject, type ProjectSort, type ProjectSummary } from '@/lib/projects'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/shared/Avatar'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchInput } from '@/components/shared/SearchInput'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { projectTypeLabel } from '@/components/projects/ProjectForm'

type Row = Project & { summary: ProjectSummary }

const NO_ENV = '__none__'

export function ProjectStatusBadge({ project, summary }: { project: Pick<Project, 'status'>; summary: Pick<ProjectSummary, 'running' | 'failed' | 'deployments'> }) {
  if (project.status === 'archived') return <StatusBadge status="stopped" label="Archived" />
  if (summary.running) return <StatusBadge status="running" label={`Running on ${summary.running}`} />
  if (summary.failed) return <StatusBadge status="failed" label="Deploy failed" />
  return <StatusBadge status="not_deployed" label={summary.deployments.length ? 'Not deployed' : 'Not on an environment'} />
}

export default function Projects() {
  const loading = useSimulatedLoading()
  const scope = useScope()!
  const tenant = useCurrentTenant()
  const navigate = useNavigate()
  const projects = useScopedProjects()
  const deployments = useAppStore((s) => s.deployments)
  const environments = useAppStore((s) => s.environments)
  const users = useAppStore((s) => s.users)
  const catalog = useAppStore((s) => s.catalog)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'archived' | 'deployed' | 'not_deployed'>('active')
  const [envFilter, setEnvFilter] = useState('all')
  const [sort, setSort] = useState<ProjectSort>('updated')
  const [view, setView] = useState<'cards' | 'list'>('cards')

  const rows: Row[] = useMemo(() => projects.map((p) => ({ ...p, summary: summariseProject(p, deployments, environments) })), [projects, deployments, environments])
  const envOptions = useMemo(() => {
    const ids = new Set(rows.flatMap((r) => r.summary.environments.map((e) => e.id)))
    return environments.filter((e) => ids.has(e.id)).sort((a, b) => a.spec.name.localeCompare(b.spec.name))
  }, [rows, environments])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => {
        if (status === 'active' && r.status !== 'active') return false
        if (status === 'archived' && r.status !== 'archived') return false
        if (status === 'deployed' && !(r.status === 'active' && r.summary.deployed)) return false
        if (status === 'not_deployed' && !(r.status === 'active' && !r.summary.deployed)) return false
        if (envFilter === NO_ENV && r.summary.environments.length) return false
        if (envFilter !== 'all' && envFilter !== NO_ENV && !r.summary.environments.some((e) => e.id === envFilter)) return false
        return !q || [r.name, r.description, projectTypeLabel(r.type)].some((s) => s.toLowerCase().includes(q))
      })
      .sort((a, b) =>
        sort === 'name'
          ? a.name.localeCompare(b.name)
          : sort === 'last_deployed'
            ? (b.summary.lastDeployedAt ?? '').localeCompare(a.summary.lastDeployedAt ?? '')
            : (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? ''),
      )
  }, [rows, query, status, envFilter, sort])

  const canCreate = scope.role === 'user' || scope.role === 'tenant_admin'
  const members = (p: Project) => [p.ownerId, ...p.memberIds.filter((m) => m !== p.ownerId)]
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? 'Someone'
  const envNames = (r: Row) => (r.summary.environments.length ? r.summary.environments.map((e) => e.spec.name).join(', ') : 'Not on any environment')
  const capCount = (p: Project) => p.capabilityIds.filter((id) => catalog.some((c) => c.id === id)).length

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Project',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-text-primary">{r.name}</p>
          <p className="truncate text-caption text-text-muted">{r.description || projectTypeLabel(r.type)}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (r) => <ProjectStatusBadge project={r} summary={r.summary} /> },
    { key: 'envs', header: 'Environments', className: 'hidden lg:table-cell', cell: (r) => <span className="line-clamp-2 text-caption text-text-secondary">{envNames(r)}</span> },
    { key: 'caps', header: 'Capabilities', align: 'right', className: 'hidden md:table-cell', cell: (r) => <span className="tabular">{capCount(r)}</span> },
    { key: 'deployed', header: 'Last deployed', className: 'hidden xl:table-cell', cell: (r) => <span className="text-caption text-text-secondary">{r.summary.lastDeployedAt ? relativeTime(r.summary.lastDeployedAt) : 'Never'}</span> },
    {
      key: 'members',
      header: 'Members',
      className: 'hidden md:table-cell',
      cell: (r) => (
        <div className="flex -space-x-2">
          {members(r)
            .slice(0, 4)
            .map((m) => (
              <Avatar key={m} name={userName(m)} size="sm" className="ring-2 ring-bg-surface" />
            ))}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow={tenant && !tenant.isSystem ? tenant.name : 'All tenants'}
        title="Projects"
        description="Your code, its capabilities and models, and the environments it runs on. Projects travel with their capabilities to any environment."
        actions={
          canCreate && (
            <Button onClick={() => navigate(newProjectPath(scope.role))}>
              <Plus /> Create project
            </Button>
          )
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search projects" className="lg:max-w-xs" />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="h-9 w-[170px]" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="deployed">Deployed</SelectItem>
              <SelectItem value="not_deployed">Not deployed</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
          </Select>
          <Select value={envFilter} onValueChange={setEnvFilter}>
            <SelectTrigger className="h-9 w-[220px]" aria-label="Filter by environment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All environments</SelectItem>
              <SelectItem value={NO_ENV}>Not on any environment</SelectItem>
              {envOptions.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.spec.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as ProjectSort)}>
            <SelectTrigger className="h-9 w-[190px]" aria-label="Sort projects">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PROJECT_SORT_LABELS) as ProjectSort[]).map((k) => (
                <SelectItem key={k} value={k}>
                  Sort: {PROJECT_SORT_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-fit rounded-control border border-border p-0.5 lg:ml-auto" role="group" aria-label="View">
          {(
            [
              ['cards', LayoutGrid, 'Cards'],
              ['list', List, 'List'],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn('flex items-center gap-1.5 rounded-[8px] px-3 py-1 text-caption font-semibold', view === v ? 'bg-indigo-50 text-indigo-text' : 'text-text-secondary hover:text-text-primary')}
            >
              <Icon className="size-3.5" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-card" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={FolderKanban}
            title={rows.length === 0 ? 'No projects yet' : 'No projects match these filters'}
            description={rows.length === 0 ? 'Create a project to bring your code, capabilities and models together, then deploy it to an environment.' : 'Change the search or filters to see more.'}
            action={
              rows.length === 0 && canCreate ? (
                <Button onClick={() => navigate(newProjectPath(scope.role))}>
                  <Plus /> Create project
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : view === 'list' ? (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(r) => r.id}
          rowLabel={(r) => `Open ${r.name}`}
          onRowClick={(r) => navigate(projectPath(scope.role, r.id))}
          mobileCard={(r) => (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-text-primary">{r.name}</p>
                <ProjectStatusBadge project={r} summary={r.summary} />
              </div>
              <p className="text-caption text-text-secondary">{envNames(r)}</p>
              <p className="text-caption text-text-muted">
                {capCount(r)} capabilities · {r.summary.lastDeployedAt ? `deployed ${relativeTime(r.summary.lastDeployedAt)}` : 'never deployed'}
              </p>
            </div>
          )}
          empty={null}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link to={projectPath(scope.role, r.id)} className="card card-interactive flex h-full flex-col gap-3 p-5" data-project={r.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-heading text-h3 text-text-primary">{r.name}</h2>
                    <p className="text-caption text-text-muted">{projectTypeLabel(r.type)}</p>
                  </div>
                  <ProjectStatusBadge project={r} summary={r.summary} />
                </div>
                <p className="line-clamp-2 text-caption text-text-secondary">{r.description || 'No description yet.'}</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.summary.environments.length === 0 ? (
                    <Tag>Not on any environment</Tag>
                  ) : (
                    r.summary.environments.slice(0, 3).map((e) => <Tag key={e.id}>{e.spec.name}</Tag>)
                  )}
                  {r.summary.environments.length > 3 && <Tag>+{r.summary.environments.length - 3} more</Tag>}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
                  <div className="flex -space-x-2">
                    {members(r)
                      .slice(0, 5)
                      .map((m) => (
                        <Avatar key={m} name={userName(m)} size="sm" className="ring-2 ring-bg-surface" />
                      ))}
                  </div>
                  <p className="text-right text-caption text-text-secondary">
                    {capCount(r)} capabilit{capCount(r) === 1 ? 'y' : 'ies'}
                    <br />
                    {r.summary.lastDeployedAt ? `Deployed ${relativeTime(r.summary.lastDeployedAt)}` : 'Never deployed'}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
