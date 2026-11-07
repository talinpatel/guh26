import os
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import llm
import main
import planner
from parse import parse_bank

DEMO = os.path.join(os.path.dirname(__file__), "..", "demo")
ICS = open(os.path.join(DEMO, "test_lectures.ics")).read()
CSV = open(os.path.join(DEMO, "transactions.csv")).read()  # gig-statement format with bill_id
GENERIC_CSV = """Date,Description,Amount,Balance
2026-10-03,Deliveroo payout,184.20,-408.76
2026-10-05,Tesco,-38.65,-447.41
2026-10-10,Uber Eats payout,142.80,-304.61
2026-10-12,TfL,-24.10,-328.71
2026-10-15,Student loan,1150.00,821.29
2026-10-17,Deliveroo payout,96.50,917.79
2026-10-20,Spotify,-11.99,905.80
2026-10-24,Uber Eats payout,121.35,1027.15
2026-10-28,Rent,-650.00,377.15
2026-10-30,Pret,-7.45,369.70
2026-11-02,Three Mobile,-15.00,354.70
2026-11-04,Tesco,-42.30,312.40
"""


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("GIGGLE_DB", str(tmp_path / "t.db"))
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)  # onboarding falls back to a money-only plan
    monkeypatch.setattr(planner, "next_monday", lambda: datetime(2026, 11, 9, tzinfo=timezone.utc))  # demo lecture week
    return TestClient(main.app)


def body(**kw):
    return {"user_id": str(uuid.uuid4()), "calendar": ICS, "banking": CSV, "job": " Deliveroo ", "mode": "Bike",
            "hourly_pay": 14, "preferences": "Evenings only", **kw}


def test_onboarding_and_dashboard(client):
    b = body()
    r = client.post("/onboarding", json=b)
    assert r.status_code == 200, r.text
    assert r.json()["transactions"] == 207 and r.json()["events"] == 10 and r.json()["shifts"] > 0
    d = client.get("/dashboard", params={"user_id": b["user_id"]}).json()
    assert d["events"][0] == {"title": "Algorithms Lecture", "start": "2026-11-09T09:00:00Z",
                              "end": "2026-11-09T11:00:00Z", "location": "Room 1.01", "rrule": ""}
    assert d["transactions"][-1] == {"date": "2026-10-31", "description": "Fuel for delivery shifts", "amount": -7.79,
                                     "category": "Transport", "balance": -319.12}
    # recurring bills come from bill_id, not repeated descriptions (groceries and fuel aren't bills)
    assert d["cashflow"]["balance"] == -319.12
    assert [(x["name"], x["amount"], x["day"]) for x in d["cashflow"]["bills"]] == [
        ("Rent", 650, 1), ("Council tax contribution", 65, 4), ("Gas & electricity", 72, 8), ("Home broadband", 27, 12),
        ("Mobile plan", 18, 14), ("Vehicle insurance", 74, 18), ("Gym membership", 19, 22), ("Vehicle loan", 62, 25)]
    f = d["schedule"]["finance"]
    assert f["start_balance"] < -319.12 - 650 - 65 - 72  # rent, council tax, energy fall due 1-8 Nov, before the plan
    assert d["schedule"]["pay"] >= f["weekly_target"]  # money-only plan covers the target
    assert d["user"]["preferences"] == "Evenings only" and d["user"]["job"] == "Deliveroo"
    assert [m["role"] for m in d["messages"]] == ["user", "ai"]


def test_generic_bank_csv(client):
    b = body(banking=GENERIC_CSV)
    assert client.post("/onboarding", json=b).json()["transactions"] == 12
    d = client.get("/dashboard", params={"user_id": b["user_id"]}).json()
    assert d["transactions"][-1] == {"date": "2026-11-04", "description": "Tesco", "amount": -42.3,
                                     "category": "", "balance": 312.4}
    assert d["cashflow"] == {"balance": 312.4, "bills": [{"name": "Tesco", "amount": 42.3, "day": 4}]}


def test_split_columns_uk_dates_quotes_bom():
    csv = '\ufeffDate,Memo,Paid out,Paid in\r\n04/11/2026,"Tesco, Fallowfield",42.30,\r\n05/11/2026,Deliveroo,,"1,184.20"\r\n'
    assert [(t["date"], t["description"], t["amount"]) for t in parse_bank(csv)] == \
        [("2026-11-04", "Tesco, Fallowfield", -42.3), ("2026-11-05", "Deliveroo", 1184.2)]


@pytest.mark.parametrize("bad", [{"user_id": "x"}, {"hourly_pay": -1}, {"banking": "foo,bar\n1,2"},
                                 {"calendar": "BEGIN:VCALENDAR\nEND:VCALENDAR"}])
def test_bad_input_422(client, bad):
    r = client.post("/onboarding", json=body(**bad))
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)


def test_replaces_rows(client):
    b = body()
    client.post("/onboarding", json=b)
    client.post("/onboarding", json=b)
    d = client.get("/dashboard", params={"user_id": b["user_id"]}).json()
    assert len(d["events"]) == 10 and len(d["transactions"]) == 207 and len(d["messages"]) == 2


def test_unknown_user_empty(client):
    d = client.get("/dashboard", params={"user_id": str(uuid.uuid4())}).json()
    assert d == {"user": None, "events": [], "transactions": [], "cashflow": {"balance": None, "bills": []},
                 "schedule": None, "constraints": [], "messages": []}
    assert client.get("/dashboard", params={"user_id": "nope"}).status_code == 422


def test_body_limit(client):
    assert client.post("/onboarding", content=b"x", headers={"content-length": str(6 * 1024 * 1024)}).status_code == 413


def test_cors_preflight(client):
    r = client.options("/onboarding", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST",
                                               "Access-Control-Request-Headers": "content-type"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_chat_proposal_accept(client, monkeypatch):
    b = body()
    client.post("/onboarding", json=b)
    uid = b["user_id"]
    before = client.get("/dashboard", params={"user_id": uid}).json()["schedule"]

    def fake_chat(history, message, ctx, solve, current):  # what Claude does: try a constraint, then explain
        assert history[0]["role"] == "user" and "Fixed calendar" in ctx
        cons = [{"type": "avoid", "label": "Sunday off", "days": ["sun"]}]
        return "Done, Sunday is free.", (cons, solve(cons))
    monkeypatch.setattr(llm, "chat", fake_chat)

    ai = client.post("/chat", json={"user_id": uid, "message": "Can I take Sunday off?"}).json()["messages"][1]
    assert ai["text"] == "Done, Sunday is free." and ai["change"]["status"] == "pending"
    assert ai["change"]["add"] and ai["change"]["remove"]
    assert all(not s["start"].startswith("2026-11-15") for s in ai["change"]["add"])
    assert client.get("/dashboard", params={"user_id": uid}).json()["schedule"] == before  # not applied yet

    r = client.post(f"/proposals/{ai['id']}", json={"user_id": uid, "accept": True})
    assert r.status_code == 200
    d = client.get("/dashboard", params={"user_id": uid}).json()
    assert d["constraints"] == [{"type": "avoid", "label": "Sunday off", "days": ["sun"]}]
    assert not any(s["start"].startswith("2026-11-15") for s in d["schedule"]["shifts"])
    assert client.post(f"/proposals/{ai['id']}", json={"user_id": uid, "accept": True}).status_code == 409
    assert client.post("/chat", json={"user_id": str(uuid.uuid4()), "message": "hi"}).status_code == 404
