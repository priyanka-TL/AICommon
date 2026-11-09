import {
  ASR_QUALITY,
  hashString,
  PLAYGROUND_PROMPTS,
  PLAYGROUND_STYLE,
  seededRandom,
  type AsrClip,
  type TestCaseSeed,
} from '@/data/seed'
import type { CatalogItem, ComputeTier, Environment, Provider } from '@/data/types'

const DAY = 86_400_000

/* ---------- environment usage ---------- */

export interface EnvUsagePoint {
  date: string
  credits: number
  requests: number
}

export function envUsageSeries(env: Environment, days = 30): EnvUsagePoint[] {
  const rand = seededRandom(hashString(env.id + ':usage'))
  const created = new Date(env.createdAt).getTime()
  const activeDays = Math.max(1, Math.min(days, Math.ceil((Date.now() - created) / DAY)))
  const stoppedAt = ['stopped', 'suspended', 'terminated'].includes(env.status) ? new Date(env.history[env.history.length - 1]!.at).getTime() : Infinity
  const perDay = env.creditsUsed / Math.max(1, Math.ceil((Date.now() - created) / DAY))
  const out: EnvUsagePoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const t = Date.now() - i * DAY
    const d = new Date(t)
    const live = i < activeDays && t < stoppedAt && env.creditsUsed > 0
    const weekend = d.getDay() === 0 || d.getDay() === 6
    const f = live ? (weekend ? 0.45 : 1) * (0.75 + rand() * 0.5) : 0
    const credits = Math.round(perDay * f)
    out.push({ date: d.toISOString().slice(0, 10), credits, requests: Math.round(credits * (3.2 + rand())) })
  }
  return out
}

/* ---------- logs ---------- */

export interface LogLine {
  id: number
  at: string
  level: 'INFO' | 'WARN' | 'ERROR'
  message: string
}

export function makeLogLine(env: Environment, catalog: CatalogItem[], seq: number, at = new Date()): LogLine {
  const rand = seededRandom(hashString(`${env.id}:${seq}`))
  const llm = env.spec.llms.length ? catalog.find((c) => c.id === env.spec.llms[Math.floor(rand() * env.spec.llms.length)]!.id) : undefined
  const asr = env.spec.asr.length ? catalog.find((c) => c.id === env.spec.asr[Math.floor(rand() * env.spec.asr.length)]) : undefined
  const r = rand()
  const ms = Math.round(300 + rand() * 900)
  let level: LogLine['level'] = 'INFO'
  let message: string

  if (r < 0.04) {
    level = 'ERROR'
    message = llm ? `POST /v1/chat/completions 504 model=${llm.version} upstream timeout after 30000ms` : 'Health check failed: worker-2 did not respond in 5s'
  } else if (r < 0.12) {
    level = 'WARN'
    message = llm
      ? `Token budget for ${llm.name} at ${Math.round(70 + rand() * 25)}% of monthly limit`
      : `Disk usage at ${Math.round(70 + rand() * 20)}% of ${env.spec.storageGb} GB`
  } else if (r < 0.32 && asr) {
    const lang = env.spec.languages[Math.floor(rand() * Math.max(env.spec.languages.length, 1))] ?? 'Hindi'
    message = `POST /v1/audio/transcriptions 200 ${(ms * 2.1 / 1000).toFixed(1)}s provider=${asr.id.replace('asr-', '')} lang=${lang} audio=${Math.round(5 + rand() * 50)}s`
  } else if (r < 0.42) {
    message = `Autoscaler: GPU utilisation ${Math.round(30 + rand() * 55)}%, ${1 + Math.floor(rand() * 3)} worker(s) active`
  } else if (llm) {
    message = `POST /v1/chat/completions 200 ${ms}ms model=${llm.version} tokens_in=${Math.round(80 + rand() * 900)} tokens_out=${Math.round(40 + rand() * 400)}`
  } else {
    message = `GET /v1/health 200 ${Math.round(4 + rand() * 20)}ms`
  }
  return { id: seq, at: at.toISOString(), level, message }
}

export function initialLogs(env: Environment, catalog: CatalogItem[], count = 40): LogLine[] {
  const now = Date.now()
  return Array.from({ length: count }, (_, i) => makeLogLine(env, catalog, i, new Date(now - (count - i) * 47_000)))
}

/* ---------- LLM playground ---------- */

export interface LlmResult {
  modelId: string
  text: string
  latencyMs: number
  inputTokens: number
  outputTokens: number
  cost: number
}

const tokens = (s: string) => {
  const nonAscii = [...s].filter((c) => c.charCodeAt(0) > 127).length
  return Math.ceil((s.length - nonAscii) / 4 + nonAscii / 1.5)
}

