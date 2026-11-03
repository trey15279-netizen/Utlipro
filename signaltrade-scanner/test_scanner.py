import unittest
from datetime import date, datetime, timedelta, timezone

import alerts
import scanner
import tracking
from tracking import TrackingError

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

    def alerted_state(self, *prices, payout_fee=0):
        state = {"alerted": {}}
        for i, price in enumerate(prices):
            deal = scanner.evaluate(
                listing(price=price, item_id=f"x{i}"), PHONE,
                [quote("A", 300, payout_fee=payout_fee)], SETTINGS)
            tracking.record_alerted([deal], state, now=self.now)
        return state

    def through_payout(self, state, item_id, received, passed=True,
                       price=100, shipping=10, tax=8, ship_out=0, other=0):
        tracking.record_purchase(state, item_id, price, shipping, tax, "clean", "4821",
                                 on=date(2026, 11, 4))
        tracking.record_inspection(state, item_id, passed, on=date(2026, 11, 6))
        tracking.record_sent(state, item_id, shipping=ship_out, other_costs=other,
                             on=date(2026, 11, 6))
        if received is not None:
            tracking.record_payout(state, item_id, received, on=date(2026, 11, 12))

    def test_alerts_once_and_counts_the_week(self):
        state = self.alerted_state(100)
        deal = {"item_id": "x0"}
        self.assertEqual(tracking.new_deals([deal], state), [])
        self.assertIn("1 verified opportunities (target 10)",
                      tracking.report(state, 10, now=self.now))
        later = self.now + timedelta(days=8)
        self.assertIn("0 verified opportunities", tracking.report(state, 10, now=later))

    def test_actual_profit_counts_each_cost_once(self):
        state = self.alerted_state(100, payout_fee=5)
        self.through_payout(state, "x0", received=295, price=100, shipping=10,
                            tax=8.8, ship_out=6, other=2)
        entry = state["alerted"]["x0"]
        self.assertEqual(entry["purchase"]["acquisition_cost"], 118.8)
        # 295 received (fee already taken) - 118.80 - 6 - 2; fee not taken again
        self.assertEqual(tracking.actual_profit(entry), 168.2)
        self.assertEqual(entry["sent"]["expected_payout"], 295)
        self.assertFalse(tracking.payout_reduced(entry))

    def test_inspection_and_payout_are_separate(self):
        state = self.alerted_state(100, 110, 120, 130)
        self.through_payout(state, "x0", received=300)               # passed, full
        self.through_payout(state, "x1", received=260)               # passed, reduced
        self.through_payout(state, "x2", received=200, passed=False)  # failed, sold anyway
        self.through_payout(state, "x3", received=None)              # waiting

        text = tracking.report(state, 10, now=self.now)
        self.assertIn("Purchased:            4", text)
        self.assertIn("Inspected:            4  (passed 3, failed 1)", text)
        self.assertIn("Sent to buyer:        4", text)
        self.assertIn("Paid:                 3  (full 1, reduced 2)", text)
        self.assertIn("Actual profit:        $406.00", text)  # 182 + 142 + 82
        self.assertIn("Waiting on payout:    1", text)

    def test_stages_happen_in_order(self):
        state = self.alerted_state(100)
        with self.assertRaises(TrackingError):
            tracking.record_inspection(state, "x0", True)
        tracking.record_purchase(state, "x0", 100, 0, 8, "clean")
        with self.assertRaises(TrackingError):
            tracking.record_purchase(state, "x0", 100, 0, 8, "clean")
        with self.assertRaises(TrackingError):
            tracking.record_sent(state, "x0")
        tracking.record_inspection(state, "x0", True)
        with self.assertRaises(TrackingError):
            tracking.record_payout(state, "x0", 300)
        with self.assertRaises(TrackingError):
            tracking.record_purchase(state, "unknown", 100, 0, 8, "clean")

    def test_other_buyer_needs_its_own_expected_payout(self):
        state = self.alerted_state(100)
        tracking.record_purchase(state, "x0", 100, 0, 8, "clean")
        tracking.record_inspection(state, "x0", True)
        with self.assertRaises(TrackingError):
            tracking.record_sent(state, "x0", buyer="Other")
        tracking.record_sent(state, "x0", buyer="Other", expected_payout=280)
        self.assertEqual(state["alerted"]["x0"]["sent"]["expected_payout"], 280)

    def test_never_stores_a_full_imei(self):
        state = self.alerted_state(100)
        for bad in ("356938035643809", "12345", "12a4"):
            with self.assertRaises(TrackingError):
                tracking.record_purchase(state, "x0", 100, 0, 8, "clean", bad)
        with self.assertRaises(TrackingError):
            tracking.record_purchase(state, "x0", 100, 0, 8, "probably fine")

    def test_decision_record(self):
        state = self.alerted_state(100)
        self.through_payout(state, "x0", received=290)
        text = tracking.decision_record("x0", state["alerted"]["x0"])
        for line in ("Listing:           https://www.ebay.com/itm/1",
                     "Seller:            seller1",
                     "IMEI check:        clean (ends 4821)",
                     "Inspection:        passed",
                     "Purchased:         2026-11-04",
                     "Paid:              2026-11-12",
                     "Expected payout:   $300.00",
                     "Actual payout:     $290.00",
                     "Actual profit:     $172.00"):
            self.assertIn(line, text)

    def test_decision_record_mid_way(self):
        state = self.alerted_state(100)
        text = tracking.decision_record("x0", state["alerted"]["x0"])
        self.assertIn("Purchased:         -", text)
        tracking.record_purchase(state, "x0", 100, 0, 8, "not-checked")
        text = tracking.decision_record("x0", state["alerted"]["x0"])
        self.assertIn("Selling costs:     -", text)
        self.assertIn("IMEI check:        not-checked", text)

    def test_message_has_the_checklist(self):
        subject, body = alerts.build_message(["deal one", "deal two"])
        self.assertEqual(subject, "SignalTrade: 2 new phones to review")
        self.assertIn("Nothing has been bought", body)
        self.assertIn("IMEI", body)
        self.assertIn("Activation Lock", body)


if __name__ == "__main__":
    unittest.main()
