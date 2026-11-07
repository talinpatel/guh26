import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2, Sparkles } from 'lucide-react'
import CalendarStep from './steps/CalendarStep.tsx'
import WorkStep from './steps/WorkStep.tsx'
import PrefsStep from './steps/PrefsStep.tsx'
import BankStep from './steps/BankStep.tsx'
import { BUILDING, STEPS, WELCOME } from './constants/onboarding.ts'

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0) // 0 welcome, 1-4 STEPS, 5 building

  function build() {
    setStep(5)
    // shortcut: fake 2s wait, replace with the backend call that builds the schedule.
    setTimeout(() => {
      localStorage.setItem('onboarded', '1')
      navigate('/planner', { replace: true })
    }, 2000)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_top,var(--color-brand-100),transparent_60%)] p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="step-title" className="my-auto w-full max-w-xl rounded-3xl border border-stone-200/70 bg-white p-6 shadow-xl shadow-brand-900/5 sm:p-8">
        {step >= 1 && step <= 4 && (
          <ol className="mb-6 flex gap-2">
            {STEPS.map((s, i) => (
              <li key={s} className="flex-1">
                <div className={`h-1.5 rounded-full transition-colors ${i < step ? 'bg-brand-600' : 'bg-stone-200'}`} />
                <span className={`mt-2 block text-xs font-medium ${i + 1 === step ? 'text-stone-900' : 'text-stone-400'}`}>{s}</span>
              </li>
            ))}
          </ol>
        )}

        {step === 0 && (
          <div className="py-6 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white">
              <Sparkles className="size-7" />
            </div>
            <h1 id="step-title" className="mt-6 text-4xl font-bold text-stone-900">
              {WELCOME.titlePrefix}<span className="text-brand-600">{WELCOME.brand}</span>
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-stone-500">{WELCOME.tagline}</p>
            <button onClick={() => setStep(1)} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white transition hover:bg-brand-700">
              {WELCOME.cta} <ArrowRight className="size-4" />
            </button>
          </div>
        )}
        {step === 1 && <CalendarStep onNext={() => setStep(2)} />}
        {step === 2 && <WorkStep onBack={() => setStep(1)} onNext={() => setStep(3)} />}
        {step === 3 && <PrefsStep onBack={() => setStep(2)} onNext={() => setStep(4)} />}
        {step === 4 && <BankStep onBack={() => setStep(3)} onNext={build} />}
        {step === 5 && (
          <div className="flex flex-col items-center py-12 text-center" aria-live="polite">
            <Loader2 className="size-10 animate-spin text-brand-600" />
            <h2 id="step-title" className="mt-5 text-xl font-semibold text-stone-900">{BUILDING.title}</h2>
            <p className="mt-1 text-sm text-stone-500">{BUILDING.subtitle}</p>
          </div>
        )}
      </div>
    </div>
  )
}
