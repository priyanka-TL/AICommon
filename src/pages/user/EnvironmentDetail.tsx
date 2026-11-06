import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTip, XAxis, YAxis } from 'recharts'
import {
  CalendarPlus,
  Eye,
  EyeOff,
  FlaskConical,
  GitBranch,
  Pause,
  Pencil,
  Play,
  Square,
  Trash2,
} from 'lucide-react'
import type { Environment } from '@/data/types'
import { useAppStore, useCurrentTenant } from '@/store/useAppStore'
import { estimateCost } from '@/lib/cost'
import { formatCompact, formatDate, formatInt, formatShortDate, formatTime } from '@/lib/format'
import { autoShutdownLabel, CATEGORY_SINGULAR, COMPUTE_TIERS, dataClassLabel, purposeLabel } from '@/lib/labels'
import { envUsageSeries, initialLogs, makeLogLine, type LogLine } from '@/lib/mock'
import { axisProps, CHART_COLORS, CHART_GRID } from '@/lib/chart'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCard } from '@/components/shared/KpiCard'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { StatusTimeline } from '@/components/shared/StatusTimeline'
import { CopyButton } from '@/components/shared/CopyButton'
import { CodeBlock } from '@/components/shared/CodeBlock'
import { ChartCard, ChartTooltip } from '@/components/shared/ChartCard'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ItemMark } from '@/pages/admin/Catalog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { RadioCardItem, RadioGroup } from '@/components/ui/controls'
import NotFound from '@/pages/NotFound'

function snippets(env: Environment, model: string, kind: 'chat' | 'asr') {
  const url = `${env.endpoint}/${kind === 'chat' ? 'chat/completions' : 'audio/transcriptions'}`
  const lang = env.spec.languages[0]?.slice(0, 2).toLowerCase() ?? 'hi'
  if (kind === 'chat') {
    return {
      python: `import os
import requests

resp = requests.post(
    "${url}",
    headers={"Authorization": f"Bearer {os.environ['AIC_API_KEY']}"},
    json={
        "model": "${model}",
        "messages": [{"role": "user", "content": "Namaskara! How do I check soil moisture?"}],
    },
    timeout=30,
)
print(resp.json()["choices"][0]["message"]["content"])`,
      js: `const resp = await fetch("${url}", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.AIC_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${model}",
    messages: [{ role: "user", content: "Namaskara! How do I check soil moisture?" }],
  }),
});
const data = await resp.json();
console.log(data.choices[0].message.content);`,
      curl: `curl ${url} \\
  -H "Authorization: Bearer $AIC_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": [{"role": "user", "content": "Namaskara! How do I check soil moisture?"}]
  }'`,
    }
  }
  return {
    python: `import os
import requests

with open("question.wav", "rb") as audio:
    resp = requests.post(
        "${url}",
        headers={"Authorization": f"Bearer {os.environ['AIC_API_KEY']}"},
        files={"file": audio},
        data={"model": "${model}", "language": "${lang}"},
        timeout=60,
    )
print(resp.json()["text"])`,
    js: `const form = new FormData();
form.append("file", audioBlob, "question.wav");
form.append("model", "${model}");
form.append("language", "${lang}");

const resp = await fetch("${url}", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.AIC_API_KEY}\` },
  body: form,
});
console.log((await resp.json()).text);`,
    curl: `curl ${url} \\
  -H "Authorization: Bearer $AIC_API_KEY" \\
  -F file=@question.wav \\
  -F model=${model} \\
  -F language=${lang}`,
  }
}

