# eBay deal finder

Searches eBay for Buy It Now listings you can buy and sell to a buyback buyer
for at least a set profit.

## Setup

```sh
pip install requests
```

Get a keyset at https://developer.ebay.com/my/keys, then set either:

- `EBAY_APP_ID` and `EBAY_CERT_ID`. The script fetches a fresh token each run.
- `EBAY_ACCESS_TOKEN`, if you already have an application token. These expire
  after about 2 hours.

## Run

```sh
python deal_finder.py
```

Change the query, `buyer_payout`, `shipping` (what it costs you to send the
phone to the buyer) and `minimum_profit` at the bottom of `deal_finder.py`.

Profit is `buyer_payout - listing price - listing shipping - shipping`.
Sales tax and the buyer's grading deductions are not included.

## Test

```sh
python -m unittest test_deal_finder.py
```
