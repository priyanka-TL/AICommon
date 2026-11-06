import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from 'recharts'
import { KeyRound, Mail, MapPin, Pause, Pencil, Play, Plus, ServerOff, UserCheck, UserX, Users as UsersIcon } from 'lucide-react'
import type { Environment, User } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { estimateCost } from '@/lib/cost'
import { formatCompact, formatDate, formatInt, formatShortDate, relativeTime } from '@/lib/format'
import { CATEGORY_LABELS, computeLabel } from '@/lib/labels'
import { axisProps, CHART_COLORS, CHART_GRID } from '@/lib/chart'
import { PageHeader } from '@/components/layout/PageHeader'
import { QuotaBar } from '@/components/shared/QuotaBar'
import { KpiCard } from '@/components/shared/KpiCard'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { Avatar } from '@/components/shared/Avatar'
import { RowActions } from '@/components/shared/RowActions'
import { ActiveBadge, StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { ChartCard, ChartTooltip } from '@/components/shared/ChartCard'
import { ActivityFeed } from '@/components/shared/ActivityFeed'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import NotFound from '@/pages/NotFound'
import { OrgMark, useTenantSuspend } from './Tenants'
import { TenantFormDialog } from './TenantFormDialog'
import { UserFormDialog } from './UserFormDialog'
import { useUserActions } from './userActions'
import { EnvironmentDrawer } from './EnvironmentDrawer'

export default function TenantDetail() {
  const { id } = useParams()
  const loading = useSimulatedLoading()
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === id))
  const allUsers = useAppStore((s) => s.users)
  const allEnvs = useAppStore((s) => s.environments)
  const allUsage = useAppStore((s) => s.usage)
  const allActivity = useAppStore((s) => s.activity)
  const catalog = useAppStore((s) => s.catalog)
  const [editOpen, setEditOpen] = useState(false)
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [envId, setEnvId] = useState<string | null>(null)
  const { askSuspend, reactivate, dialog: suspendDialog } = useTenantSuspend()
  const userActions = useUserActions()

  const members = useMemo(() => allUsers.filter((u) => u.tenantId === id), [allUsers, id])
  const envs = useMemo(() => allEnvs.filter((e) => e.tenantId === id), [allEnvs, id])
  const usage = useMemo(() => allUsage.filter((u) => u.tenantId === id).sort((a, b) => a.date.localeCompare(b.date)), [allUsage, id])
  const activity = useMemo(() => allActivity.filter((a) => a.tenantId === id).slice(0, 6), [allActivity, id])

  if (!tenant) return <NotFound message="This organisation doesn’t exist. It may have been removed after a demo reset." />

  const running = envs.filter((e) => e.status === 'running').length
  const total30 = usage.reduce((s, u) => s + u.credits, 0)
  const calls30 = usage.reduce((s, u) => s + u.apiCalls, 0)
  const byEnv = envs
    .filter((e) => e.creditsUsed > 0)
    .sort((a, b) => b.creditsUsed - a.creditsUsed)
    .map((e) => ({ name: e.spec.name, credits: e.creditsUsed }))
  const selectedEnv = envs.find((e) => e.id === envId) ?? null

  const memberColumns: Column<User>[] = [
    {
      key: 'name',
      header: 'Person',
      cell: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.name} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-text-primary">{u.name}</p>
            <p className="truncate text-caption text-text-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'title', header: 'Job title', cell: (u) => <span className="text-text-secondary">{u.title}</span>, className: 'hidden lg:table-cell' },
    { key: 'envs', header: 'Environments', align: 'right', cell: (u) => envs.filter((e) => e.ownerId === u.id).length },
    { key: 'active', header: 'Last active', cell: (u) => <span className="text-text-secondary">{relativeTime(u.lastActiveAt)}</span>, className: 'hidden lg:table-cell' },
    { key: 'status', header: 'Status', cell: (u) => <ActiveBadge active={u.status === 'active'} inactiveLabel="Deactivated" /> },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      cell: (u) => (
        <RowActions
          label={u.name}
          actions={[
            { label: 'Reset password', icon: KeyRound, onSelect: () => userActions.askReset(u), disabled: u.status !== 'active' },
            u.status === 'active'
              ? { label: 'Deactivate', icon: UserX, onSelect: () => userActions.askDeactivate(u), destructive: true, separatorBefore: true }
              : { label: 'Reactivate', icon: UserCheck, onSelect: () => userActions.reactivate(u), separatorBefore: true },
          ]}
        />
      ),
    },
  ]

  const envColumns: Column<Environment>[] = [
    {
      key: 'name',
      header: 'Environment',
      cell: (e) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-text-primary">{e.spec.name}</p>
          <p className="truncate text-caption text-text-muted">{allUsers.find((u) => u.id === e.ownerId)?.name}</p>
        </div>
      ),
    },
    { key: 'compute', header: 'Compute', cell: (e) => <span className="text-text-secondary">{computeLabel(e.spec.compute)}</span>, className: 'hidden lg:table-cell' },
    { key: 'used', header: 'Credits used', align: 'right', cell: (e) => formatInt(e.creditsUsed) },
    { key: 'est', header: 'Est. / month', align: 'right', cell: (e) => formatInt(estimateCost(e.spec, catalog).credits), className: 'hidden lg:table-cell' },
    { key: 'status', header: 'Status', cell: (e) => <StatusBadge status={e.status} /> },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Organisation"
        title={tenant.name}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4 text-text-muted" aria-hidden /> {tenant.city}, {tenant.state}
            </span>
            <span>{tenant.orgType}</span>
            <span>Joined {formatDate(tenant.createdAt)}</span>
          </span>
        }
        actions={
          <>
            {tenant.status === 'active' ? (
              <Button variant="ghost" className="text-red-text hover:text-red-text" onClick={() => askSuspend(tenant)}>
                <Pause /> Suspend
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => reactivate(tenant)}>
                <Play /> Reactivate
              </Button>
            )}
            <Button onClick={() => setEditOpen(true)}>
              <Pencil /> Edit organisation
            </Button>
          </>
        }
      />

      {tenant.status === 'suspended' && (
        <div className="mb-6 flex items-start gap-3 rounded-card bg-status-stopped-bg px-5 py-4 text-sm text-status-stopped-fg">
          <Pause className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">This organisation is suspended.</span> Its people can’t sign in and its environments are stopped. Reactivate it to
            restore access.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard loading={loading} label="People" icon={UsersIcon} value={formatInt(members.filter((m) => m.status === 'active').length)} trend={{ direction: 'flat', text: `${members.length} in total` }} />
        <KpiCard loading={loading} label="Running environments" value={formatInt(running)} trend={{ direction: 'flat', text: `${envs.length} in total` }} />
        <div className="card flex flex-col justify-center gap-4 p-5 sm:col-span-2">
          <QuotaBar compact label="Credits this month" used={tenant.creditsUsed} total={tenant.creditQuota} unit="credits" />
          <QuotaBar compact label="GPU-hours this month" used={tenant.gpuUsed} total={tenant.gpuQuota} unit="hours" />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Tabs defaultValue="members" className="min-w-0">
          <TabsList>
            <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
            <TabsTrigger value="environments">Environments ({envs.length})</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            <div className="mb-3 flex justify-end">
              <Button variant="secondary" size="compact" onClick={() => setAddUserOpen(true)} disabled={tenant.status !== 'active'}>
                <Plus /> Add person
              </Button>
            </div>
            <DataTable
              loading={loading}
              rows={members}
              columns={memberColumns}
              rowKey={(u) => u.id}
              empty={<EmptyState icon={UsersIcon} title="No one in this organisation yet" description="Add the first person so they can request environments." />}
              mobileCard={(u) => (
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-text-primary">{u.name}</p>
                    <p className="truncate text-caption text-text-muted">{u.title}</p>
                  </div>
                  <ActiveBadge active={u.status === 'active'} inactiveLabel="Deactivated" />
                </div>
              )}
            />
          </TabsContent>

          <TabsContent value="environments">
            <DataTable
              loading={loading}
              rows={envs}
              columns={envColumns}
              rowKey={(e) => e.id}
              rowLabel={(e) => `Open ${e.spec.name}`}
              onRowClick={(e) => setEnvId(e.id)}
              empty={<EmptyState icon={ServerOff} title="No environments yet" description="Environments appear here once someone in the organisation requests one." />}
              mobileCard={(e) => (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary">{e.spec.name}</p>
                    <p className="tabular text-caption text-text-muted">
                      {computeLabel(e.spec.compute)} · {formatInt(e.creditsUsed)} credits used
                    </p>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
              )}
            />
          </TabsContent>

          <TabsContent value="usage" className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <div className="card p-5">
                <p className="eyebrow">Credits, last 30 days</p>
                <p className="tabular mt-2 font-heading text-h2 text-text-primary">{formatInt(total30)}</p>
              </div>
              <div className="card p-5">
                <p className="eyebrow">Average per day</p>
                <p className="tabular mt-2 font-heading text-h2 text-text-primary">{formatInt(total30 / Math.max(usage.length, 1))}</p>
              </div>
              <div className="card col-span-2 p-5 lg:col-span-1">
                <p className="eyebrow">API calls, last 30 days</p>
                <p className="tabular mt-2 font-heading text-h2 text-text-primary">{formatCompact(calls30)}</p>
              </div>
            </div>

            <ChartCard title="Daily usage" description="Credits (area) and GPU-hours (bars), last 30 days" loading={loading} height={260}>
              {usage.length === 0 ? (
                <EmptyState icon={ServerOff} title="No usage yet" className="py-8" />
              ) : (
                <div className="grid h-full grid-rows-2 gap-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={usage} margin={{ top: 4, right: 4, left: -12, bottom: 0 }} syncId="tenant-usage">
                      <CartesianGrid stroke={CHART_GRID} vertical={false} />
                      <XAxis dataKey="date" hide />
                      <YAxis {...axisProps} tickFormatter={(v) => formatCompact(v)} width={48} />
                      <Tooltip content={<ChartTooltip labelFormatter={(d) => formatShortDate(d)} />} />
                      <Area type="monotone" dataKey="credits" name="Credits" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.15} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={usage} margin={{ top: 4, right: 4, left: -12, bottom: 0 }} syncId="tenant-usage">
                      <CartesianGrid stroke={CHART_GRID} vertical={false} />
                      <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => formatShortDate(d)} minTickGap={24} />
                      <YAxis {...axisProps} width={48} />
                      <Tooltip cursor={{ fill: 'rgb(var(--bg-subtle))' }} content={<ChartTooltip labelFormatter={(d) => formatShortDate(d)} valueFormatter={(v) => `${v} h`} />} />
                      <Bar dataKey="gpuHours" name="GPU-hours" fill={CHART_COLORS[1]} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            {byEnv.length > 0 && (
              <ChartCard title="Credits by environment" description="Since each environment started" height={Math.max(120, byEnv.length * 44)}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byEnv} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_GRID} horizontal={false} />
                    <XAxis type="number" {...axisProps} tickFormatter={(v) => formatCompact(v)} />
                    <YAxis type="category" dataKey="name" {...axisProps} width={170} tickFormatter={(n: string) => (n.length > 24 ? `${n.slice(0, 23)}…` : n)} />
                    <Tooltip cursor={{ fill: 'rgb(var(--bg-subtle))' }} content={<ChartTooltip />} />
                    <Bar dataKey="credits" name="Credits" fill={CHART_COLORS[0]} radius={[0, 6, 6, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-6">
          <section className="card p-6">
            <div className="mb-4 flex items-center gap-3">
              <OrgMark name={tenant.name} />
              <h2 className="font-heading text-h3 text-text-primary">Details</h2>
            </div>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="eyebrow">Contact</dt>
                <dd className="mt-1 text-text-primary">{tenant.contactName}</dd>
                <dd>
                  <a href={`mailto:${tenant.contactEmail}`} className="link flex items-center gap-1.5 text-caption">
                    <Mail className="size-3.5" aria-hidden /> {tenant.contactEmail}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Status</dt>
                <dd className="mt-1">
                  <ActiveBadge active={tenant.status === 'active'} inactiveLabel="Suspended" />
                </dd>
              </div>
              <div>
                <dt className="eyebrow mb-1.5">Allowed capabilities</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {tenant.allowedCapabilities.map((c) => (
                    <Tag key={c}>{CATEGORY_LABELS[c]}</Tag>
                  ))}
                </dd>
              </div>
            </dl>
          </section>
          <section className="card p-6">
            <h2 className="mb-4 font-heading text-h3 text-text-primary">Recent activity</h2>
            <ActivityFeed items={activity} loading={loading} />
          </section>
        </div>
      </div>

      <TenantFormDialog open={editOpen} onOpenChange={setEditOpen} tenant={tenant} />
      <UserFormDialog open={addUserOpen} onOpenChange={setAddUserOpen} defaultTenantId={tenant.id} />
      <EnvironmentDrawer env={selectedEnv} onClose={() => setEnvId(null)} />
      {suspendDialog}
      {userActions.dialogs}
    </>
  )
}
