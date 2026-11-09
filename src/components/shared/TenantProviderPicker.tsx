import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Check } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { indiaResidency, PROVIDER_TYPE_LABELS, providersOfferedTo } from '@/lib/providers'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/controls'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'

/** Checklist of providers the Super Admin can offer a tenant. A brand-new tenant has no id yet, so any provider open to all tenants is listed. */
export function TenantProviderPicker({ tenantId, value, onChange, error }: { tenantId: string | null; value: string[]; onChange: (ids: string[]) => void; error?: string }) {
  const providers = useAppStore((s) => s.infraProviders)
  const offered = tenantId ? providersOfferedTo(providers, tenantId) : providers.filter((p) => p.status === 'active' && p.allowedTenants === 'all')
  return (
    <div role="group" aria-label="Infrastructure providers" className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {offered.map((p) => {
          const on = value.includes(p.id)
          return (
            <label
              key={p.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors hover:bg-bg-subtle',
                on ? 'border-indigo bg-indigo-50 dark:border-indigo-text' : 'border-border',
              )}
            >
              <Checkbox className="mt-0.5" checked={on} onCheckedChange={(v) => onChange(v ? [...value, p.id] : value.filter((x) => x !== p.id))} aria-label={p.name} />
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
          )
        })}
      </div>
      {offered.length === 0 && <p className="text-sm text-text-secondary">No active providers can be offered yet. Add one under Infrastructure Providers.</p>}
      {error && (
        <p className="flex items-start gap-1.5 text-caption text-red-text" role="alert">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  )
}

/** Super Admin: change which providers a tenant can request environments on. */
export function EditTenantProvidersDialog({ tenantId, open, onOpenChange }: { tenantId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === tenantId))
  const setTenantProviders = useAppStore((s) => s.setTenantProviders)
  const [value, setValue] = useState<string[]>(tenant?.providerIds ?? [])
  const [error, setError] = useState<string | undefined>()
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setValue(tenant?.providerIds ?? [])
      setError(undefined)
    }
  }
  if (!tenant) return null
  const save = () => {
    const res = setTenantProviders(tenant.id, value)
    if (!res.ok) return setError(res.error)
    toast.success(`Saved ${tenant.name}’s providers.`)
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader title={`Infrastructure providers for ${tenant.name}`} description="People in this tenant can only request environments on the providers ticked here." />
        <DialogBody>
          <TenantProviderPicker
            tenantId={tenant.id}
            value={value}
            onChange={(v) => {
              setValue(v)
              setError(undefined)
            }}
            error={error}
          />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={save}>
            <Check /> Save providers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
