import { hashString, seededRandom, type SeedState } from '@/data/seed'
import type {
  CatalogItem,
  DatasetRow,
  Environment,
  Language,
  ModelSummary,
  Project,
  PromptResult,
  Provider,
  QaMetric,
  QaRun,
  Tenant,
  TestConfig,
  TestConfigSpec,
  TestSchedule,
  TestType,
} from '@/data/types'
import { isEnabledFor } from '@/lib/suggestions'

/* ---------- labels ---------- */

export const TEST_TYPE_LABELS: Record<TestType, string> = {
  functional: 'Functional',
  evaluation: 'Evaluation',
  load: 'Load',
  comparison: 'Comparison',
}

export const SCHEDULE_LABELS: Record<TestSchedule, string> = {
  manual: 'Manual',
  daily: 'Daily',
  on_new_environment: 'On new environment',
}

export const METRIC_INFO: Record<QaMetric, { label: string; better: 'higher' | 'lower'; hint: string }> = {
  accuracy: { label: 'Accuracy', better: 'higher', hint: 'Answer matches the expected output' },
  faithfulness: { label: 'Faithfulness', better: 'higher', hint: 'Answer sticks to the given context' },
  relevance: { label: 'Relevance', better: 'higher', hint: 'Answer addresses the question' },
  toxicity: { label: 'Toxicity', better: 'lower', hint: 'Harmful or unsafe language' },
  latencyP95: { label: 'Latency p95', better: 'lower', hint: 'Slowest 5% of answers, in ms' },
}

export const QUALITY_METRICS = ['accuracy', 'faithfulness', 'relevance', 'toxicity'] as const

export const currentSpec = (c: TestConfig) => c.versions[c.versions.length - 1]!.spec
export const currentVersion = (c: TestConfig) => c.versions[c.versions.length - 1]!.version

/* ---------- models for a project ---------- */

/** Language models enabled for the tenant and attached to the project, directly or through its environments. */
export function projectModels(project: Project, tenant: Tenant | undefined, envs: Environment[], catalog: CatalogItem[]): CatalogItem[] {
  if (!tenant) return []
  const ids = new Set(project.capabilityIds)
  for (const e of envs) if (e.projectId === project.id && e.status !== 'terminated') for (const l of e.spec.llms) ids.add(l.id)
  return catalog.filter((c) => c.category === 'llm' && ids.has(c.id) && isEnabledFor(c, tenant)).sort((a, b) => a.name.localeCompare(b.name))
}

/* ---------- deterministic evaluation ---------- */

const tokensOf = (s: string) => {
  const nonAscii = [...s].filter((c) => c.charCodeAt(0) > 127).length
  return Math.ceil((s.length - nonAscii) / 4 + nonAscii / 1.5)
}

/** How well each model handles a language, on top of its base strength. */
const LANGUAGE_BONUS: Record<string, Partial<Record<Language, number>>> = {
  'llm-sarvam': { Hindi: 0.08, Kannada: 0.1, Tamil: 0.08, Telugu: 0.08, Marathi: 0.06, Bengali: 0.06 },
  'llm-gemini': { Hindi: 0.04, Kannada: 0.03 },
  'llm-llama': { Kannada: -0.1, Hindi: -0.03 },
  'llm-mistral': { Kannada: -0.12, Hindi: -0.06 },
  'llm-gemma': { Kannada: -0.06 },
}

const baseStrength = (m: CatalogItem) => (m.id === 'llm-qwen' ? 0.62 : m.hosting === 'hosted' ? 0.86 : 0.75)
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n))
const round2 = (n: number) => Math.round(n * 100) / 100

const HEDGES = [
  'I am not sure about this. Please check with your block resource person.',
  'This depends on your state’s guidelines.',
  'Please refer to the official circular for the exact answer.',
]

