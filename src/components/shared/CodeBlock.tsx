import { cn } from '@/lib/utils'
import { CopyButton } from './CopyButton'

export function CodeBlock({ code, label, className }: { code: string; label: string; className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-control border border-border bg-bg-subtle', className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-caption font-semibold text-text-secondary">{label}</span>
        <CopyButton value={code} what="Code" />
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-5 text-text-primary">
        <code>{code}</code>
      </pre>
    </div>
  )
}
