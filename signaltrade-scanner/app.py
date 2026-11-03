"""SignalTrade Scanner dashboard.

Double-click start.command (Mac) or start.bat (Windows), or run:

    python app.py        # opens http://127.0.0.1:8000

Everything it shows comes from config.json (your buyer prices) and
data/alerted.json (scans, purchases, checks, payouts). Nothing is bought
automatically: the dashboard only records purchases you made yourself on
eBay, and only after every pre-purchase check is ticked.
"""

import os
import secrets
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from datetime import date, datetime, timedelta, timezone

import requests
from flask import (Flask, abort, flash, redirect, render_template, request,
                   send_from_directory, session, url_for)

import alerts
import keys
import scanner
import tracking

LOCK = threading.RLock()

# Where to check each buyer's price, used when no quote link is saved
BUYER_SITES = {
    "BankMyCell": "https://www.bankmycell.com/",
    "GadgetGone": "https://www.gadgetgone.com/",
    "BuyBackBoss": "https://www.buybackboss.com/",
    "ItsWorthMore": "https://www.itsworthmore.com/",
}


# ---------- Data access ----------

def load():
    with LOCK:
        return scanner.load_config(scanner.CONFIG_PATH), tracking.load_state(scanner.STATE_PATH)


def save_state(state):
    with LOCK:
        tracking.save_state(state, scanner.STATE_PATH)


def save_config(config):
    with LOCK:
        scanner.save_config(config, scanner.CONFIG_PATH)


def entry_or_404(state, item_id):
    entry = state["alerted"].get(item_id)
    if entry is None:
        abort(404)
    return entry


