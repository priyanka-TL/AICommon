import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { KeyRound, Pencil, Plus, SearchX, UserCheck, UserX, Users as UsersIcon } from 'lucide-react'
import type { Role, User } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useScope, useScopedUsers } from '@/store/selectors'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { formatDate, relativeTime } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/labels'
import { envPath } from '@/lib/paths'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { Avatar } from '@/components/shared/Avatar'
import { RowActions } from '@/components/shared/RowActions'
import { SearchInput } from '@/components/shared/SearchInput'
import { ActiveBadge, StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserFormDialog } from './UserFormDialog'

export function useUserActions() {
  const setUserStatus = useAppStore((s) => s.setUserStatus)
  const resetPassword = useAppStore((s) => s.resetPassword)
  const [deactivate, setDeactivate] = useState<User | null>(null)
  const [reset, setReset] = useState<User | null>(null)
  const dialogs = (
    <>
      <ConfirmDialog
        open={!!deactivate}
        onOpenChange={(o) => !o && setDeactivate(null)}
        title={`Deactivate ${deactivate?.name}?`}
        description="They will be signed out and won’t be able to sign in. Their environments keep running. You can reactivate them later."
        confirmLabel="Deactivate user"
        destructive
        onConfirm={() => {
          if (!deactivate) return
          setUserStatus(deactivate.id, 'deactivated')
          toast.success(`${deactivate.name} is deactivated.`)
        }}
      />
      <ConfirmDialog
        open={!!reset}
        onOpenChange={(o) => !o && setReset(null)}
        title={`Reset password for ${reset?.name}?`}
        description="Their password is reset to the sample password, and they’re told to choose a new one when they next sign in."
        confirmLabel="Reset password"
        onConfirm={() => {
          if (!reset) return
          resetPassword(reset.id)
          toast.success(`Password reset for ${reset.name}.`)
        }}
      />
    </>
  )
  const reactivate = (u: User) => {
    setUserStatus(u.id, 'active')
    toast.success(`${u.name} can sign in again.`)
  }
  return { askDeactivate: setDeactivate, askReset: setReset, reactivate, dialogs }
}

export default function UsersPage() {
  const loading = useSimulatedLoading()
  const scope = useScope()!
  const users = useScopedUsers()
  const tenants = useAppStore((s) => s.tenants)
  const projects = useAppStore((s) => s.projects)
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<'all' | Role>('all')
  const [status, setStatus] = useState<'all' | User['status']>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<User | undefined>()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const actions = useUserActions()
  const isSuper = scope.role === 'super_admin'
  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? ''
  const selected = users.find((u) => u.id === selectedId) ?? null

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users
      .filter((u) => (role === 'all' || u.role === role) && (status === 'all' || u.status === status))
      .filter((u) => !q || [u.name, u.email, u.title].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => (a.role === 'super_admin' ? -1 : b.role === 'super_admin' ? 1 : a.name.localeCompare(b.name)))
  }, [users, query, role, status])

  const canManage = (u: User) => u.role !== 'super_admin' && u.id !== scope.user.id
  const openEdit = (u: User) => {
    setEditing(u)
    setFormOpen(true)
  }

  const columns: Column<User>[] = [
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
    ...(isSuper ? [{ key: 'tenant', header: 'Tenant', cell: (u: User) => <span>{tenantName(u.tenantId)}</span> }] : []),
    { key: 'role', header: 'Role', cell: (u) => <Tag>{ROLE_LABELS[u.role]}</Tag> },
    {
      key: 'projects',
      header: 'Projects',
      align: 'right',
      cell: (u) => projects.filter((p) => p.memberIds.includes(u.id)).length,
      className: 'hidden lg:table-cell',
    },
    { key: 'active', header: 'Last active', cell: (u) => <span className="text-text-secondary" title={formatDate(u.lastActiveAt)}>{relativeTime(u.lastActiveAt)}</span>, className: 'hidden lg:table-cell' },
    { key: 'status', header: 'Status', cell: (u) => <ActiveBadge active={u.status === 'active'} inactiveLabel="Deactivated" /> },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      cell: (u) =>
        canManage(u) ? (
          <RowActions
            label={u.name}
            actions={[
              { label: 'Edit', icon: Pencil, onSelect: () => openEdit(u) },
              { label: 'Reset password', icon: KeyRound, onSelect: () => actions.askReset(u), disabled: u.status !== 'active' },
              u.status === 'active'
                ? { label: 'Deactivate', icon: UserX, onSelect: () => actions.askDeactivate(u), destructive: true, separatorBefore: true }
                : { label: 'Activate', icon: UserCheck, onSelect: () => actions.reactivate(u), separatorBefore: true },
            ]}
          />
        ) : null,
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow={isSuper ? 'All tenants' : tenantName(scope.user.tenantId)}
        title="Users"
        description={isSuper ? 'Everyone with access to the platform. Make someone a Tenant Admin by editing their role.' : 'People in your tenant. You can add Users and Tenant Admins.'}
        actions={
          <Button
            onClick={() => {
              setEditing(undefined)
              setFormOpen(true)
            }}
          >
            <Plus /> Add user
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_170px]">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by name, email or job title" />
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger aria-label="Filter by role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {isSuper && <SelectItem value="super_admin">Super Admin</SelectItem>}
            <SelectItem value="tenant_admin">Tenant Admin</SelectItem>
            <SelectItem value="user">User</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="deactivated">Deactivated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        loading={loading}
        rows={rows}
        columns={columns}
        rowKey={(u) => u.id}
        rowLabel={(u) => `Open ${u.name}`}
        onRowClick={(u) => setSelectedId(u.id)}
        empty={
          query || role !== 'all' || status !== 'all' ? (
            <EmptyState icon={SearchX} title="No people match these filters" action={<Button variant="secondary" onClick={() => { setQuery(''); setRole('all'); setStatus('all') }}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={UsersIcon} title="No users yet" />
          )
        }
        mobileCard={(u) => (
          <div className="flex items-center gap-3">
            <Avatar name={u.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-text-primary">{u.name}</p>
              <p className="truncate text-caption text-text-muted">
                {isSuper ? `${tenantName(u.tenantId)} · ` : ''}
                {ROLE_LABELS[u.role]}
              </p>
            </div>
            <ActiveBadge active={u.status === 'active'} inactiveLabel="Deactivated" />
          </div>
        )}
      />

      <UserSheet user={selected} onClose={() => setSelectedId(null)} actions={actions} canManage={selected ? canManage(selected) : false} onEdit={openEdit} />
      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} defaultTenantId={scope.tenantId ?? undefined} />
      {actions.dialogs}
    </>
  )
}

