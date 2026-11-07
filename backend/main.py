"""Giggle API: onboarding, dashboard, and the scheduling chat. Run: uvicorn main:app --reload --port 8000 --env-file .env"""
import json
import logging
import os
import sqlite3
from datetime import datetime, timezone
from typing import Annotated, Optional
from uuid import UUID

import anthropic
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, StringConstraints

import llm
import planner
from parse import ParseError, parse_bank, parse_ics

log = logging.getLogger("giggle")
MAX_BODY = 5 * 1024 * 1024
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY, job TEXT, mode TEXT, hourly_pay REAL NOT NULL,
  preferences TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, title TEXT, start TEXT NOT NULL,
  "end" TEXT NOT NULL, location TEXT, rrule TEXT
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL,
  description TEXT, amount REAL NOT NULL, category TEXT, balance REAL
);
CREATE INDEX IF NOT EXISTS ev_user ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS tx_user ON transactions(user_id);
CREATE TABLE IF NOT EXISTS plans (
  user_id TEXT PRIMARY KEY, constraints TEXT NOT NULL, schedule TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL,
  proposal TEXT, status TEXT
);
CREATE INDEX IF NOT EXISTS msg_user ON messages(user_id);
CREATE TABLE IF NOT EXISTS bank (user_id TEXT PRIMARY KEY, summary TEXT NOT NULL);
"""
TABLES = ("users", "calendar_events", "transactions", "plans", "messages", "bank")

app = FastAPI(title="Giggle")


@app.middleware("http")
async def limit_body(request: Request, call_next):
    # shortcut: trusts Content-Length (browsers always send it for fetch JSON); count streamed bytes if exposed publicly.
    if int(request.headers.get("content-length") or 0) > MAX_BODY:
        return JSONResponse({"detail": "request body over 5 MB"}, status_code=413)
    return await call_next(request)


# Added last so it wraps everything, including 413s and errors.
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
                   allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type"])


@app.exception_handler(RequestValidationError)
async def flat_422(_, exc: RequestValidationError):
    e = exc.errors()[0]
    return JSONResponse({"detail": f"{'.'.join(map(str, e['loc'][1:])) or 'body'}: {e['msg']}"}, status_code=422)


def db():
    con = sqlite3.connect(os.environ.get("GIGGLE_DB", os.path.join(os.path.dirname(__file__), "giggle.db")))
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA_SQL)
    return con


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------- reads ----------
def load(con, uid):
    q = lambda sql: [dict(r) for r in con.execute(sql, (uid,))]
    users = q("SELECT user_id, job, mode, hourly_pay, preferences, updated_at FROM users WHERE user_id = ?")
    events = q('SELECT title, start, "end", location, rrule FROM calendar_events WHERE user_id = ? ORDER BY start, id')
    txs = q("SELECT date, description, amount, category, balance FROM transactions WHERE user_id = ? ORDER BY date, id")
    return (users[0] if users else None), events, txs


def load_bank(con, uid):
    r = con.execute("SELECT summary FROM bank WHERE user_id = ?", (uid,)).fetchone()
    return json.loads(r["summary"]) if r else None


def load_plan(con, uid):
    r = con.execute("SELECT constraints, schedule FROM plans WHERE user_id = ?", (uid,)).fetchone()
    return (json.loads(r["constraints"]), json.loads(r["schedule"])) if r else ([], None)


def message_out(r):
    m = {"id": r["id"], "role": r["role"], "text": r["text"]}
    if r["proposal"]:
        p = json.loads(r["proposal"])
        m["change"] = {"add": p["add"], "remove": p["remove"], "pay": p["schedule"]["pay"],
                       "hours": p["schedule"]["hours"], "status": r["status"]}
    return m


def messages(con, uid):
    return [message_out(r) for r in con.execute("SELECT * FROM messages WHERE user_id = ? ORDER BY id", (uid,))]


def save_plan(con, uid, constraints, schedule):
    con.execute("INSERT OR REPLACE INTO plans VALUES (?, ?, ?, ?)", (uid, json.dumps(constraints), json.dumps(schedule), now()))


def add_message(con, uid, role, text, proposal=None):
    cur = con.execute("INSERT INTO messages (user_id, role, text, proposal, status) VALUES (?, ?, ?, ?, ?)",
                      (uid, role, text, json.dumps(proposal) if proposal else None, "pending" if proposal else None))
    return cur.lastrowid


def history(con, uid, limit=20):
    rows = con.execute("SELECT role, text FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?", (uid, limit)).fetchall()
    out = [{"role": "assistant" if r["role"] == "ai" else "user", "content": r["text"]} for r in reversed(rows)]
    return out[1:] if out and out[0]["role"] == "assistant" else out  # the API wants a user turn first


def default_reply(plan):
    return (f"Here's your week: {len(plan['shifts'])} shifts, {plan['hours']:g} hours, about £{plan['pay']:.0f}. "
            f"You need about £{plan['finance']['weekly_target']:.0f} a week to cover your bills.")


# ---------- routes ----------
class OnboardingIn(BaseModel):
    user_id: UUID
    calendar: str
    banking: str
    job: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] = ""
    mode: Optional[Annotated[str, StringConstraints(max_length=50)]] = None
    hourly_pay: float = Field(gt=0, lt=200)
    preferences: Annotated[str, StringConstraints(max_length=2000)] = ""


@app.post("/onboarding")
def onboarding(b: OnboardingIn):
    try:
        events, txs = parse_ics(b.calendar), parse_bank(b.banking)
    except ParseError as e:
        raise HTTPException(422, str(e))
    bank = planner.analyse_bank(b.banking, sorted(txs, key=lambda t: t["date"]))
    uid = str(b.user_id)
    con = db()
    with con:  # replace this user's rows atomically
        for t in TABLES:
            con.execute(f"DELETE FROM {t} WHERE user_id = ?", (uid,))
        con.execute("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)", (uid, b.job, b.mode, b.hourly_pay, b.preferences, now()))
        con.executemany('INSERT INTO calendar_events (user_id, title, start, "end", location, rrule) VALUES (?, ?, ?, ?, ?, ?)',
                        [(uid, e["title"], e["start"], e["end"], e["location"], e["rrule"]) for e in events])
        con.executemany("INSERT INTO transactions (user_id, date, description, amount, category, balance) VALUES (?, ?, ?, ?, ?, ?)",
                        [(uid, t["date"], t["description"], t["amount"], t["category"], t["balance"]) for t in txs])
        con.execute("INSERT INTO bank VALUES (?, ?)", (uid, json.dumps(bank)))
    shifts = first_plan(con, uid)
    return {"ok": True, "user_id": uid, "events": len(events), "transactions": len(txs), "shifts": shifts}


def first_plan(con, uid):
    """Initial schedule from the onboarding preferences. Falls back to money-only constraints if the LLM fails."""
    user, events, _ = load(con, uid)
    bank, week0 = load_bank(con, uid), planner.next_monday()
    solve = lambda prefs: planner.run(prefs, user, events, bank, week0)
    base = solve([])
    prefs, plan, reply = [], base, default_reply(base)
    if llm.available():
        try:
            ask = f"My preferences: {user['preferences'] or 'none in particular'}\nPlease build my first week."
            reply, tried = llm.chat([], ask, llm.context(user, events, base, []), solve, None)
            if tried:
                prefs, plan = tried
        except anthropic.APIError as e:
            log.warning("LLM unavailable for first plan: %s", e)
    with con:
        save_plan(con, uid, prefs, plan)
        if user["preferences"]:
            add_message(con, uid, "user", user["preferences"])
        add_message(con, uid, "ai", reply or default_reply(plan))
    return len(plan["shifts"])


@app.get("/dashboard")
def dashboard(user_id: UUID):
    con = db()
    uid = str(user_id)
    user, events, txs = load(con, uid)
    prefs, plan = load_plan(con, uid)
    bank = load_bank(con, uid)
    return {
        "user": user, "events": events, "transactions": txs,
        "cashflow": {"balance": planner.balance_of(txs),
                     "bills": [{k: x[k] for k in ("name", "amount", "day")} for x in bank["bills"]] if bank else []},
        "schedule": plan, "constraints": prefs, "messages": messages(con, uid),
    }


class ChatIn(BaseModel):
    user_id: UUID
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


@app.post("/chat")
def chat(b: ChatIn):
    con = db()
    uid = str(b.user_id)
    user, events, _ = load(con, uid)
    prefs, plan = load_plan(con, uid)
    bank = load_bank(con, uid)
    if not user or not plan or not bank:  # no bank summary = onboarded before it existed
        raise HTTPException(404, "onboard first")
    week0 = datetime.fromisoformat(plan["week_start"]).replace(tzinfo=timezone.utc)
    solve = lambda c: planner.run(c, user, events, bank, week0)
    try:
        reply, tried = llm.chat(history(con, uid), b.message, llm.context(user, events, plan, prefs), solve, plan)
    except anthropic.APIError as e:
        log.warning("LLM error: %s", e)
        raise HTTPException(502, "the assistant is unavailable, try again")
    proposal = None
    with con:
        con.execute("UPDATE messages SET status = 'undone' WHERE user_id = ? AND status = 'pending'", (uid,))
        if tried and tried[0] != prefs:
            d = planner.diff(plan, tried[1])
            if d["add"] or d["remove"]:
                proposal = {"constraints": tried[0], "schedule": tried[1], **d}
            else:  # same shifts: keep the new constraints without asking
                save_plan(con, uid, tried[0], tried[1])
        ids = [add_message(con, uid, "user", b.message), add_message(con, uid, "ai", reply, proposal)]
    rows = con.execute(f"SELECT * FROM messages WHERE id IN ({','.join('?' * len(ids))}) ORDER BY id", ids)
    return {"messages": [message_out(r) for r in rows]}


class ProposalIn(BaseModel):
    user_id: UUID
    accept: bool


@app.post("/proposals/{message_id}")
def settle(message_id: int, b: ProposalIn):
    con = db()
    uid = str(b.user_id)
    r = con.execute("SELECT * FROM messages WHERE id = ? AND user_id = ?", (message_id, uid)).fetchone()
    if not r or r["status"] != "pending":
        raise HTTPException(409, "no pending change with that id")
    with con:
        if b.accept:
            p = json.loads(r["proposal"])
            save_plan(con, uid, p["constraints"], p["schedule"])
        con.execute("UPDATE messages SET status = ? WHERE id = ?", ("accepted" if b.accept else "undone", message_id))
    return {"ok": True, "schedule": load_plan(con, uid)[1]}
