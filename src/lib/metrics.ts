import { hashString, seededRandom } from '@/data/seed'
import type { CatalogItem, Environment } from '@/data/types'
import { allocationOf } from './quota'
import { COMPUTE_TIERS } from './labels'

export type Range = '1h' | '24h' | '7d' | '30d'

export const RANGES: Record<Range, { label: string; points: number; stepMs: number }> = {
  '1h': { label: '1 hour', points: 60, stepMs: 60_000 },
  '24h': { label: '24 hours', points: 96, stepMs: 15 * 60_000 },
  '7d': { label: '7 days', points: 84, stepMs: 2 * 3_600_000 },
  '30d': { label: '30 days', points: 90, stepMs: 8 * 3_600_000 },
}

export const LIVE_INTERVAL_MS = 5000

export interface MetricPoint {
  t: number
  cpu: number
  ramUsed: number
  ramAlloc: number
  gpu: number
  gpuMemUsed: number
  gpuMemAlloc: number
  storageUsed: number
  storageAlloc: number
  netIn: number
  netOut: number
  apiCalls: number
  errors: number
  cost: number
  /** Tokens per model in this step, input and output. */
  tokens: Record<string, { in: number; out: number }>
}

interface Profile {
  cpu: number
  gpu: number
  ram: number
  storage: number
  net: number
  calls: number
}

function profileFor(env: Environment): Profile {
  const r = seededRandom(hashString(env.id + ':profile'))
  const p: Profile = {
    cpu: 30 + r() * 35,
    gpu: 40 + r() * 30,
    ram: 0.42 + r() * 0.25,
    storage: 0.35 + r() * 0.3,
    net: 1.5 + r() * 6,
    calls: 6 + r() * 20,
  }
  if (env.loadProfile === 'hot') {
    p.gpu = 88
    p.storage = 0.955
  }
  return p
}

const noise = (envId: string, metric: string, bucket: number) => seededRandom(hashString(`${envId}|${metric}|${bucket}`))()
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** 0..1 working-hours curve in India time, peaking mid-afternoon. */
function dayCurve(t: number) {
  const hour = (t / 3_600_000 + 5.5) % 24
  return clamp(0.5 + 0.5 * Math.sin(((hour - 8) / 24) * 2 * Math.PI), 0.08, 1)
}

/** Window in which the environment produced data. */
export function liveWindow(env: Environment): { start: number; end: number } | null {
  const active = env.history.find((h) => h.status === 'active')
  if (!active) return null
  const start = new Date(active.at).getTime()
  const end = env.status === 'active' ? Infinity : new Date(env.history[env.history.length - 1]!.at).getTime()
  return { start, end }
}

/** `monthlyCost` comes from the shared cost engine (`costBreakdown(...).total`). */
export function pointAt(env: Environment, _catalog: CatalogItem[], t: number, bucket: number, stepMs: number, monthlyCost = 0): MetricPoint {
  const tier = COMPUTE_TIERS.find((x) => x.value === env.spec.compute)!
  const alloc = allocationOf(env.spec)
  const gpuMemAlloc = tier.gpuMemGb * alloc.gpus
  const zero: MetricPoint = {
    t,
    cpu: 0,
    ramUsed: 0,
    ramAlloc: alloc.ramGb,
    gpu: 0,
    gpuMemUsed: 0,
    gpuMemAlloc,
    storageUsed: 0,
    storageAlloc: alloc.storageGb,
    netIn: 0,
    netOut: 0,
    apiCalls: 0,
    errors: 0,
    cost: 0,
    tokens: Object.fromEntries(env.spec.llms.map((l) => [l.id, { in: 0, out: 0 }])),
  }
  const win = liveWindow(env)
  if (!win || t < win.start) return zero
  const p = profileFor(env)
  const n = (m: string) => noise(env.id, m, bucket)
  const ageDays = (t - win.start) / 86_400_000
  const storageUsed = Math.round(alloc.storageGb * clamp(p.storage + Math.min(ageDays, 30) * 0.0008 + n('st') * 0.006, 0.05, 0.985))
  if (t > win.end) return { ...zero, storageUsed }

  const day = dayCurve(t)
  const stepMin = stepMs / 60_000
  const cpu = clamp(p.cpu * (0.55 + 0.6 * day) + (n('cpu') - 0.5) * 12, 3, 99)
  const gpu = tier.gpu ? clamp(env.loadProfile === 'hot' ? 82 + n('gpu') * 12 : p.gpu * (0.5 + 0.6 * day) + (n('gpu') - 0.5) * 14, 2, 99) : 0
  const calls = Math.round(p.calls * day * stepMin * (0.75 + n('calls') * 0.5))
  const tokens: MetricPoint['tokens'] = {}
  const totalBudget = env.spec.llms.reduce((s, l) => s + l.tokenBudget, 0) || 1
  for (const l of env.spec.llms) {
    const share = l.tokenBudget / totalBudget
    const per = calls * share * (650 + n('tok' + l.id) * 500)
    tokens[l.id] = { in: Math.round(per * 0.64), out: Math.round(per * 0.36) }
  }
  const hourlyCost = monthlyCost / 720
  return {
    t,
    cpu: Math.round(cpu * 10) / 10,
    ramUsed: Math.round(alloc.ramGb * clamp(p.ram + 0.18 * day + (n('ram') - 0.5) * 0.06, 0.1, 0.97) * 10) / 10,
    ramAlloc: alloc.ramGb,
    gpu: Math.round(gpu * 10) / 10,
    gpuMemUsed: tier.gpu ? Math.round(gpuMemAlloc * clamp(gpu / 100 + 0.08 + (n('gm') - 0.5) * 0.05, 0.05, 0.98) * 10) / 10 : 0,
    gpuMemAlloc,
    storageUsed,
    storageAlloc: alloc.storageGb,
    netIn: Math.round(p.net * day * (0.7 + n('ni') * 0.6) * 100) / 100,
    netOut: Math.round(p.net * 0.55 * day * (0.7 + n('no') * 0.6) * 100) / 100,
    apiCalls: calls,
    errors: Math.round(calls * (0.002 + n('err') * 0.008)),
    cost: Math.round(hourlyCost * (stepMs / 3_600_000) * (0.4 + day) * 100) / 100,
    tokens,
  }
}

