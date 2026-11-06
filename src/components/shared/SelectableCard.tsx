import { Check, GitBranch, Lock } from 'lucide-react'
import type { CatalogItem } from '@/data/types'
import { cn, initials } from '@/lib/utils'
import { tintFor } from './Avatar'
import { Tag } from './StatusBadge'
import { Tooltip } from '@/components/ui/tooltip'

interface SelectableCardProps {
  item: CatalogItem
  selected: boolean
  onToggle: () => void
  disabled?: boolean
  disabledReason?: string
  footer?: React.ReactNode
}

export function costLabel(item: CatalogItem) {
  if (item.costUnit === 'free' || item.costPerUnit === 0) return 'No charge'
  return `${item.costPerUnit} credits ${item.costUnit}`
}

export function SelectableCard({ item, selected, onToggle, disabled, disabledReason, footer }: SelectableCardProps) {
  const toggle = () => {
    if (!disabled) onToggle()
  }
  return (
    <div
      role="checkbox"
      aria-checked={selected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          toggle()
        }
      }}
      className={cn(
        'card relative flex cursor-pointer flex-col gap-3 p-4 text-left transition-[box-shadow,border-color]',
        selected ? 'border-2 border-indigo p-[15px] dark:border-indigo-text' : 'hover:border-border-strong hover:shadow-card-hover',
        disabled && 'cursor-not-allowed opacity-55 hover:border-border hover:shadow-card',
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-indigo text-white">
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
        </span>
      )}
      <div className="flex items-start gap-3 pr-6">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold', tintFor(item.provider))} aria-hidden>
          {initials(item.name.replace(/[^A-Za-z ]/g, ' ')) || item.name.slice(0, 2)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-text-primary">{item.name}</p>
          <p className="truncate text-caption text-text-muted">
            {item.provider} · v{item.version}
          </p>
        </div>
      </div>
      <p className="line-clamp-2 text-caption text-text-secondary">{item.description}</p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <Tag>{item.hosting === 'hosted' ? 'Hosted API' : 'Open source'}</Tag>
        <Tag>{item.licence}</Tag>
        {item.languages.length > 0 && <Tag>{item.languages.length === 7 ? 'All 7 languages' : item.languages.join(', ')}</Tag>}
        {item.status === 'beta' && <Tag className="border-status-provisioning-bg bg-status-provisioning-bg text-status-provisioning-fg">Beta</Tag>}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-caption">
        <span className="tabular text-text-secondary">{costLabel(item)}</span>
        {disabled && disabledReason ? (
          <span className="flex items-center gap-1 text-text-muted">
            <Lock className="size-3.5" aria-hidden /> {disabledReason}
          </span>
        ) : item.gitUrl ? (
          <Tooltip content="Open the Git repository">
            <a
              href={item.gitUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-indigo-text hover:bg-bg-subtle"
              aria-label={`${item.name} Git repository`}
            >
              <GitBranch className="size-3.5" aria-hidden /> Repository
            </a>
          </Tooltip>
        ) : null}
      </div>
      {footer}
    </div>
  )
}
