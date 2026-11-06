import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  CheckCircle2,
  FlaskConical,
  Library,
  MessageSquare,
  PlugZap,
  Send,
  Server,
  UserRound,
  XCircle,
} from 'lucide-react'
import type { Activity, ActivityKind } from '@/data/types'
import { relativeTime } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const icons: Record<ActivityKind, { icon: LucideIcon; tint: string }> = {
  request: { icon: Send, tint: 'bg-status-pending-bg text-status-pending-fg' },
  approval: { icon: CheckCircle2, tint: 'bg-status-running-bg text-status-running-fg' },
  rejection: { icon: XCircle, tint: 'bg-status-rejected-bg text-status-rejected-fg' },
  environment: { icon: Server, tint: 'bg-status-provisioning-bg text-status-provisioning-fg' },
  tenant: { icon: Building2, tint: 'bg-status-approved-bg text-status-approved-fg' },
  user: { icon: UserRound, tint: 'bg-status-approved-bg text-status-approved-fg' },
  catalog: { icon: Library, tint: 'bg-status-change-bg text-status-change-fg' },
  provider: { icon: PlugZap, tint: 'bg-status-stopped-bg text-status-stopped-fg' },
  test: { icon: FlaskConical, tint: 'bg-status-running-bg text-status-running-fg' },
  comment: { icon: MessageSquare, tint: 'bg-status-change-bg text-status-change-fg' },
}

export function ActivityFeed({ items, loading, className }: { items: Activity[]; loading?: boolean; className?: string }) {
  if (loading) {
    return (
      <ul className={cn('flex flex-col gap-4', className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="flex gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          </li>
        ))}
      </ul>
    )
  }
  if (!items.length) return <p className="py-6 text-center text-sm text-text-secondary">No activity yet.</p>
  return (
    <ul className={cn('flex flex-col gap-4', className)}>
      {items.map((a) => {
        const { icon: Icon, tint } = icons[a.kind]
        return (
          <li key={a.id} className="flex gap-3">
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', tint)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-text-primary">{a.text}</p>
              <p className="text-caption text-text-muted">{relativeTime(a.at)}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
