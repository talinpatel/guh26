import { useState } from 'react'
import { CheckCircle2, FileUp } from 'lucide-react'
import Nav from './Nav.tsx'

const option = (active: boolean) =>
  `flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-sm font-medium transition ${
    active ? 'border-brand-600 bg-brand-50 text-brand-800 ring-4 ring-brand-100' : 'border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-stone-50'
  }`

export default function CalendarStep({ onNext }: { onNext: () => void }) {
  const [source, setSource] = useState('')

  return (
    <>
      <h2 id="step-title" className="text-2xl font-semibold text-stone-900">Import calendar data</h2>
      <p className="mt-1 text-sm text-stone-500">We plan work around what you've already committed to.</p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {['Apple', 'Google'].map((s) => (
          <button key={s} onClick={() => setSource(s)} className={option(source === s)}>
            {s}
          </button>
        ))}
        <label className={option(source === '.ics file')}>
          <FileUp className="size-6" />
          Import .ics
          <input type="file" accept=".ics,text/calendar" className="sr-only" onChange={(e) => e.target.files?.[0] && setSource('.ics file')} />
        </label>
      </div>

      {source && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3">
          <CheckCircle2 className="size-5 shrink-0 text-brand-600" />
          <p className="text-sm text-brand-900">
            <strong>Connected to {source}.</strong> We'll plan around your existing events.
          </p>
        </div>
      )}

      <Nav onNext={onNext} disabled={!source} />
    </>
  )
}
