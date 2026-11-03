"""SignalTrade Scanner: find underpriced phones on eBay with a verified buyback exit.

It never buys anything. It surfaces listings whose estimated net profit, after
every cost and a safety buffer, beats your target against a buyer quote for
the exact same phone, and alerts you so you can check and approve each
purchase yourself. Then you log what you bought and what you were paid, so
the report shows whether the estimates hold up.

    python scanner.py                     scan and alert on new opportunities
    python scanner.py scan --no-alerts    scan and print only
    python scanner.py report              weekly count and buy/inspection results
    python scanner.py bought ITEM_ID COST     log a purchase (all-in cost)
    python scanner.py paid ITEM_ID AMOUNT     log what the buyer paid you
"""

import argparse
import base64
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

import alerts

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
}


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
        raise SystemExit("Set EBAY_ACCESS_TOKEN, or EBAY_APP_ID and EBAY_CERT_ID.")

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


# ---------- History: surfaced, bought, paid ----------

def load_state(path=STATE_PATH):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return {"alerted": {}}


def save_state(state, path=STATE_PATH):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(state, f, indent=2)


def new_deals(deals, state):
    return [d for d in deals if d["item_id"] not in state["alerted"]]


def record_alerted(deals, state, now=None):
    now = now or datetime.now(timezone.utc)
    for deal in deals:
        best = deal["best"]
        state["alerted"][deal["item_id"]] = {
            "at": now.isoformat(),
            "phone": deal["phone"],
            "title": deal["title"],
            "buyer": best["buyer"],
            "quoted_payout": best["payout"],
            "estimated_cost": best["buy_cost"],
            "net_profit": best["net_profit"],
            "url": deal["url"],
        }


def record_bought(state, item_id, cost):
    entry = state["alerted"].get(item_id)
    if entry is None:
        raise SystemExit(f"{item_id} isn't in the alert history.")
    entry["bought_cost"] = round(cost, 2)


def record_paid(state, item_id, amount):
    entry = state["alerted"].get(item_id)
    if entry is None or "bought_cost" not in entry:
        raise SystemExit(f"Log the purchase of {item_id} with 'bought' first.")
    entry["paid"] = round(amount, 2)


def report(state, weekly_target, now=None):
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(days=7)
    entries = list(state["alerted"].values())
    recent = [e for e in entries if datetime.fromisoformat(e["at"]) >= since]

    lines = [f"Last 7 days: {len(recent)} verified opportunities (target {weekly_target})"]
    for entry in sorted(recent, key=lambda e: e["net_profit"], reverse=True):
        lines.append(f"  ${entry['net_profit']:>7.2f} est.  {entry['buyer']:<14} {entry['title']}")

    bought = [e for e in entries if "bought_cost" in e]
    paid = [e for e in bought if "paid" in e]
    passed = [e for e in paid if e["paid"] >= e["quoted_payout"]]
    lines += [
        "",
        "All time:",
        f"  Surfaced:            {len(entries)}",
        f"  Bought:              {len(bought)}",
        f"  Paid out:            {len(paid)}",
        f"  Paid full quote:     {len(passed)} of {len(paid)}",
    ]
    if paid:
        actual = sum(e["paid"] - e["bought_cost"] for e in paid)
        estimated = sum(e["net_profit"] for e in paid)
        lines += [
            f"  Net profit collected: ${actual:.2f}",
            f"  Estimated for those:  ${estimated:.2f}",
            f"  Average per phone:    ${actual / len(paid):.2f}",
        ]
    waiting = len(bought) - len(paid)
    if waiting:
        lines.append(f"  Waiting on payout:   {waiting}")
    return "\n".join(lines)


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
    scan_cmd.add_argument("--no-alerts", action="store_true", help="print only, don't notify")
    commands.add_parser("report", help="weekly count and buy/inspection results")
    bought_cmd = commands.add_parser("bought", help="log a purchase")
    bought_cmd.add_argument("item_id")
    bought_cmd.add_argument("cost", type=float,
                            help="everything you spent: price, shipping, tax, shipping out")
    paid_cmd = commands.add_parser("paid", help="log what the buyer paid you")
    paid_cmd.add_argument("item_id")
    paid_cmd.add_argument("amount", type=float, help="what actually reached you")
    args = parser.parse_args(argv)

    config = load_config()
    settings = config["settings"]
    state = load_state()

    if args.command == "report":
        print(report(state, settings["weekly_target"]))
        return
    if args.command == "bought":
        record_bought(state, args.item_id, args.cost)
        save_state(state)
        print(f"Logged purchase of {args.item_id} at ${args.cost:.2f}.")
        return
    if args.command == "paid":
        record_paid(state, args.item_id, args.amount)
        save_state(state)
        entry = state["alerted"][args.item_id]
        print(f"Logged ${args.amount:.2f} paid. Net ${args.amount - entry['bought_cost']:.2f} "
              f"(estimated ${entry['net_profit']:.2f}).")
        return

    deals, warnings = scan(config)
    for warning in warnings:
        print(f"! {warning}")

    fresh = new_deals(deals, state)
    print(f"\n{len(deals)} listings clear ${required_profit(settings)} "
          f"(${settings['minimum_net_profit']} + ${settings['profit_buffer']} buffer), "
          f"{len(fresh)} new.\n")
    for deal in deals:
        print(describe(deal, settings) + "\n")

    if fresh and not getattr(args, "no_alerts", False):
        sent = alerts.send([describe(d, settings) for d in fresh])
        if sent:
            print(f"Alert sent by {', '.join(sent)}.")
        record_alerted(fresh, state)
        save_state(state)

    print(alerts.CHECKLIST)


if __name__ == "__main__":
    main(sys.argv[1:])