export function runPlayground(prompt: string, models: CatalogItem[], providers: Provider[]): LlmResult[] {
  const sample = PLAYGROUND_PROMPTS.find((p) => p.prompt === prompt.trim())
  const taken = new Set<number>()
  return models.map((m) => {
    let text: string
    if (sample) {
      let idx = PLAYGROUND_STYLE[m.id] ?? 2
      while (taken.has(idx) && taken.size < sample.responses.length) idx = (idx + 1) % sample.responses.length
      taken.add(idx)
      text = sample.responses[idx]!
    } else {
      text = `This is a simulated answer from ${m.name}. In this prototype, only the sample prompts return realistic, model-specific answers. Pick one of them above to compare how each model handles the same task.`
    }
    const rand = seededRandom(hashString(m.id + prompt))
    const provider = providers.find((p) => p.serves.includes(m.id))
    const base = provider?.latencyMs || 700
    const inputTokens = tokens(prompt)
    const outputTokens = tokens(text)
    const latencyMs = Math.round(base * (0.6 + outputTokens / 220) * (0.85 + rand() * 0.3))
    const cost = ((inputTokens + outputTokens) / 1_000_000) * m.costPerUnit
    return { modelId: m.id, text, latencyMs, inputTokens, outputTokens, cost }
  })
}

/* ---------- ASR ---------- */

export type WordOp =
  | { type: 'ok'; ref: string; hyp: string }
  | { type: 'sub'; ref: string; hyp: string }
  | { type: 'del'; ref: string }
  | { type: 'ins'; hyp: string }

export function wordAlign(reference: string, hypothesis: string): { ops: WordOp[]; wer: number } {
  const r = reference.split(/\s+/).filter(Boolean)
  const h = hypothesis.split(/\s+/).filter(Boolean)
  const d: number[][] = Array.from({ length: r.length + 1 }, (_, i) => Array.from({ length: h.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (r[i - 1] === h[j - 1] ? 0 : 1))
  const ops: WordOp[] = []
  let i = r.length
  let j = h.length
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i]![j] === d[i - 1]![j - 1]! + (r[i - 1] === h[j - 1] ? 0 : 1)) {
      ops.unshift(r[i - 1] === h[j - 1] ? { type: 'ok', ref: r[i - 1]!, hyp: h[j - 1]! } : { type: 'sub', ref: r[i - 1]!, hyp: h[j - 1]! })
      i--
      j--
    } else if (i > 0 && d[i]![j] === d[i - 1]![j]! + 1) {
      ops.unshift({ type: 'del', ref: r[i - 1]! })
      i--
    } else {
      ops.unshift({ type: 'ins', hyp: h[j - 1]! })
      j--
    }
  }
  return { ops, wer: r.length ? d[r.length]![h.length]! / r.length : 0 }
}

export interface AsrResult {
  providerId: string
  supported: boolean
  transcript: string
  ops: WordOp[]
  wer: number
  latencyMs: number
  cost: number
}

export function transcribe(clip: AsrClip, item: CatalogItem, providers: Provider[]): AsrResult {
  if (!item.languages.includes(clip.language)) {
    return { providerId: item.id, supported: false, transcript: '', ops: [], wer: 1, latencyMs: 0, cost: 0 }
  }
  const q = ASR_QUALITY[item.id]
  const quality = q?.overrides?.[clip.language] ?? q?.base ?? 0.85
  const rand = seededRandom(hashString(item.id + clip.id))
  const words = clip.reference.split(/\s+/)
  const errorCount = Math.round((1 - quality) * words.length)
  const errorAt = new Set(
    words
      .map((_, i) => ({ i, k: rand() }))
      .sort((x, y) => x.k - y.k)
      .slice(0, errorCount)
      .map((x) => x.i),
  )
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!
    if (!errorAt.has(i)) {
      out.push(w)
      continue
    }
    const kind = rand()
    if (kind < 0.5) out.push(Array.from(w).slice(0, -1).join('') || w)
    else if (kind < 0.8) continue
    else if (i < words.length - 1) {
      out.push(w + words[i + 1])
      i++
    } else out.push(w)
  }
  const transcript = out.join(' ')
  const { ops, wer } = wordAlign(clip.reference, transcript)
  const provider = providers.find((p) => p.serves.includes(item.id))
  const latencyMs = Math.round((provider?.latencyMs || 600) * (1 + clip.durationSec / 10) * (0.9 + rand() * 0.2))
  const cost = (clip.durationSec / 3600) * item.costPerUnit
  return { providerId: item.id, supported: true, transcript, ops, wer, latencyMs, cost }
}

/* ---------- functional tests ---------- */

export interface TestOutcome {
  output: string
  passed: boolean
  reason: string
  latencyMs: number
}

const WRONG_ANSWERS = [
  'I’m not sure about that. Please contact your nearest Krishi Vigyan Kendra for advice.',
  'It depends on many factors such as soil, weather and the crop variety.',
  'The answer could not be determined from the information given.',
]

