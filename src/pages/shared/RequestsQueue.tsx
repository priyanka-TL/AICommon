import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowRight, CheckCircle2, Gauge, Inbox, Plus, SearchX, XCircle } from 'lucide-react'
import type { EnvRequest, QuotaRequest, RequestStatus } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useScope, useScopedRequests } from '@/store/selectors'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { allocationOf, checkQuota, RESOURCES, subQuota, tenantAllocated, ZERO } from '@/lib/quota'
import { formatDate, formatInt, relativeTime } from '@/lib/format'
import { STATUS_LABELS } from '@/lib/labels'
import { REQUEST_STATUSES } from '@/lib/lifecycle'
import { newEnvPath, requestPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchInput } from '@/components/shared/SearchInput'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { CompactTimeline, futureSteps, mergedHistory } from '@/components/shared/LifecycleTimeline'
import { Avatar } from '@/components/shared/Avatar'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/input'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Tab = 'action' | 'all' | 'quota'

function QuotaRequests() {
  const quotaRequests = useAppStore((s) => s.quotaRequests)
  const tenants = useAppStore((s) => s.tenants)
  const users = useAppStore((s) => s.users)
  const environments = useAppStore((s) => s.environments)
  const capacity = useAppStore((s) => s.capacity)
  const decide = useAppStore((s) => s.decideQuotaRequest)
  const scope = useScope()!
  const [deciding, setDeciding] = useState<{ q: QuotaRequest; approve: boolean } | null>(null)
  const [comment, setComment] = useState('')
  const rows = quotaRequests.filter((q) => scope.tenantId === null || q.tenantId === scope.tenantId)
  const allocatedAll = tenants.filter((t) => !t.isSystem).reduce((s, t) => s + t.quota.gpus, 0)

  if (!rows.length) return <div className="card"><EmptyState icon={Gauge} title="No quota requests" description="Tenant Admins can ask for more quota from their Quotas & Usage page." /></div>
  return (
    <>
      <ul className="flex flex-col gap-4">
        {rows.map((q) => {
          const t = tenants.find((x) => x.id === q.tenantId)
          const by = users.find((u) => u.id === q.requestedById)
          const used = tenantAllocated(environments, q.tenantId)
          return (
            <li key={q.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-heading text-h3 text-text-primary">{t?.name}</p>
                  <p className="text-caption text-text-secondary">
                    {by?.name} · {relativeTime(q.createdAt)}
                  </p>
                </div>
                <StatusBadge status={q.status === 'pending' ? 'escalated' : q.status === 'approved' ? 'approved' : 'rejected'} label={q.status === 'pending' ? 'Waiting for you' : q.status === 'approved' ? 'Approved' : 'Rejected'} />
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="text-left text-caption text-text-secondary">
                    <tr>
                      <th className="pb-2 font-semibold">Resource</th>
                      <th className="pb-2 text-right font-semibold">In use</th>
                      <th className="pb-2 text-right font-semibold">Current quota</th>
                      <th className="pb-2 text-right font-semibold">Requested</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {RESOURCES.map((r) => (
                      <tr key={r.key} className="h-9">
                        <td>{r.label}</td>
                        <td className="tabular text-right text-text-secondary">{formatInt(used[r.key])}</td>
                        <td className="tabular text-right">{formatInt(q.current[r.key])}</td>
                        <td className={cn('tabular text-right font-semibold', q.requested[r.key] > q.current[r.key] && 'text-indigo-text')}>{formatInt(q.requested[r.key])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 border-l-[3px] border-purple pl-3 text-sm italic text-text-primary">{q.reason}</p>
              {q.comment && <p className="mt-2 text-caption text-text-secondary">Decision note: {q.comment}</p>}
              {q.status === 'pending' && (
                <>
                  <p className="mt-3 text-caption text-text-muted">
                    Platform GPUs already given to tenants: {allocatedAll} of {capacity.gpus}.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => { setDeciding({ q, approve: true }); setComment('') }}>
                      <CheckCircle2 /> Approve increase
                    </Button>
                    <Button variant="ghost" className="text-red-text hover:text-red-text" onClick={() => { setDeciding({ q, approve: false }); setComment('') }}>
                      <XCircle /> Reject
                    </Button>
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ul>
      <Dialog open={!!deciding} onOpenChange={(o) => !o && setDeciding(null)}>
        <DialogContent size="md">
          <DialogHeader title={deciding?.approve ? 'Approve quota increase' : 'Reject quota increase'} description="The Tenant Admin is notified with your note." />
          <DialogBody>
            <Field label="Note" htmlFor="qr-note" helper="Optional">
              <Textarea id="qr-note" value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              variant={deciding?.approve ? 'primary' : 'destructive'}
              onClick={() => {
                if (!deciding) return
                decide(deciding.q.id, deciding.approve, comment)
                toast.success(deciding.approve ? 'Quota increased.' : 'Quota request rejected.')
                setDeciding(null)
              }}
            >
              {deciding?.approve ? 'Approve increase' : 'Reject request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function RequestsQueue() {
  const loading = useSimulatedLoading()
  const scope = useScope()!
  const requests = useScopedRequests()
  const tenants = useAppStore((s) => s.tenants)
  const users = useAppStore((s) => s.users)
  const projects = useAppStore((s) => s.projects)
  const environments = useAppStore((s) => s.environments)
  const pendingQuota = useAppStore((s) => s.quotaRequests.filter((q) => q.status === 'pending').length)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState<'all' | RequestStatus>('all')
  const [query, setQuery] = useState('')
  const isSuper = scope.role === 'super_admin'
  const tab = (params.get('tab') as Tab) || 'action'

  const needsMe = (r: EnvRequest) =>
    isSuper ? r.status === 'escalated' : ['submitted', 'resubmitted', 'under_review'].includes(r.status) && r.raisedByRole !== 'tenant_admin'

  const overQuota = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const r of requests) {
      if (!['submitted', 'under_review', 'resubmitted', 'escalated'].includes(r.status)) continue
      const t = tenants.find((x) => x.id === r.tenantId)
      if (!t) continue
      const target = r.kind === 'change' ? environments.find((e) => e.id === r.envId) : undefined
      const d = target ? subQuota(allocationOf(r.spec), allocationOf(target.spec)) : allocationOf(r.spec)
      const extra = { ...ZERO, vcpu: Math.max(0, d.vcpu), ramGb: Math.max(0, d.ramGb), gpus: Math.max(0, d.gpus), storageGb: Math.max(0, d.storageGb) }
      m.set(r.id, checkQuota(t.quota, tenantAllocated(environments, t.id), extra).over)
    }
    return m
  }, [requests, tenants, environments])

  const actionCount = requests.filter(needsMe).length
  const rows = requests
    .filter((r) => (tab === 'action' ? needsMe(r) : true))
    .filter((r) => status === 'all' || r.status === status)
    .filter((r) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      const who = users.find((u) => u.id === r.requesterId)?.name ?? ''
      return [r.spec.name, who].some((s) => s.toLowerCase().includes(q))
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const columns: Column<EnvRequest>[] = [
    {
      key: 'name',
      header: 'Request',
      cell: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-text-primary">{r.spec.name}</span>
            {r.kind === 'change' && <Tag>Change</Tag>}
          </div>
          <span className="text-caption text-text-muted">{users.find((u) => u.id === r.requesterId)?.name}</span>
        </div>
      ),
    },
    ...(isSuper ? [{ key: 'tenant', header: 'Tenant', cell: (r: EnvRequest) => <span>{tenants.find((t) => t.id === r.tenantId)?.name}</span> }] : []),
    { key: 'project', header: 'Project', cell: (r) => <span className="text-text-secondary">{projects.find((p) => p.id === r.spec.projectId)?.name}</span>, className: 'hidden xl:table-cell' },
    {
      key: 'progress',
      header: 'Progress',
      cell: (r) => {
        const env = r.kind === 'new' && r.envId ? environments.find((e) => e.id === r.envId) : null
        const ev = mergedHistory(r, env)
        return <CompactTimeline events={ev} future={futureSteps(ev, r)} />
      },
      className: 'hidden lg:table-cell',
    },
    { key: 'updated', header: 'Updated', cell: (r) => <span className="text-text-secondary" title={formatDate(r.updatedAt)}>{relativeTime(r.updatedAt)}</span>, className: 'hidden md:table-cell' },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={r.status} />
          {overQuota.get(r.id) && <StatusBadge status="over-quota" />}
        </div>
      ),
    },
  ]

  const tabs: [Tab, string, number?][] = isSuper
    ? [
        ['action', 'Escalated to you', actionCount],
        ['all', 'All requests'],
        ['quota', 'Quota requests', pendingQuota],
      ]
    : [
        ['action', 'Needs your review', actionCount],
        ['all', 'All requests'],
      ]

  return (
    <>
      <PageHeader
        eyebrow={isSuper ? 'Approvals' : 'Approvals'}
        title="Requests"
        description={
          isSuper
            ? 'Tenant Admins forward requests for new infrastructure here. You give the final approval.'
            : 'Review requests from your tenant. Reject, ask for changes, or forward them to the Super Admin for approval.'
        }
        actions={
          !isSuper && (
            <Button onClick={() => navigate(newEnvPath(scope.role))}>
              <Plus /> Request infrastructure
            </Button>
          )
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border" role="tablist">
        {tabs.map(([t, label, n]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setParams({ tab: t })}
            className={cn(
              '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold',
              tab === t ? 'border-indigo text-indigo-text' : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {label}
            {!!n && <span className="tabular rounded-full bg-status-pending-bg px-2 py-0.5 text-xs text-status-pending-fg">{n}</span>}
          </button>
        ))}
      </div>

      {tab === 'quota' && isSuper ? (
        <QuotaRequests />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_220px]">
            <SearchInput value={query} onChange={setQuery} placeholder="Search by name or person" />
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {REQUEST_STATUSES.filter((s) => s !== 'draft').map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DataTable
            loading={loading}
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            rowLabel={(r) => `Open request ${r.spec.name}`}
            onRowClick={(r) => navigate(requestPath(scope.role, r.id))}
            empty={
              query || status !== 'all' ? (
                <EmptyState icon={SearchX} title="No requests match these filters" action={<Button variant="secondary" onClick={() => { setQuery(''); setStatus('all') }}>Clear filters</Button>} />
              ) : (
                <EmptyState
                  icon={Inbox}
                  title={tab === 'action' ? 'Nothing is waiting for you' : 'No requests yet'}
                  action={
                    tab === 'action' ? (
                      <Button variant="secondary" onClick={() => setParams({ tab: 'all' })}>
                        See all requests <ArrowRight />
                      </Button>
                    ) : undefined
                  }
                />
              )
            }
            mobileCard={(r) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold text-text-primary">{r.spec.name}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="flex items-center gap-2 text-caption text-text-secondary">
                  <Avatar name={users.find((u) => u.id === r.requesterId)?.name ?? '?'} size="sm" />
                  {users.find((u) => u.id === r.requesterId)?.name}
                  {isSuper && <> · {tenants.find((t) => t.id === r.tenantId)?.name}</>} · {relativeTime(r.updatedAt)}
                </div>
                {overQuota.get(r.id) && <StatusBadge status="over-quota" className="self-start" />}
              </div>
            )}
          />
        </>
      )}
    </>
  )
}
