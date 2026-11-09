import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { useAppStore, type ProjectInput } from '@/store/useAppStore'
import { useScope } from '@/store/selectors'
import { projectPath, projectsPath } from '@/lib/paths'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { emptyProjectInput, ProjectForm } from '@/components/projects/ProjectForm'
import NotFound from '@/pages/NotFound'

export default function NewProject() {
  const scope = useScope()!
  const users = useAppStore((s) => s.users)
  const createProject = useAppStore((s) => s.createProject)
  const navigate = useNavigate()
  const [draft, setDraft] = useState<ProjectInput>(emptyProjectInput)
  const [error, setError] = useState<string | null>(null)

  if (scope.role !== 'user' && scope.role !== 'tenant_admin') return <NotFound message="Projects are created by people in an organisation." />

  const submit = () => {
    const r = createProject(draft)
    if (!r.ok) return setError(r.error)
    toast.success(`Created ${draft.name.trim()}.`, { description: 'Add its capabilities and models, then deploy it to an environment.' })
    navigate(projectPath(scope.role, r.id!, 'capabilities'))
  }

  return (
    <>
      <PageHeader eyebrow="Projects" title="Create project" description="A project is your code plus the capabilities and models it uses. You can deploy it to any Active environment later." />
      <section className="card max-w-3xl p-6">
        <ProjectForm
          value={draft}
          onChange={(v) => {
            setDraft(v)
            setError(null)
          }}
          error={error}
          people={users.filter((u) => u.tenantId === scope.user.tenantId && u.status === 'active' && (u.role === 'user' || u.role === 'tenant_admin'))}
          ownerId={scope.user.id}
        />
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={() => navigate(projectsPath(scope.role))}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <Plus /> Create project
          </Button>
        </div>
      </section>
    </>
  )
}
