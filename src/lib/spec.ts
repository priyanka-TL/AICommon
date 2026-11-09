import type { CatalogItem, EnvSpec, InfraProvider, Project, SpecChange } from '@/data/types'
import { autoShutdownLabel, computeLabel, dataClassLabel, purposeLabel } from './labels'
import { allocationOf, RESOURCES } from './quota'

export function diffSpecs(from: EnvSpec, to: EnvSpec, catalog: CatalogItem[], projects: Project[] = [], providers: InfraProvider[] = []): SpecChange[] {
  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id
  const regionName = (pid: string, rid: string) => providers.find((p) => p.id === pid)?.regions.find((r) => r.id === rid)?.name ?? rid
  const name = (id: string) => catalog.find((c) => c.id === id)?.name ?? id
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id
  const changes: SpecChange[] = []
  const push = (field: string, a: string, b: string) => {
    if (a !== b) changes.push({ field, from: a, to: b })
  }

  push('Name', from.name, to.name)
  push('Project', projectName(from.projectId), projectName(to.projectId))
  push('Purpose', purposeLabel(from.purpose), purposeLabel(to.purpose))
  push('Duration', `${from.durationWeeks} weeks`, `${to.durationWeeks} weeks`)
  push('Provider', providerName(from.providerId), providerName(to.providerId))
  push('Region', regionName(from.providerId, from.regionId), regionName(to.providerId, to.regionId))
  push('Instance type', `${from.instance.name} (${computeLabel(from.compute)})`, `${to.instance.name} (${computeLabel(to.compute)})`)
  push('Instances', String(from.instanceCount), String(to.instanceCount))
  push('Network egress', `${from.egressGbPerMonth} GB a month`, `${to.egressGbPerMonth} GB a month`)
  push('Storage', `${from.storageGb} GB`, `${to.storageGb} GB`)
  push('Auto-shutdown', autoShutdownLabel(from.autoShutdownHours), autoShutdownLabel(to.autoShutdownHours))

  const llmIds = new Set([...from.llms.map((l) => l.id), ...to.llms.map((l) => l.id)])
  for (const id of llmIds) {
    const a = from.llms.find((l) => l.id === id)
    const b = to.llms.find((l) => l.id === id)
    push(`${name(id)} budget`, a ? `${a.tokenBudget}M tokens` : 'Not included', b ? `${b.tokenBudget}M tokens` : 'Removed')
  }

  const list = (ids: string[]) => (ids.length ? ids.map(name).join(', ') : 'None')
  push('Speech recognition', list(from.asr), list(to.asr))
  push('Audio hours / month', `${from.asrHoursPerMonth} h`, `${to.asrHoursPerMonth} h`)
  push('Languages', from.languages.join(', ') || 'None', to.languages.join(', ') || 'None')
  push('Capabilities', list(from.capabilities), list(to.capabilities))
  push('Data classification', dataClassLabel(from.dataClassification), dataClassLabel(to.dataClassification))
  push('Personal identifiers', from.containsPii ? 'Yes' : 'No', to.containsPii ? 'Yes' : 'No')
  return changes
}

const TIER_RANK = { cpu: 0, t4: 1, l4: 2, a10: 3, a100: 4 } as const

/** True when an edit needs more infrastructure than the environment already has. */
export function addsInfrastructure(from: EnvSpec, to: EnvSpec) {
  if (TIER_RANK[to.compute] > TIER_RANK[from.compute]) return true
  const a = allocationOf(from)
  const b = allocationOf(to)
  return RESOURCES.some((r) => b[r.key] > a[r.key])
}
