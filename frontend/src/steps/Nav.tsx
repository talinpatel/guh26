import { ArrowLeft, ArrowRight } from 'lucide-react'

type Props = { onBack?: () => void; onNext: () => void; nextLabel?: string; disabled?: boolean }

export default function Nav({ onBack, onNext, nextLabel = 'Continue', disabled }: Props) {
  return (
    <div className="mt-8 flex justify-between">
      {onBack ? (
        <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100">
          <ArrowLeft className="size-4" /> Back
        </button>
      ) : (
        <span />
      )}
      <button
        onClick={onNext}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {nextLabel} <ArrowRight className="size-4" />
      </button>
    </div>
  )
}
