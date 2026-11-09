import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTip, XAxis, YAxis } from 'recharts'
import { CalendarPlus, CheckCircle2, Eye, EyeOff, FlaskConical, GitBranch, Pause, Pencil, Play, XCircle } from 'lucide-react'
import type { Environment } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { canSeeEnvironment, useMemberProjectIds, useScope } from '@/store/selectors'
import { estimateCost } from '@/lib/cost'
import { formatCompact, formatDate, formatInt, formatShortDate, formatTime, relativeTime } from '@/lib/format'
import { autoShutdownLabel, CATEGORY_SINGULAR, COMPUTE_TIERS, dataClassLabel, purposeLabel, roleLabel } from '@/lib/labels'
import { envUsageSeries, initialLogs, makeLogLine, type LogLine } from '@/lib/mock'
import { axisProps, CHART_COLORS, CHART_GRID } from '@/lib/chart'
import { allocationOf } from '@/lib/quota'
import { editEnvPath, itemPath, requestPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCard } from '@/components/shared/KpiCard'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { LifecycleTimeline, futureSteps, mergedHistory } from '@/components/shared/LifecycleTimeline'
import { CopyButton } from '@/components/shared/CopyButton'
import { CodeBlock } from '@/components/shared/CodeBlock'
import { ChartCard, ChartTooltip } from '@/components/shared/ChartCard'
import { MonitoringPanel } from '@/components/shared/MonitoringPanel'
import { useEnvLifecycle } from '@/components/shared/useEnvLifecycle'
import { ItemMark } from '@/pages/super-admin/Catalog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { RadioCardItem, RadioGroup } from '@/components/ui/controls'
import NotFound from '@/pages/NotFound'
import { isAdmin } from '@/lib/roles'

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
  const live = env.status === 'active'

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
          {live && !paused && <StatusBadge status="active" label="Live" />}
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


const NO_MONITORING: Partial<Record<Environment['status'], string>> = {
  provisioning: 'Monitoring starts once the environment is active.',
  provisioning_failed: 'Provisioning failed, so there is nothing to monitor. Retry provisioning first.',
  terminated: 'This environment was terminated. Its metrics are no longer kept.',
}

