import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Building2, Eye, Lock, Pause, Pencil, Play, Plus, SearchX } from 'lucide-react'
import type { Tenant } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { tenantAllocated } from '@/lib/quota'
import { cn, initials } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { QuotaBar } from '@/components/shared/QuotaBar'
import { RowActions } from '@/components/shared/RowActions'
import { SearchInput } from '@/components/shared/SearchInput'
import { ActiveBadge, Tag } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { tintFor } from '@/components/shared/Avatar'
import { Button } from '@/components/ui/button'
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
      description="Its people won’t be able to sign in, and active environments will stop. Data is kept, and you can reactivate the tenant at any time."
      confirmLabel="Suspend tenant"
      destructive
      onConfirm={() => {
        if (!target) return
        setTenantStatus(target.id, 'suspended')
        toast.success(`${target.name} is suspended.`)
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
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Tenant | undefined>()
  const { askSuspend, reactivate, dialog } = useTenantSuspend()

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tenants.filter((t) => !q || [t.name, t.code, t.city, t.contactName].some((s) => s.toLowerCase().includes(q))).sort((a, b) => Number(b.isSystem) - Number(a.isSystem))
  }, [tenants, query])

  const columns: Column<Tenant>[] = [
    {
      key: 'name',
      header: 'Tenant',
      cell: (t) => (
        <div className="flex items-center gap-3">
          <OrgMark name={t.name} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-semibold text-text-primary">
              {t.name} {t.isSystem && <Tag>System</Tag>}
            </p>
            <p className="truncate font-mono text-caption text-text-muted">{t.code}</p>
          </div>
        </div>
      ),
    },
    { key: 'people', header: 'People', align: 'right', cell: (t) => users.filter((u) => u.tenantId === t.id && u.status === 'active').length, className: 'hidden lg:table-cell' },
    { key: 'admins', header: 'Tenant Admins', cell: (t) => <span className="text-text-secondary">{t.isSystem ? '—' : users.filter((u) => u.tenantId === t.id && u.role === 'tenant_admin').map((u) => u.name).join(', ') || 'None yet'}</span>, className: 'hidden xl:table-cell' },
    {
      key: 'gpus',
      header: 'GPUs allocated',
      cell: (t) => (t.isSystem ? <span className="text-text-muted">—</span> : <QuotaBar compact label="" used={tenantAllocated(environments, t.id).gpus} total={t.quota.gpus} unit="" className="min-w-[130px]" />),
    },
    {
      key: 'storage',
      header: 'Storage',
      cell: (t) => (t.isSystem ? <span className="text-text-muted">—</span> : <QuotaBar compact label="" used={tenantAllocated(environments, t.id).storageGb} total={t.quota.storageGb} unit="GB" className="min-w-[150px]" />),
      className: 'hidden lg:table-cell',
    },
    { key: 'status', header: 'Status', cell: (t) => <ActiveBadge active={t.status === 'active'} inactiveLabel="Suspended" /> },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      cell: (t) =>
        t.isSystem ? (
          <span className="flex justify-end pr-2 text-text-muted" title="The system tenant can’t be changed">
            <Lock className="size-4" aria-label="Locked" />
          </span>
        ) : (
          <RowActions
            label={t.name}
            actions={[
              { label: 'View details', icon: Eye, onSelect: () => navigate(`/super-admin/tenants/${t.id}`) },
              { label: 'Edit tenant and quota', icon: Pencil, onSelect: () => { setEditing(t); setFormOpen(true) } },
              t.status === 'active'
                ? { label: 'Suspend', icon: Pause, onSelect: () => askSuspend(t), destructive: true, separatorBefore: true }
                : { label: 'Reactivate', icon: Play, onSelect: () => reactivate(t), separatorBefore: true },
            ]}
          />
        ),
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Tenant management"
        title="Tenants"
        description="Partner organisations on the platform, with their Tenant Admins and quota. The Default tenant holds platform administrators and can’t be changed."
        actions={
          <Button onClick={() => { setEditing(undefined); setFormOpen(true) }}>
            <Plus /> Create tenant
          </Button>
        }
      />
      <SearchInput value={query} onChange={setQuery} placeholder="Search by name, code, city or contact" className="mb-4" />
      <DataTable
        loading={loading}
        rows={rows}
        columns={columns}
        rowKey={(t) => t.id}
        rowLabel={(t) => `Open ${t.name}`}
        onRowClick={(t) => !t.isSystem && navigate(`/super-admin/tenants/${t.id}`)}
        empty={query ? <EmptyState icon={SearchX} title="No tenants match your search" /> : <EmptyState icon={Building2} title="No tenants yet" />}
        mobileCard={(t) => (
          <div className="flex items-center gap-3">
            <OrgMark name={t.name} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold text-text-primary">
                {t.name} {t.isSystem && <Tag>System</Tag>}
              </p>
              <p className="font-mono text-caption text-text-muted">{t.code}</p>
            </div>
            <ActiveBadge active={t.status === 'active'} inactiveLabel="Suspended" />
          </div>
        )}
      />
      <TenantFormDialog open={formOpen} onOpenChange={setFormOpen} tenant={editing} onCreated={(id) => navigate(`/super-admin/tenants/${id}`)} />
      {dialog}
    </>
  )
}
