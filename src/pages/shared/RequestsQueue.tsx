import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowRight, CheckCircle2, Gauge, Inbox, Plus, SearchX, XCircle } from 'lucide-react'
import type { EnvRequest, ProviderRequest, QuotaRequest, Suggestion } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useRequestItems, useScope, useScopedProjects } from '@/store/selectors'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { allocationOf, checkQuota, RESOURCES, subQuota, tenantAllocated, ZERO } from '@/lib/quota'
import { formatDate, formatInt, relativeTime } from '@/lib/format'
import { useRequestFilters } from '@/hooks/useRequestFilters'
import { filterCommon, filterItems, sortItems, type RequestItem } from '@/lib/requestItems'
import { newEnvPath, providerRequestPath, requestPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { ItemStatusBadge, RequestFilters, TypeLabel } from '@/components/shared/RequestFilters'
import { ReviewSheet } from '@/components/shared/SuggestionReview'
import { requestBudget, useBudgetInputs } from '@/components/shared/BudgetCapWarning'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { CompactTimeline, futureSteps, mergedHistory } from '@/components/shared/LifecycleTimeline'
import { Avatar } from '@/components/shared/Avatar'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/input'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'

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
  const items = useRequestItems()
  const projects = useScopedProjects()
  const tenants = useAppStore((s) => s.tenants)
  const users = useAppStore((s) => s.users)
  const allProjects = useAppStore((s) => s.projects)
  const environments = useAppStore((s) => s.environments)
  const pendingQuota = useAppStore((s) => s.quotaRequests.filter((q) => q.status === 'pending').length)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { filters, update, clear, active } = useRequestFilters(scope.role)
  const isSuper = scope.role === 'super_admin'
  const tab = (params.get('tab') as Tab) || 'action'
  const selected = items.find((i): i is Extract<RequestItem, { type: 'capability' }> => i.type === 'capability' && i.id === params.get('id'))?.source ?? null

  const setTab = (t: Tab) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (t === 'action') next.delete('tab')
      else next.set('tab', t)
      next.delete('id')
      return next
    })

  const envNeedsMe = (r: EnvRequest) =>
    isSuper ? r.status === 'escalated' : ['submitted', 'resubmitted', 'under_review'].includes(r.status) && r.raisedByRole !== 'tenant_admin'
  const capNeedsMe = (s: Suggestion) =>
    isSuper ? (s.forwarded && ['submitted', 'under_review'].includes(s.status)) || s.status === 'approved_tenant' : ['submitted', 'under_review'].includes(s.status) && !s.forwarded
  const provNeedsMe = (r: ProviderRequest) => (isSuper ? r.status === 'escalated' : r.raisedByRole === 'user' && ['submitted', 'under_review', 'resubmitted'].includes(r.status))
  const needsMe = (i: RequestItem) => (i.type === 'environment' ? envNeedsMe(i.source) : i.type === 'provider' ? provNeedsMe(i.source) : capNeedsMe(i.source))

  const overQuota = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const i of items) {
      if (i.type !== 'environment') continue
      const r = i.source
      if (!['submitted', 'under_review', 'resubmitted', 'escalated'].includes(r.status)) continue
      const t = tenants.find((x) => x.id === r.tenantId)
      if (!t) continue
      const target = r.kind === 'change' ? environments.find((e) => e.id === r.envId) : undefined
      const d = target ? subQuota(allocationOf(r.spec), allocationOf(target.spec)) : allocationOf(r.spec)
      const extra = { ...ZERO, vcpu: Math.max(0, d.vcpu), ramGb: Math.max(0, d.ramGb), gpus: Math.max(0, d.gpus), storageGb: Math.max(0, d.storageGb) }
      m.set(r.id, checkQuota(t.quota, tenantAllocated(environments, t.id), extra).over)
    }
    return m
  }, [items, tenants, environments])

  const budgetInputs = useBudgetInputs()
  const overBudget = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const i of items) {
      if (i.type !== 'environment' || !['submitted', 'under_review', 'resubmitted', 'escalated'].includes(i.source.status)) continue
      m.set(i.id, !!requestBudget(i.source, budgetInputs)?.over)
    }
    return m
  }, [items, budgetInputs])

  const requesterName = (i: RequestItem) => users.find((u) => u.id === i.requesterId)?.name ?? ''
  const tabItems = tab === 'action' ? items.filter(needsMe) : items
  const common = filterCommon(tabItems, filters, (i) => [requesterName(i)])
  const counts = {
    all: common.length,
    environment: common.filter((i) => i.type === 'environment').length,
    capability: common.filter((i) => i.type === 'capability').length,
    provider: common.filter((i) => i.type === 'provider').length,
  }
  const actionCount = items.filter(needsMe).length
  const rows = sortItems(filterItems(tabItems, filters, (i) => [requesterName(i)]), filters.sort)

  const openItem = (i: RequestItem) => {
    if (i.type === 'environment') return navigate(requestPath(scope.role, i.id))
    if (i.type === 'provider') return navigate(providerRequestPath(scope.role, i.id))
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('id', i.id)
      return next
    })
  }

  const columns: Column<RequestItem>[] = [
    { key: 'type', header: 'Type', cell: (i) => <TypeLabel type={i.type} /> },
    {
      key: 'name',
      header: 'Request',
      cell: (i) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-text-primary">{i.name}</span>
            {i.type === 'environment' && i.source.kind === 'change' && <Tag>Change</Tag>}
            {i.type === 'environment' && i.source.origin === 'admin' && <Tag>Admin-created</Tag>}
          </div>
          <span className="text-caption text-text-muted">
            {requesterName(i)} · <span className="font-mono text-xs">{i.id}</span>
          </span>
        </div>
      ),
    },
    ...(isSuper ? [{ key: 'tenant', header: 'Tenant', cell: (i: RequestItem) => <span>{tenants.find((t) => t.id === i.tenantId)?.name}</span> }] : []),
    {
      key: 'where',
      header: 'Project or repository',
      cell: (i) =>
        i.type === 'capability' ? (
          <span className="block max-w-[200px] truncate font-mono text-caption text-text-secondary" title={i.repo ?? undefined}>
            {i.repo}
          </span>
        ) : (
          <span className="text-text-secondary">{allProjects.find((p) => p.id === i.projectId)?.name}</span>
        ),
      className: 'hidden xl:table-cell',
    },
    {
      key: 'progress',
      header: 'Progress',
      cell: (i) => {
        if (i.type !== 'environment') return <span className="text-caption text-text-muted">Submitted {formatDate(i.submittedAt)}</span>
        const r = i.source
        const env = r.kind === 'new' && r.envId ? environments.find((e) => e.id === r.envId) : null
        const ev = mergedHistory(r, env)
        return <CompactTimeline events={ev} future={futureSteps(ev, r)} />
      },
      className: 'hidden lg:table-cell',
    },
    { key: 'updated', header: 'Updated', cell: (i) => <span className="text-text-secondary" title={formatDate(i.updatedAt)}>{relativeTime(i.updatedAt)}</span>, className: 'hidden md:table-cell' },
    {
      key: 'status',
      header: 'Status',
      cell: (i) => (
        <div className="flex flex-wrap gap-1.5">
          <ItemStatusBadge item={i} />
          {overQuota.get(i.id) && <StatusBadge status="over-quota" />}
          {overBudget.get(i.id) && <StatusBadge status="over-quota" label="Over budget cap" />}
        </div>
      ),
    },
  ]

  const tabs: [Tab, string, number?][] = isSuper
    ? [
        ['action', 'Waiting for you', actionCount],
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
        eyebrow="Approvals"
        title="Requests"
        description={
          isSuper
            ? 'Infrastructure requests and capability suggestions forwarded by Tenant Admins. You give the final approval and decide what is published.'
            : 'Environment requests and capability suggestions from your tenant. Approve, ask for changes, or forward them to the Super Admin.'
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
            onClick={() => setTab(t)}
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
          <RequestFilters role={scope.role} filters={filters} update={update} clear={clear} active={active} counts={counts} projects={projects} />
          <DataTable
            loading={loading}
            rows={rows}
            columns={columns}
            rowKey={(i) => `${i.type}-${i.id}`}
            rowLabel={(i) => `Open request ${i.name}`}
            onRowClick={openItem}
            empty={
              active || filters.type !== 'all' ? (
                <EmptyState icon={SearchX} title="No requests match these filters" action={<Button variant="secondary" onClick={() => (active ? clear() : update({ type: 'all' }))}>{active ? 'Clear filters' : 'Show all types'}</Button>} />
              ) : (
                <EmptyState
                  icon={Inbox}
                  title={tab === 'action' ? 'Nothing is waiting for you' : 'No requests yet'}
                  action={
                    tab === 'action' ? (
                      <Button variant="secondary" onClick={() => setTab('all')}>
                        See all requests <ArrowRight />
                      </Button>
                    ) : undefined
                  }
                />
              )
            }
            mobileCard={(i) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold text-text-primary">{i.name}</span>
                  <ItemStatusBadge item={i} />
                </div>
                <TypeLabel type={i.type} className="text-caption" />
                <div className="flex items-center gap-2 text-caption text-text-secondary">
                  <Avatar name={requesterName(i) || '?'} size="sm" />
                  {requesterName(i)}
                  {isSuper && <> · {tenants.find((t) => t.id === i.tenantId)?.name}</>} · {relativeTime(i.updatedAt)}
                </div>
                {overQuota.get(i.id) && <StatusBadge status="over-quota" className="self-start" />}
              </div>
            )}
          />
        </>
      )}
      <ReviewSheet
        suggestion={selected}
        onClose={() =>
          setParams((prev) => {
            const next = new URLSearchParams(prev)
            next.delete('id')
            return next
          })
        }
      />
    </>
  )
}
