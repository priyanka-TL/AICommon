import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { BrainCircuit, CheckCircle2, Loader2, Play, Plus, RotateCcw, Trash2, XCircle } from 'lucide-react'
import type { Environment } from '@/data/types'
import { DEFAULT_TEST_CASES, type TestCaseSeed } from '@/data/seed'
import { useAppStore } from '@/store/useAppStore'
import { runTestCase, type TestOutcome } from '@/lib/mock'
import { formatInt, formatTime } from '@/lib/format'
import { cn, uid } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Case extends TestCaseSeed {
  id: string
}

interface Run {
  id: string
  at: string
  modelName: string
  passed: number
  total: number
}

const MATCH_LABELS: Record<TestCaseSeed['match'], string> = {
  contains: 'Contains',
  exact: 'Exact match',
  similar: 'Similar meaning',
}

const toCases = (seeds: TestCaseSeed[]): Case[] => seeds.map((c) => ({ ...c, id: uid('tc') }))

export interface FunctionalRun {
  modelId: string
  cases: TestCaseSeed[]
  outcomes: TestOutcome[]
}

export function FunctionalTests({ env, initialCases, onFinished }: { env: Environment; initialCases?: TestCaseSeed[]; onFinished?: (run: FunctionalRun) => void }) {
  const fresh = () => toCases(initialCases ?? DEFAULT_TEST_CASES)
  const catalog = useAppStore((s) => s.catalog)
  const providers = useAppStore((s) => s.providers)
  const recordTestRun = useAppStore((s) => s.recordTestRun)
  const models = env.spec.llms.map((l) => catalog.find((c) => c.id === l.id)!).filter(Boolean)
  const [modelId, setModelId] = useState(models[0]?.id ?? '')
  const [cases, setCases] = useState<Case[]>(fresh)
  const [results, setResults] = useState<Record<string, TestOutcome>>({})
  const [runningIds, setRunningIds] = useState<string[]>([])
  const [invalid, setInvalid] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<Run[]>([])
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  if (models.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={BrainCircuit}
          title="This environment has no language model"
          description="Functional tests check a model’s answers. Add a model from the catalog, or pick another environment above."
        />
      </div>
    )
  }

  const model = catalog.find((c) => c.id === modelId)!
  const running = runningIds.length > 0
  const done = cases.filter((c) => results[c.id])
  const passed = done.filter((c) => results[c.id]!.passed).length
  const avgLatency = done.length ? done.reduce((s, c) => s + results[c.id]!.latencyMs, 0) / done.length : 0

  const update = (id: string, patch: Partial<Case>) => {
    setCases((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    setInvalid((s) => {
      const n = new Set(s)
      n.delete(id)
      return n
    })
    setResults((r) => {
      const n = { ...r }
      delete n[id]
      return n
    })
  }

  const run = () => {
    const bad = new Set(cases.filter((c) => !c.input.trim() || !c.expected.trim()).map((c) => c.id))
    setInvalid(bad)
    if (bad.size) {
      toast.error(`${bad.size} test case${bad.size > 1 ? 's need' : ' needs'} an input and an expected output.`)
      return
    }
    if (!cases.length) return
    setResults({})
    const ids = cases.map((c) => c.id)
    setRunningIds(ids)
    const outcomes: Record<string, TestOutcome> = {}
    cases.forEach((c, i) => {
      const t = window.setTimeout(() => {
        const o = runTestCase(c, model, providers)
        outcomes[c.id] = o
        setResults((r) => ({ ...r, [c.id]: o }))
        setRunningIds((r) => r.filter((x) => x !== c.id))
        if (i === cases.length - 1) {
          const p = Object.values(outcomes).filter((x) => x.passed).length
          setHistory((h) => [{ id: uid('run'), at: new Date().toISOString(), modelName: model.name, passed: p, total: cases.length }, ...h].slice(0, 5))
          onFinished?.({ modelId: model.id, cases: cases.map(({ input, expected, match }) => ({ input, expected, match })), outcomes: cases.map((x) => outcomes[x.id]!) })
          recordTestRun({ envId: env.id, kind: 'functional', summary: `Ran ${cases.length} functional tests with ${model.name}: ${p} of ${cases.length} passed`, passed: p === cases.length })
          if (p === cases.length) toast.success(`All ${p} tests passed.`)
          else toast.warning(`${p} of ${cases.length} tests passed.`, { description: 'Open the failed rows to see what the model returned.' })
        }
      }, 450 * (i + 1))
      timers.current.push(t)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex w-full max-w-xs flex-col gap-1.5">
            <label className="text-sm font-semibold text-text-primary" htmlFor="ft-model">
              Model under test
            </label>
            <Select value={modelId} onValueChange={(v) => { setModelId(v); setResults({}) }}>
              <SelectTrigger id="ft-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => { setCases(fresh()); setResults({}); setInvalid(new Set()) }} disabled={running}>
              <RotateCcw /> Reset examples
            </Button>
            <Button onClick={run} disabled={running || !cases.length}>
              {running ? <Loader2 className="animate-spin" /> : <Play />}
              {running ? `Running ${cases.length - runningIds.length + 1} of ${cases.length}…` : `Run ${cases.length} test${cases.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>

        {done.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-card bg-bg-subtle p-4">
              <p className="eyebrow">Passed</p>
              <p className="tabular mt-1 font-heading text-h2 text-text-primary">
                {passed} / {done.length}
              </p>
            </div>
            <div className="rounded-card bg-bg-subtle p-4">
              <p className="eyebrow">Pass rate</p>
              <p className="tabular mt-1 font-heading text-h2 text-text-primary">{Math.round((passed / done.length) * 100)}%</p>
            </div>
            <div className="rounded-card bg-bg-subtle p-4">
              <p className="eyebrow">Avg latency</p>
              <p className="tabular mt-1 font-heading text-h2 text-text-primary">{formatInt(avgLatency)} ms</p>
            </div>
          </div>
        )}

        <ol className="flex flex-col gap-3">
          {cases.map((c, i) => {
            const r = results[c.id]
            const isRunning = runningIds.includes(c.id)
            const bad = invalid.has(c.id)
            return (
              <li
                key={c.id}
                className={cn(
                  'rounded-card border p-4',
                  bad ? 'border-red' : 'border-border',
                  r && (r.passed ? 'border-l-4 border-l-teal' : 'border-l-4 border-l-red'),
                )}
              >
                <div className="grid gap-3 lg:grid-cols-[28px_minmax(0,1.3fr)_minmax(0,1fr)_170px_40px] lg:items-start">
                  <span className="tabular hidden pt-2 text-caption font-semibold text-text-muted lg:block">{i + 1}</span>
                  <div className="flex flex-col gap-1">
                    <label className="text-caption font-semibold text-text-secondary lg:sr-only" htmlFor={`in-${c.id}`}>
                      Input {i + 1}
                    </label>
                    <Textarea id={`in-${c.id}`} value={c.input} onChange={(e) => update(c.id, { input: e.target.value })} placeholder="What a person would ask" className="min-h-[40px]" rows={1} aria-invalid={bad && !c.input.trim()} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-caption font-semibold text-text-secondary lg:sr-only" htmlFor={`ex-${c.id}`}>
                      Expected output
                    </label>
                    <Input id={`ex-${c.id}`} value={c.expected} onChange={(e) => update(c.id, { expected: e.target.value })} placeholder="Expected answer" aria-invalid={bad && !c.expected.trim()} />
                  </div>
                  <Select value={c.match} onValueChange={(v) => update(c.id, { match: v as Case['match'] })}>
                    <SelectTrigger aria-label={`Check type for test ${i + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MATCH_LABELS) as Case['match'][]).map((m) => (
                        <SelectItem key={m} value={m}>
                          {MATCH_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => setCases(cases.filter((x) => x.id !== c.id))} aria-label={`Delete test ${i + 1}`} disabled={running}>
                    <Trash2 />
                  </Button>
                </div>
                {bad && <p className="mt-2 text-caption text-red-text">Add both an input and an expected output.</p>}
                {(isRunning || r) && (
                  <div className="mt-3 flex flex-col gap-2 rounded-control bg-bg-subtle p-3 lg:ml-10">
                    {isRunning && !r ? (
                      <span className="flex items-center gap-2 text-caption text-text-secondary">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Waiting for {model.name}…
                      </span>
                    ) : r ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          {r.passed ? <StatusBadge status="active" label="Passed" /> : <StatusBadge status="rejected" label="Failed" />}
                          <span className="text-caption text-text-secondary">{r.reason}</span>
                          <span className="tabular ml-auto text-caption text-text-muted">{formatInt(r.latencyMs)} ms</span>
                        </div>
                        <p className="text-sm text-text-primary">
                          <span className="text-text-muted">Output: </span>
                          {r.output}
                        </p>
                      </>
                    ) : null}
                  </div>
                )}
              </li>
            )
          })}
        </ol>

        <Button
          variant="secondary"
          className="self-start"
          disabled={running}
          onClick={() => setCases([...cases, { id: uid('tc'), input: '', expected: '', match: 'contains' }])}
        >
          <Plus /> Add test case
        </Button>
      </section>

      {history.length > 0 && (
        <section className="card p-6">
          <h3 className="mb-4 font-heading text-h3 text-text-primary">Recent runs</h3>
          <ul className="divide-y divide-border">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                {h.passed === h.total ? <CheckCircle2 className="size-4 text-teal" aria-hidden /> : <XCircle className="size-4 text-red-text" aria-hidden />}
                <span className="text-sm font-semibold text-text-primary">{h.modelName}</span>
                <span className="tabular text-sm text-text-secondary">
                  {h.passed} of {h.total} passed
                </span>
                <span className="ml-auto text-caption text-text-muted">{formatTime(h.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
