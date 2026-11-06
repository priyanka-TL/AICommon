import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Archive, ArchiveRestore, ExternalLink, Library, Pencil, Plus, SearchX } from 'lucide-react'
import type { CatalogCategory, CatalogItem, CatalogStatus } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { CATEGORY_LABELS, CATEGORY_SINGULAR } from '@/lib/labels'
import { cn, initials } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { RowActions } from '@/components/shared/RowActions'
import { SearchInput } from '@/components/shared/SearchInput'
import { CatalogStatusBadge, Tag } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { costLabel } from '@/components/shared/SelectableCard'
import { tintFor } from '@/components/shared/Avatar'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CatalogFormSheet } from './CatalogFormSheet'

export function ItemMark({ item, className }: { item: CatalogItem; className?: string }) {
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold', tintFor(item.provider), className)} aria-hidden>
      {initials(item.name.replace(/[^A-Za-z ]/g, ' ')) || item.name.slice(0, 2)}
    </span>
  )
}

export default function AdminCatalog() {
  const loading = useSimulatedLoading()
  const catalog = useAppStore((s) => s.catalog)
  const environments = useAppStore((s) => s.environments)
  const setCatalogStatus = useAppStore((s) => s.setCatalogStatus)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | CatalogCategory>('all')
  const [hosting, setHosting] = useState<'all' | CatalogItem['hosting']>('all')
  const [status, setStatus] = useState<'all' | CatalogStatus>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deprecateTarget, setDeprecateTarget] = useState<CatalogItem | null>(null)

  const usage = useMemo(() => {
    const live = environments.filter((e) => e.status !== 'rejected')
    const m = new Map<string, number>()
    for (const e of live) {
      for (const id of [...e.spec.llms.map((l) => l.id), ...e.spec.asr, ...e.spec.capabilities]) m.set(id, (m.get(id) ?? 0) + 1)
    }
    return m
  }, [environments])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const order = Object.keys(CATEGORY_LABELS)
    return catalog
      .filter(
        (c) =>
          (category === 'all' || c.category === category) &&
          (hosting === 'all' || c.hosting === hosting) &&
          (status === 'all' || c.status === status) &&
          (!q || [c.name, c.provider, c.licence].some((s) => s.toLowerCase().includes(q))),
      )
      .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.name.localeCompare(b.name))
  }, [catalog, query, category, hosting, status])

  const editing = catalog.find((c) => c.id === editingId)
  const openEdit = (c: CatalogItem) => {
    setEditingId(c.id)
    setFormOpen(true)
  }
  const restore = (c: CatalogItem) => {
    setCatalogStatus(c.id, 'active')
    toast.success(`${c.name} is active again.`)
  }
  const filtersActive = query || category !== 'all' || hosting !== 'all' || status !== 'all'

  const columns: Column<CatalogItem>[] = [
    {
      key: 'name',
      header: 'Capability',
      cell: (c) => (
        <div className="flex items-center gap-3">
          <ItemMark item={c} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-text-primary">{c.name}</p>
            <p className="truncate text-caption text-text-muted">{c.provider}</p>
          </div>
        </div>
      ),
    },
    { key: 'cat', header: 'Category', cell: (c) => <span className="text-text-secondary">{CATEGORY_SINGULAR[c.category]}</span>, className: 'hidden lg:table-cell' },
    { key: 'type', header: 'Type', cell: (c) => <Tag>{c.hosting === 'hosted' ? 'Hosted API' : 'Open source'}</Tag> },
    { key: 'version', header: 'Version', cell: (c) => <code className="font-mono text-caption text-text-secondary">{c.version}</code>, className: 'hidden xl:table-cell' },
    { key: 'licence', header: 'Licence', cell: (c) => <span className="text-text-secondary">{c.licence}</span>, className: 'hidden xl:table-cell' },
    { key: 'cost', header: 'Cost (credits)', align: 'right', cell: (c) => <span className="text-text-secondary">{costLabel(c).replace(' credits', '')}</span>, className: 'hidden lg:table-cell' },
    { key: 'use', header: 'In use', align: 'right', cell: (c) => usage.get(c.id) ?? 0 },
    { key: 'status', header: 'Status', cell: (c) => <CatalogStatusBadge status={c.status} /> },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      cell: (c) => (
        <RowActions
          label={c.name}
          actions={[
            { label: 'Edit', icon: Pencil, onSelect: () => openEdit(c) },
            !!c.gitUrl && { label: 'Open repository', icon: ExternalLink, onSelect: () => void window.open(c.gitUrl!, '_blank', 'noopener') },
            c.status === 'deprecated'
              ? { label: 'Restore', icon: ArchiveRestore, onSelect: () => restore(c), separatorBefore: true }
              : { label: 'Deprecate', icon: Archive, onSelect: () => setDeprecateTarget(c), destructive: true, separatorBefore: true },
          ]}
        />
      ),
    },
  ]

  const inUse = deprecateTarget ? (usage.get(deprecateTarget.id) ?? 0) : 0

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Capability catalog"
        description="Models, speech providers and open-source tools that organisations can add to their environments."
        actions={
          <Button
            onClick={() => {
              setEditingId(null)
              setFormOpen(true)
            }}
          >
            <Plus /> Add capability
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-[1fr_210px_170px_170px]">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by name, provider or licence" className="sm:col-span-3 lg:col-span-1" />
        <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
          <SelectTrigger aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(Object.keys(CATEGORY_LABELS) as CatalogCategory[]).map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="beta">Beta</SelectItem>
            <SelectItem value="deprecated">Deprecated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        loading={loading}
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        rowLabel={(c) => `Edit ${c.name}`}
        onRowClick={openEdit}
        empty={
          filtersActive ? (
            <EmptyState
              icon={SearchX}
              title="Nothing in the catalog matches these filters"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('')
                    setCategory('all')
                    setHosting('all')
                    setStatus('all')
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState icon={Library} title="The catalog is empty" action={<Button onClick={() => setFormOpen(true)}>Add capability</Button>} />
          )
        }
        mobileCard={(c) => (
          <div className="flex items-start gap-3">
            <ItemMark item={c} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-text-primary">{c.name}</p>
              <p className="text-caption text-text-muted">
                {CATEGORY_SINGULAR[c.category]} · {c.hosting === 'hosted' ? 'Hosted API' : 'Open source'} · {usage.get(c.id) ?? 0} in use
              </p>
            </div>
            <CatalogStatusBadge status={c.status} />
          </div>
        )}
      />

      <CatalogFormSheet open={formOpen} onOpenChange={setFormOpen} item={editing} />

      <ConfirmDialog
        open={!!deprecateTarget}
        onOpenChange={(o) => !o && setDeprecateTarget(null)}
        title={`Deprecate ${deprecateTarget?.name}?`}
        description={
          inUse
            ? `${inUse} environment${inUse > 1 ? 's use' : ' uses'} it. ${inUse > 1 ? 'They keep' : 'It keeps'} working, but no one can add it to a new request. You can restore it later.`
            : 'No environment uses it. It will be hidden from new requests. You can restore it later.'
        }
        confirmLabel="Deprecate"
        destructive
        onConfirm={() => {
          if (!deprecateTarget) return
          setCatalogStatus(deprecateTarget.id, 'deprecated')
          toast.success(`${deprecateTarget.name} is deprecated.`)
        }}
      />
    </>
  )
}
