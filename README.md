# Command Hub

Instant lead alerts and a lead dashboard for roofers. One Node.js server runs the whole thing:

| Address | What it is |
| --- | --- |
| `/` | Marketing page |
| `/signup`, `/login` | Start a free trial / log in |
| `/app/` | The dashboard (log-in required) |
| `/f/<form-key>` | Each account's private form address. A roofer's website form posts here. |
| `/twilio/voice`, `/twilio/sms` | Where Twilio sends calls and texts to a roofer's Command Hub number |
| `/admin` | Campaign stats for you (only emails listed in `ADMIN_EMAILS`) |
| `/privacy` | Privacy policy (fill in the highlighted placeholders) |
| `/api/...` | JSON API used by the dashboard |

## How a lead flows

1. A homeowner fills out the form on the roofer's website. The form posts to `/f/<form-key>`.
2. The server saves the lead and instantly pushes it to every open dashboard (live alert + chime).
3. It also texts the roofer (Twilio) and emails them (Resend), if those are set up.
4. The homeowner gets an instant auto-reply text from the roofer ("Hi Jane, thanks for contacting Roofer Pro…").
5. The roofer taps **Call** or **Text**, or replies right in the app. The homeowner's answers land in the same conversation. The lead moves to *Contacted*, and every step is logged.
6. New leads nobody contacts within 24 hours are marked *Missed*.

**Missed calls:** each roofer can get a Command Hub phone number (a Twilio number). Calls ring the roofer's cell. If they don't answer within 20 seconds, the caller gets a text back right away and appears as a new lead.

## Run it on your computer

Needs [Node.js 22.13 or newer](https://nodejs.org). There are no packages to install.

```bash
npm start          # http://localhost:3000
npm test           # runs the API tests
```

Data is stored in `data/commandhub.db` (SQLite, built into Node).

## Put it online (Render)

1. Create an account at [render.com](https://render.com) and connect your GitHub.
2. Click **New → Blueprint** and choose this repository. Render reads `render.yaml`.
3. Fill in the settings it asks for (see below) and click **Apply**.
4. Once it's live, set `APP_URL` to your site's address (for example `https://commandhub.onrender.com`, or your own domain).

The blueprint uses Render's **Starter** plan (about $7/month) because it includes a disk that keeps your database between deploys.
Free plans erase the database on every restart.

The `Dockerfile` also works on any host that runs containers (Fly.io, Railway, a VPS). Mount a volume at `/data`.

### Settings (environment variables)

| Name | Needed for | Example |
| --- | --- | --- |
| `APP_URL` | Links in alerts and the form address | `https://commandhub.onrender.com` |
| `DATABASE_PATH` | Where the database lives | `/var/data/commandhub.db` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Text alerts | From the [Twilio console](https://console.twilio.com) |
| `TWILIO_FROM` | Text alerts: the Twilio number texts come from | `+18645550100` |
| `RESEND_API_KEY` | Email alerts | From [resend.com](https://resend.com) |
| `EMAIL_FROM` | Email alerts: sender, on a domain verified in Resend | `Command Hub <alerts@yourdomain.com>` |
| `ADMIN_EMAILS` | Who can see `/admin` campaign stats | `you@yourdomain.com` |
| `META_PIXEL_ID` | Meta (Facebook) retargeting | `1234567890` |
| `GOOGLE_TAG_ID` | Google Analytics / Ads retargeting | `G-XXXXXXX` or `AW-123456789` |
| `GOOGLE_ADS_SIGNUP_CONVERSION` | Count sign-ups as Google Ads conversions | `AW-123456789/AbCdEf` |

Without the Twilio or Resend settings the app still works. Alerts show in the dashboard, and each lead's activity notes that the text or email was skipped.

US text messages from a Twilio number need A2P 10DLC registration in the Twilio console before carriers deliver them reliably.

## Setting up a roofer's phone line (missed-call text-back)

1. In Twilio, buy a local number for the roofer.
2. In the number's settings, set **A call comes in** to `https://YOUR-SITE/twilio/voice` and **A message comes in** to `https://YOUR-SITE/twilio/sms` (HTTP POST).
3. In Command Hub, the roofer opens **Settings → Business Phone Line**, pastes the number, and picks which phone it rings.
4. They put that number on their website, Google Business Profile and trucks.

Webhooks are checked with Twilio's signature, so `APP_URL` must exactly match the address you gave Twilio.

## Campaign tracking

Tag links in your emails with `?c=` (campaign or email version) and `&r=` (a unique ID per person), for example
`https://yoursite.com/?c=roofers-v2&r={{lead_id}}`. `utm_` tags work too.

The site then records visits, pricing views, demo clicks, sign-up starts and sign-ups, credited to that campaign and person.
Open `/admin` to compare campaigns, see how far each person got, and download a CSV to load back into your email tool for follow-ups
(for example: visited but didn't sign up → send the pricing follow-up).
With `META_PIXEL_ID` or `GOOGLE_TAG_ID` set, visitors are also added to your ad audiences for retargeting.

## Connecting a roofer's website

In the app, open **Website Connection → View Setup Guide** and copy the form code, or point an existing form's `action` at the form address.
Fields named `name` (or `first_name` + `last_name`), `phone`, `email`, `service`, `message` and `city` are picked up automatically.
A hidden `_gotcha` field catches spam bots, and an optional `_redirect` field sends the visitor to your own thank-you page.

## Not built yet

- **Billing**: trials are tracked (14 days), but there is no payment collection. Stripe would go here.
- **Team log-ins**: team members are listed, but only the account owner can log in.
- **Password reset by email.**
