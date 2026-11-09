import { Link } from 'react-router-dom'
import { Cpu, FolderKanban, HardDrive } from 'lucide-react'
import type { CatalogItem, Environment, Project, Role, User } from '@/data/types'
import { formatInt, relativeTime } from '@/lib/format'
import { computeLabel, purposeLabel } from '@/lib/labels'
import { envPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { spendToDate } from '@/lib/cost'
import { needsMigration } from '@/lib/providers'
import { MigrateBadge } from './TenantProviders'
import { useAppStore } from '@/store/useAppStore'
import { useCostContext } from '@/store/selectors'
import { useMemo } from 'react'
import { StatusBadge, Tag } from './StatusBadge'
import { Avatar } from './Avatar'

interface Props {
  env: Environment
  catalog: CatalogItem[]
  role: Role
  owner?: User
  project?: Project
  hasPendingChange?: boolean
}

export function EnvironmentCard({ env, catalog, role, owner, project, hasPendingChange }: Props) {
  const costCtx = useCostContext(env.tenantId)
  const spent = useMemo(() => spendToDate(env, costCtx).total, [env, costCtx])
  const provider = useAppStore((s) => s.infraProviders.find((p) => p.id === env.spec.providerId))
  const migrate = useAppStore((s) => needsMigration(env, s.tenants))
  const name = (id: string) => catalog.find((c) => c.id === id)?.name ?? id
  const models = [...env.spec.llms.map((l) => name(l.id)), ...env.spec.asr.map(name)]
  const shown = models.slice(0, 3)
  const extra = models.length - shown.length
  const last = env.history[env.history.length - 1]

  return (
    <Link to={envPath(role, env.id)} className={cn('card card-interactive flex flex-col gap-4 p-5', env.status === 'terminated' && 'opacity-70')} aria-label={`${env.spec.name}, ${env.status}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-h3 text-text-primary">{env.spec.name}</h3>
          <p className="mt-0.5 text-caption text-text-secondary">{purposeLabel(env.spec.purpose)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={env.status} />
          {migrate && <MigrateBadge />}
          {hasPendingChange && <StatusBadge status="under_review" label="Change pending" />}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
        {project && (
          <span className="flex items-center gap-1.5">
            <FolderKanban className="size-3.5 text-text-muted" aria-hidden /> {project.name}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Cpu className="size-3.5 text-text-muted" aria-hidden /> {computeLabel(env.spec.compute)}
          {env.spec.compute !== 'cpu' && env.spec.gpuCount > 1 ? ` × ${env.spec.gpuCount}` : ''}
          {provider ? ` · ${provider.code}` : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <HardDrive className="size-3.5 text-text-muted" aria-hidden /> {env.spec.storageGb} GB
        </span>
      </div>

      <div className="flex min-h-6 flex-wrap gap-1.5">
        {shown.length ? shown.map((m) => <Tag key={m}>{m}</Tag>) : <span className="text-caption text-text-muted">No models attached</span>}
        {extra > 0 && <Tag>+{extra} more</Tag>}
      </div>

      {env.status === 'provisioning' && (
        <div>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-status-provisioning-bg">
            <div className="absolute inset-y-0 w-2/5 animate-indeterminate rounded-full bg-blue" />
          </div>
          <p className="mt-2 text-caption text-status-provisioning-fg">{env.hold ? 'Waiting for a GPU in the shared pool…' : 'Setting up compute, models and your API key…'}</p>
        </div>
      )}
      {(env.status === 'suspended' || env.status === 'provisioning_failed') && last?.comment && (
        <p className={cn('line-clamp-2 rounded-control px-3 py-2 text-caption', env.status === 'suspended' ? 'bg-status-pending-bg text-status-pending-fg' : 'bg-status-rejected-bg text-status-rejected-fg')}>
          {last.comment}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-caption">
        <span className="flex min-w-0 items-center gap-2 text-text-secondary">
          {owner && <Avatar name={owner.name} size="sm" />}
          <span className="truncate">{owner?.name}</span>
        </span>
        <span className="tabular shrink-0 text-right text-text-secondary">
          {env.status === 'active' || env.status === 'stopped' || env.status === 'suspended'
            ? `${formatInt(spent)} credits used`
            : last
              ? relativeTime(last.at)
              : ''}
        </span>
      </div>
    </Link>
  )
}
