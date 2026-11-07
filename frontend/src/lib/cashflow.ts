// day: 0 = Monday … 6 = Sunday; start/end in hours (18.5 = 18:30)
export type Busy = { title: string; day: number; start: number; end: number }
export type Shift = Busy & { id: string; platform: string; rate: number; boost: number; window: string; pay: number }
export type Bill = { name: string; amount: number; date: number } // date = day of the month
export type Change = { remove: string[]; add: Shift[] }

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const WEEKEND_BOOST = 1.2 // Fri, Sat, Sun demand premium

export const money = (n: number) => (Math.round(n) < 0 ? '−£' : '£') + Math.abs(Math.round(n)).toLocaleString('en-GB')
export const time = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`
export const totalPay = (s: Shift[]) => s.reduce((a, x) => a + x.pay, 0)
export const totalHours = (s: Shift[]) => s.reduce((a, x) => a + x.end - x.start, 0)

export function makeShift(id: string, day: number, start: number, end: number, platform: string, rate: number, window: string): Shift {
  const boost = day >= 4 ? WEEKEND_BOOST : 1
  return { id, title: platform, day, start, end, platform, rate, boost, window, pay: Math.round(rate * boost * (end - start)) }
}

export const applyChange = (plan: Shift[], c: Change) => plan.filter((s) => !c.remove.includes(s.id)).concat(c.add)

// End-of-day balance for each date in [from, to]. firstDate is a Monday.
// shortcut: assumes the week's plan repeats and pay lands the day you work; model weekly platform payouts later.
export function series(shifts: Shift[], startBalance: number, bills: Bill[], from: number, to: number): [number, number][] {
  let b = startBalance
  const out: [number, number][] = []
  for (let d = from; d <= to; d++) {
    for (const s of shifts) if (s.day === (d - from) % 7) b += s.pay
    for (const x of bills) if (x.date === d) b -= x.amount
    out.push([d, b])
  }
  return out
}
