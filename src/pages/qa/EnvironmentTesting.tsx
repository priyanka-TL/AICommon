import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { FlaskConical } from 'lucide-react'
import type { TestCaseSeed } from '@/data/seed'
import { useAppStore } from '@/store/useAppStore'
import { useHostedProjectIds, useScopedEnvironments } from '@/store/selectors'
import { computeLabel } from '@/lib/labels'
import { currentSpec, currentVersion, functionalSummary } from '@/lib/qa'
import { reportPath } from '@/lib/paths'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Field } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FunctionalTests } from '@/pages/user/testing/FunctionalTests'
import { LoadTests } from '@/pages/user/testing/LoadTests'
import { ConfigSelect, useQaData } from './shared'

const NONE = '__none__'

/** Functional or load tests against an Active environment, optionally seeded from a test configuration. */
export default function EnvironmentTesting({ mode }: { mode: 'functional' | 'load' }) {
  const { configs, datasets, catalog, projects } = useQaData()
  const environments = useScopedEnvironments()
  const recordQaRun = useAppStore((s) => s.recordQaRun)
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const running = useMemo(() => environments.filter((e) => e.status === 'active'), [environments])
  const env = running.find((e) => e.id === params.get('env')) ?? running[0]
  const hosted = useHostedProjectIds()
  const envProjectIds = env ? (hosted.get(env.id) ?? []).filter((pid) => projects.some((p) => p.id === pid)) : []
  const types = mode === 'load' ? (['load'] as const) : (['functional', 'evaluation'] as const)
  const envConfigs = configs.filter((c) => !c.archived && env && envProjectIds.includes(currentSpec(c).projectId) && (types as readonly string[]).includes(currentSpec(c).type))
  const configParam = params.get('config')
  const config = configParam === NONE ? undefined : (envConfigs.find((c) => c.id === configParam) ?? envConfigs[0])
  const spec = config ? currentSpec(config) : undefined
  const dataset = datasets.find((d) => d.id === spec?.datasetId)

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) next.set(k, v)
    if ('env' in patch) next.delete('config')
    setParams(next, { replace: true })
  }

  const initialCases: TestCaseSeed[] | undefined = dataset?.rows.map((r) => ({ input: r.input, expected: r.expected, match: 'similar' }))
  const title = mode === 'load' ? 'Load Testing' : 'Functional Testing'
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name

  const save = (res: ReturnType<typeof recordQaRun>) => {
    if (res.ok) toast.success('Saved to Test Reports.', { action: { label: 'Open', onClick: () => navigate(reportPath('qa', res.id!)) } })
    else toast.error(res.error)
  }

  return (
    <>
      <PageHeader
        eyebrow="Environments"
        title={title}
        description={
          mode === 'load'
            ? 'Find out how much traffic an Active environment can take. Pick a load configuration to reuse its profile.'
            : 'Check a model’s answers in an Active environment against expected outputs from a configuration’s dataset.'
        }
      />

      {!env ? (
        <div className="card">
          <EmptyState icon={FlaskConical} title="No Active environments in your projects" description="Tests run against an Active environment. Ask the project team to start one." />
        </div>
      ) : (
        <>
          <div className="card mb-6 grid gap-4 p-5 md:grid-cols-2">
            <Field label="Environment" helper={`${envProjectIds.map(projectName).filter(Boolean).join(', ') || 'No projects yet'} · read-only access`}>
              <Select value={env.id} onValueChange={(v) => set({ env: v })}>
                <SelectTrigger aria-label="Environment to test">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {running.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.spec.name} · {computeLabel(e.spec.compute)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Test configuration" helper={envConfigs.length ? (spec?.load ? `${spec.load.vus} virtual users · ${spec.load.durationMin} min` : dataset ? `${dataset.name} · ${dataset.rows.length} prompts` : 'Using the built-in examples') : 'No matching configuration for this project. Using the built-in examples.'}>
              {envConfigs.length ? (
                <ConfigSelect configs={envConfigs} value={config?.id ?? ''} onChange={(v) => set({ config: v })} types={[...types]} />
              ) : (
                <Link to="/qa/configurations?new=1" className="link text-sm">
                  Create a configuration
                </Link>
              )}
            </Field>
          </div>

          {mode === 'functional' ? (
            <FunctionalTests
              key={`${env.id}-${config?.id ?? 'none'}`}
              env={env}
              initialCases={initialCases}
              onFinished={(r) => {
                const model = catalog.find((c) => c.id === r.modelId)
                if (!model) return
                const sum = functionalSummary(model, r.cases, r.outcomes)
                save(
                  recordQaRun({
                    projectId: spec?.projectId ?? envProjectIds[0] ?? '',
                    configId: config?.id ?? null,
                    configVersion: config ? currentVersion(config) : null,
                    kind: 'functional',
                    envId: env.id,
                    title: `Functional tests on ${env.spec.name} with ${model.name}`,
                    passed: sum.passed,
                    models: [sum],
                  }),
                )
              }}
            />
          ) : (
            <LoadTests
              key={`${env.id}-${config?.id ?? 'none'}`}
              env={env}
              initialConfig={spec?.load ? { vus: spec.load.vus, rampUpSec: spec.load.rampUpSec, durationMin: spec.load.durationMin } : undefined}
              onFinished={(v, cfg) =>
                save(
                  recordQaRun({
                    projectId: spec?.projectId ?? envProjectIds[0] ?? '',
                    configId: config?.id ?? null,
                    configVersion: config ? currentVersion(config) : null,
                    kind: 'load',
                    envId: env.id,
                    title: `Load test on ${env.spec.name} at ${cfg.vus} virtual users`,
                    passed: v.passed && (!spec?.load || v.peakRps >= spec.load.targetRps * 0.9),
                    models: [],
                    load: { vus: cfg.vus, rps: v.peakRps, p95: v.p95, errorPct: v.errorPct },
                  }),
                )
              }
            />
          )}
        </>
      )}
    </>
  )
}
