# Command Hub

Instant lead alerts and a lead dashboard for roofers. One Node.js server runs the whole thing:

| Address | What it is |
| --- | --- |
| `/` | Marketing page |
| `/signup`, `/login` | Start a free trial / log in |
| `/app/` | The dashboard (log-in required) |
| `/f/<form-key>` | Each account's private form address. A roofer's website form posts here. |
| `/api/...` | JSON API used by the dashboard |

## How a lead flows

1. A homeowner fills out the form on the roofer's website. The form posts to `/f/<form-key>`.
2. The server saves the lead and instantly pushes it to every open dashboard (live alert + chime).
3. It also texts the roofer (Twilio) and emails them (Resend), if those are set up.
4. The roofer taps **Call** or **Text**. The lead moves to *Contacted*, and every step is logged.
5. New leads nobody contacts within 24 hours are marked *Missed*.

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

Without the Twilio or Resend settings the app still works. Alerts show in the dashboard, and each lead's activity notes that the text or email was skipped.

US text messages from a Twilio number need A2P 10DLC registration in the Twilio console before carriers deliver them reliably.

## Connecting a roofer's website

In the app, open **Website Connection → View Setup Guide** and copy the form code, or point an existing form's `action` at the form address.
Fields named `name` (or `first_name` + `last_name`), `phone`, `email`, `service`, `message` and `city` are picked up automatically.
A hidden `_gotcha` field catches spam bots, and an optional `_redirect` field sends the visitor to your own thank-you page.

## Not built yet

- **Billing**: trials are tracked (14 days), but there is no payment collection. Stripe would go here.
- **Team log-ins**: team members are listed, but only the account owner can log in.
- **Password reset by email.**
