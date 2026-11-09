import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CatalogItem, Dataset, ModelSummary, Project, PromptResult, TestConfig, TestConfigSpec, TestType } from '@/data/types'
import { useAppStore, useCurrentUser } from '@/store/useAppStore'
import { useScopedProjects } from '@/store/selectors'
import { currentSpec, currentVersion, evaluatePrompt, formatMetric, projectModels, summarise, TEST_TYPE_LABELS } from '@/lib/qa'
import { formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { KpiCard } from '@/components/shared/KpiCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** Everything a QA page needs, already scoped to the projects this person may test. */
export function useQaData() {
  const user = useCurrentUser()!
  const projects = useScopedProjects(false)
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === user.tenantId))
  const environments = useAppStore((s) => s.environments)
  const catalog = useAppStore((s) => s.catalog)
  const providers = useAppStore((s) => s.providers)
  const allConfigs = useAppStore((s) => s.testConfigs)
  const allDatasets = useAppStore((s) => s.datasets)
  const projectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects])
  const configs = useMemo(() => allConfigs.filter((c) => c.tenantId === user.tenantId && projectIds.has(currentSpec(c).projectId)), [allConfigs, user.tenantId, projectIds])
  const datasets = useMemo(() => allDatasets.filter((d) => d.tenantId === user.tenantId), [allDatasets, user.tenantId])
  const modelsFor = useCallback(
    (projectId: string): CatalogItem[] => {
      const p = projects.find((x) => x.id === projectId)
      return p ? projectModels(p, tenant, environments, catalog) : []
    },
    [projects, tenant, environments, catalog],
  )
  return { user, tenant, projects, environments, catalog, providers, configs, datasets, modelsFor }
}

export const configLabel = (c: TestConfig) => `${currentSpec(c).name} · v${currentVersion(c)}`

export function ProjectSelect({ projects, value, onChange }: { projects: Project[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
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
  )
}

export function ConfigSelect({ configs, value, onChange, types }: { configs: TestConfig[]; value: string; onChange: (v: string) => void; types?: TestType[] }) {
  const list = configs.filter((c) => !c.archived && (!types || types.includes(currentSpec(c).type)))
  return (
    <Select value={value} onValueChange={onChange} disabled={!list.length}>
      <SelectTrigger aria-label="Test configuration">
        <SelectValue placeholder={list.length ? 'Choose a configuration' : 'No configurations for this project'} />
      </SelectTrigger>
      <SelectContent>
        {list.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {configLabel(c)} · {TEST_TYPE_LABELS[currentSpec(c).type]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function PassBadge({ passed, label }: { passed: boolean; label?: string }) {
  return passed ? <StatusBadge status="active" label={label ?? 'Passed'} /> : <StatusBadge status="rejected" label={label ?? 'Did not pass'} />
}

const ROW_MS = 260

/**
 * Evaluates every prompt for every model up front (deterministic), then reveals
 * the rows one by one so a run feels live.
 */
export function useQaRunner() {
  const [summaries, setSummaries] = useState<ModelSummary[] | null>(null)
  const [shown, setShown] = useState(0)
  const [running, setRunning] = useState(false)
  const timer = useRef<number>()
  const done = useRef<((s: ModelSummary[]) => void) | null>(null)

  useEffect(() => () => clearInterval(timer.current), [])

  const start = (models: CatalogItem[], dataset: Dataset, spec: TestConfigSpec, providers: Parameters<typeof evaluatePrompt>[3], onDone: (s: ModelSummary[]) => void) => {
    clearInterval(timer.current)
    const result = models.map((m) => summarise(m, dataset.rows.map((r) => evaluatePrompt(r, m, spec, providers, dataset.language)), spec))
    setSummaries(result)
    setShown(0)
    setRunning(true)
    done.current = onDone
    let n = 0
    timer.current = window.setInterval(() => {
      n += 1
      setShown(n)
      if (n >= dataset.rows.length) {
        clearInterval(timer.current)
        setRunning(false)
        done.current?.(result)
      }
    }, ROW_MS)
  }

  const reset = () => {
    clearInterval(timer.current)
    setSummaries(null)
    setShown(0)
    setRunning(false)
  }

  return { summaries, shown, running, start, reset, finished: !!summaries && !running }
}

export function SummaryKpis({ s }: { s: ModelSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <KpiCard label="Accuracy" value={formatMetric('accuracy', s.accuracy)} />
      <KpiCard label="Faithfulness" value={formatMetric('faithfulness', s.faithfulness)} />
      <KpiCard label="Relevance" value={formatMetric('relevance', s.relevance)} />
      <KpiCard label="Toxicity" value={formatMetric('toxicity', s.toxicity)} />
      <KpiCard label="Latency p50" value={`${formatInt(s.latencyP50)} ms`} />
      <KpiCard label="Latency p95" value={`${formatInt(s.latencyP95)} ms`} />
      <KpiCard label="Tokens" value={formatInt(s.tokens)} />
      <KpiCard label="Cost" value={`${s.costCredits.toFixed(3)} cr`} />
    </div>
  )
}

export function PromptTable({ results, shown }: { results: PromptResult[]; shown?: number }) {
  const visible = shown === undefined ? results : results.slice(0, shown)
  const pending = shown === undefined ? 0 : results.length - visible.length
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-bg-subtle text-left text-caption text-text-secondary">
            <tr>
              <th className="py-3 pl-5 pr-3 font-semibold">Input</th>
              <th className="px-3 py-3 font-semibold">Expected</th>
              <th className="px-3 py-3 font-semibold">Output</th>
              <th className="px-3 py-3 text-right font-semibold">Score</th>
              <th className="px-3 py-3 text-right font-semibold">Latency</th>
              <th className="px-3 py-3 text-right font-semibold">Tokens</th>
              <th className="py-3 pl-3 pr-5 font-semibold">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((r, i) => (
              <tr key={i} className="align-top">
                <td className="max-w-[240px] py-3 pl-5 pr-3 text-text-primary">{r.input}</td>
                <td className="max-w-[200px] px-3 py-3 text-text-secondary">{r.expected}</td>
                <td className={cn('max-w-[240px] px-3 py-3', r.passed ? 'text-text-primary' : 'text-text-secondary')}>{r.output}</td>
                <td className="tabular px-3 py-3 text-right" title={`Faithfulness ${r.scores.faithfulness.toFixed(2)} · Relevance ${r.scores.relevance.toFixed(2)} · Toxicity ${r.scores.toxicity.toFixed(2)}`}>
                  {r.scores.accuracy.toFixed(2)}
                </td>
                <td className="tabular px-3 py-3 text-right text-text-secondary">{formatInt(r.latencyMs)} ms</td>
                <td className="tabular px-3 py-3 text-right text-text-secondary">{formatInt(r.tokens)}</td>
                <td className="py-3 pl-3 pr-5">
                  <PassBadge passed={r.passed} label={r.passed ? 'Pass' : 'Fail'} />
                </td>
              </tr>
            ))}
            {Array.from({ length: pending }).map((_, i) => (
              <tr key={`p-${i}`}>
                <td colSpan={7} className="py-3 pl-5 text-caption text-text-muted">
                  {i === 0 ? 'Running…' : 'Waiting'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