def money(value, sign=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return "—"
    text = f"${abs(value):,.2f}"
    if value < 0:
        return "−" + text
    return ("+" + text) if sign and value > 0 else text


def short_date(value):
    """'2026-11-02' -> 'Nov 2' (with the year if it isn't this year)."""
    if not value:
        return "—"
    day = date.fromisoformat(str(value)[:10])
    text = f"{day:%b} {day.day}"
    return text if day.year == date.today().year else f"{text}, {day.year}"


def ago(days):
    if days is None:
        return ""
    return "today" if days == 0 else ("yesterday" if days == 1 else f"{days} days ago")


def form_money(name, required=True, default=None, label=None):
    label = label or name.replace("_", " ").capitalize()
    raw = (request.form.get(name) or "").strip().replace("$", "").replace(",", "")
    if not raw:
        if required and default is None:
            raise tracking.TrackingError(f"{label} is required.")
        return default
    try:
        value = float(raw)
    except ValueError:
        raise tracking.TrackingError(f"{label} must be a number.")
    if value < 0:
        raise tracking.TrackingError("Amounts can't be negative.")
    return value


def form_date(name):
    raw = (request.form.get(name) or "").strip()
    return date.fromisoformat(raw) if raw else None


def stage_of(entry):
    return tracking.stage(entry)


# ---------- Buyer prices ----------

def quote_rows(phone, settings, today, price=None, inbound=None):
    """Every buyer for a phone, with its status and (given a price) est. profit."""
    rows = []
    max_age = settings["quote_max_age_days"]
    for qi, quote in enumerate(phone.get("buyer_quotes", [])):
        row = {"buyer": quote["buyer"], "quote": quote, "index": qi, "age": None,
               "net": None, "status": "ok", "note": "",
               "site": quote.get("quote_url") or BUYER_SITES.get(quote["buyer"], "")}
        if quote.get("payout") is None:
            row.update(status="missing", note="No price entered")
        else:
            mismatch = scanner.spec_mismatch(phone, quote)
            if mismatch:
                row.update(status="mismatch", note="Was for a different phone. Check again.")
            elif not quote.get("quoted_on"):
                row.update(status="expired", note="No date. Check again.")
            else:
                age = (today - date.fromisoformat(quote["quoted_on"])).days
                row["age"] = age
                if age > max_age:
                    row.update(status="expired", note=f"Checked {age} days ago. Check again.")
                else:
                    row["note"] = f"Checked {ago(age)}"
        if row["status"] == "ok" and price is not None:
            row["net"] = scanner.net_profit(price, inbound, quote, settings)["net_profit"]
        rows.append(row)

    usable = sorted((r for r in rows if r["net"] is not None), key=lambda r: r["net"], reverse=True)
    bar = scanner.required_profit(settings)
    for i, row in enumerate(usable):
        if row["net"] < bar:
            row["status"] = "below"
        elif i == 0:
            row["status"] = "best"
    if price is not None:
        order = {"best": 0, "ok": 1, "below": 2, "expired": 3, "mismatch": 4, "missing": 5}
        rows.sort(key=lambda r: (order[r["status"]], -(r["net"] or 0)))
    return rows


def phone_for(config, entry):
    for phone in config["phones"]:
        if phone["name"] == entry.get("phone"):
            return phone
    return None


def prices_needing_check(config, today):
    return sum(1 for phone in config["phones"]
               for row in quote_rows(phone, config["settings"], today)
               if row["status"] in ("expired", "mismatch"))


def has_usable_price(config, today):
    return any(row["status"] == "ok"
               for phone in config["phones"]
               for row in quote_rows(phone, config["settings"], today))


# ---------- Scheduler ----------

def next_scan_time(settings, now_local):
    if not settings.get("auto_scan") or not settings.get("scan_hours"):
        return None
    hours = sorted(int(h) for h in settings["scan_hours"])
    for day_offset in range(2):
        day = now_local.date() + timedelta(days=day_offset)
        for hour in hours:
            slot = datetime.combine(day, datetime.min.time()).replace(hour=hour)
            if slot > now_local:
                return slot
    return None


def next_label(when):
    if when is None:
        return None
    day = "Today" if when.date() == date.today() else "Tomorrow"
    return f"{day} {when.strftime('%-I:%M %p')}"


def scan_now(send_alerts=True):
    with LOCK:
        config, state = load()
        try:
            return scanner.run_scan(config, state, send_alerts=send_alerts), None
        except (scanner.ScanError, requests.RequestException) as error:
            return None, str(error)
        finally:
            save_state(state)


def scheduler_loop(poll_seconds=30):
    done_slots = set()
    while True:
        try:
            config, state = load()
            settings = config["settings"]
            now = datetime.now()
            slot = (now.date(), now.hour)
            if (settings.get("auto_scan") and now.hour in [int(h) for h in settings["scan_hours"]]
                    and slot not in done_slots):
                last = state.get("last_scan", {}).get("at")
                last_local = datetime.fromisoformat(last).astimezone() if last else None
                if not (last_local and (last_local.date(), last_local.hour) == slot):
                    scan_now()
                done_slots.add(slot)
        except Exception as error:  # keep the scheduler alive
            print(f"Scheduled scan error: {error}")
        time.sleep(poll_seconds)


# ---------- To-do list ----------

def todo_list(config, state):
    """What needs doing now, most urgent first."""
    todos = []
    entries = state["alerted"]
    for item_id, e in sorted(entries.items(), key=lambda r: r[1]["surfaced_at"]):
        stage = stage_of(e)
        name = e["phone"]
        if stage == "purchased":
            todos.append({"kind": "phone", "text": f"Check the {name} when it arrives",
                          "detail": f"Bought {short_date(e['purchase']['date'])}",
                          "action": "Record check", "url": url_for("item", item_id=item_id)})
        elif stage == "inspected" and e["inspection"]["passed"]:
            todos.append({"kind": "phone", "text": f"Send the {name} to {e['buyer']}",
                          "detail": "Passed your check",
                          "action": "Mark as sent", "url": url_for("item", item_id=item_id)})
        elif stage == "inspected":
            todos.append({"kind": "warn", "text": f"Decide what to do with the {name}",
                          "detail": "Failed your check" + (f": {e['inspection']['notes']}"
                                                           if e["inspection"]["notes"] else ""),
                          "action": "Open", "url": url_for("item", item_id=item_id)})
        elif stage == "sent":
            todos.append({"kind": "wait", "text": f"Record payment from {e['sent']['buyer']}",
                          "detail": f"{name}, sent {short_date(e['sent']['date'])}, "
                                    f"expecting {money(e['sent']['expected_payout'])}",
                          "action": "Record payment", "url": url_for("item", item_id=item_id)})

    open_deals = [e for e in entries.values() if stage_of(e) == "open"]
    if open_deals:
        todos.insert(0, {"kind": "deal",
                         "text": f"Review {len(open_deals)} deal{'s' if len(open_deals) != 1 else ''}",
                         "detail": f"Best: {money(max(e['estimated_profit'] for e in open_deals))} est. profit",
                         "action": "See deals", "url": url_for("opportunities")})
    stale = prices_needing_check(config, date.today())
    if stale:
        todos.insert(0, {"kind": "warn",
                         "text": f"Re-check {stale} buyer price{'s' if stale != 1 else ''}",
                         "detail": "Old prices aren't used, so some phones aren't being scanned",
                         "action": "Update prices", "url": url_for("prices")})
    return todos


def setup_steps(config, state):
    last = state.get("last_scan") or {}
    ebay = bool(os.environ.get("EBAY_ACCESS_TOKEN")
                or (os.environ.get("EBAY_APP_ID") and os.environ.get("EBAY_CERT_ID")))
    steps = [
        {"done": ebay, "text": "Connect your eBay developer keys",
         "action": "Connect", "url": url_for("settings_page") + "#connections"},
        {"done": has_usable_price(config, date.today()), "text": "Enter today's prices from the buyers",
         "action": "Enter prices", "url": url_for("prices")},
        {"done": bool(last.get("ok")), "text": "Run your first scan", "action": None, "url": None},
        {"done": alerts_ready()["email"] or alerts_ready()["sms"],
         "text": "Optional: get deals by email or text",
         "action": "Set up", "url": url_for("settings_page") + "#connections"},
    ]
    return steps


def alerts_ready():
    return {
        "email": all(os.environ.get(k) for k in ("RESEND_API_KEY", "EMAIL_FROM", "ALERT_EMAIL_TO")),
        "sms": all(os.environ.get(k) for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
                                               "TWILIO_FROM", "ALERT_SMS_TO")),
    }


