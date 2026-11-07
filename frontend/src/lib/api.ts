import type { Bill, Busy, Shift } from './cashflow.ts'

// FastAPI backend (backend/main.py).
const BASE = (import.meta.env?.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export type ApiShift = { start: string; end: string; hours: number; pay: number }
export type Schedule = {
  week_start: string
  shifts: ApiShift[]
  hours: number
  pay: number
  finance: { balance: number; start_balance?: number; weekly_spend: number; weekly_target: number; bills: { name: string; amount: number; day: number }[] }
  broken: { label: string; amount: number; unit: string }[]
}
export type ApiMsg = {
  id: number
  role: 'user' | 'ai'
  text: string
  change?: { add: ApiShift[]; remove: string[]; pay: number; hours: number; status: 'pending' | 'accepted' | 'undone' }
}
export type Dashboard = {
  user: { job: string; mode: string | null; hourly_pay: number; preferences: string } | null
  events: { title: string; start: string; end: string; location: string; rrule: string }[]
  cashflow: { balance: number | null; bills: { name: string; amount: number; day: number }[] }
  schedule: Schedule | null
  constraints: { type: string; per?: string; max?: number; days?: string[] }[]
  messages: ApiMsg[]
}

// Same id on every visit so re-onboarding replaces this user's rows instead of duplicating them.
export function userId() {
  let id = localStorage.getItem('user_id')
  if (!id) localStorage.setItem('user_id', (id = crypto.randomUUID()))
  return id
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} returned ${res.status}`)
  return res.json()
}

export const api = {
  onboard: (body: unknown) => call('/onboarding', body),
  dashboard: () => call<Dashboard>(`/dashboard?user_id=${userId()}`),
  chat: (message: string) => call<{ messages: ApiMsg[] }>('/chat', { user_id: userId(), message }),
  settle: (id: number, accept: boolean) => call<{ schedule: Schedule }>(`/proposals/${id}`, { user_id: userId(), accept }),
}

// The solver works in UTC wall-clock; times without a zone are wall-clock too.
export const utc = (iso: string) => new Date(/Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`)
const DAY = 86_400_000
const hourOf = (d: Date) => d.getUTCHours() + d.getUTCMinutes() / 60
const windowOf = (h: number) => (h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening')

export function toShift(s: ApiShift, week0: Date, job: string, rate: number): Shift {
  const d = utc(s.start)
  const start = hourOf(d)
  return {
    id: s.start + s.end, title: job, platform: job, rate, boost: 1, pay: s.pay, window: windowOf(start),
    day: Math.floor((d.getTime() - week0.getTime()) / DAY), start, end: start + s.hours,
  }
}

export function toBusy(events: Dashboard['events'], week0: Date): Busy[] {
  return events
    .filter((e) => e.start.includes('T'))
    .map((e) => {
      const s = utc(e.start)
      const start = hourOf(s)
      return { title: e.title, day: Math.floor((s.getTime() - week0.getTime()) / DAY), start, end: Math.min(24, start + (utc(e.end).getTime() - s.getTime()) / 3_600_000) }
    })
    .filter((b) => b.day >= 0 && b.day < 7)
}

export const toBills = (bills: Dashboard['cashflow']['bills']): Bill[] => bills.map((b) => ({ name: b.name, amount: b.amount, date: b.day }))
