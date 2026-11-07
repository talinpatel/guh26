import { useState } from 'react'
import { CheckCircle2, Upload } from 'lucide-react'
import Nav from './Nav.tsx'
import { BANK } from '../constants/onboarding.ts'

export default function BankStep({ onBack, onNext }: { onBack: () => void; onNext: (csv: string) => void }) {
  const [bank, setBank] = useState<{ filename: string; data: string } | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [dragging, setDragging] = useState(false)

  // Header check here so a wrong file is caught before it reaches the backend, which does the real parse.
  async function pick(f: File) {
    const text = await f.text()
    const header = text.split(/\r?\n/, 1)[0].toLowerCase()
    const ok = header.includes('date') && /amount|paid (in|out)|money (in|out)|debit|credit/.test(header)
    setBank(ok ? { filename: f.name, data: text } : null)
    setInvalid(!ok)
  }
  const file = bank?.filename

  return (
    <>
      <h2 id="step-title" className="text-2xl font-semibold text-stone-900">{BANK.title}</h2>
      <p className="mt-1 text-sm text-stone-500">{BANK.subtitle}</p>

      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0])
        }}
        className={`mt-5 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 p-8 text-center transition ${
          dragging ? 'border-dashed border-brand-500 bg-brand-50' : 'border-stone-200 bg-paper hover:border-stone-300'
        }`}
      >
        <Upload className={`size-7 ${dragging ? 'text-brand-600' : 'text-stone-400'}`} />
        <span className="text-sm font-medium text-stone-700">{dragging ? BANK.drop : BANK.drag}</span>
        <span className="text-xs text-stone-500">{BANK.browse}</span>
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      </label>

      {file && (
        <div className="mt-5 flex items-center gap-2 text-sm font-medium text-brand-800">
          <CheckCircle2 className="size-5 text-brand-600" /> {file} {BANK.uploaded}
        </div>
      )}

      {invalid && <p role="alert" className="mt-5 text-sm text-red-700">{BANK.invalid}</p>}

      <Nav onBack={onBack} onNext={() => bank && onNext(bank.data)} nextLabel={BANK.next} disabled={!bank} />
    </>
  )
}
