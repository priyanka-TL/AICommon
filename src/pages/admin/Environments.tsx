import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Eye, Pause, Play, SearchX, ServerOff, Square } from 'lucide-react'
import type { ComputeTier, Environment, EnvStatus } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { formatDate, formatInt } from '@/lib/format'
import { COMPUTE_TIERS, computeLabel } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { RowActions } from '@/components/shared/RowActions'
import { SearchInput } from '@/components/shared/SearchInput'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { canStart, canStop, canSuspend, EnvironmentDrawer, useEnvActions } from './EnvironmentDrawer'

const STATUSES: EnvStatus[] = ['running', 'provisioning', 'approved', 'pending', 'stopped', 'rejected']
const LABELS: Record<EnvStatus, string> = {
  running: 'Running',
  provisioning: 'Provisioning',
  approved: 'Approved',
  pending: 'Pending',
  stopped: 'Stopped',
  rejected: 'Rejected',
}

export default function Environments() {
  const loading = useSimulatedLoading()
  const environments = useAppStore((s) => s.environments)
  const tenants = useAppStore((s) => s.tenants)
  const users = useAppStore((s) => s.users)
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [tenantId, setTenantId] = useState('all')
  const [compute, setCompute] = useState<'all' | ComputeTier>('all')
  const [status, setStatus] = useState<'all' | EnvStatus>('all')
  const { start, stop, askSuspend, dialog } = useEnvActions()

  const focusId = params.get('focus')
  const selected = environments.find((e) => e.id === focusId) ?? null

  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? ''
  const ownerName = (id: string) => users.find((u) => u.id === id)?.name ?? ''

  const base = useMemo(() => {
    const q = query.trim().toLowerCase()
    return environments.filter(
      (e) =>
        (tenantId === 'all' || e.tenantId === tenantId) &&
        (compute === 'all' || e.spec.compute === compute) &&
        (!q || [e.spec.name, tenantName(e.tenantId), ownerName(e.ownerId)].some((s) => s.toLowerCase().includes(q))),
    )
  }, [environments, query, tenantId, compute, tenants, users])

  const counts = Object.fromEntries(STATUSES.map((s) => [s, base.filter((e) => e.status === s).length])) as Record<EnvStatus, number>
  const rows = base
    .filter((e) => status === 'all' || e.status === status)
    .sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || b.createdAt.localeCompare(a.createdAt))

  const filtersActive = query || tenantId !== 'all' || compute !== 'all' || status !== 'all'
  const open = (e: Environment) => setParams({ focus: e.id })

  const columns: Column<Environment>[] = [
    {
      key: 'name',
      header: 'Environment',
      cell: (e) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-text-primary">{e.spec.name}</p>
          <p className="truncate text-caption text-text-muted">{ownerName(e.ownerId)}</p>
        </div>
      ),
    },
    { key: 'org', header: 'Organisation', cell: (e) => <span className="text-text-primary">{tenantName(e.tenantId)}</span> },
    { key: 'compute', header: 'Compute', cell: (e) => <span className="text-text-secondary">{computeLabel(e.spec.compute)}</span>, className: 'hidden lg:table-cell' },
    { key: 'used', header: 'Credits used', align: 'right', cell: (e) => formatInt(e.creditsUsed) },
    { key: 'expires', header: 'Expires', cell: (e) => <span className="text-text-secondary">{e.expiresAt ? formatDate(e.expiresAt) : '—'}</span>, className: 'hidden xl:table-cell' },
    { key: 'status', header: 'Status', cell: (e) => <StatusBadge status={e.status} /> },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      cell: (e) => (
        <RowActions
          label={e.spec.name}
          actions={[
            { label: 'View details', icon: Eye, onSelect: () => open(e) },
            canStart(e) && { label: 'Start', icon: Play, onSelect: () => start(e) },
            canStop(e) && { label: 'Stop', icon: Square, onSelect: () => stop(e) },
            canSuspend(e) && { label: 'Suspend', icon: Pause, onSelect: () => askSuspend(e), destructive: true, separatorBefore: true },
          ]}
        />
      ),
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Environments"
        description="Every environment across all organisations. Start, stop or suspend them from here."
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_240px_190px]">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by environment, organisation or owner" className="sm:col-span-2 lg:col-span-1" />
        <Select value={tenantId} onValueChange={setTenantId}>
          <SelectTrigger aria-label="Filter by organisation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All organisations</SelectItem>
            {tenants.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={compute} onValueChange={(v) => setCompute(v as typeof compute)}>
          <SelectTrigger aria-label="Filter by compute">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All compute</SelectItem>
            {COMPUTE_TIERS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="group" aria-label="Filter by status">
        {(['all', ...STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-caption font-semibold transition-colors',
              status === s
                ? 'border-indigo bg-indigo-50 text-indigo-text dark:border-indigo-text'
                : 'border-border bg-bg-surface text-text-secondary hover:border-border-strong',
            )}
          >
            {s === 'all' ? 'All' : LABELS[s]}
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
        onRowClick={open}
        empty={
          filtersActive ? (
            <EmptyState
              icon={SearchX}
              title="No environments match these filters"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('')
                    setTenantId('all')
                    setCompute('all')
                    setStatus('all')
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState icon={ServerOff} title="No environments yet" description="They appear here once an organisation requests one." />
          )
        }
        mobileCard={(e) => (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-text-primary">{e.spec.name}</p>
              <StatusBadge status={e.status} />
            </div>
            <p className="tabular text-caption text-text-muted">
              {tenantName(e.tenantId)} · {computeLabel(e.spec.compute)} · {formatInt(e.creditsUsed)} credits
            </p>
          </div>
        )}
      />

      <EnvironmentDrawer env={selected} onClose={() => setParams({})} />
      {dialog}
    </>
  )
}
