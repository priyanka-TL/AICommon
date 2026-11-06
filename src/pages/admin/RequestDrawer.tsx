import { useState } from 'react'
import { AlertTriangle, CheckCircle2, MessageSquare, PencilLine, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { EnvRequest } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { checkQuota, estimateCost } from '@/lib/cost'
import { formatDateTime, formatInt, relativeTime } from '@/lib/format'
import { purposeLabel } from '@/lib/labels'
import { diffSpecs } from '@/lib/spec'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Avatar } from '@/components/shared/Avatar'
import { StatusBadge, Tag, type BadgeStatus } from '@/components/shared/StatusBadge'
import { SpecSummary } from '@/components/shared/SpecSummary'
import { CostBreakdown } from '@/components/shared/CostBreakdown'
import { ApproveWithChangesDialog } from './ApproveWithChangesDialog'

export function requestBadge(r: EnvRequest): BadgeStatus {
  if (r.status === 'pending') return r.type === 'change' ? 'change-requested' : 'pending'
  return r.status
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-6 py-5">
      <h3 className="mb-3 font-heading text-h3 text-text-primary">{title}</h3>
      {children}
    </section>
  )
}

export function RequestDrawer({ request, onClose }: { request: EnvRequest | null; onClose: () => void }) {
  return (
    <Sheet open={!!request} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>{request && <DrawerBody request={request} />}</SheetContent>
    </Sheet>
  )
}

