import { useMemo, useState } from 'react'
import { Download, ScrollText, SearchX } from 'lucide-react'
import type { AuditEntity, AuditEntry } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useScope, useScopedAudit } from '@/store/selectors'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { formatDateTime } from '@/lib/format'
import { roleLabel } from '@/lib/labels'
import { downloadText } from '@/lib/metrics'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchInput } from '@/components/shared/SearchInput'
import { AUDIT_ICONS } from '@/components/shared/ActivityFeed'
import { Tag } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const ENTITY_LABELS: Record<AuditEntity, string> = {
  request: 'Requests',
  environment: 'Environments',
  tenant: 'Tenants',
  user: 'Users',
  project: 'Projects',
  catalog: 'Models & capabilities',
  provider: 'Providers',
  suggestion: 'Suggestions',
  quota: 'Quotas',
  test: 'Tests',
  settings: 'Settings',
  capacity: 'Capacity',
  qa: 'QA testing',
  infra_provider: 'Infrastructure providers',
  deployment: 'Deployments',
}

export default function AuditLog() {
  const loading = useSimulatedLoading()
  const scope = useScope()!
  const entries = useScopedAudit()
  const users = useAppStore((s) => s.users)
  const tenants = useAppStore((s) => s.tenants)
  const [query, setQuery] = useState('')
  const [entity, setEntity] = useState<'all' | AuditEntity>('all')
  const [actor, setActor] = useState('all')
  const isSuper = scope.role === 'super_admin'
  const name = (id: string) => (id === 'system' ? 'System' : (users.find((u) => u.id === id)?.name ?? 'Someone'))

  const actors = useMemo(() => [...new Set(entries.map((e) => e.actorId))], [entries])
  const rows = entries.filter(
    (e) =>
      (entity === 'all' || e.entityType === entity) &&
      (actor === 'all' || e.actorId === actor) &&
      (!query.trim() || [e.summary, e.comment ?? '', e.action].some((s) => s.toLowerCase().includes(query.trim().toLowerCase()))),
  )

  const columns: Column<AuditEntry>[] = [
    { key: 'at', header: 'When', cell: (e) => <span className="tabular whitespace-nowrap text-text-secondary">{formatDateTime(e.at)}</span> },
    {
      key: 'what',
      header: 'What happened',
      cell: (e) => {
        const { icon: Icon, tint } = AUDIT_ICONS[e.entityType]
        return (
          <div className="flex items-start gap-3">
            <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full', tint)}>
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-text-primary">{e.summary}</p>
              {e.comment && <p className="mt-0.5 text-caption italic text-text-secondary">“{e.comment}”</p>}
            </div>
          </div>
        )
      },
    },
    {
      key: 'who',
      header: 'By',
      cell: (e) => (
        <span className="whitespace-nowrap text-text-secondary">
          {name(e.actorId)}
          {e.actorRole !== 'system' && <span className="text-text-muted"> · {roleLabel(e.actorRole)}</span>}
        </span>
      ),
      className: 'hidden lg:table-cell',
    },
    ...(isSuper ? [{ key: 'tenant', header: 'Tenant', cell: (e: AuditEntry) => <span className="text-text-secondary">{e.tenantId ? tenants.find((t) => t.id === e.tenantId)?.name : 'Platform'}</span>, className: 'hidden xl:table-cell' }] : []),
    { key: 'action', header: 'Action', cell: (e) => <code className="font-mono text-caption text-text-secondary">{e.action}</code>, className: 'hidden xl:table-cell' },
  ]

  const exportCsv = () => {
    const head = 'timestamp,actor,role,tenant,action,summary,comment'
    const body = rows.map((e) =>
      [e.at, name(e.actorId), e.actorRole, e.tenantId ? (tenants.find((t) => t.id === e.tenantId)?.name ?? '') : 'Platform', e.action, e.summary, e.comment ?? ''].map((v) => JSON.stringify(v)).join(','),
    )
    downloadText('audit-log.csv', [head, ...body].join('\n'))
  }

  return (
    <>
      <PageHeader
        eyebrow={isSuper ? 'Oversight' : tenants.find((t) => t.id === scope.user.tenantId)?.name}
        title="Audit log"
        description={isSuper ? 'Every action across the platform. Use the tenant filter in the top bar to narrow it down.' : 'Every action taken in your tenant: requests, approvals, environment changes, people and settings.'}
        actions={
          <Button variant="secondary" onClick={exportCsv}>
            <Download /> Export CSV
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_220px_220px]">
        <SearchInput value={query} onChange={setQuery} placeholder="Search the log" />
        <Select value={entity} onValueChange={(v) => setEntity(v as typeof entity)}>
          <SelectTrigger aria-label="Filter by area">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            {(Object.keys(ENTITY_LABELS) as AuditEntity[]).map((k) => (
              <SelectItem key={k} value={k}>
                {ENTITY_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actor} onValueChange={setActor}>
          <SelectTrigger aria-label="Filter by person">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            {actors.map((a) => (
              <SelectItem key={a} value={a}>
                {name(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="mb-3 text-caption text-text-muted">
        <Tag>{rows.length} entries</Tag>
      </p>
      <DataTable
        loading={loading}
        rows={rows}
        columns={columns}
        rowKey={(e) => e.id}
        empty={query || entity !== 'all' || actor !== 'all' ? <EmptyState icon={SearchX} title="No entries match these filters" /> : <EmptyState icon={ScrollText} title="Nothing has been logged yet" />}
        mobileCard={(e) => (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-text-primary">{e.summary}</p>
            <p className="text-caption text-text-muted">
              {formatDateTime(e.at)} · {name(e.actorId)}
            </p>
          </div>
        )}
      />
    </>
  )
}
