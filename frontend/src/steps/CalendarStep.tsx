import { useState } from "react";
import { CheckCircle2, FileUp } from "lucide-react";
import Nav from "./Nav.tsx";
import { CALENDAR } from "../constants/onboarding.ts";

const option = (active: boolean) =>
  `flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-sm font-medium transition ${
    active
      ? "border-brand-600 bg-brand-50 text-brand-800 ring-4 ring-brand-100"
      : "border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-stone-50"
  }`;

export type Calendar = { filename: string; ics: string };

export default function CalendarStep({ onNext }: { onNext: (c: Calendar) => void }) {
  const [calendar, setCalendar] = useState<Calendar | null>(null);

  return (
    <>
      <h2 id="step-title" className="text-2xl font-semibold text-stone-900">
        {CALENDAR.title}
      </h2>
      <p className="mt-1 text-sm text-stone-500">{CALENDAR.subtitle}</p>

      <div className="mt-5 grid items-center">
        <label className={option(!!calendar)}>
          <FileUp className="size-6" />
          {CALENDAR.icsLabel}
          <input
            type="file"
            accept=".ics,text/calendar"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setCalendar({ filename: f.name, ics: await f.text() });
            }}
          />
        </label>
      </div>

      {calendar && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3">
          <CheckCircle2 className="size-5 shrink-0 text-brand-600" />
          <p className="text-sm text-brand-900">
            <strong>{CALENDAR.connected}</strong> {CALENDAR.connectedNote}
          </p>
        </div>
      )}

      <Nav onNext={() => calendar && onNext(calendar)} disabled={!calendar} />
    </>
  );
}
