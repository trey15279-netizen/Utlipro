"""SignalTrade Scanner dashboard.

    pip install -r requirements.txt
    python app.py                 # http://127.0.0.1:8000

Everything it shows comes from config.json (your buyer quotes) and
data/alerted.json (scans, purchases, inspections, payouts). Nothing is
bought automatically: the dashboard only records purchases you made yourself
on eBay, and only after the pre-purchase checklist is complete.
"""

import os
import secrets
import threading
import time
from datetime import date, datetime, timedelta, timezone

import requests
from flask import (Flask, abort, flash, redirect, render_template, request,
                   session, url_for)

import scanner
import tracking

LOCK = threading.RLock()


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


def form_money(name, required=True, default=None):
    raw = (request.form.get(name) or "").strip().replace("$", "").replace(",", "")
    if not raw:
        if required and default is None:
            raise tracking.TrackingError(f"{name.replace('_', ' ').capitalize()} is required.")
        return default
    try:
        value = float(raw)
    except ValueError:
        raise tracking.TrackingError(f"{name.replace('_', ' ').capitalize()} must be a number.")
    if value < 0:
        raise tracking.TrackingError("Amounts can't be negative.")
    return value


def form_date(name):
    raw = (request.form.get(name) or "").strip()
    return date.fromisoformat(raw) if raw else None


# ---------- Quote status ----------

def quote_rows(phone, settings, today, price=None, inbound=None):
    """Every buyer for a phone, with its status and (given a price) est. net."""
    rows = []
    max_age = settings["quote_max_age_days"]
    for quote in phone.get("buyer_quotes", []):
        row = {"buyer": quote["buyer"], "quote": quote, "age": None, "net": None,
               "status": "ok", "note": ""}
        if quote.get("payout") is None:
            row.update(status="missing", note="No quote entered")
        else:
            mismatch = scanner.spec_mismatch(phone, quote)
            if mismatch:
                row.update(status="mismatch", note=mismatch.capitalize())
            elif not quote.get("quoted_on"):
                row.update(status="expired", note="No quote date")
            else:
                age = (today - date.fromisoformat(quote["quoted_on"])).days
                row["age"] = age
                if age > max_age:
                    row.update(status="expired", note=f"{age} days old, re-verify")
        if row["status"] == "ok" and price is not None:
            row["net"] = scanner.net_profit(price, inbound, quote, settings)["net_profit"]
        rows.append(row)

    usable = [r for r in rows if r["net"] is not None]
    usable.sort(key=lambda r: r["net"], reverse=True)
    bar = scanner.required_profit(settings)
    for i, row in enumerate(usable):
        if row["net"] < bar:
            row["status"], row["note"] = "below", f"Below ${bar:g} bar"
        elif i == 0:
            row["status"], row["note"] = "best", "Best exit"
    order = {"best": 0, "ok": 1, "below": 2, "expired": 3, "mismatch": 4, "missing": 5}
    rows.sort(key=lambda r: (order[r["status"]], -(r["net"] or 0)))
    return rows


def phone_for(config, entry):
    for phone in config["phones"]:
        if phone["name"] == entry.get("phone"):
            return phone
    return None


def quotes_needing_attention(config, today):
    stale = 0
    for phone in config["phones"]:
        for row in quote_rows(phone, config["settings"], today):
            if row["status"] in ("expired", "mismatch"):
                stale += 1
    return stale


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
                already = last_local and (last_local.date(), last_local.hour) == slot
                if not already:
                    scan_now()
                done_slots.add(slot)
        except Exception as error:  # keep the scheduler alive
            print(f"Scheduled scan error: {error}")
        time.sleep(poll_seconds)


# ---------- App ----------

