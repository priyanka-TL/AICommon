import { useEffect, useMemo, useState } from 'react'
import { Calculator, KeyRound, ServerOff } from 'lucide-react'
import type { CatalogItem, DataClassification, ModelPlacement, Tenant } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import {
  DEFAULT_ESTIMATE,
  ESTIMATE_DAYS_PER_MONTH,
  estimateModelCost,
  isSensitiveClass,
  platformModelOptions,
  type EstimateInput,
  type PlatformModelOption,
} from '@/lib/modelCost'
import { formatINR, formatINRPrice } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tag } from './StatusBadge'
import { EmptyState } from './EmptyState'

/** Price label for an option: "₹68.20 in · ₹92.40 out per 1M tokens", or per audio minute for speech. */
export function priceLabel(o: Pick<PlatformModelOption, 'inputPer1M' | 'outputPer1M' | 'perMinute' | 'speech'>) {
  if (o.speech) return `${formatINRPrice(o.perMinute)} per audio minute`
  if (o.outputPer1M === 0) return `${formatINRPrice(o.inputPer1M)} per 1M tokens`
  return `${formatINRPrice(o.inputPer1M)} in · ${formatINRPrice(o.outputPer1M)} out per 1M tokens`
}

export function KeyManagedBy({ providerName, className }: { providerName: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-caption text-text-secondary', className)}>
      <KeyRound className="size-3.5 shrink-0 text-text-muted" aria-hidden />
      Key managed by {providerName}
    </span>
  )
}

export function ResidencyTag({ india }: { india: boolean }) {
  return <Tag className={india ? 'border-teal bg-status-running-bg text-status-running-fg' : ''}>{india ? 'India residency' : 'Outside India'}</Tag>
}

interface PickerProps {
  item: CatalogItem
  tenant: Tenant | undefined
  classification: DataClassification
  value: ModelPlacement | null
  onChange: (p: ModelPlacement | null) => void
}

/**
 * "Use platform model": choose the provider (and region) that serves a model, with prices after fee,
 * discount and GST, then estimate the cost. No key field: the provider's own key is used.
 */
