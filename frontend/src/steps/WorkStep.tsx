import { useState } from 'react'
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

  const companies = Object.keys(picked)
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

      <Nav onBack={onBack} onNext={onNext} disabled={!companies.length || companies.some((c) => !picked[c])} />
    </>
  )
}
