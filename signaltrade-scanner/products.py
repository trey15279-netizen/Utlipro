"""Product types SignalTrade can trade, with ready-made model lists.

Each product is stored like a phone: model, storage, carrier and condition must
all match a buyer quote. For iPads "carrier" holds Wi-Fi or Wi-Fi + Cellular;
for Apple Watch "storage" holds the case size and "carrier" GPS or Cellular.
"""

import re

CATEGORIES = {
    "iphone": {
        "label": "iPhone",
        "storage_label": "Storage", "carrier_label": "Carrier",
        "storages": ["64GB", "128GB", "256GB", "512GB", "1TB"],
        "carriers": ["Unlocked", "AT&T", "Verizon", "T-Mobile"],
        "ebay_category": "9355",
        "lock": "apple",
        "variants": ["pro", "max", "plus", "mini"],
        "models": [
            "iPhone 11", "iPhone 11 Pro", "iPhone 11 Pro Max",
            "iPhone 12", "iPhone 12 mini", "iPhone 12 Pro", "iPhone 12 Pro Max",
            "iPhone 13", "iPhone 13 mini", "iPhone 13 Pro", "iPhone 13 Pro Max",
            "iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro", "iPhone 14 Pro Max",
            "iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max",
            "iPhone 16", "iPhone 16e", "iPhone 16 Plus", "iPhone 16 Pro", "iPhone 16 Pro Max",
        ],
    },
    "ipad": {
        "label": "iPad",
        "storage_label": "Storage", "carrier_label": "Wi-Fi or Cellular",
        "storages": ["64GB", "128GB", "256GB", "512GB", "1TB"],
        "carriers": ["Wi-Fi", "Wi-Fi + Cellular"],
        "ebay_category": "171485",
        "lock": "apple",
        "variants": ["pro", "air", "mini"],
        "models": [
            "iPad (9th generation)", "iPad (10th generation)",
            "iPad Air (5th generation)", "iPad mini (6th generation)",
            "iPad Pro 11-inch (4th generation)", "iPad Pro 12.9-inch (6th generation)",
        ],
    },
    "galaxy": {
        "label": "Samsung Galaxy",
        "storage_label": "Storage", "carrier_label": "Carrier",
        "storages": ["128GB", "256GB", "512GB", "1TB"],
        "carriers": ["Unlocked", "AT&T", "Verizon", "T-Mobile"],
        "ebay_category": "9355",
        "lock": "google",
        "variants": ["ultra", "plus", "+", "fe"],
        "models": [
            "Galaxy S21", "Galaxy S21+", "Galaxy S21 Ultra",
            "Galaxy S22", "Galaxy S22+", "Galaxy S22 Ultra",
            "Galaxy S23", "Galaxy S23+", "Galaxy S23 Ultra",
            "Galaxy S24", "Galaxy S24+", "Galaxy S24 Ultra",
            "Galaxy S25", "Galaxy S25+", "Galaxy S25 Ultra",
        ],
    },
    "watch": {
        "label": "Apple Watch",
        "storage_label": "Case size", "carrier_label": "GPS or Cellular",
        "storages": ["40mm", "41mm", "42mm", "44mm", "45mm", "46mm", "49mm"],
        "carriers": ["GPS", "GPS + Cellular"],
        "ebay_category": "178893",
        "lock": "apple",
        "variants": ["ultra"],
        "models": [
            "Apple Watch Series 7", "Apple Watch Series 8", "Apple Watch Series 9",
            "Apple Watch Series 10", "Apple Watch SE (2nd generation)",
            "Apple Watch Ultra", "Apple Watch Ultra 2",
        ],
    },
}
CONDITIONS = ["Flawless", "Good", "Fair"]
DEFAULT_BUYERS = ("BankMyCell", "GadgetGone", "BuyBackBoss", "ItsWorthMore")


def category_of(product):
    return product.get("category") or "iphone"


def info(product_or_category):
    key = product_or_category if isinstance(product_or_category, str) else category_of(product_or_category)
    return CATEGORIES.get(key, CATEGORIES["iphone"])


def _model_words(category, model):
    """Words a listing title must contain to be this exact model."""
    name = model.lower()
    generation = re.search(r"\((\d+)(?:st|nd|rd|th) generation\)", name)
    base = re.sub(r"\s*\(.*?\)", "", name).strip()
    if category == "galaxy":
        return [base.replace("galaxy ", "")]           # titles often skip "Galaxy"
    if category == "watch":
        base = base.replace("apple ", "")               # "watch series 9", "watch ultra 2"
        words = [base.replace("watch ", "")] if "series" in base else [base]
        return words + ([f"{generation.group(1)}"] if generation and "se" not in base else [])
    if category == "ipad" and generation:
        n = int(generation.group(1))
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n if n < 20 else n % 10, "th")
        return [base, f"{n}{suffix}"]
    return [base]


