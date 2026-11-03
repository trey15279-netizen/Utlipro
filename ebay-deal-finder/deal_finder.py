"""Find eBay listings you can buy and resell to a buyback buyer at a profit.

Set either:
  EBAY_ACCESS_TOKEN                 an application token you already have, or
  EBAY_APP_ID and EBAY_CERT_ID      your keyset, so a token is fetched for you
"""

import base64
import os

import requests

API_ROOT = "https://api.ebay.com"
SEARCH_URL = f"{API_ROOT}/buy/browse/v1/item_summary/search"
TOKEN_URL = f"{API_ROOT}/identity/v1/oauth2/token"
SCOPE = "https://api.ebay.com/oauth/api_scope"

# Words that usually mean the phone is not worth what the buyer pays
BAD_WORDS = (
    "for parts", "parts only", "not working", "cracked", "broken",
    "icloud locked", "activation lock", "blacklisted", "bad esn",
    "box only", "empty box", "read description", "as is",
)
FOR_PARTS_CONDITION_ID = "7000"


def get_access_token():
    token = os.environ.get("EBAY_ACCESS_TOKEN")
    if token:
        return token

    app_id = os.environ.get("EBAY_APP_ID")
    cert_id = os.environ.get("EBAY_CERT_ID")
    if not (app_id and cert_id):
        raise SystemExit(
            "Set EBAY_ACCESS_TOKEN, or EBAY_APP_ID and EBAY_CERT_ID."
        )

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


def search_ebay(query, max_price=None, limit=50, token=None):
    filters = ["buyingOptions:{FIXED_PRICE}", "priceCurrency:USD"]
    if max_price is not None:
        filters.append(f"price:[..{max_price:.2f}]")

    response = requests.get(
        SEARCH_URL,
        headers={
            "Authorization": f"Bearer {token or get_access_token()}",
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
        params={
            "q": query,
            "limit": limit,
            "sort": "price",
            "filter": ",".join(filters),
        },
        timeout=20,
    )
    response.raise_for_status()
    return response.json().get("itemSummaries", [])


def listing_shipping_cost(item):
    """Cheapest shipping cost to you, or None if eBay didn't say."""
    costs = []
    for option in item.get("shippingOptions", []):
        cost = option.get("shippingCost", {}).get("value")
        if cost is not None:
            costs.append(float(cost))
    return min(costs) if costs else None


def looks_bad(item):
    if item.get("conditionId") == FOR_PARTS_CONDITION_ID:
        return True
    title = item.get("title", "").lower()
    return any(word in title for word in BAD_WORDS)


def find_deals(query, buyer_payout, shipping=10, minimum_profit=50,
               listings=None):
    """Return profitable listings, best first.

    shipping is what it costs you to send the phone on to the buyer.
    The listing's own shipping to you is added to its price.
    """
    if listings is None:
        max_price = buyer_payout - shipping - minimum_profit
        if max_price <= 0:
            return []
        listings = search_ebay(query, max_price=max_price)

    deals = []
    for item in listings:
        price_value = item.get("price", {}).get("value")
        if price_value is None or looks_bad(item):
            continue

        price = float(price_value)
        inbound = listing_shipping_cost(item)
        cost = price + (inbound or 0)
        profit = buyer_payout - cost - shipping

        if profit >= minimum_profit:
            deals.append({
                "title": item.get("title", ""),
                "price": price,
                "shipping_to_you": inbound,
                "condition": item.get("condition"),
                "profit": round(profit, 2),
                "url": item.get("itemWebUrl"),
            })

    return sorted(deals, key=lambda deal: deal["profit"], reverse=True)


if __name__ == "__main__":
    deals = find_deals(
        query="iPhone 13 128GB unlocked",
        buyer_payout=235,
        minimum_profit=50,
    )

    if not deals:
        print("No deals right now.")
    for deal in deals:
        shipping_note = (
            "shipping unknown" if deal["shipping_to_you"] is None
            else f"+${deal['shipping_to_you']:.2f} shipping"
        )
        print(f"${deal['profit']:>7.2f} profit | ${deal['price']:.2f} "
              f"{shipping_note} | {deal['condition']} | {deal['title']}")
        print(f"         {deal['url']}")
