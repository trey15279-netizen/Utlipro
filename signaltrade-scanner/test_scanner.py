import unittest
from datetime import date, datetime, timedelta, timezone

import alerts
import scanner

TODAY = date(2026, 11, 3)
SETTINGS = {**scanner.DEFAULT_SETTINGS, "sales_tax_rate": 0.10}


def quote(buyer, payout, quoted_on="2026-11-01", **costs):
    return {"buyer": buyer, "payout": payout, "quoted_on": quoted_on, **costs}


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


PHONE = {"name": "iPhone 13", "query": "iPhone 13",
         "required_words": ["iphone 13", "unlocked"], "excluded_words": ["pro"]}


class NetProfitTest(unittest.TestCase):
    def test_every_cost_is_subtracted(self):
        q = quote("A", 300, outbound_shipping=5, payout_fee=3, grading_deduction=20)
        result = scanner.net_profit(150, 10, q, SETTINGS)
        # 300 - 5 - 3 - 20 - (150 + 10 + 16 tax)
        self.assertEqual(result["sales_tax"], 16)
        self.assertEqual(result["net_profit"], 96)


class QuotesTest(unittest.TestCase):
    def test_stale_and_missing_quotes_are_not_used(self):
        phone = {"name": "P", "buyer_quotes": [
            quote("Fresh", 300, "2026-10-30"),
            quote("Stale", 400, "2026-10-01"),
            quote("Undated", 400, None),
            quote("Blank", None),
        ]}
        fresh, warnings = scanner.usable_quotes(phone, SETTINGS, TODAY)
        self.assertEqual([q["buyer"] for q in fresh], ["Fresh"])
        self.assertEqual(len(warnings), 2)


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

    def test_below_target_is_dropped(self):
        self.assertIsNone(self.evaluate(listing(price=200, shipping=0)))  # 70 net

    def test_unknown_shipping_is_estimated(self):
        deal = self.evaluate(listing(price=150, shipping=None))
        self.assertFalse(deal["shipping_known"])
        self.assertEqual(deal["best"]["inbound_shipping"], 15)

    def test_rejects_risky_listings(self):
        for item in [
            listing(condition_id="7000"),
            listing(title="iPhone 13 Unlocked iCloud locked"),
            listing(title="iPhone 13 128GB"),  # not unlocked
            listing(title="iPhone 13 Pro Unlocked"),
            listing(feedback="95.0"),
            listing(score=3),
        ]:
            self.assertIsNone(self.evaluate(item), item["title"])


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
        self.assertAlmostEqual(searched[0][1], (300 - 75) / 1.10)
        self.assertEqual([d["best"]["net_profit"] for d in deals], [190, 80])
        self.assertIn("No quotes: no verified buyer quote, not scanned", warnings)


class AlertHistoryTest(unittest.TestCase):
    def test_alerts_once_and_counts_the_week(self):
        deal = scanner.evaluate(listing(price=100, item_id="x1"), PHONE,
                                [quote("A", 300)], SETTINGS)
        state = {"alerted": {}}
        now = datetime(2026, 11, 3, tzinfo=timezone.utc)
        self.assertEqual(len(scanner.new_deals([deal], state)), 1)
        scanner.record_alerted([deal], state, now=now)
        self.assertEqual(scanner.new_deals([deal], state), [])

        self.assertIn("1 opportunities (target 10)",
                      scanner.weekly_report(state, 10, now=now))
        later = now + timedelta(days=8)
        self.assertIn("0 opportunities",
                      scanner.weekly_report(state, 10, now=later))

    def test_message_says_nothing_was_bought(self):
        subject, body = alerts.build_message(["deal one", "deal two"])
        self.assertEqual(subject, "SignalTrade: 2 new phones to review")
        self.assertIn("Nothing has been bought", body)


if __name__ == "__main__":
    unittest.main()
