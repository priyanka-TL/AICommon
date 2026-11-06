import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/store/useAppStore'
import { homeFor } from '@/components/layout/RequireRole'

export default function NotFound({ message }: { message?: string }) {
  const user = useCurrentUser()
  return (
    <div className="card">
      <EmptyState
        icon={Compass}
        title="We couldn’t find that page"
        description={message ?? 'The link may be out of date, or the item was removed. Head back to your dashboard to continue.'}
        action={
          <Button asChild>
            <Link to={user ? homeFor(user.role) : '/login'}>Go to dashboard</Link>
          </Button>
        }
      />
    </div>
  )
}
