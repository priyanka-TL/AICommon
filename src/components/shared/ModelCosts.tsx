import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BellRing, Download, IndianRupee, Save, TrendingUp, Wallet } from 'lucide-react'
import type { ModelUsage, Tenant } from '@/data/types'
import { useAppStore, useCurrentUser } from '@/store/useAppStore'
import { useModelCostContext } from '@/hooks/useModelCost'
import { dailyCostSeries, groupCost, platformModelOptions, projectedMonthEnd, thisMonth, usageCost, type CostGroup } from '@/lib/modelCost'
import { axisProps, CHART_COLORS, CHART_GRID } from '@/lib/chart'
import { formatCompact, formatINR, formatInt, formatShortDate } from '@/lib/format'
import { downloadText, rowsToCsv } from '@/lib/metrics'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/controls'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChartCard, ChartTooltip } from './ChartCard'
import { CostBarChart } from './CostBarChart'
import { DataTable, type Column } from './DataTable'
import { EmptyState } from './EmptyState'
import { KpiCard } from './KpiCard'
import { QuotaBar } from './QuotaBar'
import { priceLabel, ResidencyTag } from './PlatformModelPicker'

type Dim = 'model' | 'provider' | 'project' | 'user' | 'tenant'

const DIM_LABEL: Record<Dim, string> = { model: 'Model', provider: 'Provider', project: 'Project', user: 'User', tenant: 'Organisation' }
const DIM_KEY: Record<Dim, (r: ModelUsage) => string> = {
  model: (r) => r.modelId,
  provider: (r) => r.providerId,
  project: (r) => r.projectId,
  user: (r) => r.userId,
  tenant: (r) => r.tenantId,
}

/** Month-to-date model spend for the tenants in view. */
export function useModelSpend(tenantId: string | null) {
  const usage = useAppStore((s) => s.modelUsage)
  const tenants = useAppStore((s) => s.tenants)
  const ctx = useModelCostContext()
  return useMemo(() => {
    const scoped = usage.filter((u) => tenantId === null || u.tenantId === tenantId)
    const mtd = usageCost(thisMonth(scoped), ctx).total
    const budget = tenants.filter((t) => !t.isSystem && (tenantId === null || t.id === tenantId)).reduce((s, t) => s + (t.modelBudget?.monthly ?? 0), 0)
    return { scoped, mtd, projected: projectedMonthEnd(mtd), budget, pct: budget > 0 ? (mtd / budget) * 100 : 0 }
  }, [usage, tenants, tenantId, ctx])
}

/**
 * Model Costs: month-to-date, projection, budget, breakdowns, 30-day trend, top 5s and the price list.
 * `tenantId` null shows every tenant (Super Admin, "All tenants").
 */
