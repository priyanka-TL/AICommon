import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Role, User } from '@/data/types'
import { useAppStore, useCurrentUser } from '@/store/useAppStore'
import { useVisibleTenants } from '@/store/selectors'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/controls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this user; otherwise create. */
  user?: User
  defaultTenantId?: string
}

type Errors = Partial<Record<'name' | 'email' | 'tenantId', string>>

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: 'user', label: 'User', hint: 'Requests and uses environments in their projects.' },
  { value: 'tenant_admin', label: 'Tenant Admin', hint: 'Manages people, projects, infrastructure and approvals in this tenant.' },
]

export function UserFormDialog({ open, onOpenChange, user: editing, defaultTenantId }: Props) {
  const me = useCurrentUser()!
  const tenants = useVisibleTenants(true)
  const createUser = useAppStore((s) => s.createUser)
  const updateUser = useAppStore((s) => s.updateUser)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [role, setRole] = useState<Role>('user')
  const [tenantId, setTenantId] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const isSuper = me.role === 'super_admin'

  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setEmail(editing?.email ?? '')
    setTitle(editing?.title ?? '')
    setRole(editing?.role ?? 'user')
    setTenantId(editing?.tenantId ?? (isSuper ? (defaultTenantId ?? '') : me.tenantId))
    setErrors({})
  }, [open, editing, defaultTenantId, isSuper, me.tenantId])

  const submit = () => {
    const e: Errors = {}
    if (name.trim().length < 2) e.name = 'Enter the person’s full name.'
    if (!editing && !/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Enter a valid email address.'
    if (!editing && isSuper && !tenantId) e.tenantId = 'Choose the tenant this person belongs to.'
    setErrors(e)
    if (Object.values(e).some(Boolean)) return

    if (editing) {
      updateUser(editing.id, { name: name.trim(), title: title.trim() || editing.title, role })
      toast.success(`Saved changes to ${name.trim()}.`)
    } else {
      const res = createUser({ name: name.trim(), email: email.trim(), title: title.trim() || (role === 'tenant_admin' ? 'Tenant Admin' : 'Developer'), role, tenantId })
      if (!res.ok) {
        setErrors({ email: res.error })
        return
      }
      toast.success(`Added ${name.trim()}.`, { description: `An invitation was sent to ${email.trim()}.` })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader
          title={editing ? `Edit ${editing.name}` : 'Add user'}
          description={editing ? 'Role changes take effect the next time they sign in.' : isSuper ? 'They’ll get an email invitation to set a password.' : `They’ll join ${tenants.find((t) => t.id === me.tenantId)?.name} and get an email invitation.`}
        />
        <DialogBody className="flex flex-col gap-4">
          <Field label="Full name" htmlFor="u-name" required error={errors.name}>
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
          </Field>
          {!editing && (
            <Field label="Work email" htmlFor="u-email" required error={errors.email}>
              <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} />
            </Field>
          )}
          <Field label="Job title" htmlFor="u-title" helper="Optional">
            <Input id="u-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Data scientist" />
          </Field>
          <Field label="Role">
            <RadioGroup value={role} onValueChange={(v) => setRole(v as Role)} className="gap-2">
              {ROLE_OPTIONS.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-start gap-3 rounded-control border border-border p-3 hover:bg-bg-subtle">
                  <RadioGroupItem value={o.value} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-semibold text-text-primary">{o.label}</span>
                    <span className="block text-caption text-text-secondary">{o.hint}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </Field>
          {isSuper && !editing && (
            <Field label="Tenant" htmlFor="u-tenant" required error={errors.tenantId}>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger id="u-tenant" aria-invalid={!!errors.tenantId}>
                  <SelectValue placeholder="Choose a tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants
                    .filter((t) => t.status === 'active')
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={submit}>{editing ? 'Save changes' : 'Add user'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
