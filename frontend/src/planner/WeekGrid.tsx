import { DAYS, dateAt, money, time, type Busy, type Change, type Shift } from '../lib/cashflow.ts'
import { PLANNER } from '../constants/planner.ts'

const START = 8, END = 24, HOUR_PX = 34
const pos = (e: Busy) => ({ top: (e.start - START) * HOUR_PX, height: (e.end - e.start) * HOUR_PX - 2 })
const label = (s: Shift) => `${s.platform}, ${DAYS[s.day]} ${time(s.start)} to ${time(s.end)}, ${money(s.pay)}`

type Props = { plan: Shift[]; busy: Busy[]; start: Date; proposal: Change | null; selected: string | null; onSelect: (id: string) => void }

export default function WeekGrid({ plan, busy, start, proposal, selected, onSelect }: Props) {
  const hours = Array.from({ length: END - START }, (_, i) => START + i)
  const block = 'absolute inset-x-[3px] overflow-hidden rounded-lg px-1.5 py-1 text-left text-[11px] leading-tight'

  const shiftButton = (s: Shift, kind: 'shift' | 'add' | 'del') => (
    <button
      key={s.id}
      type="button"
      onClick={() => onSelect(s.id)}
      style={pos(s)}
      aria-label={kind === 'add' ? `Suggested: ${label(s)}` : kind === 'del' ? `${label(s)}, removed by suggestion` : label(s)}
      className={`${block} ${
        kind === 'add'
          ? 'border-[1.5px] border-dashed border-brand-600 bg-brand-50 text-brand-800'
          : kind === 'del'
            ? 'border-[1.5px] border-dashed border-red-700 bg-red-50 text-red-700'
            : `bg-brand-100 text-brand-800 hover:ring-2 hover:ring-brand-600 hover:ring-inset ${selected === s.id ? 'ring-2 ring-brand-600 ring-inset' : ''}`
      }`}
    >
      <span className={`block font-semibold ${kind === 'del' ? 'line-through' : ''}`}>
        {kind === 'add' ? '+ ' : ''}
        {kind === 'del' ? PLANNER.removed : s.platform}
      </span>
      {time(s.start)} to {time(s.end)}
      <br />
      <span className="tabular-nums">{money(s.pay)}</span>
    </button>
  )

  return (
    <section aria-labelledby="week-title" className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3.5">
        <h3 id="week-title" className="font-display text-lg font-semibold text-stone-900">{PLANNER.weekTitle}</h3>
        <div className="flex flex-wrap gap-3.5 text-xs text-stone-500">
          <Key className="bg-stone-200">{PLANNER.keyBusy}</Key>
          <Key className="bg-brand-100">{PLANNER.keyShift}</Key>        </div>
      </div>

      {/* Scrolls both ways inside the card; the day row stays pinned while scrolling hours. */}
      <div className="max-h-96 overflow-auto">
        <div className="grid min-w-165 grid-cols-[44px_repeat(7,minmax(84px,1fr))]">
          <div className="sticky top-0 z-10 border-b border-stone-200 bg-white" />
          {DAYS.map((d, i) => (
            <div key={d} className="sticky top-0 z-10 border-b border-l border-stone-200 bg-white px-1.5 py-2 text-center text-xs text-stone-500">
              {d}
              <b className="block text-[13px] text-stone-900">{dateAt(start, i).getUTCDate()}</b>
            </div>
          ))}
          <div className="relative" style={{ height: (END - START) * HOUR_PX }}>
            {hours.map((h) => (
              <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-stone-400" style={{ top: (h - START) * HOUR_PX }}>
                {time(h)}
              </span>
            ))}
          </div>
          {DAYS.map((_, day) => (
            <div
              key={day}
              className="relative border-l border-stone-200"
              style={{ height: (END - START) * HOUR_PX, backgroundImage: `repeating-linear-gradient(to bottom, var(--color-stone-200) 0 1px, transparent 1px ${HOUR_PX}px)` }}
            >
              {busy.filter((e) => e.day === day).map((e) => (
                <div key={e.title + e.start} style={pos(e)} className={`${block} bg-stone-200 text-stone-600`}>
                  <span className="block font-semibold">{e.title}</span>
                </div>
              ))}
              {plan.filter((s) => s.day === day).map((s) => shiftButton(s, proposal?.remove.includes(s.id) ? 'del' : 'shift'))}
              {proposal?.add.filter((s) => s.day === day).map((s) => shiftButton(s, 'add'))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Key({ className, children }: { className: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={`inline-block size-2.5 rounded-[3px] ${className}`} />
      {children}
    </span>
  )
}
