import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Award, BrainCircuit, CheckCircle2, FileBarChart, FolderKanban, Scale, SlidersHorizontal } from 'lucide-react'
import { useAppStore, useSessionStore } from '@/store/useAppStore'
import { useScopedEnvironments } from '@/store/selectors'
import { relativeTime } from '@/lib/format'
import { computeLabel } from '@/lib/labels'
import { envPath, reportPath } from '@/lib/paths'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCard } from '@/components/shared/KpiCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { PassBadge, useQaData } from './shared'
import { RUN_KIND_LABELS } from './TestReports'

const WEEK = 7 * 86_400_000

export default function QaDashboard() {
  const { user, tenant, projects, configs, catalog } = useQaData()
  const environments = useScopedEnvironments()
  const qaRuns = useAppStore((s) => s.qaRuns)
  const tenantWide = useSessionStore((s) => s.qaTenantWide)
  const projectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects])
  const runs = useMemo(() => qaRuns.filter((r) => r.tenantId === user.tenantId && projectIds.has(r.projectId)).sort((a, b) => b.at.localeCompare(a.at)), [qaRuns, user.tenantId, projectIds])
  const thisWeek = runs.filter((r) => Date.now() - new Date(r.at).getTime() < WEEK)
  const passRate = runs.length ? Math.round((runs.filter((r) => r.passed).length / runs.length) * 100) : 0
  const recommended = projects.filter((p) => p.recommendation)
  const name = (id: string) => catalog.find((c) => c.id === id)?.name ?? id

  return (
    <>
      <PageHeader
        eyebrow={`${tenant?.name ?? ''} · QA`}
        title={`Hello, ${user.name.split(' ')[0]}`}
        description={tenantWide ? 'You’re viewing every project in your organisation.' : 'The projects you test, their Active environments and your latest runs.'}
        actions={
          <Button asChild>
            <Link to="/qa/comparison">
              <Scale /> Compare models
            </Link>
          </Button>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Runs this week" value={String(thisWeek.length)} icon={FileBarChart} />
        <KpiCard label="Pass rate" value={runs.length ? `${passRate}%` : '—'} icon={CheckCircle2} trend={{ direction: 'flat', text: `across ${runs.length} runs` }} />
        <KpiCard label="Configurations" value={String(configs.filter((c) => !c.archived).length)} icon={SlidersHorizontal} />
        <KpiCard label="Recommended models" value={`${recommended.length} of ${projects.length}`} icon={Award} trend={{ direction: 'flat', text: 'projects with a pick' }} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-w-0">
          <h2 className="mb-3 font-heading text-h2 text-text-primary">Your projects</h2>
          {projects.length === 0 ? (
            <div className="card">
              <EmptyState icon={FolderKanban} title="You aren’t assigned to any project yet" description="Ask your Tenant Admin to add you to the projects you should test." />
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {projects.map((p) => {
                const envs = environments.filter((e) => e.projectId === p.id)
                return (
                  <li key={p.id} className="card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-heading text-h3 text-text-primary">{p.name}</p>
                        <p className="mt-0.5 text-caption text-text-secondary">{p.description}</p>
                      </div>
                      {p.recommendation ? (
                        <Link to={reportPath('qa', p.recommendation.runId)} className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-caption font-semibold text-indigo-text">
                          <Award className="size-3.5" aria-hidden /> Recommended: {name(p.recommendation.modelId)}
                        </Link>
                      ) : (
                        <Link to={`/qa/comparison?project=${p.id}`} className="link text-caption">
                          No recommended model yet
                        </Link>
                      )}
                    </div>
                    <p className="eyebrow mb-2 mt-4">Active environments</p>
                    {envs.length === 0 ? (
                      <p className="text-sm text-text-muted">None running right now.</p>
                    ) : (
                      <ul className="divide-y divide-border rounded-control border border-border">
                        {envs.map((e) => (
                          <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                            <Link to={envPath('qa', e.id)} className="min-w-0 truncate text-sm font-semibold text-text-primary hover:text-indigo-text">
                              {e.spec.name}
                            </Link>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="hidden text-caption text-text-muted sm:inline">{computeLabel(e.spec.compute)}</span>
                              <StatusBadge status={e.status} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button asChild variant="secondary" size="compact">
                        <Link to={`/qa/model-testing?project=${p.id}`}>
                          <BrainCircuit /> Test a model
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="compact">
                        <Link to={`/qa/reports?project=${p.id}`}>
                          <FileBarChart /> Reports
                        </Link>
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="min-w-0">
          <h2 className="mb-3 font-heading text-h2 text-text-primary">Recent runs</h2>
          <div className="card">
            {runs.length === 0 ? (
              <EmptyState icon={FileBarChart} title="No runs yet" description="Your test and comparison runs show up here." />
            ) : (
              <ul className="divide-y divide-border">
                {runs.slice(0, 6).map((r) => (
                  <li key={r.id}>
                    <Link to={reportPath('qa', r.id)} className="flex items-start justify-between gap-3 px-5 py-3.5 hover:bg-bg-subtle">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-text-primary">{r.title}</span>
                        <span className="text-caption text-text-muted">
                          {RUN_KIND_LABELS[r.kind]} · {relativeTime(r.at)}
                        </span>
                      </span>
                      <PassBadge passed={r.passed} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
