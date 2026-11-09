import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight } from 'lucide-react'
import type { Tenant } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useMonthToDate, sumLines } from '@/hooks/useSpend'
import { providerGpuUse } from '@/lib/cost'
import { axisProps, CHART_COLORS, CHART_GRID } from '@/lib/chart'
import { formatInt } from '@/lib/format'
import { ChartCard, ChartLegend, ChartTooltip } from '@/components/shared/ChartCard'
import { CostBreakdown } from '@/components/shared/CostBreakdown'
import { Button } from '@/components/ui/button'

/** Super Admin dashboard: month-to-date cost by provider and tenant, and GPU use per provider. */
export function ProviderCharts({ tenants, loading }: { tenants: Tenant[]; loading?: boolean }) {
  const providers = useAppStore((s) => s.infraProviders)
  const environments = useAppStore((s) => s.environments)
  const mtd = useMonthToDate()
  const tenantIds = useMemo(() => new Set(tenants.map((t) => t.id)), [tenants])
  const rows = useMemo(() => mtd.filter((r) => tenantIds.has(r.env.tenantId)), [mtd, tenantIds])

  const byProvider = providers
    .map((p) => {
      const mine = rows.filter((r) => r.env.spec.providerId === p.id)
      const row: Record<string, number | string> = { name: p.code, full: p.name, total: mine.reduce((s, r) => s + r.lines.total, 0) }
      for (const t of tenants) row[t.id] = mine.filter((r) => r.env.tenantId === t.id).reduce((s, r) => s + r.lines.total, 0)
      return row
    })
    .sort((a, b) => Number(b.total) - Number(a.total))

  const gpuRows = providers.map((p) => ({ name: p.code, full: p.name, used: providerGpuUse(p.id, environments.filter((e) => tenantIds.has(e.tenantId))), max: p.maxGpus }))
  const total = sumLines(rows)
  const tenantLegend = tenants.map((t, i) => ({ label: t.name, color: CHART_COLORS[i % CHART_COLORS.length]! }))
  const fullName = (code: string) => providers.find((p) => p.code === code)?.name ?? code

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
      <ChartCard title="Cost by provider" description="Month to date, credits" loading={loading} height={260}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byProvider} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_GRID} horizontal={false} />
            <XAxis type="number" {...axisProps} tickFormatter={(v: number) => formatInt(v)} />
            <YAxis type="category" dataKey="name" {...axisProps} width={44} />
            <Tooltip cursor={{ fill: 'rgb(var(--bg-subtle))' }} content={<ChartTooltip labelFormatter={fullName} valueFormatter={(v) => `${formatInt(v)} credits`} />} />
            <Bar dataKey="total" name="Month to date" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {byProvider.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[0]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Cost by tenant per provider" description="Month to date, credits" actions={<ChartLegend items={tenantLegend} />} loading={loading} height={260}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byProvider} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} width={52} tickFormatter={(v: number) => formatInt(v)} />
            <Tooltip cursor={{ fill: 'rgb(var(--bg-subtle))' }} content={<ChartTooltip labelFormatter={fullName} valueFormatter={(v) => `${formatInt(v)} credits`} />} />
            {tenants.map((t, i) => (
              <Bar key={t.id} dataKey={t.id} name={t.name} stackId="tenant" fill={CHART_COLORS[i % CHART_COLORS.length]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="GPUs used against maximum"
        description="Per provider"
        actions={<ChartLegend items={[{ label: 'In use', color: CHART_COLORS[0]! }, { label: 'Maximum', color: 'rgb(var(--border-strong))' }]} />}
        loading={loading}
        height={260}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={gpuRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} width={32} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'rgb(var(--bg-subtle))' }} content={<ChartTooltip labelFormatter={fullName} valueFormatter={(v) => `${formatInt(v)} GPUs`} />} />
            <Bar dataKey="used" name="In use" fill={CHART_COLORS[0]} isAnimationActive={false} />
            <Bar dataKey="max" name="Maximum" fill="rgb(var(--border-strong))" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <section className="card p-6 xl:col-span-3">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-h3 text-text-primary">Spend this month</h2>
            <p className="mt-0.5 text-caption text-text-secondary">All providers, from each one’s rate card</p>
          </div>
          <Button asChild variant="ghost" size="compact">
            <Link to="/super-admin/infra-providers">
              Infrastructure Providers <ArrowRight />
            </Link>
          </Button>
        </header>
        <CostBreakdown est={total} title="Total this month" className="max-w-md" />
      </section>
    </div>
  )
}
