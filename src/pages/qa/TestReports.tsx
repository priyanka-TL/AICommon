import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileBarChart, SearchX, X } from 'lucide-react'
import type { QaRun, QaRunKind } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { formatDate, relativeTime } from '@/lib/format'
import { reportPath } from '@/lib/paths'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchInput } from '@/components/shared/SearchInput'
import { Tag } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PassBadge, useQaData } from './shared'

export const RUN_KIND_LABELS: Record<QaRunKind, string> = {
  single: 'Model test',
  comparison: 'Comparison',
  functional: 'Functional',
  load: 'Load',
}

const ALL = 'all'

export default function TestReports() {
  const loading = useSimulatedLoading()
  const { user, projects, catalog } = useQaData()
  const allRuns = useAppStore((s) => s.qaRuns)
  const users = useAppStore((s) => s.users)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const f = {
    kind: params.get('kind') ?? ALL,
    project: params.get('project') ?? ALL,
    model: params.get('model') ?? ALL,
    result: params.get('result') ?? ALL,
    from: params.get('from') ?? '',
    q: params.get('q') ?? '',
  }
  const active = Object.entries(f).some(([k, v]) => v && v !== ALL && k !== 'q') || !!f.q.trim()
  const set = (k: keyof typeof f, v: string, replace = false) => {
    const next = new URLSearchParams(params)
    if (!v || v === ALL) next.delete(k)
    else next.set(k, v)
    setParams(next, { replace })
  }

  const projectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects])
  const runs = useMemo(() => allRuns.filter((r) => r.tenantId === user.tenantId && projectIds.has(r.projectId)), [allRuns, user.tenantId, projectIds])
  const modelIds = useMemo(() => [...new Set(runs.flatMap((r) => r.models.map((m) => m.modelId)))], [runs])

  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    return runs
      .filter((r) => f.kind === ALL || r.kind === f.kind)
      .filter((r) => f.project === ALL || r.projectId === f.project)
      .filter((r) => f.model === ALL || r.models.some((m) => m.modelId === f.model))
      .filter((r) => f.result === ALL || (f.result === 'passed' ? r.passed : !r.passed))
      .filter((r) => !f.from || r.at.slice(0, 10) >= f.from)
      .filter((r) => !q || r.title.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
      .sort((a, b) => b.at.localeCompare(a.at))
  }, [runs, f.kind, f.project, f.model, f.result, f.from, f.q])

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? ''

  const columns: Column<QaRun>[] = [
    {
      key: 'title',
      header: 'Run',
      cell: (r) => (
        <div className="min-w-0">
          <span className="block truncate font-semibold text-text-primary">{r.title}</span>
          <span className="text-caption text-text-muted">
            {projectName(r.projectId)} · {users.find((u) => u.id === r.actorId)?.name}
          </span>
        </div>
      ),
    },
    { key: 'kind', header: 'Type', cell: (r) => <Tag>{RUN_KIND_LABELS[r.kind]}</Tag> },
    {
      key: 'models',
      header: 'Models',
      cell: (r) => <span className="text-text-secondary">{r.models.length ? r.models.map((m) => catalog.find((c) => c.id === m.modelId)?.name).join(', ') : '—'}</span>,
      className: 'hidden xl:table-cell',
    },
    { key: 'at', header: 'When', cell: (r) => <span className="whitespace-nowrap text-text-secondary" title={formatDate(r.at)}>{relativeTime(r.at)}</span>, className: 'hidden md:table-cell' },
    { key: 'result', header: 'Result', cell: (r) => <PassBadge passed={r.passed} /> },
  ]

  const select = (k: keyof typeof f, label: string, options: [string, string][]) => (
    <Select value={f[k]} onValueChange={(v) => set(k, v)}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <>
      <PageHeader eyebrow="Results" title="Test Reports" description="Every QA run in your projects. Open one to download it or share a link with people in your organisation." />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-[1fr_150px_190px_170px_150px_160px]">
        <SearchInput value={f.q} onChange={(v) => set('q', v, true)} placeholder="Search runs" className="col-span-2 lg:col-span-1" />
        {select('kind', 'Filter by type', [[ALL, 'All types'], ...(Object.keys(RUN_KIND_LABELS) as QaRunKind[]).map((k) => [k, RUN_KIND_LABELS[k]] as [string, string])])}
        {select('project', 'Filter by project', [[ALL, 'All projects'], ...projects.map((p) => [p.id, p.name] as [string, string])])}
        {select('model', 'Filter by model', [[ALL, 'All models'], ...modelIds.map((id) => [id, catalog.find((c) => c.id === id)?.name ?? id] as [string, string])])}
        {select('result', 'Filter by result', [[ALL, 'Any result'], ['passed', 'Passed'], ['failed', 'Did not pass']])}
        <Input type="date" aria-label="Runs from" title="Runs from" value={f.from} onChange={(e) => set('from', e.target.value)} />
      </div>
      {active && (
        <Button variant="ghost" size="compact" className="mb-3" onClick={() => setParams({})}>
          <X /> Clear filters
        </Button>
      )}

      <DataTable
        loading={loading}
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        rowLabel={(r) => `Open report ${r.title}`}
        onRowClick={(r) => navigate(reportPath('qa', r.id))}
        empty={
          active ? (
            <EmptyState icon={SearchX} title="No runs match these filters" action={<Button variant="secondary" onClick={() => setParams({})}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={FileBarChart} title="No runs yet" description="Runs from Model Testing, Model Comparison, Functional and Load Testing appear here." />
          )
        }
        mobileCard={(r) => (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold text-text-primary">{r.title}</span>
              <PassBadge passed={r.passed} />
            </div>
            <span className="text-caption text-text-secondary">
              {RUN_KIND_LABELS[r.kind]} · {projectName(r.projectId)} · {relativeTime(r.at)}
            </span>
          </div>
        )}
      />
    </>
  )
}