def search_words(category, model, storage, carrier):
    """(required, excluded) title words for a product, so similar models are skipped."""
    model_l = model.lower()
    required = _model_words(category, model)
    excluded = [v for v in CATEGORIES[category]["variants"] if v not in model_l]
    if category == "watch" and "ultra" in model_l and not model_l.endswith("2"):
        excluded.append("ultra 2")
    size = storage.lower()
    required.append(size.replace("gb", "") if size.endswith("gb") else size)
    c = carrier.lower()
    if category in ("ipad", "watch"):
        if "cellular" in c:
            required.append("cellular")
        else:
            excluded.append("cellular")
    elif c == "unlocked":
        required.append("unlocked")
    else:
        required.append(c)
    return required, excluded


def search_query(category, model, storage, carrier):
    model_q = re.sub(r"\s*\(.*?\)", "", model)
    if category == "ipad":
        return f"{model_q} {storage} {'cellular' if 'Cellular' in carrier else 'wifi'}"
    if category == "watch":
        return f"{model_q} {storage} {'cellular' if 'Cellular' in carrier else 'gps'}"
    return f"{model_q} {storage} {carrier}"


def build(category, model, storage, carrier, condition, buyers=DEFAULT_BUYERS):
    """A new product entry for config.json, with search words filled in."""
    if category not in CATEGORIES:
        raise ValueError("Pick a product type.")
    for label, value in (("Model", model), (info(category)["storage_label"], storage),
                         (info(category)["carrier_label"], carrier), ("Condition", condition)):
        if not (value or "").strip():
            raise ValueError(f"{label} is required.")
    model, storage, carrier, condition = (v.strip() for v in (model, storage, carrier, condition))
    required, excluded = search_words(category, model, storage, carrier)
    return {
        "category": category,
        "name": f"{model} {storage} {carrier}, {condition}",
        "model": model, "storage": storage, "carrier": carrier, "condition": condition,
        "query": search_query(category, model, storage, carrier),
        "required_words": required,
        "excluded_words": excluded,
        "ebay_condition_ids": ["2010", "2020", "3000"],
        "ebay_category_ids": [CATEGORIES[category]["ebay_category"]],
        "buyer_quotes": [{"buyer": b, "payout": None} for b in buyers],
    }


# ---------- Checks and seller message per product ----------

def checklist(product):
    """The seven pre-purchase checks, worded for this kind of product.

    Keys are the same for every product so saved checklists keep working.
    """
    cat = category_of(product)
    carrier = (product.get("carrier") or "").lower() if isinstance(product, dict) else ""
    apple = info(cat)["lock"] == "apple"
    ident = "Serial number" if cat in ("ipad", "watch") and "cellular" not in carrier else "IMEI"
    lock = ("Activation Lock disabled", "Find My is off, confirmed by the seller") if apple else \
           ("Google & Samsung account removed", "No FRP lock: the seller signed out of both accounts")
    if cat in ("ipad", "watch") and "cellular" not in carrier:
        network = ("Wi-Fi / GPS model confirmed", "Matches the model you have prices for")
    else:
        network = ("Carrier unlock confirmed", f"{ident} check shows it unlocked or on the right carrier")
    return (
        ("imei", f"{ident} verified", "Not blacklisted, financed or reported lost"),
        ("lock",) + lock,
        ("carrier",) + network,
        ("owner", "Ownership verified", "The seller owns it outright and it's paid off"),
        ("condition", "Physical condition inspected", "Photos match the grade the quote assumes"),
        ("quote", "Buyer quote rechecked", "Same payout today, for this exact spec"),
        ("checkout", "Final checkout cost confirmed", "Price, shipping and the tax eBay charges"),
    )


def seller_message(product):
    cat = category_of(product)
    name = " ".join(filter(None, [product.get("model"), product.get("storage")])) or "device"
    carrier = (product.get("carrier") or "").lower()
    if cat in ("ipad", "watch") and "cellular" not in carrier:
        ident = "serial number (Settings > General > About)"
    else:
        ident = "IMEI (Settings > General > About)"
    if info(cat)["lock"] == "apple":
        lock = "Confirm Find My / Activation Lock is turned off and it's removed from your Apple ID"
    else:
        lock = "Confirm you've removed your Google and Samsung accounts (no FRP lock)"
    health = "battery health" if cat != "ipad" else "battery condition"
    return (f"Hi! I'm interested in your {name}. Before I buy, could you please:\n"
            f"1. Send me the {ident}\n"
            f"2. {lock}\n"
            "3. Confirm it's fully paid off, not carrier-locked, and not reported lost or stolen\n"
            f"4. Tell me the {health} and any damage or repairs\n"
            "Thanks!")
