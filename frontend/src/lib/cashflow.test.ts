// Run: node src/lib/cashflow.test.ts
import assert from 'node:assert/strict'
import { applyChange, makeShift, money, series, totalHours, totalPay } from './cashflow.ts'
import { BILLS, FIRST_DATE, INITIAL_PLAN, LAST_DATE, RENT_DATE, SCRIPTS, START_BALANCE } from '../constants/planner.ts'

const run = (s = INITIAL_PLAN) => series(s, START_BALANCE, BILLS, FIRST_DATE, LAST_DATE)
const on = (s: typeof INITIAL_PLAN, d: number) => run(s).find(([x]) => x === d)![1]

// pay, weekend boost and rounding
assert.equal(makeShift('a', 5, 18, 21, 'D', 17, '').pay, 61)
assert.equal(makeShift('b', 1, 18, 21, 'D', 17, '').pay, 51)
assert.deepEqual([totalPay(INITIAL_PLAN), totalHours(INITIAL_PLAN)], [207, 11])

// the demo's headline numbers
assert.equal(money(on(INITIAL_PLAN, RENT_DATE)), '£48')
assert.equal(money(on([], RENT_DATE)), '−£573')
assert.equal(run().length, 21)

// scripted changes
const fri = applyChange(INITIAL_PLAN, SCRIPTS.friday.change!)
assert.equal(totalPay(fri), 197)
assert.ok(!fri.some((s) => s.id === 'fri-din'))
assert.equal(totalPay(applyChange(INITIAL_PLAN, SCRIPTS.more.change!)), 271)

console.log('cashflow ok')