# ---------- App ----------

def create_app(start_scheduler=False):
    keys.apply()
    app = Flask(__name__)
    app.secret_key = os.environ.get("SIGNALTRADE_SECRET") or secrets.token_hex(32)
    app.jinja_env.filters["money"] = money
    app.jinja_env.filters["short"] = short_date
    app.jinja_env.globals["CHECKLIST"] = tracking.CHECKLIST
    app.jinja_env.globals["IMEI_RESULTS"] = tracking.IMEI_RESULTS
    app.jinja_env.globals["KEY_FIELDS"] = keys.FIELDS
    app.jinja_env.globals["masked"] = keys.masked

    def csrf_token():
        if "csrf" not in session:
            session["csrf"] = secrets.token_hex(16)
        return session["csrf"]

    app.jinja_env.globals["csrf_token"] = csrf_token

    @app.before_request
    def check_csrf():
        if request.method == "POST" and not app.config.get("TESTING_NO_CSRF"):
            token = session.get("csrf")
            if not token or request.form.get("csrf") != token:
                abort(400, "This form expired. Go back, reload the page and try again.")

    @app.context_processor
    def system_status():
        config, state = load()
        settings = config["settings"]
        last = state.get("last_scan")
        ready = alerts_ready()
        return {
            "nav": request.endpoint,
            "status": {
                "last_scan": last,
                "last_at": datetime.fromisoformat(last["at"]).astimezone() if last else None,
                "next_label": next_label(next_scan_time(settings, datetime.now())),
                "ebay_keys": bool(os.environ.get("EBAY_ACCESS_TOKEN")
                                  or (os.environ.get("EBAY_APP_ID") and os.environ.get("EBAY_CERT_ID"))),
                "email": ready["email"],
                "sms": ready["sms"],
                "stale_prices": prices_needing_check(config, date.today()),
                "open_count": sum(1 for e in state["alerted"].values() if stage_of(e) == "open"),
                "phone_count": sum(1 for e in state["alerted"].values()
                                   if stage_of(e) in ("purchased", "inspected", "sent")),
            },
        }

    def items(state, *stages):
        return [(item_id, e) for item_id, e in state["alerted"].items() if stage_of(e) in stages]

    def comparison_for(config, entry):
        phone = phone_for(config, entry)
        b = entry.get("breakdown")
        if not phone or not b:
            return None
        return quote_rows(phone, config["settings"], date.today(),
                          price=b["price"], inbound=b["inbound_shipping"])

    def chart(m):
        values = m["realized_cumulative"] + m["estimated_cumulative"]
        top = max(values + [100])
        step = 10 ** max(len(str(int(top))) - 1, 1)
        top = (int(top / step) + 1) * step

        def points(series):
            n = len(series)
            return " ".join(f"{(i * 320 / (n - 1)):.1f},{(115 - v / top * 110):.1f}"
                            for i, v in enumerate(series))

        peak = max(m["weekly_opportunities"] + [m["weekly_target"], 1])
        return {
            "top": top,
            "realized": points(m["realized_cumulative"]),
            "estimated": points(m["estimated_cumulative"]),
            "bars": [{"label": w, "count": c, "height": round(40 * c / peak),
                      "met": c >= m["weekly_target"]}
                     for w, c in zip(m["weeks"], m["weekly_opportunities"])],
            "target_y": round(40 * m["weekly_target"] / peak),
        }

    # ----- Home -----

    @app.get("/")
    def overview():
        config, state = load()
        settings = config["settings"]
        m = tracking.metrics(state, settings["weekly_target"])
        steps = setup_steps(config, state)
        deals = items(state, "open")
        deals.sort(key=lambda r: r[1]["estimated_profit"], reverse=True)
        return render_template("overview.html", m=m, settings=settings, steps=steps,
                               setup_done=all(s["done"] for s in steps[:3]),
                               todos=todo_list(config, state), deals=deals[:5],
                               chart=chart(m))

    # ----- Scan -----

    @app.route("/scan", methods=["GET", "POST"])
    def scan_page():
        if request.method == "POST":
            result, error = scan_now(send_alerts=request.form.get("alerts") != "off")
            if error:
                flash(f"The scan didn't run: {error}", "error")
            else:
                deals, warnings, fresh, sent_by = result
                if fresh:
                    msg = f"Found {len(fresh)} new deal{'s' if len(fresh) != 1 else ''}."
                elif deals:
                    msg = "No new deals. The ones already on your list are still available."
                else:
                    msg = "Scan finished. No deals clear your profit target right now."
                if sent_by:
                    msg += f" Alert sent by {' and '.join(sent_by)}."
                flash(msg, "ok")
            return redirect(request.form.get("next") or url_for("scan_page"))
        config, state = load()
        settings = config["settings"]
        phones = [{"phone": p, "rows": quote_rows(p, settings, date.today())}
                  for p in config["phones"]]
        current = state.get("last_scan", {}).get("current", [])
        found = [(i, state["alerted"][i]) for i in current if i in state["alerted"]]
        return render_template("scan.html", phones=phones, settings=settings, found=found,
                               bar=scanner.required_profit(settings), stage_of=stage_of)

    # ----- Deals -----

    @app.get("/deals")
    def opportunities():
        config, state = load()
        show = request.args.get("show", "open")
        stages = {"open": ("open",), "dismissed": ("dismissed",),
                  "all": ("open", "dismissed", "purchased", "inspected", "sent", "paid")}.get(
            show, ("open",))
        rows = items(state, *stages)
        rows.sort(key=lambda r: (r[1]["estimated_profit"] if show == "open" else r[1]["surfaced_at"]),
                  reverse=True)
        return render_template("opportunities.html", rows=rows, show=show,
                               settings=config["settings"], stage_of=stage_of)

    @app.get("/deals/<path:item_id>")
    def item(item_id):
        config, state = load()
        entry = entry_or_404(state, item_id)
        stage = stage_of(entry)
        comparison = comparison_for(config, entry)
        best_now = next((r for r in comparison or [] if r["status"] == "best"), None)
        return render_template(
            "item.html", item_id=item_id, e=entry, stage=stage, comparison=comparison,
            best_now=best_now, settings=config["settings"],
            complete=tracking.checklist_complete(entry),
            actual=tracking.actual_profit(entry), reduced=tracking.payout_reduced(entry),
            today=date.today().isoformat())

    def mutate(item_id, fn, ok_message):
        with LOCK:
            _, state = load()
            entry_or_404(state, item_id)
            try:
                result = fn(state)
            except tracking.TrackingError as error:
                flash(str(error), "error")
            else:
                save_state(state)
                if ok_message:
                    flash(ok_message, "ok")
                if result:
                    return result
        return redirect(url_for("item", item_id=item_id))

    @app.post("/deals/<path:item_id>/checklist")
    def checklist(item_id):
        ticked = set(request.form.getlist("check"))
        return mutate(item_id, lambda s: tracking.record_checklist(s, item_id, ticked),
                      "Checks saved.")

    @app.post("/deals/<path:item_id>/dismiss")
    def dismiss(item_id):
        undo = request.form.get("undo") == "1"
        return mutate(item_id, lambda s: tracking.dismiss(s, item_id, not undo),
                      "Deal is back on your list." if undo else "Deal hidden.")

    @app.post("/deals/<path:item_id>/bought")
    def bought(item_id):
        """Saves the checks, and records the purchase if they're all ticked."""
        def apply(state):
            ticked = set(request.form.getlist("check"))
            tracking.record_checklist(state, item_id, ticked)
            if not tracking.checklist_complete(state["alerted"][item_id]):
                missing = len(tracking.CHECKLIST) - len(ticked & {k for k, _, _ in tracking.CHECKLIST})
                save_state(state)
                raise tracking.TrackingError(
                    f"Checks saved. Tick the last {missing} check{'s' if missing != 1 else ''} "
                    "before recording a purchase.")
            last4 = (request.form.get("imei_last4") or "").strip() or None
            tracking.record_purchase(
                state, item_id, form_money("price", label="Price"),
                form_money("shipping", label="Shipping"),
                form_money("tax", label="Tax from your receipt"),
                request.form.get("imei_result") or "clean", last4, on=form_date("date"))
        return mutate(item_id, apply, "Purchase saved. Next: check the phone when it arrives.")

    @app.post("/deals/<path:item_id>/inspected")
    def inspected(item_id):
        passed = request.form.get("result") == "pass"
        return mutate(item_id, lambda s: tracking.record_inspection(
            s, item_id, passed, (request.form.get("notes") or "").strip(), on=form_date("date")),
            "Saved. Next: send it to the buyer." if passed else "Saved as failed.")

    @app.post("/deals/<path:item_id>/sent")
    def sent(item_id):
        def apply(state):
            buyer = (request.form.get("buyer") or "").strip() or None
            tracking.record_sent(state, item_id, buyer, form_money("shipping", default=0),
                                 form_money("other_costs", default=0),
                                 form_money("expected_payout", required=False),
                                 on=form_date("date"))
        return mutate(item_id, apply, "Marked as sent. Next: record the payment when it arrives.")

    @app.post("/deals/<path:item_id>/paid")
    def paid(item_id):
        return mutate(item_id, lambda s: tracking.record_payout(
            s, item_id, form_money("received", label="Amount received"), on=form_date("date")),
            "Payment saved. This phone is done.")

    # ----- My phones, results -----

    @app.get("/phones")
    def inventory():
        _, state = load()
        show = request.args.get("show", "active")
        stages = {"active": ("purchased", "inspected", "sent"), "done": ("paid",),
                  "all": ("purchased", "inspected", "sent", "paid")}.get(show, ("purchased", "inspected", "sent"))
        rows = items(state, *stages)
        rows.sort(key=lambda r: r[1]["purchase"]["date"], reverse=True)
        return render_template("inventory.html", rows=rows, show=show, stage_of=stage_of)

    @app.get("/results")
    def reports():
        config, state = load()
        m = tracking.metrics(state, config["settings"]["weekly_target"])
        return render_template("reports.html", m=m, chart=chart(m))

    # ----- Buyer prices -----

    @app.get("/prices")
    def prices():
        config, _ = load()
        phones = [{"index": i, "phone": p,
                   "rows": quote_rows(p, config["settings"], date.today())}
                  for i, p in enumerate(config["phones"])]
        return render_template("prices.html", phones=phones, settings=config["settings"],
                               today=date.today().isoformat())

    def edit_config(fn, message, back=None):
        with LOCK:
            config, _ = load()
            try:
                fn(config)
            except (tracking.TrackingError, ValueError, IndexError) as error:
                flash(str(error) or "That value isn't valid.", "error")
            else:
                save_config(config)
                flash(message, "ok")
        return redirect(back or request.form.get("next") or url_for("settings_page"))

    @app.post("/prices/<int:index>")
    def save_quote(index):
        back = url_for("prices") + f"#phone-{index}"

        def apply(config):
            phone = config["phones"][index]
            qi = request.form.get("quote_index")
            if request.form.get("delete") == "1":
                phone["buyer_quotes"].pop(int(qi))
                return
            if qi in (None, ""):
                name = (request.form.get("buyer") or "").strip()
                if not name:
                    raise ValueError("Type the buyer's name.")
                phone["buyer_quotes"].append({"buyer": name, "payout": None})
                return
            quote = phone["buyer_quotes"][int(qi)]
            payout = form_money("payout", required=False, label="Price")
            for field in ("outbound_shipping", "payout_fee", "grading_deduction"):
                if field in request.form:
                    quote[field] = form_money(field, default=0)
            if "quote_url" in request.form:
                quote["quote_url"] = (request.form.get("quote_url") or "").strip()
            if payout is None:
                quote["payout"] = None
                return
            if request.form.get("checked_today") != "on":
                raise ValueError(f"Tick the box to confirm you just checked {quote['buyer']}'s price "
                                 f"for {phone['name']}.")
            quoted_on = form_date("quoted_on") or date.today()
            if quoted_on > date.today():
                raise ValueError("The date can't be in the future.")
            quote["payout"] = payout
            quote["quoted_on"] = quoted_on.isoformat()
            for field in scanner.QUOTE_SPEC:
                quote[field] = phone[field]
        return edit_config(apply, "Price saved.", back=back)

    # ----- Settings -----

    @app.get("/settings")
    def settings_page():
        config, _ = load()
        return render_template("settings.html", settings=config["settings"],
                               phones=list(enumerate(config["phones"])))

    @app.post("/settings/general")
    def settings_general():
        def apply(config):
            s = config["settings"]
            s["minimum_net_profit"] = form_money("minimum_net_profit", label="Minimum profit")
            s["profit_buffer"] = form_money("profit_buffer", label="Safety buffer")
            s["sales_tax_rate"] = form_money("sales_tax_percent", label="Sales tax") / 100
            s["unknown_shipping_estimate"] = form_money("unknown_shipping_estimate", label="Shipping guess")
            s["quote_max_age_days"] = int(request.form["quote_max_age_days"])
            s["min_seller_feedback_percent"] = float(request.form["min_seller_feedback_percent"])
            s["min_seller_feedback_score"] = int(request.form["min_seller_feedback_score"])
            s["weekly_target"] = int(request.form["weekly_target"])
            s["auto_scan"] = request.form.get("auto_scan") == "on"
            hours = [int(h) for h in request.form.get("scan_hours", "").replace(" ", "").split(",") if h]
            if any(h < 0 or h > 23 for h in hours):
                raise ValueError("Scan times must be hours from 0 to 23.")
            s["scan_hours"] = hours
        return edit_config(apply, "Settings saved.")

    def phone_fields(phone):
        for field in ("model", "storage", "carrier", "condition"):
            value = (request.form.get(field) or "").strip()
            if not value:
                raise ValueError(f"{field.capitalize()} is required.")
            phone[field] = value
        phone["name"] = f"{phone['model']} {phone['storage']} {phone['carrier']}, {phone['condition']}"
        phone["query"] = (request.form.get("query") or "").strip() or \
            f"{phone['model']} {phone['storage']} {phone['carrier']}"
        words = lambda key: [w.strip() for w in (request.form.get(key) or "").split(",") if w.strip()]
        required = words("required_words")
        phone["required_words"] = required or [phone["model"].lower(),
                                               phone["storage"].lower().replace("gb", ""),
                                               phone["carrier"].lower()]
        phone["excluded_words"] = words("excluded_words")
        phone["ebay_condition_ids"] = request.form.getlist("ebay_condition_ids") or ["3000"]

    @app.post("/settings/phones")
    def add_phone():
        def apply(config):
            phone = {}
            phone_fields(phone)
            phone["buyer_quotes"] = [{"buyer": b, "payout": None} for b in BUYER_SITES]
            config["phones"].append(phone)
        return edit_config(apply, "Phone added. Now enter today's buyer prices for it.",
                           back=url_for("prices"))

    @app.post("/settings/phones/<int:index>")
    def edit_phone(index):
        def apply(config):
            if request.form.get("delete") == "1":
                config["phones"].pop(index)
            else:
                phone_fields(config["phones"][index])
        return edit_config(apply, "Phone saved.")

    @app.post("/settings/keys")
    def save_keys():
        updates = {name: request.form.get(name, "") for name in keys.NAMES}
        for name in request.form.getlist("clear"):
            updates[name] = None
        keys.save(updates)
        flash("Saved.", "ok")
        return redirect(url_for("settings_page") + "#connections")

    @app.post("/settings/test-ebay")
    def test_ebay():
        try:
            if not os.environ.get("EBAY_ACCESS_TOKEN"):
                scanner.get_access_token()
            flash("eBay connected.", "ok")
        except scanner.ScanError as error:
            flash(str(error), "error")
        except requests.RequestException as error:
            flash(f"eBay didn't accept those keys: {error}", "error")
        return redirect(url_for("settings_page") + "#connections")

    @app.post("/settings/test-alert")
    def test_alert():
        try:
            sent_by = alerts.send(["SignalTrade test alert. If you can read this, alerts work."])
        except requests.RequestException as error:
            flash(f"The alert didn't send: {error}", "error")
        else:
            if sent_by:
                flash(f"Test alert sent by {' and '.join(sent_by)}.", "ok")
            else:
                flash("Fill in the email or text settings first.", "error")
        return redirect(url_for("settings_page") + "#connections")

    # ----- App shell -----

    @app.get("/manifest.webmanifest")
    def manifest():
        return app.response_class(
            '{"name":"SignalTrade","short_name":"SignalTrade","start_url":"/","scope":"/",'
            '"display":"standalone","background_color":"#0E0F11","theme_color":"#0E0F11",'
            '"icons":[{"src":"/static/icons/icon-192.png","sizes":"192x192","type":"image/png"},'
            '{"src":"/static/icons/icon-512.png","sizes":"512x512","type":"image/png"},'
            '{"src":"/static/icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]}',
            mimetype="application/manifest+json")

    @app.get("/sw.js")
    def service_worker():
        # Lets the browser install SignalTrade as an app. It caches nothing:
        # every page always shows your latest data.
        return app.response_class(
            "self.addEventListener('install',()=>self.skipWaiting());"
            "self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));"
            "self.addEventListener('fetch',()=>{});",
            mimetype="text/javascript", headers={"Cache-Control": "no-cache"})

    @app.get("/favicon.ico")
    def favicon():
        return send_from_directory(os.path.join(app.root_path, "static", "icons"), "signaltrade.ico")

    @app.post("/quit")
    def quit_app():
        threading.Timer(0.5, lambda: os._exit(0)).start()
        return render_template("quit.html")

    # Old addresses
    app.add_url_rule("/opportunities", "old_opps", lambda: redirect(url_for("opportunities")))
    app.add_url_rule("/inventory", "old_inv", lambda: redirect(url_for("inventory")))
    app.add_url_rule("/transactions", "transactions",
                     lambda: redirect(url_for("inventory", show="done")))
    app.add_url_rule("/reports", "old_reports", lambda: redirect(url_for("reports")))

    if start_scheduler:
        threading.Thread(target=scheduler_loop, daemon=True).start()
    return app


