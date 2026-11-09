import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Award, Check, FileBarChart, Play, Scale } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { currentSpec, currentVersion, qualityScore } from '@/lib/qa'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/controls'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { ConfigSelect, ProjectSelect, useQaData, useQaRunner } from './shared'
import { ComparisonCharts, MetricTable, SideBySide } from './ComparisonViews'

const MIN = 2
const MAX = 4

export default function ModelComparison() {
  const { projects, configs, datasets, providers, catalog, modelsFor } = useQaData()
  const recordQaRun = useAppStore((s) => s.recordQaRun)
  const setRecommendation = useAppStore((s) => s.setRecommendation)
  const project = useAppStore((s) => s.projects)
  const [params, setParams] = useSearchParams()
  const projectId = projects.some((p) => p.id === params.get('project')) ? params.get('project')! : (projects[0]?.id ?? '')
  const models = useMemo(() => modelsFor(projectId), [modelsFor, projectId])
  const projectConfigs = configs.filter((c) => currentSpec(c).projectId === projectId && currentSpec(c).type !== 'load')
  const preferred = projectConfigs.find((c) => !c.archived && currentSpec(c).type === 'comparison') ?? projectConfigs.find((c) => !c.archived)
  const configId = projectConfigs.some((c) => c.id === params.get('config')) ? params.get('config')! : (preferred?.id ?? '')
  const config = configs.find((c) => c.id === configId)
  const spec = config ? currentSpec(config) : undefined
  const dataset = datasets.find((d) => d.id === spec?.datasetId)
  const [picked, setPicked] = useState<string[]>([])
  const runner = useQaRunner()
  const [runId, setRunId] = useState<string | null>(null)
  const [recOpen, setRecOpen] = useState(false)
  const [recModel, setRecModel] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recommendation = project.find((p) => p.id === projectId)?.recommendation

  useEffect(() => {
    setPicked(models.slice(0, 3).map((m) => m.id))
  }, [models])

  useEffect(() => {
    runner.reset()
    setRunId(null)
  }, [projectId, configId, picked.join()])

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) next.set(k, v)
    if ('project' in patch) next.delete('config')
    setParams(next, { replace: true })
  }

  const toggle = (id: string) => {
    setError(null)
    if (picked.includes(id)) setPicked(picked.filter((x) => x !== id))
    else if (picked.length >= MAX) setError(`Compare up to ${MAX} models at a time. Remove one to add another.`)
    else setPicked([...picked, id])
  }

  const run = () => {
    const chosen = picked.map((id) => models.find((m) => m.id === id)!).filter(Boolean)
    if (chosen.length < MIN) {
      setError(`Pick at least ${MIN} models to compare.`)
      return
    }
    if (!config || !spec || !dataset) return
    runner.start(chosen, dataset, spec, providers, (sums) => {
      const best = sums.reduce((b, s) => (qualityScore(s) > qualityScore(b) ? s : b), sums[0]!)
      const res = recordQaRun({
        projectId,
        configId: config.id,
        configVersion: currentVersion(config),
        kind: 'comparison',
        envId: null,
        title: `Compared ${chosen.map((m) => m.name).join(', ')}`,
        passed: sums.some((s) => s.passed),
        models: sums,
      })
      if (res.ok) {
        setRunId(res.id!)
        setRecModel(best.modelId)
        toast.success('Comparison finished.', { description: 'Saved to Test Reports.' })
      } else toast.error(res.error)
    })
  }

  const recommend = () => {
    if (!runId) return
    const res = setRecommendation(projectId, recModel, runId, note)
    if (!res.ok) {
      setError(res.error)
      return
    }
    const name = catalog.find((c) => c.id === recModel)?.name
    toast.success(`${name} is now the recommended model for ${projects.find((p) => p.id === projectId)?.name}.`, { description: 'Project members see it in the marketplace.' })
    setRecOpen(false)
  }

  if (!projects.length) {
    return (
      <>
        <PageHeader eyebrow="Models" title="Model Comparison" />
        <div className="card">
          <EmptyState icon={Scale} title="You aren’t assigned to any project yet" description="Ask your Tenant Admin to add you to a project you should test." />
        </div>
      </>
    )
  }

  const summaries = runner.summaries

  return (
    <>
      <PageHeader
        eyebrow="Models"
        title="Model Comparison"
        description="Run the same test set through 2 to 4 models and pick the one that fits the project."
        actions={
          runner.finished && runId ? (
            <Button onClick={() => { setNote(''); setError(null); setRecOpen(true) }}>
              <Award /> Mark as recommended model
            </Button>
          ) : (
            <Button onClick={run} disabled={runner.running || !dataset || picked.length < MIN}>
              <Play /> {runner.running ? 'Comparing…' : `Compare ${picked.length} models`}
            </Button>
          )
        }
      />

      <div className="card mb-6 flex flex-col gap-5 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Project">
            <ProjectSelect projects={projects} value={projectId} onChange={(v) => set({ project: v })} />
          </Field>
          <Field label="Test configuration" helper={dataset ? `Same test set for every model: ${dataset.name} · ${dataset.rows.length} prompts` : undefined}>
            <ConfigSelect configs={projectConfigs} value={configId} onChange={(v) => set({ config: v })} />
          </Field>
        </div>
        <Field label={`Models (${picked.length} of up to ${MAX})`} error={error ?? undefined}>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Models to compare">
            {models.map((m) => {
              const on = picked.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(m.id)}
                  className={cn(
                    'flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors',
                    on ? 'border-indigo bg-indigo-50 text-indigo-text' : 'border-border-strong bg-bg-surface text-text-secondary hover:bg-bg-subtle',
                  )}
                >
                  {on && <Check className="size-4" aria-hidden />}
                  {m.name}
                  {recommendation?.modelId === m.id && <span className="text-xs font-normal text-text-muted">· recommended</span>}
                </button>
              )
            })}
            {!models.length && <p className="text-sm text-text-secondary">No models are attached to this project yet.</p>}
          </div>
        </Field>
      </div>

      {!projectConfigs.length ? (
        <div className="card">
          <EmptyState
            icon={Scale}
            title="This project has no test configuration yet"
            action={
              <Button asChild variant="secondary">
                <Link to="/qa/configurations?new=1">Create a configuration</Link>
              </Button>
            }
          />
        </div>
      ) : !summaries ? (
        <div className="card">
          <EmptyState icon={Scale} title="Pick models and run the comparison" description="You’ll see each model’s answers side by side, a score table with the best value marked, and charts." />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {runner.finished && (
            <>
              <MetricTable summaries={summaries} catalog={catalog} metrics={spec?.metrics} recommendedId={recommendation?.modelId} />
              <ComparisonCharts summaries={summaries} catalog={catalog} />
              {runId && (
                <Link to={`/qa/reports/${runId}`} className="link inline-flex items-center gap-1.5 self-start text-sm">
                  <FileBarChart className="size-4" aria-hidden /> Open the full report
                </Link>
              )}
            </>
          )}
          <SideBySide summaries={summaries} catalog={catalog} shown={runner.shown} />
        </div>
      )}

      <Dialog open={recOpen} onOpenChange={setRecOpen}>
        <DialogContent size="md">
          <DialogHeader title="Mark as recommended model" description="Saved to the project. Its members see it in the AI Capability Marketplace with a link to this report." />
          <DialogBody className="flex flex-col gap-4">
            <Field label="Model" error={error ?? undefined}>
              <RadioGroup value={recModel} onValueChange={setRecModel} className="gap-2">
                {(summaries ?? []).map((s) => (
                  <label key={s.modelId} className="flex cursor-pointer items-center gap-3 rounded-control border border-border p-3 hover:bg-bg-subtle">
                    <RadioGroupItem value={s.modelId} aria-label={catalog.find((c) => c.id === s.modelId)?.name} />
                    <span className="flex-1 text-sm font-semibold text-text-primary">{catalog.find((c) => c.id === s.modelId)?.name}</span>
                    <span className="tabular text-caption text-text-secondary">
                      Quality {qualityScore(s).toFixed(2)} · {s.costCredits.toFixed(3)} cr
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </Field>
            <Field label="Note for the team" htmlFor="rec-note" helper="Optional. For example: best Hindi answers at a third of the cost.">
              <Textarea id="rec-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {recommendation && <p className="text-caption text-text-secondary">This replaces the current recommendation for this project.</p>}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button onClick={recommend} disabled={!recModel}>
              <Award /> Recommend model
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
