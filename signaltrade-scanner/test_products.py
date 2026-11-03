import unittest

import products


class BuildTest(unittest.TestCase):
    def test_iphone_skips_bigger_models(self):
        p = products.build("iphone", "iPhone 13", "128GB", "Unlocked", "Good")
        self.assertEqual(p["required_words"], ["iphone 13", "128", "unlocked"])
        self.assertEqual(p["excluded_words"], ["pro", "max", "plus", "mini"])
        self.assertEqual(p["ebay_category_ids"], ["9355"])
        self.assertEqual(p["name"], "iPhone 13 128GB Unlocked, Good")
        self.assertEqual(len(p["buyer_quotes"]), 4)

    def test_pro_max_and_carrier(self):
        p = products.build("iphone", "iPhone 14 Pro Max", "256GB", "Verizon", "Fair")
        self.assertEqual(p["required_words"], ["iphone 14 pro max", "256", "verizon"])
        self.assertEqual(p["excluded_words"], ["plus", "mini"])

    def test_ipad_needs_generation_and_wifi(self):
        p = products.build("ipad", "iPad (10th generation)", "64GB", "Wi-Fi", "Good")
        self.assertEqual(p["required_words"], ["ipad", "10th", "64"])
        self.assertIn("cellular", p["excluded_words"])
        self.assertEqual(p["query"], "iPad 64GB wifi")
        cell = products.build("ipad", "iPad Air (5th generation)", "256GB", "Wi-Fi + Cellular", "Good")
        self.assertEqual(cell["required_words"], ["ipad air", "5th", "256", "cellular"])
        self.assertEqual(cell["excluded_words"], ["pro", "mini"])

    def test_galaxy_without_the_word_galaxy(self):
        p = products.build("galaxy", "Galaxy S23", "128GB", "Unlocked", "Good")
        self.assertEqual(p["required_words"], ["s23", "128", "unlocked"])
        self.assertEqual(p["excluded_words"], ["ultra", "plus", "+", "fe"])
        ultra = products.build("galaxy", "Galaxy S24 Ultra", "256GB", "Unlocked", "Good")
        self.assertEqual(ultra["excluded_words"], ["plus", "+", "fe"])

    def test_watch_size_and_gps(self):
        p = products.build("watch", "Apple Watch Series 9", "45mm", "GPS", "Good")
        self.assertEqual(p["required_words"], ["series 9", "45mm"])
        self.assertEqual(p["excluded_words"], ["ultra", "cellular"])
        ultra = products.build("watch", "Apple Watch Ultra", "49mm", "GPS + Cellular", "Good")
        self.assertIn("ultra 2", ultra["excluded_words"])

    def test_missing_fields(self):
        with self.assertRaises(ValueError):
            products.build("iphone", "iPhone 13", "", "Unlocked", "Good")
        with self.assertRaises(ValueError):
            products.build("toaster", "x", "y", "z", "Good")


class ChecksTest(unittest.TestCase):
    def test_keys_are_the_same_for_every_product(self):
        keys = [k for k, _, _ in products.checklist({"category": "iphone"})]
        for cat in products.CATEGORIES:
            self.assertEqual([k for k, _, _ in products.checklist({"category": cat})], keys)

    def test_wording_fits_the_product(self):
        galaxy = dict((k, label) for k, label, _ in products.checklist({"category": "galaxy"}))
        self.assertEqual(galaxy["lock"], "Google & Samsung account removed")
        ipad = dict((k, label) for k, label, _ in products.checklist({"category": "ipad", "carrier": "Wi-Fi"}))
        self.assertEqual(ipad["imei"], "Serial number verified")
        self.assertEqual(ipad["carrier"], "Wi-Fi / GPS model confirmed")
        self.assertIn("Google and Samsung", products.seller_message({"category": "galaxy", "model": "Galaxy S23"}))
        self.assertIn("serial number", products.seller_message({"category": "watch", "carrier": "GPS"}))


if __name__ == "__main__":
    unittest.main()
