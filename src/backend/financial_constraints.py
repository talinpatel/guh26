"""Transactions CSV -> soft `earn` constraints + hourly_rate (our schema.json).

Usage: python financial_constraints.py transactions.csv START_DATE [WEEKS] > financial.json
  START_DATE: first day of the schedule (YYYY-MM-DD). WEEKS: horizon length (default 2).

The solver can't control spending, so spending becomes "earn enough by date X",
in three cumulative priority tiers per week:
  1. bills + essential spending   (weight 1000)
  2. + clear the overdraft         (weight 100)
  3. + usual discretionary spending (weight 10)
Insights (averages, assumptions) are printed to stderr for the UI / demo.
"""
import csv
import json
import re
import sys
from collections import defaultdict
from datetime import date, timedelta

SHIFT_HOURS = 4       # assumption: payouts are "for N shifts", length not given
HISTORY_WEEKS = 8     # window for averaging spending
DISCRETIONARY = {"Restaurants", "Recreation", "Clothing", ("Food", "Snacks / meals")}
NON_ESSENTIAL_BILLS = {"GYM"}


def is_discretionary(r):
    return r["category"] in DISCRETIONARY or (r["category"], r["subcategory"]) in DISCRETIONARY


def read(path):
    return list(csv.DictReader(open(path, newline="", encoding="utf-8-sig")))


def analyse(rows):
    """rows: dicts with this file's CSV columns (see transactions.csv)."""
    rows = sorted(rows, key=lambda r: (r["date"], r["transaction_id"]))
    last = date.fromisoformat(rows[-1]["date"])
    balance = float(rows[-1]["running_balance_gbp"])

    # Pay rate: payouts / shifts, minus per-shift work costs (fuel, parking).
    pay = [r for r in rows if r["type"] == "income"]
    shifts = sum(int(m.group(1)) for r in pay if (m := re.search(r"(\d+) shifts?", r["description"])))
    gross = sum(float(r["amount_gbp"]) for r in pay)
    work_costs = -sum(float(r["amount_gbp"]) for r in rows if r["shift_id"])
    net_rate = (gross - work_costs) / (shifts * SHIFT_HOURS) if shifts else 0.0

    # Recurring bills: bill_id like RENT-08 -> monthly on the same day.
    bills = {}
    for r in rows:
        if r["bill_id"]:
            name = re.sub(r"-\d+$", "", r["bill_id"])
            bills[name] = {"amount": -float(r["amount_gbp"]), "day": int(r["date"][8:]), "label": r["subcategory"] or name.title(),
                           "essential": name not in NON_ESSENTIAL_BILLS}

    # Average weekly variable spending over the recent window (no bills, work costs, one-off shocks).
    since = last - timedelta(weeks=HISTORY_WEEKS)
    weekly = defaultdict(float)
    for r in rows:
        if (r["type"] == "expense" and not r["bill_id"] and not r["shift_id"]
                and "shock" not in r["basis"] and date.fromisoformat(r["date"]) > since):
            weekly["discretionary" if is_discretionary(r) else "essential"] -= float(r["amount_gbp"])
    weekly = {k: v / HISTORY_WEEKS for k, v in weekly.items()}
    return last, balance, net_rate, bills, weekly


def bills_due(bills, start, end, essential):
    """Total of bills due in [start, end), monthly on their usual day."""
    total, d = 0.0, start
    while d < end:
        total += sum(b["amount"] for b in bills.values() if b["day"] == d.day and b["essential"] == essential)
        d += timedelta(days=1)
    return total


def build(path, start, weeks):
    last, balance, rate, bills, weekly = analyse(read(path))
    gap_start = last + timedelta(days=1)   # bills between end of data and schedule start count as due now
    cons = []
    for w in range(1, weeks + 1):
        by = start + timedelta(weeks=w)
        days = (by - gap_start).days
        essentials = bills_due(bills, gap_start, by, True) + weekly.get("essential", 0) * days / 7
        extras = bills_due(bills, gap_start, by, False) + weekly.get("discretionary", 0) * days / 7
        need1 = max(0.0, essentials - max(balance, 0))
        need2 = need1 + max(0.0, -balance)
        need3 = need2 + extras
        for amount, weight, what in ((need1, 1000, "bills + essentials"),
                                     (need2, 100, "+ clear overdraft"),
                                     (need3, 10, "+ usual extras")):
            if amount > 0:
                cons.append({"type": "earn", "label": f"£{amount:.0f} by {by:%d %b} ({what})",
                             "amount": round(amount, 2), "by": by.isoformat(), "weight": weight})

    insights = {
        "data_ends": last.isoformat(),
        "balance": balance,
        "net_hourly_rate": round(rate, 2),
        "assumption": f"{SHIFT_HOURS}h per shift; bills recur monthly on the same day; "
                      f"bills due {gap_start} onwards treated as unpaid",
        "weekly_spend_avg": {k: round(v, 2) for k, v in weekly.items()},
        "monthly_bills": {k: b["amount"] for k, b in bills.items()},
    }
    return {"hourly_rate": round(rate, 2), "constraints": cons}, insights


if __name__ == "__main__":
    spec, insights = build(sys.argv[1], date.fromisoformat(sys.argv[2]),
                           int(sys.argv[3]) if len(sys.argv) > 3 else 2)
    print(json.dumps(insights, indent=2), file=sys.stderr)
    print(json.dumps(spec, indent=2))
