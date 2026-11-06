import { Link } from 'react-router-dom'
import { Cpu, HardDrive } from 'lucide-react'
import type { CatalogItem, Environment, EnvRequest, User } from '@/data/types'
import { estimateCost } from '@/lib/cost'
import { formatDate, formatInt, relativeTime } from '@/lib/format'
import { computeLabel, purposeLabel } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { StatusBadge, Tag } from './StatusBadge'
import { Avatar } from './Avatar'

interface Props {
  env: Environment
  catalog: CatalogItem[]
  owner?: User
  request?: EnvRequest
  hasPendingChange?: boolean
}

export function environmentLink(env: Environment) {
  return env.status === 'pending' || env.status === 'rejected' ? '/app/requests' : `/app/environments/${env.id}`
}

export function EnvironmentCard({ env, catalog, owner, request, hasPendingChange }: Props) {
  const name = (id: string) => catalog.find((c) => c.id === id)?.name ?? id
  const models = [...env.spec.llms.map((l) => name(l.id)), ...env.spec.asr.map(name)]
  const shown = models.slice(0, 3)
  const extra = models.length - shown.length
  const est = estimateCost(env.spec, catalog)

  return (
    <Link
      to={environmentLink(env)}
      className="card card-interactive flex flex-col gap-4 p-5"
      aria-label={`${env.spec.name}, ${env.status}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-h3 text-text-primary">{env.spec.name}</h3>
          <p className="mt-0.5 text-caption text-text-secondary">{purposeLabel(env.spec.purpose)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={env.status} />
          {hasPendingChange && <StatusBadge status="change-requested" />}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
        <span className="flex items-center gap-1.5">
          <Cpu className="size-3.5 text-text-muted" aria-hidden /> {computeLabel(env.spec.compute)}
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
          <p className="mt-2 text-caption text-status-provisioning-fg">Setting up compute, models and your API key…</p>
        </div>
      )}
      {env.status === 'rejected' && request?.rejectionReason && (
        <p className="line-clamp-2 rounded-control bg-status-rejected-bg px-3 py-2 text-caption text-status-rejected-fg">{request.rejectionReason}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-caption">
        <span className="flex min-w-0 items-center gap-2 text-text-secondary">
          {owner && <Avatar name={owner.name} size="sm" />}
          <span className="truncate">{owner?.name}</span>
        </span>
        <span className={cn('tabular shrink-0 text-right', env.status === 'running' ? 'font-semibold text-text-primary' : 'text-text-secondary')}>
          {env.status === 'pending' && `Est. ${formatInt(est.credits)} credits / month`}
          {env.status === 'approved' && `Approved · ${relativeTime(env.timeline[env.timeline.length - 1]!.at)}`}
          {env.status === 'provisioning' && 'Ready in about a minute'}
          {(env.status === 'running' || env.status === 'stopped') && `${formatInt(env.creditsUsed)} credits used`}
          {env.status === 'rejected' && `Submitted ${formatDate(env.createdAt)}`}
        </span>
      </div>
    </Link>
  )
}
