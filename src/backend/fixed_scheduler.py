"""MVP scheduler: fixed events (.ics) + LLM constraints (schema.json) -> CP-SAT -> .ics

Usage: python fixed_scheduler.py input.ics output.ics constraints.json
Constraint types: avoid, hours, shift, earn. No weight = hard; weight = soft.
Objective: minimise soft penalties + hours worked (so it works only what's needed).
"""
import json
import sys
from datetime import date, datetime, timedelta, timezone

from icalendar import Calendar, Event
from ortools.sat.python import cp_model

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
SLOT = 30                     # minutes
SPD = 24 * 60 // SLOT         # slots per day
WORK_WINDOW = ("08:00", "22:00")  # hard default
DEFAULT_RATE = 12.0
DEFAULT_SHIFT = {"type": "shift", "label": "default shift shape", "min_h": 2, "max_per_day": 2}


def slot_of(t):  # "HH:MM" -> slot index
    h, m = map(int, t.split(":"))
    return (h * 60 + m) // SLOT


def n_slots(hours):
    return int(round(hours * 60 / SLOT))


# ---------- calendar I/O ----------
def load_events(path):
    cal = Calendar.from_ical(open(path, "rb").read())
    events = []
    for comp in cal.walk("VEVENT"):
        start = comp.decoded("DTSTART")
        if not isinstance(start, datetime):
            continue  # all-day events passed through
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        end = comp.decoded("DTEND") if "DTEND" in comp else start + comp.decoded("DURATION")
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        events.append({"start": start, "end": end})
    return cal, events


def write_calendar(cal, blocks, path):
    for i, (st, en) in enumerate(blocks):
        ev = Event()
        ev.add("uid", f"work{i}@gig-scheduler")
        ev.add("summary", "Work")
        ev.add("dtstart", st)
        ev.add("dtend", en)
        ev.add("dtstamp", datetime.now(timezone.utc))
        cal.add_component(ev)
    open(path, "wb").write(cal.to_ical())


