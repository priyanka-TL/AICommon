import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeft, Ban, FileText, Pencil, Play } from 'lucide-react'
import type { RateCard } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useMonthToDate, lastMonths, sumLines } from '@/hooks/useSpend'
import { environmentsInUse, latestRateCard, providerGpuUse, rateCardAt, spendBetween } from '@/lib/cost'
import { AI_SERVICE_LABELS, indiaResidency, PROVIDER_TYPE_LABELS } from '@/lib/providers'
import { formatDate, formatDateTime, formatInt } from '@/lib/format'
import { envPath } from '@/lib/paths'
import { axisProps, CHART_COLORS, CHART_GRID } from '@/lib/chart'
import { PageHeader } from '@/components/layout/PageHeader'
import { ActiveBadge, StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { QuotaBar } from '@/components/shared/QuotaBar'
import { ChartCard, ChartLegend, ChartTooltip } from '@/components/shared/ChartCard'
import { CostBreakdown } from '@/components/shared/CostBreakdown'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import NotFound from '@/pages/NotFound'
import { ProviderMark } from './ProviderEditors'
import { ProviderFormDialog, PublishRateCardDialog } from './ProviderFormDialog'

function RateCardView({ card, current }: { card: RateCard; current?: boolean }) {
  const users = useAppStore((s) => s.users)
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="eyebrow">Effective from</dt>
          <dd className="mt-1 text-text-primary">{formatDate(card.effectiveFrom)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="eyebrow">Rate source</dt>
          <dd className="mt-1 text-text-primary">{card.source}</dd>
        </div>
      </dl>
      <div className="overflow-x-auto rounded-control border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Instance types on rate card v{card.version}</caption>
          <thead className="bg-bg-subtle text-left text-caption text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-semibold">Instance type</th>
              <th className="px-3 py-2 text-right font-semibold">vCPU</th>
              <th className="px-3 py-2 text-right font-semibold">RAM GB</th>
              <th className="px-3 py-2 font-semibold">GPU</th>
              <th className="px-3 py-2 text-right font-semibold">₹ per hour</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {card.instanceTypes.map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-2 font-semibold text-text-primary">{i.name}</td>
                <td className="tabular px-3 py-2 text-right">{i.vcpu}</td>
                <td className="tabular px-3 py-2 text-right">{i.ramGb}</td>
                <td className="px-3 py-2 text-text-secondary">{i.gpuType === 'none' ? 'None' : `${i.gpuCount}× ${i.gpuType}`}</td>
                <td className="tabular px-3 py-2 text-right font-semibold">₹{formatInt(i.hourlyRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        {(
          [
            ['Storage', `₹${card.storageRate} per GB-month`],
            ['Network egress', `₹${card.egressRate} per GB`],
            ['Platform fee', `${card.platformFeePct}%`],
            ['NGO discount', `${card.ngoDiscountPct}%`],
            ['GST', `${card.gstPct}%`],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-control bg-bg-subtle px-3 py-2">
            <dt className="text-caption text-text-secondary">{k}</dt>
            <dd className="tabular font-semibold text-text-primary">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-caption text-text-muted">
        Version {card.version}
        {current ? ' (current)' : ' (read-only)'} · published by {users.find((u) => u.id === card.publishedById)?.name ?? 'the Super Admin'} on {formatDateTime(card.publishedAt)}
      </p>
    </div>
  )
}

export default function InfraProviderDetail() {
  const { id } = useParams()
  const provider = useAppStore((s) => s.infraProviders.find((p) => p.id === id))
  const environments = useAppStore((s) => s.environments)
  const tenants = useAppStore((s) => s.tenants)
  const catalog = useAppStore((s) => s.catalog)
  const allProviders = useAppStore((s) => s.infraProviders)
  const setStatus = useAppStore((s) => s.setInfraProviderStatus)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'overview'
  const [editOpen, setEditOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const mtd = useMonthToDate()
  const months = useMemo(() => lastMonths(6), [])

  const realTenants = tenants.filter((t) => !t.isSystem)
  const monthly = useMemo(() => {
    if (!provider) return []
    const envs = environments.filter((e) => e.spec.providerId === provider.id)
    return months.map((m) => {
      const row: Record<string, number | string> = { month: m.label }
      for (const t of realTenants) {
        row[t.id] = envs.filter((e) => e.tenantId === t.id).reduce((s, e) => s + spendBetween(e, m.from, m.to, { providers: allProviders, catalog, tenant: t }).total, 0)
      }
      return row
    })
  }, [provider, environments, months, allProviders, catalog, realTenants.length])

  if (!provider) return <NotFound message="This provider doesn’t exist." />

  const using = environments.filter((e) => e.spec.providerId === provider.id)
  const inUse = environmentsInUse(provider.id, environments)
  const gpuUsed = providerGpuUse(provider.id, environments)
  const current = rateCardAt(provider)
  const latest = latestRateCard(provider)!
  const upcoming = latest.version !== current?.version ? latest : undefined
  const mtdLines = sumLines(mtd.filter((r) => r.env.spec.providerId === provider.id))

  return (
    <>
      <Link to="/super-admin/infra-providers" className="link mb-4 inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" aria-hidden /> Infrastructure Providers
      </Link>
      <PageHeader
        eyebrow={`${PROVIDER_TYPE_LABELS[provider.type]} · ${provider.code}`}
        title={provider.name}
        description={`${provider.regions.length} regions · India residency: ${indiaResidency(provider)} · ${inUse.length} environments in use`}
        actions={
          <div className="flex flex-wrap gap-2">
            {provider.status === 'active' ? (
              <Button variant="ghost" className="text-red-text hover:text-red-text" onClick={() => setDisableOpen(true)}>
                <Ban /> Disable
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={() => {
                  const res = setStatus(provider.id, 'active')
                  if (res.ok) toast.success(`${provider.name} is active again.`)
                }}
              >
                <Play /> Enable
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
            <Button onClick={() => setPublishOpen(true)}>
              <FileText /> Publish new rate card
            </Button>
          </div>
        }
      />
      <div className="-mt-2 mb-6 flex items-center gap-3">
        <ProviderMark provider={provider} />
        <ActiveBadge active={provider.status === 'active'} inactiveLabel="Disabled" />
        {current && <Tag>Rate card v{current.version}</Tag>}
        {upcoming && <Tag>v{upcoming.version} from {formatDate(upcoming.effectiveFrom)}</Tag>}
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rates">Rate Card</TabsTrigger>
          <TabsTrigger value="environments">Environments ({using.length})</TabsTrigger>
          <TabsTrigger value="spend">Spend</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="card p-6">
              <h2 className="mb-4 font-heading text-h3 text-text-primary">Regions</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="text-left text-caption text-text-secondary">
                    <tr>
                      <th className="pb-2 font-semibold">Region</th>
                      <th className="pb-2 font-semibold">India data residency</th>
                      <th className="pb-2 font-semibold">GPU types</th>
                      <th className="pb-2 text-right font-semibold">Environments</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {provider.regions.map((r) => (
                      <tr key={r.id} className="h-11">
                        <td className="font-semibold text-text-primary">{r.name}</td>
                        <td>{r.indiaResident ? 'Yes' : 'No'}</td>
                        <td className="text-text-secondary">{r.gpuTypes.join(', ') || 'None'}</td>
                        <td className="tabular text-right">{inUse.filter((e) => e.spec.regionId === r.id).length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="flex flex-col gap-6">
              <section className="card p-6">
                <h2 className="mb-4 font-heading text-h3 text-text-primary">Capacity</h2>
                <QuotaBar label="GPUs in use" used={gpuUsed} total={provider.maxGpus} unit="GPUs" />
                <p className="mt-2 text-caption text-text-secondary">Approvals warn when a request needs more than the {Math.max(0, provider.maxGpus - gpuUsed)} GPUs left.</p>
              </section>
              <section className="card p-6">
                <h2 className="mb-3 font-heading text-h3 text-text-primary">AI model services</h2>
                {provider.aiServices.length ? (
                  <div className="flex flex-wrap gap-2">
                    {provider.aiServices.map((s) => (
                      <Tag key={s}>{AI_SERVICE_LABELS[s]}</Tag>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-secondary">None</p>
                )}
                <h2 className="mb-3 mt-5 font-heading text-h3 text-text-primary">Access</h2>
                <p className="text-sm text-text-primary">
                  Offered to: {provider.allowedTenants === 'all' ? 'All tenants' : realTenants.filter((t) => (provider.allowedTenants as string[]).includes(t.id)).map((t) => t.name).join(', ') || 'No tenants'}
                </p>
                <p className="mt-1 text-sm text-text-primary">
                  Approved for: {realTenants.filter((t) => t.approvedProviders.some((a) => a.providerId === provider.id && a.status === 'approved')).map((t) => t.name).join(', ') || 'No tenant yet'}
                </p>
                <p className="mt-1 text-caption text-text-muted">Tenant Admins request access; the Super Admin approves it per tenant.</p>
              </section>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="rates">
          <div className="flex flex-col gap-6">
            {upcoming && (
              <section className="card border-indigo p-6 dark:border-indigo-text">
                <h2 className="mb-4 font-heading text-h3 text-text-primary">Upcoming: rate card v{upcoming.version}</h2>
                <RateCardView card={upcoming} />
              </section>
            )}
            {current && (
              <section className="card p-6">
                <h2 className="mb-4 font-heading text-h3 text-text-primary">Current: rate card v{current.version}</h2>
                <RateCardView card={current} current />
              </section>
            )}
            {provider.rateCards.filter((c) => c.version !== current?.version && c.version !== upcoming?.version).length > 0 && (
              <section className="card p-6">
                <h2 className="mb-3 font-heading text-h3 text-text-primary">Earlier rate cards</h2>
                <ul className="flex flex-col divide-y divide-border">
                  {[...provider.rateCards]
                    .reverse()
                    .filter((c) => c.version !== current?.version && c.version !== upcoming?.version)
                    .map((c) => (
                      <li key={c.version}>
                        <details className="group py-3">
                          <summary className="cursor-pointer list-none text-sm font-semibold text-text-primary">
                            Version {c.version} · effective from {formatDate(c.effectiveFrom)} <span className="font-normal text-text-secondary">· {c.source}</span>
                          </summary>
                          <div className="mt-4">
                            <RateCardView card={c} />
                          </div>
                        </details>
                      </li>
                    ))}
                </ul>
              </section>
            )}
          </div>
        </TabsContent>

        <TabsContent value="environments">
          <section className="card overflow-hidden">
            {using.length === 0 ? (
              <EmptyState icon={FileText} title="No environments use this provider yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-bg-subtle text-left text-caption text-text-secondary">
                    <tr>
                      <th className="py-3 pl-5 pr-3 font-semibold">Environment</th>
                      <th className="px-3 py-3 font-semibold">Tenant</th>
                      <th className="px-3 py-3 font-semibold">Region</th>
                      <th className="px-3 py-3 font-semibold">Instance</th>
                      <th className="px-3 py-3 font-semibold">Rate card</th>
                      <th className="py-3 pl-3 pr-5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {using.map((e) => (
                      <tr key={e.id} className="h-[52px]">
                        <td className="py-2 pl-5 pr-3">
                          <Link to={envPath('super_admin', e.id)} className="font-semibold text-text-primary hover:text-indigo-text">
                            {e.spec.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{tenants.find((t) => t.id === e.tenantId)?.name}</td>
                        <td className="px-3 py-2 text-text-secondary">{provider.regions.find((r) => r.id === e.spec.regionId)?.name}</td>
                        <td className="px-3 py-2 text-text-secondary">
                          {e.spec.instance.name}
                          {e.spec.instanceCount > 1 ? ` × ${e.spec.instanceCount}` : ''}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">v{e.rateCardVersion}</td>
                        <td className="py-2 pl-3 pr-5">
                          <StatusBadge status={e.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="spend">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <ChartCard title="Spend by month" description="Credits, stacked by tenant. Each day is charged at the rate card in force that day." actions={<ChartLegend items={realTenants.map((t, i) => ({ label: t.name, color: CHART_COLORS[i % CHART_COLORS.length]! }))} />} height={300}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="month" {...axisProps} />
                  <YAxis {...axisProps} width={56} tickFormatter={(v: number) => formatInt(v)} />
                  <Tooltip cursor={{ fill: 'rgb(var(--bg-subtle))' }} content={<ChartTooltip valueFormatter={(v) => `${formatInt(v)} credits`} />} />
                  {realTenants.map((t, i) => (
                    <Bar key={t.id} dataKey={t.id} name={t.name} stackId="t" fill={CHART_COLORS[i % CHART_COLORS.length]} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <section className="card overflow-hidden xl:col-start-1">
              <table className="w-full text-sm" aria-label="Spend by month">
                <thead className="bg-bg-subtle text-left text-caption text-text-secondary">
                  <tr>
                    <th className="py-2.5 pl-5 pr-3 font-semibold">Month</th>
                    {realTenants.map((t) => (
                      <th key={t.id} className="px-3 py-2.5 text-right font-semibold">
                        {t.name}
                      </th>
                    ))}
                    <th className="py-2.5 pl-3 pr-5 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {monthly.map((m) => (
                    <tr key={String(m.month)}>
                      <th scope="row" className="py-2.5 pl-5 pr-3 text-left font-normal text-text-primary">
                        {m.month}
                      </th>
                      {realTenants.map((t) => (
                        <td key={t.id} className="tabular px-3 py-2.5 text-right text-text-secondary">
                          {formatInt(Number(m[t.id] ?? 0))}
                        </td>
                      ))}
                      <td className="tabular py-2.5 pl-3 pr-5 text-right font-semibold">{formatInt(realTenants.reduce((n, t) => n + Number(m[t.id] ?? 0), 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="card p-6 xl:col-start-2 xl:row-start-1 xl:row-span-2">
              <h2 className="mb-4 font-heading text-h3 text-text-primary">Month to date</h2>
              <CostBreakdown est={mtdLines} title="Total this month" />
            </section>
          </div>
        </TabsContent>
      </Tabs>

      <ProviderFormDialog open={editOpen} onOpenChange={setEditOpen} editing={provider} onPublish={() => setPublishOpen(true)} />
      <PublishRateCardDialog open={publishOpen} onOpenChange={setPublishOpen} provider={provider} />

      {inUse.length > 0 ? (
        <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
          <DialogContent size="md">
            <DialogHeader title={`${provider.name} can’t be disabled yet`} description={`${inUse.length} environment${inUse.length === 1 ? '' : 's'} still run on it. Stop or terminate them, or move them to another provider, then try again.`} />
            <DialogBody>
              <ul className="divide-y divide-border rounded-control border border-border" aria-label="Environments using this provider">
                {inUse.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <Link to={envPath('super_admin', e.id)} className="min-w-0 truncate text-sm font-semibold text-text-primary hover:text-indigo-text" onClick={() => setDisableOpen(false)}>
                      {e.spec.name}
                    </Link>
                    <span className="flex shrink-0 items-center gap-2 text-caption text-text-secondary">
                      {tenants.find((t) => t.id === e.tenantId)?.name}
                      <StatusBadge status={e.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <ConfirmDialog
          open={disableOpen}
          onOpenChange={setDisableOpen}
          title={`Disable ${provider.name}?`}
          description="It disappears from the request wizard. No environment uses it now. You can enable it again later."
          confirmLabel="Disable provider"
          destructive
          onConfirm={() => {
            const res = setStatus(provider.id, 'disabled')
            if (res.ok) toast.success(`${provider.name} is disabled.`)
            else toast.error(res.error)
            setDisableOpen(false)
          }}
        />
      )}
    </>
  )
}