export function seriesFor(env: Environment, catalog: CatalogItem[], range: Range, now = Date.now(), monthlyCost = 0): MetricPoint[] {
  const { points, stepMs } = RANGES[range]
  const lastBucket = Math.floor(now / stepMs)
  const out: MetricPoint[] = []
  for (let i = points - 1; i >= 1; i--) {
    const b = lastBucket - i
    out.push(pointAt(env, catalog, b * stepMs, b, stepMs, monthlyCost))
  }
  out.push(currentPoint(env, catalog, now, stepMs, monthlyCost))
  return out
}

/** The newest point changes every 5 seconds so live charts move. */
export function currentPoint(env: Environment, catalog: CatalogItem[], now = Date.now(), stepMs = RANGES['1h'].stepMs, monthlyCost = 0) {
  const live = Math.floor(now / LIVE_INTERVAL_MS)
  return pointAt(env, catalog, now, live, stepMs, monthlyCost)
}

export interface Utilisation {
  key: 'cpu' | 'ram' | 'gpu' | 'gpuMem' | 'storage'
  label: string
  pct: number
}

export function utilisation(p: MetricPoint): Utilisation[] {
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0)
  const out: Utilisation[] = [
    { key: 'cpu', label: 'CPU', pct: p.cpu },
    { key: 'ram', label: 'RAM', pct: pct(p.ramUsed, p.ramAlloc) },
    { key: 'storage', label: 'Storage', pct: pct(p.storageUsed, p.storageAlloc) },
  ]
  if (p.gpuMemAlloc > 0) {
    out.push({ key: 'gpu', label: 'GPU', pct: p.gpu })
    out.push({ key: 'gpuMem', label: 'GPU memory', pct: pct(p.gpuMemUsed, p.gpuMemAlloc) })
  }
  return out
}

export const alertLevel = (pct: number): 95 | 80 | null => (pct > 95 ? 95 : pct > 80 ? 80 : null)

export function toCsv(env: Environment, series: MetricPoint[], catalog: CatalogItem[]) {
  const models = env.spec.llms.map((l) => l.id)
  const name = (id: string) => catalog.find((c) => c.id === id)?.version ?? id
  const head = [
    'timestamp',
    'cpu_pct',
    'ram_used_gb',
    'ram_alloc_gb',
    'gpu_pct',
    'gpu_mem_used_gb',
    'storage_used_gb',
    'net_in_mbps',
    'net_out_mbps',
    'api_calls',
    'errors',
    'estimated_cost_credits',
    ...models.flatMap((m) => [`${name(m)}_tokens_in`, `${name(m)}_tokens_out`]),
  ]
  const rows = series.map((p) =>
    [
      new Date(p.t).toISOString(),
      p.cpu,
      p.ramUsed,
      p.ramAlloc,
      p.gpu,
      p.gpuMemUsed,
      p.storageUsed,
      p.netIn,
      p.netOut,
      p.apiCalls,
      p.errors,
      p.cost,
      ...models.flatMap((m) => [p.tokens[m]?.in ?? 0, p.tokens[m]?.out ?? 0]),
    ].join(','),
  )
  return [head.join(','), ...rows].join('\n')
}

export function downloadText(filename: string, text: string, type = 'text/csv') {
  const blob = new Blob([text], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

/** CSV text from a header and rows; every cell is quoted so commas and quotes are safe. */
export function rowsToCsv(head: string[], rows: (string | number)[][]) {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  return [head.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n')
}
