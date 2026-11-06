import type { TimelineEntry } from '@/data/types'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'

const dot: Record<TimelineEntry['status'], string> = {
  pending: 'bg-tangerine',
  approved: 'bg-indigo dark:bg-indigo-text',
  provisioning: 'bg-blue',
  running: 'bg-teal',
  stopped: 'bg-stopped-dot',
  rejected: 'bg-red',
}

export function StatusTimeline({ entries, className }: { entries: TimelineEntry[]; className?: string }) {
  const ordered = [...entries].reverse()
  return (
    <ol className={cn('flex flex-col', className)}>
      {ordered.map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative flex gap-3 pb-5 last:pb-0">
          {i < ordered.length - 1 && <span className="absolute left-[5px] top-4 h-[calc(100%-12px)] w-0.5 bg-border" aria-hidden />}
          <span className={cn('relative mt-1.5 size-3 shrink-0 rounded-full ring-4 ring-bg-surface', dot[e.status])} aria-hidden />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={e.status} />
              <span className="text-caption text-text-muted">{formatDateTime(e.at)}</span>
            </div>
            {e.note && <p className="mt-1 text-sm text-text-secondary">{e.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
