import unittest

from deal_finder import find_deals


def listing(title, price, shipping=None, condition_id="3000"):
    item = {
        "title": title,
        "price": {"value": str(price), "currency": "USD"},
        "conditionId": condition_id,
        "condition": "Used",
        "itemWebUrl": f"https://www.ebay.com/itm/{title.replace(' ', '-')}",
    }
    if shipping is not None:
        item["shippingOptions"] = [
            {"shippingCost": {"value": str(shipping), "currency": "USD"}}
        ]
    return item


class FindDealsTest(unittest.TestCase):
    def deals(self, listings):
        return find_deals("iPhone 13", buyer_payout=235, shipping=10,
                          minimum_profit=50, listings=listings)

    def test_counts_shipping_to_you(self):
        deals = self.deals([listing("Good phone", 160, shipping=20)])
        self.assertEqual(deals, [])  # 235 - 180 - 10 = 45, under 50

    def test_free_shipping_deal_is_kept(self):
        deals = self.deals([listing("Good phone", 160, shipping=0)])
        self.assertEqual(deals[0]["profit"], 65)

    def test_skips_parts_and_locked_phones(self):
        deals = self.deals([
            listing("Phone for parts", 50, condition_id="7000"),
            listing("iPhone 13 iCloud locked", 50),
            listing("iPhone 13 cracked screen", 50),
        ])
        self.assertEqual(deals, [])

    def test_skips_listings_without_a_price(self):
        item = listing("No price", 1)
        del item["price"]
        self.assertEqual(self.deals([item]), [])

    def test_best_profit_first(self):
        deals = self.deals([listing("A", 170, 0), listing("B", 120, 0)])
        self.assertEqual([d["title"] for d in deals], ["B", "A"])


if __name__ == "__main__":
    unittest.main()
