import { useState } from 'react'
import { toast } from 'sonner'
import type { User } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

export function useUserActions() {
  const setUserStatus = useAppStore((s) => s.setUserStatus)
  const resetPassword = useAppStore((s) => s.resetPassword)
  const currentUserId = useAppStore((s) => s.currentUserId)
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
  const [resetTarget, setResetTarget] = useState<User | null>(null)

  const reactivate = (u: User) => {
    setUserStatus(u.id, 'active')
    toast.success(`${u.name} can sign in again.`)
  }

  const dialogs = (
    <>
      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(o) => !o && setDeactivateTarget(null)}
        title={`Deactivate ${deactivateTarget?.name}?`}
        description="They will be signed out and won’t be able to sign in. Their environments keep running and stay with their organisation. You can reactivate them later."
        confirmLabel="Deactivate user"
        destructive
        onConfirm={() => {
          if (!deactivateTarget) return
          setUserStatus(deactivateTarget.id, 'deactivated')
          toast.error(`${deactivateTarget.name} is deactivated.`)
        }}
      />
      <ConfirmDialog
        open={!!resetTarget}
        onOpenChange={(o) => !o && setResetTarget(null)}
        title={`Reset password for ${resetTarget?.name}?`}
        description={`We’ll email a reset link to ${resetTarget?.email}. Their current password stops working once they choose a new one.`}
        confirmLabel="Send reset link"
        onConfirm={() => {
          if (!resetTarget) return
          resetPassword(resetTarget.id)
          toast.success('Reset link sent.', { description: `Sent to ${resetTarget.email}. It expires in 30 minutes.` })
        }}
      />
    </>
  )

  return {
    askDeactivate: setDeactivateTarget,
    askReset: setResetTarget,
    reactivate,
    isSelf: (u: User) => u.id === currentUserId,
    dialogs,
  }
}
