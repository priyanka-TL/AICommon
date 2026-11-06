import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, Plus, SearchX, UserCheck, UserX, Users as UsersIcon } from 'lucide-react'
import type { Role, User } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { formatDate, relativeTime } from '@/lib/format'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { Avatar } from '@/components/shared/Avatar'
import { RowActions } from '@/components/shared/RowActions'
import { SearchInput } from '@/components/shared/SearchInput'
import { ActiveBadge, StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserFormDialog } from './UserFormDialog'
import { useUserActions } from './userActions'

const PLATFORM = 'platform'

export default function Users() {
  const loading = useSimulatedLoading()
  const users = useAppStore((s) => s.users)
  const tenants = useAppStore((s) => s.tenants)
  const [query, setQuery] = useState('')
  const [org, setOrg] = useState('all')
  const [role, setRole] = useState<'all' | Role>('all')
  const [status, setStatus] = useState<'all' | User['status']>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const actions = useUserActions()

  const tenantName = (id: string | null) => (id ? (tenants.find((t) => t.id === id)?.name ?? '') : 'ShikshaLokam')
  const selected = users.find((u) => u.id === selectedId) ?? null

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users
      .filter((u) => {
        if (org === PLATFORM && u.tenantId !== null) return false
        if (org !== 'all' && org !== PLATFORM && u.tenantId !== org) return false
        if (role !== 'all' && u.role !== role) return false
        if (status !== 'all' && u.status !== status) return false
        return !q || [u.name, u.email, u.title].some((s) => s.toLowerCase().includes(q))
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [users, query, org, role, status])

  const filtersActive = query || org !== 'all' || role !== 'all' || status !== 'all'

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
    { key: 'org', header: 'Organisation', cell: (u) => <span className="text-text-primary">{tenantName(u.tenantId)}</span> },
    { key: 'title', header: 'Job title', cell: (u) => <span className="text-text-secondary">{u.title}</span>, className: 'hidden xl:table-cell' },
    { key: 'role', header: 'Role', cell: (u) => <Tag>{u.role === 'admin' ? 'Admin' : 'User'}</Tag> },
    {
      key: 'active',
      header: 'Last active',
      cell: (u) => (
        <span className="text-text-secondary" title={formatDate(u.lastActiveAt)}>
          {relativeTime(u.lastActiveAt)}
        </span>
      ),
      className: 'hidden lg:table-cell',
    },
    { key: 'status', header: 'Status', cell: (u) => <ActiveBadge active={u.status === 'active'} inactiveLabel="Deactivated" /> },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      cell: (u) => (
        <RowActions
          label={u.name}
          actions={[
            { label: 'Reset password', icon: KeyRound, onSelect: () => actions.askReset(u), disabled: u.status !== 'active' },
            u.status === 'active'
              ? { label: 'Deactivate', icon: UserX, onSelect: () => actions.askDeactivate(u), destructive: true, disabled: actions.isSelf(u), separatorBefore: true }
              : { label: 'Reactivate', icon: UserCheck, onSelect: () => actions.reactivate(u), separatorBefore: true },
          ]}
        />
      ),
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Users"
        description="Everyone with access to the platform: developers in partner organisations and ShikshaLokam staff."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus /> Add user
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_220px_150px_170px]">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by name, email or job title" className="sm:col-span-2 lg:col-span-1" />
        <Select value={org} onValueChange={setOrg}>
          <SelectTrigger aria-label="Filter by organisation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All organisations</SelectItem>
            <SelectItem value={PLATFORM}>ShikshaLokam (admins)</SelectItem>
            {tenants.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger aria-label="Filter by role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
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
          filtersActive ? (
            <EmptyState
              icon={SearchX}
              title="No people match these filters"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('')
                    setOrg('all')
                    setRole('all')
                    setStatus('all')
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState icon={UsersIcon} title="No users yet" action={<Button onClick={() => setFormOpen(true)}>Add user</Button>} />
          )
        }
        mobileCard={(u) => (
          <div className="flex items-center gap-3">
            <Avatar name={u.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-text-primary">{u.name}</p>
              <p className="truncate text-caption text-text-muted">
                {tenantName(u.tenantId)} · {u.role === 'admin' ? 'Admin' : 'User'}
              </p>
            </div>
            <ActiveBadge active={u.status === 'active'} inactiveLabel="Deactivated" />
          </div>
        )}
      />

      <UserDrawer user={selected} onClose={() => setSelectedId(null)} actions={actions} />
      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} defaultTenantId={org !== 'all' && org !== PLATFORM ? org : undefined} />
      {actions.dialogs}
    </>
  )
}

