import { cn, initials } from '@/lib/utils'
import { hashString } from '@/data/seed'

const tints = [
  'bg-status-approved-bg text-status-approved-fg',
  'bg-status-running-bg text-status-running-fg',
  'bg-status-provisioning-bg text-status-provisioning-fg',
  'bg-status-pending-bg text-status-pending-fg',
  'bg-status-change-bg text-status-change-fg',
]

export function tintFor(key: string) {
  return tints[hashString(key) % tints.length]
}

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'sm' && 'size-6 text-[10px]',
        size === 'md' && 'size-8 text-xs',
        size === 'lg' && 'size-11 text-sm',
        tintFor(name),
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}
