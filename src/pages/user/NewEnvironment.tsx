import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, FolderKanban, Info, MessageSquareWarning, Save, Scale, Send, ShieldAlert, Sparkles } from 'lucide-react'
import type { CatalogCategory, CatalogItem, EnvSpec, InfraProvider, Language, Project, Role, Tenant } from '@/data/types'
import { useAppStore, useCurrentTenant, useCurrentUser } from '@/store/useAppStore'
import { useTenantCatalog } from '@/store/selectors'
import { activeHoursPerMonth, costBreakdown, providerBudget, rateCardAt } from '@/lib/cost'
import { approvalFor, providersOfferedTo, ensurePlacement, equivalentSpec, indiaResidency, instancesFor, isSensitive, PROVIDER_TYPE_LABELS, providerGpuTypes, providersFor, recommendProvider, residencyProblem, applyPlacement } from '@/lib/providers'
import { useCostContext } from '@/store/selectors'
import { allocationOf, checkQuota, quotaMessage, subQuota, tenantAllocated } from '@/lib/quota'
import { addsInfrastructure } from '@/lib/spec'
import { envPath, requestPath, requestsPath } from '@/lib/paths'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate, formatInt } from '@/lib/format'
import { AUTO_SHUTDOWN_OPTIONS, CATEGORY_LABELS, DATA_CLASSES, LANGUAGES, PURPOSES } from '@/lib/labels'
import { diffSpecs } from '@/lib/spec'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { CostEstimate } from '@/components/shared/CostEstimate'
import { Tag } from '@/components/shared/StatusBadge'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { ProviderRequestDialog } from '@/components/shared/ProviderRequestDialog'
import { SelectableCard } from '@/components/shared/SelectableCard'
import { SpecSummary } from '@/components/shared/SpecSummary'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox, RadioCardItem, RadioGroup, Slider } from '@/components/ui/controls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import NotFound from '@/pages/NotFound'

const STEPS = [
  { title: 'Purpose', hint: 'What it is for' },
  { title: 'Provider & region', hint: 'Where it runs, compared' },
  { title: 'Compute', hint: 'Instance, storage, shutdown' },
  { title: 'Language models', hint: 'Models and budgets' },
  { title: 'Speech recognition', hint: 'Providers and languages' },
  { title: 'Capabilities', hint: 'Frameworks and tools' },
  { title: 'Data', hint: 'Classification and PII' },
  { title: 'Review', hint: 'Check and submit' },
]

/** Step indexes, so validation and "Edit" links don't depend on magic numbers. */
export const STEP = { purpose: 0, provider: 1, compute: 2, llms: 3, asr: 4, caps: 5, data: 6, review: 7 } as const

const DURATIONS = [2, 4, 6, 8, 12, 16]

