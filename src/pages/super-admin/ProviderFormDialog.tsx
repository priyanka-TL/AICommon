import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ImagePlus, X } from 'lucide-react'
import type { AiService, InfraProvider, InfraProviderType } from '@/data/types'
import { useAppStore, type InfraProviderInput, type RateCardInput } from '@/store/useAppStore'
import { useVisibleTenants } from '@/store/selectors'
import { environmentsInUse, latestRateCard } from '@/lib/cost'
import { AI_SERVICE_LABELS, PROVIDER_TYPE_LABELS } from '@/lib/providers'
import { formatDate, formatInt } from '@/lib/format'
import { uid } from '@/lib/utils'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Checkbox, RadioGroup, RadioGroupItem } from '@/components/ui/controls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormSection, InstanceTypesEditor, OtherRatesEditor, ProviderMark, RateCardInfoEditor, RegionsEditor } from './ProviderEditors'

const today = () => new Date().toISOString().slice(0, 10)

const blankCard = (): RateCardInput => ({
  effectiveFrom: today(),
  source: '',
  instanceTypes: [{ id: uid('it'), name: '', vcpu: 8, ramGb: 32, gpuType: 'none', gpuCount: 0, hourlyRate: 0 }],
  storageRate: 0,
  egressRate: 0,
  platformFeePct: 0,
  ngoDiscountPct: 0,
  gstPct: 18,
})

const blankProvider = (): InfraProviderInput => ({
  name: '',
  code: '',
  type: 'public_cloud',
  logoUrl: undefined,
  status: 'active',
  regions: [{ id: uid('rg'), name: '', indiaResident: true, gpuTypes: [] }],
  aiServices: [],
  maxGpus: 8,
  allowedTenants: 'all',
})

