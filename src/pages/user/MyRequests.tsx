import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ClipboardList, GitPullRequestArrow, Plus, SearchX, Server } from 'lucide-react'
import { useAppStore, useCurrentTenant } from '@/store/useAppStore'
import { useRequestItems, useScopedProjects } from '@/store/selectors'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { useRequestFilters } from '@/hooks/useRequestFilters'
import { filterCommon, filterItems, sortItems, type RequestItem } from '@/lib/requestItems'
import { formatDate, relativeTime } from '@/lib/format'
import { providerRequestPath, continueRequestPath, newEnvPath, requestPath, suggestionPath } from '@/lib/paths'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ItemStatusBadge, RequestFilters, TypeLabel } from '@/components/shared/RequestFilters'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SuggestDialog } from './SuggestDialog'

export default function MyRequests() {
  const loading = useSimulatedLoading()
  const tenant = useCurrentTenant()!
  const items = useRequestItems()
  const projects = useScopedProjects()
  const allProjects = useAppStore((s) => s.projects)
  const environments = useAppStore((s) => s.environments)
  const users = useAppStore((s) => s.users)
  const navigate = useNavigate()
  const { filters, update, clear, active } = useRequestFilters('user')
  const [suggestOpen, setSuggestOpen] = useState(false)

  const common = useMemo(() => filterCommon(items, filters), [items, filters])
  const counts = {
    all: common.length,
    environment: common.filter((i) => i.type === 'environment').length,
    capability: common.filter((i) => i.type === 'capability').length,
    provider: common.filter((i) => i.type === 'provider').length,
  }
  const rows = useMemo(() => sortItems(filterItems(items, filters), filters.sort), [items, filters])

  const projectName = (id: string | null) => allProjects.find((p) => p.id === id)?.name
  const envFor = (i: RequestItem) => (i.type === 'environment' && i.source.kind === 'new' && i.source.envId ? environments.find((e) => e.id === i.source.envId) : undefined)

  const open = (i: RequestItem) => {
    if (i.type === 'capability') return navigate(suggestionPath('user', i.id))
    if (i.type === 'provider') return navigate(providerRequestPath('user', i.id))
    const editable = i.source.status === 'draft' || i.source.status === 'changes_requested'
    navigate(editable ? continueRequestPath('user', i.id) : requestPath('user', i.id))
  }

  const Comment = ({ i }: { i: RequestItem }) =>
    i.reviewerComment ? (
      <p className="max-w-[200px] truncate text-caption text-text-secondary" title={i.reviewerComment.text}>
        <span className="font-semibold text-text-primary">{users.find((u) => u.id === i.reviewerComment!.actorId)?.name ?? 'Reviewer'}:</span> {i.reviewerComment.text}
      </p>
    ) : (
      <span className="text-caption text-text-muted">—</span>
    )

  const Where = ({ i }: { i: RequestItem }) =>
    i.type === 'capability' ? (
      <span className="block max-w-[170px] truncate font-mono text-caption text-text-secondary" title={i.repo ?? undefined}>
        {i.repo}
      </span>
    ) : (
      <span className="text-text-secondary">{projectName(i.projectId)}</span>
    )

  const columns: Column<RequestItem>[] = [
    { key: 'type', header: 'Type', cell: (i) => <TypeLabel type={i.type} /> },
    {
      key: 'name',
      header: 'Request',
      cell: (i) => (
        <div className="min-w-0">
          <span className="block truncate font-semibold text-text-primary">{i.name}</span>
          <span className="font-mono text-xs text-text-muted">{i.id}</span>
        </div>
      ),
    },
    { key: 'where', header: 'Project or repo', cell: (i) => <Where i={i} />, className: 'hidden lg:table-cell' },
    { key: 'submitted', header: 'Submitted', cell: (i) => <span className="tabular whitespace-nowrap text-text-secondary">{formatDate(i.submittedAt)}</span>, className: 'hidden xl:table-cell' },
    {
      key: 'status',
      header: 'Status',
      cell: (i) => {
        const env = envFor(i)
        return (
          <div className="flex flex-wrap gap-1.5">
            <ItemStatusBadge item={i} />
            {env && <StatusBadge status={env.status} />}
          </div>
        )
      },
    },
    { key: 'updated', header: 'Updated', cell: (i) => <span className="whitespace-nowrap text-text-secondary" title={formatDate(i.updatedAt)}>{relativeTime(i.updatedAt)}</span> },
    { key: 'comment', header: 'Reviewer comment', cell: (i) => <Comment i={i} />, className: 'hidden xl:table-cell' },
  ]

  const newRequest = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus /> New request <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => navigate(newEnvPath('user'))}>
          <Server /> Request environment
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setSuggestOpen(true)}>
          <GitPullRequestArrow /> Suggest a capability
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <>
      <PageHeader
        eyebrow={tenant.name}
        title="My requests"
        description="Your environment requests and capability suggestions in one place. Open one to see its timeline."
        actions={newRequest}
      />

      <RequestFilters role="user" filters={filters} update={update} clear={clear} active={active} counts={counts} projects={projects} />

      <DataTable
        loading={loading}
        rows={rows}
        columns={columns}
        rowKey={(i) => `${i.type}-${i.id}`}
        rowLabel={(i) => `Open request ${i.name}`}
        onRowClick={open}
        empty={
          items.length === 0 ? (
            <EmptyState icon={ClipboardList} title="You haven’t made any requests yet" description="Request an environment or suggest a capability, and follow its review here." />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No requests match these filters"
              action={
                <Button variant="secondary" onClick={() => (active ? clear() : update({ type: 'all' }))}>
                  {active ? 'Clear filters' : 'Show all types'}
                </Button>
              }
            />
          )
        }
        mobileCard={(i) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-text-primary">{i.name}</p>
                <p className="font-mono text-xs text-text-muted">{i.id}</p>
              </div>
              <ItemStatusBadge item={i} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
              <TypeLabel type={i.type} />
              <Where i={i} />
            </div>
            <p className="text-caption text-text-muted">
              Submitted {formatDate(i.submittedAt)} · updated {relativeTime(i.updatedAt)}
            </p>
            {i.reviewerComment && <Comment i={i} />}
          </div>
        )}
      />

      <SuggestDialog open={suggestOpen} onOpenChange={setSuggestOpen} />
    </>
  )
}
