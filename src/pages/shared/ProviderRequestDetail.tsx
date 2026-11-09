import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, ArrowUpRight, CheckCircle2, MessageSquareWarning, PencilLine, XCircle } from 'lucide-react'
import type { ProviderRequestStatus } from '@/data/types'
import { useAppStore, type ProviderRequestAction } from '@/store/useAppStore'
import { useScope } from '@/store/selectors'
import { latestRateCard, providerBudget } from '@/lib/cost'
import { dataClassLabel, roleLabel } from '@/lib/labels'
import { PROVIDER_REQUEST_LABELS } from '@/lib/requestItems'
import { indiaResidency, PROVIDER_TYPE_LABELS, WORKLOAD_LABELS } from '@/lib/providers'
import { formatDate, formatDateTime, formatInt } from '@/lib/format'
import { requestsPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { ProviderRequestBadge, Tag } from '@/components/shared/StatusBadge'
import { QuotaBar } from '@/components/shared/QuotaBar'
import { ProviderRequestDialog } from '@/components/shared/ProviderRequestDialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/controls'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import NotFound from '@/pages/NotFound'

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('card p-6', className)}>
      <h2 className="mb-4 font-heading text-h3 text-text-primary">{title}</h2>
      {children}
    </section>
  )
}

const DOT: Partial<Record<ProviderRequestStatus, string>> = { rejected: 'bg-red', revoked: 'bg-text-muted', cancelled: 'bg-text-muted' }

