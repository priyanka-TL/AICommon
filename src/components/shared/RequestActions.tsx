import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, ArrowUpRight, CheckCircle2, MessageSquareWarning, PencilLine, XCircle } from 'lucide-react'
import type { EnvRequest, EnvSpec, RequestStatus } from '@/data/types'
import { useAppStore, useCurrentUser } from '@/store/useAppStore'
import { requestActions, type Transition } from '@/lib/lifecycle'
import { allocationOf, checkQuota, quotaMessage, subQuota, tenantAllocated, ZERO } from '@/lib/quota'
import { diffSpecs } from '@/lib/spec'
import { continueRequestPath } from '@/lib/paths'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/input'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { ConfirmDialog } from './ConfirmDialog'
import { AllocationFields } from './AllocationFields'
import { StatusBadge } from './StatusBadge'
import { checkProviderCapacity, ProviderCapacityWarning } from './ProviderCapacityWarning'
import { BudgetCapWarning, requestBudget, useBudgetInputs } from './BudgetCapWarning'

const ICONS: Partial<Record<RequestStatus, typeof CheckCircle2>> = {
  approved: CheckCircle2,
  escalated: ArrowUpRight,
  changes_requested: MessageSquareWarning,
  rejected: XCircle,
  resubmitted: PencilLine,
  submitted: PencilLine,
}

/** Over-quota check for a request against its tenant's current allocation. */
export function useRequestQuota(req: EnvRequest, spec: EnvSpec = req.spec) {
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === req.tenantId))
  const envs = useAppStore((s) => s.environments)
  return useMemo(() => {
    if (!tenant) return { over: false, items: [], tenant }
    const used = tenantAllocated(envs, tenant.id)
    const target = req.kind === 'change' ? envs.find((e) => e.id === req.envId) : undefined
    const delta = target ? subQuota(allocationOf(spec), allocationOf(target.spec)) : allocationOf(spec)
    const extra = { vcpu: Math.max(0, delta.vcpu), ramGb: Math.max(0, delta.ramGb), gpus: Math.max(0, delta.gpus), storageGb: Math.max(0, delta.storageGb) }
    return { ...checkQuota(tenant.quota, used, req.status === 'approved' ? ZERO : extra), tenant }
  }, [tenant, envs, req, spec])
}

