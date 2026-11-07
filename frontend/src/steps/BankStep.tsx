import { useState } from 'react'
import { CheckCircle2, Upload } from 'lucide-react'
import Nav from './Nav.tsx'

export default function BankStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [file, setFile] = useState('')
  const [dragging, setDragging] = useState(false)

  return (
    <>
      <h2 id="step-title" className="text-2xl font-semibold text-stone-900">Connect your bank</h2>
      <p className="mt-1 text-sm text-stone-500">Upload your banking data so we know what's coming in and going out.</p>

      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0].name)
        }}
        className={`mt-5 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 p-8 text-center transition ${
          dragging ? 'border-dashed border-brand-500 bg-brand-50' : 'border-stone-200 bg-paper hover:border-stone-300'
        }`}
      >
        <Upload className={`size-7 ${dragging ? 'text-brand-600' : 'text-stone-400'}`} />
        <span className="text-sm font-medium text-stone-700">{dragging ? 'Drop it here' : 'Drag & drop your banking data'}</span>
        <span className="text-xs text-stone-500">or click to browse · .json</span>
        <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0].name)} />
      </label>

      {file && (
        <div className="mt-5 flex items-center gap-2 text-sm font-medium text-brand-800">
          <CheckCircle2 className="size-5 text-brand-600" /> {file} uploaded
        </div>
      )}

      <Nav onBack={onBack} onNext={onNext} nextLabel="Build my schedule" disabled={!file} />
    </>
  )
}
