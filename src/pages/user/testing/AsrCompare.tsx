import { useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, Check, Pause, Play } from 'lucide-react'
import type { Environment } from '@/data/types'
import { ASR_CLIPS, hashString, seededRandom, type AsrClip } from '@/data/seed'
import { useAppStore } from '@/store/useAppStore'
import { transcribe, type AsrResult, type WordOp } from '@/lib/mock'
import { formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { RadioCardItem, RadioGroup } from '@/components/ui/controls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const BARS = 64

function ClipPlayer({ clip }: { clip: AsrClip }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const heights = useMemo(() => {
    const rand = seededRandom(hashString(clip.id))
    return Array.from({ length: BARS }, (_, i) => 0.2 + Math.abs(Math.sin(i / 3.2)) * 0.5 + rand() * 0.3)
  }, [clip.id])

  useEffect(() => {
    setPlaying(false)
    setProgress(0)
  }, [clip.id])

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => {
      setProgress((p) => {
        const next = p + 0.1 / clip.durationSec
        if (next >= 1) {
          setPlaying(false)
          return 0
        }
        return next
      })
    }, 100)
    return () => clearInterval(t)
  }, [playing, clip.durationSec])

  const elapsed = Math.round(progress * clip.durationSec)

  return (
    <div className="flex items-center gap-4 rounded-card border border-border bg-bg-subtle p-4">
      <Button variant="secondary" size="icon" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause clip' : 'Play clip'}>
        {playing ? <Pause /> : <Play />}
      </Button>
      <div className="flex h-12 flex-1 items-center gap-[3px]" aria-hidden>
        {heights.map((h, i) => (
          <span
            key={i}
            className={cn('flex-1 rounded-full transition-colors', i / BARS <= progress && (playing || progress > 0) ? 'bg-indigo dark:bg-indigo-text' : 'bg-border-strong')}
            style={{ height: `${h * 100}%` }}
          />
        ))}
      </div>
      <span className="tabular w-12 text-right text-caption text-text-secondary">
        0:{String(elapsed).padStart(2, '0')} / 0:{String(clip.durationSec).padStart(2, '0')}
      </span>
    </div>
  )
}

function Transcript({ ops }: { ops: WordOp[] }) {
  return (
    <p className="text-base leading-8 text-text-primary">
      {ops.map((op, i) => {
        if (op.type === 'ok') return <span key={i}>{op.hyp} </span>
        if (op.type === 'sub')
          return (
            <span key={i}>
              <mark className="rounded bg-status-over-bg px-1 text-status-over-fg underline decoration-vermilion decoration-2 underline-offset-4" title={`Heard “${op.hyp}”, expected “${op.ref}”`}>
                {op.hyp}
              </mark>{' '}
            </span>
          )
        if (op.type === 'del')
          return (
            <span key={i}>
              <del className="rounded bg-bg-subtle px-1 text-text-muted" title={`Missed “${op.ref}”`}>
                {op.ref}
              </del>{' '}
            </span>
          )
        return (
          <span key={i}>
            <ins className="rounded bg-status-pending-bg px-1 text-status-pending-fg no-underline" title={`Extra word “${op.hyp}”`}>
              {op.hyp}
            </ins>{' '}
          </span>
        )
      })}
    </p>
  )
}

