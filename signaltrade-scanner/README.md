# SignalTrade Scanner

Finds underpriced phones on eBay that already have a verified, profitable
buyback exit. It never buys anything: it alerts you, and you check and approve
every purchase yourself.

**First milestone:** 10 verified opportunities a week, not 10 purchases.
Before adding features, get real eBay data flowing, enter verified buyer
quotes, and work 10–20 listings through by hand. The goal is to prove phones
can be bought, verified and resold profitably, not just that listings look
profitable on paper.

## Dashboard

```sh
pip install -r requirements.txt
export EBAY_APP_ID=... EBAY_CERT_ID=...   # plus alert keys if you want them
python app.py                             # open http://127.0.0.1:8000
```

The dashboard is the same scanner, with everything done from the browser:

- **Overview:** this week's opportunities against your target, purchases,
  inspection pass rate, and realized profit next to the estimate. Also the best
  open deal, a comparison of all four buyers for it, and the checklist.
- **Scan Marketplace:** run a scan, see what it found and any warnings, and
  see which phones will be scanned and which are blocked by a missing or
  expired quote.
- **Opportunities:** every listing that cleared your bar. Open one to see the
  cost breakdown, compare buyers on today's quotes, tick the pre-purchase
  checklist and record the purchase you made yourself on eBay. Recording a
  purchase is blocked until all seven checks are saved.
- **Inventory:** phones bought but not yet paid, each with its next step:
  record inspection, mark as sent, record payout.
- **Transactions:** every purchase with estimated and actual profit.
- **Performance Reports:** the funnel, profit trend, average profit per
  phone, capital deployed and weekly opportunity counts.
- **Settings:** enter and re-verify buyer quotes, add phones, and change the
  profit rules and scan schedule.

While the app is running it also scans automatically at the hours set in
Settings (8:00, 13:00 and 19:00 by default, local time). The sidebar shows
the last and next scan, whether eBay keys and alerts are set up, and how many
quotes need re-verifying.

Every number on the dashboard comes from `config.json` and
`data/alerted.json`, which the command line uses too, so you can mix both.
It listens on 127.0.0.1 only. Keep it that way, or put it behind a login
before exposing it to a network: it has no user accounts.

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

Record each stage as it happens. Each command prints the phone's purchase
decision record. The item ID is in the alert.

```sh
# 1. Bought: what you actually paid, split out. Tax is what eBay charged.
python scanner.py bought ITEM_ID --price 150 --shipping 0 --tax 12.38 \
    --imei clean --imei-last4 3809

# 2. Your own inspection when it arrives
python scanner.py inspected ITEM_ID pass --notes "screen clean, battery 88%"

# 3. Sent to the buyer (defaults to the buyer in the alert)
python scanner.py sent ITEM_ID --shipping 0 --other-costs 1.50
python scanner.py sent ITEM_ID --buyer ItsWorthMore --expected-payout 255 --shipping 0

# 4. Paid: the money that actually reached you
python scanner.py paid ITEM_ID 270

python scanner.py show ITEM_ID   # the full record
python scanner.py report         # weekly count and results by stage
```

`--imei` is `clean`, `flagged` or `not-checked`. Only the last 4 digits of the
IMEI are stored. A full IMEI is refused.

### How profit is counted

Each cost is entered once, at the stage where you pay it:

```
acquisition cost = price + shipping to you + sales tax       (bought)
selling costs    = shipping to buyer + other selling costs   (sent)
payout received  = money that reached you                    (paid)

actual profit    = payout received - acquisition cost - selling costs
```

Payout fees (PayPal, check fees) are already taken out of what you receive, so
don't enter them as other selling costs too.

Inspection and payout are tracked separately. Your inspection is pass or fail.
The payout is "full" if you received at least the expected payout (the quote
minus its payout fee) and "reduced" if not. So a phone can pass your
inspection and still be paid less.

```
All time:
  Surfaced:             38
  Purchased:            6
  Inspected:            6  (passed 5, failed 1)
  Sent to buyer:        5
  Paid:                 4  (full 3, reduced 1)
  Actual profit:        $371.00
  Estimated for those:  $448.00
  Average per phone:    $92.75
  Bought, not sent:     1
  Waiting on payout:    1
```

If actual profit keeps falling short of the estimate, raise
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
holds every purchase decision record.

## Test

```sh
python -m unittest test_scanner.py test_app.py
```
