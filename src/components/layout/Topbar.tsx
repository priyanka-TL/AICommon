import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Bell, ChevronRight, LogOut, Menu, Monitor, Moon, RotateCcw, Search, Server, Sun } from 'lucide-react'
import { useAppStore, useCurrentTenant, useCurrentUser, useSessionStore } from '@/store/useAppStore'
import { useScopedEnvironments, useVisibleTenants } from '@/store/selectors'
import { useTheme, type ThemePref } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/labels'
import { envPath } from '@/lib/paths'
import { Avatar } from '@/components/shared/Avatar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/controls'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { segmentLabel } from './nav'

function Breadcrumb() {
  const { pathname } = useLocation()
  const user = useCurrentUser()
  const environments = useAppStore((s) => s.environments)
  const tenants = useAppStore((s) => s.tenants)
  const catalog = useAppStore((s) => s.catalog)
  const requests = useAppStore((s) => s.requests)
  const projects = useAppStore((s) => s.projects)
  const infraProviders = useAppStore((s) => s.infraProviders)
  if (!user) return null

  const segs = pathname.split('/').filter(Boolean)
  const crumbs = segs
    .map((seg, i) => {
      const to = '/' + segs.slice(0, i + 1).join('/')
      const label =
        segmentLabel(seg, user.role) ??
        environments.find((e) => e.id === seg)?.spec.name ??
        requests.find((r) => r.id === seg)?.spec.name ??
        projects.find((p) => p.id === seg)?.name ??
        infraProviders.find((p) => p.id === seg)?.name ??
        tenants.find((t) => t.id === seg)?.name ??
        catalog.find((c) => c.id === seg)?.name ??
        seg
      return { to, label, seg }
    })
    .filter((c, i) => !(i === 1 && c.seg === 'environments'))

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 text-sm">
        {crumbs.map((c, i) => (
          <li key={c.to} className={cn('flex min-w-0 items-center gap-1', i < crumbs.length - 2 && 'hidden md:flex')}>
            {i > 0 && <ChevronRight className={cn('size-4 shrink-0 text-text-muted', i === crumbs.length - 2 && 'hidden md:block')} aria-hidden />}
            {i === crumbs.length - 1 ? (
              <span className="truncate font-semibold text-text-primary" aria-current="page">
                {c.label}
              </span>
            ) : (
              <Link to={c.to} className="truncate text-text-secondary hover:text-text-primary">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

function TenantFilter() {
  const tenants = useVisibleTenants(true)
  const filter = useSessionStore((s) => s.tenantFilter)
  const setFilter = useSessionStore((s) => s.setTenantFilter)
  return (
    <Select value={filter} onValueChange={setFilter}>
      <SelectTrigger className="h-10 w-44 sm:w-52" aria-label="Tenant filter">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All tenants</SelectItem>
        {tenants.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function QaScopeSwitch() {
  const on = useSessionStore((s) => s.qaTenantWide)
  const set = useSessionStore((s) => s.setQaTenantWide)
  return (
    <label className="hidden shrink-0 cursor-pointer items-center gap-2 text-caption font-semibold text-text-secondary sm:flex">
      <Switch checked={on} onCheckedChange={set} aria-label="Tenant-wide view" />
      Tenant-wide
    </label>
  )
}

function GlobalSearch() {
  const user = useCurrentUser()
  const environments = useScopedEnvironments(true)
  const tenants = useAppStore((s) => s.tenants)
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return []
    return environments.filter((e) => e.spec.name.toLowerCase().includes(query) || e.spec.description.toLowerCase().includes(query)).slice(0, 6)
  }, [q, environments])

  if (!user) return null

  const go = (envId: string) => {
    setQ('')
    setOpen(false)
    navigate(envPath(user.role, envId))
  }

  return (
    <div className="relative hidden w-64 xl:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' && results[0]) go(results[0].id)
        }}
        placeholder="Search environments"
        aria-label="Search environments"
        className="h-10 w-full rounded-control border border-border bg-bg-subtle pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-indigo focus:bg-bg-surface"
      />
      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-control border border-border bg-bg-surface shadow-pop">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-caption text-text-secondary">No environments match “{q}”.</p>
          ) : (
            <ul className="p-1">
              {results.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => go(e.id)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-bg-subtle"
                  >
                    <Server className="size-4 shrink-0 text-text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text-primary">{e.spec.name}</span>
                      {user.role === 'super_admin' && <span className="block truncate text-caption text-text-muted">{tenants.find((t) => t.id === e.tenantId)?.name}</span>}
                    </span>
                    <StatusBadge status={e.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Notifications() {
  const userId = useSessionStore((s) => s.currentUserId)
  const all = useAppStore((s) => s.notifications)
  const markAll = useAppStore((s) => s.markNotificationsRead)
  const markOne = useAppStore((s) => s.markNotificationRead)
  const navigate = useNavigate()
  const items = all.filter((n) => n.userId === userId).slice(0, 10)
  const unread = all.filter((n) => n.userId === userId && !n.read).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative">
          <Bell className="size-5" />
          {unread > 0 && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-pink ring-2 ring-bg-surface" aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(380px,calc(100vw-32px))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-heading text-h3">Notifications</p>
          {unread > 0 && (
            <button type="button" onClick={markAll} className="link text-caption">
              Mark all as read
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-text-secondary">You’re all caught up.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto p-1">
            {items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onSelect={() => {
                  markOne(n.id)
                  if (n.link) navigate(n.link)
                }}
                className="items-start gap-3 py-2.5"
              >
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-pink')} aria-hidden />
                <span className="flex flex-col gap-0.5">
                  <span className={cn('text-sm', n.read ? 'text-text-secondary' : 'font-semibold text-text-primary')}>{n.text}</span>
                  <span className="text-caption text-text-muted">{relativeTime(n.at)}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu() {
  const user = useCurrentUser()
  const tenant = useCurrentTenant()
  const logout = useAppStore((s) => s.logout)
  const resetSampleData = useAppStore((s) => s.resetSampleData)
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const [confirmReset, setConfirmReset] = useState(false)
  if (!user) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex items-center gap-2.5 rounded-control p-1 pr-2 hover:bg-bg-subtle" aria-label="Open user menu">
            <Avatar name={user.name} />
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-sm font-semibold text-text-primary">{user.name}</span>
              <span className="block text-caption text-text-muted">{ROLE_LABELS[user.role]}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <Avatar name={user.name} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-text-primary">{user.name}</p>
              <p className="truncate text-caption text-text-secondary">{user.email}</p>
              <p className="truncate text-caption text-text-muted">
                {tenant?.name} · {ROLE_LABELS[user.role]}
              </p>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePref)}>
            <DropdownMenuRadioItem value="light" onSelect={(e) => e.preventDefault()}>
              <Sun /> Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark" onSelect={(e) => e.preventDefault()}>
              <Moon /> Dark
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system" onSelect={(e) => e.preventDefault()}>
              <Monitor /> Match system
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirmReset(true)}>
            <RotateCcw /> Reset sample data
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              logout()
              navigate('/login')
            }}
          >
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset sample data?"
        description="This restores every tenant, request and environment to the starting state, in every open tab. Anything created since will be removed. You stay signed in."
        confirmLabel="Reset sample data"
        cancelLabel="Keep my changes"
        destructive
        onConfirm={() => {
          resetSampleData()
          toast.success('Sample data reset to the starting state.')
        }}
      />
    </>
  )
}

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const user = useCurrentUser()
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-bg-surface/95 px-4 backdrop-blur md:px-8">
      <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={onOpenMenu} aria-label="Open navigation">
        <Menu className="size-5" />
      </Button>
      <div className="min-w-0 flex-1">
        <Breadcrumb />
      </div>
      {user?.role === 'super_admin' && <TenantFilter />}
      {user?.role === 'qa' && user.qa?.tenantWideAllowed && <QaScopeSwitch />}
      <GlobalSearch />
      <Notifications />
      <UserMenu />
    </header>
  )
}
