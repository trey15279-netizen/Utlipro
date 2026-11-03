"""Keys entered in the dashboard, saved on this computer only.

They're kept in data/keys.json (not committed to git) and loaded into the
environment when the app starts. A key already set in the real environment
wins over the saved one.
"""

import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
KEYS_PATH = Path(os.environ.get("SIGNALTRADE_KEYS", HERE / "data" / "keys.json"))

# (group, env name, label, secret?)
FIELDS = (
    ("ebay", "EBAY_APP_ID", "App ID (Client ID)", False),
    ("ebay", "EBAY_CERT_ID", "Cert ID (Client Secret)", True),
    ("email", "RESEND_API_KEY", "Resend API key", True),
    ("email", "EMAIL_FROM", "Send from", False),
    ("email", "ALERT_EMAIL_TO", "Send alerts to", False),
    ("sms", "TWILIO_ACCOUNT_SID", "Twilio Account SID", False),
    ("sms", "TWILIO_AUTH_TOKEN", "Twilio Auth Token", True),
    ("sms", "TWILIO_FROM", "Twilio phone number", False),
    ("sms", "ALERT_SMS_TO", "Text alerts to", False),
)
NAMES = {name for _, name, _, _ in FIELDS}
_from_file = set()


def load(path=None):
    try:
        with open(path or KEYS_PATH) as f:
            return {k: v for k, v in json.load(f).items() if k in NAMES and v}
    except FileNotFoundError:
        return {}


def apply(path=None):
    """Put saved keys into the environment, without overriding real ones."""
    for name, value in load(path).items():
        if name in _from_file or not os.environ.get(name):
            os.environ[name] = value
            _from_file.add(name)


def save(updates, path=None):
    """updates: {name: value}. Blank values are ignored; None removes a key."""
    path = Path(path or KEYS_PATH)
    saved = load(path)
    for name, value in updates.items():
        if name not in NAMES:
            continue
        if value is None:
            saved.pop(name, None)
            if name in _from_file:
                os.environ.pop(name, None)
                _from_file.discard(name)
        elif value.strip():
            saved[name] = value.strip()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(saved, f, indent=2)
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)
    apply(path)


def masked(name):
    value = os.environ.get(name, "")
    if not value:
        return ""
    return "•••• " + value[-4:] if len(value) > 6 else "••••"
