import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import Nav from './Nav.tsx'
import { GIG_COMPANIES, WORK } from '../constants/onboarding.ts'

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-200 text-stone-600 hover:border-brand-400 hover:bg-brand-50'}`

export default function WorkStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  // company -> chosen mode; presence of the key means the company is selected
  const [picked, setPicked] = useState<Record<string, string>>({})

  function toggle(company: string) {
    setPicked(({ [company]: was, ...rest }) => (was === undefined ? { ...rest, [company]: '' } : rest))
  }

  // "other work" rows; pay stays a string so the input can be edited freely
  const [other, setOther] = useState<{ name: string; pay: string }[]>([])
  const editOther = (i: number, patch: Partial<{ name: string; pay: string }>) =>
    setOther(other.map((o, j) => (j === i ? { ...o, ...patch } : o)))

  const companies = Object.keys(picked)
  const gigsOk = companies.every((c) => picked[c])
  const otherOk = other.every((o) => o.name.trim() && Number(o.pay) > 0)
  const input = 'rounded-xl border border-stone-200 bg-paper px-3 py-2 text-sm focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none'
  return (
    <>
      <h2 id="step-title" className="text-2xl font-semibold text-stone-900">{WORK.title}</h2>
      <p className="mt-1 text-sm text-stone-500">{WORK.subtitle}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {Object.keys(GIG_COMPANIES).map((c) => (
          <button key={c} aria-pressed={c in picked} onClick={() => toggle(c)} className={chip(c in picked)}>
            {c}
          </button>
        ))}
      </div>

      {companies.map((c) => (
        <fieldset key={c} className="mt-5">
          <legend className="mb-2 text-sm font-medium text-stone-900">{c}</legend>
          <div className="flex flex-wrap gap-2">
            {GIG_COMPANIES[c].map((m) => (
              <button key={m} aria-pressed={picked[c] === m} onClick={() => setPicked({ ...picked, [c]: m })} className={chip(picked[c] === m)}>
                {m}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="mt-6">
        <h3 className="text-sm font-medium text-stone-900">{WORK.otherTitle}</h3>
        {other.map((o, i) => (
          <div key={i} className="mt-2 flex items-center gap-2">
            <input aria-label={WORK.otherName} placeholder={WORK.otherName} value={o.name} onChange={(e) => editOther(i, { name: e.target.value })} className={`${input} min-w-0 flex-1`} />
            <span className="text-sm text-stone-500">{WORK.currency}</span>
            <input aria-label={WORK.otherPay} placeholder="12" type="number" min="0" step="0.5" inputMode="decimal" value={o.pay} onChange={(e) => editOther(i, { pay: e.target.value })} className={`${input} w-20`} />
            <span className="text-sm text-stone-500">{WORK.perHour}</span>
            <button aria-label={WORK.remove} onClick={() => setOther(other.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
              <X className="size-4" />
            </button>
          </div>
        ))}
        <button onClick={() => setOther([...other, { name: '', pay: '' }])} className="mt-3 inline-flex items-center gap-1 rounded-full border border-stone-200 px-3 py-1.5 text-xs text-stone-600 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700">
          <Plus className="size-3" /> {WORK.otherAdd}
        </button>
      </div>

      <Nav onBack={onBack} onNext={onNext} disabled={!(companies.length || other.length) || !gigsOk || !otherOk} />
    </>
  )
}
