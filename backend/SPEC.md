# Giggle backend: FastAPI spec

Build a small FastAPI service that replaces the n8n workflows in `n8n/`. The React frontend (`frontend/`) already calls this API. Keep the contract below exactly, so the frontend only needs its base URL changed.

**What it's for:** the stored data feeds a shift scheduler and an LLM that plan gig work around a student's calendar and bills. The dashboard GET is secondary.

## Stack and layout

- Python 3.11+, FastAPI, Pydantic v2, uvicorn.
- Storage: SQLite through the stdlib `sqlite3` module, in one file (`backend/giggle.db`). No ORM.
- Parse .ics and .csv with the stdlib only (`csv`, `re`, `datetime`). The rules are below.
- Files: `backend/main.py` (app and routes), `backend/parse.py` (ics/csv parsing), `backend/planner.py` (rows → solver → week plan), `backend/llm.py` + `backend/system_prompt.md` (Claude), `backend/test_main.py` (pytest), `backend/requirements.txt`. The solver itself is `src/backend/fixed_scheduler.py`.
- Setup (from `backend/`): `python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt`. Put `ANTHROPIC_API_KEY=...` in `backend/.env` (gitignored).
- Run: `.venv/bin/uvicorn main:app --reload --port 8000 --env-file .env` from `backend/`. Test: `.venv/bin/pytest -q` (no network; Claude is stubbed).

## CORS

Allow origin `http://localhost:5173` (Vite dev server), methods `GET, POST, OPTIONS`, header `Content-Type`. Use `fastapi.middleware.cors.CORSMiddleware`. The browser sends a preflight because the body is JSON. Error responses must carry CORS headers too, which the middleware handles.

## Endpoints

### `POST /onboarding`

Sent once when the user finishes onboarding (`frontend/src/Onboarding.tsx`). It stores everything and **replaces** any earlier rows for the same `user_id`: delete, then insert, inside one transaction.

Request body (JSON):

```json
{
  "user_id": "123e4567-e89b-42d3-a456-426614174000",
  "calendar": "BEGIN:VCALENDAR\n...raw .ics file text...",
  "banking": "Date,Description,Amount,Balance\n...raw .csv file text...",
  "job": "Deliveroo",
  "mode": "Bike",
  "hourly_pay": 14,
  "preferences": "I work late nights. Keep Sundays free - max 20 hours a week."
}
```

| Field | Rule |
|---|---|
| `user_id` | Required. Must be a UUID (the browser generates it with `crypto.randomUUID()`) |
| `calendar` | Required string. Raw .ics text |
| `banking` | Required string. Raw .csv text |
| `job` | String, trimmed, at most 100 chars |
| `mode` | String or `null`, at most 50 chars. `null` for non-gig jobs |
| `hourly_pay` | Required number, `0 < x < 200` (£ per hour) |
| `preferences` | String, at most 2000 chars, may be empty. Natural language, passed to the LLM as-is |

Responses:

- `200`: `{ "ok": true, "user_id": "...", "events": 12, "transactions": 12 }`, with the counts that were stored.
- `422`: `{ "detail": "<message>" }` for any validation or parse failure. Cases:
  - Pydantic field errors
  - calendar has no events
  - banking CSV has no Date column, or no Amount / Paid in+Paid out columns
  - banking CSV has no rows with a readable date

  The frontend only checks `res.ok` and shows a "Try again" screen.
- Limit the request body to 5 MB (return `413` above that).

### `GET /dashboard?user_id=<uuid>`

Returns everything stored for the user, plus cashflow derived from the transactions.

- `422` if `user_id` is not a UUID.
- An unknown `user_id` returns `200` with an empty payload, not 404:
  `{ "user": null, "events": [], "transactions": [], "cashflow": { "balance": null, "bills": [] } }`

Response:

