import type {
  ActorRole,
  CatalogCategory,
  ComputeTier,
  DataClassification,
  Language,
  LifecycleStatus,
  OrgType,
  Purpose,
  Role,
  SuggestionStatus,
} from '@/data/types'

export const ORG_TYPES: OrgType[] = ['NGO', 'Social enterprise', 'Foundation', 'Government partner']

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
]

export const PURPOSES: { value: Purpose; label: string; description: string }[] = [
  { value: 'development', label: 'Development', description: 'Build and iterate on a new AI capability.' },
  { value: 'functional-testing', label: 'Functional testing', description: 'Check that outputs are correct for known cases.' },
  { value: 'load-testing', label: 'Load testing', description: 'Find out how the service behaves under real traffic.' },
  { value: 'evaluation', label: 'Evaluation', description: 'Compare models or providers against a benchmark.' },
  { value: 'pilot', label: 'Pilot', description: 'Run with real people in the field for a limited period.' },
]

export const purposeLabel = (p: Purpose) => PURPOSES.find((x) => x.value === p)!.label

export const COMPUTE_TIERS: {
  value: ComputeTier
  label: string
  detail: string
  gpu: boolean
  vcpu: number
  ramGb: number
  gpuMemGb: number
}[] = [
  { value: 'cpu', label: 'CPU only', detail: '8 vCPU · 32 GB RAM', gpu: false, vcpu: 8, ramGb: 32, gpuMemGb: 0 },
  { value: 't4', label: 'NVIDIA T4', detail: '16 GB GPU · 8 vCPU · 32 GB RAM', gpu: true, vcpu: 8, ramGb: 32, gpuMemGb: 16 },
  { value: 'l4', label: 'NVIDIA L4', detail: '24 GB GPU · 8 vCPU · 32 GB RAM', gpu: true, vcpu: 8, ramGb: 32, gpuMemGb: 24 },
  { value: 'a10', label: 'NVIDIA A10', detail: '24 GB GPU · 16 vCPU · 64 GB RAM', gpu: true, vcpu: 16, ramGb: 64, gpuMemGb: 24 },
  { value: 'a100', label: 'NVIDIA A100', detail: '80 GB GPU · 32 vCPU · 128 GB RAM', gpu: true, vcpu: 32, ramGb: 128, gpuMemGb: 80 },
]

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  tenant_admin: 'Tenant Admin',
  user: 'User',
  qa: 'QA Engineer',
}

export const roleLabel = (r: ActorRole) => (r === 'system' ? 'System' : ROLE_LABELS[r])

export const STATUS_LABELS: Record<LifecycleStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  changes_requested: 'Changes requested',
  resubmitted: 'Resubmitted',
  escalated: 'Escalated',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  provisioning: 'Provisioning',
  active: 'Active',
  stopped: 'Stopped',
  suspended: 'Suspended',
  provisioning_failed: 'Provisioning failed',
  terminated: 'Terminated',
}

export const SUGGESTION_LABELS: Record<SuggestionStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  needs_info: 'Needs info',
  approved_tenant: 'Approved (tenant only)',
  published: 'Published',
  rejected: 'Rejected',
}

export const computeLabel = (c: ComputeTier) => COMPUTE_TIERS.find((x) => x.value === c)!.label

export const AUTO_SHUTDOWN_OPTIONS = [
  { value: 1, label: 'After 1 idle hour' },
  { value: 2, label: 'After 2 idle hours' },
  { value: 4, label: 'After 4 idle hours' },
  { value: 8, label: 'After 8 idle hours' },
  { value: 0, label: 'Never (always on)' },
]

export const autoShutdownLabel = (h: number) =>
  AUTO_SHUTDOWN_OPTIONS.find((o) => o.value === h)?.label ?? `After ${h} idle hours`

export const DATA_CLASSES: { value: DataClassification; label: string; description: string }[] = [
  { value: 'public', label: 'Public', description: 'Already published or safe to share openly.' },
  { value: 'internal', label: 'Internal', description: 'Your organisation’s working data, no personal details.' },
  { value: 'personal', label: 'Personal', description: 'Names, phone numbers, locations or other details about people.' },
  { value: 'children', label: 'Children’s data', description: 'Any data about people under 18. Extra review applies.' },
]

export const dataClassLabel = (d: DataClassification) => DATA_CLASSES.find((x) => x.value === d)!.label

export const LANGUAGES: Language[] = ['Hindi', 'Kannada', 'Tamil', 'Telugu', 'Marathi', 'Bengali', 'English']

export const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  llm: 'Language models',
  asr: 'Speech recognition',
  'agent-framework': 'Agent frameworks',
  'vector-db': 'Vector databases',
  evaluation: 'Evaluation tools',
  'low-code': 'Low-code builders',
}

export const CATEGORY_SINGULAR: Record<CatalogCategory, string> = {
  llm: 'Language model',
  asr: 'Speech recognition',
  'agent-framework': 'Agent framework',
  'vector-db': 'Vector database',
  evaluation: 'Evaluation tool',
  'low-code': 'Low-code builder',
}
