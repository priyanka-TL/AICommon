import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  Building2,
  ClipboardList,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  Library,
  PlugZap,
  Server,
  Users,
} from 'lucide-react'
import type { Role } from '@/data/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: 'pendingRequests'
  end?: boolean
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export const NAV: Record<Role, NavSection[]> = {
  admin: [
    { label: 'Overview', items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    {
      label: 'Manage',
      items: [
        { to: '/admin/requests', label: 'Requests', icon: Inbox, badge: 'pendingRequests' },
        { to: '/admin/tenants', label: 'Organisations', icon: Building2 },
        { to: '/admin/users', label: 'Users', icon: Users },
        { to: '/admin/environments', label: 'Environments', icon: Server },
      ],
    },
    {
      label: 'Platform',
      items: [
        { to: '/admin/catalog', label: 'Capability catalog', icon: Library },
        { to: '/admin/providers', label: 'Providers', icon: PlugZap },
      ],
    },
  ],
  user: [
    {
      label: 'Workspace',
      items: [
        { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/app/requests', label: 'My requests', icon: ClipboardList },
      ],
    },
    {
      label: 'Build and test',
      items: [
        { to: '/app/catalog', label: 'Capability catalog', icon: Boxes },
        { to: '/app/testing', label: 'Testing', icon: FlaskConical },
      ],
    },
  ],
}

const SEGMENT_LABELS: Record<string, string> = {
  admin: 'Admin',
  app: 'Workspace',
  requests: 'Requests',
  tenants: 'Organisations',
  users: 'Users',
  environments: 'Environments',
  catalog: 'Capability catalog',
  providers: 'Providers',
  testing: 'Testing',
  new: 'New environment',
  edit: 'Edit',
}

export function segmentLabel(seg: string, role: Role) {
  if (seg === 'requests' && role === 'user') return 'My requests'
  return SEGMENT_LABELS[seg]
}
