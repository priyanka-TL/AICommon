import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => React.ReactNode
  align?: 'left' | 'right'
  /** Applied to both header and cells, e.g. 'hidden lg:table-cell'. */
  className?: string
}

interface DataTableProps<T> {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  rowLabel?: (row: T) => string
  onRowClick?: (row: T) => void
  /** Stacked card shown below 768px. */
  mobileCard: (row: T) => React.ReactNode
  loading?: boolean
  empty: React.ReactNode
}

export function DataTable<T>({ rows, columns, rowKey, rowLabel, onRowClick, mobileCard, loading, empty }: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="card divide-y divide-border overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="hidden h-5 w-32 md:block" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  if (!rows.length) return <div className="card">{empty}</div>

  const activate = (row: T) => onRowClick?.(row)

  return (
    <div className="card overflow-hidden">
      <table className="hidden w-full text-sm md:table">
        <thead className="bg-bg-subtle text-left">
          <tr>
            {columns.map((c, i) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'py-3 text-caption font-semibold text-text-secondary',
                  i === 0 ? 'pl-5 pr-3' : i === columns.length - 1 ? 'pl-3 pr-5' : 'px-3',
                  c.align === 'right' && 'text-right',
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              tabIndex={onRowClick ? 0 : undefined}
              aria-label={rowLabel?.(row)}
              onClick={() => activate(row)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  activate(row)
                }
              }}
              className={cn('h-[52px]', onRowClick && 'cursor-pointer hover:bg-bg-subtle')}
            >
              {columns.map((c, i) => (
                <td
                  key={c.key}
                  className={cn(
                    'py-2.5 align-middle',
                    i === 0 ? 'pl-5 pr-3' : i === columns.length - 1 ? 'pl-3 pr-5' : 'px-3',
                    c.align === 'right' && 'tabular text-right',
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-border md:hidden">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            tabIndex={onRowClick ? 0 : undefined}
            aria-label={rowLabel?.(row)}
            onClick={() => activate(row)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return
              if (e.key === 'Enter') activate(row)
            }}
            className={cn('px-4 py-4', onRowClick && 'cursor-pointer hover:bg-bg-subtle')}
          >
            {mobileCard(row)}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Wrap interactive content inside a clickable row so it doesn't trigger the row. */
export function StopRowClick({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  )
}
