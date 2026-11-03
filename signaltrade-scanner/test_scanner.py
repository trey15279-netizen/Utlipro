import unittest
from datetime import date, datetime, timedelta, timezone

import alerts
import scanner

TODAY = date(2026, 11, 3)
# Bar is 75 + 25 = 100 net
SETTINGS = {**scanner.DEFAULT_SETTINGS, "sales_tax_rate": 0.10}
SPEC = {"model": "iPhone 13", "storage": "128GB", "carrier": "Unlocked", "condition": "Good"}
PHONE = {"name": "iPhone 13", "query": "iPhone 13", **SPEC,
         "required_words": ["iphone 13", "unlocked"], "excluded_words": ["pro"]}


def quote(buyer, payout, quoted_on="2026-11-01", **fields):
    return {"buyer": buyer, "payout": payout, "quoted_on": quoted_on,
            "quote_url": f"https://{buyer.lower()}.example/q", **SPEC, **fields}


def listing(title="iPhone 13 128GB Unlocked", price=100, shipping=0,
            condition_id="3000", feedback="99.8", score=500, item_id=None):
    item = {
        "itemId": item_id or f"v1|{title}|{price}",
        "title": title,
        "price": {"value": str(price), "currency": "USD"},
        "conditionId": condition_id,
        "condition": "Used",
        "itemWebUrl": "https://www.ebay.com/itm/1",
        "seller": {"username": "seller1", "feedbackPercentage": feedback,
                   "feedbackScore": score},
    }
    if shipping is not None:
        item["shippingOptions"] = [{"shippingCost": {"value": str(shipping)}}]
    return item


class NetProfitTest(unittest.TestCase):
    def test_every_cost_is_subtracted(self):
        q = quote("A", 300, outbound_shipping=5, payout_fee=3, grading_deduction=20)
        result = scanner.net_profit(150, 10, q, SETTINGS)
        # 300 - 5 - 3 - 20 - (150 + 10 + 16 tax)
        self.assertEqual(result["sales_tax"], 16)
        self.assertEqual(result["buy_cost"], 176)
        self.assertEqual(result["net_profit"], 96)


class QuotesTest(unittest.TestCase):
    def phone_with(self, *quotes):
        return {**PHONE, "buyer_quotes": list(quotes)}

    def test_stale_and_missing_quotes_are_not_used(self):
        phone = self.phone_with(
            quote("Fresh", 300, "2026-10-30"),
            quote("Stale", 400, "2026-10-01"),
            quote("Undated", 400, None),
            quote("Blank", None),
        )
        fresh, warnings = scanner.usable_quotes(phone, SETTINGS, TODAY)
        self.assertEqual([q["buyer"] for q in fresh], ["Fresh"])
        self.assertEqual(len(warnings), 2)

    def test_quote_must_match_exact_phone(self):
        phone = self.phone_with(
            quote("Match", 300, model="iphone  13", carrier="unlocked"),
            quote("Storage", 300, storage="256GB"),
            quote("Carrier", 300, carrier="Verizon"),
            quote("Grade", 300, condition="Flawless"),
            quote("NoGrade", 300, condition=""),
        )
        fresh, warnings = scanner.usable_quotes(phone, SETTINGS, TODAY)
        self.assertEqual([q["buyer"] for q in fresh], ["Match"])
        self.assertIn("iPhone 13 / Storage: quote is for storage '256GB', not '128GB', skipped",
                      warnings)
        self.assertIn("iPhone 13 / NoGrade: quote doesn't say which condition, skipped", warnings)

    def test_phone_without_full_spec_uses_no_quotes(self):
        phone = {**self.phone_with(quote("A", 300)), "condition": None}
        fresh, warnings = scanner.usable_quotes(phone, SETTINGS, TODAY)
        self.assertEqual(fresh, [])
        self.assertIn("phone has no condition set", warnings[0])