function UserSheet({
  user,
  onClose,
  actions,
  canManage,
  onEdit,
}: {
  user: User | null
  onClose: () => void
  actions: ReturnType<typeof useUserActions>
  canManage: boolean
  onEdit: (u: User) => void
}) {
  const scope = useScope()!
  const tenants = useAppStore((s) => s.tenants)
  const projects = useAppStore((s) => s.projects)
  const environments = useAppStore((s) => s.environments)
  return (
    <Sheet open={!!user} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        {user && (
          <>
            <div className="flex items-center gap-4 border-b border-border px-6 pb-5 pr-14 pt-6">
              <Avatar name={user.name} size="lg" />
              <div className="min-w-0">
                <SheetTitle className="font-heading text-h2 text-text-primary">{user.name}</SheetTitle>
                <SheetDescription className="truncate text-sm text-text-secondary">{user.email}</SheetDescription>
                <div className="mt-2 flex flex-wrap gap-2">
                  <ActiveBadge active={user.status === 'active'} inactiveLabel="Deactivated" />
                  <Tag>{ROLE_LABELS[user.role]}</Tag>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <section className="border-b border-border px-6 py-5">
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="eyebrow">Tenant</dt>
                    <dd className="mt-1 text-text-primary">{tenants.find((t) => t.id === user.tenantId)?.name}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Job title</dt>
                    <dd className="mt-1 text-text-primary">{user.title}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Last active</dt>
                    <dd className="mt-1 text-text-primary">{relativeTime(user.lastActiveAt)}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Projects</dt>
                    <dd className="mt-1 text-text-primary">{projects.filter((p) => p.memberIds.includes(user.id)).map((p) => p.name).join(', ') || 'None'}</dd>
                  </div>
                </dl>
              </section>
              {user.role !== 'super_admin' && (
                <section className="px-6 py-5">
                  <h3 className="mb-3 font-heading text-h3 text-text-primary">Environments they own</h3>
                  {environments.filter((e) => e.ownerId === user.id).length === 0 ? (
                    <p className="text-sm text-text-secondary">None.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-control border border-border">
                      {environments
                        .filter((e) => e.ownerId === user.id)
                        .map((e) => (
                          <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                            <Link to={envPath(scope.role, e.id)} className="min-w-0 truncate text-sm font-semibold text-text-primary hover:text-indigo-text">
                              {e.spec.name}
                            </Link>
                            <StatusBadge status={e.status} />
                          </li>
                        ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
            {canManage && (
              <div className="flex flex-col gap-2 border-t border-border px-6 py-4 sm:flex-row-reverse sm:items-center">
                {user.status === 'active' ? (
                  <>
                    <Button variant="secondary" onClick={() => onEdit(user)}>
                      <Pencil /> Edit
                    </Button>
                    <Button variant="secondary" onClick={() => actions.askReset(user)}>
                      <KeyRound /> Reset password
                    </Button>
                    <Button variant="ghost" className="text-red-text hover:text-red-text sm:mr-auto" onClick={() => actions.askDeactivate(user)}>
                      <UserX /> Deactivate
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => actions.reactivate(user)}>
                    <UserCheck /> Activate user
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