export default function ProviderRequestDetail() {
  const { id } = useParams()
  const scope = useScope()!
  const pr = useAppStore((s) => s.providerRequests.find((x) => x.id === id))
  const provider = useAppStore((s) => s.infraProviders.find((p) => p.id === pr?.providerId))
  const providers = useAppStore((s) => s.infraProviders)
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === pr?.tenantId))
  const users = useAppStore((s) => s.users)
  const catalog = useAppStore((s) => s.catalog)
  const environments = useAppStore((s) => s.environments)
  const openReq = useAppStore((s) => s.openProviderRequest)
  const decide = useAppStore((s) => s.decideProviderRequest)
  const [active, setActive] = useState<ProviderRequestAction | null>(null)
  const [comment, setComment] = useState('')
  const [cap, setCap] = useState('')
  const [regionIds, setRegionIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    if (id) openReq(id)
  }, [id, openReq])

  const spend = useMemo(
    () =>
      tenant
        ? tenant.approvedProviders
            .filter((a) => a.status === 'approved')
            .map((a) => ({ a, p: providers.find((x) => x.id === a.providerId), b: providerBudget(tenant, a.providerId, environments, { providers, catalog }) }))
        : [],
    [tenant, providers, environments, catalog],
  )

  const visible =
    !!pr &&
    (scope.role === 'super_admin'
      ? pr.history.some((h) => h.status === 'escalated')
      : scope.role === 'tenant_admin'
        ? pr.tenantId === scope.user.tenantId
        : pr.requesterId === scope.user.id)
  if (!pr || !visible || !provider || !tenant) return <NotFound message="This provider request doesn’t exist or is outside what you can see." />

  const requester = users.find((u) => u.id === pr.requesterId)
  const isSa = scope.role === 'super_admin'
  const isTa = scope.role === 'tenant_admin' && scope.user.tenantId === pr.tenantId
  const taStage = pr.raisedByRole === 'user' && ['submitted', 'under_review', 'resubmitted'].includes(pr.status)
  const saStage = pr.status === 'escalated'
  const mine = pr.requesterId === scope.user.id
  const canCancel = mine && ['submitted', 'under_review', 'escalated', 'changes_requested', 'resubmitted'].includes(pr.status)
  const card = latestRateCard(provider)
  const sensitive = pr.dataClassification === 'personal' || pr.dataClassification === 'children'

  const start = (a: ProviderRequestAction) => {
    setActive(a)
    setComment('')
    setError(null)
    setCap(String(pr.requestedCap))
    setRegionIds([...pr.regionIds])
  }
  const run = () => {
    if (!active) return
    const res = decide(pr.id, active, { comment, budgetCap: Number(cap), regionIds })
    if (!res.ok) return setError(res.error)
    const msg: Record<ProviderRequestAction, string> = {
      approve: `Approved ${provider.name} for ${tenant.name}.`,
      forward: 'Forwarded to the Super Admin.',
      request_changes: 'Asked for changes.',
      reject: 'Request rejected.',
      cancel: 'Request cancelled.',
    }
    toast.success(msg[active])
    setActive(null)
  }

  return (
    <>
      <Link to={requestsPath(scope.role)} className="link mb-4 inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" aria-hidden /> {scope.role === 'user' ? 'My requests' : 'Requests'}
      </Link>
      <PageHeader
        eyebrow={`Provider request · ${tenant.name}`}
        title={`${provider.name} access`}
        description={`Asked by ${requester?.name ?? 'someone'} (${roleLabel(pr.raisedByRole)}) on ${formatDate(pr.createdAt)}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            {isSa && saStage && (
              <>
                <Button onClick={() => start('approve')}>
                  <CheckCircle2 /> Approve access
                </Button>
                <Button variant="secondary" onClick={() => start('request_changes')}>
                  <MessageSquareWarning /> Request changes
                </Button>
                <Button variant="ghost" className="text-red-text hover:text-red-text" onClick={() => start('reject')}>
                  <XCircle /> Reject
                </Button>
              </>
            )}
            {isTa && taStage && (
              <>
                <Button onClick={() => start('forward')}>
                  <ArrowUpRight /> Forward to Super Admin
                </Button>
                <Button variant="secondary" onClick={() => start('request_changes')}>
                  <MessageSquareWarning /> Request changes
                </Button>
                <Button variant="ghost" className="text-red-text hover:text-red-text" onClick={() => start('reject')}>
                  <XCircle /> Reject
                </Button>
              </>
            )}
            {mine && pr.status === 'changes_requested' && (
              <Button onClick={() => setEditOpen(true)}>
                <PencilLine /> Edit and resubmit
              </Button>
            )}
            {canCancel && (
              <Button variant="ghost" className="text-red-text hover:text-red-text" onClick={() => start('cancel')}>
                Cancel request
              </Button>
            )}
          </div>
        }
      />
      <div className="-mt-2 mb-6 flex flex-wrap items-center gap-2">
        <ProviderRequestBadge status={pr.status} />
        <Tag>{dataClassLabel(pr.dataClassification)}</Tag>
        <span className="font-mono text-caption text-text-muted">{pr.id}</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="What’s requested">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="eyebrow">Regions</dt>
                <dd className="mt-1 text-text-primary">
                  {provider.regions
                    .filter((r) => pr.regionIds.includes(r.id))
                    .map((r) => `${r.name}${r.indiaResident ? '' : ' (outside India)'}`)
                    .join(', ')}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Expected workloads</dt>
                <dd className="mt-1 text-text-primary">{pr.workloads.map((w) => WORKLOAD_LABELS[w]).join(', ')}</dd>
              </div>
              <div>
                <dt className="eyebrow">Expected monthly spend</dt>
                <dd className="tabular mt-1 text-text-primary">₹{formatInt(pr.expectedMonthlySpend)}</dd>
              </div>
              <div>
                <dt className="eyebrow">Requested budget cap</dt>
                <dd className="tabular mt-1 text-text-primary">₹{formatInt(pr.requestedCap)} a month</dd>
              </div>
            </dl>
            <p className="eyebrow mb-2 mt-5">Why</p>
            <blockquote className="border-l-[3px] border-purple pl-3 text-sm italic text-text-primary">{pr.justification}</blockquote>
          </Card>

          <Card title="Timeline">
            <ol className="flex flex-col gap-3" aria-label="Status history">
              {pr.history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex gap-3 text-sm">
                  <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', DOT[h.status] ?? 'bg-indigo dark:bg-indigo-text')} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-text-primary">
                      <span className="font-semibold">{PROVIDER_REQUEST_LABELS[h.status]}</span>
                      <span className="text-text-secondary">
                        {' '}
                        · {users.find((u) => u.id === h.actorId)?.name ?? 'System'}
                        {h.actorRole !== 'system' ? ` (${roleLabel(h.actorRole)})` : ''} · {formatDateTime(h.at)}
                      </span>
                    </p>
                    {h.comment && <p className="mt-1 rounded-control bg-bg-subtle px-3 py-2 text-text-primary">{h.comment}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title={`${tenant.name}’s provider spend`}>
            {spend.length === 0 ? (
              <p className="text-sm text-text-secondary">No providers approved yet.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {spend.map(({ a, p, b }) => (
                  <li key={a.providerId}>
                    <QuotaBar compact label={p?.name ?? a.providerId} used={b.committed} total={b.cap} unit="credits / month" />
                    <p className="mt-1 text-caption text-text-muted">{formatInt(b.mtd)} credits so far this month</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={provider.name}>
            <p className="text-sm text-text-secondary">
              {PROVIDER_TYPE_LABELS[provider.type]} · India residency: {indiaResidency(provider)}
            </p>
            {card && (
              <>
                <ul className="mt-3 flex flex-col gap-1 text-caption">
                  {card.instanceTypes.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3">
                      <span className="text-text-secondary">
                        {i.name} {i.gpuType !== 'none' ? `· ${i.gpuCount}× ${i.gpuType}` : '· CPU'}
                      </span>
                      <span className="tabular font-semibold text-text-primary">₹{formatInt(i.hourlyRate)}/h</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-caption text-text-muted">
                  Rate card v{card.version} · effective from {formatDate(card.effectiveFrom)} · {card.source}
                </p>
              </>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent size="md">
          <DialogHeader
            title={
              active === 'approve'
                ? `Approve ${provider.name} for ${tenant.name}`
                : active === 'forward'
                  ? 'Forward to the Super Admin'
                  : active === 'request_changes'
                    ? 'Request changes'
                    : active === 'reject'
                      ? 'Reject request'
                      : 'Cancel request'
            }
            description={active === 'approve' ? 'Adjust the regions and the monthly budget cap if needed. People in the tenant can request environments on it straight away.' : undefined}
          />
          <DialogBody className="flex flex-col gap-4">
            {active === 'approve' && (
              <>
                <Field label="Monthly budget cap (₹)" htmlFor="ap-cap" required>
                  <Input id="ap-cap" type="number" min={1} step={5000} value={cap} onChange={(e) => { setCap(e.target.value); setError(null) }} />
                </Field>
                <Field label="Approved regions">
                  <div className="flex flex-col gap-2">
                    {provider.regions
                      .filter((r) => !sensitive || r.indiaResident)
                      .map((r) => (
                        <label key={r.id} className="flex cursor-pointer items-center gap-3 text-sm">
                          <Checkbox checked={regionIds.includes(r.id)} onCheckedChange={(v) => { setRegionIds(v ? [...regionIds, r.id] : regionIds.filter((x) => x !== r.id)); setError(null) }} aria-label={r.name} />
                          {r.name}
                        </label>
                      ))}
                  </div>
                </Field>
              </>
            )}
            {active !== 'cancel' && (
              <Field label={active === 'reject' ? 'Reason' : 'Comment'} htmlFor="ap-comment" required={active === 'reject' || active === 'request_changes'} helper={active === 'approve' || active === 'forward' ? 'Optional' : 'The requester sees it.'}>
                <Textarea id="ap-comment" value={comment} onChange={(e) => { setComment(e.target.value); setError(null) }} />
              </Field>
            )}
            {error && (
              <p className="rounded-control bg-status-rejected-bg px-3 py-2 text-caption text-status-rejected-fg" role="alert">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Back</Button>
            </DialogClose>
            <Button variant={active === 'reject' || active === 'cancel' ? 'destructive' : 'primary'} onClick={run}>
              {active === 'approve' ? 'Approve access' : active === 'forward' ? 'Forward to Super Admin' : active === 'request_changes' ? 'Send back for changes' : active === 'reject' ? 'Reject request' : 'Cancel request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProviderRequestDialog open={editOpen} onOpenChange={setEditOpen} existing={pr} />
    </>
  )
}
