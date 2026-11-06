import type { CatalogItem, Suggestion, Tenant } from '@/data/types'

export const GITHUB_RE = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/

export function parseGithubUrl(raw: string): { owner: string; repo: string; normalised: string } | null {
  const m = GITHUB_RE.exec(raw.trim())
  if (!m) return null
  const owner = m[1]!
  const repo = m[2]!
  return { owner, repo, normalised: `https://github.com/${owner}/${repo}`.toLowerCase() }
}

export const normaliseGitUrl = (url: string | null | undefined) => (url ? (parseGithubUrl(url)?.normalised ?? url.toLowerCase()) : null)

/** Turns "llama_index" or "auto-gen" into "Llama Index" / "Auto Gen". */
export const nameFromRepo = (repo: string) =>
  repo
    .replace(/[-_.]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()

export const isVisibleTo = (item: CatalogItem, tenantId: string) => item.availability === 'all' || item.availability.includes(tenantId)

export const isEnabledFor = (item: CatalogItem, tenant: Tenant) =>
  isVisibleTo(item, tenant.id) && tenant.enabledItemIds.includes(item.id) && item.status !== 'deprecated'

export type Duplicate =
  | { kind: 'available'; itemId: string; visible: boolean }
  | { kind: 'suggested'; suggestionId: string; visible: boolean }
  | null

const OPEN = ['submitted', 'under_review', 'needs_info'] as const

export function findDuplicate(url: string, tenantId: string, catalog: CatalogItem[], suggestions: Suggestion[]): Duplicate {
  const n = normaliseGitUrl(url)
  if (!n) return null
  const item = catalog.find((c) => normaliseGitUrl(c.gitUrl) === n)
  if (item) {
    const visible = isVisibleTo(item, tenantId)
    if (visible) return { kind: 'available', itemId: item.id, visible }
  }
  const s = suggestions.find((x) => normaliseGitUrl(x.githubUrl) === n && ((OPEN as readonly string[]).includes(x.status) || x.status === 'approved_tenant'))
  if (s) return { kind: 'suggested', suggestionId: s.id, visible: s.tenantId === tenantId }
  if (item) return { kind: 'suggested', suggestionId: '', visible: false }
  return null
}
