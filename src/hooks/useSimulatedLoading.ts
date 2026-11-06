import { useEffect, useState } from 'react'

/** Brief skeleton state so pages feel like they fetch data. */
export function useSimulatedLoading(ms = 450) {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms)
    return () => clearTimeout(t)
  }, [ms])
  return loading
}