export function evaluatePrompt(row: DatasetRow, model: CatalogItem, spec: TestConfigSpec, providers: Provider[], language: Language): PromptResult {
  const rand = seededRandom(hashString(`${model.id}|${row.input}|${spec.temperature}|${spec.systemPrompt.length}`))
  const strength = clamp(baseStrength(model) + (LANGUAGE_BONUS[model.id]?.[language] ?? 0) - spec.temperature * 0.08)
  const accuracy = round2(clamp(strength + (rand() - 0.5) * 0.3))
  const faithfulness = round2(clamp((row.context ? strength + 0.04 : strength - 0.02) + (rand() - 0.5) * 0.24))
  const relevance = round2(clamp(strength + 0.06 + (rand() - 0.5) * 0.2))
  const toxicity = round2(clamp(rand() * (model.hosting === 'hosted' ? 0.03 : 0.07)))

  let output: string
  if (accuracy >= 0.8) output = row.expected
  else if (accuracy >= 0.6) {
    const words = row.expected.split(/\s+/)
    output = words.length > 2 ? `${words.slice(0, Math.ceil(words.length / 2)).join(' ')}…` : `${row.expected} (with an extra, unsupported detail)`
  } else output = HEDGES[Math.floor(rand() * HEDGES.length)]!

  const provider = providers.find((p) => p.serves.includes(model.id))
  const base = provider?.latencyMs || (model.hosting === 'hosted' ? 650 : 450)
  const tokens = tokensOf(spec.systemPrompt) + tokensOf(row.input) + tokensOf(row.context ?? '') + tokensOf(output)
  const latencyMs = Math.round(base * (0.7 + tokensOf(output) / 60) * Math.pow(spec.maxTokens / 512, 0.15) * (0.8 + rand() * 0.6))
  const t = spec.thresholds
  const passed = accuracy >= t.accuracy && faithfulness >= t.faithfulness && relevance >= t.relevance && toxicity <= t.toxicity
  return { input: row.input, expected: row.expected, output, scores: { accuracy, faithfulness, relevance, toxicity }, latencyMs, tokens, passed }
}

const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function summarise(model: CatalogItem, results: PromptResult[], spec: TestConfigSpec): ModelSummary {
  const tokens = results.reduce((s, r) => s + r.tokens, 0)
  const sum: ModelSummary = {
    modelId: model.id,
    accuracy: round2(mean(results.map((r) => r.scores.accuracy))),
    faithfulness: round2(mean(results.map((r) => r.scores.faithfulness))),
    relevance: round2(mean(results.map((r) => r.scores.relevance))),
    toxicity: round2(mean(results.map((r) => r.scores.toxicity))),
    latencyP50: percentile(results.map((r) => r.latencyMs), 50),
    latencyP95: percentile(results.map((r) => r.latencyMs), 95),
    tokens,
    costCredits: Math.round((tokens / 1_000_000) * model.costPerUnit * 1000) / 1000,
    passRate: results.length ? results.filter((r) => r.passed).length / results.length : 0,
    passed: false,
    results,
  }
  sum.passed = meetsThresholds(sum, spec)
  return sum
}

export function meetsThresholds(s: ModelSummary, spec: TestConfigSpec) {
  const t = spec.thresholds
  const checks: Record<QaMetric, boolean> = {
    accuracy: s.accuracy >= t.accuracy,
    faithfulness: s.faithfulness >= t.faithfulness,
    relevance: s.relevance >= t.relevance,
    toxicity: s.toxicity <= t.toxicity,
    latencyP95: s.latencyP95 <= t.latencyP95,
  }
  return spec.metrics.every((m) => checks[m])
}

/** One number for "quality": higher is better, toxicity counts against it. */
export const qualityScore = (s: ModelSummary) => round2((s.accuracy + s.faithfulness + s.relevance + (1 - s.toxicity)) / 4)

export function metricValue(s: ModelSummary, m: QaMetric) {
  return m === 'latencyP95' ? s.latencyP95 : s[m]
}

/** Index of the best model for a metric. */
export function winnerFor(summaries: ModelSummary[], m: QaMetric) {
  if (!summaries.length) return -1
  const better = METRIC_INFO[m].better
  let best = 0
  summaries.forEach((s, i) => {
    const v = metricValue(s, m)
    const b = metricValue(summaries[best]!, m)
    if (better === 'higher' ? v > b : v < b) best = i
  })
  return best
}

export function formatMetric(m: QaMetric, v: number) {
  return m === 'latencyP95' ? `${Math.round(v)} ms` : v.toFixed(2)
}

/* ---------- CSV ---------- */

