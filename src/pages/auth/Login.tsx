import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Building2, ClipboardCheck, ShieldCheck, UserRound } from 'lucide-react'
import { useAppStore, useCurrentUser } from '@/store/useAppStore'
import { QUICK_SIGN_IN, SAMPLE_PASSWORD } from '@/data/seed'
import type { Role } from '@/data/types'
import { homeFor } from '@/lib/paths'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { AuthLayout } from './AuthLayout'

const ICONS: Record<Role, typeof ShieldCheck> = { super_admin: ShieldCheck, tenant_admin: Building2, user: UserRound, qa: ClipboardCheck }

export default function Login() {
  const user = useCurrentUser()
  const users = useAppStore((s) => s.users)
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
  const finish = (role: Role) => navigate(from && (from.startsWith(homeFor(role)) || from.startsWith('/environments/')) ? from : homeFor(role), { replace: true })

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
      const res = login(email, password)
      setSubmitting(false)
      if ('error' in res) {
        setErrors({ form: res.error })
        return
      }
      finish(res.user.role)
    }, 400)
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
            <Input id="email" type="email" autoComplete="email" placeholder="name@organisation.org" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password}>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} />
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
          <p className="eyebrow">Quick sign-in</p>
          <p className="mt-1 text-caption text-text-secondary">
            Every account uses the password <code className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-text-primary">{SAMPLE_PASSWORD}</code>.
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {QUICK_SIGN_IN.map((q) => {
              const u = users.find((x) => x.id === q.userId)
              if (!u) return null
              const Icon = ICONS[u.role]
              return (
                <li key={q.userId}>
                  <button
                    type="button"
                    onClick={() => {
                      const signed = quickLogin(u.id)
                      if (signed) finish(signed.role)
                    }}
                    className="flex w-full items-center gap-3 rounded-control border border-border-strong bg-bg-surface px-3 py-2.5 text-left transition-colors hover:bg-bg-subtle"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-text">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-indigo-text">{q.label}</span>
                      <span className="block truncate font-mono text-caption text-text-secondary">{u.email}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </AuthLayout>
  )
}
