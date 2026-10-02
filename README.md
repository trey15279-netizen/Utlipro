# Command Hub — Landing Page

Static marketing site for Command Hub (lead alerts for roofers). No build step.

- `index.html` — page markup
- `styles.css` — styles (responsive down to phone width)
- `script.js` — interactive demo ("Submit Test Lead"), how-it-works form, testimonial slider, FAQ accordion, mobile nav

Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages, Netlify, etc.).

## Command Hub app (`app/`)

The dashboard customers use after signing up. Open `app/index.html` (or `/app/` on your live site).

- **Dashboard**: lead counts, recent activity, leads-this-week chart, quick actions
- **Leads**: inbox with status tabs, search, bulk actions, and 1-tap Call / Text
- **Lead details**: contact info, form submission, notes, text messages, activity, status (New → Contacted → Appointment → Won / Lost)
- **Instant lead alert**: phone-style alert with Call / Text (try **Test Lead**)
- **Website connection**: status, setup guide with form code, and a sample form to try
- **Settings**: company info, notification preferences, team, billing, security

Data is saved in the browser (`localStorage`) and starts with sample leads. Receiving real website leads and sending text/email alerts needs a backend (database + SMS/email service); that is the next step.
