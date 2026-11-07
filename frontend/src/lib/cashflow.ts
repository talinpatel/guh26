// day: 0 = Monday … 6 = Sunday; start/end in hours (18.5 = 18:30)
export type Busy = { title: string; day: number; start: number; end: number }
export type Shift = Busy & { id: string; platform: string; rate: number; boost: number; window: string; pay: number }
export type Bill = { name: string; amount: number; date: number } // date = day of the month
export type Change = { remove: string[]; add: Shift[] }

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const money = (n: number) => (Math.round(n) < 0 ? '−£' : '£') + Math.abs(Math.round(n)).toLocaleString('en-GB')
export const time = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`
export const totalPay = (s: Shift[]) => s.reduce((a, x) => a + x.pay, 0)
export const totalHours = (s: Shift[]) => s.reduce((a, x) => a + x.end - x.start, 0)

export const applyChange = (plan: Shift[], c: Change) => plan.filter((s) => !c.remove.includes(s.id)).concat(c.add)

// End-of-day balance for each day offset in [0, days). start is a Monday (UTC); bills land on their day of the month.
// shortcut: assumes the week's plan repeats, pay lands the day you work and spending is spread evenly; model weekly platform payouts later.
export function series(shifts: Shift[], startBalance: number, bills: Bill[], start: Date, days: number, dailySpend = 0): [number, number][] {
  let b = startBalance
  const out: [number, number][] = []
  for (let i = 0; i < days; i++) {
    const date = dateAt(start, i).getUTCDate()
    for (const s of shifts) if (s.day === i % 7) b += s.pay
    for (const x of bills) if (x.date === date) b -= x.amount
    b -= dailySpend
    out.push([i, b])
  }
  return out
}

export const dateAt = (start: Date, i: number) => new Date(start.getTime() + i * 86_400_000)
export const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
