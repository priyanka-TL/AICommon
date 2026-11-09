import { ChevronDown, GitPullRequestArrow, Server, X } from 'lucide-react'
import type { Project, Role } from '@/data/types'
import { statusOptions, TYPE_LABELS, type RequestFilters as Filters, type RequestItem, type SortKey, type TypeFilter } from '@/lib/requestItems'
import { cn } from '@/lib/utils'
import { SearchInput } from '@/components/shared/SearchInput'
import { StatusBadge, SuggestionBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { fieldBase, Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const TYPE_ICON = { environment: Server, capability: GitPullRequestArrow } as const

export function TypeLabel({ type, className }: { type: RequestItem['type']; className?: string }) {
  const Icon = TYPE_ICON[type]
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-text-secondary', className)}>
      <Icon className="size-4 shrink-0 text-indigo-text" aria-hidden />
      {TYPE_LABELS[type]}
    </span>
  )
}

export function ItemStatusBadge({ item }: { item: RequestItem }) {
  return item.type === 'capability' ? <SuggestionBadge status={item.source.status} forwarded={item.source.forwarded} /> : <StatusBadge status={item.source.status} />
}

function DateField({ label, aria, value, min, max, onChange }: { label: string; aria: string; value: string; min?: string; max?: string; onChange: (v: string) => void }) {
  return (
    <label className="relative block min-w-0">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-caption font-semibold text-text-muted" aria-hidden>
        {label}
      </span>
      <Input type="date" aria-label={aria} title={`${aria} date`} value={value} min={min || undefined} max={max || undefined} onChange={(e) => onChange(e.target.value)} className="min-w-0 pl-11" />
    </label>
  )
}

const SORT_LABELS: Record<SortKey, string> = { updated: 'Last updated', submitted: 'Submitted date', status: 'Status' }

interface Props {
  role: Role
  filters: Filters
  update: (patch: Partial<Filters>, opts?: { replace?: boolean }) => void
  clear: () => void
  active: boolean
  counts: Record<TypeFilter, number>
  projects: Project[]
}

export function RequestFilters({ role, filters, update, clear, active, counts, projects }: Props) {
  const options = statusOptions(filters.type, role)
  const statusLabel =
    filters.statuses.length === 0 ? 'All statuses' : filters.statuses.length === 1 ? options.find((o) => o.value === filters.statuses[0])?.label : `${filters.statuses.length} statuses`

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="radiogroup" aria-label="Request type" className="inline-flex w-full rounded-control border border-border-strong bg-bg-surface p-1 sm:w-auto">
          {(['all', 'environment', 'capability'] as TypeFilter[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={filters.type === t}
              onClick={() => update({ type: t })}
              className={cn(
                'flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-semibold transition-colors sm:flex-none',
                filters.type === t ? 'bg-indigo-50 text-indigo-text' : 'text-text-secondary hover:bg-bg-subtle',
              )}
            >
              {t === 'all' ? 'All' : TYPE_LABELS[t]} <span className="tabular font-normal text-text-muted">({counts[t]})</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-caption text-text-secondary">Sort by</span>
          <Select value={filters.sort} onValueChange={(v) => update({ sort: v as SortKey })}>
            <SelectTrigger aria-label="Sort by" className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {SORT_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={cn('grid grid-cols-2 gap-3', filters.type === 'capability' ? 'lg:grid-cols-[1fr_200px_170px_170px]' : 'lg:grid-cols-[1fr_200px_200px_170px_170px]')}>
        <SearchInput value={filters.q} onChange={(q) => update({ q }, { replace: true })} placeholder="Search by name, ID or repository" className="col-span-2 lg:col-span-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Filter by status"
              className={cn(fieldBase, 'flex h-10 w-full min-w-0 items-center justify-between gap-2 px-3 text-left', filters.type === 'capability' && 'col-span-2 lg:col-span-1')}
            >
              <span className="truncate">{statusLabel}</span>
              <ChevronDown className="size-4 shrink-0 text-text-muted" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
            {options.map((o) => (
              <DropdownMenuCheckboxItem
                key={o.value}
                checked={filters.statuses.includes(o.value)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(on) => update({ statuses: on ? [...filters.statuses, o.value] : filters.statuses.filter((x) => x !== o.value) })}
              >
                {o.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {filters.type !== 'capability' && (
          <Select value={filters.project || 'all'} onValueChange={(v) => update({ project: v === 'all' ? '' : v })}>
            <SelectTrigger aria-label="Filter by project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DateField label="From" aria="Submitted from" value={filters.from} max={filters.to} onChange={(from) => update({ from })} />
        <DateField label="To" aria="Submitted to" value={filters.to} min={filters.from} onChange={(to) => update({ to })} />
      </div>

      {active && (
        <div className="flex flex-wrap items-center gap-2 text-caption text-text-secondary">
          {filters.project && <span>Project filter shows environment requests only.</span>}
          <Button variant="ghost" size="compact" onClick={clear}>
            <X /> Clear filters
          </Button>
        </div>
      )}
    </div>
  )
}