export function ModelCosts({ tenantId, className }: { tenantId: string | null; className?: string }) {
  const user = useCurrentUser()
  const tenants = useAppStore((s) => s.tenants)
  const projects = useAppStore((s) => s.projects)
  const users = useAppStore((s) => s.users)
  const catalog = useAppStore((s) => s.catalog)
  const providers = useAppStore((s) => s.infraProviders)
  const ctx = useModelCostContext()
  const spend = useModelSpend(tenantId)
  const tenant = tenantId ? tenants.find((t) => t.id === tenantId) : undefined
  const [dim, setDim] = useState<Dim>('model')

  const month = useMemo(() => thisMonth(spend.scoped), [spend.scoped])
  const groups = useMemo(() => {
    const dims: Dim[] = tenantId ? ['model', 'provider', 'project', 'user'] : ['tenant', 'model', 'provider', 'project', 'user']
    return Object.fromEntries(dims.map((d) => [d, groupCost(month, DIM_KEY[d], ctx)])) as Record<Dim, CostGroup[]>
  }, [month, ctx, tenantId])
  const trend = useMemo(() => dailyCostSeries(spend.scoped, 30, ctx), [spend.scoped, ctx])

  const name = (d: Dim, key: string) => {
    if (d === 'model') return catalog.find((c) => c.id === key)?.name ?? key
    if (d === 'provider') return providers.find((p) => p.id === key)?.name ?? key
    if (d === 'project') return projects.find((p) => p.id === key)?.name ?? key
    if (d === 'user') return users.find((u) => u.id === key)?.name ?? key
    return tenants.find((t) => t.id === key)?.name ?? key
  }

  const exportCsv = () => {
    const head = ['date', ...(tenantId ? [] : ['organisation']), 'project', 'user', 'model', 'provider', 'region', 'input_tokens', 'output_tokens', 'audio_minutes', 'cost_inr']
    const rows = month.map((r) => {
      const provider = providers.find((p) => p.id === r.providerId)
      return [
        r.date,
        ...(tenantId ? [] : [name('tenant', r.tenantId)]),
        name('project', r.projectId),
        name('user', r.userId),
        name('model', r.modelId),
        provider?.name ?? r.providerId,
        provider?.regions.find((x) => x.id === r.regionId)?.name ?? r.regionId,
        r.inputTokens,
        r.outputTokens,
        r.audioMinutes,
        usageCost([r], ctx).total.toFixed(2),
      ]
    })
    downloadText(`model-costs-${tenant?.code ?? 'all'}-${new Date().toISOString().slice(0, 7)}.csv`, rowsToCsv(head, rows))
  }

  const canSetBudget = !!tenant && (user?.role === 'super_admin' || (user?.role === 'tenant_admin' && user.tenantId === tenant.id))
  const top = (d: Dim) => groups[d].slice(0, 5)

  return (
    <section id="model-costs" className={cn('flex scroll-mt-24 flex-col gap-6', className)} aria-label="Model Costs">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-h2 text-text-primary">Model Costs</h2>
          <p className="mt-0.5 text-caption text-text-secondary">
            Platform model usage {tenant ? `in ${tenant.name}` : 'across all organisations'}, priced on each provider’s rate card in force that day, including fee, discount and GST.
          </p>
        </div>
        <Button variant="secondary" onClick={exportCsv} disabled={!month.length}>
          <Download /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Month to date" value={formatINR(spend.mtd)} icon={IndianRupee} />
        <KpiCard label="Projected month-end" value={formatINR(spend.projected)} icon={TrendingUp} trend={{ direction: spend.projected > spend.budget && spend.budget > 0 ? 'down' : 'flat', text: spend.budget > 0 ? (spend.projected > spend.budget ? `${formatINR(spend.projected - spend.budget)} over budget` : 'Within budget') : 'No budget set' }} />
        <KpiCard label="Model budget" value={spend.budget > 0 ? formatINR(spend.budget) : 'Not set'} icon={Wallet} />
        <div className="card flex flex-col justify-center gap-2 p-5" data-testid="model-budget-used">
          <QuotaBar label="Budget used" used={Math.round(spend.mtd)} total={Math.round(spend.budget)} unit="₹" />
          {tenant && spend.pct >= 80 && (
            <p className="flex items-center gap-1.5 text-caption text-text-secondary">
              <BellRing className="size-3.5 text-vermilion" aria-hidden />
              {spend.pct >= 100 ? (tenant.modelBudget.onExceed === 'block' ? 'Budget used up. New platform models are blocked.' : 'Budget used up. Usage continues.') : 'Above 80%. Tenant Admins were notified.'}
            </p>
          )}
        </div>
      </div>

      {tenant && canSetBudget && <BudgetSettings tenant={tenant} />}

      {month.length === 0 ? (
        <div className="card">
          <EmptyState icon={IndianRupee} title="No platform model usage this month" description="Costs appear here once projects call platform models." />
        </div>
      ) : (
        <>
          <ChartCard title="Daily cost, last 30 days" description="₹ per day, including fee, discount and GST" height={240}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART_GRID} vertical={false} />
                <XAxis dataKey="date" {...axisProps} tickFormatter={(d: string) => formatShortDate(d)} minTickGap={32} />
                <YAxis {...axisProps} width={56} tickFormatter={(v: number) => `₹${formatCompact(v)}`} />
                <Tooltip content={<ChartTooltip valueFormatter={formatINR} labelFormatter={(l) => formatShortDate(l)} />} />
                <Line type="monotone" dataKey="cost" name="Model cost" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <TopFive title="Top 5 projects" rows={top('project')} name={(k) => name('project', k)} />
            <TopFive title="Top 5 models" rows={top('model')} name={(k) => name('model', k)} />
          </div>

          <section className="card p-6">
            <h3 className="mb-4 font-heading text-h3 text-text-primary">Breakdown this month</h3>
            <Tabs value={dim} onValueChange={(v) => setDim(v as Dim)}>
              <TabsList>
                {(Object.keys(groups) as Dim[]).map((d) => (
                  <TabsTrigger key={d} value={d}>
                    By {DIM_LABEL[d].toLowerCase()}
                  </TabsTrigger>
                ))}
              </TabsList>
              {(Object.keys(groups) as Dim[]).map((d) => (
                <TabsContent key={d} value={d} className="pt-5">
                  {dim === d && <Breakdown dim={d} rows={groups[d]} name={(k) => name(d, k)} total={spend.mtd} />}
                </TabsContent>
              ))}
            </Tabs>
          </section>
        </>
      )}

      <PriceList tenants={tenant ? [tenant] : tenants.filter((t) => !t.isSystem)} />
    </section>
  )
}

