import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { axisProps, CHART_COLORS, CHART_GRID } from '@/lib/chart'
import { formatCompact, formatINR } from '@/lib/format'
import { ChartTooltip } from './ChartCard'

/** Horizontal bars of ₹ amounts, one per label, in chart palette order. */
export function CostBarChart({ data, name = 'Cost', labelWidth = 128 }: { data: { label: string; value: number }[]; name?: string; labelWidth?: number }) {
  if (!data.length) return <p className="flex h-full items-center justify-center text-sm text-text-secondary">No usage yet this month.</p>
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={CHART_GRID} horizontal={false} />
        <XAxis type="number" {...axisProps} tickFormatter={(v: number) => `₹${formatCompact(v)}`} />
        <YAxis type="category" dataKey="label" {...axisProps} width={labelWidth} />
        <Tooltip cursor={{ fill: 'rgb(var(--bg-subtle))' }} content={<ChartTooltip valueFormatter={formatINR} />} />
        <Bar dataKey="value" name={name} radius={[0, 6, 6, 0]} barSize={16}>
          {data.map((d, i) => (
            <Cell key={d.label} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