APP_DIR = os.path.dirname(os.path.abspath(__file__))


def browser_candidates():
    """Chromium-based browsers that can open a page as its own app window."""
    if sys.platform == "darwin":
        return [f"/Applications/{name}.app/Contents/MacOS/{name}" for name in
                ("Google Chrome", "Microsoft Edge", "Brave Browser", "Chromium", "Arc")]
    if sys.platform.startswith("win"):
        roots = [os.environ.get(k, "") for k in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA")]
        tails = (r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe",
                 r"BraveSoftware\Brave-Browser\Application\brave.exe")
        return [os.path.join(r, t) for t in tails for r in roots if r]
    return [shutil.which(n) or "" for n in
            ("google-chrome", "google-chrome-stable", "microsoft-edge", "chromium", "chromium-browser", "brave-browser")]


def open_app_window(address):
    """Open SignalTrade in its own window (no tabs or address bar), like a desktop app.

    Uses its own browser profile so it gets its own window and Dock/taskbar icon.
    Falls back to a normal browser tab if no Chromium-based browser is installed.
    """
    profile = os.path.join(APP_DIR, "data", "app-window")
    for path in browser_candidates():
        if path and os.path.exists(path):
            try:
                subprocess.Popen(
                    [path, f"--app={address}", f"--user-data-dir={profile}",
                     "--window-size=1440,900", "--no-first-run", "--no-default-browser-check"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return
            except OSError:
                continue
    webbrowser.open(address)


def log_to_file_if_windowless():
    """pythonw (Windows) and the Mac app have no console; keep output in a log."""
    if sys.stdout is None or sys.stderr is None:
        os.makedirs(os.path.join(APP_DIR, "data"), exist_ok=True)
        log = open(os.path.join(APP_DIR, "data", "signaltrade.log"), "a", buffering=1)
        sys.stdout = sys.stdout or log
        sys.stderr = sys.stderr or log


def already_running(host, port):
    import socket
    with socket.socket() as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    address = f"http://{host}:{port}"
    log_to_file_if_windowless()
    if already_running(host, port):
        print(f"SignalTrade is already running. Opening {address}")
        open_app_window(address)
        raise SystemExit(0)
    print(f"\n  SignalTrade is running at {address}\n  Use Quit in the app to stop it.\n")
    if not os.environ.get("NO_BROWSER"):
        threading.Timer(1.2, lambda: open_app_window(address)).start()
    create_app(start_scheduler=True).run(host=host, port=port, debug=False)
