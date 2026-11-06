import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, Building2, Cpu, Inbox, Server, Wallet } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { estimateCost, checkQuota } from '@/lib/cost'
import { formatCompact, formatInt, formatShortDate } from '@/lib/format'
import { axisProps, CHART_COLORS, CHART_GRID } from '@/lib/chart'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCard } from '@/components/shared/KpiCard'
import { ChartCard, ChartLegend, ChartTooltip } from '@/components/shared/ChartCard'
import { ActivityFeed } from '@/components/shared/ActivityFeed'
import { QuotaBar } from '@/components/shared/QuotaBar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type Metric = 'credits' | 'gpuHours'

export default function AdminDashboard() {
  const loading = useSimulatedLoading()
  const tenants = useAppStore((s) => s.tenants)
  const environments = useAppStore((s) => s.environments)
  const requests = useAppStore((s) => s.requests)
  const usage = useAppStore((s) => s.usage)
  const catalog = useAppStore((s) => s.catalog)
  const activity = useAppStore((s) => s.activity)
  const [metric, setMetric] = useState<Metric>('credits')

  const stats = useMemo(() => {
    const running = environments.filter((e) => e.status === 'running').length
    const provisioning = environments.filter((e) => e.status === 'provisioning').length
    const pending = requests.filter((r) => r.status === 'pending')
    const overQuota = pending.filter((r) => {
      const t = tenants.find((x) => x.id === r.tenantId)
      return t && checkQuota(t, estimateCost(r.spec, catalog)).over
    }).length
    const gpuUsed = tenants.reduce((s, t) => s + t.gpuUsed, 0)
    const gpuQuota = tenants.reduce((s, t) => s + t.gpuQuota, 0)
    const creditsUsed = tenants.reduce((s, t) => s + t.creditsUsed, 0)
    const creditQuota = tenants.reduce((s, t) => s + t.creditQuota, 0)

    const dates = [...new Set(usage.map((u) => u.date))].sort()
    const sumFor = (ds: string[]) => usage.filter((u) => ds.includes(u.date)).reduce((s, u) => s + u.credits, 0)
    const last7 = sumFor(dates.slice(-7))
    const prev7 = sumFor(dates.slice(-14, -7))
    const change = prev7 ? ((last7 - prev7) / prev7) * 100 : 0

    return {
      activeTenants: tenants.filter((t) => t.status === 'active').length,
      suspended: tenants.filter((t) => t.status === 'suspended').length,
      running,
      provisioning,
      totalEnvs: environments.length,
      pending: pending.length,
      overQuota,
      gpuPct: gpuQuota ? (gpuUsed / gpuQuota) * 100 : 0,
      gpuUsed,
      gpuQuota,
      creditsUsed,
      creditQuota,
      change,
    }
  }, [tenants, environments, requests, usage, catalog])

  const series = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>()
    for (const u of usage) {
      const row = byDate.get(u.date) ?? { date: u.date }
      row[u.tenantId] = u[metric]
      byDate.set(u.date, row)
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [usage, metric])

  const statusData = useMemo(
    () => [
      { name: 'Pending', value: requests.filter((r) => r.status === 'pending' && r.type === 'new').length, color: 'rgb(var(--tangerine))' },
      { name: 'Change requested', value: requests.filter((r) => r.status === 'pending' && r.type === 'change').length, color: 'rgb(var(--purple))' },
      { name: 'Approved', value: requests.filter((r) => r.status === 'approved').length, color: 'rgb(var(--indigo))' },
      { name: 'Rejected', value: requests.filter((r) => r.status === 'rejected').length, color: 'rgb(var(--red))' },
    ],
    [requests],
  )

  return (
    <>
      <PageHeader
        eyebrow="Platform overview"
        title="Dashboard"
        description="How partner organisations are using shared infrastructure this month."
        actions={
          <Button asChild>
            <Link to="/admin/requests">
              <Inbox /> Review requests{stats.pending ? ` (${stats.pending})` : ''}
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          loading={loading}
          label="Organisations"
          icon={Building2}
          value={formatInt(stats.activeTenants)}
          trend={{ direction: 'flat', text: stats.suspended ? `${stats.suspended} suspended` : 'All active' }}
        />
        <KpiCard
          loading={loading}
          label="Active environments"
          icon={Server}
          value={formatInt(stats.running)}
          trend={{ direction: 'flat', text: `${stats.provisioning} provisioning · ${stats.totalEnvs} in total` }}
        />
        <KpiCard
          loading={loading}
          label="Pending requests"
          icon={Inbox}
          value={formatInt(stats.pending)}
          trend={{ direction: stats.overQuota ? 'down' : 'flat', text: stats.overQuota ? `${stats.overQuota} over quota` : 'None over quota' }}
        />
        <KpiCard
          loading={loading}
          label="GPU utilisation"
          icon={Cpu}
          value={`${Math.round(stats.gpuPct)}%`}
          trend={{ direction: 'flat', text: `${formatInt(stats.gpuUsed)} of ${formatInt(stats.gpuQuota)} GPU-hours` }}
        />
        <KpiCard
          loading={loading}
          label="Credits used this month"
          icon={Wallet}
          value={formatCompact(stats.creditsUsed)}
          trend={{
            direction: stats.change >= 0 ? 'up' : 'down',
            text: `${Math.abs(stats.change).toFixed(0)}% vs previous week`,
          }}
          className="sm:col-span-2 xl:col-span-1"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Usage over time"
          description="Last 30 days, by organisation"
          loading={loading}
          height={300}
          actions={
            <div className="flex rounded-control border border-border p-0.5" role="group" aria-label="Metric">
              {(
                [
                  ['credits', 'Credits'],
                  ['gpuHours', 'GPU-hours'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={metric === value}
                  onClick={() => setMetric(value)}
                  className={cn(
                    'rounded-[8px] px-3 py-1 text-caption font-semibold',
                    metric === value ? 'bg-indigo-50 text-indigo-text' : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          <div className="flex h-full flex-col gap-3">
            <ChartLegend items={tenants.map((t, i) => ({ label: t.name, color: CHART_COLORS[i % CHART_COLORS.length] }))} />
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => formatShortDate(d)} minTickGap={24} />
                  <YAxis {...axisProps} tickFormatter={(v) => formatCompact(v)} width={48} />
                  <Tooltip
                    content={
                      <ChartTooltip
                        labelFormatter={(d) => formatShortDate(d)}
                        valueFormatter={(v) => (metric === 'credits' ? `${formatInt(v)} credits` : `${v} h`)}
                      />
                    }
                  />
                  {tenants.map((t, i) => (
                    <Area
                      key={t.id}
                      type="monotone"
                      dataKey={t.id}
                      name={t.name}
                      stackId="1"
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Requests by status" description="All requests to date" loading={loading} height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} horizontal={false} />
              <XAxis type="number" allowDecimals={false} {...axisProps} />
              <YAxis type="category" dataKey="name" {...axisProps} width={116} />
              <Tooltip cursor={{ fill: 'rgb(var(--bg-subtle))' }} content={<ChartTooltip />} />
              <Bar dataKey="value" name="Requests" radius={[0, 6, 6, 0]} barSize={22}>
                {statusData.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="card p-6 xl:col-span-2">
          <header className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-h3 text-text-primary">Organisations and quota</h2>
              <p className="mt-0.5 text-caption text-text-secondary">Credits and GPU-hours used this month</p>
            </div>
            <Button asChild variant="ghost" size="compact">
              <Link to="/admin/tenants">
                View all <ArrowRight />
              </Link>
            </Button>
          </header>
          <ul className="divide-y divide-border">
            {tenants.map((t) => {
              const running = environments.filter((e) => e.tenantId === t.id && e.status === 'running').length
              return (
                <li key={t.id} className="grid gap-4 py-4 first:pt-0 last:pb-0 md:grid-cols-[1.2fr_1fr_1fr] md:items-center">
                  <div className="min-w-0">
                    {loading ? (
                      <Skeleton className="h-5 w-40" />
                    ) : (
                      <>
                        <Link to={`/admin/tenants/${t.id}`} className="truncate font-semibold text-text-primary hover:text-indigo-text">
                          {t.name}
                        </Link>
                        <p className="text-caption text-text-muted">
                          {t.city}, {t.state} · {running} running
                        </p>
                      </>
                    )}
                  </div>
                  <QuotaBar compact label="Credits" used={t.creditsUsed} total={t.creditQuota} unit="" />
                  <QuotaBar compact label="GPU-hours" used={t.gpuUsed} total={t.gpuQuota} unit="" />
                </li>
              )
            })}
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="mb-5 font-heading text-h3 text-text-primary">Recent activity</h2>
          <ActivityFeed items={activity.slice(0, 7)} loading={loading} />
        </section>
      </div>
    </>
  )
}
