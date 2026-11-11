import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { KeyRound, Loader2, PlugZap, RefreshCw, ShieldOff } from 'lucide-react'
import type { CredentialKind, InfraProvider, RateCard } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useModelCostContext } from '@/hooks/useModelCost'
import { latestRateCard, rateCardAt } from '@/lib/cost'
import { groupCost, thisMonth, unitPrices } from '@/lib/modelCost'
import { formatDate, formatDateTime, formatINR, formatINRPrice, formatInt } from '@/lib/format'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'

const KINDS: CredentialKind[] = ['Access key', 'IAM role', 'API key + endpoint', 'Service account', 'API key', 'Internal token']

const DEFAULT_KIND: Record<string, CredentialKind> = { bedrock: 'IAM role', azure_openai: 'API key + endpoint', vertex: 'Service account', openrouter: 'API key', onprem_models: 'Internal token' }

/** Super Admin only: the provider's model service credential and its model rate card. */
export function ProviderModelsTab({ provider, onEditPrices }: { provider: InfraProvider; onEditPrices: () => void }) {
  const current = rateCardAt(provider)
  const latest = latestRateCard(provider)!
  const upcoming = latest.version !== current?.version ? latest : undefined
  const earlier = provider.rateCards.filter((c) => c.version !== current?.version && c.version !== upcoming?.version && c.modelPrices.length > 0)

  return (
    <div className="flex flex-col gap-6">
      <ConnectionCard provider={provider} />
      {upcoming && (
        <section className="card border-indigo p-6 dark:border-indigo-text">
          <h2 className="mb-4 font-heading text-h3 text-text-primary">Upcoming: model prices on rate card v{upcoming.version}</h2>
          <ModelPriceTable provider={provider} card={upcoming} />
        </section>
      )}
      <section className="card p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-h3 text-text-primary">Model rate card{current ? ` · v${current.version}` : ''}</h2>
            <p className="mt-0.5 text-caption text-text-secondary">Prices change only by publishing a new rate card version. Usage before its effective date keeps the old prices.</p>
          </div>
          <Button variant="secondary" onClick={onEditPrices}>
            Edit model prices
          </Button>
        </div>
        {current ? <ModelPriceTable provider={provider} card={current} /> : <p className="text-sm text-text-secondary">No rate card in force yet.</p>}
      </section>
      {earlier.length > 0 && (
        <section className="card p-6">
          <h2 className="mb-3 font-heading text-h3 text-text-primary">Earlier model prices</h2>
          <ul className="flex flex-col divide-y divide-border">
            {[...earlier].reverse().map((c) => (
              <li key={c.version}>
                <details className="py-3">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-text-primary">
                    Version {c.version} · effective from {formatDate(c.effectiveFrom)} <span className="font-normal text-text-secondary">· {c.source}</span>
                  </summary>
                  <div className="mt-4">
                    <ModelPriceTable provider={provider} card={c} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
      <UsageByTenant provider={provider} />
    </div>
  )
}

function ConnectionCard({ provider }: { provider: InfraProvider }) {
  const revoke = useAppStore((s) => s.revokeModelServiceKey)
  const test = useAppStore((s) => s.testModelServiceKey)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [testing, setTesting] = useState(false)
  const svc = provider.modelService

  const runTest = async () => {
    setTesting(true)
    const res = await test(provider.id)
    setTesting(false)
    if (res.ok) toast.success(`Connected to ${provider.name}.`)
    else toast.error(res.error)
  }

  return (
    <section className="card p-6" data-testid="model-service-connection">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-h3 text-text-primary">Model service connection</h2>
          <p className="mt-0.5 text-caption text-text-secondary">One credential for this provider. Projects use it to call platform models; no user or Tenant Admin ever sees it.</p>
        </div>
        {svc && <StatusBadge status={svc.status === 'connected' ? 'active' : 'rejected'} label={svc.status === 'connected' ? 'Connected' : 'Revoked'} />}
      </div>
      {svc ? (
        <>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="eyebrow">Credential</dt>
              <dd className="mt-1 text-text-primary">{svc.credentialKind}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="eyebrow">Value</dt>
              <dd className="mt-1 break-all font-mono text-caption text-text-primary">{svc.maskedKey}</dd>
            </div>
            {svc.endpoint && (
              <div className="sm:col-span-3">
                <dt className="eyebrow">Endpoint</dt>
                <dd className="mt-1 break-all font-mono text-caption text-text-primary">{svc.endpoint}</dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-caption text-text-muted">
            Updated {formatDateTime(svc.updatedAt)}
            {svc.lastTestedAt ? ` · last test ${formatDateTime(svc.lastTestedAt)}: ${svc.lastTestOk ? `connected in ${svc.lastTestLatencyMs} ms` : 'failed'}` : ' · not tested yet'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={runTest} disabled={testing}>
              {testing ? <Loader2 className="animate-spin" /> : <PlugZap />} Test connection
            </Button>
            <Button variant="secondary" onClick={() => setReplaceOpen(true)}>
              <RefreshCw /> Replace
            </Button>
            {svc.status === 'connected' && (
              <Button variant="ghost" className="text-red-text hover:text-red-text" onClick={() => setRevokeOpen(true)}>
                <ShieldOff /> Revoke
              </Button>
            )}
          </div>
        </>
      ) : (
        <EmptyState
          icon={KeyRound}
          title="No model service connected"
          description={`Connect ${provider.name}’s credential so projects can use its models.`}
          action={<Button onClick={() => setReplaceOpen(true)}>Connect credential</Button>}
          className="py-6"
        />
      )}
      <ReplaceKeyDialog provider={provider} open={replaceOpen} onOpenChange={setReplaceOpen} />
      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title={`Revoke ${provider.name}’s model credential?`}
        description="Its models disappear from the provider choice straight away, and projects using them need another provider. Connect a new credential to bring them back."
        confirmLabel="Revoke credential"
        destructive
        onConfirm={() => {
          const res = revoke(provider.id)
          if (res.ok) toast.success(`Revoked the model credential for ${provider.name}.`)
          else toast.error(res.error)
          setRevokeOpen(false)
        }}
      />
    </section>
  )
}

function ReplaceKeyDialog({ provider, open, onOpenChange }: { provider: InfraProvider; open: boolean; onOpenChange: (o: boolean) => void }) {
  const save = useAppStore((s) => s.setModelServiceKey)
  const [kind, setKind] = useState<CredentialKind>(provider.modelService?.credentialKind ?? DEFAULT_KIND[provider.aiServices[0] ?? ''] ?? 'API key')
  const [key, setKey] = useState('')
  const [endpoint, setEndpoint] = useState(provider.modelService?.endpoint ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const res = save(provider.id, { credentialKind: kind, key, endpoint })
    if (!res.ok) return setError(res.error)
    toast.success(`Saved the model credential for ${provider.name}.`, { description: 'Only a masked value is kept.' })
    setKey('')
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader title={`${provider.modelService ? 'Replace' : 'Connect'} model credential`} description={`For ${provider.name}. After saving, the credential is masked and can’t be viewed again.`} />
        <DialogBody className="flex flex-col gap-4">
          <Field label="Credential type" htmlFor="mk-kind">
            <Select value={kind} onValueChange={(v) => setKind(v as CredentialKind)}>
              <SelectTrigger id="mk-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={kind === 'IAM role' ? 'Role ARN' : kind === 'Service account' ? 'Service account key (JSON or email)' : 'Key'} htmlFor="mk-key" required error={error}>
            <Input id="mk-key" type="password" autoComplete="off" value={key} onChange={(e) => { setKey(e.target.value); setError(null) }} className="font-mono" />
          </Field>
          <Field label="Endpoint" htmlFor="mk-endpoint" required={kind === 'API key + endpoint'} helper={kind === 'API key + endpoint' ? undefined : 'Optional'}>
            <Input id="mk-endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://" className="font-mono" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={submit}>Save credential</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ModelPriceTable({ provider, card }: { provider: InfraProvider; card: RateCard }) {
  const catalog = useAppStore((s) => s.catalog)
  const sample = { orgType: 'NGO' as const }
  if (!card.modelPrices.length) return <p className="text-sm text-text-secondary">No model prices on this version.</p>
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-text-secondary">
        Effective from {formatDate(card.effectiveFrom)} · {card.source} · platform fee {card.platformFeePct}%, NGO discount {card.ngoDiscountPct}%, GST {card.gstPct}% apply to model usage.
      </p>
      <div className="overflow-x-auto rounded-control border border-border">
        <table className="w-full min-w-[860px] text-sm" aria-label={`Model prices, rate card v${card.version}`}>
          <thead className="bg-bg-subtle text-left text-caption text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-semibold">Model</th>
              <th className="px-3 py-2 font-semibold">Model ID at {provider.code}</th>
              <th className="px-3 py-2 font-semibold">Regions</th>
              <th className="px-3 py-2 text-right font-semibold">Input ₹ / 1M</th>
              <th className="px-3 py-2 text-right font-semibold">Output ₹ / 1M</th>
              <th className="px-3 py-2 text-right font-semibold">₹ / audio min</th>
              <th className="px-3 py-2 text-right font-semibold">NGO pays (in / out)</th>
              <th className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {card.modelPrices.map((m) => {
              const u = unitPrices(m, card, sample)
              return (
                <tr key={m.modelId} className="h-[52px]" data-price-row={m.modelId}>
                  <td className="px-3 py-2 font-semibold text-text-primary">{catalog.find((c) => c.id === m.modelId)?.name ?? m.modelId}</td>
                  <td className="px-3 py-2 font-mono text-caption text-text-secondary">{m.providerModelId}</td>
                  <td className="px-3 py-2 text-text-secondary">
                    {m.regionIds.map((r) => provider.regions.find((x) => x.id === r)?.name ?? r).join(', ')}
                  </td>
                  <td className="tabular px-3 py-2 text-right">{m.perAudioMinute !== undefined ? '—' : formatINRPrice(m.inputPer1M)}</td>
                  <td className="tabular px-3 py-2 text-right">{m.perAudioMinute !== undefined || m.outputPer1M === 0 ? '—' : formatINRPrice(m.outputPer1M)}</td>
                  <td className="tabular px-3 py-2 text-right">{m.perAudioMinute !== undefined ? formatINRPrice(m.perAudioMinute) : '—'}</td>
                  <td className="tabular px-3 py-2 text-right text-text-secondary">
                    {u.speech ? `${formatINRPrice(u.perMinute)} / min` : `${formatINRPrice(u.input)} / ${formatINRPrice(u.output)}`}
                  </td>
                  <td className="px-3 py-2">{m.status === 'available' ? <StatusBadge status="active" label="Available" /> : <StatusBadge status="stopped" label="Disabled" />}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UsageByTenant({ provider }: { provider: InfraProvider }) {
  const usage = useAppStore((s) => s.modelUsage)
  const tenants = useAppStore((s) => s.tenants)
  const catalog = useAppStore((s) => s.catalog)
  const ctx = useModelCostContext()
  const rows = useMemo(() => thisMonth(usage.filter((u) => u.providerId === provider.id)), [usage, provider.id])
  const byTenant = useMemo(() => groupCost(rows, (r) => r.tenantId, ctx), [rows, ctx])
  const byModel = useMemo(() => groupCost(rows, (r) => r.modelId, ctx), [rows, ctx])
  return (
    <section className="card p-6">
      <h2 className="mb-1 font-heading text-h3 text-text-primary">Model usage this month</h2>
      <p className="mb-4 text-caption text-text-secondary">What organisations have spent on this provider’s models, on the prices in force each day.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-text-secondary">No model usage this month.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <ul className="divide-y divide-border text-sm" aria-label="By organisation">
            {byTenant.map((g) => (
              <li key={g.key} className="flex justify-between gap-3 py-2">
                <span className="text-text-primary">{tenants.find((t) => t.id === g.key)?.name ?? g.key}</span>
                <span className="tabular font-semibold">{formatINR(g.cost)}</span>
              </li>
            ))}
          </ul>
          <ul className="divide-y divide-border text-sm" aria-label="By model">
            {byModel.map((g) => (
              <li key={g.key} className="flex justify-between gap-3 py-2">
                <span className="text-text-primary">
                  {catalog.find((c) => c.id === g.key)?.name ?? g.key} <Tag className="ml-1">{g.audioMinutes ? `${formatInt(g.audioMinutes)} min` : `${formatInt((g.inputTokens + g.outputTokens) / 1_000_000)}M tokens`}</Tag>
                </span>
                <span className="tabular font-semibold">{formatINR(g.cost)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
