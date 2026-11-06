import { useState } from 'react'
import { toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'
import { Pause, Play, RefreshCw, RotateCcw, Square, Trash2 } from 'lucide-react'
import type { Environment, EnvStatus } from '@/data/types'
import { useAppStore, useCurrentUser } from '@/store/useAppStore'
import { envActions, type Transition } from '@/lib/lifecycle'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/input'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { ConfirmDialog } from './ConfirmDialog'

export const ENV_ICONS: Record<EnvStatus, LucideIcon> = {
  active: Play,
  stopped: Square,
  suspended: Pause,
  terminated: Trash2,
  provisioning: RefreshCw,
  provisioning_failed: RefreshCw,
}

export interface EnvAction {
  key: string
  label: string
  icon: LucideIcon
  tone: Transition['tone']
  run: () => void
}

/** Lifecycle actions for an environment, with the confirmation and reason dialogs they need. */
export function useEnvLifecycle() {
  const user = useCurrentUser()
  const transitionEnv = useAppStore((s) => s.transitionEnv)
  const restartEnv = useAppStore((s) => s.restartEnv)
  const tenants = useAppStore((s) => s.tenants)
  const [confirm, setConfirm] = useState<{ env: Environment; t: Transition<EnvStatus> } | null>(null)
  const [reasonFor, setReasonFor] = useState<{ env: Environment; t: Transition<EnvStatus> } | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const perform = (env: Environment, t: Transition<EnvStatus>, comment?: string) => {
    const res = transitionEnv(env.id, t.to, { comment })
    if (!res.ok) {
      toast.error(res.error)
      return false
    }
    const msg: Partial<Record<EnvStatus, string>> = {
      active: env.status === 'suspended' ? `Resumed “${env.spec.name}”.` : `Started “${env.spec.name}”.`,
      stopped: `Stopped “${env.spec.name}”. Compute isn’t charged while it’s stopped.`,
      suspended: `Suspended “${env.spec.name}”. The owner has been notified.`,
      terminated: `Terminated “${env.spec.name}”.`,
      provisioning: `Retrying provisioning for “${env.spec.name}”.`,
    }
    toast.success(msg[t.to] ?? 'Done.')
    return true
  }

  const actionsFor = (env: Environment): EnvAction[] => {
    if (!user) return []
    const tenantSuspended = tenants.find((t) => t.id === env.tenantId)?.status === 'suspended'
    const list: EnvAction[] = envActions(env, user)
      .filter((t) => !(tenantSuspended && t.to === 'active' && env.status === 'stopped'))
      .map((t) => ({
        key: t.to,
        label: t.label,
        icon: ENV_ICONS[t.to],
        tone: t.tone,
        run: () => {
          if (t.requires) {
            setReason('')
            setError(null)
            setReasonFor({ env, t })
          } else if (t.tone === 'destructive') setConfirm({ env, t })
          else perform(env, t)
        },
      }))
    if (env.status === 'active' && envActions(env, user).some((t) => t.to === 'stopped')) {
      list.splice(1, 0, {
        key: 'restart',
        label: 'Restart',
        icon: RotateCcw,
        tone: 'secondary',
        run: () => {
          restartEnv(env.id)
          toast.success(`Restarted “${env.spec.name}”.`)
        },
      })
    }
    return list
  }

  const dialogs = (
    <>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`${confirm?.t.label} “${confirm?.env.spec.name}”?`}
        description="The endpoint stops working and the API key is revoked. Stored data is removed after 7 days. This can’t be undone."
        confirmLabel={confirm?.t.label ?? 'Confirm'}
        destructive
        onConfirm={() => confirm && perform(confirm.env, confirm.t)}
      />
      <Dialog open={!!reasonFor} onOpenChange={(o) => !o && setReasonFor(null)}>
        <DialogContent size="md">
          <DialogHeader title={`${reasonFor?.t.label} “${reasonFor?.env.spec.name}”`} description="The environment stops answering straight away. The owner and Tenant Admin see your reason." />
          <DialogBody>
            <Field label="Reason" htmlFor="env-reason" required error={error}>
              <Textarea
                id="env-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  setError(null)
                }}
                placeholder="For example: Personal data is being sent to a hosted model without consent."
                aria-invalid={!!error}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (!reasonFor) return
                if (!reason.trim()) {
                  setError('Give a reason. The owner will see it.')
                  return
                }
                if (perform(reasonFor.env, reasonFor.t, reason)) setReasonFor(null)
              }}
            >
              {reasonFor?.t.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )

  return { actionsFor, dialogs }
}
