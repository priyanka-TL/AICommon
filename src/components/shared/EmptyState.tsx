import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  tone?: 'default' | 'error'
}

export function EmptyState({ icon: Icon, title, description, action, className, tone = 'default' }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <span
        className={cn(
          'flex size-16 items-center justify-center rounded-full',
          tone === 'error' ? 'bg-status-rejected-bg text-status-rejected-fg' : 'bg-indigo-50 text-indigo-text',
        )}
      >
        <Icon className="size-7" aria-hidden />
      </span>
      <p className="font-heading text-h3 text-text-primary">{title}</p>
      {description && <p className="max-w-md text-sm text-text-secondary">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