export function RequestActions({ request, className }: { request: EnvRequest; className?: string }) {
  const user = useCurrentUser()
  const catalog = useAppStore((s) => s.catalog)
  const projects = useAppStore((s) => s.projects)
  const infraProviders = useAppStore((s) => s.infraProviders)
  const allEnvironments = useAppStore((s) => s.environments)
  const budgetInputs = useBudgetInputs()
  const transition = useAppStore((s) => s.transitionRequest)
  const navigate = useNavigate()
  const [active, setActive] = useState<Transition<RequestStatus> | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editSpec, setEditSpec] = useState<EnvSpec | null>(null)
  const [simulateFailure, setSimulateFailure] = useState(false)
  const quota = useRequestQuota(request, editSpec ?? request.spec)

  if (!user) return null
  const actions = requestActions(request, user)
  if (!actions.length) return null

  const open = (t: Transition<RequestStatus>) => {
    if (t.to === 'resubmitted' || (t.from === 'draft' && t.to === 'submitted')) {
      navigate(continueRequestPath(user.role, request.id))
      return
    }
    setActive(t)
    setComment('')
    setError(null)
    setEditSpec(null)
    setSimulateFailure(false)
  }

  const run = () => {
    if (!active) return
    const res = transition(request.id, active.to, { comment, spec: editSpec ?? undefined, simulateFailure })
    if (!res.ok) {
      setError(res.error)
      return
    }
    const messages: Partial<Record<RequestStatus, string>> = {
      escalated: 'Forwarded to the Super Admin.',
      approved: request.kind === 'new' ? 'Approved. Provisioning has started.' : 'Approved. The change is applied.',
      changes_requested: 'Changes requested. The requester has been notified.',
      rejected: 'Request rejected. The requester has been notified.',
      cancelled: 'Request cancelled.',
    }
    toast.success(messages[active.to] ?? 'Done.')
    setActive(null)
  }

  const destructiveSimple = active && active.tone === 'destructive' && !active.requires
  const needsText = active?.requires
  const isForward = active?.to === 'escalated'
  const isApprove = active?.to === 'approved'
  const changes = editSpec ? diffSpecs(request.spec, editSpec, catalog, projects, infraProviders) : []
  const budget = requestBudget(request, budgetInputs, editSpec ?? request.spec)
  const capacity = checkProviderCapacity(editSpec ?? request.spec, request.kind === 'change' ? request.previousSpec : null, infraProviders, allEnvironments)

  return (
    <>
      <div className={className ?? 'flex flex-wrap gap-2'}>
        {[...actions]
          .sort((a, b) => ['primary', 'secondary', 'destructive'].indexOf(a.tone) - ['primary', 'secondary', 'destructive'].indexOf(b.tone))
          .map((t) => {
            const Icon = ICONS[t.to]
            const label = t.from === 'draft' && t.to === 'submitted' ? 'Continue draft' : t.label
            return (
              <Button
                key={t.to}
                variant={t.tone === 'primary' ? 'primary' : t.tone === 'secondary' ? 'secondary' : 'ghost'}
                className={t.tone === 'destructive' ? 'text-red-text hover:text-red-text' : undefined}
                onClick={() => open(t)}
              >
                {Icon && <Icon />} {label}
              </Button>
            )
          })}
      </div>

      <ConfirmDialog
        open={!!destructiveSimple}
        onOpenChange={(o) => !o && setActive(null)}
        title={`${active?.label}?`}
        description={`“${request.spec.name}” will be cancelled. You can start a new request at any time.`}
        confirmLabel={active?.label ?? 'Confirm'}
        destructive
        onConfirm={run}
      />

      <Dialog open={!!active && !destructiveSimple} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent size={isForward || isApprove ? 'lg' : 'md'}>
          <DialogHeader
            title={isApprove ? 'Approve request' : isForward ? 'Forward to the Super Admin' : (active?.label ?? '')}
            description={
              isApprove
                ? 'Approving starts provisioning straight away.'
                : isForward
                  ? 'The Super Admin gives final approval for new infrastructure. You can adjust the allocation first.'
                  : active?.requires === 'reason'
                    ? 'The requester sees your reason.'
                    : 'The requester sees your comment and can edit and resubmit.'
            }
          />
          <DialogBody className="flex flex-col gap-5">
            {(isForward || isApprove) && quota.over && quota.tenant && (
              <div className="flex gap-3 rounded-card bg-status-over-bg p-4 text-sm text-status-over-fg">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
                <div>
                  <StatusBadge status="over-quota" />
                  <p className="mt-2">{quotaMessage(quota.items, quota.tenant.name, user.role === 'super_admin' ? 'super_admin' : 'tenant_admin')}</p>
                </div>
              </div>
            )}

            {(isForward || isApprove) && <BudgetCapWarning check={budget} audience="reviewer" />}
            {(isForward || isApprove) && <ProviderCapacityWarning spec={editSpec ?? request.spec} previous={request.kind === 'change' ? request.previousSpec : null} />}

            {(isForward || isApprove) && (
              <div className="rounded-card border border-border p-4">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-text-primary">
                  <Checkbox checked={!!editSpec} onCheckedChange={(v) => setEditSpec(v ? structuredClone(request.spec) : null)} />
                  Change the allocation first
                </label>
                {editSpec && (
                  <div className="mt-4 flex flex-col gap-4">
                    <AllocationFields spec={editSpec} onChange={setEditSpec} catalog={catalog} />
                    {changes.length > 0 && (
                      <ul className="flex flex-col gap-1 rounded-control bg-bg-subtle p-3">
                        {changes.map((c) => (
                          <li key={c.field} className="text-caption text-text-primary">
                            <span className="font-semibold">{c.field}:</span> {c.from} → {c.to}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {isApprove && request.kind === 'new' && (
              <label className="flex cursor-pointer items-start gap-3 rounded-card border border-dashed border-border-strong p-4">
                <Checkbox checked={simulateFailure} onCheckedChange={(v) => setSimulateFailure(!!v)} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold text-text-primary">Simulate provisioning failure</span>
                  <span className="block text-caption text-text-secondary">Provisioning fails with “GPU capacity unavailable in pool”, so you can show the retry.</span>
                </span>
              </label>
            )}

            <Field
              label={needsText === 'reason' ? 'Reason' : needsText === 'comment' ? 'Comment for the requester' : 'Note (optional)'}
              htmlFor="ra-comment"
              required={!!needsText}
              error={error}
            >
              <Textarea
                id="ra-comment"
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value)
                  setError(null)
                }}
                placeholder={
                  needsText === 'reason'
                    ? 'For example: Children’s photos can’t be processed. Please use the roll-call app.'
                    : needsText === 'comment'
                      ? 'For example: Please switch to a T4 and turn on auto-shutdown.'
                      : 'Anything the next person should know'
                }
                aria-invalid={!!error}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button variant={active?.tone === 'destructive' ? 'destructive' : 'primary'} onClick={run}>
              {isApprove && quota.over ? 'Approve over quota' : isApprove && capacity?.over ? 'Approve over provider capacity' : isApprove && budget?.over ? 'Approve over budget cap' : active?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
