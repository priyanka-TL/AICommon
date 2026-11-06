import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import type { CatalogCategory, CatalogItem, CatalogStatus, CostUnit, Language } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { CATEGORY_LABELS, CATEGORY_SINGULAR, LANGUAGES } from '@/lib/labels'
import { cn, slugify, uid } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox, RadioGroup, RadioGroupItem } from '@/components/ui/controls'
import { useVisibleTenants } from '@/store/selectors'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const COST_UNITS: CostUnit[] = ['per 1M tokens', 'per audio hour', 'per month', 'free']
const CATEGORIES = Object.keys(CATEGORY_LABELS) as CatalogCategory[]

interface FormState {
  name: string
  category: CatalogCategory
  provider: string
  hosting: CatalogItem['hosting']
  version: string
  otherVersions: string
  licence: string
  gitUrl: string
  docsUrl: string
  costPerUnit: string
  costUnit: CostUnit
  languages: Language[]
  status: CatalogStatus
  description: string
  availabilityMode: 'all' | 'selected'
  availableTo: string[]
  dependencies: string
  installInstructions: string
  resourceRequirements: string
  runtimes: string
}

type Errors = Partial<Record<keyof FormState, string>>

const empty: FormState = {
  name: '',
  category: 'llm',
  provider: '',
  hosting: 'open-source',
  version: '',
  otherVersions: '',
  licence: '',
  gitUrl: '',
  docsUrl: '',
  costPerUnit: '0',
  costUnit: 'per 1M tokens',
  languages: [],
  status: 'beta',
  description: '',
  availabilityMode: 'all',
  availableTo: [],
  dependencies: '',
  installInstructions: '',
  resourceRequirements: '',
  runtimes: 'Python',
}

function fromItem(i: CatalogItem): FormState {
  return {
    name: i.name,
    category: i.category,
    provider: i.provider,
    hosting: i.hosting,
    version: i.version,
    otherVersions: i.versions.filter((v) => v !== i.version).join(', '),
    licence: i.licence,
    gitUrl: i.gitUrl ?? '',
    docsUrl: i.docsUrl ?? '',
    costPerUnit: String(i.costPerUnit),
    costUnit: i.costUnit,
    languages: i.languages,
    status: i.status,
    description: i.description,
    availabilityMode: i.availability === 'all' ? 'all' : 'selected',
    availableTo: i.availability === 'all' ? [] : i.availability,
    dependencies: i.dependencies,
    installInstructions: i.installInstructions,
    resourceRequirements: i.resourceRequirements,
    runtimes: i.runtimes.join(', '),
  }
}

