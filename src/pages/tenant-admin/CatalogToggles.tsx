import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { GitBranch, SearchX } from 'lucide-react'
import type { CatalogCategory } from '@/data/types'
import { useAppStore, useCurrentTenant } from '@/store/useAppStore'
import { useTenantCatalog } from '@/store/selectors'
import { CATEGORY_LABELS } from '@/lib/labels'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchInput } from '@/components/shared/SearchInput'
import { CatalogStatusBadge, Tag } from '@/components/shared/StatusBadge'
import { costLabel } from '@/components/shared/SelectableCard'
import { ItemMark } from '@/pages/super-admin/Catalog'
import { Switch } from '@/components/ui/controls'
import { cn } from '@/lib/utils'

const GROUPS: Record<'models' | 'capabilities', CatalogCategory[]> = {
  models: ['llm', 'asr'],
  capabilities: ['agent-framework', 'vector-db', 'evaluation', 'low-code'],
}

export default function CatalogToggles({ mode }: { mode: 'models' | 'capabilities' }) {
  const tenant = useCurrentTenant()!
  const items = useTenantCatalog()
  const environments = useAppStore((s) => s.environments)
  const setItemEnabled = useAppStore((s) => s.setItemEnabled)
  const projects = useAppStore((s) => s.projects)
  const [params] = useSearchParams()
  const focus = params.get('item')
  const [query, setQuery] = useState('')

  const inUse = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of environments.filter((x) => x.tenantId === tenant.id && x.status !== 'terminated'))
      for (const id of [...e.spec.llms.map((l) => l.id), ...e.spec.asr, ...e.spec.capabilities]) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }, [environments, tenant.id])

  const q = query.trim().toLowerCase()
  const groups = GROUPS[mode]
    .map((c) => ({ category: c, rows: items.filter((i) => i.category === c && (!q || [i.name, i.provider, i.licence].some((s) => s.toLowerCase().includes(q)))) }))
    .filter((g) => g.rows.length)
  const enabledCount = items.filter((i) => GROUPS[mode].includes(i.category) && i.enabled).length

  return (
    <>
      <PageHeader
        eyebrow={tenant.name}
        title={mode === 'models' ? 'AI Models' : 'AI Capabilities'}
        description={`Switch on what your teams can use. The Super Admin decides what is available to ${tenant.name}; you decide what is enabled. ${enabledCount} enabled.`}
      />
      <SearchInput value={query} onChange={setQuery} placeholder={mode === 'models' ? 'Search models and speech providers' : 'Search frameworks and tools'} className="mb-6" />
      {groups.length === 0 ? (
        <div className="card">
          <EmptyState icon={SearchX} title="Nothing matches your search" />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((g) => (
            <section key={g.category}>
              <h2 className="mb-3 font-heading text-h3 text-text-primary">{CATEGORY_LABELS[g.category]}</h2>
              <ul className="card divide-y divide-border overflow-hidden">
                {g.rows.map((i) => {
                  const used = inUse.get(i.id) ?? 0
                  const deprecated = i.status === 'deprecated'
                  return (
                    <li key={i.id} className={cn('flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center', focus === i.id && 'bg-indigo-50')}>
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <ItemMark item={i} />
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-semibold text-text-primary">
                            {i.name}
                            {i.status !== 'active' && <CatalogStatusBadge status={i.status} />}
                            {i.origin === 'suggestion' && <Tag>Suggested by your team</Tag>}
                            {i.availability !== 'all' && <Tag>Only for {tenant.name}</Tag>}
                            {projects
                              .filter((p) => p.tenantId === tenant.id && p.recommendation?.modelId === i.id)
                              .map((p) => (
                                <Tag key={p.id} className="border-indigo bg-indigo-50 text-indigo-text">
                                  Recommended for {p.name}
                                </Tag>
                              ))}
                          </p>
                          <p className="text-caption text-text-secondary">
                            {i.provider} · {i.hosting === 'hosted' ? 'Hosted API' : 'Open source'} · {i.licence} · {costLabel(i)}
                          </p>
                          <p className="mt-0.5 text-caption text-text-muted">
                            {used ? `Used by ${used} environment${used > 1 ? 's' : ''}` : 'Not used yet'}
                            {i.gitUrl && (
                              <>
                                {' · '}
                                <a href={i.gitUrl} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                                  <GitBranch className="size-3" aria-hidden /> Repository
                                </a>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <label className="flex shrink-0 cursor-pointer items-center gap-2.5 text-sm font-semibold text-text-primary">
                        <Switch
                          checked={i.enabled}
                          disabled={deprecated && !i.enabled}
                          onCheckedChange={(v) => {
                            setItemEnabled(tenant.id, i.id, v)
                            toast.success(`${i.name} ${v ? 'enabled' : 'disabled'} for ${tenant.name}.`, { description: v ? undefined : used ? 'Existing environments keep it; it can’t be added to new ones.' : undefined })
                          }}
                          aria-label={`${i.name} enabled`}
                        />
                        {i.enabled ? 'Enabled' : deprecated ? 'Deprecated' : 'Off'}
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
