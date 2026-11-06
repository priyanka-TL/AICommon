import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Building2, ShieldCheck } from 'lucide-react'
import { useAppStore, useCurrentUser } from '@/store/useAppStore'
import { homeFor } from '@/components/layout/RequireRole'
import type { Role } from '@/data/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { AuthLayout } from './AuthLayout'

export default function Login() {
  const user = useCurrentUser()
  const login = useAppStore((s) => s.login)
  const quickLogin = useAppStore((s) => s.quickLogin)
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to={homeFor(user.role)} replace />

  const from = (location.state as { from?: string } | null)?.from

  const finish = (role: Role) => {
    const target = from && from.startsWith(homeFor(role)) ? from : homeFor(role)
    navigate(target, { replace: true })
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!email.trim()) next.email = 'Enter your work email.'
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'This doesn’t look like an email address. Check for typos.'
    if (!password) next.password = 'Enter your password.'
    setErrors(next)
    if (Object.keys(next).length) return
    setSubmitting(true)
    setTimeout(() => {
      const u = login(email)
      setSubmitting(false)
      if (!u) {
        setErrors({ form: 'We couldn’t find an active account for this email. Check the address, or use demo access below.' })
        return
      }
      finish(u.role)
    }, 500)
  }

  return (
    <AuthLayout>
      <div className="card p-6 sm:p-8">
        <h2 className="font-heading text-h2 text-text-primary">Sign in</h2>
        <p className="mt-1 text-sm text-text-secondary">Use the work email your organisation registered with.</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {errors.form && (
            <div className="rounded-control border border-status-rejected-bg bg-status-rejected-bg px-3 py-2.5 text-caption text-status-rejected-fg" role="alert">
              {errors.form}
            </div>
          )}
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="name@organisation.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.email}
            />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
            />
          </Field>
          <div className="-mt-1 flex justify-end">
            <Link to="/forgot-password" className="link text-caption">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-8 border-t border-border pt-6">
          <p className="eyebrow">Demo access</p>
          <p className="mt-1 text-caption text-text-secondary">Skip the form and explore each role.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => finish(quickLogin('admin').role)}>
              <ShieldCheck /> Sign in as Admin
            </Button>
            <Button variant="secondary" onClick={() => finish(quickLogin('user').role)}>
              <Building2 /> Sign in as User
            </Button>
          </div>
          <p className="mt-3 text-caption text-text-muted">
            Admin: Rohan Mehta, ShikshaLokam. User: Ananya Rao, Kisan Voice Foundation.
          </p>
        </div>
      </div>
    </AuthLayout>
  )
}
