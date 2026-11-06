import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { Role } from '@/data/types'
import { useCurrentUser } from '@/store/useAppStore'
import { homeFor } from '@/lib/paths'

export { homeFor }

export function RequireRole({ role }: { role: Role }) {
  const user = useCurrentUser()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}
