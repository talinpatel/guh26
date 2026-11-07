# n8n backend

Two workflows. Import each JSON in n8n (Workflows → Import from file).

| Workflow | Endpoint | Does |
|---|---|---|
| `onboarding.json` | `POST /webhook/onboarding` | Validates the body, parses the .ics and .csv, then replaces this user's rows in all 3 tables |
| `dashboard.json` | `GET /webhook/dashboard?user_id=<uuid>` | Returns `{ user, events, transactions, cashflow: { balance, bills } }` |

## Data tables

Create these in n8n (Overview → Data tables) before importing. After import, open every **Data table** node and pick its table from the list.

**users**: `user_id` string, `job` string, `mode` string, `hourly_pay` number, `preferences` string, `updated_at` string

**calendar_events**: `user_id` string, `title` string, `start` string, `end` string, `location` string, `rrule` string

**transactions**: `user_id` string, `date` string, `description` string, `amount` number, `category` string, `balance` number

Times are ISO strings: `2026-11-09T09:00:00Z`, or with no `Z` when the .ics used a TZID. Dates are `YYYY-MM-DD`. A negative `amount` is money out.

## POST body (sent by `frontend/src/Onboarding.tsx`)

```json
{ "user_id": "uuid", "calendar": "<raw .ics>", "banking": "<raw .csv>",
  "job": "Deliveroo", "mode": "Bike", "hourly_pay": 14, "preferences": "Evenings, max 20h" }
```

Bad input makes the workflow throw, so the webhook returns an error and the frontend shows "Try again".

## Test

`node n8n/workflows.test.mjs` runs the Code nodes from both JSON files against `demo/test_lectures.ics` and `demo/bank_statement.csv`. If you edit a Code node in n8n, re-export the workflow over the JSON file and run the test again.
