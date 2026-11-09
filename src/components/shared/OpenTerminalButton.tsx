import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, TerminalSquare } from 'lucide-react'
import type { Environment } from '@/data/types'
import { useAppStore, useCurrentUser } from '@/store/useAppStore'
import { terminalAccess, terminalPath } from '@/lib/terminal/access'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'

interface Props {
  env: Environment
  /** Compact: the smaller button used on environment cards. */
  compact?: boolean
}

/** Opens the simulated terminal; disabled with the reason when the person can't open one. */
export function OpenTerminalButton({ env, compact }: Props) {
  const user = useCurrentUser()
  const projects = useAppStore((s) => s.projects)
  const deployments = useAppStore((s) => s.deployments)
  const navigate = useNavigate()
  const access = useMemo(() => (user ? terminalAccess(user, env, projects, deployments) : null), [user, env, projects, deployments])
  if (!access) return null
  const url = terminalPath(env.id)

  // Cards are links: keep clicks on these buttons from opening the card.
  const stop = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  if (!access.allowed) {
    return (
      <Tooltip content={access.reason}>
        <span tabIndex={0} className="inline-flex rounded-control" onClick={stop} aria-label={`Open in terminal is unavailable: ${access.reason}`}>
          <Button variant="secondary" size={compact ? 'sm' : 'default'} disabled tabIndex={-1}>
            <TerminalSquare /> Open in terminal
          </Button>
        </span>
      </Tooltip>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        variant="secondary"
        size={compact ? 'sm' : 'default'}
        onClick={(e) => {
          stop(e)
          navigate(url)
        }}
      >
        <TerminalSquare /> Open in terminal{access.readOnly ? ' (read-only)' : ''}
      </Button>
      <Tooltip content="Open the terminal in a new tab">
        <Button
          variant="ghost"
          size={compact ? 'icon-sm' : 'icon'}
          aria-label="Open the terminal in a new tab"
          onClick={(e) => {
            stop(e)
            // No `noopener`: the new tab inherits this tab's sign-in (kept in sessionStorage).
            window.open(url, '_blank')
          }}
        >
          <ExternalLink />
        </Button>
      </Tooltip>
    </span>
  )
}
