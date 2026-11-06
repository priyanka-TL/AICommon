import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { EnvRequest, EnvSpec } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { checkQuota, estimateCost } from '@/lib/cost'
import { AUTO_SHUTDOWN_OPTIONS, COMPUTE_TIERS } from '@/lib/labels'
import { diffSpecs } from '@/lib/spec'
import { formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/shared/StatusBadge'

interface Props {
  request: EnvRequest
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DURATIONS = [2, 4, 6, 8, 12, 16]

export function ApproveWithChangesDialog({ request, open, onOpenChange }: Props) {
  const catalog = useAppStore((s) => s.catalog)
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === request.tenantId))!
  const approveWithChanges = useAppStore((s) => s.approveWithChanges)
  const [spec, setSpec] = useState<EnvSpec>(request.spec)
  const [comment, setComment] = useState('')
  const [errors, setErrors] = useState<{ changes?: string; comment?: string }>({})

  useEffect(() => {
    if (open) {
      setSpec(request.spec)
      setComment('')
      setErrors({})
    }
  }, [open, request.spec])

  const before = useMemo(() => estimateCost(request.spec, catalog), [request.spec, catalog])
  const after = useMemo(() => estimateCost(spec, catalog), [spec, catalog])
  const quotaAfter = checkQuota(tenant, after)
  const changes = diffSpecs(request.spec, spec, catalog)
  const name = (id: string) => catalog.find((c) => c.id === id)?.name ?? id

  const set = <K extends keyof EnvSpec>(key: K, value: EnvSpec[K]) => setSpec((s) => ({ ...s, [key]: value }))

  const submit = () => {
    const next: typeof errors = {}
    if (!changes.length) next.changes = 'Make at least one change, or use “Approve request” instead.'
    if (!comment.trim()) next.comment = 'Explain what you changed so the requester understands why.'
    setErrors(next)
    if (Object.keys(next).length) return
    approveWithChanges(request.id, spec, comment)
    toast.success(`Approved “${spec.name}” with ${changes.length} change${changes.length > 1 ? 's' : ''}.`, {
      description: `${tenant.name} has been notified.`,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title="Approve with changes"
          description={`Adjust the request from ${tenant.name} before approving it. The requester sees every change you make.`}
        />
        <DialogBody className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Compute tier" htmlFor="awc-compute">
              <Select value={spec.compute} onValueChange={(v) => set('compute', v as EnvSpec['compute'])}>
                <SelectTrigger id="awc-compute">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPUTE_TIERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Auto-shutdown" htmlFor="awc-shutdown">
              <Select value={String(spec.autoShutdownHours)} onValueChange={(v) => set('autoShutdownHours', Number(v))}>
                <SelectTrigger id="awc-shutdown">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTO_SHUTDOWN_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Storage (GB)" htmlFor="awc-storage">
              <Input
                id="awc-storage"
                type="number"
                min={10}
                max={2000}
                step={10}
                value={spec.storageGb}
                onChange={(e) => set('storageGb', Math.max(0, Number(e.target.value)))}
              />
            </Field>
            <Field label="Duration" htmlFor="awc-duration">
              <Select value={String(spec.durationWeeks)} onValueChange={(v) => set('durationWeeks', Number(v))}>
                <SelectTrigger id="awc-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...DURATIONS, request.spec.durationWeeks])].sort((a, b) => a - b).map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} weeks
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {spec.llms.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-text-primary">Token budgets (millions per month)</p>
              <ul className="flex flex-col gap-2">
                {spec.llms.map((l) => (
                  <li key={l.id} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{name(l.id)}</span>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      className="w-24"
                      aria-label={`${name(l.id)} token budget`}
                      value={l.tokenBudget}
                      onChange={(e) =>
                        set(
                          'llms',
                          spec.llms.map((x) => (x.id === l.id ? { ...x, tokenBudget: Math.max(1, Number(e.target.value)) } : x)),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${name(l.id)}`}
                      onClick={() => set('llms', spec.llms.filter((x) => x.id !== l.id))}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {spec.asr.length > 0 && (
            <Field label="Audio hours per month" htmlFor="awc-asr" className="sm:max-w-[50%]">
              <Input
                id="awc-asr"
                type="number"
                min={0}
                max={2000}
                value={spec.asrHoursPerMonth}
                onChange={(e) => set('asrHoursPerMonth', Math.max(0, Number(e.target.value)))}
              />
            </Field>
          )}

          <div className="rounded-card bg-bg-subtle p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="tabular text-text-secondary line-through decoration-text-muted">{formatInt(before.credits)}</span>
                <ArrowRight className="size-4 text-text-muted" aria-hidden />
                <span className="tabular font-heading text-h3 text-text-primary">{formatInt(after.credits)}</span>
                <span className="text-caption text-text-secondary">credits / month</span>
              </div>
              {quotaAfter.over ? <StatusBadge status="over-quota" /> : <StatusBadge status="running" label="Within quota" />}
            </div>
            <p className="mt-2 text-caption text-text-secondary">
              {tenant.name} has {formatInt(quotaAfter.creditsRemaining)} credits and {formatInt(quotaAfter.gpuRemaining)} GPU-hours left this
              month. This plan uses {formatInt(after.gpuHours)} GPU-hours.
            </p>
            {changes.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
                {changes.map((c) => (
                  <li key={c.field} className="text-caption text-text-primary">
                    <span className="font-semibold">{c.field}:</span> {c.from} → {c.to}
                  </li>
                ))}
              </ul>
            )}
            {errors.changes && <p className="mt-2 text-caption text-red-text">{errors.changes}</p>}
          </div>

          <Field label="Note to the requester" htmlFor="awc-comment" required error={errors.comment} helper="Shown to the requester with the approval.">
            <Textarea
              id="awc-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="For example: An A10 is enough for development. Ask again when you are ready to pilot."
              aria-invalid={!!errors.comment}
              className={cn(errors.comment && 'border-red')}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={submit}>Approve with changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
