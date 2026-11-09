import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, GitBranch, Globe2, PencilLine } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useScope } from '@/store/selectors'
import { formatDate, relativeTime } from '@/lib/format'
import { CATEGORY_SINGULAR } from '@/lib/labels'
import { itemPath, suggestionsPath } from '@/lib/paths'
import { PageHeader } from '@/components/layout/PageHeader'
import { SuggestionBadge, Tag } from '@/components/shared/StatusBadge'
import { SuggestionHistory } from '@/components/shared/SuggestionReview'
import { Button } from '@/components/ui/button'
import { SuggestDialog } from './SuggestDialog'
import NotFound from '@/pages/NotFound'

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="mb-4 font-heading text-h3 text-text-primary">{title}</h2>
      {children}
    </section>
  )
}

export default function SuggestionDetail() {
  const { id } = useParams()
  const scope = useScope()!
  const s = useAppStore((st) => st.suggestions.find((x) => x.id === id))
  const tenant = useAppStore((st) => st.tenants.find((t) => t.id === s?.tenantId))
  const [editOpen, setEditOpen] = useState(false)

  if (!s || s.suggestedById !== scope.user.id || s.tenantId !== scope.user.tenantId) {
    return <NotFound message="This suggestion doesn’t exist or is outside what you can see." />
  }

  const inMarketplace = s.catalogItemId && (s.status === 'approved_tenant' || s.status === 'published')

  return (
    <>
      <Link to={suggestionsPath('user')} className="link mb-4 inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" aria-hidden /> My requests
      </Link>
      <PageHeader
        eyebrow="Capability suggestion"
        title={s.name}
        description={`Suggested ${formatDate(s.createdAt)} for ${tenant?.name}. Your Tenant Admin reviews it first.`}
        actions={
          s.status === 'needs_info' ? (
            <Button onClick={() => setEditOpen(true)}>
              <PencilLine /> Add information
            </Button>
          ) : inMarketplace ? (
            <Button asChild variant="secondary">
              <Link to={itemPath('user', s.catalogItemId!)}>Open in the marketplace</Link>
            </Button>
          ) : undefined
        }
      />
      <div className="-mt-2 mb-6 flex flex-wrap items-center gap-2">
        <SuggestionBadge status={s.status} forwarded={s.forwarded} />
        <Tag>{CATEGORY_SINGULAR[s.category]}</Tag>
        <span className="font-mono text-caption text-text-muted">{s.id}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <Card title="Repository">
            <a href={s.githubUrl} target="_blank" rel="noreferrer" className="link flex items-center gap-2 break-all font-mono text-caption">
              <GitBranch className="size-4 shrink-0" aria-hidden /> {s.githubUrl.replace('https://', '')} <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            </a>
            {s.docsUrl && (
              <a href={s.docsUrl} target="_blank" rel="noreferrer" className="link mt-2 flex items-center gap-2 break-all text-caption">
                <Globe2 className="size-4 shrink-0" aria-hidden /> Documentation
              </a>
            )}
            <p className="mt-2 text-caption text-text-muted">Licence stated: {s.licence || 'Not given'}</p>
          </Card>
          <Card title="What it is">
            <p className="text-sm text-text-primary">{s.description}</p>
          </Card>
          <Card title="Why your team needs it">
            <blockquote className="border-l-[3px] border-purple pl-3 text-sm italic text-text-primary">{s.useCase}</blockquote>
          </Card>
        </div>
        <Card title="Timeline">
          <SuggestionHistory s={s} />
          <p className="mt-4 text-caption text-text-muted">Last updated {relativeTime(s.history[s.history.length - 1]?.at ?? s.createdAt)}</p>
        </Card>
      </div>

      <SuggestDialog open={editOpen} onOpenChange={setEditOpen} existing={s} />
    </>
  )
}
