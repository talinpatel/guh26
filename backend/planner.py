"""Stored rows -> solver inputs -> one week's plan. The solver itself lives in src/backend/."""
import csv
import io
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "backend"))
from fixed_scheduler import solve, validate  # noqa: E402
from financial_constraints import HISTORY_WEEKS, analyse, bills_due  # noqa: E402

PLAN_WEEKS = 4  # money is planned over ~a month; the solver plans one repeating week of it


def bills_of(txs):
    """Outgoings with the same description in 2+ distinct months. txs sorted by date."""
    groups = {}
    for t in txs:
        if t["amount"] < 0 and t["description"]:
            groups.setdefault(t["description"].lower(), []).append(t)
    bills = [{"name": ts[-1]["description"], "amount": -ts[-1]["amount"], "day": int(ts[-1]["date"][8:10])}
             for ts in groups.values() if len({t["date"][:7] for t in ts}) >= 2]
    return sorted(bills, key=lambda b: b["day"])


def balance_of(txs):
    return next((t["balance"] for t in reversed(txs) if t["balance"] is not None), None)


def next_monday(today=None):
    today = today or datetime.now(timezone.utc).date()
    d = today + timedelta(days=-today.weekday() % 7)
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


RICH = {"type", "subcategory", "bill_id", "shift_id", "basis", "transaction_id", "amount_gbp", "running_balance_gbp"}


def analyse_bank(text, txs):
    """Bank CSV -> summary stored at onboarding: {last, balance, bills: [{name, amount, day, essential}], weekly}.
    The gig-statement format (see demo/transactions.csv) goes through financial_constraints.analyse: bills come from
    bill_id and spending is split essential/discretionary. Any other bank CSV: bills = same description in 2+ months."""
    rows = list(csv.DictReader(io.StringIO(text.removeprefix("\ufeff"))))
    if rows and RICH <= set(rows[0]):
        try:
            last, balance, _, bills, weekly = analyse(rows)
            return {"last": last.isoformat(), "balance": balance, "weekly": weekly,
                    "bills": sorted(({"name": b["label"], "amount": b["amount"], "day": b["day"], "essential": b["essential"]}
                                     for b in bills.values()), key=lambda b: b["day"])}
        except ValueError:
            pass  # blank or odd numbers: fall back to the generic reading below
    last = date.fromisoformat(txs[-1]["date"])
    bills = bills_of(txs)
    names = {b["name"].lower() for b in bills}
    since = last - timedelta(weeks=HISTORY_WEEKS)
    spend = [t for t in txs if t["amount"] < 0 and t["description"].lower() not in names
             and date.fromisoformat(t["date"]) > since]
    span = max(7, min(HISTORY_WEEKS * 7, (last - max(since, date.fromisoformat(txs[0]["date"]))).days))
    return {"last": last.isoformat(), "balance": balance_of(txs) or 0.0,
            "bills": [{**b, "essential": True} for b in bills],
            "weekly": {"essential": -sum(t["amount"] for t in spend) / span * 7, "discretionary": 0.0}}


def finance(bank, week0):
    """Bank summary -> this week's soft earn targets, in financial_constraints' three tiers, but spread over the
    month (PLAN_WEEKS) because the solver plans one week that repeats."""
    balance, weekly = bank["balance"], bank["weekly"]
    bills = {b["name"]: b for b in bank["bills"]}
    gap = date.fromisoformat(bank["last"]) + timedelta(days=1)  # bills between end of data and plan start count as due
    start, end = week0.date(), week0.date() + timedelta(weeks=PLAN_WEEKS)
    due = lambda a, b, essential: bills_due(bills, a, b, essential) + weekly.get(
        "essential" if essential else "discretionary", 0) * max(0, (b - a).days) / 7
    need1 = max(0.0, due(gap, end, True) - max(balance, 0)) / PLAN_WEEKS
    need2 = need1 + max(0.0, -balance) / PLAN_WEEKS
    need3 = need2 + due(gap, end, False) / PLAN_WEEKS
    by = (start + timedelta(days=7)).isoformat()
    tiers = ((need1, 1000, "bills + essentials"), (need2, 100, "+ clear overdraft"), (need3, 10, "+ usual extras"))
    cons, prev = [], 0.0
    for amt, w, what in tiers:
        if amt > prev:  # skip tiers that add nothing
            cons.append({"type": "earn", "label": f"£{amt:.0f} this week ({what})", "amount": round(amt, 2), "by": by, "weight": w})
            prev = amt
    info = {
        "balance": balance,
        "start_balance": round(balance - due(gap, start, True) - due(gap, start, False), 2),  # projected to plan start
        "weekly_spend": round(sum(weekly.values()), 2),
        "weekly_target": round(need3, 2),
        "bills": [{k: b[k] for k in ("name", "amount", "day")} for b in bank["bills"]],
    }
    return cons, info


def _dt(s):
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)  # no Z = wall-clock, treated like the solver does


def busy(events, week0):
    """Timed events overlapping the planned week (all-day events skipped, like the solver)."""
    end = week0 + timedelta(days=7)
    out = []
    for e in events:
        if "T" not in e["start"]:
            continue
        s, t = _dt(e["start"]), _dt(e["end"])
        if s < end and t > week0:
            out.append({"start": s, "end": max(t, s)})
    return out


class Infeasible(Exception):
    pass


def run(prefs, user, events, bank, week0=None):
    """prefs: the LLM-managed constraint list; bank: analyse_bank() summary. Returns the plan stored in `plans.schedule`."""
    week0 = week0 or next_monday()
    validate({"constraints": prefs})
    money, info = finance(bank, week0)
    spec = {"constraints": prefs + money, "hourly_rate": user["hourly_pay"]}
    try:
        blocks, hours, broken = solve(busy(events, week0), spec, week0)
    except SystemExit as e:
        raise Infeasible(str(e)) from None
    rate = user["hourly_pay"]
    shifts = [{"start": a.isoformat().replace("+00:00", "Z"), "end": b.isoformat().replace("+00:00", "Z"),
               "hours": (b - a).seconds / 3600, "pay": round(rate * (b - a).seconds / 3600, 2)} for a, b in blocks]
    return {
        "week_start": week0.date().isoformat(),
        "shifts": shifts,
        "hours": hours,
        "pay": round(rate * hours, 2),
        "finance": info,
        "constraints": [{"label": c["label"], "hard": "weight" not in c} for c in spec["constraints"]],
        "broken": [{"label": lbl, "amount": v, "unit": unit} for lbl, v, unit in broken],
    }


def diff(old, new):
    """Shifts removed/added between two plans, keyed by start+end."""
    key = lambda s: s["start"] + s["end"]
    ok, nk = {key(s) for s in old["shifts"]}, {key(s) for s in new["shifts"]}
    return {"remove": [key(s) for s in old["shifts"] if key(s) not in nk],
            "add": [s for s in new["shifts"] if key(s) not in ok]}


if __name__ == "__main__":  # self-check on the demo files
    from parse import parse_bank, parse_ics
    root = os.path.join(os.path.dirname(__file__), "..", "demo")
    ev = parse_ics(open(os.path.join(root, "test_lectures.ics")).read())
    csv_text = open(os.path.join(root, "transactions.csv")).read()
    bank = analyse_bank(csv_text, sorted(parse_bank(csv_text), key=lambda t: t["date"]))
    plan = run([], {"hourly_pay": 14}, ev, bank, datetime(2026, 11, 9, tzinfo=timezone.utc))
    print(json.dumps(plan, indent=1))
