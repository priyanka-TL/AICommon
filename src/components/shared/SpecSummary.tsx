import { Pencil } from 'lucide-react'
import type { CatalogItem, EnvSpec, Project } from '@/data/types'
import { allocationOf } from '@/lib/quota'
import { autoShutdownLabel, COMPUTE_TIERS, dataClassLabel, purposeLabel } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { Tag } from './StatusBadge'

interface SpecSummaryProps {
  spec: EnvSpec
  catalog: CatalogItem[]
  projects?: Project[]
  onEdit?: (step: number) => void
  className?: string
}

function Section({
  title,
  step,
  onEdit,
  children,
}: {
  title: string
  step: number
  onEdit?: (step: number) => void
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="eyebrow">{title}</h3>
        {onEdit && (
          <button type="button" onClick={() => onEdit(step)} className="link flex items-center gap-1 text-caption">
            <Pencil className="size-3.5" aria-hidden /> Edit
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1 text-sm">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-text-primary">{children}</dd>
    </div>
  )
}

export function SpecSummary({ spec, catalog, projects = [], onEdit, className }: SpecSummaryProps) {
  const name = (id: string) => catalog.find((c) => c.id === id)?.name ?? id
  const tier = COMPUTE_TIERS.find((t) => t.value === spec.compute)!
  const provider = useAppStore((s) => s.infraProviders.find((p) => p.id === spec.providerId))
  const region = provider?.regions.find((r) => r.id === spec.regionId)
  const caps = spec.capabilities

  return (
    <div className={cn('flex flex-col', className)}>
      <Section title="Purpose" step={0} onEdit={onEdit}>
        <dl>
          <Row label={spec.projectIds.length > 1 ? 'Projects' : 'Project'}>
            {spec.projectIds.length ? spec.projectIds.map((id) => projects.find((p) => p.id === id)?.name ?? id).join(', ') : 'No projects yet (you can add them later)'}
          </Row>
          <Row label="Purpose">{purposeLabel(spec.purpose)}</Row>
          <Row label="Duration">{spec.durationWeeks} weeks</Row>
          {spec.description && <Row label="Description">{spec.description}</Row>}
        </dl>
      </Section>

      <Section title="Provider & region" step={1} onEdit={onEdit}>
        <dl>
          <Row label="Provider">{provider?.name ?? 'Not set'}</Row>
          <Row label="Region">{region ? `${region.name} · ${region.indiaResident ? 'data stays in India' : 'outside India'}` : 'Not set'}</Row>
        </dl>
      </Section>

      <Section title="Compute" step={2} onEdit={onEdit}>
        <dl>
          <Row label="Instance">
            {spec.instance.name || 'Not set'} <span className="text-text-muted">· {tier.label}</span>
          </Row>
          <Row label="Instances">{spec.instanceCount}</Row>
          <Row label="Network egress">{spec.egressGbPerMonth} GB a month</Row>
          <Row label="Allocation">
            {(() => {
              const a = allocationOf(spec)
              return `${a.vcpu} vCPU · ${a.ramGb} GB RAM${a.gpus ? ` · ${a.gpus} GPU${a.gpus > 1 ? 's' : ''}` : ''}`
            })()}
          </Row>
          <Row label="Storage">{spec.storageGb} GB</Row>
          <Row label="Auto-shutdown">{autoShutdownLabel(spec.autoShutdownHours)}</Row>
        </dl>
      </Section>

      <Section title="Language models" step={3} onEdit={onEdit}>
        {spec.llms.length ? (
          <ul className="flex flex-col gap-1.5">
            {spec.llms.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text-primary">{name(l.id)}</span>
                <span className="tabular text-text-secondary">{l.tokenBudget}M tokens / month</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">No language models</p>
        )}
      </Section>

      <Section title="Speech recognition" step={4} onEdit={onEdit}>
        {spec.asr.length ? (
          <dl>
            <Row label="Providers">{spec.asr.map(name).join(', ')}</Row>
            <Row label="Languages">{spec.languages.length ? spec.languages.join(', ') : 'Not set'}</Row>
            <Row label="Audio">{spec.asrHoursPerMonth} hours / month</Row>
          </dl>
        ) : (
          <p className="text-sm text-text-muted">No speech recognition</p>
        )}
      </Section>

      <Section title="Capabilities" step={5} onEdit={onEdit}>
        {caps.length ? (
          <div className="flex flex-wrap gap-1.5">
            {caps.map((id) => (
              <Tag key={id}>{name(id)}</Tag>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">No extra capabilities</p>
        )}
      </Section>

      <Section title="Data" step={6} onEdit={onEdit}>
        <dl>
          <Row label="Classification">
            <span
              className={cn(
                'font-semibold',
                (spec.dataClassification === 'children' || spec.dataClassification === 'personal') && 'text-purple-text',
              )}
            >
              {dataClassLabel(spec.dataClassification)}
            </span>
          </Row>
          <Row label="Personal identifiers">{spec.containsPii ? 'Yes' : 'No'}</Row>
        </dl>
      </Section>
    </div>
  )
}
