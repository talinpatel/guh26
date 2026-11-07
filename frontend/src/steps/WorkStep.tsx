import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import Nav from './Nav.tsx'
import { GIG_COMPANIES, WORK } from '../constants/onboarding.ts'

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-200 text-stone-600 hover:border-brand-400 hover:bg-brand-50'}`

// One job only for now: either a gig company + mode, or one "other" job with its own pay.
export type Work = { job: string; mode: string | null; hourlyPay: number }

export default function WorkStep({ onBack, onNext }: { onBack: () => void; onNext: (w: Work) => void }) {
  const [gig, setGig] = useState<{ company: string; mode: string } | null>(null)
  // pay stays a string so the input can be edited freely
  const [other, setOther] = useState<{ name: string; pay: string } | null>(null)

  const pickCompany = (company: string) => {
    setGig(gig?.company === company ? null : { company, mode: '' })
    setOther(null)
  }

  const work: Work | null = gig?.mode
    ? { job: gig.company, mode: gig.mode, hourlyPay: GIG_COMPANIES[gig.company].rate }
    : other?.name.trim() && Number(other.pay) > 0
      ? { job: other.name.trim(), mode: null, hourlyPay: Number(other.pay) }
      : null

  const input = 'rounded-xl border border-stone-200 bg-paper px-3 py-2 text-sm focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none'
  return (
    <>
      <h2 id="step-title" className="text-2xl font-semibold text-stone-900">{WORK.title}</h2>
      <p className="mt-1 text-sm text-stone-500">{WORK.subtitle}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {Object.keys(GIG_COMPANIES).map((c) => (
          <button key={c} aria-pressed={gig?.company === c} onClick={() => pickCompany(c)} className={chip(gig?.company === c)}>
            {c}
          </button>
        ))}
      </div>

      {gig && (
        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium text-stone-900">{gig.company}</legend>
          <div className="flex flex-wrap gap-2">
            {GIG_COMPANIES[gig.company].modes.map((m) => (
              <button key={m} aria-pressed={gig.mode === m} onClick={() => setGig({ ...gig, mode: m })} className={chip(gig.mode === m)}>
                {m}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-stone-500">
            {WORK.estimate} {WORK.currency}{GIG_COMPANIES[gig.company].rate}{WORK.perHour}
          </p>
        </fieldset>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-medium text-stone-900">{WORK.otherTitle}</h3>
        {other ? (
          <div className="mt-2 flex items-center gap-2">
            <input aria-label={WORK.otherName} placeholder={WORK.otherName} value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} className={`${input} min-w-0 flex-1`} />
            <span className="text-sm text-stone-500">{WORK.currency}</span>
            <input aria-label={WORK.otherPay} placeholder="12" type="number" min="0" step="0.5" inputMode="decimal" value={other.pay} onChange={(e) => setOther({ ...other, pay: e.target.value })} className={`${input} w-20`} />
            <span className="text-sm text-stone-500">{WORK.perHour}</span>
            <button aria-label={WORK.remove} onClick={() => setOther(null)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button onClick={() => { setOther({ name: '', pay: '' }); setGig(null) }} className="mt-3 inline-flex items-center gap-1 rounded-full border border-stone-200 px-3 py-1.5 text-xs text-stone-600 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700">
            <Plus className="size-3" /> {WORK.otherAdd}
          </button>
        )}
      </div>

      <Nav onBack={onBack} onNext={() => work && onNext(work)} disabled={!work} />
    </>
  )
}
