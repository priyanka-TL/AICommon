import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Lock, Save } from 'lucide-react'
import { useAppStore, useCurrentTenant } from '@/store/useAppStore'
import { formatDate } from '@/lib/format'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'

type Errors = Partial<Record<'name' | 'contactName' | 'contactEmail', string>>

export default function Settings() {
  const tenant = useCurrentTenant()!
  const updateTenant = useAppStore((s) => s.updateTenant)
  const [name, setName] = useState(tenant.name)
  const [description, setDescription] = useState(tenant.description)
  const [contactName, setContactName] = useState(tenant.contactName)
  const [contactEmail, setContactEmail] = useState(tenant.contactEmail)
  const [errors, setErrors] = useState<Errors>({})

  useEffect(() => {
    setName(tenant.name)
    setDescription(tenant.description)
    setContactName(tenant.contactName)
    setContactEmail(tenant.contactEmail)
  }, [tenant])

  const dirty = name !== tenant.name || description !== tenant.description || contactName !== tenant.contactName || contactEmail !== tenant.contactEmail

  const save = () => {
    const e: Errors = {}
    if (name.trim().length < 3) e.name = 'Enter your organisation’s name.'
    if (!contactName.trim()) e.contactName = 'Enter a contact person.'
    if (!/^\S+@\S+\.\S+$/.test(contactEmail.trim())) e.contactEmail = 'Enter a valid email address.'
    setErrors(e)
    if (Object.values(e).some(Boolean)) return
    updateTenant(tenant.id, { name: name.trim(), description: description.trim(), contactName: contactName.trim(), contactEmail: contactEmail.trim() })
    toast.success('Tenant profile saved.')
  }

  return (
    <>
      <PageHeader eyebrow={tenant.name} title="Settings" description="Your tenant’s profile. Quotas and availability are set by the Super Admin." />
      <section className="card max-w-3xl p-6">
        <h2 className="mb-5 font-heading text-h3 text-text-primary">Tenant profile</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Organisation name" htmlFor="st-name" required error={errors.name}>
            <Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Organisation code" htmlFor="st-code" helper="Set by the Super Admin. Used in endpoints, so it can’t change.">
            <div className="relative">
              <Input id="st-code" value={tenant.code} readOnly aria-readonly className="bg-bg-subtle pr-9 font-mono" />
              <Lock className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
            </div>
          </Field>
          <Field label="Description" htmlFor="st-desc" className="sm:col-span-2">
            <Textarea id="st-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Contact person" htmlFor="st-contact" required error={errors.contactName}>
            <Input id="st-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} aria-invalid={!!errors.contactName} />
          </Field>
          <Field label="Contact email" htmlFor="st-email" required error={errors.contactEmail}>
            <Input id="st-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} aria-invalid={!!errors.contactEmail} />
          </Field>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <p className="text-caption text-text-muted">
            {tenant.city}, {tenant.state} · on the platform since {formatDate(tenant.createdAt)}
          </p>
          <Button onClick={save} disabled={!dirty}>
            <Save /> Save profile
          </Button>
        </div>
      </section>
    </>
  )
}
