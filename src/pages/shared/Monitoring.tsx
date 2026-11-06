import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Activity, Download, Info } from 'lucide-react'
import type { Environment } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useScope, useScopedEnvironments, useScopedProjects, useVisibleTenants } from '@/store/selectors'
import { currentPoint, downloadText, LIVE_INTERVAL_MS, RANGES, seriesFor, type Range } from '@/lib/metrics'
import { formatCompact, formatInt } from '@/lib/format'
import { tenantAllocated } from '@/lib/quota'
import { envPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { MonitoringPanel, RangePicker } from '@/components/shared/MonitoringPanel'
import { ResourceQuota } from '@/components/shared/ResourceQuota'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { quotaFill } from '@/components/shared/QuotaBar'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const MONITORABLE: Environment['status'][] = ['active', 'stopped', 'suspended']

interface Row {
  env: Environment
  cpu: number
  gpu: number | null
  tokens: number
}

function TopList({ title, rows, value, format, pct, role }: { title: string; rows: Row[]; value: (r: Row) => number; format: (n: number) => string; pct?: boolean; role: Parameters<typeof envPath>[0] }) {
  const sorted = [...rows].sort((a, b) => value(b) - value(a)).slice(0, 5)
  const max = Math.max(...sorted.map(value), 1)
  return (
    <section className="card p-5">
      <h2 className="mb-1 font-heading text-h3 text-text-primary">{title}</h2>
      <p className="mb-4 text-caption text-text-muted">Simulated data</p>
      {sorted.length === 0 ? (
        <p className="text-sm text-text-secondary">No active environments.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((r) => {
            const v = value(r)
            const width = pct ? v : (v / max) * 100
            return (
              <li key={r.env.id}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <Link to={`${envPath(role, r.env.id)}?tab=monitoring`} className="min-w-0 truncate font-semibold text-text-primary hover:text-indigo-text">
                    {r.env.spec.name}
                  </Link>
                  <span className={cn('tabular shrink-0', pct && v > 95 ? 'text-status-over-fg' : pct && v > 80 ? 'text-status-pending-fg' : 'text-text-secondary')}>{format(v)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-bg-subtle">
                  <div className={cn('h-full rounded-full', pct ? quotaFill(v) : 'bg-indigo dark:bg-indigo-text')} style={{ width: `${Math.min(width, 100)}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default function Monitoring() {
  const scope = useScope()!
  const environments = useScopedEnvironments()
  const projects = useScopedProjects()
  const tenants = useVisibleTenants()
  const allEnvs = useAppStore((s) => s.environments)
  const catalog = useAppStore((s) => s.catalog)
  const users = useAppStore((s) => s.users)
  const [params, setParams] = useSearchParams()
  const [projectId, setProjectId] = useState('all')
  const [ownerId, setOwnerId] = useState('all')
  const [range, setRange] = useState<Range>('24h')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), LIVE_INTERVAL_MS)
    return () => clearInterval(t)
  }, [])

  const filtered = environments.filter((e) => MONITORABLE.includes(e.status) && (projectId === 'all' || e.projectId === projectId) && (ownerId === 'all' || e.ownerId === ownerId))
  const envId = params.get('env') ?? 'all'
  const selected = filtered.find((e) => e.id === envId)
  const owners = users.filter((u) => environments.some((e) => e.ownerId === u.id))

  const rows: Row[] = useMemo(
    () =>
      filtered
        .filter((e) => e.status === 'active')
        .map((env) => {
          const p = currentPoint(env, catalog, now)
          const series = seriesFor(env, catalog, range, now)
          const tokens = series.reduce((s, x) => s + Object.values(x.tokens).reduce((a, t) => a + t.in + t.out, 0), 0)
          return { env, cpu: p.cpu, gpu: p.gpuMemAlloc > 0 ? p.gpu : null, tokens }
        }),
    [filtered, catalog, now, range],
  )

  const exportCsv = () => {
    const head = 'environment,tenant,status,cpu_pct,gpu_pct,tokens_' + range
    const body = rows.map((r) => [JSON.stringify(r.env.spec.name), JSON.stringify(tenants.find((t) => t.id === r.env.tenantId)?.name ?? ''), r.env.status, r.cpu, r.gpu ?? '', r.tokens].join(','))
    downloadText(`monitoring-summary-${range}.csv`, [head, ...body].join('\n'))
  }

  return (
    <>
      <PageHeader
        eyebrow={scope.role === 'super_admin' ? (scope.tenantId ? tenants[0]?.name : 'All tenants') : tenants[0]?.name}
        title="Monitoring"
        description={
          scope.role === 'user'
            ? 'Live metrics for environments you own or that belong to your projects.'
            : scope.role === 'tenant_admin'
              ? 'Live metrics for every environment in your tenant.'
              : 'Live metrics across tenants. Use the tenant filter in the top bar to narrow it down.'
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[260px_220px_220px_1fr] lg:items-center">
        <Select value={selected ? selected.id : 'all'} onValueChange={(v) => setParams(v === 'all' ? {} : { env: v })}>
          <SelectTrigger aria-label="Environment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All environments (summary)</SelectItem>
            {filtered.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.spec.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {scope.role !== 'user' && (
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger aria-label="Project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {scope.role !== 'user' && (
          <Select value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger aria-label="Owner">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {owners.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center justify-end gap-2 lg:col-start-4">
          <Tag>Simulated data</Tag>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={Activity} title="Nothing to monitor yet" description="Metrics appear for environments that are active, stopped or suspended." />
        </div>
      ) : selected ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="font-heading text-h2 text-text-primary">{selected.spec.name}</h2>
            <StatusBadge status={selected.status} />
            <Link to={envPath(scope.role, selected.id)} className="link text-caption">
              Open environment
            </Link>
          </div>
          <MonitoringPanel key={selected.id} env={selected} catalog={catalog} />
        </>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <Info className="size-4" aria-hidden /> {rows.length} active of {filtered.length} environments. Updates every 5 seconds.
            </p>
            <div className="flex items-center gap-2">
              <RangePicker value={range} onChange={setRange} />
              <Button variant="secondary" size="compact" onClick={exportCsv}>
                <Download /> Export CSV
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <TopList title="Top by CPU" rows={rows} value={(r) => r.cpu} format={(n) => `${Math.round(n)}%`} pct role={scope.role} />
            <TopList title="Top by GPU" rows={rows.filter((r) => r.gpu !== null)} value={(r) => r.gpu ?? 0} format={(n) => `${Math.round(n)}%`} pct role={scope.role} />
            <TopList title={`Top by tokens (${RANGES[range].label})`} rows={rows} value={(r) => r.tokens} format={(n) => formatCompact(n)} role={scope.role} />
          </div>
          <section className="card p-6">
            <h2 className="mb-1 font-heading text-h3 text-text-primary">Usage against quota</h2>
            <p className="mb-5 text-caption text-text-secondary">Resources allocated to environments, by tenant.</p>
            <div className="flex flex-col gap-6">
              {tenants.map((t) => (
                <div key={t.id}>
                  {tenants.length > 1 && <p className="mb-3 text-sm font-semibold text-text-primary">{t.name}</p>}
                  <ResourceQuota compact used={tenantAllocated(allEnvs, t.id)} total={t.quota} className="sm:grid-cols-2 lg:grid-cols-4" />
                </div>
              ))}
            </div>
            <p className="mt-4 text-caption text-text-muted">{formatInt(rows.length)} environments are reporting live data.</p>
          </section>
        </div>
      )}
    </>
  )
}
