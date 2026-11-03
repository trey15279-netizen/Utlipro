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
        for url in ("/", "/scan", "/deals", "/phones", "/results", "/prices", "/settings",
                    "/phones?show=done", "/deals?show=all"):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200, url)
        home = self.client.get("/").data.decode()
        self.assertIn("Get set up", home)
        self.assertIn("Re-check 1 buyer price", home)  # stale BuyBackBoss
        for old in ("/opportunities", "/inventory", "/transactions", "/reports"):
            self.assertEqual(self.client.get(old).status_code, 302, old)

    def test_full_flow(self):
        html = self.post("/scan").data.decode()
        self.assertIn("Found 2 new deals", html)
        state = self.state()
        self.assertEqual(set(state["alerted"]), {"v1|111|0", "v1|222|0"})

        home = self.client.get("/").data.decode()
        self.assertIn("Review 2 deals", home)
        self.assertIn("$114.62", home)  # 285 - 10 - (148.5 * 1.08)

        item = "/deals/v1|111|0"
        page = self.client.get(item).data.decode()
        self.assertIn("Before you buy", page)
        self.assertIn("Check again", page)  # stale BuyBackBoss

        # Buying with checks missing saves the checks but no purchase
        html = self.post(item + "/bought", check=["imei", "lock"], price="140", shipping="8.5",
                         tax="11.88").data.decode()
        self.assertIn("Tick the last 5 checks", html)
        e = self.state()["alerted"]["v1|111|0"]
        self.assertNotIn("purchase", e)
        self.assertTrue(e["checklist"]["imei"])

        all_checks = ["imei", "lock", "carrier", "owner", "condition", "quote", "checkout"]
        html = self.post(item + "/bought", check=all_checks, price="140", shipping="8.5",
                         tax="11.88", imei_last4="356938035643809").data.decode()
        self.assertIn("Store only the last 4 digits", html)
        html = self.post(item + "/bought", check=all_checks, price="140", shipping="8.5",
                         tax="11.88", imei_last4="4821").data.decode()
        self.assertIn("Check the phone when it arrives", html)
        self.assertIn("Check the iPhone 13 128GB Unlocked, Good when it arrives",
                      self.client.get("/").data.decode())

        html = self.post(item + "/inspected", result="pass", notes="battery 88%").data.decode()
        self.assertIn("Send it to GadgetGone", html)
        html = self.post(item + "/sent", shipping="0", other_costs="1.50").data.decode()
        self.assertIn("Record the payment from GadgetGone", html)
        self.assertIn("Record payment from GadgetGone", self.client.get("/").data.decode())
        html = self.post(item + "/paid", received="275").data.decode()
        self.assertIn("This phone is done", html)

        e = self.state()["alerted"]["v1|111|0"]
        self.assertEqual(e["purchase"]["acquisition_cost"], 160.38)
        self.assertEqual(e["purchase"]["imei_result"], "clean")
        page = self.client.get("/").data.decode()
        self.assertIn("$113.12", page)  # 275 - 160.38 - 1.50
        self.assertIn("100%", page)
        self.assertIn("paid $10.00 less than expected", self.client.get(item).data.decode())
        for url in ("/phones?show=done", "/phones?show=all", "/results", "/deals?show=all"):
            self.assertEqual(self.client.get(url).status_code, 200, url)

    def test_failed_check_needs_a_buyer_offer(self):
        self.post("/scan")
        item = "/deals/v1|111|0"
        all_checks = ["imei", "lock", "carrier", "owner", "condition", "quote", "checkout"]
        self.post(item + "/bought", check=all_checks, price="140", shipping="8.5", tax="11.88")
        html = self.post(item + "/inspected", result="fail", notes="screen burn").data.decode()
        self.assertIn("This phone failed your check", html)
        self.assertIn("Decide what to do with", self.client.get("/").data.decode())

    def test_dismiss_and_restore(self):
        self.post("/scan")
        self.post("/deals/v1|222|0/dismiss")
        self.assertTrue(self.state()["alerted"]["v1|222|0"]["dismissed"])
        self.assertNotIn("v1|222|0", self.client.get("/deals").data.decode())
        self.post("/deals/v1|222|0/dismiss", undo="1")
        self.assertFalse(self.state()["alerted"]["v1|222|0"]["dismissed"])

    def test_price_needs_confirmation(self):
        html = self.post("/prices/0", quote_index="3", payout="260").data.decode()
        self.assertIn("Tick the box to confirm you just checked ItsWorthMore", html)
        self.post("/prices/0", quote_index="3", payout="260", checked_today="on",
                  grading_deduction="5")
        quote = json.loads(scanner.CONFIG_PATH.read_text())["phones"][0]["buyer_quotes"][3]
        self.assertEqual(quote["payout"], 260)
        self.assertEqual(quote["grading_deduction"], 5)
        self.assertEqual(quote["quoted_on"], date.today().isoformat())
        self.assertEqual((quote["model"], quote["storage"]), ("iPhone 13", "128GB"))
        self.assertIn("Checked today", self.client.get("/prices").data.decode())

        self.post("/prices/0", buyer="SellCell")
        names = [q["buyer"] for q in json.loads(scanner.CONFIG_PATH.read_text())["phones"][0]["buyer_quotes"]]
        self.assertIn("SellCell", names)

    def test_add_phone_and_settings(self):
        self.post("/settings/phones", model="iPhone 14", storage="128GB", carrier="Unlocked",
                  condition="Good")
        phones = json.loads(scanner.CONFIG_PATH.read_text())["phones"]
        self.assertEqual(phones[1]["name"], "iPhone 14 128GB Unlocked, Good")
        self.assertEqual(phones[1]["required_words"], ["iphone 14", "128", "unlocked"])
        self.assertEqual(len(phones[1]["buyer_quotes"]), 4)

        self.post("/settings/general", minimum_net_profit="75", profit_buffer="40",
                  sales_tax_percent="9.5", unknown_shipping_estimate="15",
                  quote_max_age_days="7", min_seller_feedback_percent="98",
                  min_seller_feedback_score="25", weekly_target="10", scan_hours="9, 18")
        s = json.loads(scanner.CONFIG_PATH.read_text())["settings"]
        self.assertEqual((s["profit_buffer"], s["sales_tax_rate"], s["scan_hours"]), (40, 0.095, [9, 18]))
        self.assertFalse(s["auto_scan"])

    def test_keys_saved_from_the_browser(self):
        import keys
        path = Path(self.dir.name) / "keys.json"
        with mock.patch.object(keys, "KEYS_PATH", path), \
                mock.patch.dict(os.environ, {"EBAY_APP_ID": "", "EBAY_CERT_ID": ""}):
            self.post("/settings/keys", EBAY_APP_ID="my-app-id", EBAY_CERT_ID="secret-cert-9876")
            self.assertEqual(json.loads(path.read_text())["EBAY_CERT_ID"], "secret-cert-9876")
            self.assertEqual(os.environ["EBAY_CERT_ID"], "secret-cert-9876")
            self.assertEqual(oct(path.stat().st_mode & 0o777), "0o600")
            page = self.client.get("/settings").data.decode()
            self.assertNotIn("secret-cert-9876", page)
            self.assertIn("•••• 9876", page)
            # Blank fields keep what's saved
            self.post("/settings/keys", EBAY_APP_ID="", EBAY_CERT_ID="")
            self.assertEqual(json.loads(path.read_text())["EBAY_APP_ID"], "my-app-id")
            self.post("/settings/keys", clear=["EBAY_APP_ID", "EBAY_CERT_ID"])
            self.assertEqual(json.loads(path.read_text()), {})
            self.assertFalse(os.environ.get("EBAY_CERT_ID"))

    def test_scan_failure_is_shown(self):
        def failing(config, state, send_alerts=True):
            raise scanner.ScanError("eBay keys aren't set.")
        with mock.patch.object(scanner, "run_scan", failing):
            html = self.post("/scan").data.decode()
        self.assertIn("The scan didn&#39;t run: eBay keys", html)

    def test_installable_app_shell(self):
        manifest = json.loads(self.client.get("/manifest.webmanifest").data)
        self.assertEqual((manifest["name"], manifest["display"]), ("SignalTrade", "standalone"))
        for url in ("/sw.js", "/favicon.ico", "/static/icons/icon-512.png", "/static/icons/icon.svg"):
            self.assertEqual(self.client.get(url).status_code, 200, url)
        self.assertIn('rel="manifest"', self.client.get("/").data.decode())

    def test_quit_stops_the_app(self):
        import app as app_module
        with mock.patch.object(app_module.threading, "Timer") as timer:
            html = self.post("/quit").data.decode()
        self.assertIn("SignalTrade has quit", html)
        timer.assert_called_once()
        self.assertIs(timer.return_value.start.called, True)

    def test_app_window_uses_installed_browser(self):
        import app as app_module
        with mock.patch.object(app_module, "browser_candidates", return_value=["/x/chrome"]), \
                mock.patch.object(app_module.os.path, "exists", return_value=True), \
                mock.patch.object(app_module.subprocess, "Popen") as popen, \
                mock.patch.object(app_module.webbrowser, "open") as fallback:
            app_module.open_app_window("http://127.0.0.1:8000")
        args = popen.call_args[0][0]
        self.assertEqual(args[0], "/x/chrome")
        self.assertIn("--app=http://127.0.0.1:8000", args)
        fallback.assert_not_called()
        with mock.patch.object(app_module, "browser_candidates", return_value=[]), \
                mock.patch.object(app_module.webbrowser, "open") as fallback:
            app_module.open_app_window("http://127.0.0.1:8000")
        fallback.assert_called_once_with("http://127.0.0.1:8000")

    def test_csrf_required(self):
        self.app.config["TESTING_NO_CSRF"] = False
        self.assertEqual(self.client.post("/scan").status_code, 400)


if __name__ == "__main__":
    unittest.main()
