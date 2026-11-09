import { Link, Navigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Award, Download, Link2 } from 'lucide-react'
import type { QaRun, User } from '@/data/types'
import { useAppStore, useCurrentUser } from '@/store/useAppStore'
import { qaProjectIds, useScope } from '@/store/selectors'
import { formatDateTime, formatInt } from '@/lib/format'
import { downloadText } from '@/lib/metrics'
import { homeFor, itemPath, reportPath, sharedReportPath } from '@/lib/paths'
import { currentSpec, formatMetric, METRIC_INFO, qualityScore } from '@/lib/qa'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCard } from '@/components/shared/KpiCard'
import { Tag } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import NotFound from '@/pages/NotFound'
import { ComparisonCharts, MetricTable, SideBySide } from './ComparisonViews'
import { PassBadge, PromptTable, SummaryKpis } from './shared'
import { RUN_KIND_LABELS } from './TestReports'

/** Same tenant, and the person works on (or tests, or administers) the project. */
export function useCanSeeRun(run: QaRun | undefined) {
  const scope = useScope()
  const projects = useAppStore((s) => s.projects)
  if (!run || !scope) return false
  if (scope.role === 'super_admin') return true
  if (run.tenantId !== scope.user.tenantId) return false
  if (scope.role === 'tenant_admin') return true
  // Assigned projects, or any project when tenant-wide is allowed, so a shared link opens even with the switch off.
  if (scope.role === 'qa') return qaProjectIds(scope.user, projects, true).includes(run.projectId)
  const p = projects.find((x) => x.id === run.projectId)
  return !!p && (p.memberIds.includes(scope.user.id) || p.ownerId === scope.user.id)
}

function reportText(run: QaRun, projectName: string, names: (id: string) => string, actor: User | undefined) {
  const lines = [
    'AI Sandbox – QA test report',
    `Run: ${run.title}`,
    `Project: ${projectName}`,
    `Type: ${RUN_KIND_LABELS[run.kind]}`,
    `When: ${formatDateTime(run.at)} by ${actor?.name ?? ''}`,
    `Result: ${run.passed ? 'Passed' : 'Did not pass'}`,
    '',
  ]
  if (run.load) lines.push(`Load: ${run.load.vus} virtual users, peak ${run.load.rps} requests/s, p95 ${run.load.p95} ms, errors ${run.load.errorPct}%`)
  for (const m of run.models) {
    lines.push(
      `${names(m.modelId)}: accuracy ${m.accuracy.toFixed(2)}, faithfulness ${m.faithfulness.toFixed(2)}, relevance ${m.relevance.toFixed(2)}, toxicity ${m.toxicity.toFixed(2)}, p50 ${m.latencyP50} ms, p95 ${m.latencyP95} ms, ${m.tokens} tokens, ${m.costCredits.toFixed(3)} credits, ${Math.round(m.passRate * 100)}% prompts passed`,
    )
  }
  lines.push('', 'Prototype — all data is simulated.')
  return lines.join('\n')
}

