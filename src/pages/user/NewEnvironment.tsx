import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Info, Save, Send, ShieldAlert } from 'lucide-react'
import type { CatalogCategory, CatalogItem, EnvSpec, Language, Tenant } from '@/data/types'
import { useAppStore, useCurrentTenant, useCurrentUser } from '@/store/useAppStore'
import { activeHoursPerMonth, checkQuota, estimateCost, HOURLY_RATE } from '@/lib/cost'
import { formatInt } from '@/lib/format'
import { AUTO_SHUTDOWN_OPTIONS, CATEGORY_LABELS, COMPUTE_TIERS, DATA_CLASSES, LANGUAGES, PURPOSES } from '@/lib/labels'
import { diffSpecs } from '@/lib/spec'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { CostEstimate } from '@/components/shared/CostEstimate'
import { SelectableCard } from '@/components/shared/SelectableCard'
import { SpecSummary } from '@/components/shared/SpecSummary'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { RadioCardItem, RadioGroup, Slider } from '@/components/ui/controls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import NotFound from '@/pages/NotFound'

const STEPS = [
  { title: 'Purpose', hint: 'What it is for' },
  { title: 'Compute', hint: 'CPU or GPU, storage' },
  { title: 'Language models', hint: 'Models and budgets' },
  { title: 'Speech recognition', hint: 'Providers and languages' },
  { title: 'Capabilities', hint: 'Frameworks and tools' },
  { title: 'Data', hint: 'Classification and PII' },
  { title: 'Review', hint: 'Check and submit' },
]

const DURATIONS = [2, 4, 6, 8, 12, 16]

export const DEFAULT_SPEC: EnvSpec = {
  name: '',
  description: '',
  purpose: 'development',
  durationWeeks: 8,
  compute: 't4',
  storageGb: 100,
  autoShutdownHours: 2,
  llms: [],
  asr: [],
  languages: [],
  asrHoursPerMonth: 20,
  capabilities: [],
  dataClassification: 'internal',
  containsPii: false,
  justification: '',
}

type Errors = Partial<Record<'name' | 'languages' | 'justification' | 'changes', string>>

function validate(spec: EnvSpec, step: number): Errors {
  const e: Errors = {}
  if (step === 0 && spec.name.trim().length < 3) e.name = 'Give the environment a name of at least 3 characters.'
  if (step === 3 && spec.asr.length > 0 && spec.languages.length === 0) e.languages = 'Choose at least one language for speech recognition.'
  if (step === 6 && spec.justification.trim().length < 10) e.justification = 'Tell your admin in a sentence or two why your organisation needs this.'
  return e
}

/* ---------- step components ---------- */

function RadioCard({ value, title, description, extra }: { value: string; title: string; description: string; extra?: React.ReactNode }) {
  return (
    <RadioCardItem
      value={value}
      className="card relative flex flex-col gap-1 p-4 text-left transition-[box-shadow,border-color] hover:border-border-strong data-[state=checked]:border-2 data-[state=checked]:border-indigo data-[state=checked]:p-[15px] dark:data-[state=checked]:border-indigo-text [&[data-state=checked]_.check]:flex"
    >
      <span className="check absolute right-3 top-3 hidden size-5 items-center justify-center rounded-full bg-indigo text-white">
        <Check className="size-3.5" strokeWidth={3} aria-hidden />
      </span>
      <span className="pr-6 font-semibold text-text-primary">{title}</span>
      <span className="text-caption text-text-secondary">{description}</span>
      {extra}
    </RadioCardItem>
  )
}

