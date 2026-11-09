import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Environment } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { ROLE_LABELS } from '@/lib/labels'
import { TENANT_OWNER, ownerLabel } from '@/lib/ownership'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'

/** Tenant Admin or Super Admin: hand an environment to another person in its tenant, or make it tenant-owned. */
export function ChangeOwnerDialog({ env, open, onOpenChange }: { env: Environment; open: boolean; onOpenChange: (o: boolean) => void }) {
  const users = useAppStore((s) => s.users)
  const changeEnvOwner = useAppStore((s) => s.changeEnvOwner)
  const [ownerId, setOwnerId] = useState(env.ownerId)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setOwnerId(env.ownerId)
      setError(null)
    }
  }, [open, env.ownerId])
  const candidates = users.filter((u) => u.tenantId === env.tenantId && u.status === 'active' && (u.role === 'user' || u.role === 'tenant_admin'))
  const save = () => {
    const res = changeEnvOwner(env.id, ownerId)
    if (!res.ok) return setError(res.error)
    toast.success(`Owner changed to ${ownerLabel({ ownerId }, users)}.`)
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Change owner" description={`Currently ${ownerLabel(env, users) || 'no owner'}. The change is recorded in the audit log, and the old and new owners are told.`} />
        <DialogBody>
          <Field label="New owner" htmlFor="new-owner" required error={error ?? undefined}>
            <Select value={ownerId} onValueChange={(v) => { setOwnerId(v); setError(null) }}>
              <SelectTrigger id="new-owner">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TENANT_OWNER}>Tenant-owned (managed by the Tenant Admin)</SelectItem>
                {candidates.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} · {ROLE_LABELS[u.role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={save} disabled={ownerId === env.ownerId}>
            Change owner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
