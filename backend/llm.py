"""Claude turns natural language into solver constraints, runs the solver via a tool, and explains the result."""
import json
import os
from datetime import date, datetime, timedelta, timezone

import anthropic
import jsonschema

import planner

MODEL = "claude-opus-5-5"
MAX_TRIES = 3
HERE = os.path.dirname(__file__)
SYSTEM = open(os.path.join(HERE, "system_prompt.md")).read()
SCHEMA = json.load(open(os.path.join(HERE, "..", "src", "backend", "schema.json")))
TOOL = {
    "name": "try_schedule", 
    "description": "Run the shift solver with this complete list of the user's preference constraints "
                   "(it replaces the current list). Returns the resulting week, or an error if hard constraints clash.",
    "input_schema": {"type": "object", "additionalProperties": False, "required": ["constraints"],
                     "properties": {"constraints": SCHEMA["properties"]["constraints"]}, "$defs": SCHEMA["$defs"]},
}
_client = None


def available():
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def client():
    global _client
    _client = _client or anthropic.Anthropic()
    return _client


def _hm(iso):
    return planner._dt(iso).strftime("%a %H:%M")


def _shift_line(s):
    return f"{_hm(s['start'])}–{planner._dt(s['end']):%H:%M} £{s['pay']:.0f}"


def summary(plan, current=None):
    """Compact plan description for the model (tool results and context)."""
    out = {"hours": plan["hours"], "pay": round(plan["pay"]), "shifts": [_shift_line(s) for s in plan["shifts"]],
           "broken": [f"{b['label']}: {b['amount']} {b['unit']}" for b in plan["broken"]] or "none"}
    if current:
        d = planner.diff(current, plan)
        out["vs_current_plan"] = {"shifts_removed": len(d["remove"]), "shifts_added": len(d["add"]),
                                  "pay_change": round(plan["pay"] - current["pay"])}
    return out


def context(user, events, plan, prefs):
    week0 = datetime.fromisoformat(plan["week_start"]).replace(tzinfo=timezone.utc)
    f = plan["finance"]
    cal = [f"{_hm(e['start'])}–{planner._dt(e['end']):%H:%M} {e['title']}" for e in events
           if "T" in e["start"] and week0 <= planner._dt(e["start"]) < week0 + timedelta(days=7)]
    bills = ", ".join(f"{b['name']} £{b['amount']:.0f} on day {b['day']}" for b in f["bills"]) or "none found"
    return "\n".join([
        "<context>",
        f"Today: {date.today():%a %d %b %Y}. Planning week: {week0:%a %d %b} to {week0 + timedelta(days=6):%a %d %b %Y}.",
        f"Job: {user['job'] or 'gig work'}{' (' + user['mode'] + ')' if user['mode'] else ''}, £{user['hourly_pay']:g}/hour.",
        f"What they said at onboarding: {json.dumps(user['preferences'] or '')}",
        f"Fixed calendar this week: {'; '.join(cal) or 'nothing'}",
        f"Money: balance £{f['balance']:.0f} when their statement ends, about £{f['start_balance']:.0f} by the start of "
        f"this week once bills due before then are paid; recurring bills: {bills}; usual spending £{f['weekly_spend']:.0f}/week; "
        f"they need about £{f['weekly_target']:.0f}/week from work to stay afloat this month.",
        f"Current preference constraints: {json.dumps(prefs)}",
        f"Current plan: {json.dumps(summary(plan))}",
        "</context>",
    ])


def chat(history, message, ctx, solve, current):
    """history: [{"role": "user"|"assistant", "content": str}]; solve(constraints) -> plan (raises on bad input).
    Returns (reply, tried) where tried = (constraints, plan) of the last successful try, or None."""
    messages = history + [{"role": "user", "content": f"{ctx}\n\n{message}"}]
    tried = None
    for _ in range(MAX_TRIES + 1):
        r = client().beta.messages.create(
            model=MODEL, max_tokens=16000, system=SYSTEM, tools=[TOOL], messages=messages,
            output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"], fallbacks="default",
        )
        if r.stop_reason == "refusal":
            return "Sorry, I can't help with that one. Ask me about your shifts, hours or bills.", tried
        calls = [b for b in r.content if b.type == "tool_use"]
        if r.stop_reason != "tool_use" or not calls:
            return "".join(b.text for b in r.content if b.type == "text").strip(), tried
        messages.append({"role": "assistant", "content": r.content})
        results = []
        for c in calls:
            try:
                jsonschema.validate({"constraints": c.input["constraints"]}, SCHEMA)
                plan = solve(c.input["constraints"])
                tried = (c.input["constraints"], plan)
                results.append({"type": "tool_result", "tool_use_id": c.id, "content": json.dumps(summary(plan, current))})
            except (jsonschema.ValidationError, planner.Infeasible, KeyError) as e:
                msg = e.message if isinstance(e, jsonschema.ValidationError) else str(e)
                results.append({"type": "tool_result", "tool_use_id": c.id, "content": f"Error: {msg}", "is_error": True})
        messages.append({"role": "user", "content": results})
    return "I couldn't find a plan that fits all of that. Could you tell me which part matters most?", tried
