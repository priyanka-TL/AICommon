import { AlertTriangle } from 'lucide-react'
import type { EnvSpec, Environment, InfraProvider } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { providerGpuUse } from '@/lib/cost'

export interface CapacityCheck {
  provider: InfraProvider
  need: number
  free: number
  over: boolean
}

/** GPUs this request adds on its provider, against what the provider has left. */
export function checkProviderCapacity(spec: EnvSpec, previous: EnvSpec | null | undefined, providers: InfraProvider[], environments: Environment[]): CapacityCheck | null {
  const provider = providers.find((p) => p.id === spec.providerId)
  if (!provider) return null
  const gpus = (s: EnvSpec) => s.instance.gpuCount * Math.max(1, s.instanceCount)
  const need = previous && previous.providerId === spec.providerId ? gpus(spec) - gpus(previous) : gpus(spec)
  if (need <= 0) return null
  const free = Math.max(0, provider.maxGpus - providerGpuUse(provider.id, environments))
  return { provider, need, free, over: need > free }
}

export function useProviderCapacity(spec: EnvSpec, previous?: EnvSpec | null) {
  const providers = useAppStore((s) => s.infraProviders)
  const environments = useAppStore((s) => s.environments)
  return checkProviderCapacity(spec, previous, providers, environments)
}

export function ProviderCapacityWarning({ spec, previous }: { spec: EnvSpec; previous?: EnvSpec | null }) {
  const c = useProviderCapacity(spec, previous)
  if (!c?.over) return null
  const gpu = spec.instance.gpuType === 'none' ? '' : `${spec.instance.gpuType} `
  return (
    <div className="flex gap-2.5 rounded-card bg-status-over-bg p-4 text-status-over-fg" role="status">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="text-caption">
        <p className="font-semibold">Over provider capacity</p>
        <p className="mt-0.5">
          This needs {c.need} {gpu}GPU{c.need === 1 ? '' : 's'} on {c.provider.name}. {c.free} of {c.provider.maxGpus} {c.free === 1 ? 'is' : 'are'} free. Choose another provider, or ask the Super Admin to
          raise {c.provider.name}’s capacity.
        </p>
      </div>
    </div>
  )
}
