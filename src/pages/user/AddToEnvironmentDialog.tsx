import { isAdmin } from '@/lib/roles'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowRight, Check, ServerOff } from 'lucide-react'
import type { CatalogItem, EnvSpec, Language } from '@/data/types'
import { useAppStore, useCurrentUser } from '@/store/useAppStore'
import { useScopedEnvironments } from '@/store/selectors'
import { costBreakdown } from '@/lib/cost'
import { useCostContext } from '@/store/selectors'
import { formatInt } from '@/lib/format'
import { envPath, newEnvPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Slider } from '@/components/ui/controls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'

const includes = (spec: EnvSpec, id: string) => spec.llms.some((l) => l.id === id) || spec.asr.includes(id) || spec.capabilities.includes(id)

export function useEligibleEnvironments(item: CatalogItem | undefined) {
  const user = useCurrentUser()
  const environments = useScopedEnvironments()
  const requests = useAppStore((s) => s.requests)
  return useMemo(
    () =>
      item && user
        ? environments.filter(
            (e) =>
              ['active', 'stopped'].includes(e.status) &&
              (isAdmin(user.role) || e.ownerId === user.id || !!e.accessUserIds?.includes(user.id)) &&
              !includes(e.spec, item.id) &&
              !requests.some((r) => r.envId === e.id && r.kind === 'change' && ['submitted', 'under_review', 'resubmitted', 'escalated'].includes(r.status)),
          )
        : [],
    [item, user, environments, requests],
  )
}

export function AddToEnvironmentDialog({ item, open, onOpenChange }: { item: CatalogItem; open: boolean; onOpenChange: (o: boolean) => void }) {
  const user = useCurrentUser()!
  const editEnvironment = useAppStore((s) => s.editEnvironment)
  const eligible = useEligibleEnvironments(item)
  const navigate = useNavigate()
  const [envId, setEnvId] = useState('')
  const [budget, setBudget] = useState(5)
  const [languages, setLanguages] = useState<Language[]>([])
  const [error, setError] = useState<string | null>(null)
  const env = eligible.find((e) => e.id === envId)

  useEffect(() => {
    if (open) {
      setEnvId(eligible[0]?.id ?? '')
      setBudget(5)
      setError(null)
    }
    // Reset only when the dialog opens; `eligible` changes identity on every store update.
  }, [open])

  useEffect(() => {
    if (env) setLanguages(env.spec.languages.filter((l) => item.languages.includes(l)))
  }, [env, item.languages])

  const next: EnvSpec | null = !env
    ? null
    : item.category === 'llm'
      ? { ...env.spec, llms: [...env.spec.llms, { id: item.id, tokenBudget: budget }] }
      : item.category === 'asr'
        ? { ...env.spec, asr: [...env.spec.asr, item.id], languages: [...new Set([...env.spec.languages, ...languages])], asrHoursPerMonth: env.spec.asrHoursPerMonth || 20 }
        : { ...env.spec, capabilities: [...env.spec.capabilities, item.id] }
  const costCtx = useCostContext(env?.tenantId)
  const before = env ? costBreakdown(env.spec, costCtx) : null
  const after = next ? costBreakdown(next, costCtx) : null

  const submit = () => {
    if (!env || !next) return
    if (item.category === 'asr' && languages.length === 0) {
      setError('Choose at least one language for speech recognition.')
      return
    }
    const res = editEnvironment(env.id, next)
    if (res.mode === 'error') {
      setError(res.error)
      return
    }
    toast.success(`Added ${item.name} to “${env.spec.name}”.`, { description: 'It adds no infrastructure, so no approval was needed.' })
    onOpenChange(false)
    navigate(envPath(user.role, env.id))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader title={`Add ${item.name} to an environment`} description="Models and tools add no new infrastructure, so this applies straight away." />
        {eligible.length === 0 ? (
          <DialogBody>
            <EmptyState
              className="py-6"
              icon={ServerOff}
              title="No environment can take this right now"
              description="Each of your environments already has it, has a change waiting for approval, or isn’t active or stopped."
              action={
                <Button asChild variant="secondary">
                  <Link to={newEnvPath(user.role)}>Request a new environment</Link>
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
                <div className="flex flex-wrap items-center gap-3 rounded-card bg-bg-subtle p-4 text-sm">
                  <span className="text-caption text-text-secondary">Estimated cost</span>
                  <span className="tabular text-text-secondary">{formatInt(before.total)}</span>
                  <ArrowRight className="size-4 text-text-muted" aria-hidden />
                  <span className="tabular font-heading text-h3 text-text-primary">{formatInt(after.total)}</span>
                  <span className="text-caption text-text-secondary">credits / month</span>
                </div>
              )}
              {error && item.category !== 'asr' && <p className="text-caption text-red-text">{error}</p>}
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button onClick={submit} disabled={!env}>
                Add to environment
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
