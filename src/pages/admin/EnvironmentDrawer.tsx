import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Pause, Play, Square } from 'lucide-react'
import type { Environment } from '@/data/types'
import { useAppStore } from '@/store/useAppStore'
import { estimateCost } from '@/lib/cost'
import { formatDate, formatInt } from '@/lib/format'
import { purposeLabel } from '@/lib/labels'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/shared/Avatar'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { SpecSummary } from '@/components/shared/SpecSummary'
import { StatusTimeline } from '@/components/shared/StatusTimeline'
import { CopyButton } from '@/components/shared/CopyButton'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

export function useEnvActions() {
  const startEnv = useAppStore((s) => s.startEnv)
  const stopEnv = useAppStore((s) => s.stopEnv)
  const suspendEnv = useAppStore((s) => s.suspendEnv)
  const [suspendTarget, setSuspendTarget] = useState<Environment | null>(null)

  const start = (e: Environment) => {
    startEnv(e.id)
    toast.success(`Started “${e.spec.name}”.`)
  }
  const stop = (e: Environment) => {
    stopEnv(e.id)
    toast.success(`Stopped “${e.spec.name}”.`, { description: 'The owner has been notified.' })
  }
  const dialog = (
    <ConfirmDialog
      open={!!suspendTarget}
      onOpenChange={(o) => !o && setSuspendTarget(null)}
      title={`Suspend “${suspendTarget?.spec.name}”?`}
      description="The environment stops straight away and its endpoint stops answering. The owner is notified. Use this for misuse or a security concern; use Stop for routine savings."
      confirmLabel="Suspend environment"
      destructive
      onConfirm={() => {
        if (!suspendTarget) return
        suspendEnv(suspendTarget.id)
        toast.error(`Suspended “${suspendTarget.spec.name}”.`)
      }}
    />
  )
  return { start, stop, askSuspend: setSuspendTarget, dialog }
}

export const canStart = (e: Environment) => e.status === 'stopped' || e.status === 'approved'
export const canStop = (e: Environment) => e.status === 'running'
export const canSuspend = (e: Environment) => e.status === 'running' || e.status === 'provisioning'

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-6 py-5 last:border-b-0">
      <h3 className="mb-3 font-heading text-h3 text-text-primary">{title}</h3>
      {children}
    </section>
  )
}

export function EnvironmentDrawer({ env, onClose }: { env: Environment | null; onClose: () => void }) {
  return (
    <Sheet open={!!env} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>{env && <Body env={env} />}</SheetContent>
    </Sheet>
  )
}

function Body({ env }: { env: Environment }) {
  const catalog = useAppStore((s) => s.catalog)
  const owner = useAppStore((s) => s.users.find((u) => u.id === env.ownerId))
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === env.tenantId))
  const { start, stop, askSuspend, dialog } = useEnvActions()
  const est = estimateCost(env.spec, catalog)
  const live = !['pending', 'rejected'].includes(env.status)

  return (
    <>
      <div className="border-b border-border px-6 pb-5 pr-14 pt-6">
        <p className="eyebrow">{tenant?.name}</p>
        <SheetTitle className="mt-1 font-heading text-h2 text-text-primary">{env.spec.name}</SheetTitle>
        <SheetDescription className="sr-only">Environment details and actions</SheetDescription>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={env.status} />
          <Tag>{purposeLabel(env.spec.purpose)}</Tag>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Block title="Overview">
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={owner?.name ?? '?'} />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-text-primary">{owner?.name}</p>
              <p className="truncate text-caption text-text-secondary">{owner?.email}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="eyebrow">Credits used</dt>
              <dd className="tabular mt-1 font-heading text-h3 text-text-primary">{formatInt(env.creditsUsed)}</dd>
            </div>
            <div>
              <dt className="eyebrow">Est. per month</dt>
              <dd className="tabular mt-1 font-heading text-h3 text-text-primary">{formatInt(est.credits)}</dd>
            </div>
            <div>
              <dt className="eyebrow">Created</dt>
              <dd className="mt-1 text-sm text-text-primary">{formatDate(env.createdAt)}</dd>
            </div>
            <div>
              <dt className="eyebrow">Expires</dt>
              <dd className="mt-1 text-sm text-text-primary">{env.expiresAt ? formatDate(env.expiresAt) : 'Not set'}</dd>
            </div>
          </dl>
          {live && (
            <div className="mt-4">
              <p className="eyebrow mb-1.5">Endpoint</p>
              <div className="flex items-center gap-1 rounded-control border border-border bg-bg-subtle py-1 pl-3 pr-1">
                <code className="min-w-0 flex-1 truncate font-mono text-caption text-text-primary">{env.endpoint}</code>
                <CopyButton value={env.endpoint} what="Endpoint" />
              </div>
            </div>
          )}
          {!live && env.requestId && (
            <p className="mt-4 text-sm text-text-secondary">
              This environment has not been approved.{' '}
              <Link to={`/admin/requests?id=${env.requestId}`} className="link">
                Open the request
              </Link>
            </p>
          )}
        </Block>

        <Block title="Specification">
          <SpecSummary spec={env.spec} catalog={catalog} />
        </Block>

        <Block title="Status history">
          <StatusTimeline entries={env.timeline} />
        </Block>
      </div>

      {(canStart(env) || canStop(env) || canSuspend(env)) && (
        <div className="flex flex-col gap-2 border-t border-border bg-bg-surface px-6 py-4 sm:flex-row-reverse sm:items-center">
          {canStart(env) && (
            <Button onClick={() => start(env)}>
              <Play /> Start environment
            </Button>
          )}
          {canStop(env) && (
            <Button variant="secondary" onClick={() => stop(env)}>
              <Square /> Stop environment
            </Button>
          )}
          {canSuspend(env) && (
            <Button variant="ghost" className="text-red-text hover:text-red-text sm:mr-auto" onClick={() => askSuspend(env)}>
              <Pause /> Suspend
            </Button>
          )}
        </div>
      )}
      {dialog}
    </>
  )
}