function BudgetSettings({ tenant }: { tenant: Tenant }) {
  const save = useAppStore((s) => s.setModelBudget)
  const [monthly, setMonthly] = useState(String(tenant.modelBudget.monthly))
  const [onExceed, setOnExceed] = useState(tenant.modelBudget.onExceed)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setMonthly(String(tenant.modelBudget.monthly))
    setOnExceed(tenant.modelBudget.onExceed)
  }, [tenant.id, tenant.modelBudget.monthly, tenant.modelBudget.onExceed])
  const dirty = Number(monthly) !== tenant.modelBudget.monthly || onExceed !== tenant.modelBudget.onExceed
  return (
    <section className="card flex flex-col gap-4 p-6 lg:flex-row lg:items-end" aria-label="Model budget settings">
      <Field label="Monthly model budget (₹)" htmlFor="mb-monthly" error={error} helper="Alerts go to Tenant Admins at 80% and 100%." className="lg:w-64">
        <Input id="mb-monthly" type="number" min={0} step={500} value={monthly} onChange={(e) => { setMonthly(e.target.value); setError(null) }} />
      </Field>
      <fieldset className="flex flex-1 flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold text-text-primary">At 100%</legend>
        <RadioGroup value={onExceed} onValueChange={(v) => setOnExceed(v as typeof onExceed)} className="flex flex-col gap-2 sm:flex-row sm:gap-6" aria-label="At 100%">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
            <RadioGroupItem value="notify" /> Notify only
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
            <RadioGroupItem value="block" /> Block new platform model usage
          </label>
        </RadioGroup>
      </fieldset>
      <Button
        variant="secondary"
        disabled={!dirty}
        onClick={() => {
          const res = save(tenant.id, { monthly: Number(monthly), onExceed })
          if (!res.ok) return setError(res.error)
          toast.success('Model budget saved.')
        }}
      >
        <Save /> Save budget
      </Button>
    </section>
  )
}

