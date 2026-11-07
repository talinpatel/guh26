"""MVP: fixed events (hard) + day preferences (soft) -> CP-SAT -> .ics

Usage: python fixed_scheduler.py input.ics output.ics [prefs.json]
prefs.json (LLM-generated), e.g.
  {"day_pref": {"mon": 10, "tue": 3, "wed": 3, "thu": 3, "fri": 3, "sat": 0, "sun": null},
   "min_hours": 10, "max_hours": 15}
day_pref: cost per work slot on that day (0 = preferred, higher = avoid, null = never)
"""
import json
import sys
from datetime import datetime, timedelta, timezone

from icalendar import Calendar, Event
from ortools.sat.python import cp_model

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
SLOT = 30                      # minutes per slot
SLOTS = 24 * 60 // SLOT        # 48 per day
WINDOW = (8 * 60 // SLOT, 22 * 60 // SLOT)  # work allowed 08:00-22:00
MAX_DAILY_HOURS = 8
MIN_SHIFT_HOURS = 2
DEFAULT_PREFS = {"day_pref": {d: 1 for d in DAYS}, "min_hours": 10, "max_hours": 15}


def to_min(dt):  # aware datetime -> minutes since epoch (UTC)
    return int((dt.astimezone(timezone.utc) - EPOCH).total_seconds() // 60)


def load_events(path):
    cal = Calendar.from_ical(open(path, "rb").read())
    events = []
    for comp in cal.walk("VEVENT"):
        start = comp.decoded("DTSTART")
        if not isinstance(start, datetime):
            continue  # all-day events: passed through untouched
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        end = comp.decoded("DTEND") if "DTEND" in comp else start + comp.decoded("DURATION")
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        events.append({"uid": str(comp.get("UID")), "comp": comp,
                       "start": start, "end": end, "tz": start.tzinfo})
    return cal, events


def build_constraints(events, prefs):
    # Every input event is essential -> a hard "fixed" constraint.
    cons = [{"type": "fixed", "uid": e["uid"],
             "start": to_min(e["start"]), "end": to_min(e["end"])} for e in events]
    cons.append({"type": "hours", "min": prefs["min_hours"], "max": prefs["max_hours"]})
    for day, w in prefs["day_pref"].items():
        cons.append({"type": "day_pref", "day": DAYS.index(day), "weight": w})
    return cons


def slot_start(week0, d, s):
    return week0 + timedelta(days=d, minutes=s * SLOT)


def solve(events, constraints, week0):
    m = cp_model.CpModel()
    lo = min(to_min(e["start"]) for e in events)
    hi = max(to_min(e["end"]) for e in events)

    # Fixed events: interval vars pinned to their original start.
    fixed = {}
    for e in events:
        dur = to_min(e["end"]) - to_min(e["start"])
        s = m.NewIntVar(lo, hi, f"s_{e['uid']}")
        fixed[e["uid"]] = s
        m.NewIntervalVar(s, dur, s + dur, f"i_{e['uid']}")

    # Work grid: work[d, s] = 1 if working in that 30-min slot.
    work = {(d, s): m.NewBoolVar(f"w{d}_{s}") for d in range(7) for s in range(SLOTS)}
    for (d, s), w in work.items():
        a = to_min(slot_start(week0, d, s))
        if not WINDOW[0] <= s < WINDOW[1] or any(
                a < to_min(e["end"]) and to_min(e["start"]) < a + SLOT for e in events):
            m.Add(w == 0)  # outside window or overlaps a lecture

    # One contiguous shift per day, capped length.
    for d in range(7):
        starts = [m.NewBoolVar(f"st{d}_{s}") for s in range(SLOTS)]
        for s in range(SLOTS):
            prev = work[d, s - 1] if s else 0
            m.Add(starts[s] >= work[d, s] - prev)
        m.Add(sum(starts) <= 1)
        for s in range(SLOTS):  # a shift starting at s lasts >= MIN_SHIFT
            for k in range(MIN_SHIFT_HOURS * 60 // SLOT):
                if s + k < SLOTS:
                    m.Add(work[d, s + k] == 1).OnlyEnforceIf(starts[s])
                else:
                    m.Add(starts[s] == 0)
        m.Add(sum(work[d, s] for s in range(SLOTS)) <= MAX_DAILY_HOURS * 60 // SLOT)

    penalties = []
    for c in constraints:
        if c["type"] == "fixed":
            m.Add(fixed[c["uid"]] == c["start"])
        elif c["type"] == "hours":  # hard bounds, in slots
            total = sum(work.values())
            m.Add(total >= c["min"] * 60 // SLOT)
            m.Add(total <= c["max"] * 60 // SLOT)
        elif c["type"] == "day_pref":
            day = [work[c["day"], s] for s in range(SLOTS)]
            if c["weight"] is None:          # hard: never
                m.Add(sum(day) == 0)
            else:                            # soft: cost per slot
                penalties.append(int(c["weight"]) * sum(day))

    m.Minimize(sum(penalties))
    solver = cp_model.CpSolver()
    if solver.Solve(m) not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError("Infeasible constraint set")
    times = {uid: solver.Value(s) for uid, s in fixed.items()}
    slots = {k for k, v in work.items() if solver.Value(v)}
    return times, slots, solver.ObjectiveValue()


def work_blocks(slots, week0):
    """Merge consecutive work slots into (start, end) datetimes."""
    blocks = []
    for d, s in sorted(slots):
        st = slot_start(week0, d, s)
        if blocks and blocks[-1][1] == st:
            blocks[-1][1] = st + timedelta(minutes=SLOT)
        else:
            blocks.append([st, st + timedelta(minutes=SLOT)])
    return blocks


def write_calendar(cal, events, times, blocks, path):
    for e in events:
        start = (EPOCH + timedelta(minutes=times[e["uid"]])).astimezone(e["tz"])
        end = start + (e["end"] - e["start"])
        comp = e["comp"]
        for key, val in (("DTSTART", start), ("DTEND", end)):
            comp.pop(key, None)
            comp.add(key, val)
        comp.pop("DURATION", None)
    for i, (st, en) in enumerate(blocks):
        ev = Event()
        ev.add("uid", f"work{i}@gig-scheduler")
        ev.add("summary", "Work")
        ev.add("dtstart", st)
        ev.add("dtend", en)
        ev.add("dtstamp", datetime.now(timezone.utc))
        cal.add_component(ev)
    open(path, "wb").write(cal.to_ical())


if __name__ == "__main__":
    cal, events = load_events(sys.argv[1])
    prefs = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else DEFAULT_PREFS
    first = min(e["start"] for e in events).astimezone(timezone.utc)
    week0 = (first - timedelta(days=first.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)

    constraints = build_constraints(events, prefs)
    times, slots, cost = solve(events, constraints, week0)
    blocks = work_blocks(slots, week0)
    write_calendar(cal, events, times, blocks, sys.argv[2])
    print(f"{len(events)} fixed events, {len(slots) * SLOT / 60:g}h work in "
          f"{len(blocks)} shifts, penalty {cost:g} -> {sys.argv[2]}")
    for st, en in blocks:
        print(f"  Work {st:%a %H:%M}-{en:%H:%M}")
