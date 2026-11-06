import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Building2, Eye, Pause, Pencil, Play, Plus, SearchX } from 'lucide-react'
import type { Tenant } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { QuotaBar } from '@/components/shared/QuotaBar'
import { RowActions } from '@/components/shared/RowActions'
import { SearchInput } from '@/components/shared/SearchInput'
import { ActiveBadge } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { tintFor } from '@/components/shared/Avatar'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn, initials } from '@/lib/utils'
import { TenantFormDialog } from './TenantFormDialog'

export function OrgMark({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-[10px] text-xs font-bold', tintFor(name), className)} aria-hidden>
      {initials(name)}
    </span>
  )
}

export function useTenantSuspend() {
  const setTenantStatus = useAppStore((s) => s.setTenantStatus)
  const [target, setTarget] = useState<Tenant | null>(null)
  const dialog = (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(o) => !o && setTarget(null)}
      title={`Suspend ${target?.name}?`}
      description="Its people won’t be able to sign in, and running environments will stop. Data is kept, and you can reactivate the organisation at any time."
      confirmLabel="Suspend organisation"
      destructive
      onConfirm={() => {
        if (!target) return
        setTenantStatus(target.id, 'suspended')
        toast.error(`${target.name} is suspended.`, { description: 'Running environments were stopped.' })
      }}
    />
  )
  const reactivate = (t: Tenant) => {
    setTenantStatus(t.id, 'active')
    toast.success(`${t.name} is active again.`)
  }
  return { askSuspend: setTarget, reactivate, dialog }
}

export default function Tenants() {
  const loading = useSimulatedLoading()
  const tenants = useAppStore((s) => s.tenants)
  const users = useAppStore((s) => s.users)
  const environments = useAppStore((s) => s.environments)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'suspended'>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Tenant | undefined>()
  const { askSuspend, reactivate, dialog } = useTenantSuspend()

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tenants.filter(
      (t) =>
        (status === 'all' || t.status === status) &&
        (!q || [t.name, t.city, t.state, t.contactName].some((s) => s.toLowerCase().includes(q))),
    )
  }, [tenants, query, status])

  const members = (id: string) => users.filter((u) => u.tenantId === id && u.status === 'active').length
  const running = (id: string) => environments.filter((e) => e.tenantId === id && e.status === 'running').length

  const openEdit = (t: Tenant) => {
    setEditing(t)
    setFormOpen(true)
  }

  const actions = (t: Tenant) => (
    <RowActions
      label={t.name}
      actions={[
        { label: 'View details', icon: Eye, onSelect: () => navigate(`/admin/tenants/${t.id}`) },
        { label: 'Edit organisation', icon: Pencil, onSelect: () => openEdit(t) },
        t.status === 'active'
          ? { label: 'Suspend', icon: Pause, onSelect: () => askSuspend(t), destructive: true, separatorBefore: true }
          : { label: 'Reactivate', icon: Play, onSelect: () => reactivate(t), separatorBefore: true },
      ]}
    />
  )

  const columns: Column<Tenant>[] = [
    {
      key: 'name',
      header: 'Organisation',
      cell: (t) => (
        <div className="flex items-center gap-3">
          <OrgMark name={t.name} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-text-primary">{t.name}</p>
            <p className="truncate text-caption text-text-muted">
              {t.city}, {t.state}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'type', header: 'Type', cell: (t) => <span className="text-text-secondary">{t.orgType}</span>, className: 'hidden xl:table-cell' },
    { key: 'members', header: 'People', align: 'right', cell: (t) => members(t.id), className: 'hidden lg:table-cell' },
    { key: 'running', header: 'Running', align: 'right', cell: (t) => running(t.id), className: 'hidden lg:table-cell' },
    { key: 'credits', header: 'Credits used', cell: (t) => <QuotaBar compact label="" used={t.creditsUsed} total={t.creditQuota} unit="" className="min-w-[150px]" /> },
    { key: 'gpu', header: 'GPU-hours used', cell: (t) => <QuotaBar compact label="" used={t.gpuUsed} total={t.gpuQuota} unit="" className="min-w-[130px]" />, className: 'hidden lg:table-cell' },
    { key: 'status', header: 'Status', cell: (t) => <ActiveBadge active={t.status === 'active'} inactiveLabel="Suspended" /> },
    { key: 'actions', header: '', cell: actions, className: 'w-12' },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Organisations"
        description="Partner organisations on the platform, with their people, environments and monthly quota."
        actions={
          <Button
            onClick={() => {
              setEditing(undefined)
              setFormOpen(true)
            }}
          >
            <Plus /> Create organisation
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px]">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by name, city or contact" />
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        loading={loading}
        rows={rows}
        columns={columns}
        rowKey={(t) => t.id}
        rowLabel={(t) => `Open ${t.name}`}
        onRowClick={(t) => navigate(`/admin/tenants/${t.id}`)}
        empty={
          tenants.length === 0 ? (
            <EmptyState icon={Building2} title="No organisations yet" action={<Button onClick={() => setFormOpen(true)}>Create organisation</Button>} />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No organisations match these filters"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('')
                    setStatus('all')
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          )
        }
        mobileCard={(t) => (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <OrgMark name={t.name} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-text-primary">{t.name}</p>
                <p className="text-caption text-text-muted">
                  {t.city}, {t.state} · {members(t.id)} people · {running(t.id)} running
                </p>
              </div>
              <ActiveBadge active={t.status === 'active'} inactiveLabel="Suspended" />
            </div>
            <QuotaBar compact label="Credits" used={t.creditsUsed} total={t.creditQuota} unit="" />
            <QuotaBar compact label="GPU-hours" used={t.gpuUsed} total={t.gpuQuota} unit="" />
          </div>
        )}
      />

      <TenantFormDialog open={formOpen} onOpenChange={setFormOpen} tenant={editing} onCreated={(id) => navigate(`/admin/tenants/${id}`)} />
      {dialog}
    </>
  )
}
