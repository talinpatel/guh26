import { useEffect, useState } from 'react'
import { applyChange, money, totalHours, totalPay, type Shift } from './lib/cashflow.ts'
import { api, toBills, toBusy, toShift, utc, type ApiMsg, type ApiShift, type Dashboard, type Schedule } from './lib/api.ts'
import { PLANNER } from './constants/planner.ts'
import CashFlow from './planner/CashFlow.tsx'
import WeekGrid from './planner/WeekGrid.tsx'
import Scheduler, { type Msg } from './planner/Scheduler.tsx'

const closePending = (ms: Msg[]) => ms.map((m) => (m.change?.status === 'pending' ? { ...m, change: { ...m.change, status: 'undone' as const } } : m))

// API shapes -> the planner's shapes, for one user's planned week.
function mappers(d: Dashboard | null) {
  const week0 = utc(d?.schedule?.week_start ?? '1970-01-05')
  const shift = (x: ApiShift) => toShift(x, week0, d?.user?.job || 'Work', d?.user?.hourly_pay ?? 0)
  return {
    week0,
    shifts: (s: Schedule) => s.shifts.map(shift),
    // removed = shifts of the plan at the time, so history keeps its −/+ lines while they're still in the plan
    msg: (m: ApiMsg, current: Shift[]): Msg => ({
      id: m.id, role: m.role, text: m.text,
      change: m.change && {
        status: m.change.status,
        remove: m.change.remove,
        add: m.change.add.map(shift),
        removed: current.filter((s) => m.change!.remove.includes(s.id)),
      },
    }),
  }
}

export default function Planner() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [failed, setFailed] = useState(false)
  const [plan, setPlan] = useState<Shift[]>([])
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [waiting, setWaiting] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    api.dashboard().then((d) => {
      const m = mappers(d)
      const p = d.schedule ? m.shifts(d.schedule) : []
      setData(d)
      setPlan(p)
      setMsgs(d.messages.map((x) => m.msg(x, p)))
    }, () => setFailed(true))
  }, [])

  const sched = data?.schedule
  const { week0, shifts: shiftsOf, msg: toMsg } = mappers(data)

  if (failed || !data || !sched) {
    return <p className="p-8 text-center text-stone-500">{failed ? PLANNER.loadError : data ? PLANNER.noPlan : PLANNER.loading}</p>
  }

  // The pending suggestion lives in the chat; the rest of the page previews it.
  const pendingAt = msgs.findIndex((m) => m.change?.status === 'pending')
  const proposal = pendingAt >= 0 ? msgs[pendingAt].change! : null
  const shown = proposal ? applyChange(plan, proposal) : plan
  const pay = totalPay(shown)
  const target = sched.finance.weekly_target
  const cap = data.constraints.find((c) => c.type === 'hours' && c.per === 'week' && c.max != null && !c.days)?.max
  const bills = toBills(data.cashflow.bills)
  const bigBill = [...bills].sort((a, b) => b.amount - a.amount)[0]
  const shift = plan.concat(proposal?.add ?? []).find((s) => s.id === selected) ?? null

  async function ask(text: string) {
    setMsgs((ms) => [...closePending(ms), { role: 'user', text }])
    setWaiting(true)
    try {
      const { messages } = await api.chat(text)
      setMsgs((ms) => [...ms.slice(0, -1), ...messages.map((m) => toMsg(m, plan))])
    } catch {
      setMsgs((ms) => [...ms, { role: 'ai', text: PLANNER.chatError }])
    } finally {
      setWaiting(false)
    }
  }

  async function settle(i: number, status: 'accepted' | 'undone') {
    const m = msgs[i]
    if (!m.change || m.id == null) return
    try {
      const { schedule } = await api.settle(m.id, status === 'accepted')
      setPlan(shiftsOf(schedule))
      setMsgs((ms) => ms.map((x, j) => (j === i && x.change ? { ...x, change: { ...x.change, status } } : x)))
    } catch {
      setMsgs((ms) => [...ms, { role: 'ai', text: PLANNER.chatError }])
    }
  }

  return (
    // Desktop: one screen; the main column scrolls, the scheduler fills the right-hand side.
    <div className="flex min-h-screen flex-col lg:h-screen">
      <header className="relative z-10 border-b border-stone-200 bg-white shadow-sm shadow-stone-900/5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold leading-none text-brand-600">{PLANNER.brand}</h1>
            <span aria-hidden="true" className="h-6 w-px bg-stone-200" />
            <p className="font-medium text-stone-600">{week0.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Stat label={PLANNER.target} value={money(target)} />
            <Stat label={proposal ? PLANNER.plannedIfAccepted : PLANNER.planned} value={money(pay)}>
              <span className={`rounded-full px-2 py-px text-[11px] font-semibold ${pay >= target ? 'bg-brand-100 text-brand-800' : 'bg-red-50 text-red-700'}`}>
                {pay >= target ? PLANNER.onTrack : PLANNER.short}
              </span>
            </Stat>
            <Stat label={PLANNER.hours} value={`${totalHours(shown)}h`}>
              {cap != null && <span className="text-xs text-stone-500">{PLANNER.ofCap(cap)}</span>}
            </Stat>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-4 p-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)]">
        <main className="grid min-w-0 content-start gap-4 lg:min-h-0 lg:overflow-y-auto">
          <CashFlow plan={plan} preview={proposal ? shown : null} balance={sched.finance.start_balance ?? sched.finance.balance} bills={bills} start={week0} dailySpend={sched.finance.weekly_spend / 7} />
          <WeekGrid plan={plan} busy={toBusy(data.events, week0)} start={week0} proposal={proposal} selected={selected} onSelect={setSelected} />
        </main>

        <Scheduler msgs={msgs} shift={shift} bigBill={bigBill} waiting={waiting} onAsk={ask} onAccept={(i) => settle(i, 'accepted')} onUndo={(i) => settle(i, 'undone')} onCloseWhy={() => setSelected(null)} />
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