export default function EnvironmentDetail() {
  const { id } = useParams()
  const scope = useScope()!
  const memberOf = useMemberProjectIds()
  const [params, setParams] = useSearchParams()
  const env = useAppStore((s) => s.environments.find((e) => e.id === id))
  const catalog = useAppStore((s) => s.catalog)
  const users = useAppStore((s) => s.users)
  const projects = useAppStore((s) => s.projects)
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === env?.tenantId))
  const request = useAppStore((s) => s.requests.find((r) => r.id === env?.requestId))
  const pendingChange = useAppStore((s) => s.requests.find((r) => r.envId === id && r.kind === 'change' && !['approved', 'rejected', 'cancelled', 'draft'].includes(r.status)))
  const testRuns = useAppStore((s) => s.testRuns.filter((t) => t.envId === id))
  const extendEnv = useAppStore((s) => s.extendEnv)
  const { actionsFor, dialogs } = useEnvLifecycle()
  const [reveal, setReveal] = useState(false)
  const [snippetKind, setSnippetKind] = useState<'chat' | 'asr'>('chat')
  const [extendOpen, setExtendOpen] = useState(false)
  const [extendWeeks, setExtendWeeks] = useState('4')
  const usage = useMemo(() => (env ? envUsageSeries(env) : []), [env])

  if (!env || !canSeeEnvironment(scope, env, memberOf)) {
    return <NotFound message="This environment doesn’t exist or is outside what you can see." />
  }

  const item = (cid: string) => catalog.find((c) => c.id === cid)
  const owner = users.find((u) => u.id === env.ownerId)
  const project = projects.find((p) => p.id === env.projectId)
  const est = estimateCost(env.spec, catalog)
  const alloc = allocationOf(env.spec)
  const tier = COMPUTE_TIERS.find((t) => t.value === env.spec.compute)!
  const live = env.status === 'active' || env.status === 'stopped' || env.status === 'suspended'
  const canManage = isAdmin(scope.role) || env.ownerId === scope.user.id
  const requests7 = usage.slice(-7).reduce((s, u) => s + u.requests, 0)
  const firstModel = env.spec.llms[0] ? item(env.spec.llms[0].id)?.version : undefined
  const firstAsr = env.spec.asr[0] ? item(env.spec.asr[0])?.version : undefined
  const kind = snippetKind === 'asr' && firstAsr ? 'asr' : 'chat'
  const code = snippets(env, kind === 'asr' ? firstAsr! : (firstModel ?? 'default'), kind)
  const maskedKey = `${env.apiKey.slice(0, 9)}${'•'.repeat(20)}${env.apiKey.slice(-4)}`
  const events = mergedHistory(request, env)
  const last = env.history[env.history.length - 1]
  const actions = actionsFor(env)
  const monitoringBlocked = NO_MONITORING[env.status]
  const tab = params.get('tab') === 'monitoring' && !monitoringBlocked ? 'monitoring' : params.get('tab') === 'tests' ? 'tests' : 'overview'
  const attached = [
    ...env.spec.llms.map((l) => ({ it: item(l.id), extra: `${l.tokenBudget}M tokens / month` })),
    ...env.spec.asr.map((a) => ({ it: item(a), extra: env.spec.languages.join(', ') || 'No languages' })),
    ...env.spec.capabilities.map((c) => ({ it: item(c), extra: null as string | null })),
  ].filter((a) => a.it)

  return (
    <>
      <PageHeader
        eyebrow={`${scope.role === 'super_admin' ? `${tenant?.name} · ` : ''}${project?.name ?? ''}`}
        title={env.spec.name}
        description={env.spec.description || undefined}
        actions={
          <>
            {actions.map((a) => (
              <Button
                key={a.key}
                variant={a.tone === 'primary' ? 'primary' : a.tone === 'secondary' ? 'secondary' : 'ghost'}
                className={a.tone === 'destructive' ? 'text-red-text hover:text-red-text' : undefined}
                onClick={a.run}
              >
                <a.icon /> {a.label}
              </Button>
            ))}
            {canManage && (env.status === 'active' || env.status === 'stopped') && (
              <>
                <Button variant="secondary" onClick={() => setExtendOpen(true)}>
                  <CalendarPlus /> Extend
                </Button>
                {pendingChange ? (
                  <Tooltip content="A change is already waiting for review.">
                    <span>
                      <Button variant="secondary" disabled>
                        <Pencil /> Edit
                      </Button>
                    </span>
                  </Tooltip>
                ) : (
                  <Button asChild variant="secondary">
                    <Link to={editEnvPath(scope.role, env.id)}>
                      <Pencil /> Edit configuration
                    </Link>
                  </Button>
                )}
              </>
            )}
            {scope.role === 'qa' && env.status === 'active' && (
              <Button asChild>
                <Link to={`/qa/functional?env=${env.id}`}>
                  <FlaskConical /> Test this environment
                </Link>
              </Button>
            )}
            {scope.role === 'user' && env.status === 'active' && !actions.some((a) => a.tone === 'primary') && (
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
          {pendingChange && <StatusBadge status={pendingChange.status} label={`Change ${pendingChange.status === 'escalated' ? 'with Super Admin' : 'under review'}`} />}
          <Tag>
            {tier.label}
            {alloc.gpus > 1 ? ` × ${alloc.gpus}` : ''}
          </Tag>
          <Tag>{purposeLabel(env.spec.purpose)}</Tag>
          <Tag>{dataClassLabel(env.spec.dataClassification).replace(/ data$/, '')} data</Tag>
        </div>
        {env.status === 'provisioning' && (
          <div className="rounded-card border border-border bg-status-provisioning-bg p-4 text-sm text-status-provisioning-fg">
            <p className="font-semibold">{env.hold ? 'Waiting for a GPU in the shared pool' : 'Setting up your environment'}</p>
            <p className="mt-0.5">{env.hold ? 'Provisioning starts as soon as capacity frees up.' : 'We’re preparing compute, installing models and creating your API key. This takes a few seconds.'}</p>
            <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-bg-surface/60">
              <div className="absolute inset-y-0 w-2/5 animate-indeterminate rounded-full bg-blue" />
            </div>
          </div>
        )}
        {env.status === 'provisioning_failed' && (
          <div className="flex gap-3 rounded-card bg-status-rejected-bg p-4 text-sm text-status-rejected-fg">
            <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Provisioning failed</p>
              <p className="mt-0.5">{env.failureReason}</p>
              {scope.role === 'user' && <p className="mt-1">Your Tenant Admin or the Super Admin can retry provisioning.</p>}
            </div>
          </div>
        )}
        {env.status === 'suspended' && (
          <div className="flex gap-3 rounded-card bg-status-pending-bg p-4 text-sm text-status-pending-fg">
            <Pause className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Suspended by the Super Admin</p>
              <p className="mt-0.5">{last?.comment}</p>
              {scope.role !== 'super_admin' && <p className="mt-1">Only the Super Admin can resume it.</p>}
            </div>
          </div>
        )}
        {pendingChange && (
          <div className="rounded-card bg-status-review-bg px-4 py-3 text-sm text-status-review-fg">
            A change that needs more infrastructure is waiting for approval. The environment keeps its current setup until then.{' '}
            {scope.role !== 'qa' && (
              <Link to={requestPath(scope.role, pendingChange.id)} className="font-semibold underline underline-offset-2">
                See the request
              </Link>
            )}
          </div>
        )}
        {tenant?.status === 'suspended' && (
          <div className="rounded-card bg-status-stopped-bg px-4 py-3 text-sm text-status-stopped-fg">This tenant is suspended, so environments can’t be started.</div>
        )}
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(params)
          if (v === 'overview') next.delete('tab')
          else next.set('tab', v)
          setParams(next, { replace: true })
        }}
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {monitoringBlocked ? (
            <Tooltip content={monitoringBlocked}>
              <span>
                <TabsTrigger value="monitoring" disabled className="disabled:cursor-not-allowed disabled:opacity-50">
                  Monitoring
                </TabsTrigger>
              </span>
            </Tooltip>
          ) : (
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          )}
          <TabsTrigger value="tests">Tests ({testRuns.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {monitoringBlocked && <p className="mb-4 text-caption text-text-muted">Monitoring: {monitoringBlocked}</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Credits used" value={formatInt(env.creditsUsed)} trend={{ direction: 'flat', text: 'Since it started' }} />
            <KpiCard label="Estimated per month" value={formatInt(est.credits)} trend={{ direction: 'flat', text: `${formatInt(est.gpuHours)} GPU-hours` }} />
            <KpiCard label="Requests, last 7 days" value={formatCompact(requests7)} trend={{ direction: 'flat', text: env.status === 'active' ? 'Serving traffic' : 'No traffic right now' }} />
            <KpiCard label="Expires" value={env.expiresAt ? formatShortDate(env.expiresAt) : '—'} trend={{ direction: 'flat', text: env.expiresAt ? formatDate(env.expiresAt) : 'No end date' }} />
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
                          <code className="min-w-0 flex-1 truncate font-mono text-caption text-text-primary">{reveal && canManage ? env.apiKey : maskedKey}</code>
                          {canManage && (
                            <>
                              <Button variant="ghost" size="icon-sm" onClick={() => setReveal((r) => !r)} aria-label={reveal ? 'Hide API key' : 'Show API key'}>
                                {reveal ? <EyeOff /> : <Eye />}
                              </Button>
                              <CopyButton value={env.apiKey} what="API key" />
                            </>
                          )}
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
                    <p className="text-caption text-text-muted">The endpoint and API key appear here once the environment is active.</p>
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

              {env.status !== 'terminated' && <LogsPanel key={env.id + env.status} env={env} />}
            </div>

            <div className="flex flex-col gap-6">
              <section className="card p-6">
                <h2 className="mb-4 font-heading text-h3 text-text-primary">Lifecycle</h2>
                <LifecycleTimeline events={events} future={futureSteps(events, request)} users={users} />
                {request && scope.role !== 'qa' && (
                  <Link to={requestPath(scope.role, request.id)} className="link mt-4 inline-block text-caption">
                    Open the original request
                  </Link>
                )}
              </section>

              <section className="card p-6">
                <h2 className="mb-4 font-heading text-h3 text-text-primary">Attached capabilities</h2>
                {attached.length === 0 ? (
                  <p className="text-sm text-text-secondary">Nothing attached yet.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {attached.map(({ it, extra }) => (
                      <li key={it!.id} className="flex items-start gap-3">
                        <ItemMark item={it!} className="size-8" />
                        <div className="min-w-0 flex-1">
                          <Link to={itemPath(scope.role, it!.id)} className="block truncate text-sm font-semibold text-text-primary hover:text-indigo-text">
                            {it!.name}
                          </Link>
                          <p className="truncate text-caption text-text-muted">
                            {CATEGORY_SINGULAR[it!.category]} · {/^\d/.test(it!.version) ? `v${it!.version}` : it!.version}
                            {extra ? ` · ${extra}` : ''}
                          </p>
                        </div>
                        {it!.gitUrl && (
                          <a href={it!.gitUrl} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-text-muted hover:bg-bg-subtle hover:text-indigo-text" aria-label={`${it!.name} repository`}>
                            <GitBranch className="size-4" />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card p-6">
                <h2 className="mb-4 font-heading text-h3 text-text-primary">Setup</h2>
                <dl className="flex flex-col gap-2.5 text-sm">
                  {(
                    [
                      ['Owner', `${owner?.name ?? ''}${owner ? ` · ${roleLabel(owner.role)}` : ''}`],
                      ['Compute', `${tier.label}${alloc.gpus > 1 ? ` × ${alloc.gpus}` : ''}`],
                      ['Allocation', `${alloc.vcpu} vCPU · ${alloc.ramGb} GB RAM · ${formatInt(alloc.storageGb)} GB`],
                      ['Auto-shutdown', autoShutdownLabel(env.spec.autoShutdownHours)],
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
            </div>
          </div>
        </TabsContent>

        <TabsContent value="monitoring">{!monitoringBlocked && tab === 'monitoring' && <MonitoringPanel env={env} catalog={catalog} />}</TabsContent>

        <TabsContent value="tests">
          <section className="card p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-h3 text-text-primary">Test runs</h2>
              {scope.role === 'user' && env.status === 'active' && (
                <Button asChild variant="secondary" size="compact">
                  <Link to={`/app/testing?env=${env.id}`}>
                    <Play /> Run tests
                  </Link>
                </Button>
              )}
            </div>
            {testRuns.length === 0 ? (
              <p className="text-sm text-text-secondary">No tests have been run on this environment yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {testRuns.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                    {t.passed ? <CheckCircle2 className="size-4 text-teal" aria-hidden /> : <XCircle className="size-4 text-red-text" aria-hidden />}
                    <Tag>{t.kind === 'load' ? 'Load test' : 'Functional'}</Tag>
                    <span className="min-w-0 flex-1 text-sm text-text-primary">{t.summary}</span>
                    <span className="text-caption text-text-muted">
                      {users.find((u) => u.id === t.actorId)?.name} · {relativeTime(t.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>
      </Tabs>

      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent size="md">
          <DialogHeader title="Extend environment" description={`It currently runs until ${env.expiresAt ? formatDate(env.expiresAt) : 'the end of its duration'}. Extending adds no infrastructure, so no approval is needed.`} />
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
      {dialogs}
    </>
  )
}
