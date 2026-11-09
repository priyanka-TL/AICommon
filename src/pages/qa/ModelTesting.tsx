import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { BrainCircuit, FileBarChart, Play } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { currentSpec, currentVersion } from '@/lib/qa'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfigSelect, PassBadge, ProjectSelect, PromptTable, SummaryKpis, useQaData, useQaRunner } from './shared'

export default function ModelTesting() {
  const { projects, configs, datasets, providers, modelsFor } = useQaData()
  const recordQaRun = useAppStore((s) => s.recordQaRun)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const projectId = projects.some((p) => p.id === params.get('project')) ? params.get('project')! : (projects[0]?.id ?? '')
  const models = useMemo(() => modelsFor(projectId), [modelsFor, projectId])
  const modelId = models.some((m) => m.id === params.get('model')) ? params.get('model')! : (models[0]?.id ?? '')
  const projectConfigs = configs.filter((c) => currentSpec(c).projectId === projectId && currentSpec(c).type !== 'load')
  const configId = projectConfigs.some((c) => c.id === params.get('config')) ? params.get('config')! : (projectConfigs.find((c) => !c.archived)?.id ?? '')
  const config = configs.find((c) => c.id === configId)
  const spec = config ? currentSpec(config) : undefined
  const dataset = datasets.find((d) => d.id === spec?.datasetId)
  const runner = useQaRunner()
  const [runId, setRunId] = useState<string | null>(null)

  useEffect(() => {
    runner.reset()
    setRunId(null)
    // A new selection starts a fresh run.
  }, [projectId, modelId, configId])

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) next.set(k, v)
    if ('project' in patch) {
      next.delete('model')
      next.delete('config')
    }
    setParams(next, { replace: true })
  }

  const model = models.find((m) => m.id === modelId)

  const run = () => {
    if (!model || !config || !spec || !dataset) return
    runner.start([model], dataset, spec, providers, ([s]) => {
      const res = recordQaRun({
        projectId,
        configId: config.id,
        configVersion: currentVersion(config),
        kind: 'single',
        envId: null,
        title: `Tested ${model.name}`,
        passed: s!.passed,
        models: [s!],
      })
      if (res.ok) {
        setRunId(res.id!)
        toast.success(s!.passed ? `${model.name} met every threshold.` : `${model.name} did not meet every threshold.`, { description: 'Saved to Test Reports.' })
      } else toast.error(res.error)
    })
  }

  if (!projects.length) {
    return (
      <>
        <PageHeader eyebrow="Models" title="Model Testing" />
        <div className="card">
          <EmptyState icon={BrainCircuit} title="You aren’t assigned to any project yet" description="Ask your Tenant Admin to add you to a project you should test." />
        </div>
      </>
    )
  }

  const s = runner.summaries?.[0]

  return (
    <>
      <PageHeader
        eyebrow="Models"
        title="Model Testing"
        description="Run a test set against one model and see how each prompt scored."
        actions={
          <Button onClick={run} disabled={!model || !dataset || runner.running}>
            <Play /> {runner.running ? 'Running…' : 'Run test set'}
          </Button>
        }
      />

      <div className="card mb-6 grid gap-4 p-5 md:grid-cols-3">
        <Field label="Project">
          <ProjectSelect projects={projects} value={projectId} onChange={(v) => set({ project: v })} />
        </Field>
        <Field label="Model" helper="Enabled for your organisation and attached to this project.">
          <Select value={modelId} onValueChange={(v) => set({ model: v })} disabled={!models.length}>
            <SelectTrigger aria-label="Model">
              <SelectValue placeholder="No models attached" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Test configuration" helper={dataset ? `${dataset.name} · ${dataset.rows.length} prompts` : undefined}>
          <ConfigSelect configs={projectConfigs} value={configId} onChange={(v) => set({ config: v })} />
        </Field>
      </div>

      {!projectConfigs.length ? (
        <div className="card">
          <EmptyState
            icon={BrainCircuit}
            title="This project has no test configuration yet"
            action={
              <Button asChild variant="secondary">
                <Link to="/qa/configurations?new=1">Create a configuration</Link>
              </Button>
            }
          />
        </div>
      ) : !s ? (
        <div className="card">
          <EmptyState icon={Play} title="Ready to run" description={model && dataset ? `${model.name} will answer ${dataset.rows.length} prompts from ${dataset.name}.` : 'Choose a model and a configuration.'} />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {runner.finished && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                <PassBadge passed={s.passed} />
                <span>
                  {Math.round(s.passRate * 100)}% of prompts passed · thresholds from {config && `v${currentVersion(config)}`}
                </span>
              </div>
              {runId && (
                <Button variant="secondary" size="compact" onClick={() => navigate(`/qa/reports/${runId}`)}>
                  <FileBarChart /> Open report
                </Button>
              )}
            </div>
          )}
          {runner.finished && <SummaryKpis s={s} />}
          <PromptTable results={s.results} shown={runner.shown} />
        </div>
      )}
    </>
  )
}
