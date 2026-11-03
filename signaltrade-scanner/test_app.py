import json
import os
import re
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

import scanner
import test_scanner as t


def fake_search(query, max_price, condition_ids=(), token=None):
    return [t.listing(price=140, shipping=8.5, item_id="v1|111|0"),
            t.listing(price=150, shipping=0, item_id="v1|222|0")]


class AppTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        root = Path(self.dir.name)
        today = date.today().isoformat()
        config = {
            "settings": {"sales_tax_rate": 0.08, "auto_scan": False},
            "phones": [{**t.PHONE, "name": "iPhone 13 128GB Unlocked, Good",
                        "buyer_quotes": [
                            t.quote("GadgetGone", 285, today, grading_deduction=10),
                            t.quote("BankMyCell", 272, today),
                            t.quote("BuyBackBoss", 290, "2020-01-01"),
                            {"buyer": "ItsWorthMore", "payout": None},
                        ]}],
        }
        (root / "config.json").write_text(json.dumps(config))
        patches = [
            mock.patch.object(scanner, "CONFIG_PATH", root / "config.json"),
            mock.patch.object(scanner, "STATE_PATH", root / "data" / "state.json"),
            mock.patch.object(scanner, "search_ebay", fake_search),
            mock.patch.dict(os.environ, {"EBAY_ACCESS_TOKEN": "x"}),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        # run_scan's default argument was bound at import; route it to the fake
        real_run = scanner.run_scan
        p = mock.patch.object(scanner, "run_scan",
                              lambda c, s, send_alerts=True: real_run(c, s, send_alerts, search=fake_search))
        p.start()
        self.addCleanup(p.stop)

        import app
        self.app = app.create_app()
        self.app.config["TESTING_NO_CSRF"] = True
        self.client = self.app.test_client()

    def tearDown(self):
        self.dir.cleanup()

    def state(self):
        return json.loads(scanner.STATE_PATH.read_text())

    def post(self, url, **data):
        return self.client.post(url, data=data, follow_redirects=True)

    def test_every_page_renders_empty(self):
        for url in ("/", "/scan", "/opportunities", "/inventory", "/transactions",
                    "/reports", "/settings"):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200, url)
        self.assertIn(b"No open opportunities", self.client.get("/").data)

    def test_full_flow(self):
        html = self.post("/scan", alerts="").data.decode()
        self.assertIn("2 listings clear the bar, 2 new", html)
        state = self.state()
        self.assertEqual(set(state["alerted"]), {"v1|111|0", "v1|222|0"})

        page = self.client.get("/").data.decode()
        # Featured is the most profitable: 285 - 10 - (148.5 * 1.08 = 160.38) = 114.62
        self.assertIn("$114.62", page)
        self.assertIn("Re-verify", page)  # stale BuyBackBoss
        self.assertIn("Best exit", page)

        item = "/items/v1|111|0"
        html = self.post(item + "/bought", price="140", shipping="8.5", tax="11.88",
                         imei_result="clean", imei_last4="4821").data.decode()
        self.assertIn("Complete every pre-purchase check first", html)
        self.assertNotIn("purchase", self.state()["alerted"]["v1|111|0"])

        self.client.post(item + "/checklist", data={"check": ["imei", "lock", "carrier", "owner",
                                                              "condition", "quote", "checkout"]})
        html = self.post(item + "/bought", price="140", shipping="8.5", tax="11.88",
                         imei_result="clean", imei_last4="356938035643809").data.decode()
        self.assertIn("Store only the last 4 digits", html)
        self.post(item + "/bought", price="140", shipping="8.5", tax="11.88",
                  imei_result="clean", imei_last4="4821")
        self.post(item + "/inspected", result="pass", notes="battery 88%")
        self.post(item + "/sent", buyer="GadgetGone", shipping="0", other_costs="1.50")
        html = self.post(item + "/paid", received="275").data.decode()
        self.assertIn("Payout recorded", html)

        e = self.state()["alerted"]["v1|111|0"]
        self.assertEqual(e["purchase"]["acquisition_cost"], 160.38)
        # 275 - 160.38 - 1.50
        page = self.client.get("/").data.decode()
        self.assertIn("$113.12", page)
        self.assertIn("reduced 1", page)  # expected 285, got 275
        self.assertIn("Expected $285.00", page)
        self.assertIn("100%", page)     # pass rate
        for url in ("/inventory", "/transactions", "/reports", "/opportunities?show=all", item):
            self.assertEqual(self.client.get(url).status_code, 200, url)
        self.assertIn("ends 4821", self.client.get(item).data.decode())

    def test_dismiss_and_restore(self):
        self.post("/scan")
        self.post("/items/v1|222|0/dismiss")
        self.assertTrue(self.state()["alerted"]["v1|222|0"]["dismissed"])
        self.assertNotIn("v1|222|0", self.client.get("/opportunities").data.decode())
        self.post("/items/v1|222|0/dismiss", undo="1")
        self.assertFalse(self.state()["alerted"]["v1|222|0"]["dismissed"])

    def test_quote_needs_exact_spec_confirmation(self):
        html = self.post("/settings/phones/0/quotes", quote_index="3", payout="260",
                         quoted_on=date.today().isoformat()).data.decode()
        self.assertIn("Confirm the quote is for this exact model", html)
        self.post("/settings/phones/0/quotes", quote_index="3", payout="260",
                  exact_spec="on", grading_deduction="5")
        quote = json.loads(scanner.CONFIG_PATH.read_text())["phones"][0]["buyer_quotes"][3]
        self.assertEqual(quote["payout"], 260)
        self.assertEqual(quote["quoted_on"], date.today().isoformat())
        self.assertEqual((quote["model"], quote["storage"]), ("iPhone 13", "128GB"))

    def test_add_phone_and_settings(self):
        self.post("/settings/phones", model="iPhone 14", storage="128GB", carrier="Unlocked",
                  condition="Good", ebay_condition_ids=["3000"])
        phones = json.loads(scanner.CONFIG_PATH.read_text())["phones"]
        self.assertEqual(phones[1]["name"], "iPhone 14 128GB Unlocked, Good")
        self.assertEqual(len(phones[1]["buyer_quotes"]), 4)

        self.post("/settings/general", minimum_net_profit="75", profit_buffer="40",
                  sales_tax_percent="9.5", unknown_shipping_estimate="15",
                  quote_max_age_days="7", min_seller_feedback_percent="98",
                  min_seller_feedback_score="25", weekly_target="10", scan_hours="9, 18")
        s = json.loads(scanner.CONFIG_PATH.read_text())["settings"]
        self.assertEqual((s["profit_buffer"], s["sales_tax_rate"], s["scan_hours"]), (40, 0.095, [9, 18]))
        self.assertFalse(s["auto_scan"])

    def test_scan_failure_is_shown(self):
        def failing(config, state, send_alerts=True):
            raise scanner.ScanError("eBay keys aren't set.")
        with mock.patch.object(scanner, "run_scan", failing):
            html = self.post("/scan").data.decode()
        self.assertIn("Scan failed: eBay keys", html)

    def test_csrf_required(self):
        self.app.config["TESTING_NO_CSRF"] = False
        self.assertEqual(self.client.post("/scan").status_code, 400)


if __name__ == "__main__":
    unittest.main()
