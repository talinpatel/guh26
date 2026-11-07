import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { money, series, totalPay, type Shift } from "../lib/cashflow.ts";
import {
  BIG_PAYMENT,
  BILLS,
  FIRST_DATE,
  LAST_DATE,
  PLANNER,
  RENT_DATE,
  START_BALANCE,
} from "../constants/planner.ts";

const W = 720,
  H = 250,
  L = 56,
  R = 60,
  T = 14,
  B = 64,
  STEP = 250;
const run = (s: Shift[]) =>
  series(s, START_BALANCE, BILLS, FIRST_DATE, LAST_DATE);
const onRentDay = (s: Shift[]) => run(s).find(([d]) => d === RENT_DATE)![1];

export default function CashFlow({
  plan,
  preview,
}: {
  plan: Shift[];
  preview: Shift[] | null;
}) {
  const [open, setOpen] = useState(false);
  const shown = preview ?? plan;
  const bigPayments = BILLS.filter((b) => b.amount >= BIG_PAYMENT).sort(
    (a, b) => a.date - b.date,
  );
  const cur = run(plan),
    none = run([]),
    prop = preview && run(preview);

  const vals = [...cur, ...none, ...(prop ?? [])]
    .map((p) => p[1])
    .concat(START_BALANCE, 0);
  const lo = Math.floor(Math.min(...vals) / STEP) * STEP;
  const hi = Math.ceil(Math.max(...vals) / STEP) * STEP;
  const x = (d: number) =>
    L + ((d - FIRST_DATE) / (LAST_DATE + 1 - FIRST_DATE)) * (W - L - R);
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  // Step line: balance holds flat, then jumps mid-day when pay or a bill lands.
  const path = (pts: [number, number][]) => {
    let prev = START_BALANCE;
    let d = `M${x(FIRST_DATE)},${y(prev)}`;
    for (const [day, b] of pts) {
      d += ` L${x(day + 0.5)},${y(prev)} L${x(day + 0.5)},${y(b)}`;
      prev = b;
    }
    return d + ` L${x(LAST_DATE + 1)},${y(prev)}`;
  };
  const ticks = Array.from(
    { length: (hi - lo) / STEP + 1 },
    (_, i) => lo + i * STEP,
  );
  const mondays = [0, 7, 14, 21].map((n) => FIRST_DATE + n);
  const endBal = (prop ?? cur).at(-1)![1],
    noneEnd = none.at(-1)![1];

  return (
    <section
      aria-labelledby="cash-title"
      className="rounded-3xl border border-stone-200 bg-white px-5 pt-5"
    >
      <h2
        id="cash-title"
        className="text-2xl font-bold leading-tight text-stone-900 text-balance sm:text-3xl"
      >
        {PLANNER.cashTitle(onRentDay(shown), !!preview)}
      </h2>
      <p className="mt-1.5 max-w-prose text-stone-500">
        {PLANNER.cashShort}{" "}
        <b className="font-semibold text-red-700">{money(-onRentDay([]))}</b>{" "}
        {PLANNER.cashShortEnd}
      </p>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="cash-chart"
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-sm font-medium text-brand-600 hover:bg-brand-50"
      >
        {open ? PLANNER.hideCash : PLANNER.showCash}
        <ChevronDown
          className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div id="cash-chart">
          <div className="mt-2 overflow-x-auto">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-labelledby="cash-title"
              className="block h-auto w-full min-w-140 tabular-nums"
            >
              {ticks.map((v) => (
                <g key={v}>
                  <line
                    x1={L}
                    x2={W - R}
                    y1={y(v)}
                    y2={y(v)}
                    className={
                      v === 0 ? "stroke-stone-400" : "stroke-stone-200"
                    }
                    strokeWidth={v === 0 ? 1.2 : 1}
                  />
                  <text
                    x={L - 8}
                    y={y(v) + 4}
                    textAnchor="end"
                    className="fill-stone-500 text-[11px]"
                  >
                    {money(v)}
                  </text>
                </g>
              ))}
              {mondays.map((d, i) => (
                <text
                  key={d}
                  x={x(d)}
                  y={H - B + 16}
                  textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"}
                  className="fill-stone-500 text-[11px]"
                >
                  {d} Nov
                </text>
              ))}
              {BILLS.map((b, i) => (
                <g key={b.name}>
                  <line
                    x1={x(b.date + 0.5)}
                    x2={x(b.date + 0.5)}
                    y1={T}
                    y2={H - B + 2}
                    className="stroke-stone-300"
                    strokeDasharray="2 3"
                  />
                  <text
                    x={x(b.date + 0.5)}
                    y={H - B + 34 + (i % 2) * 14}
                    textAnchor="middle"
                    className="fill-stone-800 text-[11px]"
                  >
                    {b.name}{" "}
                    <tspan className="fill-stone-500">{money(b.amount)}</tspan>
                  </text>
                </g>
              ))}
              <path
                d={path(none)}
                fill="none"
                className="stroke-stone-400"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
              <path
                d={path(cur)}
                fill="none"
                className="stroke-brand-600"
                strokeWidth={prop ? 1.5 : 2.5}
                opacity={prop ? 0.45 : 1}
              />
              {prop && (
                <path
                  d={path(prop)}
                  fill="none"
                  className="stroke-brand-600"
                  strokeWidth={2.5}
                  strokeDasharray="1 4"
                  strokeLinecap="round"
                />
              )}
              <circle
                cx={x(LAST_DATE + 1)}
                cy={y(endBal)}
                r={4}
                className="fill-brand-600"
              />
              <text
                x={x(LAST_DATE + 1) + 8}
                y={y(endBal) + 4}
                className="fill-brand-600 text-xs font-bold"
              >
                {money(endBal)}
              </text>
              <circle
                cx={x(LAST_DATE + 1)}
                cy={y(noneEnd)}
                r={4}
                className="fill-red-700"
              />
              <text
                x={x(LAST_DATE + 1) + 8}
                y={y(noneEnd) + 4}
                className="fill-red-700 text-xs font-bold"
              >
                {money(noneEnd)}
              </text>
            </svg>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1 pb-2 text-xs text-stone-500">
            <span>
              <i className="mr-1.5 inline-block w-4 border-t-[2.5px] border-brand-600 align-middle" />
              {PLANNER.legendPlan}
            </span>
            {preview && (
              <span>
                <i className="mr-1.5 inline-block w-4 border-t-[2.5px] border-dotted border-brand-600 align-middle" />
                {PLANNER.legendPreview}
              </span>
            )}
            <span>
              <i className="mr-1.5 inline-block w-4 border-t-2 border-dashed border-stone-400 align-middle" />
              {PLANNER.legendNone}
            </span>
            <span>{PLANNER.legendNote}</span>
          </div>
        </div>
      )}

      <div className="mt-3 border-t border-stone-200 py-4">
        <h3 className="font-display text-sm font-semibold text-stone-900">
          {PLANNER.nextPayments}
        </h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          {bigPayments.map((b) => (
            <li
              key={b.name}
              className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2"
            >
              <span>
                <span className="block font-medium text-stone-900">
                  {b.name}
                </span>
                <span className="block text-xs text-stone-500">
                  {PLANNER.due(b.date)}
                </span>
              </span>
              <span className="font-semibold tabular-nums">
                {money(b.amount)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
