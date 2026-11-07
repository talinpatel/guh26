"""Raw .ics / .csv text -> table rows. Port of the n8n `Validate` node (n8n/onboarding.json)."""
import csv
import io
import re


class ParseError(ValueError):
    pass


def _iso(v):
    m = re.match(r"^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$", v)
    if not m:
        return v
    y, mo, d, h, mi, s, z = m.groups()
    return f"{y}-{mo}-{d}T{h}:{mi}:{s}{z}" if h else f"{y}-{mo}-{d}"


def _unesc(v):
    return re.sub(r"\\([,;\\])", r"\1", re.sub(r"\\n", "\n", v, flags=re.I))


# shortcut: RRULE is stored raw, not expanded, and TZID times are kept as local wall-clock.
def parse_ics(text):
    out, ev = [], None
    for line in re.split(r"\r?\n", re.sub(r"\r?\n[ \t]", "", text)):
        if line == "BEGIN:VEVENT":
            ev = {}
        elif line == "END:VEVENT":
            if ev and ev.get("start"):
                out.append({"title": ev.get("SUMMARY", ""), "start": ev["start"], "end": ev.get("end", ev["start"]),
                            "location": ev.get("LOCATION", ""), "rrule": ev.get("RRULE", "")})
            ev = None
        elif ev is not None and ":" in line:
            name, v = line.split(":", 1)
            name = name.split(";")[0]
            if name == "DTSTART":
                ev["start"] = _iso(v)
            elif name == "DTEND":
                ev["end"] = _iso(v)
            else:
                ev[name] = _unesc(v)
    if not out:
        raise ParseError("calendar has no events")
    return out


def _num(v):
    try:
        return float(re.sub(r"[£$€,\s]", "", v or ""))
    except ValueError:
        return 0.0


def _ymd(v):
    v = (v or "").strip()
    m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", v)  # UK dd/mm/yyyy
    return f"{m[3]}-{m[2].zfill(2)}-{m[1].zfill(2)}" if m else v[:10]


# Header-matched so common UK exports work (Monzo/Starling "Amount", Barclays/Lloyds "Paid in/out" or "Debit/Credit Amount").
def parse_bank(text):
    rows = [r for r in csv.reader(io.StringIO(text.removeprefix("\ufeff"))) if any(x.strip() for x in r)]
    head = [x.strip().lower() for x in (rows[0] if rows else [])]
    col = lambda pat: next((i for i, h in enumerate(head) if re.search(pat, h)), -1)
    out_c, in_c = col(r"paid out|money out|debit|withdrawal"), col(r"paid in|money in|credit|deposit")
    split = out_c >= 0 and in_c >= 0
    amt = -1 if split else col(r"amount|^value$")
    date = col(r"date")
    desc = col(r"description|name|counter ?party|merchant|payee|details|reference|memo")
    cat, bal = col(r"categor"), col(r"balance")
    if date < 0 or (not split and amt < 0):
        raise ParseError("banking CSV needs Date and Amount (or Paid in/Paid out) columns")
    cell = lambda r, i: r[i] if 0 <= i < len(r) else ""
    txs = []
    for r in rows[1:]:
        d = _ymd(cell(r, date))
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", d):
            continue
        amount = _num(cell(r, in_c)) - _num(cell(r, out_c)) if split else _num(cell(r, amt))
        b = cell(r, bal).strip()
        txs.append({"date": d, "description": cell(r, desc).strip(), "amount": round(amount, 2),
                    "category": cell(r, cat).strip(), "balance": _num(b) if b else None})
    if not txs:
        raise ParseError("banking CSV has no transactions with a readable date")
    return txs
