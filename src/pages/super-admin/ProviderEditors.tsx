import { Plus, Trash2 } from 'lucide-react'
import type { CatalogItem, GpuType, InstanceType, InfraProvider, ModelPrice, Region } from '@/data/types'
import type { RateCardInput } from '@/store/useAppStore'
import { GPU_TYPES } from '@/lib/providers'
import { cn, initials, uid } from '@/lib/utils'
import { tintFor } from '@/components/shared/Avatar'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/controls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function ProviderMark({ provider, className }: { provider: Pick<InfraProvider, 'name' | 'code' | 'logoUrl'>; className?: string }) {
  if (provider.logoUrl) return <img src={provider.logoUrl} alt="" className={cn('size-9 shrink-0 rounded-full border border-border bg-bg-surface object-contain', className)} />
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold', tintFor(provider.code || provider.name), className)} aria-hidden>
      {provider.code ? provider.code.slice(0, 3) : initials(provider.name)}
    </span>
  )
}

export function FormSection({ n, title, used, children }: { n: number; title: string; used: string; children: React.ReactNode }) {
  const id = `pf-sec-${n}`
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-4 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div>
        <p id={id} className="font-heading text-h3 text-text-primary">
          {n}. {title}
        </p>
        <p className="text-caption text-text-muted">Used by: {used}</p>
      </div>
      {children}
    </div>
  )
}

const num = (v: string) => (v === '' ? 0 : Number(v))

