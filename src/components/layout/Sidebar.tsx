import { NavLink } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useAppStore, useCurrentTenant, useCurrentUser } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import { ROLE_LABELS } from '@/lib/labels'
import { Wordmark } from '@/components/shared/Wordmark'
import { Tooltip } from '@/components/ui/tooltip'
import { NAV } from './nav'

interface SidebarProps {
  collapsed?: boolean
  onToggleCollapse?: () => void
  onNavigate?: () => void
}

export function Sidebar({ collapsed = false, onToggleCollapse, onNavigate }: SidebarProps) {
  const user = useCurrentUser()
  const tenant = useCurrentTenant()
  const counts = useAppStore(
    useShallow((s) => {
    if (!user) return { tenantReviews: 0, escalated: 0 }
    const mine = (tenantId: string) => user.role === 'super_admin' || tenantId === user.tenantId
    const open = (x: { status: string }) => ['submitted', 'under_review'].includes(x.status)
    return {
      tenantReviews:
        s.requests.filter((r) => mine(r.tenantId) && ['submitted', 'under_review', 'resubmitted'].includes(r.status) && r.raisedByRole !== 'tenant_admin').length +
        s.suggestions.filter((x) => mine(x.tenantId) && !x.forwarded && open(x)).length,
      escalated:
        s.requests.filter((r) => r.status === 'escalated').length +
        s.quotaRequests.filter((q) => q.status === 'pending').length +
        s.suggestions.filter((x) => (x.forwarded && open(x)) || x.status === 'approved_tenant').length,
      }
    }),
  )
  if (!user) return null
  const sections = NAV[user.role]

  return (
    <div className="flex h-full flex-col bg-bg-surface">
      <div className={cn('flex h-16 shrink-0 items-center border-b border-border', collapsed ? 'justify-center px-2' : 'px-5')}>
        <Wordmark compact={collapsed} />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
        {sections.map((section) => (
          <div key={section.label} className="mb-5">
            {!collapsed && <p className="eyebrow mb-1.5 px-3">{section.label}</p>}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const badge = item.badge && counts[item.badge] > 0 ? counts[item.badge] : null
                const link = (
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'relative flex h-10 items-center gap-3 rounded-control text-sm font-semibold transition-colors',
                        collapsed ? 'justify-center px-0' : 'px-3',
                        isActive
                          ? 'bg-indigo-50 text-indigo-text before:absolute before:-left-3 before:top-1.5 before:h-7 before:w-[3px] before:rounded-r-full before:bg-indigo dark:before:bg-indigo-text'
                          : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary',
                      )
                    }
                  >
                    <item.icon className="size-[18px] shrink-0" aria-hidden />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {badge !== null &&
                      (collapsed ? (
                        <span className="absolute right-2 top-2 size-2 rounded-full bg-pink" aria-label={`${badge} pending`} />
                      ) : (
                        <span className="tabular rounded-full bg-status-pending-bg px-2 py-0.5 text-xs font-semibold text-status-pending-fg">
                          {badge}
                        </span>
                      ))}
                  </NavLink>
                )
                return (
                  <li key={item.to}>
                    {collapsed ? (
                      <Tooltip content={item.label} side="right">
                        {link}
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        {!collapsed && (
          <div className="mb-2 rounded-control bg-bg-subtle px-3 py-2.5">
            <p className="eyebrow">{user.role === 'super_admin' ? 'Platform' : 'Tenant'}</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-text-primary">{user.role === 'super_admin' ? 'All tenants' : tenant?.name}</p>
            <p className="text-caption text-text-secondary">{ROLE_LABELS[user.role]}</p>
          </div>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-control text-caption font-semibold text-text-secondary hover:bg-bg-subtle',
              collapsed ? 'justify-center' : 'px-3',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && 'Collapse'}
          </button>
        )}
      </div>
    </div>
  )
}
