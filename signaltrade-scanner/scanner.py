"""SignalTrade Scanner: find underpriced phones on eBay with a verified buyback exit.

It never buys anything. It surfaces listings whose estimated net profit, after
every cost and a safety buffer, beats your target against a buyer quote for
the exact same phone, and alerts you so you can check and approve each
purchase yourself. Then you record each phone's purchase, inspection, sale
and payout, so the report shows whether the estimates hold up.

    python scanner.py                     scan and alert on new opportunities
    python scanner.py scan --no-alerts    scan and print only
    python scanner.py report              weekly count and results by stage
    python scanner.py show ITEM_ID        the purchase decision record

Then record each stage as it happens (see tracking.py for the money rules):
    python scanner.py bought ITEM_ID --price P --shipping S --tax T --imei clean --imei-last4 1234
    python scanner.py inspected ITEM_ID pass|fail [--notes "..."]
    python scanner.py sent ITEM_ID [--buyer B --expected-payout X] --shipping S [--other-costs C]
    python scanner.py paid ITEM_ID RECEIVED
"""

import argparse
import base64
import json
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import requests

import alerts
import tracking

HERE = Path(__file__).resolve().parent
CONFIG_PATH = Path(os.environ.get("SIGNALTRADE_CONFIG", HERE / "config.json"))
STATE_PATH = Path(os.environ.get("SIGNALTRADE_STATE", HERE / "data" / "alerted.json"))

API_ROOT = "https://api.ebay.com"
SEARCH_URL = f"{API_ROOT}/buy/browse/v1/item_summary/search"
TOKEN_URL = f"{API_ROOT}/identity/v1/oauth2/token"
SCOPE = "https://api.ebay.com/oauth/api_scope"

# Words that usually mean the phone won't pass the buyer's inspection
BAD_WORDS = (
    "for parts", "parts only", "not working", "cracked", "broken",
    "icloud locked", "activation lock", "blacklisted", "bad esn",
    "financed", "balance owed", "unpaid balance", "locked to",
    "box only", "empty box", "read description", "as is", "no power",
    "lcd issue", "screen burn", "face id not", "replica", "clone",
)
FOR_PARTS_CONDITION_ID = "7000"

# A quote only counts for a phone if all of these match exactly
QUOTE_SPEC = ("model", "storage", "carrier", "condition")

DEFAULT_SETTINGS = {
    "minimum_net_profit": 75,
    "profit_buffer": 25,
    "sales_tax_rate": 0.08,
    "unknown_shipping_estimate": 15,
    "quote_max_age_days": 7,
    "min_seller_feedback_percent": 98.0,
    "min_seller_feedback_score": 25,
    "weekly_target": 10,
    "auto_scan": True,
    "scan_hours": [8, 13, 19],
}


class ScanError(Exception):
    """A scan couldn't run, like missing eBay keys."""


def required_profit(settings):
    return settings["minimum_net_profit"] + settings["profit_buffer"]


# ---------- eBay ----------