class EvaluateTest(unittest.TestCase):
    quotes = [quote("Low", 250), quote("High", 300, grading_deduction=10)]

    def evaluate(self, item):
        return scanner.evaluate(item, PHONE, self.quotes, SETTINGS)

    def test_picks_the_best_buyer(self):
        deal = self.evaluate(listing(price=150, shipping=0))
        # High: 300 - 10 - 165 = 125; Low: 250 - 165 = 85
        self.assertEqual(deal["best"]["buyer"], "High")
        self.assertEqual(deal["best"]["net_profit"], 125)
        self.assertEqual(deal["other_exits"], [{"buyer": "Low", "net_profit": 85}])

    def test_buffer_raises_the_bar(self):
        # 300 - 10 - 187 = 103 clears 100; 300 - 10 - 198 = 92 clears 75 but not the buffer
        self.assertIsNotNone(self.evaluate(listing(price=170, shipping=0)))
        self.assertIsNone(self.evaluate(listing(price=180, shipping=0)))

    def test_unknown_shipping_is_estimated(self):
        deal = self.evaluate(listing(price=150, shipping=None))
        self.assertFalse(deal["shipping_known"])
        self.assertEqual(deal["best"]["inbound_shipping"], 15)

    def test_rejects_risky_listings(self):
        for item in [
            listing(condition_id="7000"),
            listing(title="iPhone 13 Unlocked iCloud locked"),
            listing(title="iPhone 13 Unlocked financed"),
            listing(title="iPhone 13 128GB"),  # not unlocked
            listing(title="iPhone 13 Pro Unlocked"),
            listing(feedback="95.0"),
            listing(score=3),
        ]:
            self.assertIsNone(self.evaluate(item), item["title"])

    def test_description_says_what_to_recheck(self):
        text = scanner.describe(self.evaluate(listing(price=150)), SETTINGS)
        self.assertIn("Quote for: iPhone 13 128GB Unlocked, Good", text)
        self.assertIn("Re-check quote now: https://high.example/q", text)
        self.assertIn("est. tax $15.00 (10%)", text)
        self.assertIn("$100.00 after $25 buffer", text)


class ScanTest(unittest.TestCase):
    def test_scans_with_fresh_quotes_and_skips_phones_without(self):
        searched = []

        def fake_search(query, max_price, condition_ids=()):
            searched.append((query, max_price))
            return [listing(price=100), listing(price=200)]

        config = {"settings": SETTINGS, "phones": [
            {**PHONE, "buyer_quotes": [quote("A", 300)]},
            {**PHONE, "name": "No quotes", "buyer_quotes": [quote("A", None)]},
        ]}
        deals, warnings = scanner.scan(config, search=fake_search, today=TODAY)
        self.assertEqual(len(searched), 1)
        self.assertAlmostEqual(searched[0][1], (300 - 100) / 1.10)
        self.assertEqual([d["best"]["net_profit"] for d in deals], [190])
        self.assertIn("No quotes: no verified buyer quote, not scanned", warnings)


class HistoryTest(unittest.TestCase):
    now = datetime(2026, 11, 3, tzinfo=timezone.utc)

    def alerted_state(self, *prices):
        state = {"alerted": {}}
        for i, price in enumerate(prices):
            deal = scanner.evaluate(listing(price=price, item_id=f"x{i}"), PHONE,
                                    [quote("A", 300)], SETTINGS)
            scanner.record_alerted([deal], state, now=self.now)
        return state

    def test_alerts_once_and_counts_the_week(self):
        deal = scanner.evaluate(listing(price=100, item_id="x0"), PHONE,
                                [quote("A", 300)], SETTINGS)
        state = {"alerted": {}}
        self.assertEqual(len(scanner.new_deals([deal], state)), 1)
        scanner.record_alerted([deal], state, now=self.now)
        self.assertEqual(scanner.new_deals([deal], state), [])

        self.assertIn("1 verified opportunities (target 10)",
                      scanner.report(state, 10, now=self.now))
        later = self.now + timedelta(days=8)
        self.assertIn("0 verified opportunities", scanner.report(state, 10, now=later))

    def test_tracks_purchases_inspection_and_profit(self):
        state = self.alerted_state(100, 110, 120)  # est. net 190, 179, 168
        scanner.record_bought(state, "x0", 115)
        scanner.record_bought(state, "x1", 125)
        scanner.record_bought(state, "x2", 135)
        scanner.record_paid(state, "x0", 300)  # full quote
        scanner.record_paid(state, "x1", 260)  # regraded down

        text = scanner.report(state, 10, now=self.now)
        self.assertIn("Surfaced:            3", text)
        self.assertIn("Bought:              3", text)
        self.assertIn("Paid full quote:     1 of 2", text)
        self.assertIn("Net profit collected: $320.00", text)  # 185 + 135
        self.assertIn("Estimated for those:  $369.00", text)
        self.assertIn("Waiting on payout:   1", text)

    def test_paid_needs_a_purchase_first(self):
        state = self.alerted_state(100)
        with self.assertRaises(SystemExit):
            scanner.record_paid(state, "x0", 300)
        with self.assertRaises(SystemExit):
            scanner.record_bought(state, "unknown", 100)

    def test_message_has_the_checklist(self):
        subject, body = alerts.build_message(["deal one", "deal two"])
        self.assertEqual(subject, "SignalTrade: 2 new phones to review")
        self.assertIn("Nothing has been bought", body)
        self.assertIn("IMEI", body)
        self.assertIn("Activation Lock", body)


if __name__ == "__main__":
    unittest.main()