export function RegionsEditor({ regions, onChange, lockedIds = [] }: { regions: Region[]; onChange: (r: Region[]) => void; lockedIds?: string[] }) {
  const up = (i: number, patch: Partial<Region>) => onChange(regions.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-control border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-bg-subtle text-left text-caption text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-semibold">Region name</th>
              <th className="px-3 py-2 font-semibold">India data residency</th>
              <th className="px-3 py-2 font-semibold">GPU types available</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {regions.map((r, i) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <Input value={r.name} onChange={(e) => up(i, { name: e.target.value })} aria-label={`Region ${i + 1} name`} placeholder="Mumbai" className="h-9" />
                </td>
                <td className="px-3 py-2">
                  <Select value={r.indiaResident ? 'yes' : 'no'} onValueChange={(v) => up(i, { indiaResident: v === 'yes' })}>
                    <SelectTrigger aria-label={`Region ${i + 1} India data residency`} className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {GPU_TYPES.map((g) => (
                      <label key={g} className="flex cursor-pointer items-center gap-1.5 text-caption text-text-primary">
                        <Checkbox
                          checked={r.gpuTypes.includes(g)}
                          onCheckedChange={(v) => up(i, { gpuTypes: v ? GPU_TYPES.filter((x) => x === g || r.gpuTypes.includes(x)) : r.gpuTypes.filter((x) => x !== g) })}
                          aria-label={`${g} in region ${i + 1}`}
                        />
                        {g}
                      </label>
                    ))}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove region ${r.name || i + 1}`}
                    disabled={regions.length === 1 || lockedIds.includes(r.id)}
                    title={lockedIds.includes(r.id) ? 'Environments run in this region' : undefined}
                    onClick={() => onChange(regions.filter((_, j) => j !== i))}
                  >
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="ghost" size="compact" className="self-start" onClick={() => onChange([...regions, { id: uid('rg'), name: '', indiaResident: true, gpuTypes: [] }])}>
        <Plus /> Add region
      </Button>
    </div>
  )
}

export function InstanceTypesEditor({ instances, onChange }: { instances: InstanceType[]; onChange: (i: InstanceType[]) => void }) {
  const up = (i: number, patch: Partial<InstanceType>) => onChange(instances.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-control border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-bg-subtle text-left text-caption text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">vCPU</th>
              <th className="px-3 py-2 font-semibold">RAM GB</th>
              <th className="px-3 py-2 font-semibold">GPU type</th>
              <th className="px-3 py-2 font-semibold">GPU count</th>
              <th className="px-3 py-2 font-semibold">Hourly rate (₹)</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {instances.map((it, i) => (
              <tr key={it.id}>
                <td className="px-3 py-2">
                  <Input value={it.name} onChange={(e) => up(i, { name: e.target.value })} aria-label={`Instance ${i + 1} name`} placeholder="g4dn.2xlarge" className="h-9 min-w-[150px]" />
                </td>
                <td className="px-3 py-2">
                  <Input type="number" min={1} value={it.vcpu} onChange={(e) => up(i, { vcpu: num(e.target.value) })} aria-label={`Instance ${i + 1} vCPU`} className="h-9 w-20" />
                </td>
                <td className="px-3 py-2">
                  <Input type="number" min={1} value={it.ramGb} onChange={(e) => up(i, { ramGb: num(e.target.value) })} aria-label={`Instance ${i + 1} RAM GB`} className="h-9 w-20" />
                </td>
                <td className="px-3 py-2">
                  <Select value={it.gpuType} onValueChange={(v) => up(i, { gpuType: v as GpuType | 'none', gpuCount: v === 'none' ? 0 : Math.max(1, it.gpuCount) })}>
                    <SelectTrigger aria-label={`Instance ${i + 1} GPU type`} className="h-9 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {GPU_TYPES.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Input type="number" min={0} value={it.gpuCount} disabled={it.gpuType === 'none'} onChange={(e) => up(i, { gpuCount: num(e.target.value) })} aria-label={`Instance ${i + 1} GPU count`} className="h-9 w-20" />
                </td>
                <td className="px-3 py-2">
                  <Input type="number" min={0} step={0.5} value={it.hourlyRate} onChange={(e) => up(i, { hourlyRate: num(e.target.value) })} aria-label={`Instance ${i + 1} hourly rate`} className="h-9 w-24" />
                </td>
                <td className="px-2 py-2">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove instance ${it.name || i + 1}`} disabled={instances.length === 1} onClick={() => onChange(instances.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="ghost" size="compact" className="self-start" onClick={() => onChange([...instances, { id: uid('it'), name: '', vcpu: 8, ramGb: 32, gpuType: 'none', gpuCount: 0, hourlyRate: 0 }])}>
        <Plus /> Add instance type
      </Button>
    </div>
  )
}

export function OtherRatesEditor({ card, onChange, feesOnly }: { card: RateCardInput; onChange: (c: RateCardInput) => void; feesOnly?: boolean }) {
  const all: [keyof RateCardInput, string, number][] = [
    ['storageRate', 'Storage ₹ per GB-month', 0.5],
    ['egressRate', 'Network egress ₹ per GB', 0.5],
    ['platformFeePct', 'Platform fee %', 0.5],
    ['ngoDiscountPct', 'NGO discount %', 0.5],
    ['gstPct', 'GST %', 1],
  ]
  const fields = feesOnly ? all.slice(2) : all
  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {fields.map(([k, label, step]) => (
        <Field key={k} label={label} htmlFor={`rc-${k}`} required>
          <Input id={`rc-${k}`} type="number" min={0} step={step} value={card[k] as number} onChange={(e) => onChange({ ...card, [k]: num(e.target.value) })} />
        </Field>
      ))}
    </div>
  )
}

export function RateCardInfoEditor({ card, onChange, minDate }: { card: RateCardInput; onChange: (c: RateCardInput) => void; minDate?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
      <Field label="Effective from" htmlFor="rc-from" required helper={minDate ? `From ${minDate} or later` : undefined}>
        <Input id="rc-from" type="date" min={minDate} value={card.effectiveFrom} onChange={(e) => onChange({ ...card, effectiveFrom: e.target.value })} />
      </Field>
      <Field label="Rate source" htmlFor="rc-source" required>
        <Input id="rc-source" value={card.source} onChange={(e) => onChange({ ...card, source: e.target.value })} placeholder="Published price list, Oct 2026" />
      </Field>
    </div>
  )
}

/** Model rate card rows: model, its ID at this provider, regions, prices before fee, discount and GST, and status. */
export function ModelPricesEditor({ prices, onChange, regions, catalog }: { prices: ModelPrice[]; onChange: (p: ModelPrice[]) => void; regions: Region[]; catalog: CatalogItem[] }) {
  const models = catalog.filter((c) => c.category === 'llm' || c.category === 'asr' || c.category === 'embedding').sort((a, b) => a.name.localeCompare(b.name))
  const up = (i: number, patch: Partial<ModelPrice>) => onChange(prices.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const free = models.filter((m) => !prices.some((p) => p.modelId === m.id))
  const named = regions.filter((r) => r.name.trim())
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-control border border-border">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-bg-subtle text-left text-caption text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-semibold">Model</th>
              <th className="px-3 py-2 font-semibold">Model ID at this provider</th>
              <th className="px-3 py-2 font-semibold">Regions</th>
              <th className="px-3 py-2 font-semibold">Input ₹ / 1M</th>
              <th className="px-3 py-2 font-semibold">Output ₹ / 1M</th>
              <th className="px-3 py-2 font-semibold">₹ / audio min</th>
              <th className="px-3 py-2 font-semibold">Available</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {prices.map((m, i) => {
              const item = models.find((c) => c.id === m.modelId)
              const speech = item?.category === 'asr'
              const embedding = item?.category === 'embedding'
              return (
                <tr key={`${m.modelId}-${i}`} data-model-price={m.modelId}>
                  <td className="px-3 py-2">
                    <Select
                      value={m.modelId}
                      onValueChange={(v) => {
                        const next = models.find((c) => c.id === v)
                        up(i, { modelId: v, ...(next?.category === 'asr' ? { inputPer1M: 0, outputPer1M: 0, perAudioMinute: m.perAudioMinute ?? 0 } : { perAudioMinute: undefined }) })
                      }}
                    >
                      <SelectTrigger aria-label={`Model ${i + 1}`} className="h-9 min-w-[170px]">
                        <SelectValue placeholder="Choose a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {models
                          .filter((c) => c.id === m.modelId || !prices.some((p) => p.modelId === c.id))
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Input value={m.providerModelId} onChange={(e) => up(i, { providerModelId: e.target.value })} aria-label={`Model ${i + 1} ID at provider`} placeholder="meta.llama3-3-70b-instruct-v1:0" className="h-9 min-w-[200px] font-mono text-caption" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      {named.map((r) => (
                        <label key={r.id} className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-caption text-text-primary">
                          <Checkbox
                            checked={m.regionIds.includes(r.id)}
                            onCheckedChange={(v) => up(i, { regionIds: v ? [...m.regionIds, r.id] : m.regionIds.filter((x) => x !== r.id) })}
                            aria-label={`${r.name} for model ${i + 1}`}
                          />
                          {r.name}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min={0} step={0.5} value={m.inputPer1M} disabled={speech} onChange={(e) => up(i, { inputPer1M: num(e.target.value) })} aria-label={`Model ${i + 1} input price`} className="h-9 w-24" />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min={0} step={0.5} value={m.outputPer1M} disabled={speech || embedding} onChange={(e) => up(i, { outputPer1M: num(e.target.value) })} aria-label={`Model ${i + 1} output price`} className="h-9 w-24" />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min={0} step={0.01} value={m.perAudioMinute ?? ''} disabled={!speech} onChange={(e) => up(i, { perAudioMinute: num(e.target.value) })} aria-label={`Model ${i + 1} price per audio minute`} className="h-9 w-24" />
                  </td>
                  <td className="px-3 py-2">
                    <Checkbox checked={m.status === 'available'} onCheckedChange={(v) => up(i, { status: v ? 'available' : 'disabled' })} aria-label={`Model ${i + 1} available`} />
                  </td>
                  <td className="px-2 py-2">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${item?.name ?? `model ${i + 1}`}`} onClick={() => onChange(prices.filter((_, j) => j !== i))}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              )
            })}
            {prices.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-caption text-text-secondary">
                  No models priced yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {free.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="compact"
          className="self-start"
          onClick={() => {
            const first = free[0]!
            onChange([...prices, { modelId: first.id, providerModelId: '', regionIds: named.map((r) => r.id), inputPer1M: 0, outputPer1M: 0, ...(first.category === 'asr' ? { perAudioMinute: 0 } : {}), status: 'available' }])
          }}
        >
          <Plus /> Add model
        </Button>
      )}
    </div>
  )
}
