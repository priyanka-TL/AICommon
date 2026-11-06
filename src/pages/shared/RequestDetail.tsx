import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowRight, MessageSquare, MessageSquareWarning } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useScope } from '@/store/selectors'
import { estimateCost } from '@/lib/cost'
import { formatInt, relativeTime } from '@/lib/format'
import { purposeLabel, roleLabel } from '@/lib/labels'
import { allocationOf, tenantAllocated } from '@/lib/quota'
import { diffSpecs } from '@/lib/spec'
import { envPath, requestsPath } from '@/lib/paths'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { LifecycleTimeline, futureSteps, mergedHistory } from '@/components/shared/LifecycleTimeline'
import { RequestActions, useRequestQuota } from '@/components/shared/RequestActions'
import { SpecSummary } from '@/components/shared/SpecSummary'
import { CostBreakdown } from '@/components/shared/CostBreakdown'
import { ResourceQuota } from '@/components/shared/ResourceQuota'
import { Avatar } from '@/components/shared/Avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import NotFound from '@/pages/NotFound'

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-6 ${className ?? ''}`}>
      <h2 className="mb-4 font-heading text-h3 text-text-primary">{title}</h2>
      {children}
    </section>
  )
}

export default function RequestDetail() {
  const { id } = useParams()
  const scope = useScope()!
  const request = useAppStore((s) => s.requests.find((r) => r.id === id))
  const users = useAppStore((s) => s.users)
  const catalog = useAppStore((s) => s.catalog)
  const projects = useAppStore((s) => s.projects)
  const environments = useAppStore((s) => s.environments)
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === request?.tenantId))
  const openRequest = useAppStore((s) => s.openRequest)
  const addComment = useAppStore((s) => s.addComment)
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (id) openRequest(id)
  }, [id, openRequest])

  const quota = useRequestQuota(request ?? ({ tenantId: '', spec: {}, status: 'approved' } as never))

  const visible =
    !!request &&
    (scope.role === 'super_admin'
      ? request.status !== 'draft'
      : scope.role === 'tenant_admin'
        ? request.tenantId === scope.user.tenantId && (request.status !== 'draft' || request.requesterId === scope.user.id)
        : request.requesterId === scope.user.id)
  if (!request || !visible || !tenant) return <NotFound message="This request doesn’t exist or is outside what you can see." />

  const requester = users.find((u) => u.id === request.requesterId)
  const env = request.envId ? environments.find((e) => e.id === request.envId) : undefined
  const events = mergedHistory(request, request.kind === 'new' ? env : null)
  const future = futureSteps(events, request)
  const est = estimateCost(request.spec, catalog)
  const used = tenantAllocated(environments, tenant.id)
  const open = !['approved', 'rejected', 'cancelled', 'draft'].includes(request.status)
  const requested = request.kind === 'change' && request.previousSpec ? diffSpecs(request.previousSpec, request.spec, catalog, projects) : []
  const project = projects.find((p) => p.id === request.spec.projectId)
  const lastAsk = [...request.history].reverse().find((h) => h.status === 'changes_requested')

  return (
    <>
      <PageHeader
        eyebrow={`${request.kind === 'new' ? 'New environment request' : 'Change request'}${scope.role === 'super_admin' ? ` · ${tenant.name}` : ''}`}
        title={request.spec.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={request.status} />
            {open && quota.over && <StatusBadge status="over-quota" />}
            <Tag>{purposeLabel(request.spec.purpose)}</Tag>
            {project && <Tag>{project.name}</Tag>}
          </span>
        }
        actions={<RequestActions request={request} />}
      />

      {request.status === 'changes_requested' && lastAsk?.comment && (
        <div className="mb-6 flex gap-3 rounded-card bg-status-change-bg p-4 text-sm text-status-change-fg">
          <MessageSquareWarning className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">
              {users.find((u) => u.id === lastAsk.actorId)?.name} asked for changes
            </p>
            <p className="mt-1">{lastAsk.comment}</p>
          </div>
        </div>
      )}

      {env && request.kind === 'new' && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-bg-surface px-5 py-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-text-secondary">Environment</span>
            <StatusBadge status={env.status} />
            {env.failureReason && env.status === 'provisioning_failed' && <span className="text-caption text-red-text">{env.failureReason}</span>}
          </div>
          <Button asChild variant="secondary" size="compact">
            <Link to={envPath(scope.role, env.id)}>
              Open environment <ArrowRight />
            </Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Approval timeline">
            <LifecycleTimeline events={events} future={future} users={users} />
          </Card>

          {requested.length > 0 && (
            <Card title="What this change asks for">
              <ul className="flex flex-col gap-2">
                {requested.map((c) => (
                  <li key={c.field} className="rounded-control bg-bg-subtle px-3 py-2 text-sm">
                    <span className="font-semibold text-text-primary">{c.field}</span>
                    <span className="block text-text-secondary">
                      {c.from} → <span className="font-semibold text-text-primary">{c.to}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {request.adminChanges.length > 0 && (
            <Card title="Allocation changed by an approver">
              <ul className="flex flex-col gap-2">
                {request.adminChanges.map((c, i) => (
                  <li key={`${c.field}-${i}`} className="rounded-control bg-status-change-bg px-3 py-2 text-sm text-status-change-fg">
                    <span className="font-semibold">{c.field}:</span> {c.from} → {c.to}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Justification">
            <blockquote className="border-l-[3px] border-purple pl-3 text-sm italic text-text-primary">{request.spec.justification || 'None given.'}</blockquote>
          </Card>

          <Card title="Specification">
            <SpecSummary spec={request.spec} catalog={catalog} projects={projects} />
          </Card>

          <Card title={`Comments (${request.comments.length})`}>
            {request.comments.length > 0 ? (
              <ul className="mb-4 flex flex-col gap-4">
                {request.comments.map((c) => {
                  const author = users.find((u) => u.id === c.authorId)
                  return (
                    <li key={c.id} className="flex gap-3">
                      <Avatar name={author?.name ?? '?'} size="sm" className="mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-caption">
                          <span className="font-semibold text-text-primary">{author?.name}</span>
                          <span className="text-text-muted">
                            {' '}
                            · {author ? roleLabel(author.role) : ''} · {relativeTime(c.at)}
                          </span>
                        </p>
                        <p className="text-sm text-text-primary">{c.text}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-text-secondary">No comments yet.</p>
            )}
            <div className="flex flex-col gap-2">
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a note or ask a question" aria-label="Comment" className="min-h-[72px]" />
              <Button
                variant="secondary"
                size="compact"
                className="self-end"
                disabled={!comment.trim()}
                onClick={() => {
                  addComment(request.id, comment)
                  setComment('')
                  toast.success('Comment added.')
                }}
              >
                <MessageSquare /> Add comment
              </Button>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Requested by">
            <div className="flex items-center gap-3">
              <Avatar name={requester?.name ?? '?'} size="lg" />
              <div className="min-w-0">
                <p className="font-semibold text-text-primary">{requester?.name}</p>
                <p className="truncate text-caption text-text-secondary">
                  {requester ? roleLabel(requester.role) : ''} · {tenant.name}
                </p>
                <p className="text-caption text-text-muted">Submitted {relativeTime(request.createdAt)}</p>
              </div>
            </div>
          </Card>

          <Card title={`${tenant.name} quota`}>
            {open && quota.over && (
              <p className="mb-4 rounded-control bg-status-over-bg px-3 py-2.5 text-caption text-status-over-fg">
                Over quota: {quota.items.map((i) => `${i.need} ${i.unit} needed, ${i.left} left`).join('; ')}.
              </p>
            )}
            <ResourceQuota compact used={used} total={tenant.quota} projected={open ? allocationOf(request.spec) : undefined} />
            {open && <p className="mt-3 text-caption text-text-muted">The lighter part shows this request.</p>}
          </Card>

          <Card title="Estimated cost">
            <p className="mb-3 flex items-baseline gap-2">
              <span className="tabular font-heading text-kpi text-text-primary">{formatInt(est.credits)}</span>
              <span className="text-sm text-text-secondary">credits / month</span>
            </p>
            <CostBreakdown est={est} />
          </Card>

          <Button asChild variant="ghost" className="self-start">
            <Link to={requestsPath(scope.role)}>Back to requests</Link>
          </Button>
        </div>
      </div>
    </>
  )
}
