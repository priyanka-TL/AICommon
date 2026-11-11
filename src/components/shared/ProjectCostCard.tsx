import { useMemo } from 'react'
import type { Environment, Project } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { useMonthToDate } from '@/hooks/useSpend'
import { useProjectModelCost } from '@/hooks/useModelCost'
import { envProjectIds } from '@/lib/capabilities'
import { formatINR } from '@/lib/format'
import { CostBarChart } from './CostBarChart'

/** Project overview: this month's model cost (by model and by provider) plus its share of infrastructure. */
export function ProjectCostCard({ project, envs }: { project: Project; envs: Environment[] }) {
  const catalog = useAppStore((s) => s.catalog)
  const providers = useAppStore((s) => s.infraProviders)
  const deployments = useAppStore((s) => s.deployments)
  const spend = useMonthToDate()
  const models = useProjectModelCost(project.id)

  // An environment shared by several projects is split evenly between them.
  const infra = useMemo(
    () =>
      envs.reduce((sum, env) => {
        const row = spend.find((r) => r.env.id === env.id)
        const share = Math.max(1, envProjectIds(env.id, deployments).length)
        return sum + (row ? row.lines.total / share : 0)
      }, 0),
    [envs, spend, deployments],
  )

  const byModel = models.byModel.map((g) => ({ label: catalog.find((c) => c.id === g.key)?.name ?? g.key, value: Math.round(g.cost) }))
  const byProvider = models.byProvider.map((g) => ({ label: providers.find((p) => p.id === g.key)?.name ?? g.key, value: Math.round(g.cost) }))
  const height = (n: number) => Math.max(96, n * 34)

  return (
    <section className="card p-6" data-testid="project-cost">
      <h2 className="font-heading text-h3 text-text-primary">Cost this month</h2>
      <p className="mt-0.5 text-caption text-text-secondary">Platform model usage plus this project’s share of the environments it runs on. Includes fees, discount and GST.</p>
      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-control bg-bg-subtle p-3">
          <dt className="text-caption text-text-muted">Models</dt>
          <dd className="tabular font-heading text-h3 text-text-primary" data-testid="project-model-cost">{formatINR(models.total)}</dd>
          <dd className="text-caption text-text-secondary">Projected {formatINR(models.projected)}</dd>
        </div>
        <div className="rounded-control bg-bg-subtle p-3">
          <dt className="text-caption text-text-muted">Infrastructure</dt>
          <dd className="tabular font-heading text-h3 text-text-primary">{formatINR(infra)}</dd>
        </div>
        <div className="rounded-control bg-indigo-50 p-3">
          <dt className="text-caption text-text-muted">Total</dt>
          <dd className="tabular font-heading text-h3 text-text-primary">{formatINR(models.total + infra)}</dd>
        </div>
      </dl>
      {models.rows.length > 0 && (
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-caption font-semibold text-text-secondary">Model cost by model</p>
            <div style={{ height: height(byModel.length) }}>
              <CostBarChart data={byModel} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-caption font-semibold text-text-secondary">Model cost by provider</p>
            <div style={{ height: height(byProvider.length) }}>
              <CostBarChart data={byProvider} labelWidth={150} />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