function UserDrawer({ user, onClose, actions }: { user: User | null; onClose: () => void; actions: ReturnType<typeof useUserActions> }) {
  const tenants = useAppStore((s) => s.tenants)
  const environments = useAppStore((s) => s.environments)
  if (!user) return <Sheet open={false} onOpenChange={() => undefined} />
  const tenant = tenants.find((t) => t.id === user.tenantId)
  const owned = environments.filter((e) => e.ownerId === user.id)
  const self = actions.isSelf(user)

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <div className="flex items-center gap-4 border-b border-border px-6 pb-5 pr-14 pt-6">
          <Avatar name={user.name} size="lg" />
          <div className="min-w-0">
            <SheetTitle className="font-heading text-h2 text-text-primary">{user.name}</SheetTitle>
            <SheetDescription className="truncate text-sm text-text-secondary">{user.email}</SheetDescription>
            <div className="mt-2 flex flex-wrap gap-2">
              <ActiveBadge active={user.status === 'active'} inactiveLabel="Deactivated" />
              <Tag>{user.role === 'admin' ? 'Admin' : 'User'}</Tag>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <section className="border-b border-border px-6 py-5">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="eyebrow">Organisation</dt>
                <dd className="mt-1">
                  {tenant ? (
                    <Link to={`/admin/tenants/${tenant.id}`} className="link">
                      {tenant.name}
                    </Link>
                  ) : (
                    <span className="text-text-primary">ShikshaLokam</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Job title</dt>
                <dd className="mt-1 text-text-primary">{user.title}</dd>
              </div>
              <div>
                <dt className="eyebrow">Last active</dt>
                <dd className="mt-1 text-text-primary">{relativeTime(user.lastActiveAt)}</dd>
              </div>
            </dl>
          </section>

          {user.role === 'user' && (
            <section className="px-6 py-5">
              <h3 className="mb-3 font-heading text-h3 text-text-primary">Environments ({owned.length})</h3>
              {owned.length === 0 ? (
                <p className="text-sm text-text-secondary">{user.name.split(' ')[0]} doesn’t own any environments yet.</p>
              ) : (
                <ul className="divide-y divide-border rounded-control border border-border">
                  {owned.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <Link to={`/admin/environments?focus=${e.id}`} className="min-w-0 truncate text-sm font-semibold text-text-primary hover:text-indigo-text">
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

        <div className="flex flex-col gap-2 border-t border-border px-6 py-4 sm:flex-row-reverse sm:items-center">
          {user.status === 'active' ? (
            <>
              <Button variant="secondary" onClick={() => actions.askReset(user)}>
                <KeyRound /> Reset password
              </Button>
              {self ? (
                <Tooltip content="You can’t deactivate your own account.">
                  <span className="sm:mr-auto">
                    <Button variant="ghost" disabled className="text-red-text">
                      <UserX /> Deactivate
                    </Button>
                  </span>
                </Tooltip>
              ) : (
                <Button variant="ghost" className="text-red-text hover:text-red-text sm:mr-auto" onClick={() => actions.askDeactivate(user)}>
                  <UserX /> Deactivate
                </Button>
              )}
            </>
          ) : (
            <Button onClick={() => actions.reactivate(user)}>
              <UserCheck /> Reactivate user
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
