"""Purchase decision records: what was surfaced, bought, inspected, sent and paid.

Each phone moves through these stages, and each is recorded separately:

    surfaced -> purchased -> inspected (pass/fail) -> sent to buyer -> paid

Money is recorded once, where it happens:

    acquisition cost  = price + shipping to you + sales tax      (purchased)
    selling costs     = shipping to buyer + other selling costs  (sent)
    payout received   = money that actually reached you          (paid)

    actual profit = payout received - acquisition cost - selling costs

"Payout received" is after any payout fee the buyer or PayPal took, so that
fee is NOT entered again as a selling cost.
"""

import json
import re
from datetime import date, datetime, timedelta, timezone

IMEI_RESULTS = ("clean", "flagged", "not-checked")

# Every box must be ticked before the dashboard lets you record a purchase
CHECKLIST = (
    ("imei", "IMEI verified", "Not blacklisted, financed or reported lost"),
    ("lock", "Activation Lock disabled", "Find My is off, confirmed by the seller"),
    ("carrier", "Carrier unlock confirmed", "IMEI check shows the phone unlocked"),
    ("owner", "Ownership verified", "The seller owns the phone outright"),
    ("condition", "Physical condition inspected", "Photos match the grade the quote assumes"),
    ("quote", "Buyer quote rechecked", "Same payout today, for this exact spec"),
    ("checkout", "Final checkout cost confirmed", "Price, shipping and the tax eBay charges"),
)


class TrackingError(Exception):
    pass


# ---------- Storage ----------

def load_state(path):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return {"alerted": {}}


