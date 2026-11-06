/** Series order from CLAUDE.md §3.5, as CSS-variable colours so charts follow the theme. */
export const CHART_COLORS = [
  'rgb(var(--indigo))',
  'rgb(var(--teal))',
  'rgb(var(--tangerine))',
  'rgb(var(--blue))',
  'rgb(var(--pink))',
  'rgb(var(--clay))',
  'rgb(var(--cyan))',
  'rgb(var(--terracotta))',
]

export const CHART_GRID = 'rgb(var(--border))'
export const CHART_AXIS = 'rgb(var(--text-muted))'

export const axisProps = {
  stroke: CHART_GRID,
  tick: { fill: CHART_AXIS, fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const