export const DEFAULT_SPEC: EnvSpec = {
  name: '',
  description: '',
  projectId: '',
  purpose: 'development',
  durationWeeks: 8,
  providerId: '',
  regionId: '',
  instanceTypeId: '',
  instance: { name: '', vcpu: 0, ramGb: 0, gpuType: 'none', gpuCount: 0 },
  instanceCount: 1,
  egressGbPerMonth: 50,
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

type Errors = Partial<Record<'name' | 'projectId' | 'regionId' | 'dataClassification' | 'languages' | 'justification' | 'changes', string>>

function validate(spec: EnvSpec, step: number, providers: InfraProvider[]): Errors {
  const e: Errors = {}
  if (step === STEP.purpose && !spec.projectId) e.projectId = 'Choose the project this environment is for.'
  if (step === STEP.purpose && spec.name.trim().length < 3) e.name = 'Give the environment a name of at least 3 characters.'
  if (step === STEP.provider && (!spec.providerId || !spec.regionId)) e.regionId = 'Choose a provider and a region.'
  if (step === STEP.compute && !spec.instanceTypeId) e.regionId = 'Choose an instance type.'
  const residency = residencyProblem(spec, providers)
  if (step === STEP.provider && residency) e.regionId = residency
  if (step === STEP.data && residency) e.dataClassification = residency
  if (step === STEP.asr && spec.asr.length > 0 && spec.languages.length === 0) e.languages = 'Choose at least one language for speech recognition.'
  if (step === STEP.review && spec.justification.trim().length < 10) e.justification = 'Tell your reviewers in a sentence or two why your organisation needs this.'
  return e
}

/* ---------- step components ---------- */

function RadioCard({ value, title, description, extra, disabled, reason }: { value: string; title: string; description: string; extra?: React.ReactNode; disabled?: boolean; reason?: string }) {
  const reasonId = reason ? `rc-reason-${value}` : undefined
  return (
    <RadioCardItem
      value={value}
      disabled={disabled}
      aria-describedby={reasonId}
      className="card relative flex flex-col gap-1 p-4 text-left disabled:cursor-not-allowed disabled:bg-bg-subtle disabled:opacity-70 transition-[box-shadow,border-color] hover:border-border-strong data-[state=checked]:border-2 data-[state=checked]:border-indigo data-[state=checked]:p-[15px] dark:data-[state=checked]:border-indigo-text [&[data-state=checked]_.check]:flex"
    >
      <span className="check absolute right-3 top-3 hidden size-5 items-center justify-center rounded-full bg-indigo text-white">
        <Check className="size-3.5" strokeWidth={3} aria-hidden />
      </span>
      <span className="pr-6 font-semibold text-text-primary">{title}</span>
      <span className="text-caption text-text-secondary">{description}</span>
      {extra}
      {reason && (
        <span id={reasonId} className="mt-1 flex items-start gap-1.5 text-caption font-semibold text-status-over-fg">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {reason}
        </span>
      )}
    </RadioCardItem>
  )
}

function StepPurpose({ spec, set, errors, projects, editing }: StepProps) {
  const extra = (spec.extraProjectIds ?? []).filter((id) => id !== spec.projectId)
  const others = projects.filter((p) => p.id !== spec.projectId)
  return (
    <div className="flex flex-col gap-6">
      <Field label="Project" htmlFor="env-project" required error={errors.projectId} helper="Project members can see and use this environment.">
        <Select value={spec.projectId} onValueChange={(v) => set({ projectId: v, extraProjectIds: extra.filter((id) => id !== v) })}>
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
      {!editing && others.length > 0 && (
        <fieldset>
          <legend className="text-sm font-semibold text-text-primary">Also host these projects</legend>
          <p className="mb-3 mt-0.5 text-caption text-text-secondary">Optional. Each project gets its own service, port and route on this environment. You can add or remove projects later from the environment’s Projects tab.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {others.map((p) => {
              const on = extra.includes(p.id)
              return (
                <label key={p.id} className={cn('card flex cursor-pointer items-start gap-3 p-3 hover:border-border-strong', on && 'border-indigo dark:border-indigo-text')}>
                  <Checkbox
                    checked={on}
                    onCheckedChange={(c) => set({ extraProjectIds: c === true ? [...extra, p.id] : extra.filter((id) => id !== p.id) })}
                    aria-label={`Also host ${p.name}`}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-text-primary">{p.name}</span>
                    <span className="line-clamp-2 block text-caption text-text-secondary">{p.description}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      )}
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

function OtherProviders({ others, role, onAsk, dialog, pending }: { others: InfraProvider[]; role: Role; onAsk: (pid: string) => void; dialog: React.ReactNode; pending: string[] }) {
  if (!others.length) return null
  return (
    <details className="rounded-card border border-border p-4">
      <summary className="cursor-pointer text-sm font-semibold text-text-primary">Not enabled for your organisation ({others.length})</summary>
      <p className="mt-2 text-caption text-text-secondary">
        {role === 'tenant_admin' ? 'Not approved for your organisation yet. Request access from Infrastructure Providers.' : 'Not approved for your organisation yet. Your Tenant Admin can ask the Super Admin for them.'}
      </p>
      <ul className="mt-3 divide-y divide-border rounded-control border border-border">
        {others.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-text-primary">{p.name}</span>
              <span className="text-caption text-text-muted">
                {PROVIDER_TYPE_LABELS[p.type]} · {p.regions.map((r) => r.name).join(', ')}
              </span>
            </span>
            {pending.includes(p.id) ? (
              <span className="text-caption text-text-muted">Already requested; it’s with your admins.</span>
            ) : role === 'tenant_admin' ? (
              <Link to="/tenant-admin/infra-providers" className="link text-caption">
                Request access
              </Link>
            ) : (
              <Button type="button" variant="ghost" size="compact" onClick={() => onAsk(p.id)} aria-label={`Ask my admin to enable ${p.name}`}>
                Ask my admin to enable this provider
              </Button>
            )}
          </li>
        ))}
      </ul>
      {dialog}
    </details>
  )
}

function ProviderStepNotice({ note, onDismiss }: { note: string | null; onDismiss: () => void }) {
  if (!note) return null
  return (
    <div className="flex items-start gap-3 rounded-card bg-status-provisioning-bg p-4 text-sm text-status-provisioning-fg" role="status">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="flex-1">{note}</p>
      <button type="button" onClick={onDismiss} className="shrink-0 text-caption font-semibold underline underline-offset-2">
        Dismiss
      </button>
    </div>
  )
}

/** Note shown when switching provider or region changed the compute choice. */
function placementChange(from: EnvSpec, to: EnvSpec, providerName: string): string | null {
  if (!from.instance.name || from.instanceTypeId === to.instanceTypeId) return null
  const gpu = (g: EnvSpec['instance']['gpuType']) => (g === 'none' ? 'CPU only' : `${g}`)
  return `Changed the instance from ${from.instance.name} (${gpu(from.instance.gpuType)}) to ${to.instance.name} (${gpu(to.instance.gpuType)}) because ${providerName} doesn’t offer ${from.instance.name} there.`
}

function StepProvider({ spec, set, providers, tenant, errors, editing, role, placementNote, setPlacementNote }: StepProps) {
  const environments = useAppStore((s) => s.environments)
  const catalog = useAppStore((s) => s.catalog)
  const allProviderRequests = useAppStore((s) => s.providerRequests)
  const allowed = providersFor(providers, tenant)
  const provider = providers.find((p) => p.id === spec.providerId)
  const sensitive = isSensitive(spec)
  const approval = approvalFor(tenant, spec.providerId)
  const approvedRegions = (provider?.regions ?? []).filter((r) => !approval || approval.regionIds.includes(r.id))
  const others = providersOfferedTo(providers, tenant.id).filter((p) => !approvalFor(tenant, p.id))
  const [askFor, setAskFor] = useState<string | undefined>()
  const [askOpen, setAskOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [recommendation, setRecommendation] = useState<string | null>(null)
  const pendingProviders = allProviderRequests
    .filter((r) => r.tenantId === tenant.id && ['submitted', 'under_review', 'escalated', 'changes_requested', 'resubmitted'].includes(r.status))
    .map((r) => r.providerId)

  const ctx = { providers, catalog, tenant }
  const rows = allowed.map((p) => {
    const eq = equivalentSpec(spec, p, tenant, p.id === spec.providerId ? spec.regionId : undefined)
    const est = eq ? costBreakdown(eq.spec, ctx) : null
    const b = providerBudget(tenant, p.id, environments, { providers, catalog })
    return { p, eq, est, remaining: b.cap - b.committed }
  })
  const cheapest = rows.filter((r) => r.est).reduce<(typeof rows)[number] | null>((a, r) => (!a || r.est!.total < a.est!.total ? r : a), null)

  const apply = (next: EnvSpec, providerName: string) => {
    setPlacementNote(placementChange(spec, next, providerName))
    set(next)
  }
  const chooseProvider = (pid: string) => {
    const p = providers.find((x) => x.id === pid)
    const eq = p && equivalentSpec(spec, p, tenant)
    if (eq && p) apply(eq.spec, p.name)
    setRecommendation(null)
  }
  const chooseRegion = (rid: string) => {
    if (!provider) return
    const eq = equivalentSpec(spec, provider, tenant, rid)
    if (eq) apply(eq.spec, `${provider.name} ${provider.regions.find((r) => r.id === rid)?.name ?? ''}`.trim())
  }
  const recommend = () => {
    const rec = recommendProvider(spec, providers, tenant, (x) => costBreakdown(x, ctx).total, (pid) => rows.find((r) => r.p.id === pid)?.remaining ?? 0)
    setRecommendation(rec.reason)
    if ('providerId' in rec) apply(rec.spec, providers.find((p) => p.id === rec.providerId)?.name ?? '')
  }

  const otherProviders = (
    <OtherProviders
      others={others}
      role={role}
      onAsk={(pid) => {
        setAskFor(pid)
        setAskOpen(true)
      }}
      dialog={<ProviderRequestDialog open={askOpen} onOpenChange={setAskOpen} providerId={askFor} />}
      pending={pendingProviders}
    />
  )

  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-card border border-border bg-bg-subtle p-4 text-sm">
          <p className="font-semibold text-text-primary">
            {provider?.name} · {provider?.regions.find((r) => r.id === spec.regionId)?.name}
          </p>
          <p className="mt-1 text-text-secondary">The provider and region are set when an environment is created. To run it elsewhere, request a new environment.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-1 text-sm font-semibold text-text-primary">What data will this environment use?</p>
        <p className="mb-3 text-caption text-text-secondary">Personal and children’s data must stay in India, so it decides which regions you can use. You can change it on the Data step too.</p>
        <RadioGroup
          value={spec.dataClassification}
          onValueChange={(v) => {
            const d = v as EnvSpec['dataClassification']
            const next: EnvSpec = { ...spec, dataClassification: d, containsPii: d === 'personal' || d === 'children' ? true : spec.containsPii }
            const region = provider?.regions.find((r) => r.id === spec.regionId)
            if (provider && region && !region.indiaResident && isSensitive(next)) {
              const eq = equivalentSpec(next, provider, tenant)
              if (eq) {
                set(eq.spec)
                setPlacementNote(`Moved from ${region.name} to ${provider.regions.find((r) => r.id === eq.spec.regionId)?.name} because ${d === 'children' ? 'children’s' : 'personal'} data must stay in India.`)
              } else set(next)
            } else set(next)
            setRecommendation(null)
          }}
          className="grid-cols-2 lg:grid-cols-4"
          aria-label="Data classification"
        >
          {DATA_CLASSES.map((d) => (
            <RadioCard key={d.value} value={d.value} title={d.label} description={d.value === 'personal' || d.value === 'children' ? 'India only' : 'Any approved region'} />
          ))}
        </RadioGroup>
      </div>

      {!allowed.length ? (
        <div className="flex gap-3 rounded-card border border-border bg-bg-subtle p-4 text-sm text-text-secondary" role="alert">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-text-muted" aria-hidden />
          <p>No infrastructure providers are approved for {tenant.name} yet, so an environment can’t be requested.</p>
        </div>
      ) : (
        <>
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text-primary">Provider</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="compact" onClick={recommend}>
                  <Sparkles /> Recommend for me
                </Button>
                <Button type="button" variant="secondary" size="compact" onClick={() => setCompareOpen(true)}>
                  <Scale /> Compare providers
                </Button>
              </div>
            </div>
            {recommendation && (
              <p className="mb-3 flex items-start gap-2 rounded-control bg-indigo-50 px-3 py-2 text-caption font-semibold text-indigo-text" role="status" aria-label="Recommendation">
                <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {recommendation}
              </p>
            )}
            <RadioGroup value={spec.providerId} onValueChange={chooseProvider} className="sm:grid-cols-2" aria-label="Provider">
              {rows.map(({ p, est, remaining }) => {
                const over = est ? est.total > remaining : false
                const resid = indiaResidency(p)
                return (
                  <RadioCard
                    key={p.id}
                    value={p.id}
                    title={p.name}
                    description={`${PROVIDER_TYPE_LABELS[p.type]} · ${p.regions.filter((r) => approvalFor(tenant, p.id)?.regionIds.includes(r.id)).map((r) => r.name).join(', ')}`}
                    extra={
                      <span className="mt-2 flex flex-col gap-1.5">
                        <span className="flex flex-wrap gap-1.5">
                          <Tag>India residency: {resid}</Tag>
                          <Tag>{providerGpuTypes(p).join(', ') || 'CPU only'}</Tag>
                          {cheapest?.p.id === p.id && rows.length > 1 && <Tag className="border-indigo bg-indigo-50 text-indigo-text">Cheapest</Tag>}
                        </span>
                        <span className="tabular text-caption text-text-primary">
                          <span className="font-semibold">{est ? `${formatInt(est.total)} credits / month` : 'No matching instance'}</span> for this configuration
                        </span>
                        <span className={cn('tabular text-caption', over ? 'font-semibold text-status-over-fg' : 'text-text-secondary')}>
                          {formatInt(Math.max(0, remaining))} left of this month’s budget{over && est ? ` · over by ${formatInt(est.total - Math.max(0, remaining))}` : ''}
                        </span>
                      </span>
                    }
                  />
                )
              })}
            </RadioGroup>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-text-primary">Region</p>
            <RadioGroup value={spec.regionId} onValueChange={chooseRegion} className="sm:grid-cols-3" aria-label="Region">
              {approvedRegions.map((r) => {
                const blocked = sensitive && !r.indiaResident
                return (
                  <RadioCard
                    key={r.id}
                    value={r.id}
                    title={r.name}
                    description={r.indiaResident ? 'Data stays in India' : 'Outside India'}
                    disabled={blocked}
                    reason={blocked ? 'Stores data outside India; personal and children’s data must stay in India.' : undefined}
                    extra={<span className="mt-1 text-caption text-text-muted">GPUs: {r.gpuTypes.join(', ') || 'none'}</span>}
                  />
                )
              })}
            </RadioGroup>
            {errors.regionId && (
              <p className="mt-2 flex items-start gap-1.5 text-caption text-red-text" role="alert">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {errors.regionId}
              </p>
            )}
          </div>
          <ProviderStepNotice note={placementNote} onDismiss={() => setPlacementNote(null)} />
        </>
      )}

      {otherProviders}

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent size="lg" className="sm:max-w-4xl">
          <DialogHeader title="Compare providers" description="The same configuration priced on each provider approved for your organisation, per month, from each one’s current rate card." />
          <DialogBody>
            <div className="overflow-x-auto rounded-control border border-border">
              <table className="w-full min-w-[760px] text-sm" aria-label="Provider comparison">
                <thead className="bg-bg-subtle text-left text-caption text-text-secondary">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Provider</th>
                    {['Compute', 'Storage', 'Egress', 'Models', 'Fee', 'Discount', 'GST', 'Total / month'].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-right font-semibold">
                        {h}
                      </th>
                    ))}
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(({ p, eq, est }) => (
                    <tr key={p.id} className={cn(cheapest?.p.id === p.id && 'bg-indigo-50')}>
                      <th scope="row" className="px-3 py-2.5 text-left font-normal">
                        <span className="block font-semibold text-text-primary">
                          {p.name} {cheapest?.p.id === p.id && <span className="text-xs text-indigo-text">· Cheapest</span>}
                        </span>
                        <span className="text-caption text-text-muted">{eq ? `${eq.spec.instance.name}${eq.spec.instanceCount > 1 ? ` × ${eq.spec.instanceCount}` : ''} · ${p.regions.find((r) => r.id === eq.spec.regionId)?.name}` : `No ${spec.instance.gpuType} instance`}</span>
                      </th>
                      {est ? (
                        [est.compute, est.storage, est.network, est.models, est.platformFee, -est.ngoDiscount, est.gst, est.total].map((v, i) => (
                          <td key={i} className={cn('tabular px-3 py-2.5 text-right', i === 7 && 'font-semibold')}>
                            {v < 0 ? `−${formatInt(-v)}` : formatInt(v)}
                          </td>
                        ))
                      ) : (
                        <td colSpan={8} className="px-3 py-2.5 text-right text-caption text-text-muted">
                          Not available for this configuration
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right">
                        {eq && p.id !== spec.providerId && (
                          <Button size="sm" variant="ghost" onClick={() => { chooseProvider(p.id); setCompareOpen(false) }}>
                            Use this provider
                          </Button>
                        )}
                        {p.id === spec.providerId && <span className="text-caption font-semibold text-indigo-text">Selected</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StepCompute({ spec, set, providers, tenant, goTo, placementNote, setPlacementNote, editing }: StepProps) {
  const hours = activeHoursPerMonth(spec.autoShutdownHours)
  const provider = providers.find((p) => p.id === spec.providerId)
  const region = provider?.regions.find((r) => r.id === spec.regionId)
  const instances = instancesFor(provider, region)
  const card = rateCardAt(provider)
  void tenant
  const choose = (instanceId: string, count = spec.instanceCount) => {
    const it = instances.find((x) => x.id === instanceId)
    if (!provider || !region || !it) return
    set(applyPlacement(spec, provider.id, region.id, it, count))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-bg-subtle px-4 py-3 text-sm">
        <span className="text-text-primary">
          <span className="font-semibold">{provider?.name}</span> · {region?.name} {card && <span className="text-text-secondary">· rate card v{card.version}</span>}
        </span>
        {!editing && (
          <button type="button" className="link text-sm" onClick={() => goTo(STEP.provider)}>
            Change provider or region
          </button>
        )}
      </div>
      <ProviderStepNotice note={placementNote} onDismiss={() => setPlacementNote(null)} />

      <div>
        <p className="mb-3 text-sm font-semibold text-text-primary">Instance type</p>
        <RadioGroup value={spec.instanceTypeId} onValueChange={(v) => choose(v)} className="sm:grid-cols-2" aria-label="Instance type">
          {instances.map((i) => (
            <RadioCard
              key={i.id}
              value={i.id}
              title={i.name}
              description={`${i.vcpu} vCPU · ${i.ramGb} GB RAM${i.gpuType === 'none' ? ' · no GPU' : ` · ${i.gpuCount}× NVIDIA ${i.gpuType}`}`}
              extra={<span className="tabular mt-2 text-caption font-semibold text-text-primary">{formatInt(i.hourlyRate)} credits per active hour (₹{formatInt(i.hourlyRate)})</span>}
            />
          ))}
        </RadioGroup>
        {card && (
          <p className="mt-2 text-caption text-text-muted">
            Only instances from {provider?.name} are shown. Rates from rate card v{card.version}, effective from {formatDate(card.effectiveFrom)}.
          </p>
        )}
      </div>

      <Field label="Number of instances" htmlFor="instance-count" helper="Each instance comes with the vCPU, RAM and GPUs listed above.">
        <Select value={String(spec.instanceCount)} onValueChange={(v) => choose(spec.instanceTypeId, Number(v))}>
          <SelectTrigger id="instance-count" className="sm:max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} instance{n > 1 ? 's' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="storage" className="text-sm font-semibold text-text-primary">
            Storage
          </label>
          <span className="tabular text-sm font-semibold text-text-primary">{spec.storageGb} GB</span>
        </div>
        <Slider id="storage" min={20} max={1000} step={10} value={[spec.storageGb]} onValueChange={([v]) => set({ storageGb: v! })} aria-label="Storage in GB" />
        <p className="text-caption text-text-muted">For datasets, audio, embeddings and logs. {card ? `${card.storageRate} credits per GB each month.` : ''}</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="egress" className="text-sm font-semibold text-text-primary">
            Network egress
          </label>
          <span className="tabular text-sm font-semibold text-text-primary">{spec.egressGbPerMonth} GB a month</span>
        </div>
        <Slider id="egress" min={0} max={2000} step={10} value={[spec.egressGbPerMonth]} onValueChange={([v]) => set({ egressGbPerMonth: v! })} aria-label="Network egress in GB per month" />
        <p className="text-caption text-text-muted">Data sent out of the cloud, such as answers to apps and downloads. {card ? `${card.egressRate} credits per GB.` : ''}</p>
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

function StepData({ spec, set, errors }: StepProps) {
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
        {errors.dataClassification && (
          <p className="mt-2 flex items-start gap-1.5 text-caption text-red-text" role="alert">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {errors.dataClassification}
          </p>
        )}
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
              Keep only what you need, and have consent in place. The environment must run in an India-resident region. Hosted model APIs may still
              process data outside India. Your admin may ask for a data-processing agreement.
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
  providers: InfraProvider[]
  editing: boolean
  goTo: (step: number) => void
  /** What changed in the compute choice after switching provider or region. */
  placementNote: string | null
  setPlacementNote: (n: string | null) => void
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
  const infraProviders = useAppStore((s) => s.infraProviders)
  const costCtx = useCostContext(tenant.id)
  const [spec, setSpec] = useState<EnvSpec>(() =>
    editingEnv
      ? structuredClone(editingEnv.spec)
      : existing && mode !== 'new'
        ? ensurePlacement(structuredClone(existing.spec), infraProviders, tenant)
        : ensurePlacement({ ...DEFAULT_SPEC, projectId: projects[0]?.id ?? '' }, infraProviders, tenant),
  )
  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(mode === 'new' ? 0 : STEPS.length - 1)
  const [errors, setErrors] = useState<Errors>({})
  const [placementNote, setPlacementNote] = useState<string | null>(null)
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

  const est = useMemo(() => costBreakdown(spec, costCtx), [spec, costCtx])
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
        const e = validate(spec, s, infraProviders)
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
      const e = validate(spec, s, infraProviders)
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

  const props: StepProps = { spec, set, catalog, selectable, projects, tenant, role: user.role, errors, providers: infraProviders, editing, goTo, placementNote, setPlacementNote }
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
            {step === STEP.provider && <StepProvider {...props} />}
            {step === STEP.compute && <StepCompute {...props} />}
            {step === STEP.llms && <StepLlms {...props} />}
            {step === STEP.asr && <StepAsr {...props} />}
            {step === STEP.caps && <StepCapabilities {...props} />}
            {step === STEP.data && <StepData {...props} />}
            {step === STEP.review && <StepReview {...props} goTo={goTo} editing={editing} quotaNote={quotaNote} />}
          </div>

          <div className="2xl:hidden">
            <CostEstimate spec={spec} tenant={tenant} used={used} previous={previous} catalog={catalog} audience={user.role} editingEnvId={editingEnv?.id} className="mx-5 mb-6 sm:mx-6" />
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
            <span className="tabular ml-auto hidden text-caption text-text-secondary xl:inline 2xl:hidden">{formatInt(est.total)} credits / month</span>
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
            <CostEstimate spec={spec} tenant={tenant} used={used} previous={previous} catalog={catalog} audience={user.role} editingEnvId={editingEnv?.id} />
          </div>
        </div>
      </div>
    </>
  )
}