function TopFive({ title, rows, name }: { title: string; rows: CostGroup[]; name: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.cost))
  return (
    <section className="card p-6">
      <h3 className="mb-4 font-heading text-h3 text-text-primary">{title}</h3>
      <ol className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <li key={r.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-text-primary">
                <span className="tabular mr-2 text-text-muted">{i + 1}.</span>
                {name(r.key)}
              </span>
              <span className="tabular font-semibold text-text-primary">{formatINR(r.cost)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-bg-subtle">
              <div className="h-full rounded-full bg-indigo dark:bg-indigo-text" style={{ width: `${(r.cost / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Breakdown({ dim, rows, name, total }: { dim: Dim; rows: CostGroup[]; name: (k: string) => string; total: number }) {
  const usage = (r: CostGroup) => (r.audioMinutes && !r.inputTokens ? `${formatInt(r.audioMinutes)} min` : `${formatCompact(r.inputTokens)} in · ${formatCompact(r.outputTokens)} out`)
  const columns: Column<CostGroup>[] = [
    { key: 'name', header: DIM_LABEL[dim], cell: (r) => <span className="font-semibold text-text-primary">{name(r.key)}</span> },
    { key: 'usage', header: 'Usage', cell: (r) => <span className="tabular text-text-secondary">{usage(r)}</span>, className: 'hidden lg:table-cell' },
    { key: 'share', header: 'Share', align: 'right', cell: (r) => `${total > 0 ? Math.round((r.cost / total) * 100) : 0}%`, className: 'hidden md:table-cell' },
    { key: 'cost', header: 'Cost this month', align: 'right', cell: (r) => <span className="tabular font-semibold">{formatINR(r.cost)}</span> },
  ]
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-testid={`breakdown-${dim}`}>
      <div style={{ height: Math.max(140, rows.length * 34) }}>
        <CostBarChart data={rows.map((r) => ({ label: name(r.key), value: Math.round(r.cost) }))} labelWidth={150} />
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.key}
        empty={<p className="p-6 text-sm text-text-secondary">No usage.</p>}
        mobileCard={(r) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-text-primary">{name(r.key)}</p>
              <p className="text-caption text-text-secondary">{usage(r)}</p>
            </div>
            <span className="tabular font-semibold">{formatINR(r.cost)}</span>
          </div>
        )}
      />
    </div>
  )
}

/** Every platform model the tenant(s) can use, with prices per provider after fee, discount and GST. */
function PriceList({ tenants }: { tenants: Tenant[] }) {
  const providers = useAppStore((s) => s.infraProviders)
  const catalog = useAppStore((s) => s.catalog)
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? '')
  const tenant = tenants.find((t) => t.id === tenantId) ?? tenants[0]
  const rows = useMemo(() => {
    if (!tenant) return []
    return catalog
      .filter((c) => tenant.enabledItemIds.includes(c.id))
      .map((c) => ({ item: c, options: platformModelOptions(c.id, providers, tenant, 'public') }))
      .filter((r) => r.options.length)
      .sort((a, b) => a.item.name.localeCompare(b.item.name))
  }, [catalog, providers, tenant])
  if (!tenant) return null
  return (
    <section className="card p-6" aria-label="Price list">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-h3 text-text-primary">Price list</h3>
          <p className="mt-0.5 text-caption text-text-secondary">Platform models available to {tenant.name}, by provider, after platform fee, NGO discount and GST. Personal and children’s data projects see India regions only.</p>
        </div>
        {tenants.length > 1 && (
          <RadioGroup value={tenant.id} onValueChange={setTenantId} className="flex gap-4" aria-label="Organisation">
            {tenants.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                <RadioGroupItem value={t.id} /> {t.name}
              </label>
            ))}
          </RadioGroup>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-text-secondary">No platform models available yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-control border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-bg-subtle text-left text-caption text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-semibold">Model</th>
                <th className="px-3 py-2 font-semibold">Provider</th>
                <th className="px-3 py-2 font-semibold">Price</th>
                <th className="px-3 py-2 font-semibold">Regions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.flatMap(({ item, options }) =>
                options.map((o, i) => (
                  <tr key={`${item.id}-${o.provider.id}`} data-price-list={`${item.id}:${o.provider.id}`}>
                    {i === 0 && (
                      <td rowSpan={options.length} className="px-3 py-2 align-top font-semibold text-text-primary">
                        {item.name}
                      </td>
                    )}
                    <td className="px-3 py-2 text-text-primary">
                      {o.provider.name}
                      {o.cheapest && <span className="ml-2 text-caption font-semibold text-indigo-text">Cheapest</span>}
                    </td>
                    <td className="tabular px-3 py-2 text-text-secondary">{priceLabel(o)}</td>
                    <td className="px-3 py-2 text-text-secondary">
                      <span className="mr-2">{o.regions.map((r) => r.name).join(', ')}</span>
                      <ResidencyTag india={o.indiaResident} />
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
