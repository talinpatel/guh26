// Run: node n8n/workflows.test.mjs — runs the Code nodes from the exported workflows against the demo files.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const codeOf = (wf, name) => JSON.parse(read(wf)).nodes.find((n) => n.name === name).parameters.jsCode
// Minimal stand-in for n8n's $('Node') accessor.
const run = (jsCode, nodes) => new Function('$', jsCode)((n) => ({ first: () => ({ json: nodes[n][0] }), all: () => nodes[n].map((json) => ({ json })) }))

const user_id = '123e4567-e89b-42d3-a456-426614174000'
const body = { user_id, job: 'Deliveroo', mode: 'Bike', hourly_pay: 14, preferences: 'Evenings only', calendar: read('../demo/test_lectures.ics'), banking: read('../demo/bank_statement.csv') }
const validate = codeOf('./onboarding.json', 'Validate')
const [{ json: v }] = run(validate, { Webhook: [{ body }] })

assert.equal(v.user.hourly_pay, 14)
assert.deepEqual(v.events[0], { user_id, title: 'Algorithms Lecture', start: '2026-11-09T09:00:00Z', end: '2026-11-09T11:00:00Z', location: 'Room 1.01', rrule: '' })
assert.equal(v.transactions.length, 12)
assert.deepEqual(v.transactions.at(-1), { user_id, date: '2026-11-04', description: 'Tesco', amount: -42.3, category: '', balance: 312.4 })

// Barclays-style split columns, UK dates, quoted commas, BOM.
const split = '\uFEFFDate,Memo,Paid out,Paid in\r\n04/11/2026,"Tesco, Fallowfield",42.30,\r\n05/11/2026,Deliveroo,,"1,184.20"\r\n'
const [{ json: s }] = run(validate, { Webhook: [{ body: { ...body, banking: split } }] })
assert.deepEqual(s.transactions.map((t) => [t.date, t.description, t.amount]), [['2026-11-04', 'Tesco, Fallowfield', -42.3], ['2026-11-05', 'Deliveroo', 1184.2]])

assert.throws(() => run(validate, { Webhook: [{ body: { ...body, user_id: 'x' } }] }), /UUID/)
assert.throws(() => run(validate, { Webhook: [{ body: { ...body, hourly_pay: -1 } }] }), /hourly_pay/)
assert.throws(() => run(validate, { Webhook: [{ body: { ...body, banking: 'foo,bar\n1,2' } }] }), /Date and Amount/)

// Dashboard: data table rows (with n8n's own id/timestamps) in, one payload out.
const meta = { id: 1, createdAt: 'x', updatedAt: 'x' }
const [{ json: d }] = run(codeOf('./dashboard.json', 'Assemble'), {
  'Get user': [{ ...meta, ...v.user }],
  'Get calendar': v.events.map((e) => ({ ...meta, ...e })),
  'Get transactions': v.transactions.map((t) => ({ ...meta, ...t })),
})
assert.equal(d.user.preferences, 'Evenings only')
assert.equal(d.events.length, v.events.length)
assert.equal(d.cashflow.balance, 312.4)
assert.deepEqual(d.cashflow.bills, [{ name: 'Tesco', amount: 42.3, day: 4 }])
// No rows yet (user never onboarded): n8n emits one empty item from alwaysOutputData.
const [{ json: empty }] = run(codeOf('./dashboard.json', 'Assemble'), { 'Get user': [{}], 'Get calendar': [{}], 'Get transactions': [{}] })
assert.deepEqual(empty, { user: null, events: [], transactions: [], cashflow: { balance: null, bills: [] } })

console.log('ok')
