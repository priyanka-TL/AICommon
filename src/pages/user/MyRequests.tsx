import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowRight, ChevronDown, ClipboardList, MessageSquare, PencilLine, Plus, RotateCcw, SearchX } from 'lucide-react'
import type { EnvRequest } from '@/data/types'
import { useAppStore, useCurrentTenant, useCurrentUser } from '@/store/useAppStore'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { estimateCost } from '@/lib/cost'
import { formatDateTime, formatInt, relativeTime } from '@/lib/format'
import { purposeLabel } from '@/lib/labels'
import { diffSpecs } from '@/lib/spec'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { Avatar } from '@/components/shared/Avatar'
import { SpecSummary } from '@/components/shared/SpecSummary'
import { requestBadge } from '@/pages/admin/RequestDrawer'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

type Filter = 'all' | 'pending' | 'approved' | 'rejected'
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['pending', 'Waiting for review'],
  ['approved', 'Approved'],
  ['rejected', 'Not approved'],
]

function ChangeList({ changes, tone }: { changes: { field: string; from: string; to: string }[]; tone: 'admin' | 'user' }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {changes.map((c) => (
        <li key={c.field} className={cn('rounded-control px-3 py-2 text-sm', tone === 'admin' ? 'bg-status-change-bg' : 'bg-bg-subtle')}>
          <span className={cn('font-semibold', tone === 'admin' ? 'text-status-change-fg' : 'text-text-primary')}>{c.field}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-text-secondary">
            <span className="line-through decoration-text-muted">{c.from}</span>
            <ArrowRight className="size-3.5 text-text-muted" aria-hidden />
            <span className="font-semibold text-text-primary">{c.to}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function RequestCard({ req, expanded, onToggle, showRequester }: { req: EnvRequest; expanded: boolean; onToggle: () => void; showRequester: boolean }) {
  const catalog = useAppStore((s) => s.catalog)
  const users = useAppStore((s) => s.users)
  const env = useAppStore((s) => s.environments.find((e) => e.id === req.envId))
  const addComment = useAppStore((s) => s.addComment)
  const saveDraft = useAppStore((s) => s.saveDraft)
  const navigate = useNavigate()
  const [comment, setComment] = useState('')
  const requester = users.find((u) => u.id === req.requesterId)
  const decidedBy = users.find((u) => u.id === req.decidedById)
  const est = estimateCost(req.spec, catalog)
  const requested = req.type === 'change' && req.previousSpec ? diffSpecs(req.previousSpec, req.spec, catalog).filter((c) => c.field !== 'Name') : []
  const adminComments = req.comments.filter((c) => users.find((u) => u.id === c.authorId)?.role === 'admin').length
  const bodyId = `req-body-${req.id}`

  const resubmit = () => {
    saveDraft({ ...req.spec, justification: '' })
    toast.success('Your earlier request is loaded as a draft.', { description: 'Adjust it and submit again.' })
    navigate('/app/environments/new')
  }

  return (
    <article className="card overflow-hidden">
      <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={bodyId} className="flex w-full flex-col gap-3 p-5 text-left hover:bg-bg-subtle/60 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-h3 text-text-primary">{req.spec.name}</h2>
            <Tag>{req.type === 'new' ? 'New environment' : 'Change'}</Tag>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-caption text-text-secondary">
            {showRequester && requester && (
              <span className="flex items-center gap-1.5">
                <Avatar name={requester.name} size="sm" /> {requester.name} ·
              </span>
            )}
            <span>{purposeLabel(req.spec.purpose)}</span>
            <span>· submitted {relativeTime(req.createdAt)}</span>
            <span className="tabular">· est. {formatInt(est.credits)} credits / month</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {adminComments > 0 && (
            <span className="flex items-center gap-1 text-caption text-text-secondary">
              <MessageSquare className="size-3.5" aria-hidden /> {req.comments.length}
            </span>
          )}
          {req.adminChanges.length > 0 && <StatusBadge status="change-requested" label="Approved with changes" />}
          {!(req.adminChanges.length > 0) && <StatusBadge status={requestBadge(req)} label={req.status === 'pending' ? (req.type === 'change' ? 'Change requested' : 'Waiting for review') : req.status === 'rejected' ? 'Not approved' : undefined} />}
          <ChevronDown className={cn('size-5 text-text-muted transition-transform', expanded && 'rotate-180')} aria-hidden />
        </div>
      </button>

      {expanded && (
        <div id={bodyId} className="grid gap-6 border-t border-border p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            {req.status === 'pending' && (
              <p className="rounded-control bg-status-pending-bg px-3 py-2.5 text-sm text-status-pending-fg">
                Waiting for the ShikshaLokam platform team. Most requests are reviewed within a working day.
              </p>
            )}

            {req.status === 'rejected' && (
              <div className="rounded-control bg-status-rejected-bg p-4 text-sm text-status-rejected-fg">
                <p className="font-semibold">
                  Not approved by {decidedBy?.name ?? 'an admin'}
                  {req.decidedAt && <span className="font-normal"> · {formatDateTime(req.decidedAt)}</span>}
                </p>
                <p className="mt-1">{req.rejectionReason}</p>
                {req.type === 'new' && (
                  <Button variant="secondary" size="compact" className="mt-3" onClick={resubmit}>
                    <RotateCcw /> Edit and resubmit
                  </Button>
                )}
              </div>
            )}

            {req.status === 'approved' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-text-primary">
                  {req.adminChanges.length ? 'Approved with changes' : 'Approved'} by {decidedBy?.name ?? 'an admin'}
                  {req.decidedAt && <span className="text-text-muted"> · {formatDateTime(req.decidedAt)}</span>}
                </p>
                {req.adminChanges.length > 0 && (
                  <>
                    <p className="flex items-center gap-1.5 text-caption font-semibold text-text-secondary">
                      <PencilLine className="size-3.5" aria-hidden /> What the admin changed
                    </p>
                    <ChangeList changes={req.adminChanges} tone="admin" />
                  </>
                )}
                {env && env.status !== 'pending' && env.status !== 'rejected' && (
                  <Button asChild variant="secondary" size="compact" className="self-start">
                    <Link to={`/app/environments/${env.id}`}>
                      Open environment <ArrowRight />
                    </Link>
                  </Button>
                )}
                {!env && <p className="text-caption text-text-muted">This environment has since been deleted.</p>}
              </div>
            )}

            {requested.length > 0 && (
              <div>
                <p className="mb-2 text-caption font-semibold text-text-secondary">What you asked to change</p>
                <ChangeList changes={requested} tone="user" />
              </div>
            )}

            <div>
              <p className="mb-2 text-caption font-semibold text-text-secondary">Your justification</p>
              <blockquote className="border-l-[3px] border-purple pl-3 text-sm italic text-text-primary">{req.spec.justification || 'None given.'}</blockquote>
            </div>

            <div>
              <p className="mb-3 text-caption font-semibold text-text-secondary">Comments</p>
              {req.comments.length === 0 ? (
                <p className="mb-3 text-sm text-text-secondary">No comments yet.</p>
              ) : (
                <ul className="mb-4 flex flex-col gap-4">
                  {req.comments.map((c) => {
                    const author = users.find((u) => u.id === c.authorId)
                    return (
                      <li key={c.id} className="flex gap-3">
                        <Avatar name={author?.name ?? '?'} size="sm" className="mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-caption">
                            <span className="font-semibold text-text-primary">{author?.name}</span>
                            {author?.role === 'admin' && <span className="text-text-muted"> · ShikshaLokam</span>}
                            <span className="text-text-muted"> · {relativeTime(c.at)}</span>
                          </p>
                          <p className="text-sm text-text-primary">{c.text}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              <div className="flex flex-col gap-2">
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Reply to your admin or add context" aria-label="Comment" className="min-h-[64px]" />
                <Button
                  variant="secondary"
                  size="compact"
                  className="self-end"
                  disabled={!comment.trim()}
                  onClick={() => {
                    addComment(req.id, comment)
                    setComment('')
                    toast.success('Comment added. Your admin will be notified.')
                  }}
                >
                  <MessageSquare /> Add comment
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-border p-4">
            <p className="eyebrow mb-3">{req.status === 'approved' && req.adminChanges.length ? 'Approved specification' : 'Requested specification'}</p>
            <SpecSummary spec={req.spec} catalog={catalog} />
          </div>
        </div>
      )}
    </article>
  )
}

export default function MyRequests() {
  const loading = useSimulatedLoading()
  const user = useCurrentUser()!
  const tenant = useCurrentTenant()!
  const requests = useAppStore((s) => s.requests)
  const [scope, setScope] = useState<'mine' | 'org'>('mine')
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [touched, setTouched] = useState(false)

  const scoped = useMemo(
    () =>
      requests
        .filter((r) => (scope === 'mine' ? r.requesterId === user.id : r.tenantId === tenant.id))
        .sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt)),
    [requests, scope, user.id, tenant.id],
  )
  const rows = scoped.filter((r) => filter === 'all' || r.status === filter)
  const count = (f: Filter) => (f === 'all' ? scoped.length : scoped.filter((r) => r.status === f).length)
  const isOpen = (id: string) => (touched ? expanded.has(id) : rows[0]?.id === id)

  const toggle = (id: string) => {
    const current = touched ? new Set(expanded) : new Set(rows[0] ? [rows[0].id] : [])
    if (current.has(id)) current.delete(id)
    else current.add(id)
    setExpanded(current)
    setTouched(true)
  }

  return (
    <>
      <PageHeader
        eyebrow={tenant.name}
        title="My requests"
        description="Track environment requests and changes, read your admin’s decisions and reply to comments."
        actions={
          <Button asChild>
            <Link to="/app/environments/new">
              <Plus /> Request environment
            </Link>
          </Button>
        }
      />

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 md:pb-0" role="group" aria-label="Filter by status">
          {FILTERS.map(([f, label]) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-caption font-semibold transition-colors',
                filter === f ? 'border-indigo bg-indigo-50 text-indigo-text dark:border-indigo-text' : 'border-border bg-bg-surface text-text-secondary hover:border-border-strong',
              )}
            >
              {label} <span className="tabular text-text-muted">{count(f)}</span>
            </button>
          ))}
        </div>
        <div className="flex w-fit rounded-control border border-border p-0.5" role="group" aria-label="Whose requests">
          {(
            [
              ['mine', 'Mine'],
              ['org', 'Whole organisation'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={scope === v}
              onClick={() => setScope(v)}
              className={cn('rounded-[8px] px-3 py-1 text-caption font-semibold', scope === v ? 'bg-indigo-50 text-indigo-text' : 'text-text-secondary hover:text-text-primary')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          {scoped.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={scope === 'mine' ? 'You haven’t made any requests yet' : 'No requests from your organisation yet'}
              description="Request an environment and follow its review here."
              action={
                <Button asChild variant="secondary">
                  <Link to="/app/environments/new">Request environment</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState icon={SearchX} title="No requests with this status" action={<Button variant="secondary" onClick={() => setFilter('all')}>Show all</Button>} />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((r) => (
            <RequestCard key={r.id} req={r} expanded={isOpen(r.id)} onToggle={() => toggle(r.id)} showRequester={scope === 'org'} />
          ))}
        </div>
      )}
    </>
  )
}
