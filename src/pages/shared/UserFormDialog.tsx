import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Role } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/controls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTenantId?: string
}

type Errors = Partial<Record<'name' | 'email' | 'tenantId', string>>

export function UserFormDialog({ open, onOpenChange, defaultTenantId }: Props) {
  const tenants = useAppStore((s) => s.tenants)
  const users = useAppStore((s) => s.users)
  const createUser = useAppStore((s) => s.createUser)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [role, setRole] = useState<Role>('user')
  const [tenantId, setTenantId] = useState<string>('')
  const [errors, setErrors] = useState<Errors>({})

  useEffect(() => {
    if (open) {
      setName('')
      setEmail('')
      setTitle('')
      setRole('user')
      setTenantId(defaultTenantId ?? '')
      setErrors({})
    }
  }, [open, defaultTenantId])

  const submit = () => {
    const e: Errors = {}
    if (name.trim().length < 2) e.name = 'Enter the person’s full name.'
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Enter a valid email address.'
    else if (users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) e.email = 'Someone with this email already has an account.'
    if (role === 'user' && !tenantId) e.tenantId = 'Choose the organisation this person belongs to.'
    setErrors(e)
    if (Object.values(e).some(Boolean)) return

    createUser({
      name: name.trim(),
      email: email.trim(),
      title: title.trim() || (role === 'admin' ? 'Platform team' : 'Developer'),
      role,
      tenantId: role === 'admin' ? null : tenantId,
    })
    toast.success(`Added ${name.trim()}.`, { description: `An invitation was sent to ${email.trim()}.` })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader title="Add user" description="They’ll get an email invitation to set a password." />
        <DialogBody className="flex flex-col gap-4">
          <Field label="Full name" htmlFor="u-name" required error={errors.name}>
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Work email" htmlFor="u-email" required error={errors.email}>
            <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} />
          </Field>
          <Field label="Job title" htmlFor="u-title" helper="Optional">
            <Input id="u-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Data scientist" />
          </Field>
          <Field label="Role">
            <RadioGroup value={role} onValueChange={(v) => setRole(v as Role)} className="gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-control border border-border p-3 hover:bg-bg-subtle">
                <RadioGroupItem value="user" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold text-text-primary">User</span>
                  <span className="block text-caption text-text-secondary">A developer in one organisation. Requests and uses environments.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-control border border-border p-3 hover:bg-bg-subtle">
                <RadioGroupItem value="admin" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold text-text-primary">Admin</span>
                  <span className="block text-caption text-text-secondary">ShikshaLokam platform staff. Manages every organisation.</span>
                </span>
              </label>
            </RadioGroup>
          </Field>
          {role === 'user' && (
            <Field label="Organisation" htmlFor="u-tenant" required error={errors.tenantId}>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger id="u-tenant" aria-invalid={!!errors.tenantId}>
                  <SelectValue placeholder="Choose an organisation" />
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
          <Button onClick={submit}>Add user</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
