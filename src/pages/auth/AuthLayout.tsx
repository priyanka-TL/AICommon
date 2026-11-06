import { FlaskConical, Languages, Rocket } from 'lucide-react'
import { Wordmark } from '@/components/shared/Wordmark'
import { FOOTER_NOTE, PRODUCT_NAME } from '@/lib/brand'

const points = [
  { icon: Rocket, text: 'Request a ready environment in days, not months.', tone: 'text-yellow' },
  { icon: Languages, text: 'Compare models and speech providers in Indian languages.', tone: 'text-teal' },
  { icon: FlaskConical, text: 'Test quality and load before you go to the field.', tone: 'text-yellow' },
]

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg-surface lg:flex-row">
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo to-purple px-6 py-8 text-white sm:px-10 lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full border-[40px] border-white/5" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full border-[56px] border-white/5" />
        <Wordmark onDark className="relative" />
        <div className="relative mt-8 max-w-lg lg:mt-0">
          <h1 className="font-heading text-[28px] font-bold leading-[36px] sm:text-[38px] sm:leading-[48px]">
            Build and test AI for your programmes, together.
          </h1>
          <p className="mt-4 text-body text-white/90 sm:text-[17px] sm:leading-7">
            {PRODUCT_NAME} gives partner organisations shared compute, models and testing tools, so teams can spend their time on
            the people they work with.
          </p>
          <ul className="mt-8 hidden flex-col gap-4 sm:flex">
            {points.map((p) => (
              <li key={p.text} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <p.icon className={`size-[18px] ${p.tone}`} aria-hidden />
                </span>
                <span className="text-body text-white">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
        {FOOTER_NOTE ? <p className="relative mt-8 hidden text-caption text-white/75 lg:block">{FOOTER_NOTE}</p> : <span className="hidden lg:block" />}
      </section>

      <section className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">{children}</div>
        {FOOTER_NOTE && <p className="mt-8 text-caption text-text-muted lg:hidden">{FOOTER_NOTE}</p>}
      </section>
    </div>
  )
}
