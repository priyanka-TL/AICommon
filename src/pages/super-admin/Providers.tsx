import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AudioLines, BrainCircuit, KeyRound, Loader2, MapPin, RefreshCw, Timer } from 'lucide-react'
import type { Provider } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { formatInt } from '@/lib/format'
import { PageHeader } from '@/components/layout/PageHeader'
import { HealthBadge, Tag } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/controls'
import { Skeleton } from '@/components/ui/skeleton'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

function maskKey(key: string) {
  return `${key.slice(0, Math.min(4, key.length - 4))}••••••••${key.slice(-4)}`
}

export default function Providers() {
  const loading = useSimulatedLoading()
  const providers = useAppStore((s) => s.providers)
  const catalog = useAppStore((s) => s.catalog)
  const environments = useAppStore((s) => s.environments)
  const updateProvider = useAppStore((s) => s.updateProvider)
  const [testing, setTesting] = useState<Set<string>>(new Set())
  const [disableTarget, setDisableTarget] = useState<Provider | null>(null)
  const [keyTarget, setKeyTarget] = useState<Provider | null>(null)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const envsUsing = useMemo(() => {
    const live = environments.filter((e) => e.status !== 'terminated')
    return (p: Provider) =>
      live.filter((e) => [...e.spec.llms.map((l) => l.id), ...e.spec.asr].some((id) => p.serves.includes(id))).length
  }, [environments])

  const counts = {
    healthy: providers.filter((p) => p.health === 'healthy').length,
    degraded: providers.filter((p) => p.health === 'degraded').length,
    down: providers.filter((p) => p.health === 'down').length,
  }

  const runTest = (p: Provider, quiet = false) => {
    setTesting((s) => new Set(s).add(p.id))
    const t = window.setTimeout(() => {
      setTesting((s) => {
        const n = new Set(s)
        n.delete(p.id)
        return n
      })
      const current = useAppStore.getState().providers.find((x) => x.id === p.id)!
      if (current.health === 'down') {
        updateProvider(p.id, { latencyMs: 0 })
        toast.error(`Couldn’t reach ${current.name}.`, { description: 'The request timed out after 10 seconds. Check the key and the provider’s status page.' })
        return
      }
      const base = current.latencyMs || 600
      const latency = Math.round(base * (0.9 + Math.random() * 0.2))
      updateProvider(p.id, { latencyMs: latency })
      if (quiet) return
      if (current.health === 'degraded') {
        toast.warning(`${current.name} responded slowly (${formatInt(latency)} ms).`, { description: 'Some requests may time out. We’ll keep checking every 5 minutes.' })
      } else {
        toast.success(`${current.name} responded in ${formatInt(latency)} ms.`)
      }
    }, 1200)
    timers.current.push(t)
  }

  const testAll = () => {
    providers.forEach((p) => runTest(p, true))
    const t = window.setTimeout(() => {
      const s = useAppStore.getState().providers
      const bad = s.filter((p) => p.health !== 'healthy')
      if (bad.length) toast.warning(`Checked ${s.length} providers. ${bad.length} need attention.`, { description: bad.map((p) => p.name).join(', ') })
      else toast.success(`All ${s.length} providers are healthy.`)
    }, 1300)
    timers.current.push(t)
  }

  const setEnabled = (p: Provider, enabled: boolean) => {
    if (!enabled) {
      setDisableTarget(p)
      return
    }
    updateProvider(p.id, { enabled: true })
    if (p.health === 'down') toast.warning(`${p.name} is enabled, but its last check failed.`, { description: 'Test the connection before telling organisations.' })
    else toast.success(`${p.name} is enabled.`)
  }

  const section = (kind: Provider['kind'], title: string, Icon: typeof BrainCircuit) => (
    <section className="mt-8 first:mt-0">
      <h2 className="mb-4 flex items-center gap-2 font-heading text-h2 text-text-primary">
        <Icon className="size-5 text-indigo-text" aria-hidden /> {title}
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-card" />)
          : providers
              .filter((p) => p.kind === kind)
              .map((p) => {
                const isTesting = testing.has(p.id)
                const served = p.serves.map((id) => catalog.find((c) => c.id === id)?.name).filter(Boolean) as string[]
                const using = envsUsing(p)
                return (
                  <article key={p.id} className={cn('card flex flex-col gap-4 p-5', !p.enabled && 'bg-bg-subtle')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-heading text-h3 text-text-primary">{p.name}</h3>
                        <p className="mt-0.5 flex items-center gap-1.5 text-caption text-text-secondary">
                          <MapPin className="size-3.5 text-text-muted" aria-hidden /> {p.region}
                        </p>
                      </div>
                      {p.enabled ? <HealthBadge health={p.health} /> : <Tag>Disabled</Tag>}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {served.map((s) => (
                        <Tag key={s}>{s}</Tag>
                      ))}
                    </div>

                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="eyebrow">Latency</dt>
                        <dd className="tabular mt-1 flex items-center gap-1.5 text-text-primary">
                          <Timer className="size-3.5 text-text-muted" aria-hidden />
                          {p.latencyMs ? `${formatInt(p.latencyMs)} ms` : 'No response'}
                        </dd>
                      </div>
                      <div>
                        <dt className="eyebrow">Used by</dt>
                        <dd className="tabular mt-1 text-text-primary">
                          {using} environment{using === 1 ? '' : 's'}
                        </dd>
                      </div>
                    </dl>

                    <div>
                      <p className="eyebrow mb-1.5">API key</p>
                      <div className="flex items-center gap-2 rounded-control border border-border bg-bg-surface py-1 pl-3 pr-1">
                        <code className="min-w-0 flex-1 truncate font-mono text-caption text-text-primary" aria-label="Masked API key">
                          {p.maskedKey}
                        </code>
                        <Button variant="ghost" size="sm" onClick={() => setKeyTarget(p)}>
                          <KeyRound /> Replace
                        </Button>
                      </div>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
                      <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-text-primary">
                        <Switch checked={p.enabled} onCheckedChange={(v) => setEnabled(p, v)} aria-label={`${p.name} enabled`} />
                        {p.enabled ? 'Enabled' : 'Disabled'}
                      </label>
                      <Button variant="secondary" size="compact" onClick={() => runTest(p)} disabled={isTesting}>
                        {isTesting ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                        {isTesting ? 'Testing…' : 'Test connection'}
                      </Button>
                    </div>
                  </article>
                )
              })}
      </div>
    </section>
  )

  const disableCount = disableTarget ? envsUsing(disableTarget) : 0

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Providers"
        description="Model and speech providers behind the catalog. Keys are stored encrypted and never shown in full."
        actions={
          <Button onClick={testAll} disabled={testing.size > 0}>
            <RefreshCw /> Test all connections
          </Button>
        }
      />

      <div className="mb-8 flex flex-wrap gap-3">
        {(
          [
            ['healthy', 'Healthy'],
            ['degraded', 'Degraded'],
            ['down', 'Down'],
          ] as const
        ).map(([h, label]) => (
          <div key={h} className="card flex items-center gap-3 px-4 py-3">
            <HealthBadge health={h} />
            <span className="tabular font-heading text-h3 text-text-primary">{counts[h]}</span>
            <span className="sr-only">{label}</span>
          </div>
        ))}
      </div>

      {section('llm', 'Language model providers', BrainCircuit)}
      {section('asr', 'Speech recognition providers', AudioLines)}

      <ConfirmDialog
        open={!!disableTarget}
        onOpenChange={(o) => !o && setDisableTarget(null)}
        title={`Disable ${disableTarget?.name}?`}
        description={
          disableCount
            ? `${disableCount} environment${disableCount > 1 ? 's use' : ' uses'} models from this provider. Calls to them will fail until you enable it again.`
            : 'No environment uses this provider right now. Organisations won’t be able to pick its models until you enable it again.'
        }
        confirmLabel="Disable provider"
        destructive
        onConfirm={() => {
          if (!disableTarget) return
          updateProvider(disableTarget.id, { enabled: false })
          toast.error(`${disableTarget.name} is disabled.`)
        }}
      />

      <ReplaceKeyDialog
        provider={keyTarget}
        onClose={() => setKeyTarget(null)}
        onSave={(key) => {
          if (!keyTarget) return
          updateProvider(keyTarget.id, { maskedKey: maskKey(key) })
          toast.success(`Key replaced for ${keyTarget.name}.`, { description: 'The old key stops being used straight away.' })
          setKeyTarget(null)
        }}
      />
    </>
  )
}

function ReplaceKeyDialog({ provider, onClose, onSave }: { provider: Provider | null; onClose: () => void; onSave: (key: string) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue('')
    setError(null)
  }, [provider])

  return (
    <Dialog open={!!provider} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader title={`Replace API key for ${provider?.name ?? ''}`} description="Paste the new key from the provider’s console. We only keep the last four characters visible." />
        <DialogBody>
          <Field label="New API key" htmlFor="new-key" required error={error}>
            <Input
              id="new-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setError(null)
              }}
              aria-invalid={!!error}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            onClick={() => {
              const k = value.trim()
              if (k.length < 16) {
                setError('This key looks too short. Paste the full key; most are longer than 16 characters.')
                return
              }
              onSave(k)
            }}
          >
            Replace key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