function StepPurpose({ spec, set, errors }: StepProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-3 text-sm font-semibold text-text-primary">What is this environment for?</p>
        <RadioGroup value={spec.purpose} onValueChange={(v) => set({ purpose: v as EnvSpec['purpose'] })} className="sm:grid-cols-2" aria-label="Purpose">
          {PURPOSES.map((p) => (
            <RadioCard key={p.value} value={p.value} title={p.label} description={p.description} />
          ))}
        </RadioGroup>
      </div>
      <Field label="Environment name" htmlFor="env-name" required error={errors.name} helper="Short and specific, so your team can recognise it.">
        <Input
          id="env-name"
          value={spec.name}
          maxLength={60}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="For example: Kannada crop advisory bot"
          aria-invalid={!!errors.name}
        />
      </Field>
      <Field label="Description" htmlFor="env-desc" helper="Who will use it and what it should do.">
        <Textarea
          id="env-desc"
          value={spec.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="For example: Farmers call in and ask about pests in Kannada. The bot replies with spoken advice."
        />
      </Field>
      <Field label="How long do you need it?" htmlFor="env-duration" helper="You can extend it later from the environment page.">
        <Select value={String(spec.durationWeeks)} onValueChange={(v) => set({ durationWeeks: Number(v) })}>
          <SelectTrigger id="env-duration" className="sm:max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...new Set([...DURATIONS, spec.durationWeeks])].sort((a, b) => a - b).map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d} weeks
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  )
}

function StepCompute({ spec, set }: StepProps) {
  const hours = activeHoursPerMonth(spec.autoShutdownHours)
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-3 text-sm font-semibold text-text-primary">Compute tier</p>
        <RadioGroup value={spec.compute} onValueChange={(v) => set({ compute: v as EnvSpec['compute'] })} className="sm:grid-cols-2" aria-label="Compute tier">
          {COMPUTE_TIERS.map((t) => (
            <RadioCard
              key={t.value}
              value={t.value}
              title={t.label}
              description={t.detail}
              extra={
                <span className="tabular mt-2 text-caption font-semibold text-text-primary">
                  {HOURLY_RATE[t.value]} credits per active hour
                  {t.value === 'a100' && <span className="font-normal text-text-secondary"> · for large models and heavy ASR</span>}
                </span>
              }
            />
          ))}
        </RadioGroup>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="storage" className="text-sm font-semibold text-text-primary">
            Storage
          </label>
          <span className="tabular text-sm font-semibold text-text-primary">{spec.storageGb} GB</span>
        </div>
        <Slider id="storage" min={20} max={1000} step={10} value={[spec.storageGb]} onValueChange={([v]) => set({ storageGb: v! })} aria-label="Storage in GB" />
        <p className="text-caption text-text-muted">For datasets, audio, embeddings and logs. 0.6 credits per GB each month.</p>
      </div>

      <Field label="Auto-shutdown" htmlFor="shutdown" helper={`We estimate about ${hours} active hours a month with this setting. Shutting down when idle saves credits.`}>
        <Select value={String(spec.autoShutdownHours)} onValueChange={(v) => set({ autoShutdownHours: Number(v) })}>
          <SelectTrigger id="shutdown" className="sm:max-w-xs">
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
    </div>
  )
}

function NotAllowed({ tenant, what }: { tenant: Tenant; what: string }) {
  return (
    <div className="flex gap-3 rounded-card border border-border bg-bg-subtle p-4 text-sm text-text-secondary">
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-text-muted" aria-hidden />
      <p>
        {what} is not enabled for {tenant.name}. Ask your ShikshaLokam admin to turn it on, then come back to this step.
      </p>
    </div>
  )
}

