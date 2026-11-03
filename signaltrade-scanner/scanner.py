"""SignalTrade Scanner: find underpriced phones on eBay with a verified buyback exit.

It never buys anything. It surfaces listings whose net profit, after every
cost, beats your target against a buyer quote you checked recently, and
alerts you so you can review and approve each purchase yourself.

    python scanner.py              scan and alert on new opportunities
    python scanner.py --no-alerts  scan and print only
    python scanner.py --report     opportunities surfaced in the last 7 days
"""

import argparse
import base64
import json
import os
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
    "box only", "empty box", "read description", "as is", "no power",
    "lcd issue", "screen burn", "face id not", "replica", "clone",
)
FOR_PARTS_CONDITION_ID = "7000"

DEFAULT_SETTINGS = {
    "minimum_net_profit": 75,
    "sales_tax_rate": 0.08,
    "unknown_shipping_estimate": 15,
    "quote_max_age_days": 7,
    "min_seller_feedback_percent": 98.0,
    "min_seller_feedback_score": 25,
    "weekly_target": 10,
}


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


def usable_quotes(phone, settings, today):
    """Quotes with a payout entered and checked recently enough to trust."""
    fresh, warnings = [], []
    max_age = settings["quote_max_age_days"]
    for quote in phone.get("buyer_quotes", []):
        if quote.get("payout") is None:
            continue
        quoted_on = quote.get("quoted_on")
        if not quoted_on:
            warnings.append(f"{phone['name']} / {quote['buyer']}: no quoted_on date, skipped")
            continue
        age = (today - date.fromisoformat(quoted_on)).days
        if age > max_age:
            warnings.append(
                f"{phone['name']} / {quote['buyer']}: quote is {age} days old, "
                f"re-check it (limit {max_age})"
            )
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
    title = item.get("title", "").lower()
    if any(word in title for word in BAD_WORDS):
        return "bad words in title"
    if not all(word.lower() in title for word in phone.get("required_words", [])):
        return "missing required words"
    if any(word.lower() in title for word in phone.get("excluded_words", [])):
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
    """The best exit for a listing if it clears the target, else None."""
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
    if best["net_profit"] < settings["minimum_net_profit"]:
        return None

    return {
        "item_id": item.get("itemId"),
        "phone": phone["name"],
        "title": item.get("title", ""),
        "condition": item.get("condition"),
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

        # Highest listing price that could still clear the target with free shipping
        best_take = max(quote_net(q) for q in quotes)
        max_price = (best_take - settings["minimum_net_profit"]) / (1 + settings["sales_tax_rate"])
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


# ---------- Alert history ----------

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
        state["alerted"][deal["item_id"]] = {
            "at": now.isoformat(),
            "phone": deal["phone"],
            "title": deal["title"],
            "buyer": deal["best"]["buyer"],
            "net_profit": deal["best"]["net_profit"],
            "url": deal["url"],
        }


def weekly_report(state, weekly_target, now=None):
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(days=7)
    recent = [
        entry for entry in state["alerted"].values()
        if datetime.fromisoformat(entry["at"]) >= since
    ]
    lines = [f"Last 7 days: {len(recent)} opportunities (target {weekly_target})"]
    if recent:
        profits = [entry["net_profit"] for entry in recent]
        lines.append(f"Average est. net profit: ${sum(profits) / len(profits):.2f}")
        for entry in sorted(recent, key=lambda e: e["net_profit"], reverse=True):
            lines.append(f"  ${entry['net_profit']:>7.2f}  {entry['buyer']:<14} {entry['title']}")
    return "\n".join(lines)


# ---------- Output ----------

def describe(deal):
    b = deal["best"]
    shipping = f"${b['inbound_shipping']:.2f}" + ("" if deal["shipping_known"] else " (estimated)")
    lines = [
        f"${b['net_profit']:.2f} net via {b['buyer']}: {deal['title']}",
        f"  Buy ${b['price']:.2f} + ship {shipping} + tax ${b['sales_tax']:.2f}",
        f"  {b['buyer']} pays ${b['payout']:.2f} (quoted {b['quoted_on']})"
        f" - ship out ${b['outbound_shipping']:.2f} - fee ${b['payout_fee']:.2f}"
        f" - grading ${b['grading_deduction']:.2f}",
    ]
    if deal["other_exits"]:
        others = ", ".join(f"{e['buyer']} ${e['net_profit']:.2f}" for e in deal["other_exits"])
        lines.append(f"  Other exits: {others}")
    lines.append(f"  Seller {deal['seller']} | {deal['condition']} | {deal['url']}")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="SignalTrade Scanner")
    parser.add_argument("--no-alerts", action="store_true", help="print only, don't notify")
    parser.add_argument("--report", action="store_true", help="show the last 7 days")
    args = parser.parse_args()

    config = load_config()
    state = load_state()

    if args.report:
        print(weekly_report(state, config["settings"]["weekly_target"]))
        return

    deals, warnings = scan(config)
    for warning in warnings:
        print(f"! {warning}")

    fresh = new_deals(deals, state)
    print(f"\n{len(deals)} listings clear the target, {len(fresh)} new.\n")
    for deal in deals:
        print(describe(deal) + "\n")

    if fresh and not args.no_alerts:
        sent = alerts.send([describe(d) for d in fresh])
        if sent:
            print(f"Alert sent by {', '.join(sent)}.")
        record_alerted(fresh, state)
        save_state(state)

    print("Nothing is bought automatically. Review each listing before you buy.")


if __name__ == "__main__":
    main()
