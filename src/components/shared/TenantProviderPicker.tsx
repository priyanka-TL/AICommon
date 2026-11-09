import { AlertTriangle } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { indiaResidency, PROVIDER_TYPE_LABELS } from '@/lib/providers'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/controls'
import { Input } from '@/components/ui/input'

export interface ProviderGrant {
  providerId: string
  budgetCap: number
}

export const DEFAULT_CAP = 100000

/** New tenant: providers the Super Admin approves straight away, each with a monthly budget cap. */
export function TenantProviderPicker({ value, onChange, error }: { value: ProviderGrant[]; onChange: (v: ProviderGrant[]) => void; error?: string }) {
  const providers = useAppStore((s) => s.infraProviders).filter((p) => p.status === 'active' && p.allowedTenants === 'all')
  return (
    <div role="group" aria-label="Infrastructure providers" className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {providers.map((p) => {
          const grant = value.find((g) => g.providerId === p.id)
          return (
            <div key={p.id} className={cn('flex flex-col gap-2 rounded-control border p-3', grant ? 'border-indigo bg-indigo-50 dark:border-indigo-text' : 'border-border')}>
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  className="mt-0.5"
                  checked={!!grant}
                  onCheckedChange={(v) => onChange(v ? [...value, { providerId: p.id, budgetCap: DEFAULT_CAP }] : value.filter((g) => g.providerId !== p.id))}
                  aria-label={p.name}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-primary">
                    {p.name} <span className="font-mono text-xs font-normal text-text-muted">{p.code}</span>
                  </span>
                  <span className="block text-caption text-text-secondary">
                    {PROVIDER_TYPE_LABELS[p.type]} · India residency: {indiaResidency(p)}
                  </span>
                  <span className="block truncate text-caption text-text-muted">{p.regions.map((r) => r.name).join(', ')}</span>
                </span>
              </label>
              {grant && (
                <label className="flex items-center gap-2 pl-7 text-caption text-text-secondary">
                  Monthly cap (credits)
                  <Input
                    type="number"
                    min={1}
                    step={5000}
                    value={grant.budgetCap}
                    onChange={(e) => onChange(value.map((g) => (g.providerId === p.id ? { ...g, budgetCap: Number(e.target.value) || 0 } : g)))}
                    aria-label={`${p.name} monthly budget cap`}
                    className="h-8 w-32"
                  />
                </label>
              )}
            </div>
          )
        })}
      </div>
      {error && (
        <p className="flex items-start gap-1.5 text-caption text-red-text" role="alert">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  )
}
