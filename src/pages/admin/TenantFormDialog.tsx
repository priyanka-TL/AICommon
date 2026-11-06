import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { CatalogCategory, OrgType, Tenant } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { CATEGORY_LABELS, INDIAN_STATES, ORG_TYPES } from '@/lib/labels'
import { slugify } from '@/lib/utils'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/controls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface FormState {
  name: string
  orgType: OrgType
  city: string
  state: string
  contactName: string
  contactEmail: string
  creditQuota: string
  gpuQuota: string
  allowedCapabilities: CatalogCategory[]
}

type Errors = Partial<Record<keyof FormState, string>>

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as CatalogCategory[]

const empty: FormState = {
  name: '',
  orgType: 'NGO',
  city: '',
  state: 'Karnataka',
  contactName: '',
  contactEmail: '',
  creditQuota: '50000',
  gpuQuota: '200',
  allowedCapabilities: ['llm', 'agent-framework', 'vector-db', 'evaluation'],
}

function fromTenant(t: Tenant): FormState {
  return {
    name: t.name,
    orgType: t.orgType,
    city: t.city,
    state: t.state,
    contactName: t.contactName,
    contactEmail: t.contactEmail,
    creditQuota: String(t.creditQuota),
    gpuQuota: String(t.gpuQuota),
    allowedCapabilities: t.allowedCapabilities,
  }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenant?: Tenant
  onCreated?: (id: string) => void
}

export function TenantFormDialog({ open, onOpenChange, tenant, onCreated }: Props) {
  const tenants = useAppStore((s) => s.tenants)
  const createTenant = useAppStore((s) => s.createTenant)
  const updateTenant = useAppStore((s) => s.updateTenant)
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
    if (name.length < 3) e.name = 'Enter the organisation’s name.'
    else if (tenants.some((t) => t.id !== tenant?.id && t.name.toLowerCase() === name.toLowerCase()))
      e.name = 'An organisation with this name already exists.'
    if (!form.city.trim()) e.city = 'Enter the city where the organisation is based.'
    if (!form.contactName.trim()) e.contactName = 'Enter a contact person.'
    if (!/^\S+@\S+\.\S+$/.test(form.contactEmail.trim())) e.contactEmail = 'Enter a valid email address.'
    const credits = Number(form.creditQuota)
    const gpu = Number(form.gpuQuota)
    if (!Number.isFinite(credits) || credits <= 0) e.creditQuota = 'Enter a credit quota above 0.'
    else if (tenant && credits < tenant.creditsUsed) e.creditQuota = `This organisation has already used ${tenant.creditsUsed.toLocaleString('en-IN')} credits this month.`
    if (!Number.isFinite(gpu) || gpu < 0) e.gpuQuota = 'Enter a GPU-hour quota of 0 or more.'
    if (!form.allowedCapabilities.length) e.allowedCapabilities = 'Allow at least one capability.'
    setErrors(e)
    if (Object.values(e).some(Boolean)) return

    const payload = {
      name,
      shortName: slugify(name),
      orgType: form.orgType,
      city: form.city.trim(),
      state: form.state,
      contactName: form.contactName.trim(),
      contactEmail: form.contactEmail.trim(),
      creditQuota: Math.round(credits),
      gpuQuota: Math.round(gpu),
      allowedCapabilities: form.allowedCapabilities,
    }

    if (tenant) {
      updateTenant(tenant.id, payload)
      toast.success(`Saved changes to ${name}.`)
    } else {
      const id = createTenant(payload)
      toast.success(`Created ${name}.`, { description: 'Add people to the organisation from the Users page.' })
      onCreated?.(id)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={tenant ? `Edit ${tenant.name}` : 'Create organisation'}
          description={tenant ? 'Changes apply straight away. Quota changes affect this month.' : 'Set up a new partner organisation and its monthly quota.'}
        />
        <DialogBody className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organisation name" htmlFor="t-name" required error={errors.name} className="sm:col-span-2">
              <Input id="t-name" value={form.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} placeholder="For example: Shiksha Setu Trust" />
            </Field>
            <Field label="Organisation type" htmlFor="t-type">
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
            <div className="hidden sm:block" />
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
            <Field label="Contact email" htmlFor="t-email" required error={errors.contactEmail}>
              <Input id="t-email" type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} aria-invalid={!!errors.contactEmail} />
            </Field>
            <Field label="Credit quota per month" htmlFor="t-credits" required error={errors.creditQuota} helper="1 credit = ₹1">
              <Input id="t-credits" type="number" min={0} step={1000} value={form.creditQuota} onChange={(e) => set('creditQuota', e.target.value)} aria-invalid={!!errors.creditQuota} />
            </Field>
            <Field label="GPU-hour quota per month" htmlFor="t-gpu" required error={errors.gpuQuota}>
              <Input id="t-gpu" type="number" min={0} step={10} value={form.gpuQuota} onChange={(e) => set('gpuQuota', e.target.value)} aria-invalid={!!errors.gpuQuota} />
            </Field>
          </div>

          <Field label="Allowed capabilities" required error={errors.allowedCapabilities} helper="People in this organisation can only request what is allowed here.">
            <div className="grid gap-2 sm:grid-cols-2">
              {ALL_CATEGORIES.map((c) => {
                const checked = form.allowedCapabilities.includes(c)
                return (
                  <label key={c} className="flex cursor-pointer items-center gap-3 rounded-control border border-border px-3 py-2.5 text-sm hover:bg-bg-subtle">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        set('allowedCapabilities', v ? [...form.allowedCapabilities, c] : form.allowedCapabilities.filter((x) => x !== c))
                      }
                    />
                    {CATEGORY_LABELS[c]}
                  </label>
                )
              })}
            </div>
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={submit}>{tenant ? 'Save changes' : 'Create organisation'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