export function AsrCompare({ env }: { env: Environment }) {
  const catalog = useAppStore((s) => s.catalog)
  const providers = useAppStore((s) => s.providers)
  const asrItems = catalog.filter((c) => c.category === 'asr' && c.status !== 'deprecated')
  const defaults = [...env.spec.asr, 'asr-indicconformer', 'asr-whisper', 'asr-bhashini'].filter((v, i, a) => a.indexOf(v) === i)
  const [clipId, setClipId] = useState(ASR_CLIPS.find((c) => env.spec.languages.includes(c.language))?.id ?? ASR_CLIPS[0]!.id)
  const [a, setA] = useState(defaults[0]!)
  const [b, setB] = useState(defaults[1]!)
  const [results, setResults] = useState<AsrResult[] | null>(null)
  const [pending, setPending] = useState(false)
  const timer = useRef<number>()
  const clip = ASR_CLIPS.find((c) => c.id === clipId)!

  useEffect(() => () => clearTimeout(timer.current), [])

  const run = () => {
    const out = [a, b].map((id) => transcribe(clip, catalog.find((c) => c.id === id)!, providers))
    setResults(null)
    setPending(true)
    timer.current = window.setTimeout(() => {
      setResults(out)
      setPending(false)
    }, Math.min(Math.max(...out.map((r) => r.latencyMs)), 2200))
  }

  const supported = results?.filter((r) => r.supported) ?? []
  const best = supported.length === 2 ? (supported[0]!.wer <= supported[1]!.wer ? supported[0]!.providerId : supported[1]!.providerId) : null

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-5 p-6">
        <div>
          <p className="mb-3 text-sm font-semibold text-text-primary">Sample clip</p>
          <RadioGroup
            value={clipId}
            onValueChange={(v) => {
              setClipId(v)
              setResults(null)
            }}
            className="md:grid-cols-3"
            aria-label="Sample clip"
          >
            {ASR_CLIPS.map((c) => (
              <RadioCardItem
                key={c.id}
                value={c.id}
                className="card relative flex flex-col gap-1 p-4 text-left hover:border-border-strong data-[state=checked]:border-2 data-[state=checked]:border-indigo data-[state=checked]:p-[15px] dark:data-[state=checked]:border-indigo-text [&[data-state=checked]_.check]:flex"
              >
                <span className="check absolute right-3 top-3 hidden size-5 items-center justify-center rounded-full bg-indigo text-white">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                </span>
                <span className="flex items-center gap-2 pr-6 font-semibold text-text-primary">
                  <AudioLines className="size-4 text-indigo-text" aria-hidden /> {c.title}
                </span>
                <span className="text-caption text-text-secondary">
                  {c.language} · {c.durationSec} seconds
                </span>
                <span className="text-caption text-text-muted">{c.speaker}</span>
              </RadioCardItem>
            ))}
          </RadioGroup>
        </div>

        <ClipPlayer clip={clip} />
        <p className="-mt-3 text-caption text-text-muted">Audio playback is simulated in this prototype. The transcripts below are compared with a human-checked reference.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ['Provider A', a, setA, b],
              ['Provider B', b, setB, a],
            ] as const
          ).map(([label, value, setter, other]) => (
            <Field key={label} label={label}>
              <Select
                value={value}
                onValueChange={(v) => {
                  setter(v)
                  setResults(null)
                }}
              >
                <SelectTrigger aria-label={label}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {asrItems.map((item) => (
                    <SelectItem key={item.id} value={item.id} disabled={item.id === other}>
                      {item.name}
                      {env.spec.asr.includes(item.id) ? ' · in this environment' : ''}
                      {!item.languages.includes(clip.language) ? ` · no ${clip.language}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ))}
        </div>

        <div className="flex justify-end">
          <Button onClick={run} disabled={pending}>
            <AudioLines /> {pending ? 'Transcribing…' : 'Transcribe with both'}
          </Button>
        </div>
      </section>

      {(pending || results) && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[a, b].map((id, i) => {
              const item = catalog.find((c) => c.id === id)!
              const r = results?.[i]
              return (
                <article key={id} className="card flex flex-col gap-4 p-5">
                  <header className="flex items-start justify-between gap-2">
                    <div>
                      <p className="eyebrow">{i === 0 ? 'Provider A' : 'Provider B'}</p>
                      <h3 className="font-heading text-h3 text-text-primary">{item.name}</h3>
                    </div>
                    {r && best === id && <StatusBadge status="running" label="More accurate" />}
                  </header>
                  {!r ? (
                    <div className="flex flex-col gap-2">
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-5 w-4/5" />
                    </div>
                  ) : providers.some((p) => p.serves.includes(id) && !p.enabled) ? (
                    <p className="rounded-control bg-status-stopped-bg px-3 py-2.5 text-sm text-status-stopped-fg">
                      {item.name} is disabled by your admin, so it can’t transcribe right now.
                    </p>
                  ) : !r.supported ? (
                    <p className="rounded-control bg-status-stopped-bg px-3 py-2.5 text-sm text-status-stopped-fg">
                      {item.name} doesn’t support {clip.language}. Pick another provider to compare.
                    </p>
                  ) : (
                    <>
                      <Transcript ops={r.ops} />
                      <dl className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-caption">
                        <div>
                          <dt className="text-text-muted">Word error rate</dt>
                          <dd className="tabular font-heading text-h3 text-text-primary">{Math.round(r.wer * 100)}%</dd>
                        </div>
                        <div>
                          <dt className="text-text-muted">Latency</dt>
                          <dd className="tabular font-semibold text-text-primary">{formatInt(r.latencyMs)} ms</dd>
                        </div>
                        <div>
                          <dt className="text-text-muted">Cost</dt>
                          <dd className="tabular font-semibold text-text-primary">{r.cost.toFixed(3)} credits</dd>
                        </div>
                      </dl>
                    </>
                  )}
                </article>
              )
            })}
          </div>

          <section className="card p-5">
            <p className="eyebrow mb-2">Reference transcript</p>
            <p className="text-base leading-8 text-text-primary">{clip.reference}</p>
            <p className="mt-1 text-sm italic text-text-secondary">“{clip.gloss}”</p>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-caption text-text-secondary">
              <li className="flex items-center gap-1.5">
                <mark className="rounded bg-status-over-bg px-1.5 text-status-over-fg">word</mark> Misheard
              </li>
              <li className="flex items-center gap-1.5">
                <del className="rounded bg-bg-subtle px-1.5 text-text-muted">word</del> Missed
              </li>
              <li className="flex items-center gap-1.5">
                <ins className="rounded bg-status-pending-bg px-1.5 text-status-pending-fg no-underline">word</ins> Extra
              </li>
              <li>Word error rate counts every misheard, missed or extra word. Lower is better.</li>
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
