import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Archive, ArchiveRestore, Copy, PencilLine, Plus, SearchX, SlidersHorizontal } from 'lucide-react'
import type { TestConfig } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { formatDateTime, relativeTime } from '@/lib/format'
import { currentSpec, currentVersion, METRIC_INFO, SCHEDULE_LABELS, TEST_TYPE_LABELS } from '@/lib/qa'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchInput } from '@/components/shared/SearchInput'
import { RowActions } from '@/components/shared/RowActions'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/controls'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/dialog'
import { ConfigFormDialog } from './ConfigFormDialog'
import { useQaData } from './shared'

export default function TestConfigurations() {
  const loading = useSimulatedLoading()
  const { configs, projects, datasets } = useQaData()
  const users = useAppStore((s) => s.users)
  const qaRuns = useAppStore((s) => s.qaRuns)
  const duplicate = useAppStore((s) => s.duplicateTestConfig)
  const setArchived = useAppStore((s) => s.setTestConfigArchived)
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TestConfig | undefined>()
  const [archiving, setArchiving] = useState<TestConfig | null>(null)
  const selected = configs.find((c) => c.id === params.get('id')) ?? null

  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing(undefined)
      setFormOpen(true)
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  const lastRun = (id: string) => qaRuns.find((r) => r.configId === id)
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '—'

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return configs
      .filter((c) => showArchived || !c.archived)
      .filter((c) => !q || [currentSpec(c).name, projectName(currentSpec(c).projectId)].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => b.versions[b.versions.length - 1]!.at.localeCompare(a.versions[a.versions.length - 1]!.at))
  }, [configs, showArchived, query, projects])

  const open = (c: TestConfig) => setParams({ id: c.id })
  const edit = (c: TestConfig) => {
    setEditing(c)
    setFormOpen(true)
  }
  const copy = (c: TestConfig) => {
    const res = duplicate(c.id)
    if (res.ok) {
      toast.success(`Copied ${currentSpec(c).name}.`)
      setParams({ id: res.id! })
    } else toast.error(res.error)
  }

  const actions = (c: TestConfig) => [
    !c.archived && { label: 'Edit (new version)', icon: PencilLine, onSelect: () => edit(c) },
    { label: 'Duplicate', icon: Copy, onSelect: () => copy(c) },
    c.archived
      ? { label: 'Restore', icon: ArchiveRestore, onSelect: () => { setArchived(c.id, false); toast.success(`Restored ${currentSpec(c).name}.`) } }
      : { label: 'Archive', icon: Archive, onSelect: () => setArchiving(c), destructive: true, separatorBefore: true },
  ]

  const columns: Column<TestConfig>[] = [
    {
      key: 'name',
      header: 'Configuration',
      cell: (c) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-text-primary">{currentSpec(c).name}</span>
            {c.archived && <StatusBadge status="stopped" label="Archived" />}
          </div>
          <span className="text-caption text-text-muted">{projectName(currentSpec(c).projectId)}</span>
        </div>
      ),
    },
    { key: 'type', header: 'Type', cell: (c) => <Tag>{TEST_TYPE_LABELS[currentSpec(c).type]}</Tag> },
    { key: 'dataset', header: 'Dataset', cell: (c) => <span className="text-text-secondary">{datasets.find((d) => d.id === currentSpec(c).datasetId)?.name ?? '—'}</span>, className: 'hidden xl:table-cell' },
    { key: 'version', header: 'Version', cell: (c) => <span className="tabular text-text-secondary">v{currentVersion(c)}</span>, className: 'hidden md:table-cell' },
    { key: 'schedule', header: 'Schedule', cell: (c) => <span className="text-text-secondary">{SCHEDULE_LABELS[currentSpec(c).schedule]}</span>, className: 'hidden lg:table-cell' },
    {
      key: 'last',
      header: 'Last run',
      cell: (c) => {
        const r = lastRun(c.id)
        return r ? <span className="text-text-secondary">{relativeTime(r.at)}</span> : <span className="text-text-muted">Not run yet</span>
      },
      className: 'hidden lg:table-cell',
    },
    { key: 'actions', header: '', className: 'w-12', cell: (c) => <RowActions label={currentSpec(c).name} actions={actions(c)} /> },
  ]

  const spec = selected ? currentSpec(selected) : null

  return (
    <>
      <PageHeader
        eyebrow="Models"
        title="Test Configurations"
        description="Reusable, versioned settings: dataset, model parameters, metrics and thresholds, load profile and schedule."
        actions={
          <Button onClick={() => { setEditing(undefined); setFormOpen(true) }} disabled={!projects.length}>
            <Plus /> New configuration
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by name or project" className="flex-1" />
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-caption font-semibold text-text-secondary">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Show archived" /> Show archived
        </label>
      </div>

      <DataTable
        loading={loading}
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        rowLabel={(c) => `Open configuration ${currentSpec(c).name}`}
        onRowClick={open}
        empty={
          query ? (
            <EmptyState icon={SearchX} title="No configurations match" action={<Button variant="secondary" onClick={() => setQuery('')}>Clear search</Button>} />
          ) : (
            <EmptyState icon={SlidersHorizontal} title="No configurations yet" description="Create one to reuse the same test set and thresholds across runs." />
          )
        }
        mobileCard={(c) => (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold text-text-primary">{currentSpec(c).name}</span>
              <Tag>{TEST_TYPE_LABELS[currentSpec(c).type]}</Tag>
            </div>
            <span className="text-caption text-text-secondary">
              {projectName(currentSpec(c).projectId)} · v{currentVersion(c)} · {SCHEDULE_LABELS[currentSpec(c).schedule]}
            </span>
          </div>
        )}
      />

      <Sheet open={!!selected} onOpenChange={(o) => !o && setParams({})}>
        <SheetContent>
          {selected && spec && (
            <>
              <div className="border-b border-border px-6 pb-5 pr-14 pt-6">
                <p className="eyebrow">{projectName(spec.projectId)}</p>
                <SheetTitle className="mt-1 font-heading text-h2 text-text-primary">{spec.name}</SheetTitle>
                <SheetDescription className="sr-only">Configuration details and version history</SheetDescription>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Tag>{TEST_TYPE_LABELS[spec.type]}</Tag>
                  <Tag>v{currentVersion(selected)}</Tag>
                  {selected.archived && <StatusBadge status="stopped" label="Archived" />}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  {(
                    [
                      ['Dataset', datasets.find((d) => d.id === spec.datasetId)?.name ?? '—'],
                      ['Languages', spec.languages.join(', ')],
                      ['Temperature', spec.temperature.toFixed(1)],
                      ['Max tokens', String(spec.maxTokens)],
                      ['Schedule', SCHEDULE_LABELS[spec.schedule]],
                      ['Notify on failure', spec.notifyOnFailure ? 'Yes' : 'No'],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k}>
                      <dt className="eyebrow">{k}</dt>
                      <dd className="mt-1 text-text-primary">{v}</dd>
                    </div>
                  ))}
                </dl>
                <section>
                  <p className="eyebrow mb-2">System prompt</p>
                  <p className="rounded-control bg-bg-subtle px-3 py-2 text-sm text-text-primary">{spec.systemPrompt}</p>
                </section>
                {spec.type === 'load' && spec.load ? (
                  <section>
                    <p className="eyebrow mb-2">Load profile</p>
                    <p className="text-sm text-text-primary">
                      {spec.load.vus} virtual users · {spec.load.rampUpSec}s ramp-up · {spec.load.durationMin} min · target {spec.load.targetRps} requests/s
                    </p>
                  </section>
                ) : (
                  <section>
                    <p className="eyebrow mb-2">Pass thresholds</p>
                    <ul className="flex flex-col gap-1 text-sm">
                      {spec.metrics.map((m) => (
                        <li key={m} className="flex justify-between gap-3">
                          <span className="text-text-secondary">{METRIC_INFO[m].label}</span>
                          <span className="tabular text-text-primary">
                            {METRIC_INFO[m].better === 'higher' ? '≥' : '≤'} {m === 'latencyP95' ? `${spec.thresholds[m]} ms` : spec.thresholds[m]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <section>
                  <p className="eyebrow mb-3">Version history</p>
                  <ol className="flex flex-col gap-3" aria-label="Version history">
                    {[...selected.versions].reverse().map((v) => (
                      <li key={v.version} className="flex gap-3 text-sm">
                        <span className="tabular mt-0.5 shrink-0 rounded-full bg-indigo-50 px-2 text-xs font-semibold leading-5 text-indigo-text">v{v.version}</span>
                        <div className="min-w-0">
                          <p className="text-text-primary">{v.summary}</p>
                          <p className="text-caption text-text-muted">
                            {users.find((u) => u.id === v.byId)?.name} · {formatDateTime(v.at)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border px-6 py-4">
                {!selected.archived && (
                  <Button onClick={() => edit(selected)}>
                    <PencilLine /> Edit
                  </Button>
                )}
                <Button variant="secondary" onClick={() => copy(selected)}>
                  <Copy /> Duplicate
                </Button>
                {selected.archived ? (
                  <Button variant="ghost" onClick={() => { setArchived(selected.id, false); toast.success(`Restored ${spec.name}.`) }}>
                    <ArchiveRestore /> Restore
                  </Button>
                ) : (
                  <Button variant="ghost" className="text-red-text hover:text-red-text" onClick={() => setArchiving(selected)}>
                    <Archive /> Archive
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ConfigFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={(id) => setParams({ id })} />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={`Archive ${archiving ? currentSpec(archiving).name : ''}?`}
        description="It stops showing in pickers and scheduled runs stop. Past reports stay. You can restore it from Show archived."
        confirmLabel="Archive configuration"
        destructive
        onConfirm={() => {
          if (!archiving) return
          setArchived(archiving.id, true)
          toast.success(`Archived ${currentSpec(archiving).name}.`)
          setArchiving(null)
          setParams({})
        }}
      />
    </>
  )
}
