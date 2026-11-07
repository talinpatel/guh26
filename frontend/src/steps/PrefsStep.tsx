import { useState } from 'react'
import { Plus } from 'lucide-react'
import Nav from './Nav.tsx'

const EXAMPLES = ['Keep Sundays free', 'Max 20 hours a week', 'No work before 12pm', 'I ride for Deliveroo and Uber Eats']

export default function PrefsStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [value, onChange] = useState('')
  return (
    <>
      <h2 id="step-title" className="text-2xl font-semibold text-stone-900">Describe your schedule preferences</h2>
      <p className="mt-1 text-sm text-stone-500">Tell us in your own words: hours, days off, platforms, anything.</p>

      <label htmlFor="prefs" className="sr-only">
        Work preferences
      </label>
      <textarea
        id="prefs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder="e.g. I ride for Deliveroo and Uber Eats. Keep Sundays free, max 20 hours a week."
        className="mt-5 w-full resize-none rounded-2xl border border-stone-200 bg-paper p-4 text-sm placeholder:text-stone-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => onChange(value ? `${value.trim()}. ${ex}` : ex)}
            className="inline-flex items-center gap-1 rounded-full border border-stone-200 px-3 py-1.5 text-xs text-stone-600 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
          >
            <Plus className="size-3" /> {ex}
          </button>
        ))}
      </div>

      <Nav onBack={onBack} onNext={onNext} />
    </>
  )
}