function StepLlms({ spec, set, catalog, tenant }: StepProps) {
  const items = catalog.filter((c) => c.category === 'llm' && c.status !== 'deprecated')
  const allowed = tenant.allowedCapabilities.includes('llm')
  const toggle = (id: string) =>
    set({
      llms: spec.llms.some((l) => l.id === id) ? spec.llms.filter((l) => l.id !== id) : [...spec.llms, { id, tokenBudget: 5 }],
    })
  return (
    <div className="flex flex-col gap-6">
      {!allowed && <NotAllowed tenant={tenant} what="Language models" />}
      <p className="text-sm text-text-secondary">Choose one or more. Hosted APIs are quick to start; open models run on shared GPUs and cost less per token.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <SelectableCard key={item.id} item={item} selected={spec.llms.some((l) => l.id === item.id)} onToggle={() => toggle(item.id)} disabled={!allowed} />
        ))}
      </div>
      {spec.llms.length > 0 && (
        <div className="rounded-card border border-border p-5">
          <p className="mb-1 text-sm font-semibold text-text-primary">Token budget per model</p>
          <p className="mb-4 text-caption text-text-muted">Requests stop when a model reaches its monthly budget. One million tokens is roughly 750,000 words.</p>
          <ul className="flex flex-col gap-5">
            {spec.llms.map((l) => {
              const item = catalog.find((c) => c.id === l.id)!
              return (
                <li key={l.id} className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-text-primary">{item.name}</span>
                    <span className="tabular text-caption text-text-secondary">
                      <span className="font-semibold text-text-primary">{l.tokenBudget}M tokens</span> · {formatInt(item.costPerUnit * l.tokenBudget)} credits
                    </span>
                  </div>
                  <Slider
                    min={1}
                    max={50}
                    step={1}
                    value={[l.tokenBudget]}
                    aria-label={`${item.name} token budget in millions`}
                    onValueChange={([v]) => set({ llms: spec.llms.map((x) => (x.id === l.id ? { ...x, tokenBudget: v! } : x)) })}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function StepAsr({ spec, set, catalog, tenant, errors }: StepProps) {
  const items = catalog.filter((c) => c.category === 'asr' && c.status !== 'deprecated')
  const allowed = tenant.allowedCapabilities.includes('asr')
  const toggle = (id: string) => set({ asr: spec.asr.includes(id) ? spec.asr.filter((x) => x !== id) : [...spec.asr, id] })
  const toggleLang = (l: Language) =>
    set({ languages: spec.languages.includes(l) ? spec.languages.filter((x) => x !== l) : [...spec.languages, l] })
  const gaps = spec.asr
    .map((id) => catalog.find((c) => c.id === id)!)
    .flatMap((item) => spec.languages.filter((l) => !item.languages.includes(l)).map((l) => `${item.name} does not support ${l}`))

  return (
    <div className="flex flex-col gap-6">
      {!allowed && <NotAllowed tenant={tenant} what="Speech recognition" />}
      <p className="text-sm text-text-secondary">Optional. Pick two providers if you want to compare transcripts in the Playground.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <SelectableCard key={item.id} item={item} selected={spec.asr.includes(item.id)} onToggle={() => toggle(item.id)} disabled={!allowed} />
        ))}
      </div>
      {spec.asr.length > 0 && (
        <>
          <Field label="Languages" required error={errors.languages} helper="The languages people will speak.">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Languages">
              {LANGUAGES.map((l) => {
                const on = spec.languages.includes(l)
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleLang(l)}
                    className={cn(
                      'flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors',
                      on ? 'border-indigo bg-indigo-50 text-indigo-text dark:border-indigo-text' : 'border-border-strong bg-bg-surface text-text-secondary hover:bg-bg-subtle',
                    )}
                  >
                    {on && <Check className="size-3.5" aria-hidden />}
                    {l}
                  </button>
                )
              })}
            </div>
          </Field>
          {gaps.length > 0 && (
            <div className="flex gap-2.5 rounded-control bg-status-pending-bg p-3 text-caption text-status-pending-fg">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{gaps.join('. ')}. Audio in these languages will go to your other provider.</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label className="text-sm font-semibold text-text-primary" htmlFor="asr-hours">
                Audio per month
              </label>
              <span className="tabular text-sm font-semibold text-text-primary">{spec.asrHoursPerMonth} hours</span>
            </div>
            <Slider id="asr-hours" min={0} max={300} step={5} value={[spec.asrHoursPerMonth]} onValueChange={([v]) => set({ asrHoursPerMonth: v! })} aria-label="Audio hours per month" />
            <p className="text-caption text-text-muted">Split evenly across the providers you pick.</p>
          </div>
        </>
      )}
    </div>
  )
}

const CAPABILITY_GROUPS: CatalogCategory[] = ['agent-framework', 'vector-db', 'evaluation', 'low-code']

function StepCapabilities({ spec, set, catalog, tenant }: StepProps) {
  const toggle = (id: string) =>
    set({ capabilities: spec.capabilities.includes(id) ? spec.capabilities.filter((x) => x !== id) : [...spec.capabilities, id] })
  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-text-secondary">Add the open-source building blocks you need. Each is installed and configured in your environment.</p>
      {CAPABILITY_GROUPS.map((cat) => {
        const allowed = tenant.allowedCapabilities.includes(cat)
        const items = catalog.filter((c) => c.category === cat && c.status !== 'deprecated')
        return (
          <section key={cat}>
            <h3 className="mb-3 font-heading text-h3 text-text-primary">{CATEGORY_LABELS[cat]}</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <SelectableCard
                  key={item.id}
                  item={item}
                  selected={spec.capabilities.includes(item.id)}
                  onToggle={() => toggle(item.id)}
                  disabled={!allowed}
                  disabledReason="Not enabled for your organisation"
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function StepData({ spec, set }: StepProps) {
  const sensitive = spec.dataClassification === 'personal' || spec.dataClassification === 'children'
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-3 text-sm font-semibold text-text-primary">How sensitive is the data you will use?</p>
        <RadioGroup
          value={spec.dataClassification}
          onValueChange={(v) => {
            const d = v as EnvSpec['dataClassification']
            set({ dataClassification: d, containsPii: d === 'personal' || d === 'children' ? true : spec.containsPii })
          }}
          className="sm:grid-cols-2"
          aria-label="Data classification"
        >
          {DATA_CLASSES.map((d) => (
            <RadioCard key={d.value} value={d.value} title={d.label} description={d.description} />
          ))}
        </RadioGroup>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-text-primary">Does the data include personal identifiers?</p>
        <p className="-mt-2 mb-3 text-caption text-text-muted">Names, phone numbers, Aadhaar numbers, addresses, photos or voice recordings of identifiable people.</p>
        <RadioGroup
          value={spec.containsPii ? 'yes' : 'no'}
          onValueChange={(v) => set({ containsPii: v === 'yes' })}
          className="grid-cols-2 sm:max-w-md"
          aria-label="Personal identifiers"
        >
          <RadioCard value="yes" title="Yes" description="Extra safeguards apply" />
          <RadioCard value="no" title="No" description="Data is anonymised" />
        </RadioGroup>
      </div>

      {sensitive && (
        <div className="flex gap-3 rounded-card bg-status-change-bg p-4 text-sm text-status-change-fg">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{spec.dataClassification === 'children' ? 'Children’s data gets an extra review' : 'Personal data gets an extra review'}</p>
            <p className="mt-1">
              Keep only what you need, and have consent in place. Hosted APIs may process data outside India; open models stay on platform servers in
              Bengaluru. Your admin may ask for a data-processing agreement.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function StepReview({ spec, set, catalog, tenant, errors, goTo, editing }: StepProps & { goTo: (s: number) => void; editing: boolean }) {
  const quota = checkQuota(tenant, estimateCost(spec, catalog))
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-card border border-border p-5">
        <p className="mb-4 font-heading text-h3 text-text-primary">{spec.name || 'Untitled environment'}</p>
        <SpecSummary spec={spec} catalog={catalog} onEdit={goTo} />
      </div>
      <Field
        label="Why does your organisation need this?"
        htmlFor="justification"
        required
        error={errors.justification}
        helper="Your admin reads this when reviewing. Mention the people it will help and any deadline."
      >
        <Textarea
          id="justification"
          value={spec.justification}
          onChange={(e) => set({ justification: e.target.value })}
          placeholder="For example: The kharif season starts in June and farmers need advice in Kannada before then."
          aria-invalid={!!errors.justification}
          className="min-h-[110px]"
        />
      </Field>
      {errors.changes && (
        <p className="flex items-center gap-2 text-caption text-red-text" role="alert">
          <AlertTriangle className="size-4" aria-hidden /> {errors.changes}
        </p>
      )}
      {quota.over && (
        <div className="flex gap-3 rounded-card bg-status-over-bg p-4 text-sm text-status-over-fg">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>{quota.message} You can still submit; your admin will decide.</p>
        </div>
      )}
      <p className="text-caption text-text-muted">
        {editing
          ? 'Submitting creates a change request. Your environment keeps its current setup until an admin approves the change.'
          : 'Submitting sends this to the ShikshaLokam platform team. You’ll get a notification when they review it.'}
      </p>
    </div>
  )
}

interface StepProps {
  spec: EnvSpec
  set: (patch: Partial<EnvSpec>) => void
  catalog: CatalogItem[]
  tenant: Tenant
  errors: Errors
}

/* ---------- page ---------- */

export default function NewEnvironment() {
  const { id: editId } = useParams()
  const user = useCurrentUser()!
  const tenant = useCurrentTenant()!
  const catalog = useAppStore((s) => s.catalog)
  const editingEnv = useAppStore((s) => (editId ? s.environments.find((e) => e.id === editId) : undefined))
  const draft = useAppStore((s) => s.drafts[user.id])
  const saveDraft = useAppStore((s) => s.saveDraft)
  const clearDraft = useAppStore((s) => s.clearDraft)
  const submitRequest = useAppStore((s) => s.submitRequest)
  const submitChangeRequest = useAppStore((s) => s.submitChangeRequest)
  const navigate = useNavigate()

  const editing = !!editId
  const [spec, setSpec] = useState<EnvSpec>(() => (editingEnv ? structuredClone(editingEnv.spec) : draft ? structuredClone(draft) : DEFAULT_SPEC))
  const [usingDraft, setUsingDraft] = useState(!editing && !!draft)
  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(editing ? STEPS.length - 1 : 0)
  const [errors, setErrors] = useState<Errors>({})
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  const est = useMemo(() => estimateCost(spec, catalog), [spec, catalog])

  if (editing && (!editingEnv || editingEnv.tenantId !== tenant.id)) {
    return <NotFound message="This environment doesn’t exist or belongs to another organisation." />
  }

  const set = (patch: Partial<EnvSpec>) => {
    setSpec((s) => ({ ...s, ...patch }))
    setErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(patch)) delete next[k as keyof Errors]
      if ('asr' in patch || 'languages' in patch) delete next.languages
      delete next.changes
      return next
    })
  }

  const goTo = (target: number) => {
    if (target > step) {
      for (let s = step; s < target; s++) {
        const e = validate(spec, s)
        if (Object.keys(e).length) {
          setErrors(e)
          setStep(s)
          return
        }
      }
    }
    setErrors({})
    setStep(target)
    setMaxStep((m) => Math.max(m, target))
  }

  const submit = () => {
    for (let s = 0; s < STEPS.length; s++) {
      const e = validate(spec, s)
      if (Object.keys(e).length) {
        setErrors(e)
        setStep(s)
        return
      }
    }
    if (editing && editingEnv) {
      if (diffSpecs(editingEnv.spec, { ...spec, justification: editingEnv.spec.justification }, catalog).length === 0) {
        setErrors({ changes: 'Nothing has changed yet. Edit at least one setting before sending a change request.' })
        return
      }
      submitChangeRequest(editingEnv.id, spec)
      toast.success('Change request sent.', { description: 'Your environment keeps running as it is until an admin approves.' })
      navigate(`/app/environments/${editingEnv.id}`)
      return
    }
    submitRequest(spec)
    toast.success(`Request sent for “${spec.name}”.`, { description: 'You’ll get a notification when an admin reviews it.' })
    navigate('/app')
  }

  const onSaveDraft = () => {
    saveDraft(spec)
    toast.success('Draft saved.', { description: 'Pick up where you left off from your dashboard.' })
  }

  const startOver = () => {
    clearDraft()
    setSpec(DEFAULT_SPEC)
    setUsingDraft(false)
    setStep(0)
    setMaxStep(0)
    setErrors({})
  }

  const props: StepProps = { spec, set, catalog, tenant, errors }
  const last = step === STEPS.length - 1

  return (
    <>
      <PageHeader
        eyebrow={editing ? 'Change request' : tenant.name}
        title={editing ? `Edit “${editingEnv!.spec.name}”` : 'New environment'}
        description={
          editing
            ? 'Change the setup below. An admin reviews the change before it takes effect.'
            : 'Tell us what you are building. Your admin reviews the request, usually within a working day.'
        }
      />

      {usingDraft && (
        <div className="mb-6 flex flex-col gap-2 rounded-card border border-border bg-indigo-50 px-5 py-3 text-sm text-text-primary sm:flex-row sm:items-center sm:justify-between">
          <span>You’re continuing a saved draft.</span>
          <Button variant="ghost" size="sm" onClick={startOver}>
            Start over
          </Button>
        </div>
      )}

      {/* compact stepper below lg */}
      <div className="mb-4 lg:hidden">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold text-text-primary">
            Step {step + 1} of {STEPS.length} · {STEPS[step]!.title}
          </span>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-indigo dark:bg-indigo-text' : 'bg-bg-subtle')} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_300px]">
        <nav aria-label="Wizard steps" className="hidden lg:block">
          <ol className="sticky top-24 flex flex-col">
            {STEPS.map((s, i) => {
              const done = i < step || (i <= maxStep && i !== step)
              const current = i === step
              const reachable = i <= maxStep + 1
              return (
                <li key={s.title} className="relative pb-5 last:pb-0">
                  {i < STEPS.length - 1 && (
                    <span className={cn('absolute left-[13px] top-8 h-[calc(100%-28px)] w-0.5', i < step ? 'bg-indigo dark:bg-indigo-text' : 'bg-border')} aria-hidden />
                  )}
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => goTo(i)}
                    aria-current={current ? 'step' : undefined}
                    className="group flex w-full items-start gap-3 rounded-control text-left disabled:cursor-not-allowed"
                  >
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-caption font-semibold',
                        current && 'border-indigo bg-indigo text-white dark:border-indigo-text',
                        !current && done && 'border-indigo bg-indigo-50 text-indigo-text dark:border-indigo-text',
                        !current && !done && 'border-border-strong bg-bg-surface text-text-muted',
                      )}
                    >
                      {done && !current ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
                    </span>
                    <span className="pt-0.5">
                      <span className={cn('block text-sm font-semibold', current ? 'text-indigo-text' : reachable ? 'text-text-primary group-hover:text-indigo-text' : 'text-text-muted')}>
                        {s.title}
                      </span>
                      <span className="block text-caption text-text-muted">{s.hint}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <section className="card flex min-w-0 flex-col">
          <div className="border-b border-border px-5 py-5 sm:px-6">
            <p className="eyebrow">
              Step {step + 1} of {STEPS.length}
            </p>
            <h2 ref={headingRef} tabIndex={-1} className="mt-1 font-heading text-h2 text-text-primary outline-none">
              {STEPS[step]!.title}
            </h2>
          </div>
          <div className="flex-1 px-5 py-6 sm:px-6">
            {step === 0 && <StepPurpose {...props} />}
            {step === 1 && <StepCompute {...props} />}
            {step === 2 && <StepLlms {...props} />}
            {step === 3 && <StepAsr {...props} />}
            {step === 4 && <StepCapabilities {...props} />}
            {step === 5 && <StepData {...props} />}
            {step === 6 && <StepReview {...props} goTo={goTo} editing={editing} />}
          </div>

          <div className="xl:hidden">
            <CostEstimate spec={spec} tenant={tenant} catalog={catalog} className="mx-5 mb-6 sm:mx-6" />
          </div>

          <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-b-card border-t border-border bg-bg-surface px-5 py-4 sm:px-6">
            <Button variant="secondary" onClick={() => goTo(step - 1)} disabled={step === 0}>
              <ChevronLeft /> Back
            </Button>
            {!editing && (
              <Button variant="ghost" onClick={onSaveDraft}>
                <Save /> Save draft
              </Button>
            )}
            {editing && (
              <Button asChild variant="ghost">
                <Link to={`/app/environments/${editId}`}>Cancel</Link>
              </Button>
            )}
            <span className="tabular ml-auto hidden text-caption text-text-secondary sm:inline xl:hidden">{formatInt(est.credits)} credits / month</span>
            {last ? (
              <Button onClick={submit} className="ml-auto sm:ml-0">
                <Send /> {editing ? 'Send change request' : 'Submit request'}
              </Button>
            ) : (
              <Button onClick={() => goTo(step + 1)} className="ml-auto sm:ml-0 xl:ml-auto">
                Next: {STEPS[step + 1]!.title} <ChevronRight />
              </Button>
            )}
          </div>
        </section>

        <div className="hidden xl:block">
          <div className="sticky top-24">
            <CostEstimate spec={spec} tenant={tenant} catalog={catalog} />
          </div>
        </div>
      </div>
    </>
  )
}
