import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, FolderKanban, Info, MessageSquareWarning, Save, Send, ShieldAlert } from 'lucide-react'
import type { CatalogCategory, CatalogItem, EnvSpec, Language, Project, Role, Tenant } from '@/data/types'
import { useAppStore, useCurrentTenant, useCurrentUser } from '@/store/useAppStore'
import { useTenantCatalog } from '@/store/selectors'
import { activeHoursPerMonth, estimateCost, HOURLY_RATE } from '@/lib/cost'
import { allocationOf, checkQuota, quotaMessage, subQuota, tenantAllocated } from '@/lib/quota'
import { addsInfrastructure } from '@/lib/spec'
import { envPath, requestPath, requestsPath } from '@/lib/paths'
import { EmptyState } from '@/components/shared/EmptyState'
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
  projectId: '',
  purpose: 'development',
  durationWeeks: 8,
  compute: 't4',
  gpuCount: 1,
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

type Errors = Partial<Record<'name' | 'projectId' | 'languages' | 'justification' | 'changes', string>>

function validate(spec: EnvSpec, step: number): Errors {
  const e: Errors = {}
  if (step === 0 && !spec.projectId) e.projectId = 'Choose the project this environment is for.'
  if (step === 0 && spec.name.trim().length < 3) e.name = 'Give the environment a name of at least 3 characters.'
  if (step === 3 && spec.asr.length > 0 && spec.languages.length === 0) e.languages = 'Choose at least one language for speech recognition.'
  if (step === 6 && spec.justification.trim().length < 10) e.justification = 'Tell your reviewers in a sentence or two why your organisation needs this.'
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

function StepPurpose({ spec, set, errors, projects }: StepProps) {
  return (
    <div className="flex flex-col gap-6">
      <Field label="Project" htmlFor="env-project" required error={errors.projectId} helper="Project members can see and use this environment.">
        <Select value={spec.projectId} onValueChange={(v) => set({ projectId: v })}>
          <SelectTrigger id="env-project" className="sm:max-w-md" aria-invalid={!!errors.projectId}>
            <SelectValue placeholder="Choose a project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
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

      {COMPUTE_TIERS.find((t) => t.value === spec.compute)!.gpu && (
        <Field label="Number of GPUs" htmlFor="gpu-count" helper="Each GPU comes with its own vCPU and RAM, as listed above.">
          <Select value={String(spec.gpuCount)} onValueChange={(v) => set({ gpuCount: Number(v) })}>
            <SelectTrigger id="gpu-count" className="sm:max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} GPU{n > 1 ? 's' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

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
        No {what.toLowerCase()} are enabled for {tenant.name} yet. Ask your Tenant Admin to switch some on.
      </p>
    </div>
  )
}

function StepLlms({ spec, set, catalog, selectable, tenant }: StepProps) {
  const items = selectable.filter((c) => c.category === 'llm')
  const allowed = items.length > 0
  const toggle = (id: string) =>
    set({
      llms: spec.llms.some((l) => l.id === id) ? spec.llms.filter((l) => l.id !== id) : [...spec.llms, { id, tokenBudget: 5 }],
    })
  return (
    <div className="flex flex-col gap-6">
      {!allowed && <NotAllowed tenant={tenant} what="Language models" />}
      <p className="text-sm text-text-secondary">Choose one or more. Hosted APIs are quick to start; open models run on shared GPUs and cost less per token.</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
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

function StepAsr({ spec, set, catalog, selectable, tenant, errors }: StepProps) {
  const items = selectable.filter((c) => c.category === 'asr')
  const allowed = items.length > 0
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
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

function StepCapabilities({ spec, set, selectable, tenant }: StepProps) {
  const toggle = (id: string) =>
    set({ capabilities: spec.capabilities.includes(id) ? spec.capabilities.filter((x) => x !== id) : [...spec.capabilities, id] })
  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-text-secondary">Add the open-source building blocks you need. Each is installed and configured in your environment.</p>
      {CAPABILITY_GROUPS.map((cat) => {
        const items = selectable.filter((c) => c.category === cat)
        return (
          <section key={cat}>
            <h3 className="mb-3 font-heading text-h3 text-text-primary">{CATEGORY_LABELS[cat]}</h3>
            {items.length === 0 ? (
              <p className="text-sm text-text-secondary">None enabled for {tenant.name}. Your Tenant Admin can switch them on.</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
                {items.map((item) => (
                  <SelectableCard key={item.id} item={item} selected={spec.capabilities.includes(item.id)} onToggle={() => toggle(item.id)} />
                ))}
              </div>
            )}
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

function StepReview({ spec, set, catalog, projects, errors, goTo, editing, quotaNote, role }: StepProps & { goTo: (s: number) => void; editing: boolean; quotaNote: string | null }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-card border border-border p-5">
        <p className="mb-4 font-heading text-h3 text-text-primary">{spec.name || 'Untitled environment'}</p>
        <SpecSummary spec={spec} catalog={catalog} projects={projects} onEdit={goTo} />
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
      {quotaNote && (
        <div className="flex gap-3 rounded-card bg-status-over-bg p-4 text-sm text-status-over-fg">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>{quotaNote} You can still submit.</p>
        </div>
      )}
      <p className="text-caption text-text-muted">
        {editing
          ? 'Changes that need no new infrastructure apply straight away. Anything that adds infrastructure goes to the Super Admin for approval.'
          : role === 'tenant_admin'
            ? 'As a Tenant Admin, your request goes straight to the Super Admin, who approves new infrastructure.'
            : 'Your Tenant Admin reviews it first, then the Super Admin approves new infrastructure. You’ll get a notification at each step.'}
      </p>
    </div>
  )
}

interface StepProps {
  spec: EnvSpec
  set: (patch: Partial<EnvSpec>) => void
  /** Full catalog, for names and costs. */
  catalog: CatalogItem[]
  /** Items this person can pick: enabled for the tenant, plus anything already selected. */
  selectable: CatalogItem[]
  projects: Project[]
  tenant: Tenant
  role: Role
  errors: Errors
}

/* ---------- page ---------- */

export default function NewEnvironment() {
  const { id: editId } = useParams()
  const [params] = useSearchParams()
  const requestId = params.get('request')
  const user = useCurrentUser()!
  const tenant = useCurrentTenant()!
  const catalog = useAppStore((s) => s.catalog)
  const environments = useAppStore((s) => s.environments)
  const allProjects = useAppStore((s) => s.projects)
  const users = useAppStore((s) => s.users)
  const tenantItems = useTenantCatalog()
  const editingEnv = useAppStore((s) => (editId ? s.environments.find((e) => e.id === editId) : undefined))
  const existing = useAppStore((s) => (requestId ? s.requests.find((r) => r.id === requestId) : undefined))
  const saveDraft = useAppStore((s) => s.saveDraft)
  const submitRequest = useAppStore((s) => s.submitRequest)
  const transitionRequest = useAppStore((s) => s.transitionRequest)
  const editEnvironment = useAppStore((s) => s.editEnvironment)
  const navigate = useNavigate()

  const mode: 'new' | 'draft' | 'resubmit' | 'edit' = editId ? 'edit' : existing?.status === 'draft' ? 'draft' : existing?.status === 'changes_requested' ? 'resubmit' : 'new'
  const editing = mode === 'edit'
  const projects = useMemo(
    () => allProjects.filter((p) => p.tenantId === tenant.id && p.status === 'active' && (user.role === 'tenant_admin' || p.memberIds.includes(user.id))),
    [allProjects, tenant.id, user],
  )
  const [draftId, setDraftId] = useState<string | undefined>(mode === 'draft' ? existing?.id : undefined)
  const [spec, setSpec] = useState<EnvSpec>(() =>
    editingEnv ? structuredClone(editingEnv.spec) : existing && mode !== 'new' ? structuredClone(existing.spec) : { ...DEFAULT_SPEC, projectId: projects[0]?.id ?? '' },
  )
  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(mode === 'new' ? 0 : STEPS.length - 1)
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
  const used = useMemo(() => tenantAllocated(environments, tenant.id), [environments, tenant.id])

  if (editing && (!editingEnv || editingEnv.tenantId !== tenant.id || (user.role === 'user' && editingEnv.ownerId !== user.id))) {
    return <NotFound message="This environment doesn’t exist or you can’t change it." />
  }
  if (requestId && (!existing || existing.requesterId !== user.id || mode === 'new')) {
    return <NotFound message="This request can’t be edited. Only your own drafts and requests with changes requested can be." />
  }
  if (!editing && projects.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={FolderKanban}
          title="You’re not in a project yet"
          description="Every environment belongs to a project. Ask your Tenant Admin to add you to one, then come back."
          action={
            <Button asChild variant="secondary">
              <Link to={requestsPath(user.role)}>Back to requests</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const selectedIds = [...spec.llms.map((l) => l.id), ...spec.asr, ...spec.capabilities]
  const enabledIds = new Set(tenantItems.filter((i) => i.enabled).map((i) => i.id))
  const selectable = catalog.filter((c) => enabledIds.has(c.id) || selectedIds.includes(c.id))
  const previous = editing ? editingEnv!.spec : null
  const delta = previous ? subQuota(allocationOf(spec), allocationOf(previous)) : allocationOf(spec)
  const positive = { vcpu: Math.max(0, delta.vcpu), ramGb: Math.max(0, delta.ramGb), gpus: Math.max(0, delta.gpus), storageGb: Math.max(0, delta.storageGb) }
  const quota = checkQuota(tenant.quota, used, positive)
  const quotaNote = quota.over ? quotaMessage(quota.items, tenant.name, user.role === 'tenant_admin' ? 'tenant_admin' : 'user') : null
  const needsApproval = editing && addsInfrastructure(editingEnv!.spec, spec)
  const lastAsk = mode === 'resubmit' ? [...existing!.history].reverse().find((h) => h.status === 'changes_requested') : undefined

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
        setErrors({ changes: 'Nothing has changed yet. Edit at least one setting first.' })
        return
      }
      const res = editEnvironment(editingEnv.id, spec)
      if (res.mode === 'error') {
        toast.error(res.error)
        return
      }
      if (res.mode === 'applied') {
        toast.success('Changes saved.', { description: 'No new infrastructure was needed, so they apply straight away.' })
        navigate(envPath(user.role, editingEnv.id))
      } else {
        toast.success('Change sent for approval.', { description: 'It adds infrastructure, so the Super Admin approves it. The environment keeps its current setup until then.' })
        navigate(requestPath(user.role, res.id))
      }
      return
    }
    if (mode === 'resubmit' && existing) {
      const res = transitionRequest(existing.id, 'resubmitted', { spec })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Resubmitted “${spec.name}”.`)
      navigate(requestPath(user.role, existing.id))
      return
    }
    const res = submitRequest(spec, draftId)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(`Request sent for “${spec.name}”.`, {
      description: user.role === 'tenant_admin' ? 'It went straight to the Super Admin.' : 'Your Tenant Admin reviews it first.',
    })
    navigate(requestPath(user.role, res.id!))
  }

  const onSaveDraft = () => {
    const id = saveDraft(spec, draftId)
    setDraftId(id)
    toast.success('Draft saved.', { description: 'Continue it any time from My requests.' })
  }

  const props: StepProps = { spec, set, catalog, selectable, projects, tenant, role: user.role, errors }
  const last = step === STEPS.length - 1

  return (
    <>
      <PageHeader
        eyebrow={editing ? 'Edit configuration' : mode === 'resubmit' ? 'Edit and resubmit' : tenant.name}
        title={editing ? `Edit “${editingEnv!.spec.name}”` : mode === 'resubmit' ? `Resubmit “${existing!.spec.name}”` : 'New environment'}
        description={
          editing
            ? 'Changes that add no infrastructure apply straight away. More GPUs, a bigger tier or more storage needs the Super Admin’s approval.'
            : user.role === 'tenant_admin'
              ? 'Requests for new infrastructure go to the Super Admin for approval.'
              : 'Tell us what you are building. Your Tenant Admin reviews it, then the Super Admin approves new infrastructure.'
        }
      />

      {mode === 'draft' && (
        <div className="mb-6 rounded-card border border-border bg-indigo-50 px-5 py-3 text-sm text-text-primary">You’re continuing a saved draft. It stays private until you submit it.</div>
      )}
      {lastAsk?.comment && (
        <div className="mb-6 flex gap-3 rounded-card bg-status-change-bg p-4 text-sm text-status-change-fg">
          <MessageSquareWarning className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{users.find((u) => u.id === lastAsk.actorId)?.name} asked for changes</p>
            <p className="mt-1">{lastAsk.comment}</p>
          </div>
        </div>
      )}
      {editing && (
        <div className={cn('mb-6 rounded-card px-5 py-3 text-sm', needsApproval ? 'bg-status-review-bg text-status-review-fg' : 'bg-status-running-bg text-status-running-fg')}>
          {needsApproval
            ? 'These changes add infrastructure, so they go to the Super Admin for approval. Until then the environment keeps its current setup.'
            : 'These changes need no new infrastructure, so they apply as soon as you save.'}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)] 2xl:grid-cols-[200px_minmax(0,1fr)_320px]">
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
            {step === 6 && <StepReview {...props} goTo={goTo} editing={editing} quotaNote={quotaNote} />}
          </div>

          <div className="2xl:hidden">
            <CostEstimate spec={spec} tenant={tenant} used={used} previous={previous} catalog={catalog} audience={user.role} className="mx-5 mb-6 sm:mx-6" />
          </div>

          <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-b-card border-t border-border bg-bg-surface px-5 py-4 sm:px-6">
            <Button variant="secondary" onClick={() => goTo(step - 1)} disabled={step === 0}>
              <ChevronLeft /> Back
            </Button>
            {(mode === 'new' || mode === 'draft') && (
              <Button variant="ghost" onClick={onSaveDraft}>
                <Save /> Save draft
              </Button>
            )}
            {editing && (
              <Button asChild variant="ghost">
                <Link to={envPath(user.role, editId!)}>Cancel</Link>
              </Button>
            )}
            <span className="tabular ml-auto hidden text-caption text-text-secondary xl:inline 2xl:hidden">{formatInt(est.credits)} credits / month</span>
            {last ? (
              <Button onClick={submit} className="ml-auto sm:ml-0">
                <Send /> {editing ? (needsApproval ? 'Send for approval' : 'Save changes') : mode === 'resubmit' ? 'Resubmit request' : 'Submit request'}
              </Button>
            ) : (
              <Button onClick={() => goTo(step + 1)} className="ml-auto sm:ml-0 2xl:ml-auto">
                Next: {STEPS[step + 1]!.title} <ChevronRight />
              </Button>
            )}
          </div>
        </section>

        <div className="hidden 2xl:block">
          <div className="sticky top-24">
            <CostEstimate spec={spec} tenant={tenant} used={used} previous={previous} catalog={catalog} audience={user.role} />
          </div>
        </div>
      </div>
    </>
  )
}
