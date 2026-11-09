import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileUp } from 'lucide-react'
import type { DatasetRow, Language, LoadProfile, QaMetric, TestConfig, TestConfigSpec, TestSchedule, TestType } from '@/data/types'
import { ALL_METRICS, DEFAULT_THRESHOLDS } from '@/data/seed'
import { useAppStore } from '@/store/useAppStore'
import { LANGUAGES } from '@/lib/labels'
import { currentSpec, METRIC_INFO, parseDatasetCsv, SCHEDULE_LABELS, TEST_TYPE_LABELS } from '@/lib/qa'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox, Slider, Switch } from '@/components/ui/controls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useQaData } from './shared'

const UPLOAD = '__upload__'
const DEFAULT_LOAD: LoadProfile = { vus: 200, rampUpSec: 60, durationMin: 5, targetRps: 120 }

type Errors = Partial<Record<'name' | 'project' | 'dataset' | 'csv' | 'languages' | 'metrics' | 'load', string>>

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `cf-sec-${title.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-4 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <p id={id} className="eyebrow">
        {title}
      </p>
      {children}
    </div>
  )
}

/** What changed between two versions, for the version history. */
function changeSummary(a: TestConfigSpec, b: TestConfigSpec) {
  const parts: string[] = []
  if (a.name !== b.name) parts.push('name')
  if (a.projectId !== b.projectId) parts.push('project')
  if (a.type !== b.type) parts.push('test type')
  if (a.datasetId !== b.datasetId) parts.push('dataset')
  if (a.languages.join() !== b.languages.join()) parts.push('languages')
  if (a.temperature !== b.temperature) parts.push(`temperature ${a.temperature} → ${b.temperature}`)
  if (a.maxTokens !== b.maxTokens) parts.push(`max tokens ${a.maxTokens} → ${b.maxTokens}`)
  if (a.systemPrompt !== b.systemPrompt) parts.push('system prompt')
  if (a.metrics.join() !== b.metrics.join()) parts.push('metrics')
  for (const m of ALL_METRICS) if (a.thresholds[m] !== b.thresholds[m]) parts.push(`${METRIC_INFO[m].label.toLowerCase()} threshold ${a.thresholds[m]} → ${b.thresholds[m]}`)
  if (JSON.stringify(a.load) !== JSON.stringify(b.load)) parts.push('load profile')
  if (a.schedule !== b.schedule) parts.push(`schedule ${SCHEDULE_LABELS[a.schedule].toLowerCase()} → ${SCHEDULE_LABELS[b.schedule].toLowerCase()}`)
  if (a.notifyOnFailure !== b.notifyOnFailure) parts.push(b.notifyOnFailure ? 'turned on failure alerts' : 'turned off failure alerts')
  if (!parts.length) return ''
  const text = parts.join(', ')
  return `Changed ${text}`
}

export function ConfigFormDialog({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; editing?: TestConfig; onSaved?: (id: string) => void }) {
  const { projects, datasets } = useQaData()
  const createTestConfig = useAppStore((s) => s.createTestConfig)
  const updateTestConfig = useAppStore((s) => s.updateTestConfig)
  const createDataset = useAppStore((s) => s.createDataset)
  const fileRef = useRef<HTMLInputElement>(null)
  const [spec, setSpec] = useState<TestConfigSpec | null>(null)
  const [datasetChoice, setDatasetChoice] = useState('')
  const [csv, setCsv] = useState<{ fileName: string; rows: DatasetRow[] } | null>(null)
  const [csvName, setCsvName] = useState('')
  const [csvLanguage, setCsvLanguage] = useState<Language>('Hindi')
  const [errors, setErrors] = useState<Errors>({})

  useEffect(() => {
    if (!open) return
    const base: TestConfigSpec = editing
      ? structuredClone(currentSpec(editing))
      : {
          name: '',
          projectId: projects[0]?.id ?? '',
          type: 'evaluation',
          datasetId: datasets[0]?.id ?? '',
          languages: datasets[0] ? [datasets[0].language] : ['Hindi'],
          temperature: 0.2,
          maxTokens: 512,
          systemPrompt: 'You help teachers and school leaders. Answer briefly and only from what you know to be true.',
          thresholds: { ...DEFAULT_THRESHOLDS },
          metrics: [...ALL_METRICS],
          load: null,
          schedule: 'manual',
          notifyOnFailure: true,
        }
    setSpec(base)
    setDatasetChoice(base.datasetId)
    setCsv(null)
    setCsvName('')
    setErrors({})
    // Load once each time the dialog opens.
  }, [open])

  if (!spec) return null
  const up = (patch: Partial<TestConfigSpec>) => setSpec({ ...spec, ...patch })
  const clearErr = (k: keyof Errors) => setErrors((e) => ({ ...e, [k]: undefined }))

  const onFile = async (file: File | undefined) => {
    if (!file) return
    clearErr('csv')
    if (!/\.csv$/i.test(file.name)) {
      setErrors((e) => ({ ...e, csv: 'Choose a .csv file with columns input, expected_output and, optionally, context.' }))
      return
    }
    const text = await file.text()
    const parsed = parseDatasetCsv(text)
    if (!parsed.ok) {
      setCsv(null)
      setErrors((e) => ({ ...e, csv: parsed.error }))
      return
    }
    setCsv({ fileName: file.name, rows: parsed.rows })
    if (!csvName) setCsvName(file.name.replace(/\.csv$/i, '').replace(/[-_]+/g, ' '))
  }

  const save = () => {
    const e: Errors = {}
    if (spec.name.trim().length < 3) e.name = 'Give the configuration a name of at least 3 characters.'
    if (!spec.projectId) e.project = 'Choose the project this configuration tests.'
    if (datasetChoice === UPLOAD) {
      if (!csv) e.csv = e.csv ?? 'Upload a CSV, or pick an existing dataset.'
      else if (csvName.trim().length < 3) e.csv = 'Name the uploaded dataset.'
    } else if (!datasetChoice) e.dataset = 'Pick a dataset.'
    if (!spec.languages.length) e.languages = 'Pick at least one language.'
    if (!spec.metrics.length && spec.type !== 'load') e.metrics = 'Pick at least one metric to score.'
    if (spec.type === 'load' && spec.load && (spec.load.vus < 1 || spec.load.targetRps < 1)) e.load = 'Virtual users and target RPS must be at least 1.'
    setErrors(e)
    if (Object.values(e).some(Boolean)) return

    let datasetId = datasetChoice
    if (datasetChoice === UPLOAD && csv) {
      const res = createDataset({ name: csvName.trim(), language: csvLanguage, rows: csv.rows })
      if (!res.ok) {
        setErrors({ csv: res.error })
        return
      }
      datasetId = res.id!
    }
    const final: TestConfigSpec = { ...spec, name: spec.name.trim(), datasetId, load: spec.type === 'load' ? (spec.load ?? DEFAULT_LOAD) : null }

    if (editing) {
      const summary = changeSummary(currentSpec(editing), final)
      if (!summary) {
        toast.info('Nothing changed, so no new version was saved.')
        onOpenChange(false)
        return
      }
      const res = updateTestConfig(editing.id, final, summary)
      if (!res.ok) return setErrors({ name: res.error })
      toast.success(`Saved version ${editing.versions.length + 1} of ${final.name}.`)
      onSaved?.(editing.id)
    } else {
      const res = createTestConfig(final)
      if (!res.ok) return setErrors({ project: res.error })
      toast.success(`Created ${final.name}.`)
      onSaved?.(res.id!)
    }
    onOpenChange(false)
  }

  const t = spec.thresholds
  const setThreshold = (m: QaMetric, v: string) => up({ thresholds: { ...t, [m]: Number(v) } })
  const load = spec.load ?? DEFAULT_LOAD

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={editing ? `Edit ${currentSpec(editing).name}` : 'New test configuration'}
          description={editing ? `Saving creates version ${editing.versions.length + 1}. Earlier versions and their reports stay as they are.` : 'Reusable settings for model tests, comparisons and load tests.'}
        />
        <DialogBody className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto">
          <Section title="Basics">
            <Field label="Name" htmlFor="cf-name" required error={errors.name}>
              <Input id="cf-name" value={spec.name} onChange={(e) => { up({ name: e.target.value }); clearErr('name') }} placeholder="Teacher FAQ – Hindi evaluation" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project" required error={errors.project}>
                <Select value={spec.projectId} onValueChange={(v) => { up({ projectId: v }); clearErr('project') }}>
                  <SelectTrigger aria-label="Project">
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
              <Field label="Test type" required>
                <Select value={spec.type} onValueChange={(v) => up({ type: v as TestType, load: v === 'load' ? (spec.load ?? DEFAULT_LOAD) : spec.load })}>
                  <SelectTrigger aria-label="Test type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TEST_TYPE_LABELS) as TestType[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {TEST_TYPE_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="Dataset">
            <Field label="Prompts to test with" required error={errors.dataset}>
              <Select
                value={datasetChoice}
                onValueChange={(v) => {
                  setDatasetChoice(v)
                  clearErr('dataset')
                  const d = datasets.find((x) => x.id === v)
                  if (d && !spec.languages.includes(d.language)) up({ languages: [d.language] })
                }}
              >
                <SelectTrigger aria-label="Dataset">
                  <SelectValue placeholder="Choose a dataset" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} · {d.rows.length} prompts
                    </SelectItem>
                  ))}
                  <SelectItem value={UPLOAD}>Upload a CSV…</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {datasetChoice === UPLOAD && (
              <div className="flex flex-col gap-4 rounded-card border border-border bg-bg-subtle p-4">
                <Field label="CSV file" helper="Columns: input, expected_output and, optionally, context. Read in your browser; nothing is uploaded." error={errors.csv}>
                  <div className="flex flex-wrap items-center gap-3">
                    <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose CSV file" onChange={(e) => onFile(e.target.files?.[0])} />
                    <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                      <FileUp /> Choose CSV
                    </Button>
                    {csv && (
                      <span className="text-caption text-text-secondary">
                        {csv.fileName} · {csv.rows.length} prompts
                      </span>
                    )}
                  </div>
                </Field>
                {csv && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Dataset name" htmlFor="cf-dsname" required>
                        <Input id="cf-dsname" value={csvName} onChange={(e) => setCsvName(e.target.value)} />
                      </Field>
                      <Field label="Language">
                        <Select value={csvLanguage} onValueChange={(v) => setCsvLanguage(v as Language)}>
                          <SelectTrigger aria-label="Dataset language">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LANGUAGES.map((l) => (
                              <SelectItem key={l} value={l}>
                                {l}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <div className="overflow-x-auto rounded-control border border-border bg-bg-surface">
                      <table className="w-full min-w-[420px] text-caption">
                        <caption className="sr-only">First rows of the uploaded file</caption>
                        <thead className="bg-bg-subtle text-left text-text-secondary">
                          <tr>
                            <th className="px-3 py-2 font-semibold">input</th>
                            <th className="px-3 py-2 font-semibold">expected_output</th>
                            <th className="px-3 py-2 font-semibold">context</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {csv.rows.slice(0, 5).map((r, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2 text-text-primary">{r.input}</td>
                              <td className="px-3 py-2 text-text-primary">{r.expected}</td>
                              <td className="max-w-[200px] truncate px-3 py-2 text-text-secondary">{r.context ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {csv.rows.length > 5 && <p className="px-3 py-2 text-caption text-text-muted">and {csv.rows.length - 5} more</p>}
                    </div>
                  </>
                )}
              </div>
            )}
            <Field label="Languages" error={errors.languages}>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {LANGUAGES.map((l) => (
                  <label key={l} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                    <Checkbox
                      checked={spec.languages.includes(l)}
                      onCheckedChange={(v) => {
                        up({ languages: v ? [...spec.languages, l] : spec.languages.filter((x) => x !== l) })
                        clearErr('languages')
                      }}
                    />
                    {l}
                  </label>
                ))}
              </div>
            </Field>
          </Section>

          <Section title="Model parameters">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Temperature: ${spec.temperature.toFixed(1)}`} helper="Lower gives steadier answers.">
                <Slider value={[spec.temperature]} min={0} max={1} step={0.1} onValueChange={([v]) => up({ temperature: v! })} aria-label="Temperature" />
              </Field>
              <Field label="Max tokens" htmlFor="cf-max">
                <Input id="cf-max" type="number" min={16} max={8192} value={spec.maxTokens} onChange={(e) => up({ maxTokens: Math.max(16, Number(e.target.value) || 16) })} />
              </Field>
            </div>
            <Field label="System prompt" htmlFor="cf-sys">
              <Textarea id="cf-sys" value={spec.systemPrompt} onChange={(e) => up({ systemPrompt: e.target.value })} className="min-h-[72px]" />
            </Field>
          </Section>

          {spec.type !== 'load' && (
            <Section title="Metrics and pass thresholds">
              {errors.metrics && <p className="text-caption text-red-text">{errors.metrics}</p>}
              <div className="flex flex-col gap-3">
                {ALL_METRICS.map((m) => (
                  <div key={m} className="grid grid-cols-[1fr_120px] items-center gap-3 sm:grid-cols-[1fr_160px]">
                    <label className="flex cursor-pointer items-start gap-3 text-sm">
                      <Checkbox
                        className="mt-0.5"
                        checked={spec.metrics.includes(m)}
                        onCheckedChange={(v) => {
                          up({ metrics: v ? ALL_METRICS.filter((x) => x === m || spec.metrics.includes(x)) : spec.metrics.filter((x) => x !== m) })
                          clearErr('metrics')
                        }}
                      />
                      <span>
                        <span className="block font-semibold text-text-primary">{METRIC_INFO[m].label}</span>
                        <span className="block text-caption text-text-secondary">{METRIC_INFO[m].hint}</span>
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-text-muted">{METRIC_INFO[m].better === 'higher' ? 'at least' : 'at most'}</span>
                      <Input
                        type="number"
                        aria-label={`${METRIC_INFO[m].label} threshold`}
                        min={0}
                        max={m === 'latencyP95' ? 30000 : 1}
                        step={m === 'latencyP95' ? 100 : 0.05}
                        value={t[m]}
                        disabled={!spec.metrics.includes(m)}
                        onChange={(e) => setThreshold(m, e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {spec.type === 'load' && (
            <Section title="Load profile">
              {errors.load && <p className="text-caption text-red-text">{errors.load}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ['vus', 'Virtual users', 1, 2000],
                    ['rampUpSec', 'Ramp-up (seconds)', 0, 600],
                    ['durationMin', 'Duration (minutes)', 1, 60],
                    ['targetRps', 'Target requests per second', 1, 5000],
                  ] as [keyof LoadProfile, string, number, number][]
                ).map(([k, label, min, max]) => (
                  <Field key={k} label={label} htmlFor={`cf-${k}`}>
                    <Input id={`cf-${k}`} type="number" min={min} max={max} value={load[k]} onChange={(e) => up({ load: { ...load, [k]: Math.min(max, Math.max(min, Number(e.target.value) || min)) } })} />
                  </Field>
                ))}
              </div>
            </Section>
          )}

          <Section title="Schedule and alerts">
            <Field label="Run">
              <Select value={spec.schedule} onValueChange={(v) => up({ schedule: v as TestSchedule })}>
                <SelectTrigger aria-label="Schedule">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SCHEDULE_LABELS) as TestSchedule[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {SCHEDULE_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <Switch checked={spec.notifyOnFailure} onCheckedChange={(v) => up({ notifyOnFailure: v })} aria-label="Notify on failure" className="mt-0.5" />
              <span>
                <span className="block font-semibold text-text-primary">Notify on failure</span>
                <span className="block text-caption text-text-secondary">You and the project owner get a notification when a run misses a threshold.</span>
              </span>
            </label>
          </Section>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={save}>{editing ? 'Save new version' : 'Create configuration'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
