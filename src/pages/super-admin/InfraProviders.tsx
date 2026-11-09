import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cloud, Plus, SearchX } from 'lucide-react'
import type { InfraProvider, InfraProviderType } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { useMonthToDate } from '@/hooks/useSpend'
import { formatInt } from '@/lib/format'
import { indiaResidency, PROVIDER_TYPE_LABELS } from '@/lib/providers'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchInput } from '@/components/shared/SearchInput'
import { ActiveBadge, Tag } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ProviderMark } from './ProviderEditors'
import { ProviderFormDialog } from './ProviderFormDialog'

export default function InfraProviders() {
  const loading = useSimulatedLoading()
  const providers = useAppStore((s) => s.infraProviders)
  const environments = useAppStore((s) => s.environments)
  const mtd = useMonthToDate()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'all' | InfraProviderType>('all')
  const [status, setStatus] = useState<'all' | InfraProvider['status']>('all')
  const [adding, setAdding] = useState(false)

  const stats = useMemo(() => {
    const m = new Map<string, { active: number; spend: number }>()
    for (const p of providers) m.set(p.id, { active: environments.filter((e) => e.spec.providerId === p.id && e.status === 'active').length, spend: 0 })
    for (const r of mtd) {
      const s = m.get(r.env.spec.providerId)
      if (s) s.spend += r.lines.total
    }
    return m
  }, [providers, environments, mtd])

  const rows = providers
    .filter((p) => type === 'all' || p.type === type)
    .filter((p) => status === 'all' || p.status === status)
    .filter((p) => {
      const q = query.trim().toLowerCase()
      return !q || [p.name, p.code, ...p.regions.map((r) => r.name)].some((s) => s.toLowerCase().includes(q))
    })

  const columns: Column<InfraProvider>[] = [
    {
      key: 'name',
      header: 'Provider',
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <ProviderMark provider={p} />
          <div className="min-w-0">
            <span className="block truncate font-semibold text-text-primary">{p.name}</span>
            <span className="font-mono text-xs text-text-muted">{p.code}</span>
          </div>
        </div>
      ),
    },
    { key: 'type', header: 'Type', cell: (p) => <Tag>{PROVIDER_TYPE_LABELS[p.type]}</Tag>, className: 'hidden md:table-cell' },
    { key: 'regions', header: 'Regions', cell: (p) => <span className="text-text-secondary" title={p.regions.map((r) => r.name).join(', ')}>{p.regions.length}</span>, className: 'hidden lg:table-cell' },
    { key: 'india', header: 'India residency', cell: (p) => <span className="text-text-secondary">{indiaResidency(p)}</span>, className: 'hidden lg:table-cell' },
    { key: 'envs', header: 'Active environments', align: 'right', cell: (p) => formatInt(stats.get(p.id)?.active ?? 0), className: 'hidden md:table-cell' },
    { key: 'spend', header: 'Month to date', align: 'right', cell: (p) => `${formatInt(stats.get(p.id)?.spend ?? 0)} cr` },
    { key: 'status', header: 'Status', cell: (p) => <ActiveBadge active={p.status === 'active'} inactiveLabel="Disabled" /> },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Infrastructure Providers"
        description="Clouds and GPU pools environments run on. Each has regions, instance types and a rate card that every cost in the app is calculated from."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add provider
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_190px_160px]">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by name, code or region" className="col-span-2 sm:col-span-1" />
        <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
          <SelectTrigger aria-label="Filter by type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {(Object.keys(PROVIDER_TYPE_LABELS) as InfraProviderType[]).map((k) => (
              <SelectItem key={k} value={k}>
                {PROVIDER_TYPE_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        loading={loading}
        rows={rows}
        columns={columns}
        rowKey={(p) => p.id}
        rowLabel={(p) => `Open provider ${p.name}`}
        onRowClick={(p) => navigate(`/super-admin/infra-providers/${p.id}`)}
        empty={
          query || type !== 'all' || status !== 'all' ? (
            <EmptyState icon={SearchX} title="No providers match these filters" action={<Button variant="secondary" onClick={() => { setQuery(''); setType('all'); setStatus('all') }}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={Cloud} title="No providers yet" action={<Button variant="secondary" onClick={() => setAdding(true)}>Add provider</Button>} />
          )
        }
        mobileCard={(p) => (
          <div className="flex items-center gap-3">
            <ProviderMark provider={p} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-text-primary">{p.name}</p>
              <p className="text-caption text-text-secondary">
                {PROVIDER_TYPE_LABELS[p.type]} · {p.regions.length} regions · {formatInt(stats.get(p.id)?.spend ?? 0)} cr this month
              </p>
            </div>
            <ActiveBadge active={p.status === 'active'} inactiveLabel="Disabled" />
          </div>
        )}
      />

      <ProviderFormDialog open={adding} onOpenChange={setAdding} onSaved={(id) => navigate(`/super-admin/infra-providers/${id}`)} />
    </>
  )
}