# ---------- model ----------
class Model:
    def __init__(self, week0, n_days, events, rate):
        self.m = cp_model.CpModel()
        self.week0, self.n_days, self.rate = week0, n_days, rate
        self.penalties = []   # objective terms
        self.reports = []     # (label, var/expr, unit) for soft-violation explanations
        m = self.m
        self.work = {(d, s): m.NewBoolVar(f"w{d}_{s}") for d in range(n_days) for s in range(SPD)}
        self.start = {(d, s): m.NewBoolVar(f"st{d}_{s}") for d in range(n_days) for s in range(SPD)}
        lo, hi = slot_of(WORK_WINDOW[0]), slot_of(WORK_WINDOW[1])
        for (d, s), w in self.work.items():
            m.Add(self.start[d, s] >= w - (self.work[d, s - 1] if s else 0))
            m.Add(self.start[d, s] <= w)
            a = self.slot_time(d, s)
            b = a + timedelta(minutes=SLOT)
            if not lo <= s < hi or any(a < e["end"] and e["start"] < b for e in events):
                m.Add(w == 0)  # outside work window, or clashes with a fixed event

    def slot_time(self, d, s):
        return self.week0 + timedelta(days=d, minutes=s * SLOT)

    def days(self, c):  # day indices in the horizon matching c["days"]
        wanted = c.get("days", DAYS)
        return [d for d in range(self.n_days) if DAYS[d % 7] in wanted]

    def soft(self, c, viol, unit):
        self.penalties.append(c["weight"] * viol)
        self.reports.append((c["label"], viol, unit))

    # ----- constraint types -----
    def avoid(self, c):
        a, b = slot_of(c.get("from", "00:00")), slot_of(c.get("to", "24:00"))
        sel = [self.work[d, s] for d in self.days(c) for s in range(a, b)]
        if "weight" in c:
            v = self.m.NewIntVar(0, len(sel), "")
            self.m.Add(v == sum(sel))
            self.soft(c, v, "half-hours worked")
        else:
            for w in sel:
                self.m.Add(w == 0)

    def hours(self, c):
        ds = self.days(c)
        groups = [[d] for d in ds] if c["per"] == "day" else \
                 [[d for d in ds if d // 7 == wk] for wk in range(self.n_days // 7 + 1)]
        for g in filter(None, groups):
            total = sum(self.work[d, s] for d in g for s in range(SPD))
            for key, sign in (("min", 1), ("max", -1)):
                if key not in c:
                    continue
                bound = n_slots(c[key])
                if "weight" in c:
                    slack = self.m.NewIntVar(0, len(g) * SPD, "")
                    self.m.Add(sign * total + slack >= sign * bound)
                    self.soft(c, slack, f"half-hours {'short' if sign > 0 else 'over'}")
                else:
                    self.m.Add(sign * total >= sign * bound)

    def shift(self, c):
        m = self.m
        for d in range(self.n_days):
            if "max_per_day" in c:
                m.Add(sum(self.start[d, s] for s in range(SPD)) <= c["max_per_day"])
            if "min_h" in c:
                k = n_slots(c["min_h"])
                for s in range(SPD):
                    for i in range(k):
                        if s + i < SPD:
                            m.Add(self.work[d, s + i] == 1).OnlyEnforceIf(self.start[d, s])
                        else:
                            m.Add(self.start[d, s] == 0)
            if "max_h" in c:
                k = n_slots(c["max_h"])
                for s in range(SPD - k):
                    m.Add(sum(self.work[d, s + i] for i in range(k + 1)) <= k)

    def earn(self, c):
        by = date.fromisoformat(c["by"])
        sel = [w for (d, s), w in self.work.items() if self.slot_time(d, s).date() < by]
        pence_per_slot = int(round(self.rate * 100 * SLOT / 60))
        earned = pence_per_slot * sum(sel)
        target = int(round(c["amount"] * 100))
        if "weight" in c:
            short = self.m.NewIntVar(0, int(c["amount"]) + 1, "")  # whole pounds
            self.m.Add(earned + 100 * short >= target)
            self.soft(c, short, "GBP short")
        else:
            self.m.Add(earned >= target)


def solve(events, spec):
    cons = spec["constraints"]
    if not any(c["type"] == "shift" for c in cons):
        cons = cons + [DEFAULT_SHIFT]
    rate = spec.get("hourly_rate", DEFAULT_RATE)

    first = min(e["start"] for e in events).astimezone(timezone.utc)
    week0 = (first - timedelta(days=first.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    last = max([week0.date() + timedelta(days=7)] +
               [date.fromisoformat(c["by"]) for c in cons if c["type"] == "earn"])
    n_days = -(-(last - week0.date()).days // 7) * 7   # round up to whole weeks

    M = Model(week0, n_days, events, rate)
    for c in cons:
        getattr(M, c["type"])(c)
    hours_worked = sum(M.work.values())
    M.m.Minimize(sum(M.penalties) + hours_worked)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 20
    if solver.Solve(M.m) not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise SystemExit("No schedule satisfies the hard constraints. Relax one (e.g. make it soft).")

    chosen = sorted(k for k, v in M.work.items() if solver.Value(v))
    blocks = []
    for d, s in chosen:
        st = M.slot_time(d, s)
        if blocks and blocks[-1][1] == st:
            blocks[-1][1] = st + timedelta(minutes=SLOT)
        else:
            blocks.append([st, st + timedelta(minutes=SLOT)])
    broken = [(lbl, solver.Value(v), unit) for lbl, v, unit in M.reports if solver.Value(v)]
    return blocks, len(chosen) * SLOT / 60, broken


def validate(spec):
    try:
        import jsonschema
        jsonschema.validate(spec, json.load(open("schema.json")))
    except ImportError:
        pass  # pip install jsonschema to enable


if __name__ == "__main__":
    cal, events = load_events(sys.argv[1])
    spec = json.load(open(sys.argv[3]))
    validate(spec)
    blocks, hrs, broken = solve(events, spec)
    write_calendar(cal, blocks, sys.argv[2])

    print(f"{hrs:g}h work in {len(blocks)} shifts -> {sys.argv[2]}")
    for st, en in blocks:
        print(f"  Work {st:%a %d %b %H:%M}-{en:%H:%M}")
    for c in spec["constraints"]:
        print(f"  [{'soft' if 'weight' in c else 'hard'}] {c['label']}")
    for lbl, v, unit in broken:
        print(f"  ! '{lbl}': {v} {unit}")
