import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Download, Info } from 'lucide-react'
import type { CatalogItem, Environment } from '@/data/types'
import { LIVE_INTERVAL_MS, RANGES, seriesFor, toCsv, downloadText, type MetricPoint, type Range } from '@/lib/metrics'
import { axisProps, CHART_COLORS, CHART_GRID } from '@/lib/chart'
import { formatCompact, formatInt, formatShortDate, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ChartCard, ChartTooltip } from './ChartCard'
import { StatusBadge, Tag } from './StatusBadge'
import { Button } from '@/components/ui/button'

export function RangePicker({ value, onChange, disabled }: { value: Range; onChange: (r: Range) => void; disabled?: boolean }) {
  return (
    <div className="flex w-fit rounded-control border border-border bg-bg-surface p-0.5" role="group" aria-label="Time range">
      {(Object.keys(RANGES) as Range[]).map((r) => (
        <button
          key={r}
          type="button"
          disabled={disabled}
          aria-pressed={value === r}
          onClick={() => onChange(r)}
          className={cn(
            'rounded-[8px] px-3 py-1 text-caption font-semibold disabled:cursor-not-allowed disabled:opacity-50',
            value === r ? 'bg-indigo-50 text-indigo-text' : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

const levelClass = (pct: number) => (pct > 95 ? 'border-vermilion' : pct > 80 ? 'border-tangerine' : '')
const levelText = (pct: number) => (pct > 95 ? 'text-status-over-fg' : pct > 80 ? 'text-status-pending-fg' : 'text-text-primary')

function Tile({ label, value, sub, pct, trend }: { label: string; value: string; sub?: string; pct?: number; trend?: number }) {
  return (
    <div className={cn('card flex flex-col gap-1 border-2 p-4', pct !== undefined ? levelClass(pct) || 'border-border' : 'border-border')}>
      <span className="eyebrow">{label}</span>
      <span className={cn('tabular font-heading text-h2', pct !== undefined ? levelText(pct) : 'text-text-primary')}>{value}</span>
      <span className="flex items-center gap-1 text-caption text-text-secondary">
        {trend !== undefined && Math.abs(trend) >= 0.5 && (trend > 0 ? <ArrowUpRight className="size-3.5 text-teal" aria-hidden /> : <ArrowDownRight className="size-3.5 text-vermilion" aria-hidden />)}
        {sub}
      </span>
    </div>
  )
}

export function useMonitoringSeries(env: Environment, catalog: CatalogItem[], range: Range) {
  const live = env.status === 'active'
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setNow(Date.now()), LIVE_INTERVAL_MS)
    return () => clearInterval(t)
  }, [live])
  return useMemo(() => seriesFor(env, catalog, range, now), [env, catalog, range, now])
}

export function MonitoringPanel({ env, catalog }: { env: Environment; catalog: CatalogItem[] }) {
  const live = env.status === 'active'
  const [range, setRange] = useState<Range>(live ? '1h' : '7d')
  const effective: Range = live ? range : '7d'
  const series = useMonitoringSeries(env, catalog, effective)
  const cur = series[series.length - 1]!
  const prev = series[Math.max(0, series.length - 7)]!
  const hasGpu = cur.gpuMemAlloc > 0
  const models = env.spec.llms.map((l) => ({ id: l.id, name: catalog.find((c) => c.id === l.id)?.name ?? l.id }))
  const short = effective === '1h' || effective === '24h'
  const tick = (t: number) => (short ? formatTime(new Date(t)) : formatShortDate(new Date(t)))
  const rows = useMemo(
    () =>
      series.map((p) => ({
        ...p,
        ...Object.fromEntries(models.map((m) => [`tok_${m.id}`, (p.tokens[m.id]?.in ?? 0) + (p.tokens[m.id]?.out ?? 0)])),
      })),
    [series, models],
  )
  const sum = (k: keyof MetricPoint) => series.reduce((s, p) => s + (p[k] as number), 0)
  const tokenTotals = models.map((m) => ({
    ...m,
    in: series.reduce((s, p) => s + (p.tokens[m.id]?.in ?? 0), 0),
    out: series.reduce((s, p) => s + (p.tokens[m.id]?.out ?? 0), 0),
  }))
  const ramPct = cur.ramAlloc ? (cur.ramUsed / cur.ramAlloc) * 100 : 0
  const gpuMemPct = cur.gpuMemAlloc ? (cur.gpuMemUsed / cur.gpuMemAlloc) * 100 : 0
  const storagePct = cur.storageAlloc ? (cur.storageUsed / cur.storageAlloc) * 100 : 0
  const xAxis = <XAxis dataKey="t" {...axisProps} tickFormatter={tick} minTickGap={36} />
  const labelFmt = (l: string) => (short ? formatTime(new Date(Number(l))) : `${formatShortDate(new Date(Number(l)))}, ${formatTime(new Date(Number(l)))}`)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {live ? <StatusBadge status="active" label="Live · updates every 5 s" /> : <StatusBadge status={env.status} />}
          <Tag>Simulated data</Tag>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangePicker value={effective} onChange={setRange} disabled={!live} />
          <Button
            variant="secondary"
            size="compact"
            onClick={() => downloadText(`metrics-${env.id}-${effective}.csv`, toCsv(env, series, catalog))}
          >
            <Download /> Export CSV
          </Button>
        </div>
      </div>

      {!live && (
        <div className="flex items-center gap-2.5 rounded-card bg-status-stopped-bg px-4 py-3 text-sm text-status-stopped-fg">
          <Info className="size-4 shrink-0" aria-hidden /> No live data — showing last 7 days.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Tile label="CPU" value={`${Math.round(cur.cpu)}%`} pct={cur.cpu} trend={cur.cpu - prev.cpu} sub={live ? 'now' : 'at stop'} />
        <Tile label="RAM" value={`${cur.ramUsed} GB`} pct={ramPct} sub={`of ${cur.ramAlloc} GB`} trend={cur.ramUsed - prev.ramUsed} />
        {hasGpu && <Tile label="GPU" value={`${Math.round(cur.gpu)}%`} pct={cur.gpu} trend={cur.gpu - prev.gpu} sub={`${cur.gpuMemUsed} of ${cur.gpuMemAlloc} GB memory`} />}
        <Tile label="Storage" value={`${formatInt(cur.storageUsed)} GB`} pct={storagePct} sub={`of ${formatInt(cur.storageAlloc)} GB`} />
        <Tile label="Network" value={`${cur.netIn} MB/s`} sub={`in · ${cur.netOut} MB/s out`} trend={cur.netIn - prev.netIn} />
        <Tile label="API calls" value={formatCompact(sum('apiCalls'))} sub={`${formatInt(sum('errors'))} errors in ${RANGES[effective].label}`} />
        <Tile label="Estimated cost" value={`${formatInt(sum('cost'))}`} sub={`credits in ${RANGES[effective].label}`} />
        {hasGpu && <Tile label="GPU memory" value={`${Math.round(gpuMemPct)}%`} pct={gpuMemPct} sub={`${cur.gpuMemUsed} of ${cur.gpuMemAlloc} GB`} />}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard title="CPU and GPU" description="Utilisation, %. Simulated data" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              {xAxis}
              <YAxis {...axisProps} domain={[0, 100]} width={40} />
              <Tooltip content={<ChartTooltip labelFormatter={labelFmt} valueFormatter={(v) => `${v.toFixed(1)}%`} />} />
              <Line type="monotone" dataKey="cpu" name="CPU" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
              {hasGpu && <Line type="monotone" dataKey="gpu" name="GPU" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} isAnimationActive={false} />}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Memory" description="RAM and GPU memory used, GB. Simulated data" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              {xAxis}
              <YAxis {...axisProps} width={40} />
              <Tooltip content={<ChartTooltip labelFormatter={labelFmt} valueFormatter={(v) => `${v} GB`} />} />
              <Area type="monotone" dataKey="ramUsed" name="RAM used" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.12} strokeWidth={2} isAnimationActive={false} />
              {hasGpu && <Area type="monotone" dataKey="gpuMemUsed" name="GPU memory used" stroke={CHART_COLORS[3]} fill={CHART_COLORS[3]} fillOpacity={0.12} strokeWidth={2} isAnimationActive={false} />}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Token usage by model" description="Input + output tokens per step. Simulated data" height={240} className="xl:col-span-2">
          {models.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-text-secondary">No language models in this environment.</p>
          ) : (
            <div className="flex h-full flex-col gap-3">
              <ul className="flex flex-wrap gap-x-5 gap-y-1">
                {tokenTotals.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-1.5 text-caption text-text-secondary">
                    <span className="size-2.5 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} aria-hidden />
                    <span className="font-semibold text-text-primary">{m.name}</span> {formatCompact(m.in)} in · {formatCompact(m.out)} out
                  </li>
                ))}
              </ul>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rows} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_GRID} vertical={false} />
                    {xAxis}
                    <YAxis {...axisProps} width={48} tickFormatter={(v) => formatCompact(v)} />
                    <Tooltip content={<ChartTooltip labelFormatter={labelFmt} />} />
                    {models.map((m, i) => (
                      <Area key={m.id} type="monotone" stackId="tok" dataKey={`tok_${m.id}`} name={m.name} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.2} strokeWidth={2} isAnimationActive={false} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard title="API calls and errors" description="Per step. Simulated data" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              {xAxis}
              <YAxis {...axisProps} width={48} tickFormatter={(v) => formatCompact(v)} />
              <Tooltip content={<ChartTooltip labelFormatter={labelFmt} />} />
              <Bar dataKey="apiCalls" name="API calls" fill={CHART_COLORS[1]} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              <Line type="monotone" dataKey="errors" name="Errors" stroke={CHART_COLORS[4]} strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Network" description="MB/s in and out. Simulated data" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              {xAxis}
              <YAxis {...axisProps} width={40} />
              <Tooltip content={<ChartTooltip labelFormatter={labelFmt} valueFormatter={(v) => `${v} MB/s`} />} />
              <Line type="monotone" dataKey="netIn" name="In" stroke={CHART_COLORS[3]} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="netOut" name="Out" stroke={CHART_COLORS[5]} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Storage" description="GB used. Simulated data" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              {xAxis}
              <YAxis {...axisProps} width={48} domain={[0, cur.storageAlloc]} />
              <Tooltip content={<ChartTooltip labelFormatter={labelFmt} valueFormatter={(v) => `${formatInt(v)} GB`} />} />
              <Area type="monotone" dataKey="storageUsed" name="Storage used" stroke={CHART_COLORS[5]} fill={CHART_COLORS[5]} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Estimated cost" description="Credits per step. Simulated data" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              {xAxis}
              <YAxis {...axisProps} width={40} />
              <Tooltip content={<ChartTooltip labelFormatter={labelFmt} valueFormatter={(v) => `${v.toFixed(2)} credits`} />} />
              <Area type="monotone" dataKey="cost" name="Estimated cost" stroke={CHART_COLORS[6]} fill={CHART_COLORS[6]} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
