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
        }


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
