# SignalTrade Scanner

Finds underpriced phones on eBay that already have a verified, profitable
buyback exit. It never buys anything: it alerts you, and you check and approve
every purchase yourself.

**First milestone:** 10 verified opportunities a week, not 10 purchases. Then
log what you buy and what you're paid, so `report` shows whether the estimates
hold up: how many you bought, how many were paid the full quote, and the net
profit you actually collected.

## How it works

1. Each phone in `config.json` has an exact spec: `model`, `storage`,
   `carrier` and `condition` (the buyer's grade you expect, like "Good").
   A buyer quote is used only if all four match exactly. A quote for 256GB,
   Verizon or "Flawless" won't be used for a 128GB unlocked "Good" phone.
2. Quotes older than `quote_max_age_days` (7) are ignored. That only decides
   what gets scanned: re-check the quote right before you buy. Every alert
   links to it.
3. It searches eBay Buy It Now only up to the highest price that could still
   clear the bar, then rejects for-parts, locked, financed or damaged phones,
   titles missing your required words, and sellers under 98% feedback or 25
   ratings.
4. For each listing it estimates net profit against every matching buyer and
   picks the best exit:

   ```
   net = payout - outbound shipping - payout fee - grading deduction
         - (price + shipping to you + estimated sales tax)
   ```

   A listing is only surfaced if net is at least `minimum_net_profit` ($75)
   **plus** `profit_buffer` ($25), so a surprise regrade or shipping cost still
   leaves you above $75.
5. New opportunities are emailed and/or texted once each, with a checklist.

## Before every purchase

The filters narrow things down. They don't prove a seller or phone is
legitimate. Every alert ends with this checklist:

1. Re-check the buyer's quote now for this exact model, storage, carrier and condition.
2. Confirm the sales tax eBay charges at checkout. The estimate uses one fixed
   rate (`sales_tax_rate`), which may not match the transaction.
3. Ask the seller for the IMEI and check it isn't blacklisted, financed or
   carrier-locked.
4. Confirm Activation Lock / Find My is off and the seller owns the phone.
5. Compare the photos to the condition the quote assumes.

## Track results

```sh
python scanner.py bought ITEM_ID 189.50   # everything you spent, incl. tax and shipping out
python scanner.py paid ITEM_ID 240        # what actually reached you
python scanner.py report
```

The item ID is in each alert. A phone counts as passing inspection if the
buyer paid at least the quoted amount.

```
Last 7 days: 11 verified opportunities (target 10)
  ...
All time:
  Surfaced:            38
  Bought:              6
  Paid out:            5
  Paid full quote:     4 of 5
  Net profit collected: $412.00
  Estimated for those:  $498.00
  Average per phone:    $82.40
  Waiting on payout:   1
```

If collected profit keeps falling short of the estimate, raise
`grading_deduction` for that buyer or raise `profit_buffer`.

## Buyer quotes

Get each quote on the buyer's site for the exact spec, then fill in:

| Field | What to enter |
| --- | --- |
| `model`, `storage`, `carrier`, `condition` | What you selected on the buyer's site. Must match the phone. |
| `payout` | The quoted amount. `null` means not entered, so the buyer is skipped. |
| `outbound_shipping` | Your cost to ship to them. 0 if they send a free label. |
| `payout_fee` | Any fee on the payout method, like PayPal or check fees. |
| `grading_deduction` | How much you expect them to cut after inspection. |
| `quoted_on` | The date you checked, like `2026-11-03`. |
| `quote_url` | Link to the quote, so you can re-check it before buying. |

To scan another condition or carrier, add a separate phone entry with its own
quotes.

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
python scanner.py                   # scan and alert on new opportunities
python scanner.py scan --no-alerts  # scan and print only
```

Schedule it with cron to scan a few times a day:

```
0 8,13,19 * * * cd /path/to/signaltrade-scanner && python scanner.py
```

History is kept in `data/alerted.json`, which isn't committed. Back it up: it
holds your purchase and payout log.

## Test

```sh
python -m unittest test_scanner.py
```
