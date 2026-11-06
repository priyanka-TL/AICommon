import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowUpRight, CheckCircle2, ExternalLink, GitBranch, GitPullRequestArrow, Globe2, MessageSquareWarning, XCircle } from 'lucide-react'
import type { CatalogCategory, Suggestion } from '@/data/types'
import { useAppStore, type RegistryFields, type SuggestionAction } from '@/store/useAppStore'
import { useScope, useScopedSuggestions, useVisibleTenants } from '@/store/selectors'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { formatDateTime, relativeTime } from '@/lib/format'
import { CATEGORY_SINGULAR, roleLabel, SUGGESTION_LABELS } from '@/lib/labels'
import { itemPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { SuggestionBadge, Tag } from '@/components/shared/StatusBadge'
import { Avatar } from '@/components/shared/Avatar'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox, RadioGroup, RadioGroupItem } from '@/components/ui/controls'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/dialog'

type Filter = 'open' | 'all'

export function SuggestionHistory({ s }: { s: Suggestion }) {
  const users = useAppStore((st) => st.users)
  return (
    <ol className="flex flex-col gap-3">
      {s.history.map((h, i) => (
        <li key={`${h.at}-${i}`} className="flex gap-3 text-sm">
          <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', h.status === 'rejected' ? 'bg-red' : 'bg-indigo dark:bg-indigo-text')} aria-hidden />
          <div className="min-w-0">
            <p className="text-text-primary">
              <span className="font-semibold">{SUGGESTION_LABELS[h.status]}</span>
              <span className="text-text-secondary">
                {' '}
                · {users.find((u) => u.id === h.actorId)?.name ?? 'System'}
                {h.actorRole !== 'system' ? ` (${roleLabel(h.actorRole)})` : ''} · {formatDateTime(h.at)}
              </span>
            </p>
            {h.comment && <p className="mt-1 rounded-control bg-bg-subtle px-3 py-2 text-text-primary">{h.comment}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

function ReviewSheet({ suggestion, onClose }: { suggestion: Suggestion | null; onClose: () => void }) {
  const scope = useScope()!
  const users = useAppStore((s) => s.users)
  const tenants = useVisibleTenants(true)
  const catalog = useAppStore((s) => s.catalog)
  const decide = useAppStore((s) => s.decideSuggestion)
  const openSuggestion = useAppStore((s) => s.openSuggestion)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [publishMode, setPublishMode] = useState<'all' | 'selected'>('all')
  const [publishTo, setPublishTo] = useState<string[]>([])
  const [reg, setReg] = useState<RegistryFields>({ version: '', licence: '', dependencies: '', installInstructions: '', resourceRequirements: '', runtimes: ['Python'] })

  useEffect(() => {
    if (!suggestion) return
    openSuggestion(suggestion.id)
    setComment('')
    setError(null)
    setPublishMode('all')
    setPublishTo([suggestion.tenantId])
    const item = suggestion.catalogItemId ? catalog.find((c) => c.id === suggestion.catalogItemId) : undefined
    setReg({
      version: item?.version && item.version !== 'latest' ? item.version : '',
      licence: item?.licence ?? suggestion.licence,
      dependencies: item?.dependencies && item.dependencies !== 'Not reviewed yet' ? item.dependencies : '',
      installInstructions: item?.installInstructions ?? '',
      resourceRequirements: item?.resourceRequirements ?? '',
      runtimes: item?.runtimes ?? ['Python'],
    })
    // Load once per opened suggestion.
  }, [suggestion?.id])

  if (!suggestion) return <Sheet open={false} onOpenChange={() => undefined} />
  const s = suggestion
  const by = users.find((u) => u.id === s.suggestedById)
  const tenant = tenants.find((t) => t.id === s.tenantId)
  const isSuper = scope.role === 'super_admin'
  const open = ['submitted', 'under_review'].includes(s.status)
  const taCan = !isSuper && open && !s.forwarded
  const saCan = isSuper && (open || s.status === 'approved_tenant')

  const act = (action: SuggestionAction) => {
    const extra = action === 'publish' ? { publishTo: publishMode === 'all' ? ('all' as const) : publishTo, registry: reg } : {}
    if (action === 'publish' && (!reg.version.trim() || !reg.licence.trim())) {
      setError('Add a version and a licence before publishing.')
      return
    }
    const res = decide(s.id, action, { comment, ...extra })
    if (!res.ok) {
      setError(res.error)
      return
    }
    const msg: Record<SuggestionAction, string> = {
      approve_tenant: `Approved ${s.name} for ${tenant?.name}.`,
      forward: `Forwarded ${s.name} to the Super Admin.`,
      needs_info: 'Asked for more information.',
      reject: `Rejected ${s.name}.`,
      publish: `Published ${s.name}.`,
    }
    toast.success(msg[action])
    onClose()
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <div className="border-b border-border px-6 pb-5 pr-14 pt-6">
          <p className="eyebrow">{isSuper ? `Suggestion from ${tenant?.name}` : 'Capability suggestion'}</p>
          <SheetTitle className="mt-1 font-heading text-h2 text-text-primary">{s.name}</SheetTitle>
          <SheetDescription className="sr-only">Review this suggestion</SheetDescription>
          <div className="mt-3 flex flex-wrap gap-2">
            <SuggestionBadge status={s.status} forwarded={s.forwarded} />
            <Tag>{CATEGORY_SINGULAR[s.category]}</Tag>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
          <section className="rounded-card border border-border bg-bg-subtle p-4">
            <p className="eyebrow mb-2">Repository</p>
            <a href={s.githubUrl} target="_blank" rel="noreferrer" className="link flex items-center gap-2 break-all font-mono text-caption">
              <GitBranch className="size-4 shrink-0" aria-hidden /> {s.githubUrl.replace('https://', '')} <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            </a>
            {s.docsUrl && (
              <a href={s.docsUrl} target="_blank" rel="noreferrer" className="link mt-2 flex items-center gap-2 break-all text-caption">
                <Globe2 className="size-4 shrink-0" aria-hidden /> Documentation
              </a>
            )}
            <p className="mt-2 text-caption text-text-muted">Licence stated: {s.licence || 'Not given'}</p>
          </section>
          <section>
            <p className="eyebrow mb-2">What it is</p>
            <p className="text-sm text-text-primary">{s.description}</p>
          </section>
          <section>
            <p className="eyebrow mb-2">Why the team needs it</p>
            <blockquote className="border-l-[3px] border-purple pl-3 text-sm italic text-text-primary">{s.useCase}</blockquote>
            <p className="mt-2 flex items-center gap-2 text-caption text-text-secondary">
              <Avatar name={by?.name ?? '?'} size="sm" /> {by?.name} · {tenant?.name} · {relativeTime(s.createdAt)}
            </p>
          </section>
          <section>
            <p className="eyebrow mb-3">History</p>
            <SuggestionHistory s={s} />
          </section>

          {saCan && (
            <section className="flex flex-col gap-4 rounded-card border border-border p-4">
              <p className="font-heading text-h3 text-text-primary">Registry details</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Version" htmlFor="rg-version" required>
                  <Input id="rg-version" value={reg.version} onChange={(e) => setReg({ ...reg, version: e.target.value })} placeholder="0.4.2" />
                </Field>
                <Field label="Licence" htmlFor="rg-licence" required>
                  <Input id="rg-licence" value={reg.licence} onChange={(e) => setReg({ ...reg, licence: e.target.value })} placeholder="Apache 2.0" />
                </Field>
              </div>
              <Field label="Dependencies" htmlFor="rg-deps">
                <Input id="rg-deps" value={reg.dependencies} onChange={(e) => setReg({ ...reg, dependencies: e.target.value })} placeholder="Python 3.10 or later" />
              </Field>
              <Field label="Install instructions" htmlFor="rg-install">
                <Textarea id="rg-install" value={reg.installInstructions} onChange={(e) => setReg({ ...reg, installInstructions: e.target.value })} className="min-h-[64px] font-mono text-caption" />
              </Field>
              <Field label="Resource requirements" htmlFor="rg-res">
                <Input id="rg-res" value={reg.resourceRequirements} onChange={(e) => setReg({ ...reg, resourceRequirements: e.target.value })} placeholder="1 vCPU and 2 GB RAM" />
              </Field>
              <Field label="Compatible runtimes" helper="Separate with commas">
                <Input value={reg.runtimes.join(', ')} onChange={(e) => setReg({ ...reg, runtimes: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} aria-label="Compatible runtimes" />
              </Field>
              <Field label="Publish to">
                <RadioGroup value={publishMode} onValueChange={(v) => setPublishMode(v as typeof publishMode)} className="gap-2">
                  <label className="flex cursor-pointer items-center gap-3 text-sm">
                    <RadioGroupItem value="all" /> All tenants
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 text-sm">
                    <RadioGroupItem value="selected" /> Selected tenants
                  </label>
                </RadioGroup>
                {publishMode === 'selected' && (
                  <div className="mt-2 flex flex-col gap-2 pl-7">
                    {tenants.map((t) => (
                      <label key={t.id} className="flex cursor-pointer items-center gap-3 text-sm">
                        <Checkbox checked={publishTo.includes(t.id)} onCheckedChange={(v) => setPublishTo(v ? [...publishTo, t.id] : publishTo.filter((x) => x !== t.id))} />
                        {t.name}
                      </label>
                    ))}
                  </div>
                )}
              </Field>
            </section>
          )}

          {(taCan || saCan) && (
            <Field label="Comment" htmlFor="sg-comment" helper="Required to ask for info or reject. The suggester sees it." error={error}>
              <Textarea id="sg-comment" value={comment} onChange={(e) => { setComment(e.target.value); setError(null) }} />
            </Field>
          )}

          {s.catalogItemId && (s.status === 'approved_tenant' || s.status === 'published') && (
            <Link to={itemPath(scope.role, s.catalogItemId)} className="link text-sm">
              See it in the {isSuper ? 'registry' : 'catalog'}
            </Link>
          )}
        </div>

        {(taCan || saCan) && (
          <div className="flex flex-wrap gap-2 border-t border-border px-6 py-4">
            {saCan ? (
              <Button onClick={() => act('publish')}>
                <ArrowUpRight /> Publish
              </Button>
            ) : (
              <Button onClick={() => act('approve_tenant')}>
                <CheckCircle2 /> Approve for {tenant?.name}
              </Button>
            )}
            {taCan && (
              <Button variant="secondary" onClick={() => act('forward')}>
                <ArrowUpRight /> Forward to Super Admin
              </Button>
            )}
            {saCan && open && (
              <Button variant="secondary" onClick={() => act('approve_tenant')}>
                <CheckCircle2 /> Approve for {tenant?.name} only
              </Button>
            )}
            <Button variant="secondary" onClick={() => act('needs_info')}>
              <MessageSquareWarning /> Ask for info
            </Button>
            <Button variant="ghost" className="text-red-text hover:text-red-text" onClick={() => act('reject')}>
              <XCircle /> Reject
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default function Suggestions() {
  const loading = useSimulatedLoading()
  const scope = useScope()!
  const suggestions = useScopedSuggestions()
  const tenants = useVisibleTenants(true)
  const users = useAppStore((s) => s.users)
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>('open')
  const isSuper = scope.role === 'super_admin'
  const selected = suggestions.find((s) => s.id === params.get('id')) ?? null

  const needsMe = (s: Suggestion) =>
    isSuper ? (s.forwarded && ['submitted', 'under_review'].includes(s.status)) || s.status === 'approved_tenant' : ['submitted', 'under_review'].includes(s.status) && !s.forwarded
  const rows = suggestions.filter((s) => filter === 'all' || needsMe(s)).sort((a, b) => b.history[b.history.length - 1]!.at.localeCompare(a.history[a.history.length - 1]!.at))

  return (
    <>
      <PageHeader
        eyebrow={isSuper ? 'Platform' : tenants.find((t) => t.id === scope.user.tenantId)?.name}
        title="Capability suggestions"
        description={
          isSuper
            ? 'Suggestions forwarded by Tenant Admins, plus tenant-only approvals you can publish more widely. Nothing reaches another tenant until you publish it.'
            : 'GitHub repositories your team has suggested. Approve them for your tenant, ask for more information, or forward them to the Super Admin.'
        }
      />
      <div className="mb-4 flex gap-1 border-b border-border" role="tablist">
        {(
          [
            ['open', isSuper ? 'Waiting for you' : 'Needs review'],
            ['all', 'All suggestions'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={filter === v}
            onClick={() => setFilter(v)}
            className={cn('-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold', filter === v ? 'border-indigo text-indigo-text' : 'border-transparent text-text-secondary hover:text-text-primary')}
          >
            {label} <span className="tabular text-text-muted">{v === 'open' ? suggestions.filter(needsMe).length : suggestions.length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={GitPullRequestArrow} title={filter === 'open' ? 'Nothing is waiting for you' : 'No suggestions yet'} description="People suggest GitHub repositories from the AI Capability Marketplace." />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((s) => {
            const by = users.find((u) => u.id === s.suggestedById)
            return (
              <li key={s.id}>
                <button type="button" onClick={() => setParams({ id: s.id })} className="card card-interactive flex w-full flex-col gap-2 p-5 text-left sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-h3 text-text-primary">{s.name}</span>
                      <Tag>{CATEGORY_SINGULAR[s.category as CatalogCategory]}</Tag>
                    </div>
                    <p className="mt-1 truncate font-mono text-caption text-text-secondary">{s.githubUrl.replace('https://', '')}</p>
                    <p className="mt-1 text-caption text-text-muted">
                      {by?.name}
                      {isSuper ? ` · ${tenants.find((t) => t.id === s.tenantId)?.name}` : ''} · {relativeTime(s.createdAt)}
                    </p>
                  </div>
                  <SuggestionBadge status={s.status} forwarded={s.forwarded} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <ReviewSheet suggestion={selected} onClose={() => setParams({})} />
    </>
  )
}