export default function ReportDetail() {
  const { id } = useParams()
  const scope = useScope()!
  const run = useAppStore((s) => s.qaRuns.find((r) => r.id === id))
  const catalog = useAppStore((s) => s.catalog)
  const users = useAppStore((s) => s.users)
  const project = useAppStore((s) => s.projects.find((p) => p.id === run?.projectId))
  const config = useAppStore((s) => s.testConfigs.find((c) => c.id === run?.configId))
  const canSee = useCanSeeRun(run)

  if (!run || !canSee || !project) return <NotFound message="This report doesn’t exist or is outside what you can see." />

  const names = (mid: string) => catalog.find((c) => c.id === mid)?.name ?? mid
  const actor = users.find((u) => u.id === run.actorId)
  const version = config?.versions.find((v) => v.version === run.configVersion)
  const spec = version?.spec ?? (config ? currentSpec(config) : undefined)
  const recommended = project.recommendation?.runId === run.id ? project.recommendation : undefined

  const copyLink = async () => {
    const url = `${window.location.origin}${sharedReportPath(run.id)}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied.', { description: 'People in your organisation who work on this project can open it.' })
    } catch {
      toast.error('Couldn’t copy the link. Copy it from the address bar instead.')
    }
  }

  const downloadPdf = () => {
    downloadText(`qa-report-${run.id}.txt`, reportText(run, project.name, names, actor), 'text/plain')
    toast.success('Report PDF prepared.', { description: 'In this prototype it downloads as a text summary.' })
  }

  const back = scope.role === 'qa' ? '/qa/reports' : homeFor(scope.role)

  return (
    <>
      <Link to={back} className="link mb-4 inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" aria-hidden /> {scope.role === 'qa' ? 'Test Reports' : 'Back'}
      </Link>
      <PageHeader
        eyebrow={`${project.name} · ${RUN_KIND_LABELS[run.kind]}`}
        title={run.title}
        description={`Run by ${actor?.name ?? 'a QA Engineer'} on ${formatDateTime(run.at)}${config ? ` using ${spec?.name ?? ''} v${run.configVersion}` : ''}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copyLink}>
              <Link2 /> Copy link
            </Button>
            <Button onClick={downloadPdf}>
              <Download /> Download PDF
            </Button>
          </div>
        }
      />
      <div className="-mt-2 mb-6 flex flex-wrap items-center gap-2">
        <PassBadge passed={run.passed} />
        <Tag>{RUN_KIND_LABELS[run.kind]}</Tag>
        <span className="font-mono text-caption text-text-muted">{run.id}</span>
      </div>

      {recommended && (
        <section className="card mb-6 flex items-start gap-3 border-indigo p-5 dark:border-indigo-text">
          <Award className="mt-0.5 size-5 shrink-0 text-indigo-text" aria-hidden />
          <div>
            <p className="font-semibold text-text-primary">
              {names(recommended.modelId)} is the recommended model for {project.name}
            </p>
            {recommended.note && <p className="mt-1 text-sm text-text-secondary">{recommended.note}</p>}
            {scope.role !== 'qa' && (
              <Link to={itemPath(scope.role, recommended.modelId)} className="link mt-2 inline-block text-sm">
                See it in the {scope.role === 'user' ? 'marketplace' : 'catalogue'}
              </Link>
            )}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-6">
        {run.load && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Virtual users" value={formatInt(run.load.vus)} />
            <KpiCard label="Peak requests/s" value={formatInt(run.load.rps)} />
            <KpiCard label="Latency p95" value={`${formatInt(run.load.p95)} ms`} />
            <KpiCard label="Error rate" value={`${run.load.errorPct}%`} />
          </div>
        )}

        {run.models.length > 1 ? (
          <>
            <MetricTable summaries={run.models} catalog={catalog} metrics={spec?.metrics} recommendedId={project.recommendation?.modelId} />
            <ComparisonCharts summaries={run.models} catalog={catalog} />
            <SideBySide summaries={run.models} catalog={catalog} />
          </>
        ) : run.models[0] ? (
          <>
            <SummaryKpis s={run.models[0]} />
            <p className="text-sm text-text-secondary">
              {names(run.models[0].modelId)} · quality {qualityScore(run.models[0]).toFixed(2)} · {Math.round(run.models[0].passRate * 100)}% of prompts passed
            </p>
            <PromptTable results={run.models[0].results} />
          </>
        ) : null}

        {spec && run.kind !== 'load' && (
          <section className="card p-6">
            <h2 className="mb-3 font-heading text-h3 text-text-primary">Thresholds used</h2>
            <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
              {spec.metrics.map((m) => (
                <li key={m} className="rounded-control bg-bg-subtle px-3 py-2">
                  <span className="block text-caption text-text-secondary">{METRIC_INFO[m].label}</span>
                  <span className="tabular font-semibold text-text-primary">
                    {METRIC_INFO[m].better === 'higher' ? '≥' : '≤'} {formatMetric(m, spec.thresholds[m])}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  )
}

/** /reports/:id → the viewer's own report path, so one link works for every role. */
export function SharedReportRedirect() {
  const { id } = useParams()
  const user = useCurrentUser()
  if (!user) return <Navigate to="/login" replace state={{ from: `/reports/${id}` }} />
  return <Navigate to={reportPath(user.role, id!)} replace />
}