function validUrl(s: string) {
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

const defaultUnit = (c: CatalogCategory): CostUnit =>
  c === 'llm' ? 'per 1M tokens' : c === 'asr' ? 'per audio hour' : c === 'vector-db' || c === 'low-code' ? 'per month' : 'free'

export function CatalogFormSheet({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item?: CatalogItem }) {
  const catalog = useAppStore((s) => s.catalog)
  const upsert = useAppStore((s) => s.upsertCatalogItem)
  const tenants = useVisibleTenants(true)
  const [form, setForm] = useState<FormState>(empty)
  const [errors, setErrors] = useState<Errors>({})

  useEffect(() => {
    if (open) {
      setForm(item ? fromItem(item) : empty)
      setErrors({})
    }
  }, [open, item])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const languageRelevant = form.category === 'llm' || form.category === 'asr'

  const submit = () => {
    const e: Errors = {}
    const name = form.name.trim()
    if (!name) e.name = 'Enter a name.'
    else if (catalog.some((c) => c.id !== item?.id && c.name.toLowerCase() === name.toLowerCase())) e.name = 'An item with this name is already in the catalog.'
    if (!form.provider.trim()) e.provider = 'Enter who makes or maintains it.'
    if (!form.version.trim()) e.version = 'Enter the current version.'
    if (!form.licence.trim()) e.licence = 'Enter the licence, or “Commercial API” for paid services.'
    if (form.gitUrl.trim() && !validUrl(form.gitUrl.trim())) e.gitUrl = 'Enter a full link starting with https://'
    if (form.docsUrl.trim() && !validUrl(form.docsUrl.trim())) e.docsUrl = 'Enter a full link starting with https://'
    const cost = Number(form.costPerUnit)
    if (form.costUnit !== 'free' && (!Number.isFinite(cost) || cost < 0)) e.costPerUnit = 'Enter a cost of 0 or more.'
    if (form.description.trim().length < 10) e.description = 'Describe what it does in a sentence.'
    setErrors(e)
    if (Object.values(e).some(Boolean)) return

    const version = form.version.trim()
    const others = form.otherVersions
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v && v !== version)
    const id = item?.id ?? (catalog.some((c) => c.id === `cap-${slugify(name)}`) ? uid('cap') : `cap-${slugify(name)}`)

    upsert({
      id,
      name,
      category: form.category,
      provider: form.provider.trim(),
      hosting: form.hosting,
      version,
      versions: [version, ...others],
      licence: form.licence.trim(),
      gitUrl: form.gitUrl.trim() || null,
      docsUrl: form.docsUrl.trim() || null,
      costPerUnit: form.costUnit === 'free' ? 0 : cost,
      costUnit: form.costUnit,
      languages: languageRelevant ? form.languages : [],
      status: form.status,
      description: form.description.trim(),
      availability: form.availabilityMode === 'all' ? 'all' : form.availableTo,
      origin: item?.origin ?? 'registry',
      dependencies: form.dependencies.trim(),
      installInstructions: form.installInstructions.trim(),
      resourceRequirements: form.resourceRequirements.trim(),
      runtimes: form.runtimes.split(',').map((r) => r.trim()).filter(Boolean),
    })
    toast.success(item ? `Saved ${name}.` : `Added ${name} to the registry.`, {
      description: form.status === 'deprecated' ? 'It is hidden from new requests.' : 'Organisations can now select it in new requests.',
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <div className="border-b border-border px-6 pb-5 pr-14 pt-6">
          <p className="eyebrow">Capability catalog</p>
          <SheetTitle className="mt-1 font-heading text-h2 text-text-primary">{item ? `Edit ${item.name}` : 'Add capability'}</SheetTitle>
          <SheetDescription className="mt-1 text-sm text-text-secondary">
            {item ? 'Changes show up in the wizard straight away.' : 'Add a model, provider or open-source tool that organisations can request.'}
          </SheetDescription>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
          <Field label="Name" htmlFor="c-name" required error={errors.name}>
            <Input id="c-name" value={form.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} placeholder="For example: Milvus" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="c-cat">
              <Select
                value={form.category}
                onValueChange={(v) => {
                  const c = v as CatalogCategory
                  setForm((f) => ({ ...f, category: c, costUnit: item ? f.costUnit : defaultUnit(c) }))
                }}
              >
                <SelectTrigger id="c-cat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_SINGULAR[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Provider" htmlFor="c-provider" required error={errors.provider}>
              <Input id="c-provider" value={form.provider} onChange={(e) => set('provider', e.target.value)} aria-invalid={!!errors.provider} />
            </Field>
          </div>

          <Field label="Type">
            <RadioGroup value={form.hosting} onValueChange={(v) => set('hosting', v as FormState['hosting'])} className="grid-cols-2 gap-2">
              {(
                [
                  ['open-source', 'Open source', 'Runs on platform servers'],
                  ['hosted', 'Hosted API', 'Calls an external service'],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} className="flex cursor-pointer items-start gap-3 rounded-control border border-border p-3 hover:bg-bg-subtle">
                  <RadioGroupItem value={value} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-semibold text-text-primary">{label}</span>
                    <span className="block text-caption text-text-secondary">{hint}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Current version" htmlFor="c-version" required error={errors.version}>
              <Input id="c-version" value={form.version} onChange={(e) => set('version', e.target.value)} aria-invalid={!!errors.version} placeholder="1.2" />
            </Field>
            <Field label="Other versions" htmlFor="c-versions" helper="Separate with commas">
              <Input id="c-versions" value={form.otherVersions} onChange={(e) => set('otherVersions', e.target.value)} placeholder="1.1, 1.0" />
            </Field>
          </div>

          <Field label="Licence" htmlFor="c-licence" required error={errors.licence}>
            <Input id="c-licence" value={form.licence} onChange={(e) => set('licence', e.target.value)} aria-invalid={!!errors.licence} placeholder="Apache 2.0" />
          </Field>

          <Field label="Git repository" htmlFor="c-git" error={errors.gitUrl} helper="Optional">
            <Input id="c-git" type="url" className="font-mono text-caption" value={form.gitUrl} onChange={(e) => set('gitUrl', e.target.value)} aria-invalid={!!errors.gitUrl} placeholder="https://github.com/org/repo" />
          </Field>
          <Field label="Documentation" htmlFor="c-docs" error={errors.docsUrl} helper="Optional">
            <Input id="c-docs" type="url" className="font-mono text-caption" value={form.docsUrl} onChange={(e) => set('docsUrl', e.target.value)} aria-invalid={!!errors.docsUrl} placeholder="https://docs.example.org" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cost unit" htmlFor="c-unit">
              <Select value={form.costUnit} onValueChange={(v) => set('costUnit', v as CostUnit)}>
                <SelectTrigger id="c-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COST_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u === 'free' ? 'No charge' : u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Credits per unit" htmlFor="c-cost" error={errors.costPerUnit}>
              <Input
                id="c-cost"
                type="number"
                min={0}
                value={form.costUnit === 'free' ? '0' : form.costPerUnit}
                disabled={form.costUnit === 'free'}
                onChange={(e) => set('costPerUnit', e.target.value)}
                aria-invalid={!!errors.costPerUnit}
              />
            </Field>
          </div>

          {languageRelevant && (
            <Field label="Supported languages">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Supported languages">
                {LANGUAGES.map((l) => {
                  const on = form.languages.includes(l)
                  return (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set('languages', on ? form.languages.filter((x) => x !== l) : [...form.languages, l])}
                      className={cn(
                        'flex h-8 items-center gap-1.5 rounded-full border px-3 text-caption font-semibold',
                        on ? 'border-indigo bg-indigo-50 text-indigo-text dark:border-indigo-text' : 'border-border-strong text-text-secondary hover:bg-bg-subtle',
                      )}
                    >
                      {on && <Check className="size-3.5" aria-hidden />}
                      {l}
                    </button>
                  )
                })}
              </div>
            </Field>
          )}

          <Field label="Status" htmlFor="c-status" helper="Deprecated items stay attached to existing environments but can’t be picked for new ones.">
            <Select value={form.status} onValueChange={(v) => set('status', v as CatalogStatus)}>
              <SelectTrigger id="c-status" className="sm:max-w-[50%]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="beta">Beta</SelectItem>
                <SelectItem value="deprecated">Deprecated</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Available to">
            <RadioGroup value={form.availabilityMode} onValueChange={(v) => set('availabilityMode', v as FormState['availabilityMode'])} className="gap-2">
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <RadioGroupItem value="all" /> All tenants
              </label>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <RadioGroupItem value="selected" /> Selected tenants
              </label>
            </RadioGroup>
            {form.availabilityMode === 'selected' && (
              <div className="mt-2 flex flex-col gap-2 pl-7">
                {tenants.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-3 text-sm">
                    <Checkbox
                      checked={form.availableTo.includes(t.id)}
                      onCheckedChange={(v) => set('availableTo', v ? [...form.availableTo, t.id] : form.availableTo.filter((x) => x !== t.id))}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            )}
          </Field>

          <Field label="Dependencies" htmlFor="c-deps">
            <Input id="c-deps" value={form.dependencies} onChange={(e) => set('dependencies', e.target.value)} placeholder="Python 3.10 or later" />
          </Field>
          <Field label="Install instructions" htmlFor="c-install">
            <Textarea id="c-install" value={form.installInstructions} onChange={(e) => set('installInstructions', e.target.value)} className="min-h-[64px] font-mono text-caption" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Resource requirements" htmlFor="c-res">
              <Input id="c-res" value={form.resourceRequirements} onChange={(e) => set('resourceRequirements', e.target.value)} placeholder="1 vCPU and 2 GB RAM" />
            </Field>
            <Field label="Compatible runtimes" htmlFor="c-rt" helper="Separate with commas">
              <Input id="c-rt" value={form.runtimes} onChange={(e) => set('runtimes', e.target.value)} />
            </Field>
          </div>

          <Field label="Description" htmlFor="c-desc" required error={errors.description} helper="One or two sentences. Shown on catalog cards.">
            <Textarea id="c-desc" value={form.description} onChange={(e) => set('description', e.target.value)} aria-invalid={!!errors.description} />
          </Field>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>{item ? 'Save changes' : 'Add to catalog'}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
