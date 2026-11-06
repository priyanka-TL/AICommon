import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, Building2, Cpu, Inbox, Server, Wallet } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useScope, useScopedAudit, useScopedEnvironments, useScopedRequests, useVisibleTenants } from '@/store/selectors'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { formatCompact, formatInt, formatShortDate } from '@/lib/format'
import { STATUS_LABELS } from '@/lib/labels'
import { tenantAllocated, usagePct } from '@/lib/quota'
import { axisProps, CHART_COLORS, CHART_GRID } from '@/lib/chart'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCard } from '@/components/shared/KpiCard'
import { ChartCard, ChartLegend, ChartTooltip } from '@/components/shared/ChartCard'
import { ActivityFeed } from '@/components/shared/ActivityFeed'
import { ResourceQuota } from '@/components/shared/ResourceQuota'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type Metric = 'credits' | 'gpuHours'

const STATUS_COLORS: Record<string, string> = {
  submitted: 'rgb(var(--blue))',
  under_review: 'rgb(var(--purple))',
  changes_requested: 'rgb(var(--clay))',
  resubmitted: 'rgb(var(--cyan))',
  escalated: 'rgb(var(--vermilion))',
  approved: 'rgb(var(--indigo))',
  rejected: 'rgb(var(--red))',
  cancelled: 'rgb(var(--text-muted))',
}

export default function SuperAdminDashboard() {
  const loading = useSimulatedLoading()
  const scope = useScope()!
  const tenants = useVisibleTenants()
  const environments = useScopedEnvironments()
  const requests = useScopedRequests()
  const audit = useScopedAudit()
  const allEnvs = useAppStore((s) => s.environments)
  const usage = useAppStore((s) => s.usage)
  const capacity = useAppStore((s) => s.capacity)
  const pendingQuota = useAppStore((s) => s.quotaRequests.filter((q) => q.status === 'pending' && (scope.tenantId === null || q.tenantId === scope.tenantId)).length)
  const [metric, setMetric] = useState<Metric>('credits')
  const tenantIds = tenants.map((t) => t.id)

  const scopedUsage = usage.filter((u) => tenantIds.includes(u.tenantId))
  const allocatedGpus = tenants.reduce((s, t) => s + tenantAllocated(allEnvs, t.id).gpus, 0)
  const escalated = requests.filter((r) => r.status === 'escalated').length
  const dates = [...new Set(scopedUsage.map((u) => u.date))].sort()
  const sumFor = (ds: string[]) => scopedUsage.filter((u) => ds.includes(u.date)).reduce((s, u) => s + u.credits, 0)
  const last7 = sumFor(dates.slice(-7))
  const prev7 = sumFor(dates.slice(-14, -7))
  const change = prev7 ? ((last7 - prev7) / prev7) * 100 : 0

  const series = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>()
    for (const u of scopedUsage) {
      const row = byDate.get(u.date) ?? { date: u.date }
      row[u.tenantId] = u[metric]
      byDate.set(u.date, row)
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [scopedUsage, metric])

  const statusData = Object.keys(STATUS_COLORS)
    .map((s) => ({ key: s, name: STATUS_LABELS[s as keyof typeof STATUS_LABELS], value: requests.filter((r) => r.status === s).length, color: STATUS_COLORS[s]! }))
    .filter((d) => d.value > 0)

  return (
    <>
      <PageHeader
        eyebrow={scope.tenantId ? tenants[0]?.name : 'All tenants'}
        title="Platform dashboard"
        description="Requests waiting for you, how tenants use their quota, and what changed recently."
        actions={
          <Button asChild>
            <Link to="/super-admin/requests">
              <Inbox /> Review escalated ({escalated + pendingQuota})
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard loading={loading} label="Tenants" icon={Building2} value={formatInt(tenants.length)} trend={{ direction: 'flat', text: `${tenants.filter((t) => t.status === 'suspended').length} suspended` }} />
        <KpiCard loading={loading} label="Active environments" icon={Server} value={formatInt(environments.filter((e) => e.status === 'active').length)} trend={{ direction: 'flat', text: `${environments.filter((e) => e.status === 'provisioning').length} provisioning` }} />
        <KpiCard loading={loading} label="Escalated to you" icon={Inbox} value={formatInt(escalated)} trend={{ direction: pendingQuota ? 'down' : 'flat', text: `${pendingQuota} quota request${pendingQuota === 1 ? '' : 's'}` }} />
        <KpiCard loading={loading} label="GPUs allocated" icon={Cpu} value={`${allocatedGpus} / ${capacity.gpus}`} trend={{ direction: 'flat', text: `${Math.round(usagePct(allocatedGpus, capacity.gpus))}% of platform capacity` }} />
        <KpiCard
          loading={loading}
          label="Credits, last 30 days"
          icon={Wallet}
          value={formatCompact(scopedUsage.reduce((s, u) => s + u.credits, 0))}
          trend={{ direction: change >= 0 ? 'up' : 'down', text: `${Math.abs(change).toFixed(0)}% vs previous week` }}
          className="sm:col-span-2 xl:col-span-1"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Usage over time"
          description="Last 30 days, by tenant"
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
                  className={cn('rounded-[8px] px-3 py-1 text-caption font-semibold', metric === value ? 'bg-indigo-50 text-indigo-text' : 'text-text-secondary hover:text-text-primary')}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          <div className="flex h-full flex-col gap-3">
            <ChartLegend items={tenants.map((t, i) => ({ label: t.name, color: CHART_COLORS[i % CHART_COLORS.length]! }))} />
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => formatShortDate(d)} minTickGap={24} />
                  <YAxis {...axisProps} tickFormatter={(v) => formatCompact(v)} width={48} />
                  <Tooltip content={<ChartTooltip labelFormatter={(d) => formatShortDate(d)} valueFormatter={(v) => (metric === 'credits' ? `${formatInt(v)} credits` : `${v} h`)} />} />
                  {tenants.map((t, i) => (
                    <Area key={t.id} type="monotone" dataKey={t.id} name={t.name} stackId="1" stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.18} strokeWidth={2} />
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
              <YAxis type="category" dataKey="name" {...axisProps} width={124} />
              <Tooltip cursor={{ fill: 'rgb(var(--bg-subtle))' }} content={<ChartTooltip />} />
              <Bar dataKey="value" name="Requests" radius={[0, 6, 6, 0]} barSize={18}>
                {statusData.map((d) => (
                  <Cell key={d.key} fill={d.color} />
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
              <h2 className="font-heading text-h3 text-text-primary">Tenants and quota</h2>
              <p className="mt-0.5 text-caption text-text-secondary">Resources allocated to environments</p>
            </div>
            <Button asChild variant="ghost" size="compact">
              <Link to="/super-admin/tenants">
                View all <ArrowRight />
              </Link>
            </Button>
          </header>
          <ul className="flex flex-col gap-6">
            {tenants.map((t) => (
              <li key={t.id}>
                {loading ? (
                  <Skeleton className="h-16" />
                ) : (
                  <>
                    <Link to={`/super-admin/tenants/${t.id}`} className="mb-3 inline-block font-semibold text-text-primary hover:text-indigo-text">
                      {t.name}
                    </Link>
                    <ResourceQuota compact used={tenantAllocated(allEnvs, t.id)} total={t.quota} className="sm:grid-cols-2 lg:grid-cols-4" />
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-6">
          <h2 className="mb-5 font-heading text-h3 text-text-primary">Recent activity</h2>
          <ActivityFeed items={audit.slice(0, 7)} loading={loading} />
        </section>
      </div>
    </>
  )
}
