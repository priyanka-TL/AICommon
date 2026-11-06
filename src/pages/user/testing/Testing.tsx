import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FlaskConical } from 'lucide-react'
import { useScopedEnvironments } from '@/store/selectors'
import { computeLabel } from '@/lib/labels'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Playground } from './Playground'
import { FunctionalTests } from './FunctionalTests'
import { LoadTests } from './LoadTests'

const TABS = ['playground', 'functional', 'load'] as const
type Tab = (typeof TABS)[number]

export default function Testing() {
  const environments = useScopedEnvironments()
  const [params, setParams] = useSearchParams()

  const running = useMemo(() => environments.filter((e) => e.status === 'active'), [environments])
  const env = running.find((e) => e.id === params.get('env')) ?? running[0]
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'playground'

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) next.set(k, v)
    setParams(next, { replace: true })
  }

  return (
    <>
      <PageHeader
        eyebrow="Build and test"
        title="Testing"
        description="Compare models, check answers against expected outputs and find out how much traffic an environment can take."
        actions={
          env && (
            <div className="flex min-w-[260px] flex-col gap-1">
              <span className="eyebrow">Environment</span>
              <Select value={env.id} onValueChange={(v) => update({ env: v })}>
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
            </div>
          )
        }
      />

      {!env ? (
        <div className="card">
          <EmptyState
            icon={FlaskConical}
            title="Start an environment to run tests"
            description="Tests run against an active environment’s endpoint. Start a stopped environment, or wait for one that is being set up."
            action={
              <Button asChild variant="secondary">
                <Link to="/app">Go to your environments</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => update({ tab: v })}>
          <TabsList>
            <TabsTrigger value="playground">Playground</TabsTrigger>
            <TabsTrigger value="functional">Functional tests</TabsTrigger>
            <TabsTrigger value="load">Load tests</TabsTrigger>
          </TabsList>
          <TabsContent value="playground" forceMount className="data-[state=inactive]:hidden">
            <Playground key={env.id} env={env} />
          </TabsContent>
          <TabsContent value="functional" forceMount className="data-[state=inactive]:hidden">
            <FunctionalTests key={env.id} env={env} />
          </TabsContent>
          <TabsContent value="load" forceMount className="data-[state=inactive]:hidden">
            <LoadTests key={env.id} env={env} />
          </TabsContent>
        </Tabs>
      )}
    </>
  )
}
