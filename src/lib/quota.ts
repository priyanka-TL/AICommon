import type { EnvSpec, EnvStatus, Environment, Quota, Role } from '@/data/types'
import { COMPUTE_TIERS } from './labels'
import { formatInt } from './format'

export const RESOURCES: { key: keyof Quota; label: string; unit: string }[] = [
  { key: 'vcpu', label: 'vCPU', unit: 'vCPU' },
  { key: 'ramGb', label: 'RAM', unit: 'GB' },
  { key: 'gpus', label: 'GPUs', unit: 'GPUs' },
  { key: 'storageGb', label: 'Storage', unit: 'GB' },
]

export const ZERO: Quota = { vcpu: 0, ramGb: 0, gpus: 0, storageGb: 0 }

/** Statuses that hold allocated resources. */
export const ALLOCATING: EnvStatus[] = ['provisioning', 'active', 'stopped', 'suspended']

export function allocationOf(spec: EnvSpec): Quota {
  const tier = COMPUTE_TIERS.find((t) => t.value === spec.compute)!
  const nodes = tier.gpu ? Math.max(1, spec.gpuCount) : 1
  return {
    vcpu: tier.vcpu * nodes,
    ramGb: tier.ramGb * nodes,
    gpus: tier.gpu ? nodes : 0,
    storageGb: spec.storageGb,
  }
}

export const addQuota = (a: Quota, b: Quota): Quota => ({
  vcpu: a.vcpu + b.vcpu,
  ramGb: a.ramGb + b.ramGb,
  gpus: a.gpus + b.gpus,
  storageGb: a.storageGb + b.storageGb,
})

export const subQuota = (a: Quota, b: Quota): Quota => ({
  vcpu: a.vcpu - b.vcpu,
  ramGb: a.ramGb - b.ramGb,
  gpus: a.gpus - b.gpus,
  storageGb: a.storageGb - b.storageGb,
})

export function allocated(envs: Environment[], filter: (e: Environment) => boolean): Quota {
  return envs.filter((e) => ALLOCATING.includes(e.status) && filter(e)).reduce((sum, e) => addQuota(sum, allocationOf(e.spec)), ZERO)
}

export const tenantAllocated = (envs: Environment[], tenantId: string) => allocated(envs, (e) => e.tenantId === tenantId)
export const projectAllocated = (envs: Environment[], projectId: string) => allocated(envs, (e) => e.projectId === projectId)

export interface Overage {
  key: keyof Quota
  label: string
  unit: string
  need: number
  left: number
}

export function checkQuota(quota: Quota, used: Quota, extra: Quota): { over: boolean; items: Overage[] } {
  const items = RESOURCES.filter((r) => extra[r.key] > 0 && used[r.key] + extra[r.key] > quota[r.key]).map((r) => ({
    key: r.key,
    label: r.label,
    unit: r.unit,
    need: extra[r.key],
    left: Math.max(quota[r.key] - used[r.key], 0),
  }))
  return { over: items.length > 0, items }
}

export function overageText(items: Overage[], orgName: string) {
  return items.map((i) => `${formatInt(i.need)} ${i.unit} needed, ${formatInt(i.left)} left at ${orgName}`).join('; ')
}

export function quotaMessage(items: Overage[], orgName: string, audience: Role) {
  if (!items.length) return null
  const first = items[0]!
  const lead = `This needs ${formatInt(first.need)} ${first.unit}, but ${orgName} has ${formatInt(first.left)} left${items.length > 1 ? `, and it is over on ${items.length - 1} more resource${items.length > 2 ? 's' : ''}` : ''}.`
  if (audience === 'user') return `${lead} Reduce the GPU tier or count, or ask your Tenant Admin. They can forward it to the Super Admin.`
  if (audience === 'tenant_admin') return `${lead} Forward it to the Super Admin, or request a quota increase.`
  return `${lead} Approving it takes ${orgName} over quota.`
}

export const usagePct = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0)
