import type { Project, ProjectAccess, ProjectType, Runtime, User } from '@/data/types'
import type { ProjectInput } from '@/store/useAppStore'
import { RUNTIMES } from '@/lib/deploy'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/controls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar } from '@/components/shared/Avatar'

export const PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: 'api', label: 'API' },
  { value: 'web', label: 'Web app' },
  { value: 'agent', label: 'AI agent' },
  { value: 'pipeline', label: 'Data pipeline' },
  { value: 'other', label: 'Other' },
]
export const projectTypeLabel = (t: ProjectType) => PROJECT_TYPES.find((x) => x.value === t)?.label ?? 'Other'

export const ACCESS_LABELS: Record<ProjectAccess, string> = { viewer: 'Viewer', editor: 'Editor' }

export const emptyProjectInput = (): ProjectInput => ({
  name: '',
  description: '',
  type: 'api',
  repoUrl: '',
  defaultBranch: 'main',
  defaultRuntime: 'node',
  defaultRuntimeVersion: '20',
  memberIds: [],
  memberAccess: {},
})

export const projectToInput = (p: Project): ProjectInput => ({
  name: p.name,
  description: p.description,
  type: p.type,
  repoUrl: p.repoUrl,
  defaultBranch: p.defaultBranch,
  defaultRuntime: p.defaultRuntime,
  defaultRuntimeVersion: p.defaultRuntimeVersion,
  memberIds: p.memberIds,
  memberAccess: p.memberAccess,
})

/**
 * The one form for creating and editing a project. `compact` leaves out the repository and members
 * (used when creating a project from an environment).
 */
export function ProjectForm({
  value,
  onChange,
  error,
  people,
  ownerId,
  compact,
  disabled,
  idPrefix = 'pj',
}: {
  value: ProjectInput
  onChange: (v: ProjectInput) => void
  error?: string | null
  /** Active people in the organisation who can be added as members. */
  people: User[]
  ownerId?: string
  compact?: boolean
  disabled?: boolean
  idPrefix?: string
}) {
  const set = (patch: Partial<ProjectInput>) => onChange({ ...value, ...patch })
  const runtime = RUNTIMES.find((r) => r.value === value.defaultRuntime)!
  const nameError = error && /name/i.test(error) ? error : null
  const repoError = error && /Git URL|repository/i.test(error) ? error : null
  const candidates = people.filter((u) => u.id !== ownerId)

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-4">
      <Field label="Name" htmlFor={`${idPrefix}-name`} required error={nameError} helper={!nameError ? 'Unique within your organisation.' : undefined}>
        <Input id={`${idPrefix}-name`} value={value.name} onChange={(e) => set({ name: e.target.value })} aria-invalid={!!nameError} maxLength={60} />
      </Field>
      <Field label="Description" htmlFor={`${idPrefix}-desc`}>
        <Textarea id={`${idPrefix}-desc`} value={value.description} onChange={(e) => set({ description: e.target.value })} className="min-h-[64px]" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Project type" htmlFor={`${idPrefix}-type`}>
          <Select value={value.type} onValueChange={(v) => set({ type: v as ProjectType })} disabled={disabled}>
            <SelectTrigger id={`${idPrefix}-type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Default runtime" htmlFor={`${idPrefix}-runtime`}>
          <Select
            value={value.defaultRuntime}
            onValueChange={(v) => {
              const r = RUNTIMES.find((x) => x.value === v)!
              set({ defaultRuntime: v as Runtime, defaultRuntimeVersion: r.versions[1] ?? r.versions[0] ?? '' })
            }}
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-runtime`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RUNTIMES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {runtime.versions.length > 0 && (
          <Field label="Version" htmlFor={`${idPrefix}-version`}>
            <Select value={value.defaultRuntimeVersion} onValueChange={(v) => set({ defaultRuntimeVersion: v })} disabled={disabled}>
              <SelectTrigger id={`${idPrefix}-version`}>
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {runtime.versions.map((v) => (
                  <SelectItem key={v} value={v}>
                    {runtime.label} {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>
      {!compact && (
        <>
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <Field label="Repository URL" htmlFor={`${idPrefix}-repo`} error={repoError} helper={!repoError ? 'Optional. Used as the default source when you deploy.' : undefined}>
              <Input id={`${idPrefix}-repo`} value={value.repoUrl} onChange={(e) => set({ repoUrl: e.target.value })} placeholder="https://github.com/org/repo.git" className="font-mono text-caption" aria-invalid={!!repoError} />
            </Field>
            <Field label="Default branch" htmlFor={`${idPrefix}-branch`}>
              <Input id={`${idPrefix}-branch`} value={value.defaultBranch} onChange={(e) => set({ defaultBranch: e.target.value })} className="font-mono text-caption" />
            </Field>
          </div>
          <Field label="Members" helper="Editors can change the project and deploy it. Viewers can see it and its environments.">
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-control border border-border p-2">
              {candidates.length === 0 && <li className="px-2 py-1.5 text-caption text-text-secondary">No one else in your organisation yet.</li>}
              {candidates.map((u) => {
                const on = value.memberIds.includes(u.id)
                return (
                  <li key={u.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-bg-subtle">
                    <Checkbox
                      checked={on}
                      onCheckedChange={(c) =>
                        set(
                          c
                            ? { memberIds: [...value.memberIds, u.id], memberAccess: { ...value.memberAccess, [u.id]: value.memberAccess[u.id] ?? 'viewer' } }
                            : { memberIds: value.memberIds.filter((m) => m !== u.id) },
                        )
                      }
                      aria-label={`Add ${u.name}`}
                    />
                    <Avatar name={u.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-primary">{u.name}</span>
                      <span className="block truncate text-caption text-text-muted">{u.title}</span>
                    </span>
                    {on && (
                      <Select value={value.memberAccess[u.id] ?? 'viewer'} onValueChange={(v) => set({ memberAccess: { ...value.memberAccess, [u.id]: v as ProjectAccess } })} disabled={disabled}>
                        <SelectTrigger className="h-8 w-28 text-caption" aria-label={`${u.name}’s access`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </li>
                )
              })}
            </ul>
          </Field>
        </>
      )}
      {error && !nameError && !repoError && <p className="text-caption text-red-text">{error}</p>}
    </fieldset>
  )
}
