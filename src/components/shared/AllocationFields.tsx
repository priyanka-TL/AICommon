import { Trash2 } from 'lucide-react'
import type { CatalogItem, EnvSpec } from '@/data/types'
import { AUTO_SHUTDOWN_OPTIONS } from '@/lib/labels'
import { applyPlacement, instancesFor } from '@/lib/providers'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const DURATIONS = [2, 4, 6, 8, 12, 16]

/** Editable resource fields used when an approver adjusts a request. */
export function AllocationFields({ spec, onChange, catalog }: { spec: EnvSpec; onChange: (s: EnvSpec) => void; catalog: CatalogItem[] }) {
  const set = <K extends keyof EnvSpec>(k: K, v: EnvSpec[K]) => onChange({ ...spec, [k]: v })
  const name = (id: string) => catalog.find((c) => c.id === id)?.name ?? id
  const providers = useAppStore((st) => st.infraProviders)
  const provider = providers.find((p) => p.id === spec.providerId)
  const region = provider?.regions.find((r) => r.id === spec.regionId)
  const instances = instancesFor(provider, region)
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Instance type" htmlFor="al-instance" helper={provider ? `${provider.name} · ${region?.name ?? ''}` : undefined}>
          <Select value={spec.instanceTypeId} onValueChange={(v) => { const it = instances.find((i) => i.id === v); if (it) onChange(applyPlacement(spec, spec.providerId, spec.regionId, it)) }}>
            <SelectTrigger id="al-instance">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {instances.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name} · {i.gpuType === 'none' ? 'CPU' : `${i.gpuCount}× ${i.gpuType}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Instances" htmlFor="al-count">
          <Select value={String(spec.instanceCount)} onValueChange={(v) => { const it = instances.find((i) => i.id === spec.instanceTypeId); if (it) onChange(applyPlacement(spec, spec.providerId, spec.regionId, it, Number(v))) }}>
            <SelectTrigger id="al-count">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Storage (GB)" htmlFor="al-storage">
          <Input id="al-storage" type="number" min={10} max={2000} step={10} value={spec.storageGb} onChange={(e) => set('storageGb', Math.max(0, Number(e.target.value)))} />
        </Field>
        <Field label="Auto-shutdown" htmlFor="al-shutdown">
          <Select value={String(spec.autoShutdownHours)} onValueChange={(v) => set('autoShutdownHours', Number(v))}>
            <SelectTrigger id="al-shutdown">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTO_SHUTDOWN_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Duration" htmlFor="al-duration">
          <Select value={String(spec.durationWeeks)} onValueChange={(v) => set('durationWeeks', Number(v))}>
            <SelectTrigger id="al-duration">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([...DURATIONS, spec.durationWeeks])].sort((a, b) => a - b).map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} weeks
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {spec.llms.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-text-primary">Token budgets (millions per month)</p>
          <ul className="flex flex-col gap-2">
            {spec.llms.map((l) => (
              <li key={l.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{name(l.id)}</span>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  className="w-24"
                  aria-label={`${name(l.id)} token budget`}
                  value={l.tokenBudget}
                  onChange={(e) => set('llms', spec.llms.map((x) => (x.id === l.id ? { ...x, tokenBudget: Math.max(1, Number(e.target.value)) } : x)))}
                />
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${name(l.id)}`} onClick={() => set('llms', spec.llms.filter((x) => x.id !== l.id))}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
