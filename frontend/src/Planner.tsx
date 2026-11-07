import { useState } from 'react'
import { applyChange, money, totalHours, totalPay } from './lib/cashflow.ts'
import { INITIAL_PLAN, PLANNER, SCRIPTS, WEEKLY_TARGET, matchScript } from './constants/planner.ts'
import CashFlow from './planner/CashFlow.tsx'
import WeekGrid from './planner/WeekGrid.tsx'
import Scheduler, { type Msg } from './planner/Scheduler.tsx'

const closePending = (ms: Msg[]) => ms.map((m) => (m.change?.status === 'pending' ? { ...m, change: { ...m.change, status: 'undone' as const } } : m))

export default function Planner() {
  const [plan, setPlan] = useState(INITIAL_PLAN)
  const [selected, setSelected] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'user', text: PLANNER.prefs },
    { role: 'ai', text: PLANNER.summary(INITIAL_PLAN.length, totalHours(INITIAL_PLAN), totalPay(INITIAL_PLAN)) },
  ])

  // The pending suggestion lives in the chat; the rest of the page previews it.
  const pendingAt = msgs.findIndex((m) => m.change?.status === 'pending')
  const proposal = pendingAt >= 0 ? msgs[pendingAt].change! : null
  const shown = proposal ? applyChange(plan, proposal) : plan
  const pay = totalPay(shown)
  const shift = plan.concat(proposal?.add ?? []).find((s) => s.id === selected) ?? null

  function ask(text: string) {
    const script = SCRIPTS[matchScript(text) ?? '']
    let reply: Msg = { role: 'ai', text: PLANNER.fallback }
    if (script?.change) {
      const c = script.change
      const stale = c.remove.some((id) => !plan.some((s) => s.id === id)) || c.add.some((a) => plan.some((s) => s.id === a.id))
      reply = stale
        ? { role: 'ai', text: PLANNER.already }
        : { role: 'ai', text: script.reply, change: { ...c, removed: plan.filter((s) => c.remove.includes(s.id)), status: 'pending' } }
    } else if (script) {
      reply = { role: 'ai', text: script.reply }
      if (script.open) setSelected(script.open)
    }
    setMsgs((ms) => [...closePending(ms), { role: 'user', text }, reply])
  }

  function settle(i: number, status: 'accepted' | 'undone') {
    const c = msgs[i].change
    if (!c) return
    if (status === 'accepted') setPlan(applyChange(plan, c))
    setMsgs((ms) => ms.map((m, j) => (j === i && m.change ? { ...m, change: { ...m.change, status } } : m)))
  }

  return (
    // Desktop: one screen; the main column scrolls, the scheduler fills the right-hand side.
    <div className="flex min-h-screen flex-col lg:h-screen">
      <header className="relative z-10 border-b border-stone-200 bg-white shadow-sm shadow-stone-900/5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold leading-none text-brand-600">{PLANNER.brand}</h1>
            <span aria-hidden="true" className="h-6 w-px bg-stone-200" />
            <p className="font-medium text-stone-600">{PLANNER.month}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Stat label={PLANNER.target} value={money(WEEKLY_TARGET)} />
            <Stat label={proposal ? PLANNER.plannedIfAccepted : PLANNER.planned} value={money(pay)}>
              <span className={`rounded-full px-2 py-px text-[11px] font-semibold ${pay >= WEEKLY_TARGET ? 'bg-brand-100 text-brand-800' : 'bg-red-50 text-red-700'}`}>
                {pay >= WEEKLY_TARGET ? PLANNER.onTrack : PLANNER.short}
              </span>
            </Stat>
            <Stat label={PLANNER.hours} value={`${totalHours(shown)}h`}>
              <span className="text-xs text-stone-500">{PLANNER.ofCap}</span>
            </Stat>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-4 p-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)]">
        <main className="grid min-w-0 content-start gap-4 lg:min-h-0 lg:overflow-y-auto">
          <CashFlow plan={plan} preview={proposal ? shown : null} />
          <WeekGrid plan={plan} proposal={proposal} selected={selected} onSelect={setSelected} />
        </main>

        <Scheduler msgs={msgs} shift={shift} onAsk={ask} onAccept={(i) => settle(i, 'accepted')} onUndo={(i) => settle(i, 'undone')} onCloseWhy={() => setSelected(null)} />
      </div>
    </div>
  )
}

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-12 min-w-24 flex-col justify-center rounded-xl border border-stone-200 bg-white px-3">
      <span className="text-xs leading-tight text-stone-500">{label}</span>
      <span className="flex items-center gap-1.5">
        <strong className="text-base leading-tight tabular-nums">{value}</strong>
        {children}
      </span>
    </div>
  )
}