```json
{
  "user": {
    "user_id": "uuid", "job": "Deliveroo", "mode": "Bike", "hourly_pay": 14,
    "preferences": "Evenings only", "updated_at": "2026-11-07T16:00:00Z"
  },
  "events": [
    { "title": "Algorithms Lecture", "start": "2026-11-09T09:00:00Z", "end": "2026-11-09T11:00:00Z", "location": "Room 1.01", "rrule": "" }
  ],
  "transactions": [
    { "date": "2026-11-04", "description": "Tesco", "amount": -42.3, "category": "", "balance": 312.4 }
  ],
  "cashflow": {
    "balance": 312.4,
    "bills": [ { "name": "Tesco", "amount": 42.3, "day": 4 } ]
  }
}
```

- Sort `events` by `start` ascending and `transactions` by `date` ascending.
- `cashflow.balance`: the `balance` of the latest-dated transaction that has one, else `null`.
- `cashflow.bills`: group outgoing transactions (`amount < 0`, non-empty description) by lowercased description. Keep a group if it spans 2 or more distinct months (`YYYY-MM`). For each kept group, use its latest transaction: `name` = description, `amount` = positive value, `day` = day of month as int. Sort by `day`.

## Tables (SQLite)

```sql
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
```

Create the tables on startup. Times are ISO strings and dates are `YYYY-MM-DD`. A negative `amount` is money out. Use parameterised queries only.

## Parsing rules

`n8n/onboarding.json` contains a working JavaScript version of these rules, in the `jsCode` of the node named **Validate**. Port it to Python and keep the same behaviour.

### .ics → events

1. Unfold lines: remove every `\r\n` or `\n` that is followed by a space or tab, along with that space or tab.
2. Walk the lines. `BEGIN:VEVENT` starts an event and `END:VEVENT` ends it. Keep an event only if it has a start.
3. Inside an event, split each line at its first `:`. The property name is the part before the first `;` (this drops params like `TZID=...`).
4. `DTSTART` / `DTEND` values become ISO strings:
   - `20261109T090000Z` → `2026-11-09T09:00:00Z`
   - `20261109T090000` → `2026-11-09T09:00:00` (no Z: local time)
   - `20261109` → `2026-11-09`
   - anything else is kept as-is
5. `SUMMARY` → `title`, `LOCATION` → `location`, `RRULE` → `rrule`, kept raw (do not expand recurrences). Missing values become `""`. If `DTEND` is missing, `end` = `start`.
6. Unescape text values: `\n` or `\N` → newline; `\,` `\;` `\\` → `,` `;` `\`.

### .csv → transactions

Read the CSV with the `csv` module, which handles quoted commas. Strip a leading BOM (`\ufeff`). Skip blank rows. Match columns by lowercased, trimmed header, taking the first header that matches each regex:

| Field | Header regex |
|---|---|
| out | `paid out\|money out\|debit\|withdrawal` |
| in | `paid in\|money in\|credit\|deposit` |
| amount | `amount\|^value$`, used **only if out and in are not both present**, because Lloyds has "Debit Amount" / "Credit Amount" |
| date | `date` |
| description | `description\|name\|counter ?party\|merchant\|payee\|details\|reference\|memo` |
| category | `categor` |
| balance | `balance` |

- If there is no date column, or neither an amount column nor both in and out columns, return 422.
- Numbers: strip `£ $ € ,` and whitespace, then parse as a float. Unparseable or empty counts as 0. Amount = `in - out` for split columns, else the amount column, rounded to 2 dp.
- Dates: `dd/mm/yyyy` (or `.` / `-` separators, 1–2 digit day/month) → `yyyy-mm-dd`. Otherwise take the first 10 chars. Drop rows whose date doesn't match `^\d{4}-\d{2}-\d{2}$`.
- `balance` is `null` if the CSV has no balance column or the cell is empty.

## Tests (pytest + `fastapi.testclient`)

Use the fixture files `demo/test_lectures.ics` and `demo/bank_statement.csv`. Expected results come from `n8n/workflows.test.mjs`:

1. POST the demo files → 200 with `transactions == 12`. The first event is `{"title": "Algorithms Lecture", "start": "2026-11-09T09:00:00Z", "end": "2026-11-09T11:00:00Z", "location": "Room 1.01", "rrule": ""}`. The last transaction is `{"date": "2026-11-04", "description": "Tesco", "amount": -42.3, "category": "", "balance": 312.4}`.
2. Split columns, UK dates, quoted comma, BOM:
   `"\ufeffDate,Memo,Paid out,Paid in\r\n04/11/2026,\"Tesco, Fallowfield\",42.30,\r\n05/11/2026,Deliveroo,,\"1,184.20\"\r\n"`
   → `[("2026-11-04", "Tesco, Fallowfield", -42.3), ("2026-11-05", "Deliveroo", 1184.2)]`
3. Each returns 422: `user_id="x"`; `hourly_pay=-1`; `banking="foo,bar\n1,2"`.
4. GET after test 1: `cashflow == {"balance": 312.4, "bills": [{"name": "Tesco", "amount": 42.3, "day": 4}]}`, and `user.preferences` matches what was posted.
5. POST twice with the same `user_id`. The counts must not double, because rows are replaced.
6. GET with an unknown UUID returns the empty payload.
7. An `OPTIONS /onboarding` with `Origin: http://localhost:5173` returns `Access-Control-Allow-Origin: http://localhost:5173`.

