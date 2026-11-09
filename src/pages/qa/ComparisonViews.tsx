import { Check } from 'lucide-react'
import { CartesianGrid, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import type { CatalogItem, ModelSummary, QaMetric } from '@/data/types'
import { axisProps, CHART_COLORS, CHART_GRID } from '@/lib/chart'
import { ALL_METRICS } from '@/data/seed'
import { formatMetric, METRIC_INFO, qualityScore, winnerFor } from '@/lib/qa'
import { cn } from '@/lib/utils'
import { ChartCard, ChartLegend } from '@/components/shared/ChartCard'
import { PassBadge } from './shared'

const nameOf = (catalog: CatalogItem[], id: string) => catalog.find((c) => c.id === id)?.name ?? id
const colorAt = (i: number) => CHART_COLORS[i % CHART_COLORS.length]!

export function MetricTable({ summaries, catalog, metrics = ALL_METRICS, recommendedId }: { summaries: ModelSummary[]; catalog: CatalogItem[]; metrics?: QaMetric[]; recommendedId?: string }) {
  const rows: { key: string; label: string; hint: string; cells: string[]; winner: number }[] = [
    ...metrics.map((m) => ({ key: m, label: METRIC_INFO[m].label, hint: METRIC_INFO[m].better === 'higher' ? 'Higher is better' : 'Lower is better', cells: summaries.map((s) => formatMetric(m, m === 'latencyP95' ? s.latencyP95 : s[m])), winner: winnerFor(summaries, m) })),
    {
      key: 'cost',
      label: 'Cost',
      hint: 'Credits for this test set',
      cells: summaries.map((s) => `${s.costCredits.toFixed(3)} cr`),
      winner: summaries.reduce((b, s, i) => (s.costCredits < summaries[b]!.costCredits ? i : b), 0),
    },
    {
      key: 'quality',
      label: 'Overall quality',
      hint: 'Average of the four quality scores',
      cells: summaries.map((s) => qualityScore(s).toFixed(2)),
      winner: summaries.reduce((b, s, i) => (qualityScore(s) > qualityScore(summaries[b]!) ? i : b), 0),
    },
  ]
  return (
    <section className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Scores per metric. The best value in each row is marked.</caption>
          <thead className="bg-bg-subtle text-left text-caption text-text-secondary">
            <tr>
              <th className="py-3 pl-5 pr-3 font-semibold">Metric</th>
              {summaries.map((s, i) => (
                <th key={s.modelId} className="px-3 py-3 text-right font-semibold last:pr-5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm" style={{ background: colorAt(i) }} aria-hidden />
                    {nameOf(catalog, s.modelId)}
                  </span>
                  {recommendedId === s.modelId && <span className="block text-xs font-semibold text-indigo-text">Recommended</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="py-3 pl-5 pr-3 text-left font-normal">
                  <span className="block font-semibold text-text-primary">{r.label}</span>
                  <span className="text-caption text-text-muted">{r.hint}</span>
                </th>
                {r.cells.map((c, i) => (
                  <td key={i} className={cn('tabular px-3 py-3 text-right last:pr-5', i === r.winner && summaries.length > 1 && 'bg-indigo-50 font-semibold text-indigo-text')}>
                    <span className="inline-flex items-center gap-1">
                      {i === r.winner && summaries.length > 1 && <Check className="size-3.5" aria-label="Best" />}
                      {c}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="py-3 pl-5 pr-3 text-left font-semibold text-text-primary">
                Thresholds
              </th>
              {summaries.map((s) => (
                <td key={s.modelId} className="px-3 py-3 text-right last:pr-5">
                  <PassBadge passed={s.passed} label={s.passed ? 'All met' : 'Not met'} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Each axis is scaled so further out is better. */
function radarData(summaries: ModelSummary[]) {
  const axes: { key: string; label: string; v: (s: ModelSummary) => number }[] = [
    { key: 'accuracy', label: 'Accuracy', v: (s) => s.accuracy },
    { key: 'faithfulness', label: 'Faithfulness', v: (s) => s.faithfulness },
    { key: 'relevance', label: 'Relevance', v: (s) => s.relevance },
    { key: 'safety', label: 'Safety', v: (s) => 1 - s.toxicity },
    { key: 'speed', label: 'Speed', v: (s) => Math.max(0, Math.min(1, 1 - s.latencyP95 / 4000)) },
  ]
  return axes.map((a) => Object.fromEntries([['axis', a.label], ...summaries.map((s) => [s.modelId, Math.round(a.v(s) * 100) / 100])]))
}

export function ComparisonCharts({ summaries, catalog }: { summaries: ModelSummary[]; catalog: CatalogItem[] }) {
  const legend = summaries.map((s, i) => ({ label: nameOf(catalog, s.modelId), color: colorAt(i) }))
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <ChartCard title="Across metrics" description="Further out is better. Safety is 1 − toxicity; speed falls as p95 latency rises." actions={<ChartLegend items={legend} />} height={300}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData(summaries)} outerRadius="72%">
            <PolarGrid stroke={CHART_GRID} />
            <PolarAngleAxis dataKey="axis" tick={{ fill: 'rgb(var(--text-secondary))', fontSize: 12 }} />
            <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
            {summaries.map((s, i) => (
              <Radar key={s.modelId} name={nameOf(catalog, s.modelId)} dataKey={s.modelId} stroke={colorAt(i)} fill={colorAt(i)} fillOpacity={0.12} strokeWidth={2} isAnimationActive={false} />
            ))}
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-control border border-border bg-bg-surface px-3 py-2 text-caption shadow-pop">
                    <p className="mb-1 font-semibold text-text-primary">{label}</p>
                    {payload.map((p) => (
                      <p key={String(p.dataKey)} className="flex justify-between gap-4 text-text-secondary">
                        <span>{p.name}</span>
                        <span className="tabular font-semibold text-text-primary">{Number(p.value).toFixed(2)}</span>
                      </p>
                    ))}
                  </div>
                ) : null
              }
            />
          </RadarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Cost against quality" description="Top left is the best value: higher quality for fewer credits." actions={<ChartLegend items={legend} />} height={300}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 20, left: 0 }}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
            <XAxis type="number" dataKey="cost" name="Cost" unit=" cr" {...axisProps} label={{ value: 'Cost (credits)', position: 'insideBottom', offset: -12, fill: 'rgb(var(--text-muted))', fontSize: 12 }} />
            <YAxis type="number" dataKey="quality" name="Quality" domain={[0, 1]} {...axisProps} width={40} />
            <ZAxis range={[160, 160]} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as { name: string; cost: number; quality: number } | undefined
                return active && d ? (
                  <div className="rounded-control border border-border bg-bg-surface px-3 py-2 text-caption shadow-pop">
                    <p className="font-semibold text-text-primary">{d.name}</p>
                    <p className="text-text-secondary">
                      Quality {d.quality.toFixed(2)} · {d.cost.toFixed(3)} credits
                    </p>
                  </div>
                ) : null
              }}
            />
            {summaries.map((s, i) => (
              <Scatter key={s.modelId} name={nameOf(catalog, s.modelId)} data={[{ name: nameOf(catalog, s.modelId), cost: s.costCredits, quality: qualityScore(s) }]} fill={colorAt(i)} isAnimationActive={false} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

export function SideBySide({ summaries, catalog, shown }: { summaries: ModelSummary[]; catalog: CatalogItem[]; shown?: number }) {
  const first = summaries[0]
  if (!first) return null
  const count = shown ?? first.results.length
  return (
    <section>
      <h2 className="mb-3 font-heading text-h3 text-text-primary">Answers per prompt</h2>
      <ol className="flex flex-col gap-4">
        {first.results.slice(0, count).map((r, i) => (
          <li key={i} className="card p-5">
            <p className="text-caption text-text-muted">Prompt {i + 1}</p>
            <p className="mt-1 font-semibold text-text-primary">{r.input}</p>
            <p className="mt-1 text-caption text-text-secondary">Expected: {r.expected}</p>
            <div className={cn('mt-4 grid gap-3', summaries.length === 2 ? 'md:grid-cols-2' : summaries.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-4')}>
              {summaries.map((s, mi) => {
                const res = s.results[i]!
                return (
                  <div key={s.modelId} className="flex flex-col gap-2 rounded-control border border-border bg-bg-subtle p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-caption font-semibold text-text-primary">
                        <span className="size-2.5 shrink-0 rounded-sm" style={{ background: colorAt(mi) }} aria-hidden />
                        <span className="truncate">{nameOf(catalog, s.modelId)}</span>
                      </span>
                      <PassBadge passed={res.passed} label={res.passed ? 'Pass' : 'Fail'} />
                    </div>
                    <p className="text-sm text-text-primary">{res.output}</p>
                    <p className="tabular text-caption text-text-muted">
                      Score {res.scores.accuracy.toFixed(2)} · {res.latencyMs} ms · {res.tokens} tokens
                    </p>
                  </div>
                )
              })}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