def get_access_token():
    token = os.environ.get("EBAY_ACCESS_TOKEN")
    if token:
        return token

    app_id = os.environ.get("EBAY_APP_ID")
    cert_id = os.environ.get("EBAY_CERT_ID")
    if not (app_id and cert_id):
        raise ScanError("eBay keys aren't set. Set EBAY_APP_ID and EBAY_CERT_ID, "
                        "or EBAY_ACCESS_TOKEN.")

    credentials = base64.b64encode(f"{app_id}:{cert_id}".encode()).decode()
    response = requests.post(
        TOKEN_URL,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={"grant_type": "client_credentials", "scope": SCOPE},
        timeout=20,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def search_ebay(query, max_price, condition_ids=(), token=None, limit=100):
    filters = [
        "buyingOptions:{FIXED_PRICE}",
        "priceCurrency:USD",
        f"price:[..{max_price:.2f}]",
    ]
    if condition_ids:
        filters.append("conditionIds:{" + "|".join(condition_ids) + "}")

    response = requests.get(
        SEARCH_URL,
        headers={
            "Authorization": f"Bearer {token or get_access_token()}",
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
        params={"q": query, "limit": limit, "sort": "price",
                "filter": ",".join(filters)},
        timeout=20,
    )
    response.raise_for_status()
    return response.json().get("itemSummaries", [])


# ---------- Buyer quotes ----------

def load_config(path=CONFIG_PATH):
    with open(path) as f:
        config = json.load(f)
    config["settings"] = {**DEFAULT_SETTINGS, **config.get("settings", {})}
    return config


def save_config(config, path=CONFIG_PATH):
    tmp = Path(str(path) + ".tmp")
    with open(tmp, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def _norm(value):
    return " ".join(str(value or "").lower().split())


def spec_mismatch(phone, quote):
    """Why a quote isn't for this exact phone, or None if it matches."""
    for field in QUOTE_SPEC:
        wanted, quoted = phone.get(field), quote.get(field)
        if not wanted:
            return f"phone has no {field} set"
        if not quoted:
            return f"quote doesn't say which {field}"
        if _norm(wanted) != _norm(quoted):
            return f"quote is for {field} '{quoted}', not '{wanted}'"
    return None


def usable_quotes(phone, settings, today):
    """Quotes for this exact phone, with a payout, checked recently enough."""
    fresh, warnings = [], []
    max_age = settings["quote_max_age_days"]
    for quote in phone.get("buyer_quotes", []):
        if quote.get("payout") is None:
            continue
        label = f"{phone['name']} / {quote['buyer']}"
        mismatch = spec_mismatch(phone, quote)
        if mismatch:
            warnings.append(f"{label}: {mismatch}, skipped")
            continue
        quoted_on = quote.get("quoted_on")
        if not quoted_on:
            warnings.append(f"{label}: no quoted_on date, skipped")
            continue
        age = (today - date.fromisoformat(quoted_on)).days
        if age > max_age:
            warnings.append(f"{label}: quote is {age} days old, re-check it (limit {max_age})")
            continue
        fresh.append(quote)
    return fresh, warnings


def quote_net(quote):
    """What you actually keep from a buyer, before the phone's own cost."""
    return (
        quote["payout"]
        - quote.get("outbound_shipping", 0)
        - quote.get("payout_fee", 0)
        - quote.get("grading_deduction", 0)
    )


# ---------- Profit ----------

def listing_shipping_cost(item):
    """Cheapest shipping cost to you, or None if eBay didn't say."""
    costs = [
        float(option["shippingCost"]["value"])
        for option in item.get("shippingOptions", [])
        if option.get("shippingCost", {}).get("value") is not None
    ]
    return min(costs) if costs else None


def net_profit(price, inbound_shipping, quote, settings):
    tax = round((price + inbound_shipping) * settings["sales_tax_rate"], 2)
    buy_cost = price + inbound_shipping + tax
    breakdown = {
        "buyer": quote["buyer"],
        "payout": quote["payout"],
        "price": price,
        "inbound_shipping": inbound_shipping,
        "sales_tax": tax,
        "buy_cost": round(buy_cost, 2),
        "outbound_shipping": quote.get("outbound_shipping", 0),
        "payout_fee": quote.get("payout_fee", 0),
        "grading_deduction": quote.get("grading_deduction", 0),
        "quoted_on": quote.get("quoted_on"),
        "quote_url": quote.get("quote_url"),
    }
    breakdown["net_profit"] = round(quote_net(quote) - buy_cost, 2)
    return breakdown


def rejection_reason(item, phone, settings):
    if item.get("conditionId") == FOR_PARTS_CONDITION_ID:
        return "for parts"
    title = _norm(item.get("title"))
    if any(word in title for word in BAD_WORDS):
        return "bad words in title"
    if not all(_norm(word) in title for word in phone.get("required_words", [])):
        return "missing required words"
    if any(_norm(word) in title for word in phone.get("excluded_words", [])):
        return "excluded words in title"

    seller = item.get("seller", {})
    percent = seller.get("feedbackPercentage")
    score = seller.get("feedbackScore")
    if percent is None or float(percent) < settings["min_seller_feedback_percent"]:
        return "seller feedback too low"
    if score is None or int(score) < settings["min_seller_feedback_score"]:
        return "seller has too few ratings"
    if item.get("price", {}).get("value") is None:
        return "no price"
    return None


def evaluate(item, phone, quotes, settings):
    """The best exit for a listing if it clears target + buffer, else None."""
    if rejection_reason(item, phone, settings):
        return None

    price = float(item["price"]["value"])
    inbound = listing_shipping_cost(item)
    shipping_known = inbound is not None
    if not shipping_known:
        inbound = settings["unknown_shipping_estimate"]

    exits = sorted(
        (net_profit(price, inbound, q, settings) for q in quotes),
        key=lambda e: e["net_profit"],
        reverse=True,
    )
    best = exits[0]
    if best["net_profit"] < required_profit(settings):
        return None

    return {
        "item_id": item.get("itemId"),
        "phone": phone["name"],
        "spec": {field: phone[field] for field in QUOTE_SPEC},
        "title": item.get("title", ""),
        "ebay_condition": item.get("condition"),
        "url": item.get("itemWebUrl"),
        "seller": item.get("seller", {}).get("username"),
        "shipping_known": shipping_known,
        "best": best,
        "other_exits": [
            {"buyer": e["buyer"], "net_profit": e["net_profit"]} for e in exits[1:]
        ],
    }


def scan(config, search=search_ebay, today=None):
    settings = config["settings"]
    today = today or date.today()
    deals, warnings = [], []
    token = None

    for phone in config["phones"]:
        quotes, quote_warnings = usable_quotes(phone, settings, today)
        warnings += quote_warnings
        if not quotes:
            warnings.append(f"{phone['name']}: no verified buyer quote, not scanned")
            continue

        # Highest listing price that could still clear the bar with free shipping
        best_take = max(quote_net(q) for q in quotes)
        max_price = (best_take - required_profit(settings)) / (1 + settings["sales_tax_rate"])
        if max_price <= 0:
            warnings.append(f"{phone['name']}: no buyer pays enough to hit the target")
            continue

        if search is search_ebay and token is None:
            token = get_access_token()
        listings = search(
            phone["query"], max_price,
            condition_ids=phone.get("ebay_condition_ids", ()),
            **({"token": token} if token else {}),
        )
        for item in listings:
            deal = evaluate(item, phone, quotes, settings)
            if deal:
                deals.append(deal)

    deals.sort(key=lambda d: d["best"]["net_profit"], reverse=True)
    return deals, warnings


def run_scan(config, state, send_alerts=True, search=search_ebay, now=None):
    """Scan, alert on new deals, and record them and the scan in state.

    Raises ScanError (or a requests error) if the scan couldn't run; the
    failure is recorded in state["last_scan"] either way.
    """
    now = now or datetime.now(timezone.utc)
    try:
        deals, warnings = scan(config, search=search, today=now.date())
    except (ScanError, requests.RequestException) as error:
        state["last_scan"] = {"at": now.isoformat(), "ok": False, "error": str(error)}
        raise

    settings = config["settings"]
    fresh = tracking.new_deals(deals, state)
    sent_by = []
    if fresh and send_alerts:
        try:
            sent_by = alerts.send([describe(d, settings) for d in fresh])
        except requests.RequestException as error:
            warnings.append(f"Alert failed: {error}")
    tracking.record_alerted(fresh, state, now=now)
    state["last_scan"] = {
        "at": now.isoformat(), "ok": True, "found": len(deals), "new": len(fresh),
        "warnings": warnings, "alerted_by": sent_by,
        "current": [d["item_id"] for d in deals],
    }
    return deals, warnings, fresh, sent_by


# ---------- Output ----------

def describe(deal, settings):
    b = deal["best"]
    spec = deal["spec"]
    shipping = f"${b['inbound_shipping']:.2f}" + ("" if deal["shipping_known"] else " (estimated)")
    tax_rate = settings["sales_tax_rate"] * 100
    after_buffer = b["net_profit"] - settings["profit_buffer"]
    lines = [
        f"${b['net_profit']:.2f} est. net via {b['buyer']} "
        f"(${after_buffer:.2f} after ${settings['profit_buffer']} buffer): {deal['title']}",
        f"  Quote for: {spec['model']} {spec['storage']} {spec['carrier']}, {spec['condition']}",
        f"  Buy ${b['price']:.2f} + ship {shipping} + est. tax ${b['sales_tax']:.2f} ({tax_rate:g}%)",
        f"  {b['buyer']} pays ${b['payout']:.2f} (quoted {b['quoted_on']})"
        f" - ship out ${b['outbound_shipping']:.2f} - fee ${b['payout_fee']:.2f}"
        f" - grading ${b['grading_deduction']:.2f}",
    ]
    if deal["other_exits"]:
        others = ", ".join(f"{e['buyer']} ${e['net_profit']:.2f}" for e in deal["other_exits"])
        lines.append(f"  Other exits: {others}")
    lines.append(f"  Re-check quote now: {b['quote_url'] or '(no link saved)'}")
    lines.append(f"  Seller {deal['seller']} | eBay: {deal['ebay_condition']} | {deal['url']}")
    lines.append(f"  Item ID: {deal['item_id']}")
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description="SignalTrade Scanner")
    commands = parser.add_subparsers(dest="command")

    scan_cmd = commands.add_parser("scan", help="scan and alert (default)")
    scan_cmd.add_argument("--no-alerts", action="store_true",
                          help="don't send email/SMS (results are still recorded)")

    commands.add_parser("report", help="weekly count and results by stage")

    show_cmd = commands.add_parser("show", help="purchase decision record for one phone")
    show_cmd.add_argument("item_id")

    bought = commands.add_parser("bought", help="you bought the phone")
    bought.add_argument("item_id")
    bought.add_argument("--price", type=float, required=True)
    bought.add_argument("--shipping", type=float, required=True, help="shipping to you")
    bought.add_argument("--tax", type=float, required=True, help="sales tax actually charged")
    bought.add_argument("--imei", required=True, choices=tracking.IMEI_RESULTS,
                        help="result of your IMEI check")
    bought.add_argument("--imei-last4", help="last 4 digits only, never the full IMEI")
    bought.add_argument("--date", type=date.fromisoformat)

    inspected = commands.add_parser("inspected", help="you inspected the phone")
    inspected.add_argument("item_id")
    inspected.add_argument("result", choices=("pass", "fail"))
    inspected.add_argument("--notes", default="")
    inspected.add_argument("--date", type=date.fromisoformat)

    sent = commands.add_parser("sent", help="you sent the phone to a buyer")
    sent.add_argument("item_id")
    sent.add_argument("--buyer", help="defaults to the buyer in the alert")
    sent.add_argument("--expected-payout", type=float,
                      help="needed if sending to a different buyer")
    sent.add_argument("--shipping", type=float, default=0, help="shipping to buyer")
    sent.add_argument("--other-costs", type=float, default=0,
                      help="packaging etc. Not payout fees: those come off what you receive")
    sent.add_argument("--date", type=date.fromisoformat)

    paid = commands.add_parser("paid", help="the buyer paid you")
    paid.add_argument("item_id")
    paid.add_argument("received", type=float, help="money that actually reached you")
    paid.add_argument("--date", type=date.fromisoformat)

    args = parser.parse_args(argv)
    config = load_config()
    settings = config["settings"]
    state = tracking.load_state(STATE_PATH)

    if args.command == "report":
        print(tracking.report(state, settings["weekly_target"]))
        return
    if args.command == "show":
        try:
            entry = state["alerted"][args.item_id]
        except KeyError:
            raise SystemExit(f"{args.item_id} isn't in the alert history.")
        print(tracking.decision_record(args.item_id, entry))
        return

    stages = {
        "bought": lambda: tracking.record_purchase(
            state, args.item_id, args.price, args.shipping, args.tax,
            args.imei, args.imei_last4, on=args.date),
        "inspected": lambda: tracking.record_inspection(
            state, args.item_id, args.result == "pass", args.notes, on=args.date),
        "sent": lambda: tracking.record_sent(
            state, args.item_id, args.buyer, args.shipping, args.other_costs,
            args.expected_payout, on=args.date),
        "paid": lambda: tracking.record_payout(
            state, args.item_id, args.received, on=args.date),
    }
    if args.command in stages:
        try:
            stages[args.command]()
        except tracking.TrackingError as error:
            raise SystemExit(str(error))
        tracking.save_state(state, STATE_PATH)
        print(tracking.decision_record(args.item_id, state["alerted"][args.item_id]))
        return

    try:
        deals, warnings, fresh, sent_by = run_scan(
            config, state, send_alerts=not getattr(args, "no_alerts", False))
    except (ScanError, requests.RequestException) as error:
        tracking.save_state(state, STATE_PATH)
        raise SystemExit(f"Scan failed: {error}")
    tracking.save_state(state, STATE_PATH)
    for warning in warnings:
        print(f"! {warning}")

    print(f"\n{len(deals)} listings clear ${required_profit(settings)} "
          f"(${settings['minimum_net_profit']} + ${settings['profit_buffer']} buffer), "
          f"{len(fresh)} new.\n")
    for deal in deals:
        print(describe(deal, settings) + "\n")

    if sent_by:
        print(f"Alert sent by {', '.join(sent_by)}.")

    print(alerts.CHECKLIST)


if __name__ == "__main__":
    main(sys.argv[1:])