export function ProviderFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
  onPublish,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing?: InfraProvider
  onSaved?: (id: string) => void
  onPublish?: () => void
}) {
  const createInfraProvider = useAppStore((s) => s.createInfraProvider)
  const updateInfraProvider = useAppStore((s) => s.updateInfraProvider)
  const environments = useAppStore((s) => s.environments)
  const tenants = useVisibleTenants(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const [p, setP] = useState<InfraProviderInput>(blankProvider)
  const [card, setCard] = useState<RateCardInput>(blankCard)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (editing) {
      const { name, code, type, logoUrl, status, regions, aiServices, maxGpus, allowedTenants } = structuredClone(editing)
      setP({ name, code, type, logoUrl, status, regions, aiServices, maxGpus, allowedTenants })
    } else {
      setP(blankProvider())
      setCard(blankCard())
    }
  }, [open, editing])

  const up = (patch: Partial<InfraProviderInput>) => {
    setP((x) => ({ ...x, ...patch }))
    setError(null)
  }

  const onLogo = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Choose an image file for the logo (PNG, SVG or JPG).')
    if (file.size > 200_000) return setError('Keep the logo under 200 KB.')
    const reader = new FileReader()
    reader.onload = () => up({ logoUrl: String(reader.result) })
    reader.readAsDataURL(file)
  }

  const inUse = editing ? environmentsInUse(editing.id, environments) : []
  const lockedRegions = [...new Set(inUse.map((e) => e.spec.regionId))]

  const save = () => {
    if (editing) {
      if (p.status === 'disabled' && editing.status === 'active' && inUse.length) {
        setError(`${editing.name} is used by ${inUse.length} environment${inUse.length === 1 ? '' : 's'}. Move or stop them before disabling it.`)
        return
      }
      const res = updateInfraProvider(editing.id, p)
      if (!res.ok) return setError(res.error)
      toast.success(`Saved ${p.name.trim()}.`)
      onSaved?.(editing.id)
    } else {
      const res = createInfraProvider(p, card)
      if (!res.ok) return setError(res.error)
      toast.success(`Added ${p.name.trim()}.`, { description: `Rate card v1 takes effect from ${formatDate(card.effectiveFrom)}.` })
      onSaved?.(res.id!)
    }
    onOpenChange(false)
  }

  const current = editing ? latestRateCard(editing) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="sm:max-w-4xl">
        <DialogHeader
          title={editing ? `Edit ${editing.name}` : 'Add infrastructure provider'}
          description={editing ? 'Rates can’t be changed in place. Publish a new rate card so past costs stay on the old rates.' : 'All fields are required unless marked optional.'}
        />
        <DialogBody className="flex max-h-[68vh] flex-col gap-6 overflow-y-auto">
          <FormSection n={1} title="Basic details" used="provider lists, request wizard, cost reports">
            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <Field label="Provider name" htmlFor="pf-name" required>
                <Input id="pf-name" value={p.name} onChange={(e) => up({ name: e.target.value })} placeholder="Amazon Web Services" />
              </Field>
              <Field label="Short code" htmlFor="pf-code" required helper="Unique, e.g. AWS">
                <Input id="pf-code" value={p.code} onChange={(e) => up({ code: e.target.value.toUpperCase().slice(0, 6) })} placeholder="AWS" className="font-mono uppercase" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Type" required>
                <Select value={p.type} onValueChange={(v) => up({ type: v as InfraProviderType })}>
                  <SelectTrigger aria-label="Type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PROVIDER_TYPE_LABELS) as InfraProviderType[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {PROVIDER_TYPE_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status" required>
                <Select value={p.status} onValueChange={(v) => up({ status: v as InfraProvider['status'] })}>
                  <SelectTrigger aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Logo" helper="Optional. Initials are used without one.">
                <div className="flex items-center gap-2">
                  <ProviderMark provider={{ name: p.name || '?', code: p.code, logoUrl: p.logoUrl }} />
                  <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Choose logo" onChange={(e) => onLogo(e.target.files?.[0])} />
                  <Button type="button" variant="secondary" size="compact" onClick={() => fileRef.current?.click()}>
                    <ImagePlus /> {p.logoUrl ? 'Change' : 'Upload'}
                  </Button>
                  {p.logoUrl && (
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove logo" onClick={() => up({ logoUrl: undefined })}>
                      <X />
                    </Button>
                  )}
                </div>
              </Field>
            </div>
          </FormSection>

          <FormSection n={2} title="Regions" used="request wizard region choice. Personal and children’s data requests only see India-resident regions">
            <RegionsEditor regions={p.regions} onChange={(regions) => up({ regions })} lockedIds={lockedRegions} />
          </FormSection>

          {editing && current ? (
            <FormSection n={3} title="Instance types, other rates and rate card" used="the Compute step and the cost engine">
              <div className="rounded-card border border-border bg-bg-subtle p-4 text-sm">
                <p className="text-text-primary">
                  Rate card v{current.version} · effective from {formatDate(current.effectiveFrom)} · {current.instanceTypes.length} instance types · storage ₹{current.storageRate}/GB-month · egress ₹{current.egressRate}/GB · fee {current.platformFeePct}% · NGO discount{' '}
                  {current.ngoDiscountPct}% · GST {current.gstPct}%
                </p>
                <p className="mt-1 text-caption text-text-secondary">Rate source: {current.source}</p>
                {onPublish && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    className="mt-3"
                    onClick={() => {
                      onOpenChange(false)
                      onPublish()
                    }}
                  >
                    Publish new rate card
                  </Button>
                )}
              </div>
            </FormSection>
          ) : (
            <>
              <FormSection n={3} title="Instance types" used="the Compute step in the wizard and the cost engine">
                <InstanceTypesEditor instances={card.instanceTypes} onChange={(instanceTypes) => setCard({ ...card, instanceTypes })} />
              </FormSection>
              <FormSection n={4} title="Other rates" used="the cost engine">
                <OtherRatesEditor card={card} onChange={setCard} />
              </FormSection>
              <FormSection n={5} title="Rate card info" used="rate history. Past costs stay on the old rate">
                <RateCardInfoEditor card={card} onChange={setCard} />
              </FormSection>
            </>
          )}

          <FormSection n={6} title="AI model services" used="model access modes when adding a model to a project">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {(Object.keys(AI_SERVICE_LABELS) as AiService[]).map((k) => (
                <label key={k} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                  <Checkbox checked={p.aiServices.includes(k)} onCheckedChange={(v) => up({ aiServices: v ? [...p.aiServices, k] : p.aiServices.filter((x) => x !== k) })} />
                  {AI_SERVICE_LABELS[k]}
                </label>
              ))}
            </div>
            <p className="-mt-2 text-caption text-text-muted">Optional</p>
          </FormSection>

          <FormSection n={7} title="Capacity" used="approval screens warn when a request needs more GPUs than remain">
            <Field label="Maximum GPUs available to the platform" htmlFor="pf-gpus" required>
              <Input id="pf-gpus" type="number" min={0} value={p.maxGpus} onChange={(e) => up({ maxGpus: Math.max(0, Number(e.target.value) || 0) })} className="sm:max-w-[160px]" />
            </Field>
          </FormSection>

          <FormSection n={8} title="Access" used="tenant provider access and the request wizard">
            <RadioGroup value={p.allowedTenants === 'all' ? 'all' : 'selected'} onValueChange={(v) => up({ allowedTenants: v === 'all' ? 'all' : [] })} className="gap-2" aria-label="Allowed tenants">
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <RadioGroupItem value="all" /> All tenants
              </label>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <RadioGroupItem value="selected" /> Selected tenants
              </label>
            </RadioGroup>
            {p.allowedTenants !== 'all' && (
              <div className="flex flex-col gap-2 pl-7">
                {tenants.map((t) => {
                  const list = p.allowedTenants as string[]
                  return (
                    <label key={t.id} className="flex cursor-pointer items-center gap-3 text-sm">
                      <Checkbox checked={list.includes(t.id)} onCheckedChange={(v) => up({ allowedTenants: v ? [...list, t.id] : list.filter((x) => x !== t.id) })} />
                      {t.name}
                    </label>
                  )
                })}
              </div>
            )}
          </FormSection>

          {editing && inUse.length > 0 && (
            <p className="text-caption text-text-secondary">
              {formatInt(inUse.length)} environment{inUse.length === 1 ? '' : 's'} use this provider, so it can’t be disabled and their regions can’t be removed.
            </p>
          )}
        </DialogBody>
        {error && (
          <p className="mx-6 mb-2 rounded-control bg-status-rejected-bg px-3 py-2 text-caption text-status-rejected-fg" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={save}>{editing ? 'Save provider' : 'Add provider'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PublishRateCardDialog({ open, onOpenChange, provider }: { open: boolean; onOpenChange: (o: boolean) => void; provider: InfraProvider }) {
  const publish = useAppStore((s) => s.publishRateCard)
  const latest = latestRateCard(provider)!
  const minDate = (() => {
    const after = new Date(latest.effectiveFrom)
    after.setDate(after.getDate() + 1)
    const a = after.toISOString().slice(0, 10)
    return a > today() ? a : today()
  })()
  const [card, setCard] = useState<RateCardInput>(() => ({ ...structuredClone(latest), effectiveFrom: minDate, source: '' }))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const { version: _v, publishedAt: _a, publishedById: _b, ...rest } = structuredClone(latest)
    setCard({ ...rest, effectiveFrom: minDate, source: '' })
    setError(null)
  }, [open])

  const save = () => {
    const res = publish(provider.id, card)
    if (!res.ok) return setError(res.error)
    toast.success(`Published rate card v${latest.version + 1} for ${provider.name}.`, { description: `Takes effect from ${formatDate(card.effectiveFrom)}. Past months stay on v${latest.version}.` })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="sm:max-w-4xl">
        <DialogHeader title={`Publish new rate card for ${provider.name}`} description={`Starts from v${latest.version}. Version ${latest.version} stays read-only, and costs before the new date keep using it.`} />
        <DialogBody className="flex max-h-[68vh] flex-col gap-6 overflow-y-auto">
          <FormSection n={1} title="Rate card info" used="rate history. Past costs stay on the old rate">
            <RateCardInfoEditor card={card} onChange={(c) => { setCard(c); setError(null) }} minDate={minDate} />
          </FormSection>
          <FormSection n={2} title="Instance types" used="the Compute step in the wizard and the cost engine">
            <InstanceTypesEditor instances={card.instanceTypes} onChange={(instanceTypes) => { setCard({ ...card, instanceTypes }); setError(null) }} />
          </FormSection>
          <FormSection n={3} title="Other rates" used="the cost engine">
            <OtherRatesEditor card={card} onChange={(c) => { setCard(c); setError(null) }} />
          </FormSection>
        </DialogBody>
        {error && (
          <p className="mx-6 mb-2 rounded-control bg-status-rejected-bg px-3 py-2 text-caption text-status-rejected-fg" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={save}>Publish rate card</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
