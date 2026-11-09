import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Boxes,
  BrainCircuit,
  Building2,
  ClipboardList,
  Cloud,
  Cpu,
  FlaskConical,
  FolderKanban,
  Gauge,
  Inbox,
  LayoutDashboard,
  FileBarChart,
  Library,
  ListChecks,
  Scale,
  SlidersHorizontal,
  PlugZap,
  ScrollText,
  Server,
  Settings,
  Users,
} from 'lucide-react'
import type { Role } from '@/data/types'

export type NavBadge = 'tenantReviews' | 'escalated'

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
        { to: '/super-admin/projects', label: 'Projects', icon: FolderKanban },
      ],
    },
    {
      label: 'Platform',
      items: [
        { to: '/super-admin/registry', label: 'Model & capability registry', icon: Library },
        { to: '/super-admin/infra-providers', label: 'Infrastructure Providers', icon: Cloud },
        { to: '/super-admin/providers', label: 'Model API providers', icon: PlugZap },
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
        { to: '/tenant-admin/infra-providers', label: 'Infrastructure Providers', icon: Cloud },
        { to: '/tenant-admin/requests', label: 'Requests', icon: Inbox, badge: 'tenantReviews' },
      ],
    },
    {
      label: 'AI',
      items: [
        { to: '/tenant-admin/models', label: 'AI Models', icon: BrainCircuit },
        { to: '/tenant-admin/capabilities', label: 'AI Capabilities', icon: Boxes },
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
  qa: [
    { label: 'Overview', items: [{ to: '/qa', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    {
      label: 'Models',
      items: [
        { to: '/qa/model-testing', label: 'Model Testing', icon: BrainCircuit },
        { to: '/qa/comparison', label: 'Model Comparison', icon: Scale },
        { to: '/qa/configurations', label: 'Test Configurations', icon: SlidersHorizontal },
      ],
    },
    {
      label: 'Environments',
      items: [
        { to: '/qa/functional', label: 'Functional Testing', icon: ListChecks },
        { to: '/qa/load', label: 'Load Testing', icon: Gauge },
      ],
    },
    {
      label: 'Results',
      items: [
        { to: '/qa/reports', label: 'Test Reports', icon: FileBarChart },
        { to: '/qa/monitoring', label: 'Monitoring', icon: Activity },
      ],
    },
  ],
  user: [
    {
      label: 'Workspace',
      items: [
        { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/app/projects', label: 'Projects', icon: FolderKanban },
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
  providers: 'Model API providers',
  'infra-providers': 'Infrastructure Providers',
  'provider-requests': 'Provider requests',
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
  qa: 'QA',
  'model-testing': 'Model Testing',
  comparison: 'Model Comparison',
  configurations: 'Test Configurations',
  functional: 'Functional Testing',
  load: 'Load Testing',
  reports: 'Test Reports',
  edit: 'Edit',
}

export function segmentLabel(seg: string, role: Role, prev?: string) {
  if (seg === 'new' && prev === 'projects') return 'New project'
  if ((seg === 'requests' || seg === 'suggestions') && role === 'user') return 'My requests'
  if (seg === 'environments' && role === 'qa') return 'Environments'
  return SEGMENT_LABELS[seg]
}
