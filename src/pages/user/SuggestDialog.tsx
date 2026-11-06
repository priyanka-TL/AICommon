import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckCircle2, GitBranch, Info } from 'lucide-react'
import type { CatalogCategory, Suggestion } from '@/data/types'
import { useAppStore, useCurrentUser } from '@/store/useAppStore'
import { CATEGORY_SINGULAR } from '@/lib/labels'
import { findDuplicate, nameFromRepo, parseGithubUrl } from '@/lib/suggestions'
import { itemPath } from '@/lib/paths'
import { cn, initials } from '@/lib/utils'
import { tintFor } from '@/components/shared/Avatar'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Errors = Partial<Record<'githubUrl' | 'name' | 'description' | 'useCase' | 'docsUrl', string>>

const CATEGORIES = Object.keys(CATEGORY_SINGULAR) as CatalogCategory[]

const validUrl = (s: string) => {
  try {
    return ['https:', 'http:'].includes(new URL(s).protocol)
  } catch {
    return false
  }
}

/** Create a suggestion, or add information to one that needs it. */
export function SuggestDialog({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (o: boolean) => void; existing?: Suggestion }) {
  const user = useCurrentUser()!
  const catalog = useAppStore((s) => s.catalog)
  const suggestions = useAppStore((s) => s.suggestions)
  const submit = useAppStore((s) => s.submitSuggestion)
  const resubmit = useAppStore((s) => s.resubmitSuggestion)
  const [githubUrl, setGithubUrl] = useState('')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [category, setCategory] = useState<CatalogCategory>('agent-framework')
  const [description, setDescription] = useState('')
  const [useCase, setUseCase] = useState('')
  const [licence, setLicence] = useState('')
  const [docsUrl, setDocsUrl] = useState('')
  const [errors, setErrors] = useState<Errors>({})

  useEffect(() => {
    if (!open) return
    setGithubUrl(existing?.githubUrl ?? '')
    setName(existing?.name ?? '')
    setNameTouched(!!existing)
    setCategory(existing?.category ?? 'agent-framework')
    setDescription(existing?.description ?? '')
    setUseCase(existing?.useCase ?? '')
    setLicence(existing?.licence ?? '')
    setDocsUrl(existing?.docsUrl ?? '')
    setErrors({})
  }, [open, existing])

  const parsed = parseGithubUrl(githubUrl)
  const duplicate = useMemo(
    () => (parsed && !existing ? findDuplicate(githubUrl, user.tenantId, catalog, suggestions) : null),
    [parsed, githubUrl, existing, user.tenantId, catalog, suggestions],
  )

  useEffect(() => {
    if (parsed && !nameTouched) setName(nameFromRepo(parsed.repo))
  }, [parsed?.repo, nameTouched])

  const onSubmit = () => {
    const e: Errors = {}
    if (!githubUrl.trim()) e.githubUrl = 'Paste the GitHub repository link.'
    else if (!parsed) e.githubUrl = 'Use a repository link like https://github.com/owner/repo'
    else if (duplicate) e.githubUrl = duplicate.kind === 'available' ? 'This repository is already available in the marketplace.' : 'This repository has already been suggested.'
    if (name.trim().length < 2) e.name = 'Give the capability a name.'
    if (description.trim().length < 10) e.description = 'Describe what it does in a sentence.'
    if (useCase.trim().length < 15) e.useCase = 'Tell your Tenant Admin why your team needs it.'
    if (docsUrl.trim() && !validUrl(docsUrl.trim())) e.docsUrl = 'Enter a full link starting with https://'
    setErrors(e)
    if (Object.values(e).some(Boolean)) return
    const input = { githubUrl: githubUrl.trim(), name: name.trim(), category, description: description.trim(), useCase: useCase.trim(), licence: licence.trim(), docsUrl: docsUrl.trim() }
    if (existing) {
      resubmit(existing.id, input)
      toast.success('Suggestion updated.', { description: 'Your Tenant Admin has been notified.' })
    } else {
      const res = submit(input)
      if (!res.ok) {
        setErrors({ githubUrl: res.error })
        return
      }
      toast.success(`Suggested ${name.trim()}.`, { description: 'Your Tenant Admin reviews it. You’ll get a notification at each step.' })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={existing ? `Add information to ${existing.name}` : 'Suggest a capability'}
          description="Point us to an open-source GitHub repository. Your Tenant Admin reviews it first; nothing is shared with other tenants unless the Super Admin publishes it."
        />
        <DialogBody className="flex flex-col gap-4">
          <Field label="GitHub repository" htmlFor="sg-url" required error={errors.githubUrl} helper="For example: https://github.com/microsoft/autogen">
            <Input
              id="sg-url"
              value={githubUrl}
              onChange={(e) => {
                setGithubUrl(e.target.value)
                setErrors((x) => ({ ...x, githubUrl: undefined }))
              }}
              placeholder="https://github.com/owner/repo"
              className="font-mono"
              disabled={!!existing}
              aria-invalid={!!errors.githubUrl}
            />
          </Field>

          {duplicate && (
            <div className="flex gap-2.5 rounded-control bg-status-pending-bg p-3 text-caption text-status-pending-fg">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                {duplicate.kind === 'available' ? (
                  <>
                    <span className="font-semibold">Already available.</span>{' '}
                    <Link to={itemPath(user.role, duplicate.itemId)} className="underline underline-offset-2" onClick={() => onOpenChange(false)}>
                      Open it in the marketplace
                    </Link>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Already suggested.</span>{' '}
                    {duplicate.visible ? (
                      <Link to="/app/catalog?tab=suggestions" className="underline underline-offset-2" onClick={() => onOpenChange(false)}>
                        See the suggestion
                      </Link>
                    ) : (
                      'It is already being reviewed.'
                    )}
                  </>
                )}
              </p>
            </div>
          )}

          {parsed && !duplicate && (
            <div className="rounded-card border border-border bg-bg-subtle p-4">
              <p className="eyebrow mb-3">Repository preview</p>
              <div className="flex items-center gap-3">
                <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-[10px] text-sm font-bold', tintFor(parsed.owner))} aria-hidden>
                  {initials(nameFromRepo(parsed.repo)) || parsed.repo.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-mono text-sm text-text-primary">
                    <GitBranch className="size-4 shrink-0 text-text-muted" aria-hidden />
                    {parsed.owner}/<span className="font-semibold">{parsed.repo}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-caption text-status-running-fg">
                    <CheckCircle2 className="size-3.5" aria-hidden /> Valid GitHub repository link
                  </p>
                </div>
              </div>
              <p className="mt-3 text-caption text-text-muted">Preview simulated — no GitHub call is made.</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Capability name" htmlFor="sg-name" required error={errors.name}>
              <Input
                id="sg-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setNameTouched(true)
                }}
                aria-invalid={!!errors.name}
              />
            </Field>
            <Field label="Category" htmlFor="sg-cat">
              <Select value={category} onValueChange={(v) => setCategory(v as CatalogCategory)}>
                <SelectTrigger id="sg-cat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_SINGULAR[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Short description" htmlFor="sg-desc" required error={errors.description}>
            <Input id="sg-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it does, in one sentence" aria-invalid={!!errors.description} />
          </Field>
          <Field label="Why your team needs it" htmlFor="sg-use" required error={errors.useCase} helper="Your reviewers use this to decide.">
            <Textarea id="sg-use" value={useCase} onChange={(e) => setUseCase(e.target.value)} placeholder="For example: We want several agents to plan and check lesson content before teachers see it." aria-invalid={!!errors.useCase} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Licence" htmlFor="sg-licence" helper="Optional">
              <Input id="sg-licence" value={licence} onChange={(e) => setLicence(e.target.value)} placeholder="MIT" />
            </Field>
            <Field label="Documentation link" htmlFor="sg-docs" helper="Optional" error={errors.docsUrl}>
              <Input id="sg-docs" value={docsUrl} onChange={(e) => setDocsUrl(e.target.value)} placeholder="https://" aria-invalid={!!errors.docsUrl} />
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={onSubmit} disabled={!!duplicate}>
            {existing ? 'Send updated suggestion' : 'Send suggestion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
