import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { OrgType, Quota, Tenant } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { INDIAN_STATES, ORG_TYPES } from '@/lib/labels'
import { RESOURCES } from '@/lib/quota'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface FormState {
  name: string
  code: string
  description: string
  orgType: OrgType
  city: string
  state: string
  contactName: string
  contactEmail: string
  quota: Record<keyof Quota, string>
}

type Errors = Partial<Record<keyof FormState | keyof Quota, string>>

const empty: FormState = {
  name: '',
  code: '',
  description: '',
  orgType: 'NGO',
  city: '',
  state: 'Karnataka',
  contactName: '',
  contactEmail: '',
  quota: { vcpu: '64', ramGb: '256', gpus: '2', storageGb: '1000' },
}

const fromTenant = (t: Tenant): FormState => ({
  name: t.name,
  code: t.code,
  description: t.description,
  orgType: t.orgType,
  city: t.city,
  state: t.state,
  contactName: t.contactName,
  contactEmail: t.contactEmail,
  quota: { vcpu: String(t.quota.vcpu), ramGb: String(t.quota.ramGb), gpus: String(t.quota.gpus), storageGb: String(t.quota.storageGb) },
})

export function TenantFormDialog({ open, onOpenChange, tenant, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; tenant?: Tenant; onCreated?: (id: string) => void }) {
  const tenants = useAppStore((s) => s.tenants)
  const createTenant = useAppStore((s) => s.createTenant)
  const updateTenant = useAppStore((s) => s.updateTenant)
  const setTenantQuota = useAppStore((s) => s.setTenantQuota)
  const [form, setForm] = useState<FormState>(empty)
  const [errors, setErrors] = useState<Errors>({})

  useEffect(() => {
    if (open) {
      setForm(tenant ? fromTenant(tenant) : empty)
      setErrors({})
    }
  }, [open, tenant])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const submit = () => {
    const e: Errors = {}
    const name = form.name.trim()
    const code = form.code.trim().toUpperCase()
    if (name.length < 3) e.name = 'Enter the tenant’s name.'
    else if (tenants.some((t) => t.id !== tenant?.id && t.name.toLowerCase() === name.toLowerCase())) e.name = 'A tenant with this name already exists.'
    if (!tenant) {
      if (!/^[A-Z0-9]{2,5}-\d{3}$/.test(code)) e.code = 'Use a short code like ABC-103.'
      else if (tenants.some((t) => t.code === code)) e.code = 'This code is already used.'
    }
    if (!form.city.trim()) e.city = 'Enter the city where the tenant is based.'
    if (!form.contactName.trim()) e.contactName = 'Enter a contact person.'
    if (!/^\S+@\S+\.\S+$/.test(form.contactEmail.trim())) e.contactEmail = 'Enter a valid email address.'
    const quota = Object.fromEntries(RESOURCES.map((r) => [r.key, Number(form.quota[r.key])])) as unknown as Quota
    for (const r of RESOURCES) if (!Number.isFinite(quota[r.key]) || quota[r.key] < 0) e[r.key] = 'Enter 0 or more.'
    setErrors(e)
    if (Object.values(e).some(Boolean)) return

    const profile = {
      name,
      description: form.description.trim(),
      orgType: form.orgType,
      city: form.city.trim(),
      state: form.state,
      contactName: form.contactName.trim(),
      contactEmail: form.contactEmail.trim(),
    }
    if (tenant) {
      updateTenant(tenant.id, profile)
      if (RESOURCES.some((r) => tenant.quota[r.key] !== quota[r.key])) setTenantQuota(tenant.id, quota)
      toast.success(`Saved changes to ${name}.`)
    } else {
      const id = createTenant({ ...profile, code, quota })
      if (id) {
        toast.success(`Created ${name}.`, { description: 'Add a Tenant Admin from the Users page.' })
        onCreated?.(id)
      }
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader title={tenant ? `Edit ${tenant.name}` : 'Create tenant'} description={tenant ? 'Quota changes apply straight away.' : 'Set up a new partner organisation and its quota.'} />
        <DialogBody className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tenant name" htmlFor="t-name" required error={errors.name}>
              <Input id="t-name" value={form.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} />
            </Field>
            <Field label="Code" htmlFor="t-code" required={!tenant} error={errors.code} helper={tenant ? 'The code can’t be changed.' : 'Used in endpoints, for example ABC-103.'}>
              <Input id="t-code" value={form.code} onChange={(e) => set('code', e.target.value)} disabled={!!tenant} className="font-mono uppercase" aria-invalid={!!errors.code} />
            </Field>
            <Field label="Description" htmlFor="t-desc" className="sm:col-span-2">
              <Textarea id="t-desc" value={form.description} onChange={(e) => set('description', e.target.value)} className="min-h-[64px]" />
            </Field>
            <Field label="Type" htmlFor="t-type">
              <Select value={form.orgType} onValueChange={(v) => set('orgType', v as OrgType)}>
                <SelectTrigger id="t-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORG_TYPES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="City" htmlFor="t-city" required error={errors.city}>
              <Input id="t-city" value={form.city} onChange={(e) => set('city', e.target.value)} aria-invalid={!!errors.city} />
            </Field>
            <Field label="State" htmlFor="t-state">
              <Select value={form.state} onValueChange={(v) => set('state', v)}>
                <SelectTrigger id="t-state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Contact person" htmlFor="t-contact" required error={errors.contactName}>
              <Input id="t-contact" value={form.contactName} onChange={(e) => set('contactName', e.target.value)} aria-invalid={!!errors.contactName} />
            </Field>
            <Field label="Contact email" htmlFor="t-email" required error={errors.contactEmail} className="sm:col-span-2">
              <Input id="t-email" type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} aria-invalid={!!errors.contactEmail} />
            </Field>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-text-primary">Quota</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {RESOURCES.map((r) => (
                <Field key={r.key} label={r.unit === 'GB' ? `${r.label} (GB)` : r.label} htmlFor={`t-q-${r.key}`} error={errors[r.key]}>
                  <Input
                    id={`t-q-${r.key}`}
                    type="number"
                    min={0}
                    value={form.quota[r.key]}
                    onChange={(e) => set('quota', { ...form.quota, [r.key]: e.target.value })}
                    aria-invalid={!!errors[r.key]}
                  />
                </Field>
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={submit}>{tenant ? 'Save changes' : 'Create tenant'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