Use a temporary database file per test (for example, read the path from a `GIGGLE_DB` env var, defaulting to `giggle.db`).

## Scheduling and chat (added on top of the n8n contract)

After `POST /onboarding` stores the rows it builds the first week (the response also has `"shifts": n`):

1. `planner.finance` turns the transactions into soft `earn` targets for the week: bills plus usual spending over the next 4 weeks, minus the balance, divided by 4 (weight 1000), then "+ clear overdraft" (weight 100).
2. Claude (`claude-opus-5-5`) reads the user's preferences and calls a `try_schedule` tool with a constraint list (`src/backend/schema.json`). The tool runs the CP-SAT solver and returns the week, so Claude's reply is based on what the solver actually produced.
3. The plan is stored in `plans`, and the preferences plus Claude's summary become the first two chat `messages`. Without `ANTHROPIC_API_KEY`, or if the API fails, a plan built from the money targets alone is stored instead.

The planning week is the Monday on or after the onboarding date. Later replans keep that week.

`GET /dashboard` also returns `schedule` (`week_start`, `shifts: [{start, end, hours, pay}]`, `hours`, `pay`, `finance: {balance, weekly_spend, weekly_target, bills}`, `constraints`, `broken`), `constraints` (the current preference list) and `messages`. An unknown user gets `schedule: null, constraints: [], messages: []`.

### `POST /chat`

`{ "user_id": "uuid", "message": "Am I free to take Friday off?" }` → `{ "messages": [userMsg, aiMsg] }`

Each message is `{ id, role: "user"|"ai", text, change? }`. When Claude tried a schedule whose shifts differ from the current one, `aiMsg.change = { add: [shift], remove: ["<start><end>"], pay, hours, status: "pending" }`. Nothing is applied yet. Any older pending change becomes `"undone"`. A plain question gets no `change`. Returns `404` before onboarding and `502` if Claude is unreachable.

### `POST /proposals/{message_id}`

`{ "user_id": "uuid", "accept": true }` applies the change (its constraints and schedule become the plan). `accept: false` marks it undone. Returns `{ "ok": true, "schedule": ... }`, or `409` if that message has no pending change.

## Frontend hookup

`frontend/src/lib/api.ts` calls `VITE_API_URL` (default `http://localhost:8000`). Onboarding POSTs `/onboarding`, and the Planner loads `/dashboard`, chats via `/chat` and settles changes via `/proposals`.

## Out of scope

Auth (`user_id` acts as a bearer token, which is fine for the hackathon), expanding RRULEs (weekly lectures only show up in the week they're dated), timezone conversion (everything is UTC wall-clock), and multiple jobs per user.
