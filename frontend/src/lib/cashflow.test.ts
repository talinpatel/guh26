// Run: node src/lib/cashflow.test.ts
import assert from 'node:assert/strict'
import { applyChange, money, series, totalHours, totalPay, type Shift } from './cashflow.ts'
import { toBusy, toShift, utc } from './api.ts'

const week0 = utc('2026-11-09') // Monday
const plan: Shift[] = [
  toShift({ start: '2026-11-11T19:00:00Z', end: '2026-11-11T22:00:00Z', hours: 3, pay: 42 }, week0, 'Deliveroo', 14),
  toShift({ start: '2026-11-14T17:00:00Z', end: '2026-11-14T19:00:00Z', hours: 2, pay: 28 }, week0, 'Deliveroo', 14),
]

// API shifts land on the right day and hour of the planned week
assert.deepEqual([plan[0].day, plan[0].start, plan[0].end, plan[0].window], [2, 19, 22, 'evening'])
assert.deepEqual([totalPay(plan), totalHours(plan)], [70, 5])
assert.deepEqual(toBusy([{ title: 'Lecture', start: '2026-11-09T09:00:00Z', end: '2026-11-09T11:30:00Z', location: '', rrule: '' },
  { title: 'Next week', start: '2026-11-16T09:00:00Z', end: '2026-11-16T10:00:00Z', location: '', rrule: '' }], week0),
  [{ title: 'Lecture', day: 0, start: 9, end: 11.5 }])

// cash flow: plan repeats weekly, bills on their day of the month, spending spread daily
const bills = [{ name: 'Phone', amount: 15, date: 16 }]
const run = series(plan, 300, bills, week0, 21, 10)
assert.equal(run.length, 21)
assert.equal(run[0][1], 290) // Mon 9th: no work, £10 spent
assert.equal(run[7][1], 300 + 70 - 15 - 80) // Mon 16th: one week of pay, phone bill, 8 days of spending
assert.equal(money(series([], 300, bills, week0, 21, 10).at(-1)![1]), '£75')

// suggested changes
const moved = applyChange(plan, { remove: [plan[0].id], add: [] })
assert.equal(totalPay(moved), 28)

console.log('cashflow ok')
