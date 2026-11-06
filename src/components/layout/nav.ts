import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Boxes,
  BrainCircuit,
  Building2,
  ClipboardList,
  Cpu,
  FlaskConical,
  FolderKanban,
  Gauge,
  GitPullRequestArrow,
  Inbox,
  LayoutDashboard,
  Library,
  PlugZap,
  ScrollText,
  Server,
  Settings,
  Users,
} from 'lucide-react'
import type { Role } from '@/data/types'

export type NavBadge = 'tenantReviews' | 'escalated' | 'suggestions'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: NavBadge
  end?: boolean
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export const NAV: Record<Role, NavSection[]> = {
  super_admin: [
    { label: 'Overview', items: [{ to: '/super-admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    {
      label: 'Tenants',
      items: [
        { to: '/super-admin/tenants', label: 'Tenants', icon: Building2 },
        { to: '/super-admin/users', label: 'Users', icon: Users },
        { to: '/super-admin/requests', label: 'Requests', icon: Inbox, badge: 'escalated' },
        { to: '/super-admin/infrastructure', label: 'Infrastructure', icon: Server },
      ],
    },
    {
      label: 'Platform',
      items: [
        { to: '/super-admin/registry', label: 'Model & capability registry', icon: Library },
        { to: '/super-admin/suggestions', label: 'Capability suggestions', icon: GitPullRequestArrow, badge: 'suggestions' },
        { to: '/super-admin/providers', label: 'Providers', icon: PlugZap },
        { to: '/super-admin/capacity', label: 'Platform capacity', icon: Cpu },
      ],
    },
    {
      label: 'Oversight',
      items: [
        { to: '/super-admin/monitoring', label: 'Monitoring', icon: Activity },
        { to: '/super-admin/audit', label: 'Audit log', icon: ScrollText },
      ],
    },
  ],
  tenant_admin: [
    { label: 'Overview', items: [{ to: '/tenant-admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    {
      label: 'Manage',
      items: [
        { to: '/tenant-admin/users', label: 'Users', icon: Users },
        { to: '/tenant-admin/projects', label: 'Projects', icon: FolderKanban },
        { to: '/tenant-admin/infrastructure', label: 'Infrastructure', icon: Server },
        { to: '/tenant-admin/requests', label: 'Requests', icon: Inbox, badge: 'tenantReviews' },
      ],
    },
    {
      label: 'AI',
      items: [
        { to: '/tenant-admin/models', label: 'AI Models', icon: BrainCircuit },
        { to: '/tenant-admin/capabilities', label: 'AI Capabilities', icon: Boxes },
        { to: '/tenant-admin/suggestions', label: 'Capability Suggestions', icon: GitPullRequestArrow, badge: 'suggestions' },
      ],
    },
    {
      label: 'Oversight',
      items: [
        { to: '/tenant-admin/monitoring', label: 'Monitoring', icon: Activity },
        { to: '/tenant-admin/quotas', label: 'Quotas & Usage', icon: Gauge },
        { to: '/tenant-admin/audit', label: 'Audit Log', icon: ScrollText },
        { to: '/tenant-admin/settings', label: 'Settings', icon: Settings },
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
        { to: '/app/catalog', label: 'AI Capability Marketplace', icon: Boxes },
        { to: '/app/testing', label: 'Testing', icon: FlaskConical },
        { to: '/app/monitoring', label: 'Monitoring', icon: Activity },
      ],
    },
  ],
}

const SEGMENT_LABELS: Record<string, string> = {
  'super-admin': 'Super Admin',
  'tenant-admin': 'Tenant Admin',
  app: 'Workspace',
  requests: 'Requests',
  tenants: 'Tenants',
  users: 'Users',
  environments: 'Environments',
  infrastructure: 'Infrastructure',
  registry: 'Registry',
  catalog: 'Marketplace',
  providers: 'Providers',
  capacity: 'Platform capacity',
  testing: 'Testing',
  monitoring: 'Monitoring',
  audit: 'Audit log',
  suggestions: 'Capability suggestions',
  projects: 'Projects',
  models: 'AI Models',
  capabilities: 'AI Capabilities',
  quotas: 'Quotas & Usage',
  settings: 'Settings',
  new: 'New environment',
  edit: 'Edit',
}

export function segmentLabel(seg: string, role: Role) {
  if (seg === 'requests' && role === 'user') return 'My requests'
  return SEGMENT_LABELS[seg]
}
