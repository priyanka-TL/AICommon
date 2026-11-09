import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Mail, MapPin, Pause, Pencil, Play, ServerOff, ShieldCheck, UserRound, Users as UsersIcon } from 'lucide-react'
import type { Environment, User } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { formatCompact, formatDate, formatShortDate, plural, relativeTime } from '@/lib/format'
import { computeLabel, ROLE_LABELS } from '@/lib/labels'
import { tenantAllocated } from '@/lib/quota'
import { envPath } from '@/lib/paths'
import { axisProps, CHART_COLORS, CHART_GRID } from '@/lib/chart'
import { PageHeader } from '@/components/layout/PageHeader'
import { TenantProviders } from '@/components/shared/TenantProviders'
import { KpiCard } from '@/components/shared/KpiCard'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { Avatar } from '@/components/shared/Avatar'
import { RowActions } from '@/components/shared/RowActions'
import { ActiveBadge, StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { ChartCard, ChartTooltip } from '@/components/shared/ChartCard'
import { ActivityFeed } from '@/components/shared/ActivityFeed'
import { ResourceQuota } from '@/components/shared/ResourceQuota'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import NotFound from '@/pages/NotFound'
import { OrgMark, useTenantSuspend } from './Tenants'
import { TenantFormDialog } from './TenantFormDialog'

export default function TenantDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === id))
  const allUsers = useAppStore((s) => s.users)
  const allEnvs = useAppStore((s) => s.environments)
  const allProjects = useAppStore((s) => s.projects)
  const allDeployments = useAppStore((s) => s.deployments)
  const allUsage = useAppStore((s) => s.usage)
  const allAudit = useAppStore((s) => s.audit)
  const updateUser = useAppStore((s) => s.updateUser)
  const [editOpen, setEditOpen] = useState(false)
  const { askSuspend, reactivate, dialog } = useTenantSuspend()

  const members = useMemo(() => allUsers.filter((u) => u.tenantId === id), [allUsers, id])
  const envs = useMemo(() => allEnvs.filter((e) => e.tenantId === id), [allEnvs, id])
  const usage = useMemo(() => allUsage.filter((u) => u.tenantId === id).sort((a, b) => a.date.localeCompare(b.date)), [allUsage, id])
  const audit = useMemo(() => allAudit.filter((a) => a.tenantId === id).slice(0, 8), [allAudit, id])

  if (!tenant || tenant.isSystem) return <NotFound message="This tenant doesn’t exist, or it’s the system tenant, which has no details to show." />

  const used = tenantAllocated(allEnvs, tenant.id)
  const projects = allProjects.filter((p) => p.tenantId === tenant.id)

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
    { key: 'role', header: 'Role', cell: (u) => <Tag>{ROLE_LABELS[u.role]}</Tag> },
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
            u.role === 'user'
              ? { label: 'Make Tenant Admin', icon: ShieldCheck, onSelect: () => { updateUser(u.id, { role: 'tenant_admin' }); toast.success(`${u.name} is now a Tenant Admin.`) }, disabled: u.status !== 'active' }
              : { label: 'Change to User', icon: UserRound, onSelect: () => { updateUser(u.id, { role: 'user' }); toast.success(`${u.name} is now a User.`) } },
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
          <p className="truncate text-caption text-text-muted">{[...new Set(allDeployments.filter((d) => d.envId === e.id).map((d) => d.projectId))].map((pid) => projects.find((p) => p.id === pid)?.name).filter(Boolean).join(', ') || 'No projects yet'}</p>
        </div>
      ),
    },
    { key: 'compute', header: 'Compute', cell: (e) => <span className="text-text-secondary">{computeLabel(e.spec.compute)}</span>, className: 'hidden lg:table-cell' },
    { key: 'status', header: 'Status', cell: (e) => <StatusBadge status={e.status} /> },
  ]

  return (
    <>
      <PageHeader
        eyebrow={`Tenant · ${tenant.code}`}
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
              <Pencil /> Edit tenant and quota
            </Button>
          </>
        }
      />

      {tenant.status === 'suspended' && (
        <div className="mb-6 rounded-card bg-status-stopped-bg px-5 py-4 text-sm text-status-stopped-fg">
          <span className="font-semibold">This tenant is suspended.</span> Its people can’t sign in and its environments are stopped.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="People" icon={UsersIcon} value={String(members.filter((m) => m.status === 'active').length)} trend={{ direction: 'flat', text: plural(members.filter((m) => m.role === 'tenant_admin').length, 'Tenant Admin') }} />
        <KpiCard label="Projects" value={String(projects.filter((p) => p.status === 'active').length)} trend={{ direction: 'flat', text: `${projects.length} in total` }} />
        <KpiCard label="Active environments" value={String(envs.filter((e) => e.status === 'active').length)} trend={{ direction: 'flat', text: `${envs.filter((e) => e.status !== 'terminated').length} not terminated` }} />
      </div>

      <TenantProviders tenantId={tenant.id} className="mt-6" manage />

      <section className="card mt-6 p-6">
        <h2 className="mb-4 font-heading text-h3 text-text-primary">Quota and allocation</h2>
        <ResourceQuota used={used} total={tenant.quota} className="lg:grid-cols-4" />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Tabs defaultValue="members" className="min-w-0">
          <TabsList>
            <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
            <TabsTrigger value="environments">Environments ({envs.length})</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
          </TabsList>
          <TabsContent value="members">
            <DataTable
              rows={members}
              columns={memberColumns}
              rowKey={(u) => u.id}
              empty={<EmptyState icon={UsersIcon} title="No one in this tenant yet" />}
              mobileCard={(u) => (
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-text-primary">{u.name}</p>
                    <p className="text-caption text-text-muted">{ROLE_LABELS[u.role]}</p>
                  </div>
                  <ActiveBadge active={u.status === 'active'} inactiveLabel="Deactivated" />
                </div>
              )}
            />
          </TabsContent>
          <TabsContent value="environments">
            <DataTable
              rows={envs}
              columns={envColumns}
              rowKey={(e) => e.id}
              onRowClick={(e) => navigate(envPath('super_admin', e.id))}
              rowLabel={(e) => `Open ${e.spec.name}`}
              empty={<EmptyState icon={ServerOff} title="No environments yet" />}
              mobileCard={(e) => (
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-text-primary">{e.spec.name}</p>
                  <StatusBadge status={e.status} />
                </div>
              )}
            />
          </TabsContent>
          <TabsContent value="usage">
            <ChartCard title="Daily credits" description="Last 30 days" height={260}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={usage} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => formatShortDate(d)} minTickGap={24} />
                  <YAxis {...axisProps} tickFormatter={(v) => formatCompact(v)} width={48} />
                  <Tooltip content={<ChartTooltip labelFormatter={(d) => formatShortDate(d)} />} />
                  <Area type="monotone" dataKey="credits" name="Credits" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </TabsContent>
        </Tabs>
        <div className="flex flex-col gap-6">
          <section className="card p-6">
            <div className="mb-4 flex items-center gap-3">
              <OrgMark name={tenant.name} />
              <h2 className="font-heading text-h3 text-text-primary">Profile</h2>
            </div>
            <p className="mb-4 text-sm text-text-secondary">{tenant.description}</p>
            <p className="eyebrow">Contact</p>
            <p className="mt-1 text-sm text-text-primary">{tenant.contactName}</p>
            <a href={`mailto:${tenant.contactEmail}`} className="link flex items-center gap-1.5 text-caption">
              <Mail className="size-3.5" aria-hidden /> {tenant.contactEmail}
            </a>
          </section>
          <section className="card p-6">
            <h2 className="mb-4 font-heading text-h3 text-text-primary">Recent activity</h2>
            <ActivityFeed items={audit} />
          </section>
        </div>
      </div>
      <TenantFormDialog open={editOpen} onOpenChange={setEditOpen} tenant={tenant} />
      {dialog}
    </>
  )
}