function LogsPanel({ env }: { env: Environment }) {
  const catalog = useAppStore((s) => s.catalog)
  const [logs, setLogs] = useState<LogLine[]>(() => initialLogs(env, catalog))
  const [paused, setPaused] = useState(false)
  const [level, setLevel] = useState<'all' | 'WARN' | 'ERROR'>('all')
  const seq = useRef(logs.length)
  const box = useRef<HTMLDivElement>(null)
  const live = env.status === 'running'

  useEffect(() => {
    if (!live || paused) return
    const t = setInterval(() => {
      seq.current += 1
      setLogs((l) => [...l.slice(-199), makeLogLine(env, catalog, seq.current)])
    }, 1600)
    return () => clearInterval(t)
  }, [live, paused, env, catalog])

  const shown = logs.filter((l) => level === 'all' || (level === 'WARN' ? l.level !== 'INFO' : l.level === 'ERROR'))

  useEffect(() => {
    if (!paused && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [shown.length, paused])

  return (
    <section className="card flex flex-col p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-h3 text-text-primary">Logs</h2>
          {live && !paused && <StatusBadge status="running" label="Live" />}
          {!live && <Tag>Not running</Tag>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-control border border-border p-0.5" role="group" aria-label="Log level">
            {(
              [
                ['all', 'All'],
                ['WARN', 'Warnings'],
                ['ERROR', 'Errors'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={level === v}
                onClick={() => setLevel(v)}
                className={cn('rounded-[8px] px-2.5 py-1 text-caption font-semibold', level === v ? 'bg-indigo-50 text-indigo-text' : 'text-text-secondary hover:text-text-primary')}
              >
                {label}
              </button>
            ))}
          </div>
          {live && (
            <Button variant="ghost" size="sm" onClick={() => setPaused((p) => !p)}>
              {paused ? <Play /> : <Pause />} {paused ? 'Resume' : 'Pause'}
            </Button>
          )}
        </div>
      </header>
      <div
        ref={box}
        className="h-72 overflow-y-auto rounded-control border border-border bg-bg-subtle p-3 font-mono text-[12px] leading-5"
        role="log"
        aria-live="off"
        aria-label="Environment logs"
      >
        {shown.length === 0 ? (
          <p className="text-text-muted">No log lines at this level.</p>
        ) : (
          shown.map((l) => (
            <div key={l.id} className="flex gap-3 whitespace-pre">
              <span className="shrink-0 text-text-muted">{formatTime(l.at)}</span>
              <span
                className={cn(
                  'w-12 shrink-0 font-semibold',
                  l.level === 'INFO' && 'text-text-secondary',
                  l.level === 'WARN' && 'text-status-pending-fg',
                  l.level === 'ERROR' && 'text-red-text',
                )}
              >
                {l.level}
              </span>
              <span className="text-text-primary">{l.message}</span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

export default function EnvironmentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const tenant = useCurrentTenant()!
  const env = useAppStore((s) => s.environments.find((e) => e.id === id))
  const catalog = useAppStore((s) => s.catalog)
  const owner = useAppStore((s) => s.users.find((u) => u.id === env?.ownerId))
  const pendingChange = useAppStore((s) => s.requests.find((r) => r.envId === id && r.type === 'change' && r.status === 'pending'))
  const request = useAppStore((s) => s.requests.find((r) => r.id === env?.requestId))
  const startEnv = useAppStore((s) => s.startEnv)
  const stopEnv = useAppStore((s) => s.stopEnv)
  const extendEnv = useAppStore((s) => s.extendEnv)
  const deleteEnv = useAppStore((s) => s.deleteEnv)
  const [reveal, setReveal] = useState(false)
  const [snippetKind, setSnippetKind] = useState<'chat' | 'asr'>('chat')
  const [extendOpen, setExtendOpen] = useState(false)
  const [extendWeeks, setExtendWeeks] = useState('4')
  const [deleteOpen, setDeleteOpen] = useState(false)

  const usage = useMemo(() => (env ? envUsageSeries(env) : []), [env])

  if (!env || env.tenantId !== tenant.id) {
    return <NotFound message="This environment doesn’t exist or belongs to another organisation." />
  }

  const name = (cid: string) => catalog.find((c) => c.id === cid)
  const est = estimateCost(env.spec, catalog)
  const tier = COMPUTE_TIERS.find((t) => t.value === env.spec.compute)!
  const live = env.status === 'running' || env.status === 'stopped'
  const provisioning = env.status === 'provisioning' || env.status === 'approved'
  const suspended = tenant.status !== 'active'
  const requests7 = usage.slice(-7).reduce((s, u) => s + u.requests, 0)
  const firstModel = env.spec.llms[0] ? name(env.spec.llms[0].id)?.version : undefined
  const firstAsr = env.spec.asr[0] ? name(env.spec.asr[0])?.version : undefined
  const kind = snippetKind === 'asr' && firstAsr ? 'asr' : 'chat'
  const code = snippets(env, kind === 'asr' ? firstAsr! : (firstModel ?? 'default'), kind)
  const maskedKey = `${env.apiKey.slice(0, 9)}${'•'.repeat(20)}${env.apiKey.slice(-4)}`
  const attached = [
    ...env.spec.llms.map((l) => ({ item: name(l.id), extra: `${l.tokenBudget}M tokens / month` })),
    ...env.spec.asr.map((a) => ({ item: name(a), extra: `${env.spec.languages.join(', ') || 'No languages'}` })),
    ...env.spec.capabilities.map((c) => ({ item: name(c), extra: null as string | null })),
  ].filter((a) => a.item)

  return (
    <>
      <PageHeader
        eyebrow={`${purposeLabel(env.spec.purpose)} · ${owner?.name ?? ''}`}
        title={env.spec.name}
        description={env.spec.description || undefined}
        actions={
          <>
            {env.status === 'running' && (
              <Button
                variant="secondary"
                onClick={() => {
                  stopEnv(env.id)
                  toast.success(`Stopped “${env.spec.name}”.`, { description: 'You are not charged for compute while it is stopped.' })
                }}
              >
                <Square /> Stop
              </Button>
            )}
            {env.status === 'stopped' && (
              <Button
                variant="secondary"
                disabled={suspended}
                onClick={() => {
                  startEnv(env.id)
                  toast.success(`Started “${env.spec.name}”.`)
                }}
              >
                <Play /> Start
              </Button>
            )}
            {(live || provisioning) && (
              <Button variant="secondary" onClick={() => setExtendOpen(true)}>
                <CalendarPlus /> Extend
              </Button>
            )}
            {(live || provisioning) &&
              (pendingChange ? (
                <Tooltip content="A change is already waiting for review.">
                  <span>
                    <Button variant="secondary" disabled>
                      <Pencil /> Edit
                    </Button>
                  </span>
                </Tooltip>
              ) : (
                <Button asChild variant="secondary">
                  <Link to={`/app/environments/${env.id}/edit`}>
                    <Pencil /> Edit
                  </Link>
                </Button>
              ))}
            <Button variant="ghost" className="text-red-text hover:text-red-text" onClick={() => setDeleteOpen(true)}>
              <Trash2 /> Delete
            </Button>
            {env.status === 'running' && (
              <Button asChild>
                <Link to={`/app/testing?env=${env.id}`}>
                  <FlaskConical /> Test this environment
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={env.status} />
          {pendingChange && <StatusBadge status="change-requested" />}
          <Tag>{tier.label}</Tag>
          <Tag>{dataClassLabel(env.spec.dataClassification)} data</Tag>
        </div>
        {provisioning && (
          <div className="rounded-card border border-border bg-status-provisioning-bg p-4 text-sm text-status-provisioning-fg">
            <p className="font-semibold">{env.status === 'approved' ? 'Approved and waiting to start' : 'Setting up your environment'}</p>
            <p className="mt-0.5">We’re preparing compute, installing models and creating your API key. This usually takes about a minute.</p>
            <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-bg-surface/60">
              <div className="absolute inset-y-0 w-2/5 animate-indeterminate rounded-full bg-blue" />
            </div>
          </div>
        )}
        {pendingChange && (
          <div className="rounded-card bg-status-change-bg px-4 py-3 text-sm text-status-change-fg">
            You asked for a change on {formatDate(pendingChange.createdAt)}. It keeps running as it is until an admin reviews it.{' '}
            <Link to="/app/requests" className="font-semibold underline underline-offset-2">
              See the request
            </Link>
          </div>
        )}
        {(env.status === 'pending' || env.status === 'rejected') && (
          <div className="rounded-card bg-status-pending-bg px-4 py-3 text-sm text-status-pending-fg">
            {env.status === 'pending' ? 'This request is waiting for admin review.' : `This request was not approved. ${request?.rejectionReason ?? ''}`}{' '}
            <Link to="/app/requests" className="font-semibold underline underline-offset-2">
              Go to My requests
            </Link>
          </div>
        )}
        {suspended && (
          <div className="rounded-card bg-status-stopped-bg px-4 py-3 text-sm text-status-stopped-fg">
            Your organisation is suspended, so environments can’t be started. Contact your ShikshaLokam admin.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Credits used" value={formatInt(env.creditsUsed)} trend={{ direction: 'flat', text: 'Since it started' }} />
        <KpiCard label="Estimated per month" value={formatInt(est.credits)} trend={{ direction: 'flat', text: `${formatInt(est.gpuHours)} GPU-hours` }} />
        <KpiCard label="Requests, last 7 days" value={formatCompact(requests7)} trend={{ direction: 'flat', text: env.status === 'running' ? 'Serving traffic' : 'No traffic right now' }} />
        <KpiCard label="Expires" value={env.expiresAt ? formatShortDate(env.expiresAt) : '—'} trend={{ direction: 'flat', text: env.expiresAt ? formatDate(env.expiresAt) : 'Starts after approval' }} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="card p-6">
            <h2 className="mb-1 font-heading text-h3 text-text-primary">Connect</h2>
            <p className="mb-5 text-caption text-text-secondary">Use these details from your application. Keep the API key on your server, never in a mobile app or browser.</p>
            {live ? (
              <div className="flex flex-col gap-5">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="eyebrow mb-1.5">Endpoint</p>
                    <div className="flex items-center gap-1 rounded-control border border-border bg-bg-subtle py-1 pl-3 pr-1">
                      <code className="min-w-0 flex-1 truncate font-mono text-caption text-text-primary">{env.endpoint}</code>
                      <CopyButton value={env.endpoint} what="Endpoint" />
                    </div>
                  </div>
                  <div>
                    <p className="eyebrow mb-1.5">API key</p>
                    <div className="flex items-center gap-1 rounded-control border border-border bg-bg-subtle py-1 pl-3 pr-1">
                      <code className="min-w-0 flex-1 truncate font-mono text-caption text-text-primary">{reveal ? env.apiKey : maskedKey}</code>
                      <Button variant="ghost" size="icon-sm" onClick={() => setReveal((r) => !r)} aria-label={reveal ? 'Hide API key' : 'Show API key'}>
                        {reveal ? <EyeOff /> : <Eye />}
                      </Button>
                      <CopyButton value={env.apiKey} what="API key" />
                    </div>
                  </div>
                </div>

                {firstAsr && firstModel && (
                  <div className="flex w-fit rounded-control border border-border p-0.5" role="group" aria-label="Example type">
                    {(
                      [
                        ['chat', 'Chat completion'],
                        ['asr', 'Transcribe audio'],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={kind === v}
                        onClick={() => setSnippetKind(v)}
                        className={cn('rounded-[8px] px-3 py-1 text-caption font-semibold', kind === v ? 'bg-indigo-50 text-indigo-text' : 'text-text-secondary hover:text-text-primary')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <Tabs defaultValue="python">
                  <TabsList>
                    <TabsTrigger value="python">Python</TabsTrigger>
                    <TabsTrigger value="js">JavaScript</TabsTrigger>
                    <TabsTrigger value="curl">cURL</TabsTrigger>
                  </TabsList>
                  <TabsContent value="python" className="pt-4">
                    <CodeBlock code={code.python} label="Python · requests" />
                  </TabsContent>
                  <TabsContent value="js" className="pt-4">
                    <CodeBlock code={code.js} label="JavaScript · fetch" />
                  </TabsContent>
                  <TabsContent value="curl" className="pt-4">
                    <CodeBlock code={code.curl} label="Shell" />
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10" />
                <Skeleton className="h-32" />
                <p className="text-caption text-text-muted">The endpoint and API key appear here once the environment is running.</p>
              </div>
            )}
          </section>

          <ChartCard title="Usage" description="Credits and requests per day, last 30 days" height={240}>
            {env.creditsUsed === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-text-secondary">No usage yet. It shows up once the environment serves requests.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={usage} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => formatShortDate(d)} minTickGap={24} />
                  <YAxis {...axisProps} tickFormatter={(v) => formatCompact(v)} width={48} />
                  <ChartTip content={<ChartTooltip labelFormatter={(d) => formatShortDate(d)} />} />
                  <Area type="monotone" dataKey="requests" name="Requests" stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.12} strokeWidth={2} />
                  <Area type="monotone" dataKey="credits" name="Credits" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <LogsPanel key={env.id + env.status} env={env} />
        </div>

        <div className="flex flex-col gap-6">
          <section className="card p-6">
            <h2 className="mb-4 font-heading text-h3 text-text-primary">Attached capabilities</h2>
            {attached.length === 0 ? (
              <p className="text-sm text-text-secondary">Nothing attached yet. Add models or tools from the catalog.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {attached.map(({ item, extra }) => (
                  <li key={item!.id} className="flex items-start gap-3">
                    <ItemMark item={item!} className="size-8" />
                    <div className="min-w-0 flex-1">
                      <Link to={`/app/catalog/${item!.id}`} className="block truncate text-sm font-semibold text-text-primary hover:text-indigo-text">
                        {item!.name}
                      </Link>
                      <p className="truncate text-caption text-text-muted">
                        {CATEGORY_SINGULAR[item!.category]} · v{item!.version}
                        {extra ? ` · ${extra}` : ''}
                      </p>
                    </div>
                    {item!.gitUrl && (
                      <a href={item!.gitUrl} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-text-muted hover:bg-bg-subtle hover:text-indigo-text" aria-label={`${item!.name} repository`}>
                        <GitBranch className="size-4" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="secondary" size="compact" className="mt-5 w-full">
              <Link to="/app/catalog">Browse the catalog</Link>
            </Button>
          </section>

          <section className="card p-6">
            <h2 className="mb-4 font-heading text-h3 text-text-primary">Setup</h2>
            <dl className="flex flex-col gap-2.5 text-sm">
              {(
                [
                  ['Compute', `${tier.label} · ${tier.detail}`],
                  ['Storage', `${env.spec.storageGb} GB`],
                  ['Auto-shutdown', autoShutdownLabel(env.spec.autoShutdownHours)],
                  ['Duration', `${env.spec.durationWeeks} weeks`],
                  ['Personal identifiers', env.spec.containsPii ? 'Yes' : 'No'],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[120px_1fr] gap-3">
                  <dt className="text-text-secondary">{k}</dt>
                  <dd className="text-text-primary">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card p-6">
            <h2 className="mb-4 font-heading text-h3 text-text-primary">Status history</h2>
            <StatusTimeline entries={env.timeline} />
          </section>
        </div>
      </div>

      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent size="md">
          <DialogHeader
            title="Extend environment"
            description={`It currently runs until ${env.expiresAt ? formatDate(env.expiresAt) : 'the end of its duration'}. Extensions within your quota don’t need approval.`}
          />
          <DialogBody>
            <RadioGroup value={extendWeeks} onValueChange={setExtendWeeks} className="grid-cols-3" aria-label="Extend by">
              {['2', '4', '8'].map((w) => {
                const base = env.expiresAt ? new Date(env.expiresAt).getTime() : Date.now()
                return (
                  <RadioCardItem
                    key={w}
                    value={w}
                    className="card flex flex-col items-start gap-0.5 p-3 text-left hover:border-border-strong data-[state=checked]:border-2 data-[state=checked]:border-indigo data-[state=checked]:p-[11px] dark:data-[state=checked]:border-indigo-text"
                  >
                    <span className="font-semibold text-text-primary">+{w} weeks</span>
                    <span className="text-caption text-text-secondary">Until {formatShortDate(new Date(base + Number(w) * 7 * 86_400_000))}</span>
                  </RadioCardItem>
                )
              })}
            </RadioGroup>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                extendEnv(env.id, Number(extendWeeks))
                setExtendOpen(false)
                toast.success(`Extended by ${extendWeeks} weeks.`)
              }}
            >
              <CalendarPlus /> Extend by {extendWeeks} weeks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete “${env.spec.name}”?`}
        description="The endpoint stops working, the API key is revoked and stored data is removed after 7 days. This can’t be undone."
        confirmLabel="Delete environment"
        destructive
        onConfirm={() => {
          deleteEnv(env.id)
          toast.success(`Deleted “${env.spec.name}”.`)
          navigate('/app')
        }}
      />
    </>
  )
}
