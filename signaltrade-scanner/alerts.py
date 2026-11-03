"""Send new opportunities by email (Resend) and/or text (Twilio).

Email: RESEND_API_KEY, EMAIL_FROM, ALERT_EMAIL_TO
Text:  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, ALERT_SMS_TO
"""

import os

import requests

FOOTER = "Review each listing and approve it yourself. Nothing has been bought."


def build_message(descriptions):
    count = len(descriptions)
    subject = f"SignalTrade: {count} new phone{'s' if count != 1 else ''} to review"
    body = "\n\n".join(descriptions) + "\n\n" + FOOTER
    return subject, body


def send_email(subject, body):
    key = os.environ.get("RESEND_API_KEY")
    sender = os.environ.get("EMAIL_FROM")
    to = os.environ.get("ALERT_EMAIL_TO")
    if not (key and sender and to):
        return False
    response = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {key}"},
        json={"from": sender, "to": [a.strip() for a in to.split(",")],
              "subject": subject, "text": body},
        timeout=20,
    )
    response.raise_for_status()
    return True


def send_text(descriptions):
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    sender = os.environ.get("TWILIO_FROM")
    to = os.environ.get("ALERT_SMS_TO")
    if not (sid and token and sender and to):
        return False
    # Texts get the headline of each deal; the email has the full breakdown
    headlines = [d.splitlines()[0] for d in descriptions[:5]]
    if len(descriptions) > 5:
        headlines.append(f"+{len(descriptions) - 5} more")
    response = requests.post(
        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
        auth=(sid, token),
        data={"From": sender, "To": to,
              "Body": "SignalTrade:\n" + "\n".join(headlines)},
        timeout=20,
    )
    response.raise_for_status()
    return True


def send(descriptions):
    """Returns the channels that delivered. Prints if none are set up."""
    subject, body = build_message(descriptions)
    sent = []
    if send_email(subject, body):
        sent.append("email")
    if send_text(descriptions):
        sent.append("text")
    if not sent:
        print("(No alert channel set up. Set the Resend or Twilio variables.)")
    return sent
