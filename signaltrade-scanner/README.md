# SignalTrade Scanner

Finds underpriced phones on eBay that already have a verified, profitable
buyback exit. It never buys anything: it alerts you, and you approve every
purchase yourself.

Targets (set in `config.json`): $75+ estimated net profit per phone, 10+
opportunities a week.

## How it works

1. You enter buyer quotes in `config.json` for each phone you trade:
   BankMyCell, GadgetGone, BuyBackBoss, ItsWorthMore, or any other buyer.
   Each quote has a `quoted_on` date. Quotes older than `quote_max_age_days`
   (7 by default) are ignored, and the scanner tells you which to re-check.
   A phone with no fresh quote isn't scanned at all.
2. For each phone, it searches eBay Buy It Now only up to the highest price
   that could still clear your target.
3. It rejects risky listings: for-parts, locked or damaged phones, titles
   missing your required words (like "unlocked"), and sellers under 98%
   feedback or 25 ratings.
4. For each remaining listing it works out net profit against every buyer
   and picks the best exit:

   ```
   net = payout - outbound shipping - payout fee - grading deduction
         - (price + shipping to you + sales tax)
   ```

   If eBay doesn't give a shipping cost, it assumes `unknown_shipping_estimate`.
5. New listings that clear the target are sent to you by email and/or text,
   once each.

## Buyer quotes

Get each quote from the buyer's site for the exact model, storage, carrier and
condition you expect to send. Then fill in:

| Field | What to enter |
| --- | --- |
| `payout` | The quoted amount. `null` means not entered, so the buyer is skipped. |
| `outbound_shipping` | Your cost to ship to them. 0 if they send a free label. |
| `payout_fee` | Any fee on the payout method, like PayPal or check fees. |
| `grading_deduction` | How much you expect them to cut after inspection. Say $20–40 if they might grade a "Good" phone as "Fair". |
| `quoted_on` | The date you checked, like `2026-11-03`. |
| `quote_url` | Link to the quote, so you can check it again. |

Set `sales_tax_rate` to your state's rate.

## Setup

```sh
pip install requests
```

eBay keys from https://developer.ebay.com/my/keys:

- `EBAY_APP_ID` and `EBAY_CERT_ID` (a token is fetched each run), or
- `EBAY_ACCESS_TOKEN`

Alerts are optional. If neither channel is set up, deals are only printed.

- Email through Resend: `RESEND_API_KEY`, `EMAIL_FROM`, `ALERT_EMAIL_TO`
- Text through Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_FROM`, `ALERT_SMS_TO`

## Run

```sh
python scanner.py              # scan and alert on new opportunities
python scanner.py --no-alerts  # scan and print only
python scanner.py --report     # opportunities surfaced in the last 7 days
```

Schedule it with cron to scan a few times a day, for example:

```
0 8,13,19 * * * cd /path/to/signaltrade-scanner && python scanner.py
```

Alert history is kept in `data/alerted.json`, which isn't committed.

## Test

```sh
python -m unittest test_scanner.py
```