def create_app(start_scheduler=False):
    app = Flask(__name__)
    app.secret_key = os.environ.get("SIGNALTRADE_SECRET") or secrets.token_hex(32)
    app.jinja_env.filters["money"] = money
    app.jinja_env.filters["short"] = short_date
    app.jinja_env.globals["CHECKLIST"] = tracking.CHECKLIST
    app.jinja_env.globals["IMEI_RESULTS"] = tracking.IMEI_RESULTS

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
                abort(400, "Form expired. Reload the page and try again.")

    @app.context_processor
    def system_status():
        config, state = load()
        settings = config["settings"]
        last = state.get("last_scan")
        last_at = datetime.fromisoformat(last["at"]).astimezone() if last else None
        nxt = next_scan_time(settings, datetime.now())
        return {
            "nav": request.endpoint,
            "status": {
                "last_scan": last,
                "last_at": last_at,
                "next_at": nxt,
                "ebay_keys": bool(os.environ.get("EBAY_ACCESS_TOKEN")
                                  or (os.environ.get("EBAY_APP_ID") and os.environ.get("EBAY_CERT_ID"))),
                "email": all(os.environ.get(k) for k in ("RESEND_API_KEY", "EMAIL_FROM", "ALERT_EMAIL_TO")),
                "sms": all(os.environ.get(k) for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
                                                       "TWILIO_FROM", "ALERT_SMS_TO")),
                "stale_quotes": quotes_needing_attention(config, date.today()),
                "open_count": sum(1 for e in state["alerted"].values() if tracking.stage(e) == "open"),
                "inventory_count": sum(1 for e in state["alerted"].values()
                                       if tracking.stage(e) in ("purchased", "inspected", "sent")),
            },
        }

    def items(state, *stages):
        rows = [(item_id, e) for item_id, e in state["alerted"].items()
                if tracking.stage(e) in stages]
        return rows

    # ----- Overview -----

    @app.get("/")
    def overview():
        config, state = load()
        settings = config["settings"]
        m = tracking.metrics(state, settings["weekly_target"])
        current = set(state.get("last_scan", {}).get("current", []))
        open_items = items(state, "open")
        open_items.sort(key=lambda r: (r[0] in current, r[1]["estimated_profit"]), reverse=True)
        featured = open_items[0] if open_items else None
        comparison = None
        if featured:
            comparison = comparison_for(config, featured[1])
        inventory = items(state, "purchased", "inspected", "sent", "paid")
        inventory.sort(key=lambda r: r[1]["purchase"]["date"], reverse=True)
        return render_template("overview.html", m=m, settings=settings, featured=featured,
                               comparison=comparison, inventory=inventory[:8],
                               chart=chart(m), has_data=bool(state["alerted"]))

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
            return " ".join(
                f"{(i * 320 / (n - 1)):.1f},{(115 - v / top * 110):.1f}"
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

    # ----- Scan -----

    @app.route("/scan", methods=["GET", "POST"])
    def scan_page():
        if request.method == "POST":
            result, error = scan_now(send_alerts=request.form.get("alerts") == "on")
            if error:
                flash(f"Scan failed: {error}", "error")
            else:
                deals, warnings, fresh, sent_by = result
                msg = f"Scan finished: {len(deals)} listings clear the bar, {len(fresh)} new."
                if sent_by:
                    msg += f" Alert sent by {', '.join(sent_by)}."
                flash(msg, "ok")
            return redirect(request.form.get("next") or url_for("scan_page"))
        config, state = load()
        settings = config["settings"]
        phones = [{"phone": p, "rows": quote_rows(p, settings, date.today())}
                  for p in config["phones"]]
        current = state.get("last_scan", {}).get("current", [])
        found = [(i, state["alerted"][i]) for i in current if i in state["alerted"]]
        return render_template("scan.html", phones=phones, settings=settings,
                               found=found, bar=scanner.required_profit(settings))

    # ----- Opportunities -----

    @app.get("/opportunities")
    def opportunities():
        config, state = load()
        show = request.args.get("show", "open")
        stages = {"open": ("open",), "dismissed": ("dismissed",),
                  "all": ("open", "dismissed", "purchased", "inspected", "sent", "paid")}[
            show if show in ("open", "dismissed", "all") else "open"]
        rows = items(state, *stages)
        rows.sort(key=lambda r: r[1]["surfaced_at"], reverse=True)
        current = set(state.get("last_scan", {}).get("current", []))
        return render_template("opportunities.html", rows=rows, show=show, current=current,
                               settings=config["settings"])

    @app.get("/items/<path:item_id>")
    def item(item_id):
        config, state = load()
        entry = entry_or_404(state, item_id)
        return render_template(
            "item.html", item_id=item_id, e=entry, stage=tracking.stage(entry),
            comparison=comparison_for(config, entry), settings=config["settings"],
            complete=tracking.checklist_complete(entry),
            actual=tracking.actual_profit(entry), reduced=tracking.payout_reduced(entry),
            today=date.today().isoformat())

    def mutate(item_id, fn, ok_message):
        with LOCK:
            _, state = load()
            entry_or_404(state, item_id)
            try:
                fn(state)
            except tracking.TrackingError as error:
                flash(str(error), "error")
            else:
                save_state(state)
                flash(ok_message, "ok")
        return redirect(url_for("item", item_id=item_id))

    @app.post("/items/<path:item_id>/checklist")
    def checklist(item_id):
        ticked = set(request.form.getlist("check"))
        return mutate(item_id, lambda s: tracking.record_checklist(s, item_id, ticked),
                      "Checklist saved.")

    @app.post("/items/<path:item_id>/dismiss")
    def dismiss(item_id):
        undo = request.form.get("undo") == "1"
        return mutate(item_id, lambda s: tracking.dismiss(s, item_id, not undo),
                      "Restored." if undo else "Dismissed.")

    @app.post("/items/<path:item_id>/bought")
    def bought(item_id):
        def apply(state):
            entry = state["alerted"][item_id]
            if not tracking.checklist_complete(entry):
                raise tracking.TrackingError("Complete every pre-purchase check first.")
            last4 = (request.form.get("imei_last4") or "").strip() or None
            tracking.record_purchase(
                state, item_id, form_money("price"), form_money("shipping"),
                form_money("tax"), request.form.get("imei_result"), last4,
                on=form_date("date"))
        return mutate(item_id, apply, "Purchase recorded.")

    @app.post("/items/<path:item_id>/inspected")
    def inspected(item_id):
        return mutate(item_id, lambda s: tracking.record_inspection(
            s, item_id, request.form.get("result") == "pass",
            (request.form.get("notes") or "").strip(), on=form_date("date")),
            "Inspection recorded.")

    @app.post("/items/<path:item_id>/sent")
    def sent(item_id):
        def apply(state):
            buyer = (request.form.get("buyer") or "").strip() or None
            expected = form_money("expected_payout", required=False)
            tracking.record_sent(state, item_id, buyer, form_money("shipping", default=0),
                                 form_money("other_costs", default=0), expected,
                                 on=form_date("date"))
        return mutate(item_id, apply, "Marked as sent to buyer.")

    @app.post("/items/<path:item_id>/paid")
    def paid(item_id):
        return mutate(item_id, lambda s: tracking.record_payout(
            s, item_id, form_money("received"), on=form_date("date")),
            "Payout recorded.")

    # ----- Inventory, transactions, reports -----

    @app.get("/inventory")
    def inventory():
        config, state = load()
        rows = items(state, "purchased", "inspected", "sent")
        rows.sort(key=lambda r: r[1]["purchase"]["date"], reverse=True)
        return render_template("inventory.html", rows=rows)

    @app.get("/transactions")
    def transactions():
        config, state = load()
        rows = items(state, "purchased", "inspected", "sent", "paid")
        rows.sort(key=lambda r: r[1]["purchase"]["date"], reverse=True)
        return render_template("transactions.html", rows=rows,
                               actual=tracking.actual_profit,
                               reduced=tracking.payout_reduced)

    @app.get("/reports")
    def reports():
        config, state = load()
        m = tracking.metrics(state, config["settings"]["weekly_target"])
        return render_template("reports.html", m=m, chart=chart(m))

    # ----- Settings -----

    @app.get("/settings")
    def settings_page():
        config, _ = load()
        settings = config["settings"]
        phones = [{"index": i, "phone": p, "rows": quote_rows(p, settings, date.today())}
                  for i, p in enumerate(config["phones"])]
        return render_template("settings.html", settings=settings, phones=phones,
                               today=date.today().isoformat())

    def edit_config(fn, message):
        with LOCK:
            config, _ = load()
            try:
                fn(config)
            except (tracking.TrackingError, ValueError, IndexError) as error:
                flash(str(error) or "Invalid value.", "error")
            else:
                save_config(config)
                flash(message, "ok")
        return redirect(request.form.get("next") or url_for("settings_page"))

    @app.post("/settings/general")
    def settings_general():
        def apply(config):
            s = config["settings"]
            s["minimum_net_profit"] = form_money("minimum_net_profit")
            s["profit_buffer"] = form_money("profit_buffer")
            s["sales_tax_rate"] = form_money("sales_tax_percent") / 100
            s["unknown_shipping_estimate"] = form_money("unknown_shipping_estimate")
            s["quote_max_age_days"] = int(request.form["quote_max_age_days"])
            s["min_seller_feedback_percent"] = float(request.form["min_seller_feedback_percent"])
            s["min_seller_feedback_score"] = int(request.form["min_seller_feedback_score"])
            s["weekly_target"] = int(request.form["weekly_target"])
            s["auto_scan"] = request.form.get("auto_scan") == "on"
            hours = [int(h) for h in request.form.get("scan_hours", "").replace(" ", "").split(",") if h]
            if any(h < 0 or h > 23 for h in hours):
                raise ValueError("Scan hours must be between 0 and 23.")
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
        phone["required_words"] = words("required_words")
        phone["excluded_words"] = words("excluded_words")
        phone["ebay_condition_ids"] = request.form.getlist("ebay_condition_ids")

    @app.post("/settings/phones")
    def add_phone():
        def apply(config):
            phone = {}
            phone_fields(phone)
            phone["buyer_quotes"] = [
                {"buyer": b, "payout": None, "outbound_shipping": 0, "payout_fee": 0,
                 "grading_deduction": 0, "quoted_on": None, "quote_url": ""}
                for b in ("BankMyCell", "GadgetGone", "BuyBackBoss", "ItsWorthMore")]
            config["phones"].append(phone)
        return edit_config(apply, "Phone added. Enter its buyer quotes below.")

    @app.post("/settings/phones/<int:index>")
    def edit_phone(index):
        def apply(config):
            if request.form.get("delete") == "1":
                config["phones"].pop(index)
            else:
                phone_fields(config["phones"][index])
        return edit_config(apply, "Phone saved.")

    @app.post("/settings/phones/<int:index>/quotes")
    def save_quote(index):
        def apply(config):
            phone = config["phones"][index]
            qi = request.form.get("quote_index")
            if request.form.get("delete") == "1":
                phone["buyer_quotes"].pop(int(qi))
                return
            if qi in (None, ""):
                name = (request.form.get("buyer") or "").strip()
                if not name:
                    raise ValueError("Buyer name is required.")
                phone["buyer_quotes"].append({"buyer": name})
                quote = phone["buyer_quotes"][-1]
            else:
                quote = phone["buyer_quotes"][int(qi)]
            payout = form_money("payout", required=False)
            quote["payout"] = payout
            quote["outbound_shipping"] = form_money("outbound_shipping", default=0)
            quote["payout_fee"] = form_money("payout_fee", default=0)
            quote["grading_deduction"] = form_money("grading_deduction", default=0)
            quote["quote_url"] = (request.form.get("quote_url") or "").strip()
            if payout is not None:
                if request.form.get("exact_spec") != "on":
                    raise ValueError("Confirm the quote is for this exact model, storage, "
                                     "carrier and condition.")
                quoted_on = form_date("quoted_on") or date.today()
                if quoted_on > date.today():
                    raise ValueError("Quote date can't be in the future.")
                quote["quoted_on"] = quoted_on.isoformat()
                for field in scanner.QUOTE_SPEC:
                    quote[field] = phone[field]
        return edit_config(apply, "Quote saved.")

    if start_scheduler:
        threading.Thread(target=scheduler_loop, daemon=True).start()
    return app


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    print(f"SignalTrade Scanner on http://{host}:{port}")
    create_app(start_scheduler=True).run(host=host, port=port, debug=False)
