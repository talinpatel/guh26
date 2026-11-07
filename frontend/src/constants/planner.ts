import {
  makeShift,
  money,
  type Bill,
  type Busy,
  type Change,
} from "../lib/cashflow.ts";

// shortcut: Alex's sample data, mirrors public/banking-data.json; replace with what onboarding imports.
export const START_BALANCE = 312.4;
export const WEEKLY_TARGET = 175;
export const HOUR_CAP = 20;
export const FIRST_DATE = 9; // Monday 9 November 2026
export const LAST_DATE = 29;
export const RENT_DATE = 28;
export const BILLS: Bill[] = [
  { name: "Phone", amount: 15, date: 16 },
  { name: "Electricity", amount: 48, date: 18 },
  { name: "Spotify", amount: 11.99, date: 20 },
  { name: "Groceries", amount: 160, date: 27 },
  { name: "Rent", amount: 650, date: 28 },
];
export const RENT = BILLS.find((b) => b.name === "Rent")!.amount;
export const BIG_PAYMENT = 40; // bills at or above this show under "Next big payments"

export const BUSY: Busy[] = [
  { title: "Economics lecture", day: 0, start: 9, end: 12 },
  { title: "Seminar", day: 1, start: 14, end: 16 },
  { title: "Statistics lecture", day: 2, start: 10, end: 13 },
  { title: "Gym", day: 2, start: 18, end: 19.5 },
  { title: "Economics lecture", day: 3, start: 9, end: 12 },
  { title: "Football", day: 3, start: 19, end: 21 },
  { title: "Library", day: 4, start: 10, end: 13 },
  { title: "Family dinner", day: 6, start: 17, end: 20 },
];

export const INITIAL_PLAN = [
  makeShift("tue-din", 1, 18, 21, "Deliveroo", 17, "dinner peak"),
  makeShift("fri-din", 4, 18, 21, "Deliveroo", 17, "dinner peak"),
  makeShift("sat-lun", 5, 12, 14, "Deliveroo", 14, "lunch peak"),
  makeShift("sat-din", 5, 18, 21, "Deliveroo", 17, "dinner peak"),
];

// shortcut: scripted replies for the demo, replace with the scheduler LLM (n8n) call.
export type Script = {
  ask: string;
  reply: string;
  change?: Change;
  open?: string;
};
export const SCRIPTS: Record<string, Script> = {
  friday: {
    ask: "I'm busy Friday night",
    reply:
      "I can move Friday's dinner shift to Monday evening, which is free after your lecture. Monday has no weekend boost, so it pays a little less, but you'd still be £22 over your weekly target.",
    change: {
      remove: ["fri-din"],
      add: [makeShift("mon-din", 0, 18, 21, "Deliveroo", 17, "dinner peak")],
    },
  },
  more: {
    ask: "Can I earn £50 more?",
    reply:
      "Two slots fit around your week: Thursday after football on Uber Eats, and Sunday lunch before your family dinner. Together they add £64 and keep you under your 20-hour limit.",
    change: {
      remove: [],
      add: [
        makeShift("thu-late", 3, 21, 23, "Uber Eats", 15, "late-night orders"),
        makeShift("sun-lun", 6, 12, 14, "Deliveroo", 14, "lunch peak"),
      ],
    },
  },
  why: {
    ask: "Why Saturday evening?",
    reply:
      "Saturday 18:00 to 21:00 is the best-paying window in your week: London's dinner peak plus the weekend boost. One shift there covers almost a tenth of your rent. I've opened the details.",
    open: "sat-din",
  },
};
export const matchScript = (text: string) => {
  const q = text.toLowerCase();
  return /fri/.test(q)
    ? "friday"
    : /more|extra|earn|£/.test(q)
      ? "more"
      : /why|sat/.test(q)
        ? "why"
        : null;
};

export const PLANNER = {
  brand: "Giggle!",
  month: "November 2026",
  target: "Weekly target",
  planned: "Planned",
  plannedIfAccepted: "Planned if accepted",
  onTrack: "On track",
  short: "Short",
  hours: "Hours",
  ofCap: `of ${HOUR_CAP}`,
  cashTitle: (left: number, preview: boolean) =>
    `${preview ? "With this change you’d have" : "You’ll have"} ${money(left)} left at the end of the month.`,
  cashShort: "Without any work you’d be",
  cashShortEnd: "short.",
  cashEarns: (pay: number) =>
    `Your plan earns ${money(pay)} a week to close that gap.`,
  legendPlan: "Balance with this plan",
  legendPreview: "With the suggested change",
  legendNone: "Balance if you don’t work",
  legendNote:
    "Assumes this week’s plan repeats. Pay counted on the day you work.",
  showCash: "Show cash flow",
  hideCash: "Hide cash flow",
  nextPayments: "Next big payments",
  due: (date: number) => `${date} Nov`,
  weekTitle: "This week",
  keyBusy: "Your calendar",
  keyShift: "Planned work",
  removed: "Removed",
  schedTitle: "Giggle AI",
  schedSub: "Need more work? Need a day off? Ask away.",
  prefs: "I prefer evenings. Max 20 hours a week.",
  summary: (n: number, h: number, pay: number) =>
    `Here's your week: ${n} shifts, ${h} hours, about ${money(pay)}. That's ${money(pay - WEEKLY_TARGET)} over your ${money(WEEKLY_TARGET)} weekly target, so rent on 28 November is covered.`,
  accept: "Accept change",
  undo: "Undo",
  accepted: "Change accepted",
  undone: "Change undone",
  already: "That change is already in your plan, so there's nothing to update.",
  fallback:
    "In this demo I can answer three questions. Try one of the suggestions below.",
  askLabel: "Message the scheduler",
  askPlaceholder: "e.g. I'm busy Friday night",
  send: "Send",
  whyTitle: "Why this shift?",
  whyClose: "Close details",
  whyPay: "Estimated pay",
  whyRate: (window: string) =>
    `${window[0].toUpperCase()}${window.slice(1)} rate`,
  whyBoost: "Weekend boost",
  whyRent: "Share of rent",
  whyNote: (evening: boolean) =>
    `Nothing in your calendar clashes, and it matches your preference for ${evening ? "evenings" : "shorter daytime slots"}.`,
};
