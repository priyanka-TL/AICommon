import { useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Award, GitBranch, Lock, Plus, SearchX } from 'lucide-react'
import type { CatalogCategory, CatalogItem, Language } from '@/data/types'
import { useAppStore, useCurrentTenant } from '@/store/useAppStore'
import { useScopedProjects, useTenantCatalog } from '@/store/selectors'
import { suggestionsPath } from '@/lib/paths'
import { SuggestDialog } from './SuggestDialog'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { CATEGORY_LABELS, LANGUAGES } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { EmptyState } from '@/components/shared/EmptyState'
import { CatalogStatusBadge, Tag } from '@/components/shared/StatusBadge'
import { costLabel } from '@/components/shared/SelectableCard'
import { ItemMark } from '@/pages/super-admin/Catalog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/controls'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const CATEGORIES = Object.keys(CATEGORY_LABELS) as CatalogCategory[]

function CatalogCard({ item, allowed, inUse, recommendedFor }: { item: CatalogItem; allowed: boolean; inUse: number; recommendedFor: string[] }) {
  return (
    <Link to={`/app/catalog/${item.id}`} className={cn('card card-interactive flex flex-col gap-3 p-5', item.status === 'deprecated' && 'opacity-70')}>
      <div className="flex items-start gap-3">
        <ItemMark item={item} className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-text-primary">{item.name}</p>
          <p className="truncate text-caption text-text-muted">
            {item.provider} · {/^\d/.test(item.version) ? `v${item.version}` : item.version}
          </p>
        </div>
        {item.status !== 'active' && <CatalogStatusBadge status={item.status} />}
      </div>
      {recommendedFor.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-control bg-indigo-50 px-2.5 py-1.5 text-caption font-semibold text-indigo-text">
          <Award className="mt-px size-3.5 shrink-0" aria-hidden />
          Recommended for {recommendedFor.join(', ')}
        </p>
      )}
      <p className="line-clamp-2 text-caption text-text-secondary">{item.description}</p>
      <div className="flex flex-wrap gap-1.5">
        <Tag>{item.hosting === 'hosted' ? 'Hosted API' : 'Open source'}</Tag>
        <Tag>{item.licence}</Tag>
        {item.languages.length > 0 && <Tag>{item.languages.length === 7 ? 'All 7 languages' : `${item.languages.length} languages`}</Tag>}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3 text-caption">
        <span className="tabular text-text-secondary">{costLabel(item)}</span>
        {!allowed ? (
          <span className="flex items-center gap-1 text-text-muted">
            <Lock className="size-3.5" aria-hidden /> Not enabled
          </span>
        ) : inUse > 0 ? (
          <span className="font-semibold text-indigo-text">In {inUse} of your environments</span>
        ) : item.gitUrl ? (
          <span className="flex items-center gap-1 text-text-muted">
            <GitBranch className="size-3.5" aria-hidden /> Repository
          </span>
        ) : null}
      </div>
    </Link>
  )
}

export default function UserCatalog() {
  const loading = useSimulatedLoading()
  const tenant = useCurrentTenant()!
  const catalog = useTenantCatalog()
  const [params] = useSearchParams()
  const [suggestOpen, setSuggestOpen] = useState(false)
  const myProjects = useScopedProjects(false)
  const environments = useAppStore((s) => s.environments)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | CatalogCategory>('all')
  const [hosting, setHosting] = useState<'all' | CatalogItem['hosting']>('all')
  const [licence, setLicence] = useState('all')
  const [language, setLanguage] = useState<'all' | Language>('all')
  const [showDeprecated, setShowDeprecated] = useState(false)

  const licences = useMemo(() => [...new Set(catalog.map((c) => c.licence))].sort(), [catalog])
  const inUse = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of environments.filter((x) => x.tenantId === tenant.id && x.status !== 'terminated'))
      for (const id of [...e.spec.llms.map((l) => l.id), ...e.spec.asr, ...e.spec.capabilities]) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }, [environments, tenant.id])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.filter(
      (c) =>
        (showDeprecated || c.status !== 'deprecated') &&
        (category === 'all' || c.category === category) &&
        (hosting === 'all' || c.hosting === hosting) &&
        (licence === 'all' || c.licence === licence) &&
        (language === 'all' || c.languages.includes(language)) &&
        (!q || [c.name, c.provider, c.description].some((s) => s.toLowerCase().includes(q))),
    )
  }, [catalog, query, category, hosting, licence, language, showDeprecated])

  const groups = CATEGORIES.filter((c) => category === 'all' || c === category)
    .map((c) => ({ category: c, items: filtered.filter((i) => i.category === c).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length)

  const clear = () => {
    setQuery('')
    setCategory('all')
    setHosting('all')
    setLicence('all')
    setLanguage('all')
  }

  // "My suggestions" moved into My requests.
  if (params.get('tab') === 'suggestions') return <Navigate to={suggestionsPath('user')} replace />

  return (
    <>
      <PageHeader
        eyebrow={tenant.name}
        title="AI Capability Marketplace"
        description="Models, speech providers and open-source tools you can add to your projects and environments. Missing something? Suggest it."
        actions={
          <Button onClick={() => setSuggestOpen(true)}>
            <Plus /> Suggest a capability
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-[1fr_170px_210px_170px]">
        <SearchInput value={query} onChange={setQuery} placeholder="Search models and tools" className="sm:col-span-3 lg:col-span-1" />
        <Select value={hosting} onValueChange={(v) => setHosting(v as typeof hosting)}>
          <SelectTrigger aria-label="Filter by type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="open-source">Open source</SelectItem>
            <SelectItem value="hosted">Hosted API</SelectItem>
          </SelectContent>
        </Select>
        <Select value={licence} onValueChange={setLicence}>
          <SelectTrigger aria-label="Filter by licence">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All licences</SelectItem>
            {licences.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={language} onValueChange={(v) => setLanguage(v as typeof language)}>
          <SelectTrigger aria-label="Filter by language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All languages</SelectItem>
            {LANGUAGES.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 md:pb-0" role="group" aria-label="Filter by category">
          {(['all', ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                'flex h-8 shrink-0 items-center rounded-full border px-3 text-caption font-semibold transition-colors',
                category === c
                  ? 'border-indigo bg-indigo-50 text-indigo-text dark:border-indigo-text'
                  : 'border-border bg-bg-surface text-text-secondary hover:border-border-strong',
              )}
            >
              {c === 'all' ? 'All' : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-caption font-semibold text-text-secondary">
          <Switch checked={showDeprecated} onCheckedChange={setShowDeprecated} aria-label="Show deprecated items" />
          Show deprecated
        </label>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-card" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={SearchX}
            title="Nothing matches these filters"
            description="Try a different language or type, or search for the provider’s name."
            action={
              <Button variant="secondary" onClick={clear}>
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((g) => (
            <section key={g.category}>
              <h2 className="mb-3 flex items-center gap-2 font-heading text-h3 text-text-primary">
                {CATEGORY_LABELS[g.category]} <span className="tabular font-sans text-caption font-normal text-text-muted">{g.items.length}</span>
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {g.items.map((item) => (
                  <CatalogCard key={item.id} item={item} allowed={item.enabled} inUse={inUse.get(item.id) ?? 0} recommendedFor={myProjects.filter((p) => p.recommendation?.modelId === item.id).map((p) => p.name)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <SuggestDialog open={suggestOpen} onOpenChange={setSuggestOpen} />
    </>
  )
}
