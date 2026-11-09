import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CheckCircle2, Download, Gauge, Play, Square, XCircle } from 'lucide-react'
import type { Environment } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import {
  ERROR_THRESHOLD_PCT,
  LOAD_TICK_MS,
  LOAD_TICKS,
  loadPoint,
  loadVerdict,
  P95_THRESHOLD_MS,
  TIER_CAPACITY,
  type LoadConfig,
  type LoadPoint,
  type LoadVerdict,
} from '@/lib/mock'
import { formatInt, formatTime } from '@/lib/format'
import { COMPUTE_TIERS, computeLabel } from '@/lib/labels'
import { axisProps, CHART_COLORS, CHART_GRID } from '@/lib/chart'
import { cn, uid } from '@/lib/utils'
import { ChartCard, ChartLegend, ChartTooltip } from '@/components/shared/ChartCard'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/controls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Phase = 'idle' | 'running' | 'done' | 'stopped'

interface HistoryRow extends LoadVerdict {
  id: string
  at: string
  vus: number
}

const DURATIONS = [1, 5, 10, 15, 30]
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function LoadTests({ env, initialConfig, onFinished }: { env: Environment; initialConfig?: LoadConfig; onFinished?: (verdict: LoadVerdict, cfg: LoadConfig) => void }) {
  const catalog = useAppStore((s) => s.catalog)
  const recordTestRun = useAppStore((s) => s.recordTestRun)
  const [cfg, setCfg] = useState<LoadConfig>(initialConfig ?? { vus: 200, rampUpSec: 60, durationMin: 5 })
  const [phase, setPhase] = useState<Phase>('idle')
  const [points, setPoints] = useState<LoadPoint[]>([])
  const [verdict, setVerdict] = useState<LoadVerdict | null>(null)
  const [ranWith, setRanWith] = useState<LoadConfig>(cfg)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const timer = useRef<number>()

  useEffect(() => () => clearInterval(timer.current), [])

  const capacity = TIER_CAPACITY[env.spec.compute]
  const totalSec = ranWith.rampUpSec + ranWith.durationMin * 60
  const latest = points[points.length - 1]
  const progress = points.length / (LOAD_TICKS + 1)

  const start = () => {
    clearInterval(timer.current)
    const run = { ...cfg }
    setRanWith(run)
    setPoints([loadPoint(run, env, catalog, 0)])
    setVerdict(null)
    setPhase('running')
    let tick = 0
    const collected: LoadPoint[] = [loadPoint(run, env, catalog, 0)]
    timer.current = window.setInterval(() => {
      tick += 1
      const p = loadPoint(run, env, catalog, tick)
      collected.push(p)
      setPoints([...collected])
      if (tick >= LOAD_TICKS) {
        clearInterval(timer.current)
        const v = loadVerdict(collected, run)
        setVerdict(v)
        setPhase('done')
        setHistory((h) => [{ id: uid('lt'), at: new Date().toISOString(), vus: run.vus, ...v }, ...h].slice(0, 6))
        onFinished?.(v, run)
        recordTestRun({
          envId: env.id,
          kind: 'load',
          summary: `Load test ${v.passed ? 'passed' : 'failed'} at ${formatInt(run.vus)} virtual users (p95 ${formatInt(v.p95)} ms)`,
          passed: v.passed,
        })
        if (v.passed) toast.success('Load test passed.', { description: `p95 latency ${formatInt(v.p95)} ms with ${formatInt(run.vus)} virtual users.` })
        else toast.error('Load test failed.', { description: 'See the result below for what went over the limits.' })
      }
    }, LOAD_TICK_MS)
  }

  const stop = () => {
    clearInterval(timer.current)
    setPhase('stopped')
    toast('Load test stopped early. No result was recorded.')
  }

  const download = () => {
    const rows = ['seconds,virtual_users,p50_ms,p95_ms,requests_per_second,error_rate_pct', ...points.map((p) => [p.t, p.vus, p.p50, p.p95, p.rps, p.errorPct].join(','))]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `load-test-${env.id}-${ranWith.vus}vu.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const nextTier = COMPUTE_TIERS[COMPUTE_TIERS.findIndex((t) => t.value === env.spec.compute) + 1]
  const xAxis = (
    <XAxis dataKey="t" type="number" domain={[0, totalSec]} {...axisProps} tickFormatter={(v: number) => clock(Math.round(v))} minTickGap={32} />
  )
  const showCharts = phase !== 'idle' && points.length > 0

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-6 p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label htmlFor="lt-vus" className="text-sm font-semibold text-text-primary">
                Virtual users
              </label>
              <span className="tabular text-sm font-semibold text-text-primary">{formatInt(cfg.vus)}</span>
            </div>
            <Slider id="lt-vus" min={10} max={2000} step={10} value={[cfg.vus]} onValueChange={([v]) => setCfg({ ...cfg, vus: v! })} disabled={phase === 'running'} aria-label="Virtual users" />
            <span className="text-caption text-text-muted">People using the service at the same time.</span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label htmlFor="lt-ramp" className="text-sm font-semibold text-text-primary">
                Ramp-up
              </label>
              <span className="tabular text-sm font-semibold text-text-primary">{cfg.rampUpSec} seconds</span>
            </div>
            <Slider id="lt-ramp" min={0} max={300} step={10} value={[cfg.rampUpSec]} onValueChange={([v]) => setCfg({ ...cfg, rampUpSec: v! })} disabled={phase === 'running'} aria-label="Ramp-up in seconds" />
            <span className="text-caption text-text-muted">Time to go from zero to all users.</span>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="lt-duration" className="text-sm font-semibold text-text-primary">
              Duration at full load
            </label>
            <Select value={String(cfg.durationMin)} onValueChange={(v) => setCfg({ ...cfg, durationMin: Number(v) })} disabled={phase === 'running'}>
              <SelectTrigger id="lt-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} minute{d > 1 ? 's' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-border pt-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="eyebrow">Target</p>
            <code className="truncate font-mono text-caption text-text-primary">POST {env.endpoint}/chat/completions</code>
            <div className="flex flex-wrap gap-1.5">
              <Tag>Pass if p95 latency is under {formatInt(P95_THRESHOLD_MS)} ms</Tag>
              <Tag>and errors stay under {ERROR_THRESHOLD_PCT}%</Tag>
            </div>
            <p className="text-caption text-text-muted">
              This setup ({computeLabel(env.spec.compute)}) handles about {formatInt(capacity)} requests a second.
            </p>
          </div>
          {phase === 'running' ? (
            <Button variant="secondary" onClick={stop}>
              <Square /> Stop test
            </Button>
          ) : (
            <Button onClick={start}>
              <Play /> {phase === 'idle' ? 'Run load test' : 'Run again'}
            </Button>
          )}
        </div>
      </section>

      {phase === 'idle' && (
        <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-text">
            <Gauge className="size-7" aria-hidden />
          </span>
          <p className="font-heading text-h3 text-text-primary">Find your limits before the field does</p>
          <p className="max-w-md text-sm text-text-secondary">
            Run a test to see latency, throughput and errors as users ramp up. The test is sped up to about 15 seconds.
          </p>
        </div>
      )}

      {showCharts && (
        <>
          <div className="card flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 font-semibold text-text-primary">
                {phase === 'running' && <StatusBadge status="provisioning" label="Running" />}
                {phase === 'stopped' && <StatusBadge status="stopped" label="Stopped early" />}
                {phase === 'done' && verdict && (verdict.passed ? <StatusBadge status="active" label="Passed" /> : <StatusBadge status="rejected" label="Failed" />)}
                {formatInt(ranWith.vus)} virtual users
              </span>
              <span className="tabular text-caption text-text-secondary">
                Simulated {clock(latest?.t ?? 0)} of {clock(totalSec)} · sped up to 15 seconds
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-subtle" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Test progress">
              <div className="h-full rounded-full bg-indigo transition-[width] duration-500 dark:bg-indigo-text" style={{ width: `${Math.min(progress, 1) * 100}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {(
              [
                ['Active users', latest ? formatInt(latest.vus) : '—', false],
                ['p95 latency', latest ? `${formatInt(latest.p95)} ms` : '—', !!latest && latest.p95 >= P95_THRESHOLD_MS],
                ['Throughput', latest ? `${formatInt(latest.rps)} req/s` : '—', false],
                ['Error rate', latest ? `${latest.errorPct.toFixed(2)}%` : '—', !!latest && latest.errorPct >= ERROR_THRESHOLD_PCT],
              ] as const
            ).map(([label, value, bad]) => (
              <div key={label} className={cn('card p-5', bad && 'border-vermilion')}>
                <p className="eyebrow">{label}</p>
                <p className={cn('tabular mt-2 font-heading text-h2', bad ? 'text-status-over-fg' : 'text-text-primary')}>{value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ChartCard
              title="Latency"
              description="p50 and p95 response time"
              height={240}
              className="xl:col-span-2"
              actions={
                <ChartLegend
                  items={[
                    { label: 'p50', color: CHART_COLORS[0]! },
                    { label: 'p95', color: CHART_COLORS[2]! },
                    { label: 'Limit', color: 'rgb(var(--red))' },
                  ]}
                />
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  {xAxis}
                  <YAxis {...axisProps} width={52} tickFormatter={(v) => `${formatInt(v)}`} />
                  <Tooltip content={<ChartTooltip labelFormatter={(l) => clock(Number(l))} valueFormatter={(v) => `${formatInt(v)} ms`} />} />
                  <ReferenceLine y={P95_THRESHOLD_MS} stroke="rgb(var(--red))" strokeDasharray="6 4" />
                  <Line type="monotone" dataKey="p50" name="p50" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="p95" name="p95" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Throughput" description="Requests per second and active users" height={220}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  {xAxis}
                  <YAxis {...axisProps} width={52} />
                  <Tooltip content={<ChartTooltip labelFormatter={(l) => clock(Number(l))} />} />
                  <Area type="monotone" dataKey="rps" name="Requests / s" stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
                  <Line type="monotone" dataKey="vus" name="Active users" stroke={CHART_COLORS[3]} strokeWidth={2} dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Error rate" description="Share of requests that failed" height={220}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  {xAxis}
                  <YAxis {...axisProps} width={52} tickFormatter={(v) => `${v}%`} domain={[0, (max: number) => Math.max(2, Math.ceil(max))]} />
                  <Tooltip content={<ChartTooltip labelFormatter={(l) => clock(Number(l))} valueFormatter={(v) => `${v.toFixed(2)}%`} />} />
                  <ReferenceLine y={ERROR_THRESHOLD_PCT} stroke="rgb(var(--red))" strokeDasharray="6 4" />
                  <Line type="monotone" dataKey="errorPct" name="Errors" stroke={CHART_COLORS[4]} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}

      {phase === 'done' && verdict && (
        <section className={cn('card border-l-4 p-6', verdict.passed ? 'border-l-teal' : 'border-l-red')}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="eyebrow">Result</p>
              <h3 className="mt-1 font-heading text-h2 text-text-primary">
                {verdict.passed ? `Passed at ${formatInt(ranWith.vus)} virtual users` : `Failed at ${formatInt(ranWith.vus)} virtual users`}
              </h3>
              <ul className="mt-4 flex flex-col gap-2 text-sm">
                <li className="flex items-center gap-2 text-text-primary">
                  {verdict.p95 < P95_THRESHOLD_MS ? <CheckCircle2 className="size-4 text-teal" aria-hidden /> : <XCircle className="size-4 text-red-text" aria-hidden />}
                  p95 latency was {formatInt(verdict.p95)} ms (limit {formatInt(P95_THRESHOLD_MS)} ms)
                </li>
                <li className="flex items-center gap-2 text-text-primary">
                  {verdict.errorPct < ERROR_THRESHOLD_PCT ? <CheckCircle2 className="size-4 text-teal" aria-hidden /> : <XCircle className="size-4 text-red-text" aria-hidden />}
                  Error rate was {verdict.errorPct.toFixed(2)}% (limit {ERROR_THRESHOLD_PCT}%)
                </li>
                <li className="flex items-center gap-2 text-text-secondary">Peak throughput: {formatInt(verdict.peakRps)} requests a second</li>
              </ul>
              {!verdict.passed && (
                <p className="mt-4 max-w-2xl rounded-control bg-status-over-bg px-3 py-2.5 text-sm text-status-over-fg">
                  This setup tops out near {formatInt(capacity)} requests a second. Try about {formatInt(Math.floor((capacity * 0.75) / 0.8 / 10) * 10)} virtual users,
                  {nextTier ? ` or request a change to ${nextTier.label} for more headroom.` : ' or spread the load across two environments.'}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="secondary" onClick={download}>
                <Download /> Download CSV
              </Button>
              {!verdict.passed && nextTier && (
                <Button asChild variant="secondary">
                  <Link to={`/app/environments/${env.id}/edit`}>Request {nextTier.label}</Link>
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className="card p-6">
          <h3 className="mb-4 font-heading text-h3 text-text-primary">Runs this session</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-caption text-text-secondary">
                <tr>
                  <th scope="col" className="pb-2 font-semibold">Time</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Users</th>
                  <th scope="col" className="pb-2 text-right font-semibold">p95</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Errors</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Peak req/s</th>
                  <th scope="col" className="pb-2 pl-4 font-semibold">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((h) => (
                  <tr key={h.id} className="h-11">
                    <td className="text-text-secondary">{formatTime(h.at)}</td>
                    <td className="tabular text-right">{formatInt(h.vus)}</td>
                    <td className="tabular text-right">{formatInt(h.p95)} ms</td>
                    <td className="tabular text-right">{h.errorPct.toFixed(2)}%</td>
                    <td className="tabular text-right">{formatInt(h.peakRps)}</td>
                    <td className="pl-4">{h.passed ? <StatusBadge status="active" label="Passed" /> : <StatusBadge status="rejected" label="Failed" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
