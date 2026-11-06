import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function CopyButton({ value, label = 'Copy', what }: { value: string; label?: string; what: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(`${what} copied.`)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error(`Couldn’t copy the ${what.toLowerCase()}. Select it and copy it by hand.`)
    }
  }
  return (
    <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={`${label} ${what.toLowerCase()}`}>
      {copied ? <Check className="text-teal" /> : <Copy />}
    </Button>
  )
}
