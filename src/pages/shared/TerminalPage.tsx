import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ArrowLeft, RotateCcw, TerminalSquare, X } from 'lucide-react'
import { useAppStore, useCurrentUser } from '@/store/useAppStore'
import { envPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { terminalAccess } from '@/lib/terminal/access'
import { A, complete, createSession, promptFor, runCommand, type ShellSession } from '@/lib/terminal/commands'
import { hostnameFor, usernameFor, type ShellContext } from '@/lib/terminal/fs'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/EmptyState'

type Conn = 'connecting' | 'connected' | 'closed'

const cssRgb = (name: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().replace(/\s+/g, ', ')})`

function terminalTheme() {
  const c = (n: string) => cssRgb(`term-${n}`)
  return {
    background: c('bg'),
    foreground: c('fg'),
    cursor: c('cursor'),
    cursorAccent: c('bg'),
    selectionBackground: c('selection'),
    black: c('black'),
    red: c('red'),
    green: c('green'),
    yellow: c('yellow'),
    blue: c('blue'),
    magenta: c('magenta'),
    cyan: c('cyan'),
    white: c('white'),
    brightBlack: c('muted'),
    brightRed: c('red'),
    brightGreen: c('green'),
    brightYellow: c('yellow'),
    brightBlue: c('blue'),
    brightMagenta: c('magenta'),
    brightCyan: c('cyan'),
    brightWhite: c('fg'),
  }
}

const crlf = (s: string) => s.replace(/\r?\n/g, '\r\n')

function motd(s: ShellSession) {
  const { env, provider, region, deployments } = s.ctx
  const inst = env.spec.instance
  const gpu = inst.gpuType !== 'none' && env.spec.gpuCount > 0 ? ` · ${env.spec.gpuCount} × NVIDIA ${inst.gpuType}` : ' · CPU only'
  const lines = [
    'Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-119-generic x86_64)',
    '',
    `  ${A.bold}Environment${A.reset}  ${env.spec.name} (${env.id})`,
    `  ${A.bold}Provider${A.reset}     ${provider?.name ?? 'Unknown provider'}${region ? ` · ${region.name}` : ''}`,
    `  ${A.bold}Machine${A.reset}      ${inst.name} · ${inst.vcpu * Math.max(1, env.spec.instanceCount)} vCPU · ${inst.ramGb * Math.max(1, env.spec.instanceCount)} GB RAM${gpu}`,
    `  ${A.bold}Projects${A.reset}     ${deployments.length ? `${deployments.map((d) => d.serviceName).join(', ')}  ${A.dim}(under /srv)${A.reset}` : 'none deployed yet'}`,
    '',
    `  ${A.dim}This is a simulated terminal. Output is built from this environment’s data;${A.reset}`,
    `  ${A.dim}nothing runs on a real machine. Type ${A.reset}${A.bold}help${A.reset}${A.dim} to see what’s supported.${A.reset}`,
  ]
  if (s.readOnly) lines.push('', `  ${A.yellow}Read-only session: QA Engineers can run read commands only.${A.reset}`)
  lines.push('', `Last login: ${new Date(Date.now() - 86_400_000).toUTCString().replace('GMT', 'UTC')} from 10.0.4.12`)
  return lines.join('\n')
}

export default function TerminalPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const user = useCurrentUser()!
  const env = useAppStore((s) => s.environments.find((e) => e.id === id))
  const projects = useAppStore((s) => s.projects)
  const allDeployments = useAppStore((s) => s.deployments)
  const provider = useAppStore((s) => s.infraProviders.find((p) => p.id === env?.spec.providerId))
  const openSession = useAppStore((s) => s.openTerminalSession)
  const closeSession = useAppStore((s) => s.closeTerminalSession)
  const region = provider?.regions.find((r) => r.id === env?.spec.regionId)
  const access = useMemo(() => (env ? terminalAccess(user, env, projects, allDeployments) : null), [user, env, projects, allDeployments])
  const allowed = !!access?.allowed
  const readOnly = access?.allowed ? access.readOnly : false

  const hostRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<() => void>(() => {})
  const [conn, setConn] = useState<Conn>('connecting')
  const [attempt, setAttempt] = useState(0)
  const back = envPath(user.role, id)

  useEffect(() => {
    if (!allowed || !hostRef.current) return
    const state = useAppStore.getState()
    const liveEnv = state.environments.find((e) => e.id === id)!
    const ctx: ShellContext = {
      user,
      env: liveEnv,
      provider: state.infraProviders.find((p) => p.id === liveEnv.spec.providerId),
      region: state.infraProviders.find((p) => p.id === liveEnv.spec.providerId)?.regions.find((r) => r.id === liveEnv.spec.regionId),
      deployments: state.deployments.filter((d) => d.envId === id),
      projects: state.projects,
      catalog: state.catalog,
    }
    const session = createSession(ctx, readOnly)
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13.5,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      theme: terminalTheme(),
      allowProposedApi: false,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    fit.fit()
    term.focus()
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* container hidden */
      }
    })
    ro.observe(hostRef.current)

    let buffer = ''
    let cursor = 0
    let histIdx = -1
    let draft = ''
    let live = false
    let startedAt = 0

    const prompt = () => promptFor(session)
    const redraw = () => {
      term.write(`\r\x1b[2K${prompt()}${buffer}`)
      const back = buffer.length - cursor
      if (back > 0) term.write(`\x1b[${back}D`)
    }
    const newPrompt = () => {
      buffer = ''
      cursor = 0
      histIdx = -1
      term.write(prompt())
    }
    const close = () => {
      if (!live) return
      live = false
      closeSession(id, startedAt)
      setConn('closed')
      term.options.cursorBlink = false
      term.write(`\r\n${A.dim}Connection to ${hostnameFor(liveEnv)} closed.${A.reset}\r\n`)
    }
    closeRef.current = close

    const submit = () => {
      term.write('\r\n')
      const res = runCommand(session, buffer)
      if (res.clear) term.write('\x1b[2J\x1b[3J\x1b[H')
      if (res.output) term.write(`${crlf(res.output)}\r\n`)
      if (res.exit) return close()
      newPrompt()
    }

    const onData = term.onData((data) => {
      if (!live) return
      // Escape sequences arrive whole; printable input (including paste) may hold many characters.
      switch (data) {
        case '\r':
          return submit()
        case '\x7f':
        case '\b':
          if (cursor > 0) {
            buffer = buffer.slice(0, cursor - 1) + buffer.slice(cursor)
            cursor--
            redraw()
          }
          return
        case '\x1b[3~':
          if (cursor < buffer.length) {
            buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1)
            redraw()
          }
          return
        case '\x1b[A': {
          const h = session.history
          if (!h.length) return
          if (histIdx === -1) {
            draft = buffer
            histIdx = h.length - 1
          } else if (histIdx > 0) histIdx--
          buffer = h[histIdx]!
          cursor = buffer.length
          return redraw()
        }
        case '\x1b[B': {
          const h = session.history
          if (histIdx === -1) return
          if (histIdx < h.length - 1) {
            histIdx++
            buffer = h[histIdx]!
          } else {
            histIdx = -1
            buffer = draft
          }
          cursor = buffer.length
          return redraw()
        }
        case '\x1b[C':
          if (cursor < buffer.length) {
            cursor++
            term.write(data)
          }
          return
        case '\x1b[D':
          if (cursor > 0) {
            cursor--
            term.write(data)
          }
          return
        case '\x1b[H':
        case '\x01':
          cursor = 0
          return redraw()
        case '\x1b[F':
        case '\x05':
          cursor = buffer.length
          return redraw()
        case '\t': {
          const { completed, options } = complete(session, buffer.slice(0, cursor))
          if (options.length) {
            term.write(`\r\n${options.join('  ')}\r\n`)
          }
          buffer = completed + buffer.slice(cursor)
          cursor = completed.length
          return redraw()
        }
        case '\x0c':
          term.write('\x1b[2J\x1b[3J\x1b[H')
          return redraw()
        case '\x03':
          term.write('^C\r\n')
          return newPrompt()
        case '\x15':
          buffer = buffer.slice(cursor)
          cursor = 0
          return redraw()
        case '\x04':
          if (!buffer) {
            term.write('\r\n')
            return close()
          }
          return
      }
      if (data.startsWith('\x1b')) return
      for (const ch of data) {
        if (ch === '\r' || ch === '\n') {
          submit()
          if (!live) return
          continue
        }
        if (ch < ' ') continue
        buffer = buffer.slice(0, cursor) + ch + buffer.slice(cursor)
        cursor++
      }
      redraw()
    })

    // Keep Ctrl+L inside the terminal instead of the browser's address bar.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown' && e.ctrlKey && (e.key === 'l' || e.key === 'L')) e.preventDefault()
      return true
    })

    setConn('connecting')
    term.write(`${A.dim}Connecting to ${usernameFor(user)}@${hostnameFor(liveEnv)} …${A.reset}\r\n`)
    // Deferred so React's development double-mount doesn't log a session twice.
    const timer = window.setTimeout(() => {
      live = true
      startedAt = Date.now()
      openSession(id, readOnly)
      setConn('connected')
      term.write(`${crlf(motd(session))}\r\n\r\n`)
      newPrompt()
    }, 450)
    const onHide = () => close()
    window.addEventListener('pagehide', onHide)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pagehide', onHide)
      close()
      onData.dispose()
      ro.disconnect()
      term.dispose()
    }
    // A new attempt (Reconnect) or a change in access starts a fresh session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, readOnly, id, attempt])

  if (!env || !access?.allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-page p-4">
        <div className="card w-full max-w-lg">
          <EmptyState
            icon={TerminalSquare}
            title={env ? 'Terminal not available' : 'Environment not found'}
            description={env ? (access && !access.allowed ? access.reason : '') : 'This environment doesn’t exist or is outside what you can see.'}
            action={
              <Button asChild variant="secondary">
                <Link to={env ? back : '/'}>
                  <ArrowLeft /> {env ? 'Back to environment' : 'Go to your dashboard'}
                </Link>
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  const endSession = () => {
    closeRef.current()
    if (window.opener) window.close()
    navigate(back)
  }

  return (
    <div className="flex h-screen flex-col bg-term-bg text-term-fg">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-term-border bg-term-chrome px-4 py-2.5 sm:px-6">
        <Link to={back} className="flex size-8 shrink-0 items-center justify-center rounded-control text-term-muted hover:bg-term-border hover:text-term-fg" aria-label="Back to environment">
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-heading text-h3 text-term-fg">{env.spec.name}</h1>
            <span className="rounded-full border border-term-border px-2 py-0.5 text-xs font-semibold text-term-muted">Simulated terminal</span>
            {readOnly && <span className="rounded-full bg-status-pending-bg px-2 py-0.5 text-xs font-semibold text-status-pending-fg">Read-only</span>}
          </div>
          <p className="mt-0.5 truncate text-caption text-term-muted">
            {provider?.name ?? 'Unknown provider'}
            {region ? ` · ${region.name}` : ''} · {env.spec.instance.name}
          </p>
        </div>
        <span className="flex items-center gap-2 text-caption text-term-muted" role="status" aria-live="polite">
          <span
            className={cn('size-2 rounded-full', conn === 'connected' ? 'bg-teal' : conn === 'connecting' ? 'animate-pulse bg-tangerine' : 'bg-stopped-dot')}
            aria-hidden
          />
          {conn === 'connected' ? 'Connected' : conn === 'connecting' ? 'Connecting' : 'Disconnected'}
        </span>
        {conn === 'closed' ? (
          <Button size="compact" variant="secondary" onClick={() => setAttempt((a) => a + 1)}>
            <RotateCcw /> Reconnect
          </Button>
        ) : (
          <Button size="compact" variant="secondary" onClick={endSession}>
            <X /> Close session
          </Button>
        )}
      </header>
      <div className="min-h-0 flex-1 p-2 sm:p-3">
        <div ref={hostRef} className="h-full w-full" />
      </div>
      <footer className="border-t border-term-border px-4 py-1.5 text-center text-xs text-term-muted">Prototype — all data is simulated.</footer>
    </div>
  )
}