def save_state(state, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(state, f, indent=2)


def _entry(state, item_id):
    entry = state["alerted"].get(item_id)
    if entry is None:
        raise TrackingError(f"{item_id} isn't in the alert history.")
    return entry


def _money(value):
    value = round(float(value), 2)
    if value < 0:
        raise TrackingError("Amounts can't be negative.")
    return value


def _day(on):
    return (on or date.today()).isoformat()


# ---------- Stages ----------

def new_deals(deals, state):
    return [d for d in deals if d["item_id"] not in state["alerted"]]


def record_alerted(deals, state, now=None):
    now = now or datetime.now(timezone.utc)
    for deal in deals:
        best = deal["best"]
        state["alerted"][deal["item_id"]] = {
            "surfaced_at": now.isoformat(),
            "phone": deal["phone"],
            "title": deal["title"],
            "url": deal["url"],
            "seller": deal["seller"],
            "buyer": best["buyer"],
            "quoted_payout": best["payout"],
            # What should reach you from this buyer if the phone grades as quoted
            "expected_payout": round(best["payout"] - best["payout_fee"], 2),
            "estimated_profit": best["net_profit"],
            "spec": deal.get("spec"),
            "ebay_condition": deal.get("ebay_condition"),
            "shipping_known": deal.get("shipping_known"),
            "breakdown": best,
            "other_exits": deal.get("other_exits", []),
            "checklist": {},
        }


def record_checklist(state, item_id, ticked):
    """ticked: the ids of the boxes that are checked."""
    entry = _entry(state, item_id)
    if "purchase" in entry:
        raise TrackingError(f"{item_id} is already purchased.")
    valid = {key for key, _, _ in CHECKLIST}
    entry["checklist"] = {key: key in ticked for key in valid}


def checklist_complete(entry):
    done = entry.get("checklist", {})
    return all(done.get(key) for key, _, _ in CHECKLIST)


def dismiss(state, item_id, dismissed=True):
    entry = _entry(state, item_id)
    if "purchase" in entry:
        raise TrackingError(f"{item_id} is already purchased.")
    entry["dismissed"] = bool(dismissed)


def stage(entry):
    if "payout" in entry:
        return "paid"
    if "sent" in entry:
        return "sent"
    if "inspection" in entry:
        return "inspected"
    if "purchase" in entry:
        return "purchased"
    if entry.get("dismissed"):
        return "dismissed"
    return "open"


def record_purchase(state, item_id, price, shipping, tax,
                    imei_result, imei_last4=None, on=None):
    entry = _entry(state, item_id)
    if "purchase" in entry:
        raise TrackingError(f"{item_id} is already recorded as purchased.")
    if imei_result not in IMEI_RESULTS:
        raise TrackingError(f"IMEI result must be one of {', '.join(IMEI_RESULTS)}.")
    if imei_last4 is not None and not re.fullmatch(r"\d{4}", imei_last4):
        raise TrackingError("Store only the last 4 digits of the IMEI.")

    price, shipping, tax = _money(price), _money(shipping), _money(tax)
    entry["purchase"] = {
        "date": _day(on),
        "price": price,
        "shipping_to_you": shipping,
        "sales_tax": tax,
        "acquisition_cost": round(price + shipping + tax, 2),
        "imei_result": imei_result,
        "imei_last4": imei_last4,
    }


def record_inspection(state, item_id, passed, notes="", on=None):
    entry = _entry(state, item_id)
    if "purchase" not in entry:
        raise TrackingError(f"Record the purchase of {item_id} first.")
    entry["inspection"] = {"date": _day(on), "passed": bool(passed), "notes": notes}


def record_sent(state, item_id, buyer=None, shipping=0, other_costs=0,
                expected_payout=None, on=None):
    entry = _entry(state, item_id)
    if "inspection" not in entry:
        raise TrackingError(f"Record your inspection of {item_id} first.")

    buyer = buyer or entry["buyer"]
    if expected_payout is None:
        if buyer != entry["buyer"]:
            raise TrackingError(
                f"Sending to {buyer}, not {entry['buyer']}: give its expected payout."
            )
        expected_payout = entry["expected_payout"]
    entry["sent"] = {
        "date": _day(on),
        "buyer": buyer,
        "shipping_to_buyer": _money(shipping),
        "other_selling_costs": _money(other_costs),
        "expected_payout": _money(expected_payout),
    }


def record_payout(state, item_id, received, on=None):
    entry = _entry(state, item_id)
    if "sent" not in entry:
        raise TrackingError(f"Record sending {item_id} to the buyer first.")
    entry["payout"] = {"date": _day(on), "received": _money(received)}


# ---------- Numbers ----------

def actual_profit(entry):
    """None until the phone has been paid for."""
    if "payout" not in entry:
        return None
    sent = entry["sent"]
    return round(
        entry["payout"]["received"]
        - entry["purchase"]["acquisition_cost"]
        - sent["shipping_to_buyer"]
        - sent["other_selling_costs"],
        2,
    )


def payout_reduced(entry):
    if "payout" not in entry:
        return None
    return entry["payout"]["received"] < entry["sent"]["expected_payout"]


def decision_record(item_id, entry):
    purchase = entry.get("purchase", {})
    inspection = entry.get("inspection")
    sent = entry.get("sent", {})
    payout = entry.get("payout", {})
    imei = purchase.get("imei_result")
    if imei and purchase.get("imei_last4"):
        imei += f" (ends {purchase['imei_last4']})"

    def money(value):
        return "-" if value is None else f"${value:.2f}"

    rows = [
        ("Item ID", item_id),
        ("Phone", entry["phone"]),
        ("Listing", entry["url"]),
        ("Seller", entry["seller"]),
        ("Surfaced", entry["surfaced_at"][:10]),
        ("Purchased", purchase.get("date", "-")),
        ("Acquisition cost", money(purchase.get("acquisition_cost"))),
        ("IMEI check", imei or "-"),
        ("Inspection", "-" if not inspection else
         ("passed" if inspection["passed"] else "failed")
         + (f" ({inspection['notes']})" if inspection["notes"] else "")),
        ("Sent to", sent.get("buyer", "-")),
        ("Selling costs", money(sent["shipping_to_buyer"] + sent["other_selling_costs"]
                                if sent else None)),
        ("Expected payout", money(sent.get("expected_payout", entry["expected_payout"]))),
        ("Actual payout", money(payout.get("received"))),
        ("Paid", payout.get("date", "-")),
        ("Estimated profit", money(entry["estimated_profit"])),
        ("Actual profit", money(actual_profit(entry))),
    ]
    return "\n".join(f"{label + ':':<18} {value}" for label, value in rows)


def report(state, weekly_target, now=None):
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(days=7)
    entries = list(state["alerted"].values())
    recent = [e for e in entries if datetime.fromisoformat(e["surfaced_at"]) >= since]

    lines = [f"Last 7 days: {len(recent)} verified opportunities (target {weekly_target})"]
    for entry in sorted(recent, key=lambda e: e["estimated_profit"], reverse=True):
        lines.append(f"  ${entry['estimated_profit']:>7.2f} est.  {entry['buyer']:<14} {entry['title']}")

    purchased = [e for e in entries if "purchase" in e]
    inspected = [e for e in purchased if "inspection" in e]
    passed = [e for e in inspected if e["inspection"]["passed"]]
    sent = [e for e in purchased if "sent" in e]
    paid = [e for e in sent if "payout" in e]
    reduced = [e for e in paid if payout_reduced(e)]

    lines += [
        "",
        "All time:",
        f"  Surfaced:             {len(entries)}",
        f"  Purchased:            {len(purchased)}",
        f"  Inspected:            {len(inspected)}  "
        f"(passed {len(passed)}, failed {len(inspected) - len(passed)})",
        f"  Sent to buyer:        {len(sent)}",
        f"  Paid:                 {len(paid)}  "
        f"(full {len(paid) - len(reduced)}, reduced {len(reduced)})",
    ]
    if paid:
        actual = sum(actual_profit(e) for e in paid)
        estimated = sum(e["estimated_profit"] for e in paid)
        lines += [
            f"  Actual profit:        ${actual:.2f}",
            f"  Estimated for those:  ${estimated:.2f}",
            f"  Average per phone:    ${actual / len(paid):.2f}",
        ]
    in_hand = len(purchased) - len(sent)
    if in_hand:
        lines.append(f"  Bought, not sent:     {in_hand}")
    if len(sent) - len(paid):
        lines.append(f"  Waiting on payout:    {len(sent) - len(paid)}")
    return "\n".join(lines)


# ---------- Dashboard figures ----------

def _week_start(day):
    return day - timedelta(days=day.weekday())


def metrics(state, weekly_target, now=None, weeks=6):
    """Everything the overview shows, computed only from recorded data."""
    now = now or datetime.now(timezone.utc)
    entries = list(state["alerted"].values())
    since = now - timedelta(days=7)

    purchased = [e for e in entries if "purchase" in e]
    inspected = [e for e in purchased if "inspection" in e]
    passed = [e for e in inspected if e["inspection"]["passed"]]
    sent = [e for e in purchased if "sent" in e]
    paid = [e for e in sent if "payout" in e]
    reduced = [e for e in paid if payout_reduced(e)]
    unpaid = [e for e in purchased if "payout" not in e]

    actual = round(sum(actual_profit(e) for e in paid), 2)
    estimated = round(sum(e["estimated_profit"] for e in paid), 2)

    # Weekly series, oldest first
    this_week = _week_start(now.date())
    starts = [this_week - timedelta(weeks=i) for i in range(weeks - 1, -1, -1)]
    opportunities = []
    realized_cum, estimated_cum = [], []
    for start in starts:
        end = start + timedelta(days=7)
        opportunities.append(sum(
            1 for e in entries
            if start <= datetime.fromisoformat(e["surfaced_at"]).date() < end
        ))
        upto = [e for e in paid if date.fromisoformat(e["payout"]["date"]) < end]
        realized_cum.append(round(sum(actual_profit(e) for e in upto), 2))
        estimated_cum.append(round(sum(e["estimated_profit"] for e in upto), 2))

    return {
        "opportunities_7d": sum(
            1 for e in entries if datetime.fromisoformat(e["surfaced_at"]) >= since),
        "weekly_target": weekly_target,
        "surfaced": len(entries),
        "purchased": len(purchased),
        "inspected": len(inspected),
        "passed": len(passed),
        "failed": len(inspected) - len(passed),
        "pass_rate": round(100 * len(passed) / len(inspected)) if inspected else None,
        "sent": len(sent),
        "paid": len(paid),
        "paid_full": len(paid) - len(reduced),
        "paid_reduced": len(reduced),
        "actual_profit": actual,
        "estimated_for_paid": estimated,
        "avg_actual": round(actual / len(paid), 2) if paid else None,
        "avg_estimated": round(estimated / len(paid), 2) if paid else None,
        "capital_deployed": round(sum(e["purchase"]["acquisition_cost"] for e in purchased), 2),
        "capital_outstanding": round(sum(e["purchase"]["acquisition_cost"] for e in unpaid), 2),
        "weeks": [f"{s:%b} {s.day}" for s in starts],
        "weekly_opportunities": opportunities,
        "realized_cumulative": realized_cum,
        "estimated_cumulative": estimated_cum,
    }
