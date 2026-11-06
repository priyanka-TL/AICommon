import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-sm font-semibold text-text-primary', className)} {...props} />
))
Label.displayName = 'Label'

export function RequiredTag() {
  return (
    <span className="ml-2 rounded-full bg-bg-subtle px-2 py-0.5 text-xs font-semibold text-text-secondary">
      Required
    </span>
  )
}

interface FieldProps {
  label: string
  htmlFor?: string
  required?: boolean
  helper?: React.ReactNode
  error?: string | null
  className?: string
  children: React.ReactNode
}

export function Field({ label, htmlFor, required, helper, error, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center">
        <Label htmlFor={htmlFor}>{label}</Label>
        {required && <RequiredTag />}
      </div>
      {children}
      {error ? (
        <p className="flex items-center gap-1.5 text-caption text-red-text" role="alert">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : helper ? (
        <p className="text-caption text-text-muted">{helper}</p>
      ) : null}
    </div>
  )
}
