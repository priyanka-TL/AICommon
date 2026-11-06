import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Archive, ArchiveRestore, FolderKanban, Pencil, Plus, Server, X } from 'lucide-react'
import type { Project } from '@/data/types'
import { useAppStore, useCurrentTenant } from '@/store/useAppStore'
import { useScopedEnvironments, useScopedProjects, useScopedUsers } from '@/store/selectors'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { formatDate } from '@/lib/format'
import { projectAllocated, RESOURCES, ZERO } from '@/lib/quota'
import { envPath } from '@/lib/paths'
import { CATEGORY_SINGULAR } from '@/lib/labels'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Avatar } from '@/components/shared/Avatar'
import { ResourceQuota } from '@/components/shared/ResourceQuota'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/controls'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import NotFound from '@/pages/NotFound'

function ProjectFormDialog({ open, onOpenChange, project }: { open: boolean; onOpenChange: (o: boolean) => void; project?: Project }) {
  const users = useScopedUsers().filter((u) => u.status === 'active')
  const createProject = useAppStore((s) => s.createProject)
  const updateProject = useAppStore((s) => s.updateProject)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(project?.name ?? '')
    setDescription(project?.description ?? '')
    setMembers(project?.memberIds ?? [])
    setError(null)
  }, [open, project])

  const submit = () => {
    if (name.trim().length < 3) {
      setError('Give the project a name of at least 3 characters.')
      return
    }
    if (project) {
      updateProject(project.id, { name: name.trim(), description: description.trim(), memberIds: members })
      toast.success(`Saved ${name.trim()}.`)
    } else {
      const id = createProject({ name: name.trim(), description: description.trim(), memberIds: members, limits: ZERO })
      toast.success(`Created ${name.trim()}.`, { description: 'Set its resource limits on the Quotas & Usage page.' })
      if (id) navigate(`/tenant-admin/projects/${id}`)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader title={project ? `Edit ${project.name}` : 'Create project'} description="Members can request environments for the project and see its environments." />
        <DialogBody className="flex flex-col gap-4">
          <Field label="Name" htmlFor="pj-name" required error={error}>
            <Input id="pj-name" value={name} onChange={(e) => { setName(e.target.value); setError(null) }} aria-invalid={!!error} />
          </Field>
          <Field label="Description" htmlFor="pj-desc">
            <Textarea id="pj-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[64px]" />
          </Field>
          <Field label="Members">
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-control border border-border p-2">
              {users.map((u) => (
                <label key={u.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-bg-subtle">
                  <Checkbox checked={members.includes(u.id)} onCheckedChange={(v) => setMembers(v ? [...members, u.id] : members.filter((m) => m !== u.id))} />
                  <Avatar name={u.name} size="sm" />
                  <span className="text-sm text-text-primary">{u.name}</span>
                  <span className="text-caption text-text-muted">{u.title}</span>
                </label>
              ))}
            </div>
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={submit}>{project ? 'Save project' : 'Create project'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function Projects() {
  const loading = useSimulatedLoading()
  const tenant = useCurrentTenant()!
  const projects = useScopedProjects()
  const environments = useScopedEnvironments()
  const users = useAppStore((s) => s.users)
  const [formOpen, setFormOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const rows = projects.filter((p) => showArchived || p.status === 'active')

  return (
    <>
      <PageHeader
        eyebrow={tenant.name}
        title="Projects"
        description="Group people and environments by programme. Every environment belongs to a project."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus /> Create project
          </Button>
        }
      />
      <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 text-caption font-semibold text-text-secondary">
        <Checkbox checked={showArchived} onCheckedChange={(v) => setShowArchived(!!v)} /> Show archived projects
      </label>
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-card" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={FolderKanban} title="No projects yet" description="Create a project to start requesting environments." />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const envs = environments.filter((e) => e.projectId === p.id)
            return (
              <Link key={p.id} to={`/tenant-admin/projects/${p.id}`} className="card card-interactive flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-heading text-h3 text-text-primary">{p.name}</h2>
                  {p.status === 'archived' && <StatusBadge status="stopped" label="Archived" />}
                </div>
                <p className="line-clamp-2 text-caption text-text-secondary">{p.description}</p>
                <div className="flex -space-x-2">
                  {p.memberIds.slice(0, 5).map((m) => (
                    <Avatar key={m} name={users.find((u) => u.id === m)?.name ?? '?'} size="sm" className="ring-2 ring-bg-surface" />
                  ))}
                </div>
                <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3 text-caption text-text-secondary">
                  <span>{p.memberIds.length} members</span>
                  <span>· {envs.length} environments</span>
                  <span>· {envs.filter((e) => e.status === 'active').length} active</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
      <ProjectFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </>
  )
}

export function ProjectDetail() {
  const { id } = useParams()
  const projects = useScopedProjects()
  const project = projects.find((p) => p.id === id)
  const environments = useScopedEnvironments(true)
  const allEnvs = useAppStore((s) => s.environments)
  const users = useAppStore((s) => s.users)
  const catalog = useAppStore((s) => s.catalog)
  const updateProject = useAppStore((s) => s.updateProject)
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const envs = useMemo(() => environments.filter((e) => e.projectId === id), [environments, id])

  if (!project) return <NotFound message="This project doesn’t exist in your tenant." />
  const used = projectAllocated(allEnvs, project.id)
  const hasLimits = RESOURCES.some((r) => project.limits[r.key] > 0)

  return (
    <>
      <PageHeader
        eyebrow={`Project · created ${formatDate(project.createdAt)}`}
        title={project.name}
        description={project.description}
        actions={
          <>
            {project.status === 'active' ? (
              <Button variant="ghost" className="text-red-text hover:text-red-text" onClick={() => setArchiveOpen(true)}>
                <Archive /> Archive
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => { updateProject(project.id, { status: 'active' }); toast.success(`${project.name} restored.`) }}>
                <ArchiveRestore /> Restore
              </Button>
            )}
            <Button onClick={() => setEditOpen(true)}>
              <Pencil /> Edit project
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="card p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-heading text-h3 text-text-primary">Environments ({envs.length})</h2>
            </div>
            {envs.length === 0 ? (
              <p className="text-sm text-text-secondary">No environments in this project yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {envs.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                    <Link to={envPath('tenant_admin', e.id)} className="flex min-w-0 items-center gap-2 font-semibold text-text-primary hover:text-indigo-text">
                      <Server className="size-4 shrink-0 text-text-muted" aria-hidden /> <span className="truncate">{e.spec.name}</span>
                    </Link>
                    <StatusBadge status={e.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card p-6">
            <h2 className="mb-1 font-heading text-h3 text-text-primary">Resource limits</h2>
            <p className="mb-4 text-caption text-text-secondary">{hasLimits ? 'This project’s share of the tenant quota.' : 'No limits set. Split the tenant quota on the Quotas & Usage page.'}</p>
            {hasLimits && <ResourceQuota compact used={used} total={project.limits} className="sm:grid-cols-2" />}
          </section>
        </div>
        <div className="flex flex-col gap-6">
          <section className="card p-6">
            <h2 className="mb-4 font-heading text-h3 text-text-primary">Members ({project.memberIds.length})</h2>
            <ul className="flex flex-col gap-3">
              {project.memberIds.map((m) => {
                const u = users.find((x) => x.id === m)
                if (!u) return null
                return (
                  <li key={m} className="flex items-center gap-3">
                    <Avatar name={u.name} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{u.name}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${u.name}`}
                      onClick={() => {
                        updateProject(project.id, { memberIds: project.memberIds.filter((x) => x !== m) })
                        toast.success(`Removed ${u.name} from ${project.name}.`)
                      }}
                    >
                      <X />
                    </Button>
                  </li>
                )
              })}
            </ul>
            <Button variant="secondary" size="compact" className="mt-4" onClick={() => setEditOpen(true)}>
              <Plus /> Add members
            </Button>
          </section>
          <section className="card p-6">
            <h2 className="mb-4 font-heading text-h3 text-text-primary">Project capabilities</h2>
            {project.capabilityIds.length === 0 ? (
              <p className="text-sm text-text-secondary">None yet. Members can add them from the marketplace.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {project.capabilityIds.map((c) => {
                  const it = catalog.find((x) => x.id === c)
                  return it ? <Tag key={c}>{it.name} · {CATEGORY_SINGULAR[it.category]}</Tag> : null
                })}
              </div>
            )}
          </section>
        </div>
      </div>
      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={project} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archive ${project.name}?`}
        description="No one can request new environments for it. Existing environments keep running. You can restore it later."
        confirmLabel="Archive project"
        destructive
        onConfirm={() => {
          updateProject(project.id, { status: 'archived' })
          toast.success(`${project.name} archived.`)
        }}
      />
    </>
  )
}

