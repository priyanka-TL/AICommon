import type { CatalogItem, EnvSpec, SpecChange } from '@/data/types'
import { autoShutdownLabel, computeLabel, dataClassLabel, purposeLabel } from './labels'

export function diffSpecs(from: EnvSpec, to: EnvSpec, catalog: CatalogItem[]): SpecChange[] {
  const name = (id: string) => catalog.find((c) => c.id === id)?.name ?? id
  const changes: SpecChange[] = []
  const push = (field: string, a: string, b: string) => {
    if (a !== b) changes.push({ field, from: a, to: b })
  }

  push('Name', from.name, to.name)
  push('Purpose', purposeLabel(from.purpose), purposeLabel(to.purpose))
  push('Duration', `${from.durationWeeks} weeks`, `${to.durationWeeks} weeks`)
  push('Compute', computeLabel(from.compute), computeLabel(to.compute))
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
