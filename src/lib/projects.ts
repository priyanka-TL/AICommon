import type { Deployment, Environment, Project } from '@/data/types'

export interface ProjectSummary {
  /** Deployments of this project on environments that still exist. */
  deployments: Deployment[]
  environments: Environment[]
  /** Most recent deployment run or version, or null if never deployed. */
  lastDeployedAt: string | null
  running: number
  failed: number
  /** Running on at least one environment. */
  deployed: boolean
}

export function summariseProject(project: Pick<Project, 'id'>, deployments: Deployment[], environments: Environment[]): ProjectSummary {
  const live = deployments.filter((d) => d.projectId === project.id && environments.some((e) => e.id === d.envId && e.status !== 'terminated'))
  const envs = environments.filter((e) => live.some((d) => d.envId === e.id))
  const times = live.flatMap((d) => [d.lastRun?.startedAt, ...d.history.map((h) => h.at)]).filter((x): x is string => !!x)
  const lastDeployedAt = times.length ? times.sort()[times.length - 1]! : null
  const running = live.filter((d) => d.status === 'running').length
  return { deployments: live, environments: envs, lastDeployedAt, running, failed: live.filter((d) => d.status === 'failed').length, deployed: running > 0 }
}

export type ProjectSort = 'name' | 'last_deployed' | 'updated'
export const PROJECT_SORT_LABELS: Record<ProjectSort, string> = {
  name: 'Name',
  last_deployed: 'Last deployed',
  updated: 'Recently updated',
}
