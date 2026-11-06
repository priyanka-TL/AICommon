import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { AuthLayout } from './AuthLayout'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter the email address you sign in with.')
      return
    }
    setError(null)
    setSending(true)
    setTimeout(() => {
      setSending(false)
      setSent(true)
    }, 600)
  }

  return (
    <AuthLayout>
      <div className="card p-6 sm:p-8">
        {sent ? (
          <div className="flex flex-col items-start gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-text">
              <MailCheck className="size-6" aria-hidden />
            </span>
            <h2 className="font-heading text-h2 text-text-primary">Check your inbox</h2>
            <p className="text-sm text-text-secondary">
              If an account exists for <span className="font-semibold text-text-primary">{email}</span>, a reset link is on its way. It
              expires in 30 minutes.
            </p>
            <Button asChild variant="secondary" className="mt-3">
              <Link to="/login">
                <ArrowLeft /> Back to sign in
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <h2 className="font-heading text-h2 text-text-primary">Reset your password</h2>
            <p className="mt-1 text-sm text-text-secondary">We’ll email you a link to choose a new password.</p>
            <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
              <Field label="Email" htmlFor="email" error={error}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@organisation.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!error}
                />
              </Field>
              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? 'Sending…' : 'Send reset link'}
              </Button>
              <Link to="/login" className="link flex items-center justify-center gap-1.5 text-sm">
                <ArrowLeft className="size-4" /> Back to sign in
              </Link>
            </form>
          </>
        )}
      </div>
    </AuthLayout>
  )
}
