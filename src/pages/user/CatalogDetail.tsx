import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Award, BookOpen, FolderPlus, GitBranch, Lock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore, useCurrentTenant, useCurrentUser } from '@/store/useAppStore'
import { useScopedEnvironments, useScopedProjects, useTenantCatalog } from '@/store/selectors'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { CATEGORY_SINGULAR } from '@/lib/labels'
import { relativeTime } from '@/lib/format'
import { reportPath } from '@/lib/paths'
import { qualityScore } from '@/lib/qa'
import { PageHeader } from '@/components/layout/PageHeader'
import { CatalogStatusBadge, StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { CodeBlock } from '@/components/shared/CodeBlock'
import { costLabel } from '@/components/shared/SelectableCard'
import { ItemMark } from '@/pages/super-admin/Catalog'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import NotFound from '@/pages/NotFound'
import { AddToEnvironmentDialog, useEligibleEnvironments } from './AddToEnvironmentDialog'

export default function CatalogDetail() {
  const { id } = useParams()
  const tenant = useCurrentTenant()!
  const catalog = useTenantCatalog()
  const item = catalog.find((c) => c.id === id)
  const environments = useScopedEnvironments()
  const projects = useScopedProjects(false)
  const addProjectCapability = useAppStore((s) => s.addProjectCapability)
  const eligible = useEligibleEnvironments(item)
  const [addOpen, setAddOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const role = useCurrentUser()?.role
  const readOnly = role === 'qa'
  const users = useAppStore((s) => s.users)
  const qaRuns = useAppStore((s) => s.qaRuns)

  if (!item) return <NotFound message="This item isn’t available to your tenant. It may have been removed or not published to you yet." />

  const allowed = item.enabled
  const usedIn = environments.filter(
    (e) =>
      (e.spec.llms.some((l) => l.id === item.id) || e.spec.asr.includes(item.id) || e.spec.capabilities.includes(item.id)),
  )
  const similar = catalog.filter((c) => c.category === item.category && c.id !== item.id && c.status !== 'deprecated').slice(0, 4)
  const blockedReason =
    item.status === 'deprecated'
      ? 'Deprecated items can’t be added to environments.'
      : !allowed
        ? `${item.name} isn’t enabled for ${tenant.name}. Ask your Tenant Admin to switch it on.`
        : null

  const addButton = (
    <Button onClick={() => setAddOpen(true)} disabled={!!blockedReason}>
      <Plus /> Add to environment
    </Button>
  )

  return (
    <>
      <PageHeader
        eyebrow={CATEGORY_SINGULAR[item.category]}
        title={item.name}
        description={`${item.provider} · ${item.hosting === 'hosted' ? 'Hosted API' : 'Open source'}`}
        actions={
          <>
            {item.docsUrl && (
              <Button asChild variant="secondary">
                <a href={item.docsUrl} target="_blank" rel="noreferrer">
                  <BookOpen /> Documentation
                </a>
              </Button>
            )}
            {item.gitUrl && (
              <Button asChild variant="secondary">
                <a href={item.gitUrl} target="_blank" rel="noreferrer">
                  <GitBranch /> Repository
                </a>
              </Button>
            )}
            {!readOnly && (<>
            <Button
              variant="secondary"
              disabled={!!blockedReason || projects.length === 0}
              onClick={() => {
                setProjectId(projects.find((p) => !p.capabilityIds.includes(item.id))?.id ?? projects[0]?.id ?? '')
                setProjectOpen(true)
              }}
            >
              <FolderPlus /> Add to project
            </Button>
            {blockedReason ? (
              <Tooltip content={blockedReason}>
                <span>{addButton}</span>
              </Tooltip>
            ) : (
              addButton
            )}
            </>)}
          </>
        }
      />

      {projects
        .filter((p) => p.recommendation?.modelId === item.id)
        .map((p) => {
          const rec = p.recommendation!
          const run = qaRuns.find((x) => x.id === rec.runId)
          const s = run?.models.find((m) => m.modelId === item.id)
          return (
            <section key={p.id} className="card mb-6 flex flex-col gap-3 border-indigo p-5 dark:border-indigo-text sm:flex-row sm:items-start">
              <Award className="size-6 shrink-0 text-indigo-text" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="eyebrow">Recommended by QA</p>
                <p className="mt-1 font-semibold text-text-primary">
                  Recommended for {p.name}
                  {run && run.models.length > 1 ? ` after comparing ${run.models.length} models` : ''}
                </p>
                {s && (
                  <p className="tabular mt-1 text-caption text-text-secondary">
                    Quality {qualityScore(s).toFixed(2)} · accuracy {s.accuracy.toFixed(2)} · p95 {s.latencyP95} ms · {s.costCredits.toFixed(3)} credits for the test set
                  </p>
                )}
                {rec.note && <p className="mt-2 border-l-[3px] border-purple pl-3 text-sm italic text-text-primary">{rec.note}</p>}
                <p className="mt-2 text-caption text-text-muted">
                  {users.find((u) => u.id === rec.byId)?.name} · {relativeTime(rec.at)}
                </p>
              </div>
              {run && role && (
                <Button asChild variant="secondary" size="compact">
                  <Link to={reportPath(role, run.id)}>View report</Link>
                </Button>
              )}
            </section>
          )
        })}

      {blockedReason && (
        <div className="mb-6 flex items-center gap-2.5 rounded-card bg-status-stopped-bg px-4 py-3 text-sm text-status-stopped-fg">
          <Lock className="size-4 shrink-0" aria-hidden /> {blockedReason}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="card p-6">
            <div className="mb-5 flex items-center gap-4">
              <ItemMark item={item} className="size-12 text-sm" />
              <div>
                <h2 className="font-heading text-h3 text-text-primary">About</h2>
                <div className="mt-1">
                  <CatalogStatusBadge status={item.status} />
                </div>
              </div>
            </div>
            <p className="text-body text-text-primary">{item.description}</p>
            <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {(
                [
                  ['Provider', item.provider],
                  ['Type', item.hosting === 'hosted' ? 'Hosted API: data is sent to the provider' : 'Open source: runs on platform servers in Bengaluru'],
                  ['Licence', item.licence],
                  ['Cost', costLabel(item)],
                  ['Current version', item.version],
                  ['Languages', item.languages.length ? item.languages.join(', ') : 'Not language-specific'],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="eyebrow">{k}</dt>
                  <dd className="mt-1 text-sm text-text-primary">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card p-6">
            <h2 className="mb-4 font-heading text-h3 text-text-primary">Versions</h2>
            <ul className="divide-y divide-border rounded-control border border-border">
              {item.versions.map((v) => (
                <li key={v} className="flex items-center justify-between gap-3 px-4 py-3">
                  <code className="font-mono text-caption text-text-primary">{v}</code>
                  {v === item.version ? <StatusBadge status="active" label="Current" /> : <Tag>Older, still available</Tag>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-caption text-text-muted">New environments get the current version. Ask your Tenant Admin if you need to pin an older one.</p>
          </section>

          {(item.category === 'llm' || item.category === 'asr') && (
            <section className="card p-6">
              <h2 className="mb-1 font-heading text-h3 text-text-primary">Use it from your code</h2>
              <p className="mb-4 text-caption text-text-secondary">Once it’s attached to an environment, pass this model name to that environment’s endpoint.</p>
              <CodeBlock label="Request body" code={item.category === 'llm' ? `{\n  "model": "${item.version}",\n  "messages": [{ "role": "user", "content": "..." }]\n}` : `model=${item.version}\nlanguage=${(item.languages[0] ?? 'Hindi').slice(0, 2).toLowerCase()}\nfile=@audio.wav`} />
            </section>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <section className="card p-6">
            <h2 className="mb-4 font-heading text-h3 text-text-primary">In your organisation</h2>
            {usedIn.length === 0 ? (
              <p className="text-sm text-text-secondary">None of {tenant.name}’s environments use it yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {usedIn.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3">
                    <Link to={`/app/environments/${e.id}`} className="min-w-0 truncate text-sm font-semibold text-text-primary hover:text-indigo-text">
                      {e.spec.name}
                    </Link>
                    <StatusBadge status={e.status} />
                  </li>
                ))}
              </ul>
            )}
            {!blockedReason && eligible.length > 0 && (
              <p className="mt-4 text-caption text-text-muted">
                It can be added to {eligible.length} environment{eligible.length > 1 ? 's' : ''}.
              </p>
            )}
          </section>

          {similar.length > 0 && (
            <section className="card p-6">
              <h2 className="mb-4 font-heading text-h3 text-text-primary">Similar in the catalog</h2>
              <ul className="flex flex-col gap-3">
                {similar.map((c) => (
                  <li key={c.id}>
                    <Link to={`/app/catalog/${c.id}`} className="flex items-center gap-3 rounded-control p-1 hover:bg-bg-subtle">
                      <ItemMark item={c} className="size-8" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-text-primary">{c.name}</span>
                        <span className="block truncate text-caption text-text-muted">
                          {c.provider} · {c.hosting === 'hosted' ? 'Hosted API' : 'Open source'}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <AddToEnvironmentDialog item={item} open={addOpen} onOpenChange={setAddOpen} />
      <Dialog open={projectOpen} onOpenChange={setProjectOpen}>
        <DialogContent size="sm">
          <DialogHeader title={`Add ${item.name} to a project`} description="Project members see it in the project’s toolset. Adding it doesn’t need approval." />
          <DialogBody>
            <Field label="Project" htmlFor="ap-project">
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="ap-project">
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id} disabled={p.capabilityIds.includes(item.id)}>
                      {p.name}
                      {p.capabilityIds.includes(item.id) ? ' · already added' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              disabled={!projectId}
              onClick={() => {
                const res = addProjectCapability(projectId, item.id)
                if (!res.ok) {
                  toast.error(res.error)
                  return
                }
                toast.success(`Added ${item.name} to ${projects.find((p) => p.id === projectId)?.name}.`)
                setProjectOpen(false)
              }}
            >
              Add to project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
