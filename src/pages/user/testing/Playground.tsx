import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Heart, Play, Plus, X } from 'lucide-react'
import type { Environment } from '@/data/types'
import { PLAYGROUND_PROMPTS } from '@/data/seed'
import { useAppStore } from '@/store/useAppStore'
import { runPlayground, type LlmResult } from '@/lib/mock'
import { formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/input'
import { Slider } from '@/components/ui/controls'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { AsrCompare } from './AsrCompare'

const MAX_WAIT_MS = 2400

function StreamedText({ text, delayMs, onDone }: { text: string; delayMs: number; onDone: () => void }) {
  const [shown, setShown] = useState(0)
  const [started, setStarted] = useState(false)
  const done = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const start = setTimeout(() => setStarted(true), delayMs)
    return () => clearTimeout(start)
  }, [delayMs])

  useEffect(() => {
    if (!started) return
    const total = Array.from(text).length
    const step = Math.max(2, Math.ceil(total / 60))
    let n = 0
    const t = setInterval(() => {
      n = Math.min(n + step, total)
      setShown(n)
      if (n >= total && !done.current) {
        done.current = true
        clearInterval(t)
        onDoneRef.current()
      }
    }, 30)
    return () => clearInterval(t)
  }, [started, text])

  if (!started)
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/5" />
        <span className="text-caption text-text-muted">Waiting for the first token…</span>
      </div>
    )
  return (
    <p className="whitespace-pre-line text-sm leading-6 text-text-primary">
      {Array.from(text).slice(0, shown).join('')}
      {shown < Array.from(text).length && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo align-middle" aria-hidden />}
    </p>
  )
}

