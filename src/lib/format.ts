const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const numberFmt = new Intl.NumberFormat('en-IN')
const compactFmt = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })

export function formatNumber(n: number, digits = 0) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n)
}

export function formatInt(n: number) {
  return numberFmt.format(Math.round(n))
}

export function formatCompact(n: number) {
  return compactFmt.format(n)
}

export function formatINR(n: number) {
  return `₹${numberFmt.format(Math.round(n))}`
}

export function formatCredits(n: number) {
  return `${numberFmt.format(Math.round(n))} credits`
}

export function formatHours(n: number) {
  return `${formatNumber(n, 1)} h`
}

export function formatPercent(n: number, digits = 0) {
  return `${n.toFixed(digits)}%`
}

export function formatDate(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function formatShortDate(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function formatTime(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatDateTime(iso: string | Date) {
  return `${formatDate(iso)}, ${formatTime(iso)}`
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 14) return `${d} days ago`
  return formatDate(iso)
}

export const plural = (n: number, word: string) => `${formatInt(n)} ${word}${n === 1 ? '' : 's'}`

/** 4 min 12 s, 1 h 5 min, 38 s */
export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h) return `${h} h ${m} min`
  if (m) return `${m} min ${s} s`
  return `${s} s`
}
