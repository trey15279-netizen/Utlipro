# SignalTrade Scanner

Finds underpriced phones on eBay that already have a verified, profitable
buyback exit. It never buys anything: it alerts you, and you check and approve
every purchase yourself.

**First milestone:** 10 verified opportunities a week, not 10 purchases.
Before adding features, get real eBay data flowing, enter verified buyer
quotes, and work 10–20 listings through by hand. The goal is to prove phones
can be bought, verified and resold profitably, not just that listings look
profitable on paper.

## Start here

1. **Open the app.**
   - **Mac:** double-click **SignalTrade.app** (drag it to your Dock to keep it
     handy). The first time, macOS may say it can't check the developer:
     right-click it, choose **Open**, then **Open** again. You only do this once.
   - **Windows:** double-click **start.bat** once. It sets itself up and puts a
     **SignalTrade** icon on your desktop. Use that icon from then on.

   You need Python 3 from python.org. The first start takes about a minute.
   SignalTrade opens in its own window, with no tabs or address bar. That works
   best with Chrome, Edge or Brave installed; otherwise it opens in your normal
   browser. In Chrome or Edge you can also use **Install SignalTrade** in the
   address bar menu.

   SignalTrade keeps running in the background so it can scan on schedule,
   even after you close the window. Opening it again brings the window back.
   To stop it completely, press **Quit** at the bottom of the sidebar.
2. **Follow "Get set up" on the Home page:**
   - Paste your free eBay keys in Settings and press **Test eBay**.
   - In **Buyer Prices**, get a quote from each buyer's site, type the price,
     tick "I just checked this price", and save.
   - Press **Scan eBay now**.
3. **Then just work the To do list on Home.** It always says what's next:
   review a deal, check a phone that arrived, send it, record the payment, or
   re-check an old price.

Every deal walks you through the same five steps: **Found → Bought → Checked →
Sent → Paid**. The page shows one thing to do at a time. You can't record a
purchase until all seven pre-purchase checks are ticked. SignalTrade never buys
anything itself: you buy on eBay, then tell it what you paid.

| Page | What it's for |
| --- | --- |
| Home | Setup guide, your to-do list, this week's numbers, best deals |
| Deals | Every deal found. Open one to check it and record your purchase |
| My Phones | Phones you've bought, and the next step for each |
| Buyer Prices | What each buyer pays. Prices older than 7 days aren't used |
| Results | Real profit vs estimated, and how many deals turn into payments |
| Settings | Keys, profit target, tax rate, scan times, the phones you trade |

While SignalTrade is open it scans eBay every 15 minutes (change it in
Settings), newest listings first, US sellers only. That's well under eBay's
daily limit. It finds three kinds of listing:

- **Buy It Now deals** that already clear your profit target.
- **Make-an-offer deals:** Best Offer listings up to 20% over your limit. It
  tells you the most you can offer and still hit your target.
- **"Check carefully" deals:** anything under 45% of the buyer's payout, which
  is often a scam or a locked phone.

Each deal also has a ready-to-copy message asking the seller for the IMEI,
Activation Lock, payoff status and battery health, plus links to the free
blacklist check (stolenphonechecker.org) and Apple's coverage check. Keys you paste are saved only on your computer, in
`data/keys.json`. SignalTrade only runs on your own computer: it has no login,
so don't put it on the internet.

To start it from a terminal instead: `./start.command`, or
`pip install -r requirements.txt` then `python app.py`. If something goes wrong
when starting from the app icon, the details are in `data/signaltrade.log`.

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