function LlmCompare({ env }: { env: Environment }) {
  const catalog = useAppStore((s) => s.catalog)
  const providers = useAppStore((s) => s.providers)
  const llms = catalog.filter((c) => c.category === 'llm' && c.status !== 'deprecated')
  const envIds = env.spec.llms.map((l) => l.id)
  const initial = [...envIds, ...['llm-sarvam', 'llm-llama', 'llm-gpt'].filter((id) => !envIds.includes(id))].slice(0, Math.max(2, Math.min(3, envIds.length)))
  const [models, setModels] = useState<string[]>(initial)
  const [prompt, setPrompt] = useState(PLAYGROUND_PROMPTS[0]!.prompt)
  const [temperature, setTemperature] = useState(0.3)
  const [results, setResults] = useState<LlmResult[] | null>(null)
  const [runId, setRunId] = useState(0)
  const [finished, setFinished] = useState<Set<string>>(new Set())
  const [preferred, setPreferred] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const disabledProvider = (id: string) => providers.find((p) => p.serves.includes(id) && !p.enabled)

  const run = () => {
    if (models.length < 2) return setError('Pick at least two models to compare.')
    if (!prompt.trim()) return setError('Write a prompt, or pick one of the samples.')
    const off = models.map((m) => disabledProvider(m)).find(Boolean)
    if (off) return setError(`${off.name} is disabled by your admin, so its models can’t answer right now. Remove that model to continue.`)
    setError(null)
    setPreferred(null)
    setFinished(new Set())
    setResults(runPlayground(prompt, models.map((id) => catalog.find((c) => c.id === id)!), providers))
    setRunId((n) => n + 1)
  }

  const fastest = results && finished.size === results.length ? results.reduce((a, b) => (a.latencyMs <= b.latencyMs ? a : b)).modelId : null
  const cheapest = results && finished.size === results.length ? results.reduce((a, b) => (a.cost <= b.cost ? a : b)).modelId : null
  const running = !!results && finished.size < results.length

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-5 p-6">
        <Field label="Models to compare" helper="Two or three. Models attached to this environment are listed first.">
          <div className="flex flex-wrap items-center gap-2">
            {models.map((id) => {
              const item = catalog.find((c) => c.id === id)!
              return (
                <span key={id} className="flex h-9 items-center gap-2 rounded-full border border-indigo bg-indigo-50 pl-3.5 pr-1 text-sm font-semibold text-indigo-text dark:border-indigo-text">
                  {item.name}
                  <button
                    type="button"
                    onClick={() => setModels(models.filter((m) => m !== id))}
                    className="rounded-full p-1 hover:bg-bg-surface"
                    aria-label={`Remove ${item.name}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              )
            })}
            {models.length < 3 && (
              <Select value="" onValueChange={(v) => setModels([...models, v])}>
                <SelectTrigger className="h-9 w-auto rounded-full border-dashed" aria-label="Add a model">
                  <span className="flex items-center gap-1.5 text-text-secondary">
                    <Plus className="size-4" /> Add model
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {llms
                    .filter((m) => !models.includes(m.id))
                    .sort((a, b) => Number(envIds.includes(b.id)) - Number(envIds.includes(a.id)))
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                        {envIds.includes(m.id) ? ' · in this environment' : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </Field>

        <div>
          <p className="mb-2 text-sm font-semibold text-text-primary">Sample prompts</p>
          <div className="flex flex-wrap gap-2">
            {PLAYGROUND_PROMPTS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={prompt === p.prompt}
                onClick={() => setPrompt(p.prompt)}
                className={cn(
                  'h-8 rounded-full border px-3 text-caption font-semibold transition-colors',
                  prompt === p.prompt ? 'border-indigo bg-indigo-50 text-indigo-text dark:border-indigo-text' : 'border-border-strong text-text-secondary hover:bg-bg-subtle',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Prompt" htmlFor="pg-prompt" error={error}>
          <Textarea id="pg-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-[96px]" />
        </Field>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex w-full max-w-xs flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="pg-temp" className="text-sm font-semibold text-text-primary">
                Temperature
              </label>
              <span className="tabular text-sm text-text-secondary">{temperature.toFixed(1)}</span>
            </div>
            <Slider id="pg-temp" min={0} max={1} step={0.1} value={[temperature]} onValueChange={([v]) => setTemperature(v!)} aria-label="Temperature" />
            <span className="text-caption text-text-muted">Lower gives steadier answers; higher gives more varied ones.</span>
          </div>
          <Button onClick={run} disabled={running}>
            <Play /> {running ? 'Comparing…' : 'Run comparison'}
          </Button>
        </div>
      </section>

      {results && (
        <div className={cn('grid grid-cols-1 gap-4', results.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3')}>
          {results.map((r) => {
            const item = catalog.find((c) => c.id === r.modelId)!
            const done = finished.has(r.modelId)
            return (
              <article
                key={`${runId}-${r.modelId}`}
                className={cn('card flex flex-col gap-4 p-5', preferred === r.modelId && 'border-2 border-indigo p-[19px] dark:border-indigo-text')}
              >
                <header className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-heading text-h3 text-text-primary">{item.name}</h3>
                    <p className="text-caption text-text-muted">
                      {item.provider} · {item.hosting === 'hosted' ? 'Hosted API' : 'Open source'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {fastest === r.modelId && <StatusBadge status="running" label="Fastest" />}
                    {cheapest === r.modelId && <StatusBadge status="approved" label="Lowest cost" />}
                  </div>
                </header>
                <div className="min-h-[120px] flex-1">
                  <StreamedText
                    text={r.text}
                    delayMs={Math.min(r.latencyMs, MAX_WAIT_MS)}
                    onDone={() => setFinished((s) => new Set(s).add(r.modelId))}
                  />
                </div>
                <dl className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-caption">
                  <div>
                    <dt className="text-text-muted">Latency</dt>
                    <dd className="tabular font-semibold text-text-primary">{done ? `${formatInt(r.latencyMs)} ms` : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Tokens in / out</dt>
                    <dd className="tabular font-semibold text-text-primary">{done ? `${r.inputTokens} / ${r.outputTokens}` : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Cost</dt>
                    <dd className="tabular font-semibold text-text-primary">{done ? `${r.cost.toFixed(3)} credits` : '—'}</dd>
                  </div>
                </dl>
                <Button
                  variant="ghost"
                  size="compact"
                  disabled={!done}
                  className={cn('self-start', preferred === r.modelId && 'text-indigo-text')}
                  onClick={() => {
                    setPreferred(r.modelId)
                    toast.success(`Noted: you preferred ${item.name}.`, { description: 'Preferences are saved with the run so your team can compare later.' })
                  }}
                >
                  <Heart className={cn(preferred === r.modelId && 'fill-current')} /> {preferred === r.modelId ? 'Preferred' : 'Prefer this answer'}
                </Button>
              </article>
            )
          })}
        </div>
      )}

      {results && !running && (
        <p className="text-caption text-text-muted">
          Responses are simulated. Latency and cost use each provider’s recent averages, so they’re a fair guide for comparing models. Temperature {temperature.toFixed(1)}.
        </p>
      )}
    </div>
  )
}

export function Playground({ env }: { env: Environment }) {
  const [mode, setMode] = useState<'llm' | 'asr'>('llm')
  return (
    <div className="flex flex-col gap-5">
      <div className="flex w-fit rounded-control border border-border bg-bg-surface p-0.5" role="group" aria-label="Playground mode">
        {(
          [
            ['llm', 'Language models'],
            ['asr', 'Speech recognition'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={mode === v}
            onClick={() => setMode(v)}
            className={cn('rounded-[8px] px-3.5 py-1.5 text-sm font-semibold', mode === v ? 'bg-indigo-50 text-indigo-text' : 'text-text-secondary hover:text-text-primary')}
          >
            {label}
          </button>
        ))}
        {env.spec.asr.length === 0 && mode === 'asr' && <Tag className="ml-2 self-center">Not in this environment</Tag>}
      </div>
      <div className={cn(mode !== 'llm' && 'hidden')}>
        <LlmCompare env={env} />
      </div>
      <div className={cn(mode !== 'asr' && 'hidden')}>
        <AsrCompare env={env} />
      </div>
    </div>
  )
}
