import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Inbox, Search, SearchX } from 'lucide-react'
import type { EnvRequest, Purpose } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { checkQuota, estimateCost } from '@/lib/cost'
import { formatDate, formatInt, relativeTime } from '@/lib/format'
import { PURPOSES, purposeLabel } from '@/lib/labels'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { Avatar } from '@/components/shared/Avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequestDrawer, requestBadge } from './RequestDrawer'

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

interface Row {
  req: EnvRequest
  tenantName: string
  requesterName: string
  credits: number
  over: boolean
}

export default function AdminRequests() {
  const loading = useSimulatedLoading()
  const requests = useAppStore((s) => s.requests)
  const tenants = useAppStore((s) => s.tenants)
  const users = useAppStore((s) => s.users)
  const catalog = useAppStore((s) => s.catalog)
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState<StatusFilter>('all')
  const [tenantId, setTenantId] = useState('all')
  const [purpose, setPurpose] = useState<'all' | Purpose>('all')
  const [query, setQuery] = useState('')

  const selectedId = params.get('id')
  const selected = requests.find((r) => r.id === selectedId) ?? null
  const open = (id: string) => setParams({ id })
  const close = () => setParams({})

  const rows: Row[] = useMemo(() => {
    return requests
      .map((req) => {
        const tenant = tenants.find((t) => t.id === req.tenantId)!
        const est = estimateCost(req.spec, catalog)
        return {
          req,
          tenantName: tenant.name,
          requesterName: users.find((u) => u.id === req.requesterId)?.name ?? '',
          credits: est.credits,
          over: req.status === 'pending' && checkQuota(tenant, est).over,
        }
      })
      .sort((a, b) => {
        if (a.req.status === 'pending' && b.req.status !== 'pending') return -1
        if (b.req.status === 'pending' && a.req.status !== 'pending') return 1
        return b.req.createdAt.localeCompare(a.req.createdAt)
      })
  }, [requests, tenants, users, catalog])

  const filtered = rows.filter(({ req, tenantName, requesterName }) => {
    if (status !== 'all' && req.status !== status) return false
    if (tenantId !== 'all' && req.tenantId !== tenantId) return false
    if (purpose !== 'all' && req.spec.purpose !== purpose) return false
    const q = query.trim().toLowerCase()
    if (q && ![req.spec.name, tenantName, requesterName].some((s) => s.toLowerCase().includes(q))) return false
    return true
  })

  const pendingCount = rows.filter((r) => r.req.status === 'pending').length
  const filtersActive = status !== 'all' || tenantId !== 'all' || purpose !== 'all' || query.trim() !== ''
  const clearFilters = () => {
    setStatus('all')
    setTenantId('all')
    setPurpose('all')
    setQuery('')
  }

  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Requests"
        description={
          pendingCount
            ? `${pendingCount} request${pendingCount > 1 ? 's' : ''} waiting for review. Open one to see the full specification and cost.`
            : 'Nothing is waiting for review.'
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_220px_200px]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
          <Input
            type="search"
            className="pl-9"
            placeholder="Search by name, organisation or person"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search requests"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Waiting for review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
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
        <Select value={purpose} onValueChange={(v) => setPurpose(v as 'all' | Purpose)}>
          <SelectTrigger aria-label="Filter by purpose">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All purposes</SelectItem>
            {PURPOSES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-5 flex-1" />
                <Skeleton className="hidden h-5 w-32 md:block" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          filtersActive ? (
            <EmptyState
              icon={SearchX}
              title="No requests match these filters"
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState icon={Inbox} title="No requests yet" description="Requests from organisations appear here for review." />
          )
        ) : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead className="bg-bg-subtle text-left">
                <tr className="text-caption font-semibold text-text-secondary">
                  <th scope="col" className="px-5 py-3 font-semibold">Request</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Organisation</th>
                  <th scope="col" className="hidden px-3 py-3 font-semibold xl:table-cell">Purpose</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Credits / month</th>
                  <th scope="col" className="hidden px-3 py-3 font-semibold lg:table-cell">Submitted</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(({ req, tenantName, requesterName, credits, over }) => (
                  <tr
                    key={req.id}
                    tabIndex={0}
                    onClick={() => open(req.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(req.id))}
                    className="h-[52px] cursor-pointer hover:bg-bg-subtle"
                    aria-label={`Open request ${req.spec.name}`}
                  >
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text-primary">{req.spec.name}</span>
                        {req.type === 'change' && <Tag>Change</Tag>}
                      </div>
                      <span className="text-caption text-text-muted">{requesterName}</span>
                    </td>
                    <td className="px-3 py-2.5 text-text-primary">{tenantName}</td>
                    <td className="hidden px-3 py-2.5 text-text-secondary xl:table-cell">{purposeLabel(req.spec.purpose)}</td>
                    <td className="tabular px-3 py-2.5 text-right text-text-primary">{formatInt(credits)}</td>
                    <td className="hidden px-3 py-2.5 text-text-secondary lg:table-cell" title={formatDate(req.createdAt)}>
                      {relativeTime(req.createdAt)}
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge status={requestBadge(req)} />
                        {over && <StatusBadge status="over-quota" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-border md:hidden">
              {filtered.map(({ req, tenantName, requesterName, credits, over }) => (
                <li key={req.id}>
                  <button type="button" onClick={() => open(req.id)} className="flex w-full flex-col gap-2 px-4 py-4 text-left hover:bg-bg-subtle">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-text-primary">{req.spec.name}</span>
                      <StatusBadge status={requestBadge(req)} />
                    </div>
                    <div className="flex items-center gap-2 text-caption text-text-secondary">
                      <Avatar name={requesterName} size="sm" />
                      {requesterName} · {tenantName}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-caption text-text-secondary">
                      <span className="tabular">{formatInt(credits)} credits / month</span>
                      <span>· {relativeTime(req.createdAt)}</span>
                      {req.type === 'change' && <Tag>Change</Tag>}
                      {over && <StatusBadge status="over-quota" />}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <RequestDrawer request={selected} onClose={close} />
    </>
  )
}