export function PlatformModelPicker({ item, tenant, classification, value, onChange }: PickerProps) {
  const providers = useAppStore((s) => s.infraProviders)
  const options = useMemo(() => platformModelOptions(item.id, providers, tenant, classification), [item.id, providers, tenant, classification])
  const selected = options.find((o) => o.provider.id === value?.providerId)

  // Pick the cheapest by default, and drop a choice that is no longer offered.
  useEffect(() => {
    if (!options.length) {
      if (value) onChange(null)
      return
    }
    if (!selected) onChange({ providerId: options[0]!.provider.id, regionId: options[0]!.regions[0]!.id })
  }, [options, selected, value, onChange])

  if (!options.length) {
    return (
      <div className="rounded-control border border-border bg-bg-surface" data-testid="no-platform-provider">
        <EmptyState
          icon={ServerOff}
          title="No provider available"
          description={
            isSensitiveClass(classification)
              ? `No approved provider serves ${item.name} from India, and this project’s data must stay in India. Choose another model, or ask your Tenant Admin to request a provider.`
              : `No approved provider offers ${item.name} for your organisation. Ask your Tenant Admin to request one.`
          }
          className="py-8"
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="platform-model-picker">
      <div>
        <p className="text-sm font-semibold text-text-primary">Provider</p>
        <p className="text-caption text-text-muted">
          Prices include platform fee, NGO discount and GST.{isSensitiveClass(classification) ? ' Only India regions are shown for this project’s data.' : ''}
        </p>
      </div>
      <div role="radiogroup" aria-label={`Provider for ${item.name}`} className="grid gap-3 md:grid-cols-2">
        {options.map((o) => {
          const on = o.provider.id === selected?.provider.id
          return (
            <button
              key={o.provider.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-provider={o.provider.id}
              onClick={() => onChange({ providerId: o.provider.id, regionId: o.regions[0]!.id })}
              className={cn(
                'card flex flex-col gap-2 p-4 text-left transition-[box-shadow,border-color]',
                on ? 'border-2 border-indigo p-[15px] dark:border-indigo-text' : 'hover:border-border-strong hover:shadow-card-hover',
              )}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-text-primary">{o.provider.name}</span>
                {o.cheapest && <Tag className="border-indigo bg-indigo-50 text-indigo-text">Cheapest</Tag>}
              </span>
              <span className="tabular text-sm text-text-primary" data-testid="option-price">
                {priceLabel(o)}
              </span>
              <span className="flex flex-wrap items-center gap-2 text-caption text-text-secondary">
                {o.regions.map((r) => r.name).join(', ')}
                <ResidencyTag india={o.indiaResident} />
              </span>
            </button>
          )
        })}
      </div>
      {selected && selected.regions.length > 1 && (
        <Field label="Region" htmlFor="pm-region" className="md:w-72">
          <Select value={value?.regionId} onValueChange={(regionId) => onChange({ providerId: selected.provider.id, regionId })}>
            <SelectTrigger id="pm-region" className="bg-bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selected.regions.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                  {r.indiaResident ? ' · India' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {selected && <KeyManagedBy providerName={selected.provider.name} />}
      {selected && <ModelCostEstimator options={options} selectedId={selected.provider.id} tenant={tenant} />}
    </div>
  )
}

/** Requests per day × average tokens → daily and monthly cost, for the chosen provider and the others. */
export function ModelCostEstimator({ options, selectedId, tenant }: { options: PlatformModelOption[]; selectedId: string; tenant: Tenant | undefined }) {
  const [input, setInput] = useState<EstimateInput>(DEFAULT_ESTIMATE)
  const speech = options[0]?.speech ?? false
  const embedding = !speech && options.every((o) => o.price.outputPer1M === 0)
  const rows = options.map((o) => ({ o, est: estimateModelCost(input, o.price, o.card, tenant) }))
  const chosen = rows.find((r) => r.o.provider.id === selectedId)
  const num = (k: keyof EstimateInput) => (e: React.ChangeEvent<HTMLInputElement>) => setInput((x) => ({ ...x, [k]: Math.max(0, Number(e.target.value) || 0) }))

  return (
    <section className="rounded-control border border-border bg-bg-subtle p-4" data-testid="cost-estimator" aria-label="Cost estimator">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Calculator className="size-4 text-indigo-text" aria-hidden /> Cost estimate
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Requests per day" htmlFor="est-req">
          <Input id="est-req" type="number" min={0} inputMode="numeric" value={input.requestsPerDay} onChange={num('requestsPerDay')} className="bg-bg-surface" />
        </Field>
        {speech ? (
          <Field label="Audio minutes per request" htmlFor="est-min">
            <Input id="est-min" type="number" min={0} step={0.5} value={input.avgAudioMinutes ?? 0} onChange={num('avgAudioMinutes')} className="bg-bg-surface" />
          </Field>
        ) : (
          <>
            <Field label={embedding ? 'Tokens per request' : 'Input tokens per request'} htmlFor="est-in">
              <Input id="est-in" type="number" min={0} inputMode="numeric" value={input.avgInputTokens} onChange={num('avgInputTokens')} className="bg-bg-surface" />
            </Field>
            {!embedding && (
              <Field label="Output tokens per request" htmlFor="est-out">
                <Input id="est-out" type="number" min={0} inputMode="numeric" value={input.avgOutputTokens} onChange={num('avgOutputTokens')} className="bg-bg-surface" />
              </Field>
            )}
          </>
        )}
      </div>
      {chosen && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-control bg-bg-surface p-3">
            <p className="text-caption text-text-muted">Daily</p>
            <p className="tabular font-heading text-h3 text-text-primary" data-testid="est-daily">
              {formatINRPrice(chosen.est.daily)}
            </p>
          </div>
          <div className="rounded-control bg-bg-surface p-3">
            <p className="text-caption text-text-muted">Monthly ({ESTIMATE_DAYS_PER_MONTH} days)</p>
            <p className="tabular font-heading text-h3 text-text-primary" data-testid="est-monthly">
              {formatINR(chosen.est.monthly)}
            </p>
          </div>
        </div>
      )}
      {rows.length > 1 && (
        <div className="mt-4">
          <p className="mb-1 text-caption font-semibold text-text-secondary">Same usage on other providers</p>
          <ul className="divide-y divide-border text-sm">
            {rows.map(({ o, est }) => (
              <li key={o.provider.id} className={cn('flex items-center justify-between gap-3 py-1.5', o.provider.id === selectedId && 'font-semibold')} data-compare={o.provider.id}>
                <span className="truncate text-text-primary">
                  {o.provider.name}
                  {o.provider.id === selectedId ? ' (selected)' : ''}
                </span>
                <span className="tabular shrink-0 text-text-secondary">{formatINR(est.monthly)} / month</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
