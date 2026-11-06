import * as React from 'react'
import { cn } from '@/lib/utils'

export const fieldBase =
  'w-full rounded-control border border-border-strong bg-bg-surface text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-indigo focus-visible:border-indigo disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-red'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input ref={ref} type={type} className={cn(fieldBase, 'h-10 px-3', className)} {...props} />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, 'min-h-[88px] px-3 py-2 leading-6', className)} {...props} />
  ),
)
Textarea.displayName = 'Textarea'
