import { cn } from '@/lib/utils'
import { ORG_NAME, PRODUCT_NAME } from '@/lib/brand'

/**
 * Text wordmark. LOGO SLOT: replace the <span data-logo-slot> with the approved
 * ShikshaLokam logo once it is available.
 */
export function Wordmark({ compact, onDark, className }: { compact?: boolean; onDark?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span
        data-logo-slot
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-dashed',
          onDark ? 'border-white/40 text-white' : 'border-border-strong text-indigo-text',
        )}
        title="Logo slot"
        aria-hidden
      >
        <span className="font-heading text-sm font-bold">AI</span>
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className={cn('font-heading text-[19px] font-bold', onDark ? 'text-white' : 'text-indigo-text')}>
            {PRODUCT_NAME}
          </span>
          <span className={cn('mt-1 text-xs', onDark ? 'text-white/80' : 'text-text-muted')}>by {ORG_NAME}</span>
        </span>
      )}
    </div>
  )
}
