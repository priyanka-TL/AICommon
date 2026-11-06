import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowRight, Check, ServerOff } from 'lucide-react'
import type { CatalogItem, EnvSpec, Language } from '@/data/types'
import { useAppStore, useCurrentTenant } from '@/store/useAppStore'
import { checkQuota, estimateCost } from '@/lib/cost'
import { formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/input'
import { Slider } from '@/components/ui/controls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'

const includes = (spec: EnvSpec, id: string) => spec.llms.some((l) => l.id === id) || spec.asr.includes(id) || spec.capabilities.includes(id)

export function useEligibleEnvironments(item: CatalogItem | undefined) {
  const tenant = useCurrentTenant()
  const environments = useAppStore((s) => s.environments)
  const requests = useAppStore((s) => s.requests)
  return useMemo(
    () =>
      item && tenant
        ? environments.filter(
            (e) =>
              e.tenantId === tenant.id &&
              ['running', 'stopped', 'approved', 'provisioning'].includes(e.status) &&
              !includes(e.spec, item.id) &&
              !requests.some((r) => r.envId === e.id && r.type === 'change' && r.status === 'pending'),
          )
        : [],
    [item, tenant, environments, requests],
  )
}

export function AddToEnvironmentDialog({ item, open, onOpenChange }: { item: CatalogItem; open: boolean; onOpenChange: (o: boolean) => void }) {
  const tenant = useCurrentTenant()!
  const catalog = useAppStore((s) => s.catalog)
  const submitChangeRequest = useAppStore((s) => s.submitChangeRequest)
  const eligible = useEligibleEnvironments(item)
  const navigate = useNavigate()
  const [envId, setEnvId] = useState('')
  const [budget, setBudget] = useState(5)
  const [languages, setLanguages] = useState<Language[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const env = eligible.find((e) => e.id === envId)

  useEffect(() => {
    if (open) {
      setEnvId(eligible[0]?.id ?? '')
      setBudget(5)
      setNote('')
      setError(null)
    }
    // Reset only when the dialog opens; `eligible` changes identity on every store update.
  }, [open])

  useEffect(() => {
    if (env) setLanguages(env.spec.languages.filter((l) => item.languages.includes(l)))
  }, [env, item.languages])

  const nextSpec = (): EnvSpec | null => {
    if (!env) return null
    const s = env.spec
    if (item.category === 'llm') return { ...s, llms: [...s.llms, { id: item.id, tokenBudget: budget }] }
    if (item.category === 'asr')
      return {
        ...s,
        asr: [...s.asr, item.id],
        languages: [...new Set([...s.languages, ...languages])],
        asrHoursPerMonth: s.asrHoursPerMonth || 20,
      }
    return { ...s, capabilities: [...s.capabilities, item.id] }
  }

  const next = nextSpec()
  const before = env ? estimateCost(env.spec, catalog) : null
  const after = next ? estimateCost(next, catalog) : null
  const over = after ? checkQuota(tenant, after).over : false

  const submit = () => {
    if (!env || !next) return
    if (item.category === 'asr' && languages.length === 0) {
      setError('Choose at least one language for speech recognition.')
      return
    }
    submitChangeRequest(env.id, { ...next, justification: note.trim() || `Add ${item.name} from the catalog.` })
    toast.success(`Change request sent to add ${item.name}.`, { description: `“${env.spec.name}” keeps running as it is until an admin approves.` })
    onOpenChange(false)
    navigate('/app/requests')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader title={`Add ${item.name} to an environment`} description="This creates a change request. An admin reviews it before it takes effect." />
        {eligible.length === 0 ? (
          <DialogBody>
            <EmptyState
              className="py-6"
              icon={ServerOff}
              title="No environment can take this right now"
              description="Each of your environments either already has it, has a change waiting for review, or isn’t approved yet."
              action={
                <Button asChild variant="secondary">
                  <Link to="/app/environments/new">Request a new environment</Link>
                </Button>
              }
            />
          </DialogBody>
        ) : (
          <>
            <DialogBody className="flex flex-col gap-5">
              <Field label="Environment" htmlFor="add-env">
                <Select value={envId} onValueChange={setEnvId}>
                  <SelectTrigger id="add-env">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {eligible.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.spec.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {env && (
                <div className="-mt-3">
                  <StatusBadge status={env.status} />
                </div>
              )}

              {item.category === 'llm' && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-text-primary">Token budget</span>
                    <span className="tabular text-sm font-semibold text-text-primary">{budget}M tokens / month</span>
                  </div>
                  <Slider min={1} max={50} step={1} value={[budget]} onValueChange={([v]) => setBudget(v!)} aria-label="Token budget in millions" />
                </div>
              )}

              {item.category === 'asr' && (
                <Field label="Languages" required error={error}>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Languages">
                    {item.languages.map((l) => {
                      const on = languages.includes(l)
                      return (
                        <button
                          key={l}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            setLanguages(on ? languages.filter((x) => x !== l) : [...languages, l])
                            setError(null)
                          }}
                          className={cn(
                            'flex h-8 items-center gap-1.5 rounded-full border px-3 text-caption font-semibold',
                            on ? 'border-indigo bg-indigo-50 text-indigo-text dark:border-indigo-text' : 'border-border-strong text-text-secondary hover:bg-bg-subtle',
                          )}
                        >
                          {on && <Check className="size-3.5" aria-hidden />}
                          {l}
                        </button>
                      )
                    })}
                  </div>
                </Field>
              )}

              {before && after && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-bg-subtle p-4">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="tabular text-text-secondary">{formatInt(before.credits)}</span>
                    <ArrowRight className="size-4 text-text-muted" aria-hidden />
                    <span className="tabular font-heading text-h3 text-text-primary">{formatInt(after.credits)}</span>
                    <span className="text-caption text-text-secondary">credits / month</span>
                  </div>
                  {over ? <StatusBadge status="over-quota" /> : <StatusBadge status="running" label="Within quota" />}
                </div>
              )}

              <Field label="Note to your admin" htmlFor="add-note" helper="Optional. Why do you need it?">
                <Textarea id="add-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[72px]" />
              </Field>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button onClick={submit} disabled={!env}>
                Send change request
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