function DrawerBody({ request }: { request: EnvRequest }) {
  const catalog = useAppStore((s) => s.catalog)
  const users = useAppStore((s) => s.users)
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === request.tenantId))!
  const approve = useAppStore((s) => s.approveRequest)
  const reject = useAppStore((s) => s.rejectRequest)
  const addComment = useAppStore((s) => s.addComment)
  const requester = users.find((u) => u.id === request.requesterId)
  const decidedBy = users.find((u) => u.id === request.decidedById)

  const [awcOpen, setAwcOpen] = useState(false)
  const [confirmOverQuota, setConfirmOverQuota] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  const est = estimateCost(request.spec, catalog)
  const quota = checkQuota(tenant, est)
  const pending = request.status === 'pending'
  const changeDiff = request.type === 'change' && request.previousSpec ? diffSpecs(request.previousSpec, request.spec, catalog) : []

  const doApprove = () => {
    approve(request.id)
    toast.success(`Approved “${request.spec.name}”.`, {
      description: request.type === 'new' ? `${tenant.name}’s environment is being set up.` : `${tenant.name} has been notified.`,
    })
  }

  const doReject = () => {
    if (!reason.trim()) {
      setReasonError('Give a reason so the requester knows what to change.')
      return
    }
    reject(request.id, reason.trim())
    setRejectOpen(false)
    setReason('')
    toast.error(`Rejected “${request.spec.name}”.`, { description: `${tenant.name} has been notified with your reason.` })
  }

  return (
    <>
      <div className="border-b border-border px-6 pb-5 pr-14 pt-6">
        <p className="eyebrow">{request.type === 'new' ? 'New environment request' : 'Change request'}</p>
        <SheetTitle className="mt-1 font-heading text-h2 text-text-primary">{request.spec.name}</SheetTitle>
        <SheetDescription className="sr-only">Request details and actions</SheetDescription>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={requestBadge(request)} />
          {pending && quota.over && <StatusBadge status="over-quota" />}
          <Tag>{purposeLabel(request.spec.purpose)}</Tag>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Block title="Requester">
          <div className="flex items-center gap-3">
            <Avatar name={requester?.name ?? '?'} size="lg" />
            <div className="min-w-0">
              <p className="font-semibold text-text-primary">{requester?.name}</p>
              <p className="truncate text-caption text-text-secondary">
                {requester?.title} · {requester?.email}
              </p>
              <p className="text-caption text-text-muted">
                {tenant.name} · submitted {relativeTime(request.createdAt)}
              </p>
            </div>
          </div>
        </Block>

        {pending && quota.over && (
          <div className="mx-6 mt-5 flex gap-3 rounded-card bg-status-over-bg p-4 text-status-over-fg">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="text-sm">
              <p className="font-semibold">This request is over {tenant.name}’s quota</p>
              <p className="mt-1">
                {quota.creditOverage > 0 && `It needs ${formatInt(quota.creditOverage)} more credits than remain this month. `}
                {quota.gpuOverage > 0 && `It needs ${formatInt(quota.gpuOverage)} more GPU-hours than remain. `}
                Approve with changes to bring it within quota, or approve as is to allow the overage.
              </p>
            </div>
          </div>
        )}

        <Block title="Estimated cost">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div>
              <p className="eyebrow">Credits / month</p>
              <p className="tabular font-heading text-h2 text-text-primary">{formatInt(est.credits)}</p>
            </div>
            <div>
              <p className="eyebrow">GPU-hours</p>
              <p className="tabular font-heading text-h2 text-text-primary">{formatInt(est.gpuHours)}</p>
            </div>
            <div>
              <p className="eyebrow">Credits left</p>
              <p className="tabular font-heading text-h2 text-text-primary">{formatInt(quota.creditsRemaining)}</p>
            </div>
          </div>
          <CostBreakdown est={est} />
        </Block>

        {changeDiff.length > 0 && (
          <Block title="Requested changes">
            <ul className="flex flex-col gap-2">
              {changeDiff.map((c) => (
                <li key={c.field} className="rounded-control bg-bg-subtle px-3 py-2 text-sm">
                  <span className="font-semibold text-text-primary">{c.field}</span>
                  <span className="block text-text-secondary">
                    {c.from} → <span className="font-semibold text-text-primary">{c.to}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Block>
        )}

        <Block title="Justification">
          <blockquote className="border-l-[3px] border-purple pl-3 text-sm italic text-text-primary">
            {request.spec.justification || 'No justification given.'}
          </blockquote>
        </Block>

        <Block title="Environment specification">
          <SpecSummary spec={request.spec} catalog={catalog} />
        </Block>

        {request.status !== 'pending' && (
          <Block title="Decision">
            <p className="flex items-center gap-2 text-sm text-text-primary">
              {request.status === 'approved' ? (
                <CheckCircle2 className="size-4 text-teal" aria-hidden />
              ) : (
                <XCircle className="size-4 text-red-text" aria-hidden />
              )}
              {request.status === 'approved' ? 'Approved' : 'Rejected'} by {decidedBy?.name ?? 'an admin'}
              {request.decidedAt && <span className="text-text-muted">· {formatDateTime(request.decidedAt)}</span>}
            </p>
            {request.rejectionReason && <p className="mt-2 text-sm text-text-secondary">{request.rejectionReason}</p>}
            {request.adminChanges.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1">
                {request.adminChanges.map((c) => (
                  <li key={c.field} className="text-caption text-text-secondary">
                    <span className="font-semibold text-text-primary">{c.field}:</span> {c.from} → {c.to}
                  </li>
                ))}
              </ul>
            )}
          </Block>
        )}

        <Block title={`Comments (${request.comments.length})`}>
          {request.comments.length > 0 ? (
            <ul className="mb-4 flex flex-col gap-4">
              {request.comments.map((c) => {
                const author = users.find((u) => u.id === c.authorId)
                return (
                  <li key={c.id} className="flex gap-3">
                    <Avatar name={author?.name ?? '?'} size="sm" className="mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-caption">
                        <span className="font-semibold text-text-primary">{author?.name}</span>{' '}
                        <span className="text-text-muted">· {relativeTime(c.at)}</span>
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
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ask a question or leave a note for the requester"
              aria-label="Comment"
              className="min-h-[72px]"
            />
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
        </Block>
      </div>

      {pending && (
        <div className="flex flex-col gap-2 border-t border-border bg-bg-surface px-6 py-4 sm:flex-row-reverse sm:items-center">
          <Button onClick={() => (quota.over ? setConfirmOverQuota(true) : doApprove())}>
            <CheckCircle2 /> Approve request
          </Button>
          <Button variant="secondary" onClick={() => setAwcOpen(true)}>
            <PencilLine /> Approve with changes
          </Button>
          <Button variant="ghost" className="text-red-text hover:text-red-text sm:mr-auto" onClick={() => setRejectOpen(true)}>
            <XCircle /> Reject
          </Button>
        </div>
      )}

      <ApproveWithChangesDialog request={request} open={awcOpen} onOpenChange={setAwcOpen} />

      <AlertDialog open={confirmOverQuota} onOpenChange={setConfirmOverQuota}>
        <AlertDialogContent
          title="Approve over quota?"
          description={`“${request.spec.name}” needs more than ${tenant.name} has left this month. Approving lets the organisation go over quota. You can also approve with changes to reduce it.`}
        >
          <AlertDialogCancel asChild>
            <Button variant="secondary">Go back</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button onClick={doApprove}>Approve over quota</Button>
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={rejectOpen}
        onOpenChange={(o) => {
          setRejectOpen(o)
          if (!o) setReasonError(null)
        }}
      >
        <DialogContent size="md">
          <DialogHeader title="Reject request" description={`${requester?.name} will see your reason and can submit a new request.`} />
          <DialogBody>
            <Field label="Reason" htmlFor="reject-reason" required error={reasonError}>
              <Textarea
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="For example: Children’s data needs a signed consent process first. Attach it and submit again."
                aria-invalid={!!reasonError}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={doReject}>
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
