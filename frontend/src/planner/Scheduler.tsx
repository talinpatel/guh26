import { useEffect, useRef, useState } from 'react'
import { Send, X } from 'lucide-react'
import { DAYS, money, time, type Bill, type Change, type Shift } from '../lib/cashflow.ts'
import { PLANNER } from '../constants/planner.ts'

export type Msg = {
  id?: number // server message id; needed to accept or undo its change
  role: 'user' | 'ai'
  text: string
  change?: Change & { removed: Shift[]; status: 'pending' | 'accepted' | 'undone' }
}

type Props = {
  msgs: Msg[]
  shift: Shift | null
  bigBill?: Bill
  waiting: boolean
  onAsk: (text: string) => void
  onAccept: (i: number) => void
  onUndo: (i: number) => void
  onCloseWhy: () => void
}

export default function Scheduler({ msgs, shift, bigBill, waiting, onAsk, onAccept, onUndo, onCloseWhy }: Props) {
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => endRef.current?.scrollIntoView({ block: 'nearest' }), [msgs, waiting])

  function send(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || waiting) return
    onAsk(input.trim())
    setInput('')
  }

  const line = (s: Shift) => `${DAYS[s.day]} ${time(s.start)} ${s.platform}`

  return (
    <aside aria-labelledby="side-title" className="flex flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white lg:min-h-0">
      <div className="border-b border-stone-200 px-4 py-3.5">
        <h3 id="side-title" className="font-display text-lg font-semibold text-stone-900">{PLANNER.schedTitle}</h3>
        <p className="text-xs text-stone-500">{PLANNER.schedSub}</p>
      </div>

      {shift && (
        <div role="region" aria-label={PLANNER.whyTitle} className="mx-3 mt-3 rounded-2xl border border-brand-100 bg-brand-50 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-display text-[15px] font-semibold leading-snug text-stone-900">
              {PLANNER.whyTitle}
              <span className="block font-sans text-[13px] font-normal text-stone-500">
                {shift.platform}, {DAYS[shift.day]} {time(shift.start)} to {time(shift.end)}
              </span>
            </h4>
            <button type="button" onClick={onCloseWhy} aria-label={PLANNER.whyClose} className="rounded-md p-1 text-stone-500 hover:bg-brand-100">
              <X className="size-4" />
            </button>
          </div>
          <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] tabular-nums">
            <dt className="text-stone-500">{PLANNER.whyPay}</dt><dd className="text-right font-semibold">{money(shift.pay)}</dd>
            <dt className="text-stone-500">{PLANNER.whyRate}</dt><dd className="text-right font-semibold">£{shift.rate}/hr</dd>
            {bigBill && <><dt className="text-stone-500">{PLANNER.whyShare(bigBill.name)}</dt><dd className="text-right font-semibold">{Math.round((shift.pay / bigBill.amount) * 100)}%</dd></>}
          </dl>
          <p className="mt-2.5 text-[13px] text-stone-500">{PLANNER.whyNote}</p>
        </div>
      )}

      <div className="flex max-h-[460px] min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3.5 lg:max-h-none" aria-live="polite">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[90%] rounded-2xl px-3 py-2 text-[13.5px] ${
              m.role === 'user' ? 'self-end rounded-br-sm bg-brand-600 text-white' : 'self-start rounded-bl-sm border border-stone-200 bg-paper'
            }`}
          >
            {m.text}
            {m.change && (
              <>
                <div className="mt-2 grid gap-0.5 border-t border-stone-200 pt-2 text-[12.5px] tabular-nums">
                  {m.change.removed.map((s) => (
                    <div key={s.id} className="flex justify-between gap-2.5 text-red-700"><span>− {line(s)}</span><span>−{money(s.pay)}</span></div>
                  ))}
                  {m.change.add.map((s) => (
                    <div key={s.id} className="flex justify-between gap-2.5 text-brand-600"><span>+ {line(s)}</span><span>+{money(s.pay)}</span></div>
                  ))}
                </div>
                {m.change.status === 'pending' ? (
                  <div className="mt-2.5 flex gap-2">
                    <button type="button" onClick={() => onAccept(i)} className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-700">{PLANNER.accept}</button>
                    <button type="button" onClick={() => onUndo(i)} className="rounded-lg border border-stone-200 bg-white px-3.5 py-1.5 text-[13px] font-semibold hover:bg-stone-50">{PLANNER.undo}</button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs font-semibold text-stone-500">{m.change.status === 'accepted' ? PLANNER.accepted : PLANNER.undone}</p>
                )}
              </>
            )}
          </div>
        ))}
        {waiting && <div className="self-start rounded-2xl rounded-bl-sm border border-stone-200 bg-paper px-3 py-2 text-[13.5px] text-stone-500">{PLANNER.thinking}</div>}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-1.5 px-3 pb-2.5">
        {PLANNER.suggestions.map((q) => (
          <button key={q} type="button" disabled={waiting} onClick={() => onAsk(q)} className="rounded-full border border-stone-200 px-2.5 py-1 text-xs text-stone-500 hover:border-brand-600 hover:text-brand-600">
            {q}
          </button>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-stone-200 p-3">
        <label htmlFor="ask" className="sr-only">{PLANNER.askLabel}</label>
        <input
          id="ask"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
          placeholder={PLANNER.askPlaceholder}
          className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-paper px-3 py-2 text-sm focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none"
        />
        <button type="submit" disabled={!input.trim() || waiting} aria-label={PLANNER.send} className="rounded-xl bg-brand-600 px-3 text-white hover:bg-brand-700 disabled:bg-stone-300">
          <Send className="size-4" />
        </button>
      </form>
    </aside>
  )
}