export function runTestCase(tc: TestCaseSeed, model: CatalogItem, providers: Provider[]): TestOutcome {
  const rand = seededRandom(hashString(`${model.id}|${tc.input}|${tc.expected}|${tc.match}`))
  const strength = model.hosting === 'hosted' ? 0.9 : model.id === 'llm-qwen' ? 0.65 : 0.78
  const passRate = tc.match === 'exact' ? strength - 0.15 : strength
  const passed = rand() < passRate
  const provider = providers.find((p) => p.serves.includes(model.id))
  const latencyMs = Math.round((provider?.latencyMs || 600) * (0.8 + rand() * 0.6))

  if (passed) {
    const output =
      tc.match === 'exact'
        ? tc.expected
        : tc.match === 'contains'
          ? `The answer is ${tc.expected}. ${rand() < 0.5 ? 'Please confirm with your local office if this changes.' : 'Let me know if you need more detail.'}`
          : tc.expected
    const reason =
      tc.match === 'exact' ? 'Output matches exactly.' : tc.match === 'contains' ? `Output contains “${tc.expected}”.` : `Similarity ${(0.86 + rand() * 0.1).toFixed(2)} is above 0.80.`
    return { output, passed, reason, latencyMs }
  }

  const output = tc.match === 'exact' ? `${tc.expected}, it is.` : WRONG_ANSWERS[Math.floor(rand() * WRONG_ANSWERS.length)]!
  const reason =
    tc.match === 'exact'
      ? 'Output has extra words, so it is not an exact match.'
      : tc.match === 'contains'
        ? `Output does not contain “${tc.expected}”.`
        : `Similarity ${(0.35 + rand() * 0.3).toFixed(2)} is below 0.80.`
  return { output, passed, reason, latencyMs }
}

/* ---------- load tests ---------- */

export const P95_THRESHOLD_MS = 800
export const ERROR_THRESHOLD_PCT = 1

/** Approximate sustained requests per second for each tier. */
export const TIER_CAPACITY: Record<ComputeTier, number> = { cpu: 40, t4: 120, l4: 180, a10: 250, a100: 600 }

export interface LoadConfig {
  vus: number
  rampUpSec: number
  durationMin: number
}

export interface LoadPoint {
  t: number
  vus: number
  p50: number
  p95: number
  rps: number
  errorPct: number
}

export const LOAD_TICKS = 30
export const LOAD_TICK_MS = 500

export function loadPoint(cfg: LoadConfig, env: Environment, catalog: CatalogItem[], tick: number): LoadPoint {
  const rand = seededRandom(hashString(`${env.id}:${cfg.vus}:${tick}`))
  const totalSec = cfg.rampUpSec + cfg.durationMin * 60
  const t = Math.round((totalSec * tick) / LOAD_TICKS)
  const vus = Math.round(Math.min(cfg.vus, cfg.rampUpSec ? (cfg.vus * t) / cfg.rampUpSec : cfg.vus))
  const capacity = TIER_CAPACITY[env.spec.compute]
  const demand = vus * 0.8
  const u = demand / capacity
  const hosted = env.spec.llms.some((l) => catalog.find((c) => c.id === l.id)?.hosting === 'hosted')
  const base = hosted ? 300 : 210
  const jitter = 0.92 + rand() * 0.16
  const p50 = Math.round(base * (1 + Math.pow(Math.min(u, 1.6), 3) * 0.9) * jitter)
  const p95 = Math.min(30_000, Math.round(p50 * (1.7 + Math.max(0, u - 0.75) * 2.4) * (0.95 + rand() * 0.1)))
  const rps = Math.round(Math.min(demand, capacity * (1 - Math.max(0, u - 1) * 0.1)) * (0.96 + rand() * 0.08))
  const errorPct = Math.max(0, u > 1 ? (u - 1) * 14 + rand() * 1.5 : rand() * 0.3)
  return { t, vus, p50, p95, rps, errorPct: Math.round(errorPct * 100) / 100 }
}

export interface LoadVerdict {
  passed: boolean
  p95: number
  errorPct: number
  peakRps: number
}

export function loadVerdict(points: LoadPoint[], cfg: LoadConfig): LoadVerdict {
  const steady = points.filter((p) => p.t >= cfg.rampUpSec && p.vus > 0)
  const sample = steady.length ? steady : points
  const sortedP95 = sample.map((p) => p.p95).sort((a, b) => a - b)
  const p95 = sortedP95[Math.floor(sortedP95.length * 0.95)] ?? sortedP95[sortedP95.length - 1] ?? 0
  const errorPct = sample.reduce((s, p) => s + p.errorPct, 0) / Math.max(sample.length, 1)
  const peakRps = Math.max(...points.map((p) => p.rps), 0)
  return { passed: p95 < P95_THRESHOLD_MS && errorPct < ERROR_THRESHOLD_PCT, p95, errorPct: Math.round(errorPct * 100) / 100, peakRps }
}