/** Splits CSV text into rows of cells, handling quotes, escaped quotes and commas or new lines inside quotes. */
function parseCsvCells(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export type CsvResult = { ok: true; rows: DatasetRow[] } | { ok: false; error: string }

export function parseDatasetCsv(text: string): CsvResult {
  const cells = parseCsvCells(text)
  if (cells.length === 0) return { ok: false, error: 'The file is empty. Add a header row with input and expected_output, then one row per prompt.' }
  const header = cells[0]!.map((h) => h.trim().toLowerCase())
  const iInput = header.indexOf('input')
  const iExpected = header.indexOf('expected_output')
  const iContext = header.indexOf('context')
  const missing = [iInput < 0 && 'input', iExpected < 0 && 'expected_output'].filter(Boolean)
  if (missing.length) return { ok: false, error: `The header row has no ${missing.join(' or ')} column. Name the columns input, expected_output and, if you like, context.` }
  const body = cells.slice(1)
  if (!body.length) return { ok: false, error: 'The file has a header but no prompts. Add at least one row.' }
  if (body.length > 500) return { ok: false, error: `The file has ${body.length} rows. Keep a dataset to 500 rows or fewer.` }
  const rows: DatasetRow[] = []
  for (let i = 0; i < body.length; i++) {
    const r = body[i]!
    const input = (r[iInput] ?? '').trim()
    const expected = (r[iExpected] ?? '').trim()
    const line = i + 2
    if (!input) return { ok: false, error: `Row ${line} has no input. Add it or remove the row.` }
    if (!expected) return { ok: false, error: `Row ${line} has no expected_output. Add it or remove the row.` }
    const context = iContext >= 0 ? (r[iContext] ?? '').trim() : ''
    rows.push({ input, expected, ...(context ? { context } : {}) })
  }
  return { ok: true, rows }
}

/* ---------- seeded history ---------- */

/** A few past runs so reports and dashboards are not empty on first sign-in. */
export function seedQaRuns(seed: SeedState): QaRun[] {
  const runs: QaRun[] = []
  const plan: { configId: string; models: string[]; daysAgo: number; actorId: string }[] = [
    { configId: 'cfg-sl-faq-compare', models: ['llm-sarvam', 'llm-gpt', 'llm-llama'], daysAgo: 5, actorId: 'u-sl-qa' },
    { configId: 'cfg-sl-reading-functional', models: ['llm-sarvam'], daysAgo: 3, actorId: 'u-sl-qa' },
    { configId: 'cfg-m4c-sdp-compare', models: ['llm-claude', 'llm-sarvam'], daysAgo: 4, actorId: 'u-m4c-qa' },
    { configId: 'cfg-m4c-coach-eval', models: ['llm-gpt'], daysAgo: 2, actorId: 'u-m4c-qa' },
  ]
  for (const p of plan) {
    const config = seed.testConfigs.find((c) => c.id === p.configId)
    if (!config) continue
    const spec = currentSpec(config)
    const dataset = seed.datasets.find((d) => d.id === spec.datasetId)
    if (!dataset) continue
    const models = p.models.map((id) => seed.catalog.find((c) => c.id === id)).filter((m): m is CatalogItem => !!m)
    const summaries = models.map((m) => summarise(m, dataset.rows.map((r) => evaluatePrompt(r, m, spec, seed.providers, dataset.language)), spec))
    const comparison = models.length > 1
    runs.push({
      id: `qr-seed-${p.configId}`,
      tenantId: config.tenantId,
      projectId: spec.projectId,
      configId: config.id,
      configVersion: currentVersion(config),
      kind: comparison ? 'comparison' : 'single',
      envId: null,
      actorId: p.actorId,
      at: new Date(Date.now() - p.daysAgo * 86_400_000).toISOString(),
      title: comparison ? `Compared ${models.map((m) => m.name).join(', ')}` : `Tested ${models[0]!.name}`,
      passed: comparison ? summaries.some((s) => s.passed) : summaries[0]!.passed,
      models: summaries,
    })
  }
  return runs
}

/* ---------- functional runs from the shared test runner ---------- */

/** Turns a pass/fail functional run into the same summary shape as a model test. */
export function functionalSummary(model: CatalogItem, cases: { input: string; expected: string }[], outcomes: { output: string; passed: boolean; latencyMs: number }[]): ModelSummary {
  const results: PromptResult[] = cases.map((c, i) => {
    const o = outcomes[i]!
    const v = o.passed ? 1 : 0
    return { input: c.input, expected: c.expected, output: o.output, scores: { accuracy: v, faithfulness: v, relevance: v, toxicity: 0 }, latencyMs: o.latencyMs, tokens: tokensOf(c.input) + tokensOf(o.output), passed: o.passed }
  })
  const tokens = results.reduce((s, r) => s + r.tokens, 0)
  const passRate = results.length ? results.filter((r) => r.passed).length / results.length : 0
  return {
    modelId: model.id,
    accuracy: round2(passRate),
    faithfulness: round2(passRate),
    relevance: round2(passRate),
    toxicity: 0,
    latencyP50: percentile(results.map((r) => r.latencyMs), 50),
    latencyP95: percentile(results.map((r) => r.latencyMs), 95),
    tokens,
    costCredits: Math.round((tokens / 1_000_000) * model.costPerUnit * 1000) / 1000,
    passRate,
    passed: passRate === 1,
    results,
  }
}
