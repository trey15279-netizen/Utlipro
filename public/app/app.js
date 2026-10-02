(function () {
  "use strict";

  // ---------- Helpers ----------
  var PREFS_KEY = "commandhub-prefs";
  var MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ic(id, cls) { return '<svg class="' + (cls || "ico") + '" aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  function dial(p) { return String(p || "").replace(/[^\d+]/g, ""); }
  function telHref(p) { return "tel:" + dial(p); }
  function smsHref(p, body) { return "sms:" + dial(p) + (body ? "?&body=" + encodeURIComponent(body) : ""); }
  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function clock(t, ampm) {
    var d = new Date(t), h = d.getHours() % 12 || 12, m = ("0" + d.getMinutes()).slice(-2);
    return h + ":" + m + (ampm ? (d.getHours() < 12 ? " AM" : " PM") : "");
  }
  function shortDate(t) { var d = new Date(t); return DAYS[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate(); }
  function longDate(t) { var d = new Date(t); return MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear(); }
  function fullDate(t) { return longDate(t) + " at " + clock(t, true); }
  function rel(t) {
    var s = Date.now() - t;
    if (s < MIN) return "just now";
    if (s < HOUR) return Math.floor(s / MIN) + " min ago";
    if (s < DAY) return Math.floor(s / HOUR) + " hr ago";
    if (s < 2 * DAY) return "Yesterday";
    return shortDate(t);
  }
  function relEl(t) { return '<span data-ts="' + t + '">' + rel(t) + "</span>"; }
  function initials(name) {
    return String(name || "").trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join("").toUpperCase() || "?";
  }

  var STATUS = {
    new: { label: "New", cls: "new" },
    contacted: { label: "Contacted", cls: "contacted" },
    appointment: { label: "Appointment", cls: "appt" },
    won: { label: "Won", cls: "won" },
    lost: { label: "Lost", cls: "lost" },
    missed: { label: "Missed", cls: "missed" }
  };
  function pill(s) { var x = STATUS[s] || STATUS.new; return '<span class="pill ' + x.cls + '">' + x.label + "</span>"; }

  // ---------- Per-device preferences ----------
  var prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch (e) { prefs = {}; }
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* storage unavailable */ } }

  // ---------- Server ----------
  var state = null;

  function api(method, url, body) {
    var opts = { method: method, credentials: "same-origin", headers: {}, keepalive: method !== "GET" };
    if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(url, opts).then(function (res) {
      if (res.status === 401) { location.href = "/login"; throw new Error("Please log in."); }
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
        return data;
      });
    }, function () { throw new Error("Can't reach Command Hub. Check your internet connection."); });
  }
  function refresh() {
    return api("GET", "/api/state").then(function (s) { state = s; render(); return s; });
  }
  // Run a change on the server, then reload. Shows the error if it fails.
  function act(method, url, body, okMsg) {
    return api(method, url, body).then(function (r) { if (okMsg) toast(okMsg); return refresh().then(function () { return r; }); })
      .catch(function (e) { toast(e.message); throw e; });
  }

  var ui = { route: "", tab: "all", q: "", sel: {}, confirmDelete: false, detailTab: "details", editCompany: false, editPhone: false, open: {}, guide: false };

  function lead(id) { if (!state) return null; for (var i = 0; i < state.leads.length; i++) if (state.leads[i].id === id) return state.leads[i]; return null; }
  function sorted() { return state.leads.slice().sort(function (a, b) { return b.receivedAt - a.receivedAt; }); }
  function count(st) { return state.leads.filter(function (l) { return l.status === st; }).length; }
  function lastLead() { return sorted()[0]; }
  function unread() { return state.notifications.filter(function (n) { return !n.read; }).length; }
  function firstName(s) { return String(s || "").split(" ")[0]; }

  function logContact(l, how, message) {
    if (!l) return;
    api("POST", "/api/leads/" + l.id + "/contact", { how: how, message: message }).then(refresh).catch(function (e) { toast(e.message); });
  }

  // ---------- Toast ----------
  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg; t.hidden = false;
    t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  // ---------- Instant alert ----------
  var alertLead = null, alertTimer;
  function showAlert(l) {
    alertLead = l;
    var now = Date.now();
    $("#alert-time").textContent = clock(now);
    $("#alert-date").textContent = shortDate(now);
    $("#alert-name").textContent = l.name;
    $("#alert-service").textContent = l.service || "New request";
    $("#alert-phone").textContent = l.phone || "";
    $("#alert-call").href = telHref(l.phone);
    $("#alert-call").setAttribute("data-id", l.id);
    $("#alert-text").href = smsHref(l.phone, textTemplate(l));
    $("#alert-text").setAttribute("data-id", l.id);
    var tick = function () {
      var s = Math.max(0, Math.round((Date.now() - l.receivedAt) / 1000));
      $("#alert-ago").textContent = s < 3 ? "Received just now" : s < 120 ? "Received " + s + " seconds ago" : "Received " + rel(l.receivedAt);
    };
    tick(); clearInterval(alertTimer); alertTimer = setInterval(tick, 1000);
    $("#alert").hidden = false;
  }
  function hideAlert() { $("#alert").hidden = true; clearInterval(alertTimer); }
  function textTemplate(l) {
    var s = state ? state.settings : { owner: "", company: "" };
    return "Hi " + firstName(l.name) + ", this is " + firstName(s.owner) + " with " + s.company +
      ". Thanks for reaching out" + (l.service ? " about your " + String(l.service).toLowerCase() : "") + ". When is a good time to come take a look?";
  }

  var audioCtx;
  function chime() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      [880, 1320].forEach(function (f, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + i * 0.16;
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.32);
      });
    } catch (e) { /* audio unavailable */ }
  }
  function browserNotify(l) {
    try {
      if (prefs.browser && "Notification" in window && Notification.permission === "granted") {
        var n = new Notification("New Lead: " + l.name, { body: [l.service, l.phone].filter(Boolean).join(" • ") });
        n.onclick = function () { window.focus(); location.hash = "lead-" + l.id; };
      }
    } catch (e) { /* notifications unavailable */ }
  }

  // ---------- Views ----------
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  }

  function welcomeNotice() {
    if (prefs.hideWelcome || state.lastWebsiteLeadAt) return "";
    return '<div class="notice">' + ic("i-bolt") + '<span>Welcome to Command Hub! <a class="link" href="#connection">Connect your website form</a> to start getting leads, or tap <strong>Test Lead</strong> to see an instant alert.</span>' +
      '<button type="button" data-action="hide-notice" aria-label="Dismiss">' + ic("i-x") + "</button></div>";
  }

  function viewDashboard() {
    var s = state.settings, last = lastLead(), connected = !!state.lastWebsiteLeadAt;
    var newC = count("new"), contacted = count("contacted") + count("appointment"), won = count("won"), missed = count("missed");
    var stat = function (tab, icon, tone, n, label, sub) {
      return '<button type="button" class="card stat" data-action="goto-tab" data-tab="' + tab + '">' +
        '<span class="stat-ico ' + tone + '">' + ic(icon) + "</span>" +
        '<span><b>' + n + '</b><span class="lbl">' + label + "</span><small>" + sub + "</small></span>" + ic("i-chev") + "</button>";
    };
    var recent = sorted().slice(0, 5).map(function (l) {
      return '<li><a href="#lead-' + l.id + '"><span class="avatar">' + ic("i-user") + '</span><span class="who"><strong>' + esc(l.name) +
        "</strong><span>" + esc(l.service || l.source) + '</span></span><span class="when">' + relEl(l.receivedAt) + "</span>" + pill(l.status) + ic("i-chev", "ico chev") + "</a></li>";
    }).join("");

    return welcomeNotice() +
      '<div class="dash-head"><div><h1>' + greeting() + ", " + esc(firstName(s.owner)) + '.</h1><p>Here\'s what\'s happening with your leads today.</p></div>' +
      '<a href="#connection" class="conn-chip' + (connected ? "" : " wait") + '"><span class="ok">' + ic(connected ? "i-check" : "i-globe") + "</span><div><strong>" +
      (connected ? "Website Connected" : "Connect Your Website") + "</strong><span>" +
      (connected ? "Last website lead " + relEl(state.lastWebsiteLeadAt) + "." : "Add your form to start receiving leads.") + "</span></div>" + ic("i-chev") + "</a></div>" +
      '<div class="stats">' +
      stat("new", "i-bell", "tone-blue", newC, "New Leads", "Need your attention") +
      stat("contacted", "i-phone", "tone-teal", contacted, "Contacted", "Called or texted") +
      stat("won", "i-check", "tone-green", won, "Won / Closed", "Jobs completed") +
      stat("missed", "i-x", "tone-red", missed, "Missed", "Not contacted within 24 hours") +
      "</div>" +
      '<div class="dash-grid">' +
      '<section class="card card-pad"><div class="card-head"><h2>Recent Lead Activity</h2><a href="#leads" class="link" data-action="goto-tab" data-tab="all">View All</a></div>' +
      (recent ? '<ul class="recent">' + recent + "</ul>" : '<div class="empty"><strong>No leads yet</strong>New website leads show up here the moment they arrive.<br/><br/><button type="button" class="btn btn-primary btn-sm" data-action="test-lead">' + ic("i-bolt") + "Send a Test Lead</button></div>") +
      "</section>" +
      '<div class="dash-right">' +
      '<section class="card card-pad">' + chartCard() + "</section>" +
      '<section class="card card-pad"><div class="card-head"><h2>Quick Actions</h2></div><div class="quick">' +
      '<a href="#leads" class="btn btn-primary" data-action="goto-tab" data-tab="all">View All Leads</a>' +
      '<button type="button" class="btn btn-ghost" data-action="test-lead">' + ic("i-chat") + "Test Lead</button>" +
      (last && last.phone ? '<a class="btn btn-call" href="' + telHref(last.phone) + '" data-action="call" data-id="' + last.id + '">' + ic("i-call") + "Call newest lead</a>" : "") +
      '<a href="#connection" class="btn btn-ghost">' + ic("i-globe") + "Website Setup</a>" +
      "</div></section></div></div>";
  }

  function countBetween(from, to) {
    return state.leads.filter(function (l) { return l.receivedAt >= from && l.receivedAt < to; }).length;
  }
  function weekData() {
    var today = startOfDay(Date.now()), out = [];
    for (var i = 6; i >= 0; i--) {
      var day = today - i * DAY;
      out.push({ label: DAYS[new Date(day).getDay()], n: countBetween(day, day + DAY) });
    }
    return out;
  }
  function chartCard() {
    var data = weekData(), total = data.reduce(function (a, d) { return a + d.n; }, 0);
    var today = startOfDay(Date.now()), lastWeek = countBetween(today - 13 * DAY, today - 6 * DAY);
    var trend = "";
    if (lastWeek) {
      var pct = Math.round((total - lastWeek) / lastWeek * 100);
      trend = '<span class="trend' + (pct < 0 ? " down" : "") + '">' + (pct >= 0 ? "+" : "") + pct + "% " + ic("i-arrow-ur") + "</span>";
    }
    var W = 340, H = 150, L = 26, R = 20, T = 14, B = 22;
    var max = Math.max(4, Math.ceil(Math.max.apply(null, data.map(function (d) { return d.n; })) / 4) * 4); // 4 even, whole-number steps
    var x = function (i) { return L + i * (W - L - R) / 6; };
    var y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var ticks = "", step = max / 4;
    for (var k = 0; k <= 4; k++) {
      var v = k * step;
      ticks += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
        '<text x="' + (L - 6) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + v + "</text>";
    }
    var pts = data.map(function (d, i) { return x(i).toFixed(1) + "," + y(d.n).toFixed(1); });
    var area = "M" + x(0) + "," + y(0) + " L" + pts.join(" L") + " L" + x(6) + "," + y(0) + " Z";
    var dots = data.map(function (d, i) {
      return '<circle class="pt' + (i === 6 ? " end" : "") + '" cx="' + x(i) + '" cy="' + y(d.n) + '" r="' + (i === 6 ? 4.5 : 3) + '"><title>' + d.label + ": " + d.n + " leads</title></circle>" +
        '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + (i === 6 ? "Today" : d.label) + "</text>";
    }).join("");
    var endLabel = '<text class="val" x="' + (x(6) - 8) + '" y="' + (y(data[6].n) - 9) + '" text-anchor="end">' + data[6].n + "</text>";
    return '<div class="card-head"><h2>Leads This Week</h2>' + trend + "</div>" +
      '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + total + ' leads in the last 7 days">' +
      '<defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1463ff" stop-opacity=".22"/><stop offset="1" stop-color="#1463ff" stop-opacity="0"/></linearGradient></defs>' +
      ticks + '<path d="' + area + '" fill="url(#area)"/><polyline class="ln" points="' + pts.join(" ") + '"/>' + dots + endLabel + "</svg>" +
      '<p class="hint">' + total + " lead" + (total === 1 ? "" : "s") + " in the last 7 days" + (lastWeek ? ", compared with " + lastWeek + " the week before." : ".") + "</p>";
  }

  var TABS = [["all", "All"], ["new", "New"], ["contacted", "Contacted"], ["appointment", "Appointments"], ["won", "Won"], ["missed", "Missed"], ["lost", "Lost"]];
  function filtered() {
    var q = ui.q.trim().toLowerCase(), qd = dial(q);
    return sorted().filter(function (l) {
      if (ui.tab !== "all" && l.status !== ui.tab) return false;
      if (!q) return true;
      return (l.name + " " + l.service + " " + l.city + " " + l.email).toLowerCase().indexOf(q) >= 0 || (qd.length > 2 && dial(l.phone).indexOf(qd) >= 0);
    });
  }
  function viewLeads() {
    var tabs = TABS.map(function (t) {
      var n = t[0] === "all" ? state.leads.length : count(t[0]);
      return '<button type="button" class="' + (ui.tab === t[0] ? "active" : "") + '" data-action="tab" data-tab="' + t[0] + '">' + t[1] + " (" + n + ")</button>";
    }).join("");
    var opts = TABS.map(function (t) { return '<option value="' + t[0] + '"' + (ui.tab === t[0] ? " selected" : "") + ">" + (t[0] === "all" ? "All Statuses" : t[1]) + "</option>"; }).join("");
    return '<div class="page-head"><div><h1>Leads</h1><p>All incoming leads from your website.</p></div>' +
      '<div class="inbox-tools"><label class="search">' + ic("i-search") + '<input id="lead-search" type="search" placeholder="Search leads..." aria-label="Search leads" value="' + esc(ui.q) + '"/></label>' +
      '<select id="status-filter" class="select" aria-label="Filter by status">' + opts + "</select></div></div>" +
      '<div class="tabs" role="tablist">' + tabs + "</div>" +
      '<section class="card lead-table" id="lead-table">' + leadRows() + "</section>";
  }
  function leadRows() {
    var list = filtered(), ids = Object.keys(ui.sel).filter(function (k) { return ui.sel[k] && lead(k); });
    var allSel = list.length > 0 && list.every(function (l) { return ui.sel[l.id]; });
    var bulk = ids.length ? '<div class="bulk"><strong>' + ids.length + " selected</strong>" +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="bulk-contacted">Mark contacted</button>' +
      '<button type="button" class="btn btn-sm ' + (ui.confirmDelete ? "btn-danger" : "btn-ghost") + '" data-action="bulk-delete">' + (ui.confirmDelete ? "Tap again to delete" : "Delete") + "</button>" +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="bulk-clear">Clear</button></div>' : "";
    var head = '<div class="lt-row lt-head"><input type="checkbox" class="check" data-action="sel-all" aria-label="Select all"' + (allSel ? " checked" : "") + '/>' +
      "<span>Customer</span><span>Service</span><span class=\"lt-source\">Source</span><span>Received</span><span>Status</span><span style=\"text-align:right\">Actions</span></div>";
    if (!list.length) {
      return bulk + head + '<div class="empty"><strong>' + (ui.q ? "No leads match “" + esc(ui.q) + "”" : "No leads here yet") + "</strong>" +
        (ui.q ? "Try a name, phone number, or service." : "Leads with this status will show up here.") + "</div>";
    }
    var rows = list.map(function (l) {
      return '<div class="lt-row' + (ui.sel[l.id] ? " sel" : "") + '" data-open="' + l.id + '">' +
        '<input type="checkbox" class="check" data-action="sel" data-id="' + l.id + '" aria-label="Select ' + esc(l.name) + '"' + (ui.sel[l.id] ? " checked" : "") + "/>" +
        '<div class="lt-cust"><span class="avatar">' + ic("i-user") + '</span><span class="who"><strong>' + esc(l.name) + '</strong><span class="num">' + esc(l.phone || l.email) + "</span></span></div>" +
        '<span class="lt-cell lt-svc">' + esc(l.service || "—") + "</span>" +
        '<span class="lt-cell lt-source">' + esc(l.source) + "</span>" +
        '<span class="lt-cell lt-when">' + relEl(l.receivedAt) + "</span>" +
        '<span class="lt-status">' + pill(l.status) + "</span>" +
        '<div class="lt-actions">' + contactButtons(l, "btn-sm") + ic("i-chev") + "</div></div>";
    }).join("");
    return bulk + head + '<div class="lt-body">' + rows + "</div>";
  }
  function contactButtons(l, size) {
    if (l.phone) {
      return '<a class="btn btn-call ' + size + '" href="' + telHref(l.phone) + '" data-action="call" data-id="' + l.id + '">' + ic("i-call") + "Call</a>" +
        '<a class="btn btn-primary ' + size + '" href="' + smsHref(l.phone, textTemplate(l)) + '" data-action="text" data-id="' + l.id + '">' + ic("i-chat") + "Text</a>";
    }
    return '<a class="btn btn-primary ' + size + '" href="mailto:' + esc(l.email) + '">' + ic("i-mail") + "Email</a>";
  }

  function viewLead(id) {
    var l = lead(id);
    if (!l) return '<a href="#leads" class="back">' + ic("i-back") + 'Back to Leads</a><div class="card empty"><strong>Lead not found</strong>It may have been deleted.</div>';
    var tabs = [["details", "Details"], ["messages", "Messages"], ["activity", "Activity"]].map(function (t) {
      return '<button type="button" class="' + (ui.detailTab === t[0] ? "active" : "") + '" data-action="detail-tab" data-tab="' + t[0] + '">' + t[1] + (t[0] === "messages" && l.messages.length ? " (" + l.messages.length + ")" : "") + "</button>";
    }).join("");
    var body;
    if (ui.detailTab === "messages") {
      var thread = l.messages.map(function (m) {
        return '<div class="bubble ' + (m.from === "you" ? "you" : "them") + '">' + esc(m.text) + "<small>" + (m.from === "you" ? "Opened in Messages • " : "") + rel(m.at) + "</small></div>";
      }).join("");
      body = '<div class="thread">' + (l.message ? '<div class="bubble them">' + esc(l.message) + "<small>Website form • " + rel(l.receivedAt) + "</small></div>" : "") + thread + "</div>" +
        (l.phone ? '<form id="msg-form" data-id="' + l.id + '"><div class="field"><label for="msg-body">Text message</label><textarea id="msg-body" class="textarea">' + esc(textTemplate(l)) + "</textarea></div>" +
          '<div class="form-actions" style="margin-top:10px"><button type="submit" class="btn btn-primary">' + ic("i-chat") + "Text " + esc(firstName(l.name)) + "</button></div>" +
          '<p class="hint">Opens your phone\'s Messages app with this text ready to send to ' + esc(l.phone) + ".</p></form>"
          : '<p class="hint">This lead didn\'t leave a phone number. Reach them at ' + esc(l.email) + ".</p>");
    } else if (ui.detailTab === "activity") {
      body = '<ul class="timeline">' + l.activity.slice().reverse().map(function (a) {
        return "<li>" + esc(a.text) + (a.note ? ": " + esc(a.note) : "") + "<small>" + fullDate(a.at) + "</small></li>";
      }).join("") + "</ul>";
    } else {
      body = '<h3 class="section-title">Form Submission Details</h3><dl class="dl">' +
        "<dt>Service Requested</dt><dd>" + (l.service ? esc(l.service) : '<span class="muted">Not given</span>') + "</dd>" +
        "<dt>Message</dt><dd>" + (l.message ? '<div class="msg-box">' + esc(l.message) + "</div>" : '<span class="muted">No message</span>') + "</dd>" +
        "<dt>Source</dt><dd>" + esc(l.source) + "</dd>" +
        "<dt>Received</dt><dd>" + fullDate(l.receivedAt) + "</dd></dl>" +
        '<form id="note-form" data-id="' + l.id + '" style="margin-top:20px"><div class="field"><label for="note-body">Add a note</label>' +
        '<textarea id="note-body" class="textarea" placeholder="e.g. Wants a quote by Friday. Dog in the backyard."></textarea></div>' +
        '<div class="form-actions" style="margin-top:10px"><button type="submit" class="btn btn-ghost">Save note</button></div></form>';
    }
    var order = ["new", "contacted", "appointment"], idx = order.indexOf(l.status);
    var closed = l.status === "won" || l.status === "lost";
    var stepBtn = function (st, label) {
      var cls = "step";
      if (l.status === st) cls += " current " + st;
      else if (closed || (idx >= 0 && order.indexOf(st) >= 0 && order.indexOf(st) < idx)) cls += " done";
      return '<button type="button" class="' + cls + '" data-action="status" data-id="' + l.id + '" data-status="' + st + '">' + label + "</button>";
    };
    var sep = '<span class="step-sep">→</span>';
    var notes = l.activity.filter(function (a) { return a.note; });

    return '<a href="#leads" class="back">' + ic("i-back") + "Back to Leads</a>" +
      '<div class="detail-grid"><div class="stack">' +
      '<section class="card card-pad"><div class="profile"><span class="avatar">' + ic("i-user") + "</span>" +
      '<div class="profile-info"><h1>' + esc(l.name) + " " + pill(l.status) + "</h1>" +
      '<ul class="contact-list">' + (l.phone ? "<li>" + ic("i-phone") + '<span class="num">' + esc(l.phone) + "</span></li>" : "") +
      (l.email ? "<li>" + ic("i-mail") + esc(l.email) + "</li>" : "") +
      (l.city ? "<li>" + ic("i-pin") + esc(l.city) + "</li>" : "") + "</ul></div>" +
      '<div class="profile-cta">' + contactButtons(l, "") + "</div></div></section>" +
      '<section class="card card-pad"><div class="tabs" style="margin-bottom:18px">' + tabs + "</div>" + body + "</section></div>" +
      '<div class="stack"><section class="card card-pad"><h3 class="section-title">Lead Status</h3><div class="stepper">' +
      stepBtn("new", "New") + sep + stepBtn("contacted", "Contacted") + sep + stepBtn("appointment", "Appointment") + sep + stepBtn("won", "Won") + stepBtn("lost", "Lost") +
      "</div>" + (l.status === "missed" ? '<p class="hint">Nobody reached this lead within 24 hours. Call or text to win it back.</p>' : "") + "</section>" +
      (notes.length ? '<section class="card card-pad"><h3 class="section-title">Notes</h3><ul class="timeline">' + notes.slice().reverse().map(function (a) {
        return "<li>" + esc(a.note) + "<small>" + fullDate(a.at) + "</small></li>";
      }).join("") + "</ul></section>" : "") +
      '<section class="card card-pad"><h3 class="section-title">Quick Facts</h3><div class="kv">' +
      "<div><span>Time since lead came in</span><strong>" + relEl(l.receivedAt) + "</strong></div>" +
      "<div><span>Contact attempts</span><strong>" + l.activity.filter(function (a) { return /^(Called|Texted) /.test(a.text); }).length + "</strong></div>" +
      '</div><div class="form-actions" style="margin-top:16px"><button type="button" class="btn ' + (ui.confirmDelete ? "btn-danger" : "btn-ghost") + ' btn-sm" data-action="delete-lead" data-id="' + l.id + '">' + (ui.confirmDelete ? "Tap again to delete this lead" : "Delete lead") + "</button></div></section>" +
      "</div></div>";
  }

  function viewNotifications() {
    var items = state.notifications.map(function (n) {
      var l = n.leadId && lead(n.leadId);
      return '<li class="' + (n.read ? "" : "unread") + '"><a href="' + (l ? "#lead-" + n.leadId : "#leads") + '" data-action="read-notif" data-nid="' + n.id + '">' +
        '<span class="avatar">' + ic("i-bell") + '</span><span class="who"><strong>' + esc(n.text) + "</strong><span>" + esc(n.detail) + "</span></span>" +
        '<span class="muted" style="font-size:12px;white-space:nowrap">' + relEl(n.at) + "</span>" + ic("i-chev") + "</a></li>";
    }).join("");
    return '<div class="page-head"><div><h1>Notifications</h1><p>Every alert Command Hub has sent you.</p></div><div class="form-actions">' +
      '<button type="button" class="btn btn-ghost" data-action="read-all"' + (unread() ? "" : " disabled") + ">Mark all as read</button>" +
      '<button type="button" class="btn btn-primary" data-action="test-lead">' + ic("i-bolt") + "Send Test Alert</button></div></div>" +
      '<section class="card">' + (items ? '<ul class="notif-list">' + items + "</ul>" : '<div class="empty"><strong>No notifications yet</strong>You\'ll get an alert here the moment a lead comes in.</div>') + "</section>";
  }

  function snippet() {
    return [
      '<form action="' + state.formUrl + '" method="POST">',
      '  <input name="name" placeholder="Name" required>',
      '  <input name="phone" type="tel" placeholder="Phone" required>',
      '  <input name="email" type="email" placeholder="Email">',
      '  <input name="service" placeholder="Service Needed">',
      '  <textarea name="message" placeholder="How can we help?"></textarea>',
      '  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">',
      '  <button type="submit">Submit</button>',
      "</form>"
    ].join("\n");
  }

  function viewConnection() {
    var s = state.settings, connected = !!state.lastWebsiteLeadAt;
    var lastSite = connected ? state.leads.filter(function (l) { return l.source === "Website Form"; })[0] : null;
    return '<div class="page-head"><div><h1>Website Connection</h1><p>Connect your website so we can receive and immediately alert you of new leads.</p></div></div>' +
      '<div class="conn-grid"><div class="stack">' +
      '<section class="card card-pad"><div class="conn-status"><span class="big-dot' + (connected ? "" : " wait") + '"></span><div style="flex:1">' +
      '<h2 class="' + (connected ? "" : "wait") + '">' + (connected ? "Connected" : "Waiting for your first lead") + "</h2>" +
      '<p class="muted" style="margin:4px 0 0">' + (connected ? "Last lead received: " + relEl(state.lastWebsiteLeadAt) : "Add the form below to your website. This turns green when the first lead arrives.") + "</p></div>" +
      (lastSite ? '<a class="link" href="#lead-' + lastSite.id + '">View Lead</a>' : "") + "</div>" +
      '<div class="form-actions" style="margin-top:16px"><button type="button" class="btn btn-primary btn-sm" data-action="test-lead">' + ic("i-bolt") + "Send a test lead</button></div></section>" +
      '<section class="card card-pad"><h3 class="section-title">Connection Details</h3><form id="site-form" class="kv">' +
      '<div class="field"><label for="site-url">Website URL</label><input id="site-url" class="input" type="url" value="' + esc(s.website) + '" placeholder="https://yourwebsite.com"/></div>' +
      '<div class="field"><label for="form-url">Your form address</label><div class="inline-form"><input id="form-url" class="input num" readonly value="' + esc(state.formUrl) + '"/>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="copy" data-copy="url">' + ic("i-copy") + "Copy</button></div></div>" +
      '<div><span>Form Status</span><strong class="ok">Active</strong></div>' +
      '<div class="form-actions"><button type="submit" class="btn btn-ghost btn-sm">Save website</button></div></form></section></div>' +
      '<div class="stack"><section class="card card-pad"><h3 class="section-title">Need to set up your website?</h3>' +
      '<p class="muted" style="margin:0 0 14px">Follow our simple guide to connect your form.</p>' +
      '<button type="button" class="btn btn-outline" data-action="guide" aria-expanded="' + ui.guide + '">' + (ui.guide ? "Hide Setup Guide" : "View Setup Guide") + "</button>" +
      (ui.guide ? '<div style="margin-top:18px"><ol class="steps-list"><li>Open the page on your website that has your contact or quote form.</li>' +
        "<li>Replace the form with the code below, or send it to whoever manages your site.</li>" +
        "<li>Already have a form you like? Point its action (where it submits) to your form address. Fields named <strong>name</strong>, <strong>phone</strong>, <strong>email</strong>, <strong>service</strong> and <strong>message</strong> are picked up automatically.</li>" +
        "<li>Submit the form once yourself. The alert should arrive within seconds.</li></ol>" +
        '<div class="code-wrap"><pre class="code" id="snippet">' + esc(snippet()) + '</pre><button type="button" class="btn btn-ghost btn-sm" data-action="copy" data-copy="snippet">' + ic("i-copy") + "Copy</button></div></div>" : "") +
      "</section>" +
      '<section class="card card-pad"><h3 class="section-title">Try it like a customer</h3><p class="muted" style="margin:0 0 14px">This form sends to your real form address, exactly like your website will.</p>' +
      '<form id="demo-form" class="demo-site"><h3>' + esc(s.company) + ' — Request a Free Estimate</h3><div class="form-grid">' +
      '<div class="field"><label for="df-name">Name</label><input id="df-name" class="input" required placeholder="Jane Doe"/></div>' +
      '<div class="field"><label for="df-phone">Phone</label><input id="df-phone" class="input" type="tel" required placeholder="(864) 555-0100"/></div>' +
      '<div class="field"><label for="df-service">Service Needed</label><select id="df-service" class="select"><option>Roof Repair</option><option>Roof Replacement</option><option>Inspection</option><option>Storm Damage</option><option>Gutter Repair</option></select></div>' +
      '<div class="field"><label for="df-email">Email</label><input id="df-email" class="input" type="email" placeholder="jane@email.com"/></div>' +
      '<div class="field span-2"><label for="df-msg">Message</label><textarea id="df-msg" class="textarea" placeholder="Tell us about your roof"></textarea></div>' +
      '<div class="span-2"><button type="submit" class="btn btn-primary">Submit</button></div></div></form></section></div></div>';
  }

  function viewSettings() {
    var s = state.settings;
    var toggle = function (key, icon, label, sub, on) {
      return '<div class="toggle-row">' + ic(icon) + '<span class="who"><strong>' + label + "</strong><span>" + sub + "</span></span>" +
        '<button type="button" class="switch" role="switch" aria-label="' + label + '" aria-checked="' + !!on + '" data-action="switch" data-key="' + key + '"></button></div>';
    };
    var menu = function (key, icon, label, sub, panel) {
      var open = !!ui.open[key];
      return '<button type="button" class="menu-row" data-action="menu" data-key="' + key + '" aria-expanded="' + open + '">' + ic(icon) +
        '<span class="who"><strong>' + label + "</strong><span>" + sub + "</span></span>" + ic("i-chev") + "</button>" + (open ? '<div class="menu-panel">' + panel() + "</div>" : "");
    };
    var company = ui.editCompany ?
      '<form id="company-form" class="form-grid">' +
      '<div class="field"><label for="c-company">Company</label><input id="c-company" class="input" required value="' + esc(s.company) + '"/></div>' +
      '<div class="field"><label for="c-owner">Your name</label><input id="c-owner" class="input" required value="' + esc(s.owner) + '"/></div>' +
      '<div class="field"><label for="c-email">Email for lead alerts</label><input id="c-email" class="input" type="email" required value="' + esc(s.email) + '"/></div>' +
      '<div class="field"><label for="c-phone">Business phone</label><input id="c-phone" class="input" type="tel" value="' + esc(s.phone) + '"/></div>' +
      '<div class="form-actions span-2"><button type="submit" class="btn btn-primary btn-sm">Save</button><button type="button" class="btn btn-ghost btn-sm" data-action="edit-company">Cancel</button></div></form>' :
      '<div class="company"><span class="avatar">' + ic("i-user") + '</span><dl><dd><strong>' + esc(s.company) + "</strong></dd><dd>" + esc(s.owner) + "</dd><dd>" + esc(s.email) + '</dd><dd class="num">' + esc(s.phone) + "</dd></dl></div>";

    var phoneRow = ui.editPhone ?
      '<form id="phone-form" class="inline-form" style="padding:12px 0;border-top:1px solid var(--line)"><input id="notify-phone" class="input" type="tel" required value="' + esc(s.notifyPhone) + '" aria-label="Notification phone number"/><button type="submit" class="btn btn-primary btn-sm">Save</button></form>' :
      '<div class="toggle-row">' + ic("i-phone") + '<span class="who"><strong>Notification Phone Number</strong><span class="num">' + esc(s.notifyPhone || "Not set") + '</span></span><button type="button" class="link" data-action="edit-phone">Edit</button></div>';

    var setupNote = [];
    if (s.sms && !state.smsReady) setupNote.push("text alerts");
    if (s.email_on && !state.emailReady) setupNote.push("email alerts");
    var trialLeft = Math.ceil((state.trialEnds - Date.now()) / DAY);

    return '<div class="page-head"><div><h1>Settings</h1><p>Manage your account, notifications, and more.</p></div></div>' +
      '<div class="settings-grid"><div class="stack">' +
      '<section class="card card-pad"><div class="card-head"><h2>Company Information</h2>' + (ui.editCompany ? "" : '<button type="button" class="link" data-action="edit-company">Edit</button>') + "</div>" + company + "</section>" +
      '<section class="card card-pad"><div class="card-head"><h2>Notifications</h2></div>' +
      toggle("sms", "i-chat", "SMS Notifications", "Text me when a new lead comes in", s.sms) +
      toggle("email_on", "i-mail", "Email Notifications", "Email me a copy of every lead", s.email_on) +
      toggle("sound", "i-bell", "New Lead Alert Sound", "Play a chime with the alert", s.sound) +
      toggle("browser", "i-bolt", "Browser Alerts", "Pop-up alerts on this device", prefs.browser) +
      phoneRow +
      (setupNote.length ? '<p class="hint">Your ' + setupNote.join(" and ") + " will start once the server's messaging service is set up. Until then, alerts appear here in the app.</p>" : "") +
      "</section></div>" +
      '<section class="card card-pad">' +
      menu("website", "i-globe", "Website Connection", "Manage your website integration", function () {
        return '<p class="muted" style="margin:0 0 10px">' + (state.lastWebsiteLeadAt ? "Receiving leads" + (s.website ? " from " + esc(s.website) : "") : "Waiting for your first website lead") + '</p><a href="#connection" class="btn btn-ghost btn-sm">Open Website Connection</a>';
      }) +
      menu("team", "i-users", "Team Members", "Add or remove team members", function () {
        return '<ul class="team">' + state.team.map(function (m) {
          return '<li><span class="me-av">' + esc(initials(m.name)) + '</span><span class="who"><strong>' + esc(m.name) + "</strong><span>" + esc(m.role) + "</span></span>" +
            (m.id ? '<button type="button" class="link" data-action="remove-member" data-id="' + esc(m.id) + '">Remove</button>' : "") + "</li>";
        }).join("") + '</ul><form id="team-form" class="inline-form"><input id="tm-name" class="input" required placeholder="Name" aria-label="Team member name"/>' +
          '<input id="tm-role" class="input" placeholder="Role" aria-label="Role"/><button type="submit" class="btn btn-primary btn-sm">' + ic("i-plus") + "Add</button></form>";
      }) +
      menu("billing", "i-card", "Billing", "View plan and payment details", function () {
        return '<div class="kv"><div><span>Plan</span><strong>Command Hub Pro — $697/month</strong></div>' +
          "<div><span>Free trial</span><strong>" + (trialLeft > 0 ? trialLeft + " day" + (trialLeft === 1 ? "" : "s") + " left (ends " + longDate(state.trialEnds) + ")" : "Ended " + longDate(state.trialEnds)) + "</strong></div>" +
          "<div><span>Contract</span><strong>None. Cancel anytime.</strong></div></div>";
      }) +
      menu("security", "i-shield", "Security", "Manage your password and account", function () {
        return '<form id="password-form" class="form-grid">' +
          '<div class="field"><label for="pw-current">Current password</label><input id="pw-current" class="input" type="password" autocomplete="current-password" required/></div>' +
          '<div class="field"><label for="pw-next">New password</label><input id="pw-next" class="input" type="password" autocomplete="new-password" minlength="8" required/></div>' +
          '<div class="form-actions span-2"><button type="submit" class="btn btn-primary btn-sm">Change password</button></div></form>' +
          '<div class="toggle-row" style="margin-top:14px"><span class="who"><strong>Signed in as ' + esc(state.user.email) + '</strong><span>Sign out of Command Hub on this device</span></span>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-action="logout">Log out</button></div>';
      }) +
      "</section></div>";
  }

  // ---------- Render / routing ----------
  function parseRoute() {
    var h = (location.hash || "").replace(/^#/, "");
    if (h.indexOf("lead-") === 0) return { name: "lead", id: h.slice(5) };
    if (["dashboard", "leads", "notifications", "connection", "settings"].indexOf(h) >= 0) return { name: h };
    return { name: "dashboard" };
  }

  function render() {
    if (!state) return;
    var r = parseRoute(), view = $("#view");
    var changed = r.name !== ui.route || r.id !== ui.routeId;
    if (changed) {
      ui.confirmDelete = false;
      if (r.name === "lead") ui.detailTab = "details";
    }
    ui.route = r.name; ui.routeId = r.id;
    view.innerHTML = r.name === "leads" ? viewLeads() : r.name === "lead" ? viewLead(r.id) : r.name === "notifications" ? viewNotifications() :
      r.name === "connection" ? viewConnection() : r.name === "settings" ? viewSettings() : viewDashboard();
    var navKey = r.name === "lead" ? "leads" : r.name;
    $$("[data-nav]").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-nav") === navKey); });
    var u = unread();
    $$("[data-unread]").forEach(function (el) { el.hidden = !u; if (el.classList.contains("nav-count")) el.textContent = u; });
    var s = state.settings;
    $("#me-name").textContent = s.owner; $("#me-company").textContent = s.company; $("#me-initials").textContent = initials(s.owner);
    document.title = (u ? "(" + u + ") " : "") + "Command Hub";
    if (changed) window.scrollTo(0, 0);
  }

  // Background refreshes wait while someone is typing, so their text isn't wiped out.
  var deferred = false;
  function typing() {
    var a = document.activeElement;
    return a && $("#view").contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.id !== "lead-search";
  }
  function backgroundRefresh() {
    return api("GET", "/api/state").then(function (s) {
      state = s;
      if (typing()) deferred = true; else render();
      return s;
    });
  }
  document.addEventListener("focusout", function () {
    setTimeout(function () { if (deferred && !typing()) { deferred = false; render(); } }, 150);
  });

  function refreshRows() {
    var t = $("#lead-table");
    if (t) t.innerHTML = leadRows();
  }

  function go(hash) { if (location.hash === "#" + hash) render(); else location.hash = hash; }

  // ---------- Events ----------
  window.addEventListener("hashchange", render);

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    var row = e.target.closest("[data-open]");
    if (!el && row && !e.target.closest("a")) { go("lead-" + row.getAttribute("data-open")); return; }
    if (!el || !state) return;
    var a = el.getAttribute("data-action"), id = el.getAttribute("data-id"), l = id ? lead(id) : null;

    switch (a) {
      case "call":
        // The tel: link opens the phone's dialer; we log the attempt.
        logContact(l, "call");
        if (el.id === "alert-call") hideAlert();
        break;
      case "text":
        logContact(l, "text");
        if (el.id === "alert-text") hideAlert();
        break;
      case "test-lead":
        e.preventDefault(); el.disabled = true;
        api("POST", "/api/leads/test", {}).catch(function (err) { toast(err.message); }).then(function () { el.disabled = false; });
        break;
      case "alert-close": hideAlert(); break;
      case "alert-open":
        hideAlert();
        if (alertLead) { api("POST", "/api/notifications/read", { leadId: alertLead.id }).then(refresh, function () {}); go("lead-" + alertLead.id); }
        break;
      case "goto-tab": e.preventDefault(); ui.tab = el.getAttribute("data-tab"); ui.q = ""; go("leads"); break;
      case "tab": ui.tab = el.getAttribute("data-tab"); ui.confirmDelete = false; render(); break;
      case "sel":
        e.stopPropagation(); ui.sel[id] = el.checked; ui.confirmDelete = false; refreshRows(); break;
      case "sel-all":
        filtered().forEach(function (x) { ui.sel[x.id] = el.checked; }); ui.confirmDelete = false; refreshRows(); break;
      case "bulk-clear": ui.sel = {}; ui.confirmDelete = false; refreshRows(); break;
      case "bulk-contacted":
        act("POST", "/api/leads/bulk", { ids: selectedIds(), action: "contacted" }, "Marked as contacted").then(function () { ui.sel = {}; refreshRows(); }, function () {});
        break;
      case "bulk-delete":
        if (!ui.confirmDelete) { ui.confirmDelete = true; refreshRows(); break; }
        var ids = selectedIds();
        ui.confirmDelete = false;
        act("POST", "/api/leads/bulk", { ids: ids, action: "delete" }, ids.length + (ids.length === 1 ? " lead deleted" : " leads deleted")).then(function () { ui.sel = {}; refreshRows(); }, function () {});
        break;
      case "detail-tab": ui.detailTab = el.getAttribute("data-tab"); render(); break;
      case "status":
        var st = el.getAttribute("data-status");
        act("PATCH", "/api/leads/" + id, { status: st }, "Status set to " + STATUS[st].label).catch(function () {});
        break;
      case "delete-lead":
        if (!ui.confirmDelete) { ui.confirmDelete = true; render(); break; }
        ui.confirmDelete = false;
        api("DELETE", "/api/leads/" + id).then(function () { toast("Lead deleted"); return refresh(); }).then(function () { go("leads"); }, function (err) { toast(err.message); });
        break;
      case "read-notif":
        api("POST", "/api/notifications/read", { id: el.getAttribute("data-nid") }).then(backgroundRefresh, function () {});
        break;
      case "read-all": act("POST", "/api/notifications/read", { all: true }).catch(function () {}); break;
      case "hide-notice": prefs.hideWelcome = true; savePrefs(); render(); break;
      case "guide": ui.guide = !ui.guide; render(); break;
      case "copy": copyText(el.getAttribute("data-copy") === "url" ? state.formUrl : snippet(), el.getAttribute("data-copy") === "url" ? "#form-url" : "#snippet"); break;
      case "switch": toggleSwitch(el.getAttribute("data-key")); break;
      case "menu": var k = el.getAttribute("data-key"); ui.open[k] = !ui.open[k]; render(); break;
      case "edit-company": ui.editCompany = !ui.editCompany; render(); break;
      case "edit-phone": ui.editPhone = true; render(); var p = $("#notify-phone"); if (p) p.focus(); break;
      case "remove-member": act("DELETE", "/api/team/" + encodeURIComponent(id), undefined, "Team member removed").catch(function () {}); break;
      case "logout":
        api("POST", "/api/logout", {}).then(function () { location.href = "/"; }, function (err) { toast(err.message); });
        break;
    }
  });

  function selectedIds() { return Object.keys(ui.sel).filter(function (k) { return ui.sel[k] && lead(k); }); }

  function toggleSwitch(key) {
    var s = state.settings;
    if (key === "browser") {
      if (prefs.browser) { prefs.browser = false; savePrefs(); render(); return; }
      try {
        if (!("Notification" in window)) { toast("This browser doesn't support pop-up alerts."); return; }
        Notification.requestPermission().then(function (p) {
          if (p === "granted") { prefs.browser = true; savePrefs(); render(); toast("Browser alerts turned on"); }
          else toast("Pop-up alerts are blocked. Allow notifications for this site in your browser settings.");
        }).catch(function () { toast("Pop-up alerts are blocked in this browser."); });
      } catch (e) { toast("Pop-up alerts are blocked in this browser."); }
      return;
    }
    var body = {}; body[key] = !s[key];
    if (key === "sound" && body.sound) chime();
    act("PATCH", "/api/account", body).catch(function () {});
  }

  function copyText(text, selector) {
    var fallback = function () {
      var node = $(selector); if (!node) return;
      if (node.select) node.select();
      else { var range = document.createRange(); range.selectNodeContents(node); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
      toast("Selected. Copy it with your device's copy command.");
    };
    try { navigator.clipboard.writeText(text).then(function () { toast("Copied"); }, fallback); } catch (e) { fallback(); }
  }

  document.addEventListener("submit", function (e) {
    var f = e.target;
    e.preventDefault();
    if (!state) return;
    var l, btn = f.querySelector("[type=submit]");
    var done = function () { if (btn) btn.disabled = false; };
    if (btn) btn.disabled = true;
    switch (f.id) {
      case "top-search":
        done(); ui.q = $("#top-search-input").value; ui.tab = "all"; go("leads"); break;
      case "msg-form":
        l = lead(f.getAttribute("data-id")); var body = $("#msg-body").value.trim();
        done();
        if (!l || !body) return;
        logContact(l, "text", body);
        location.href = smsHref(l.phone, body);
        break;
      case "note-form":
        var note = $("#note-body").value.trim();
        if (!note) { done(); return; }
        act("POST", "/api/leads/" + f.getAttribute("data-id") + "/notes", { note: note }, "Note saved").then(done, done);
        break;
      case "site-form":
        act("PATCH", "/api/account", { website: $("#site-url").value.trim() }, "Website saved").then(done, done);
        break;
      case "demo-form":
        fetch(state.formUrl, {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ name: $("#df-name").value, phone: $("#df-phone").value, service: $("#df-service").value, email: $("#df-email").value, message: $("#df-msg").value })
        }).then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (d) { if (!res.ok) throw new Error(d.error || "The form couldn't be sent."); });
        }).then(function () { f.reset(); }, function (err) { toast(err.message === "Failed to fetch" ? "Can't reach Command Hub. Check your internet connection." : err.message); }).then(done);
        break;
      case "company-form":
        act("PATCH", "/api/account", { company: $("#c-company").value, owner: $("#c-owner").value, email: $("#c-email").value, phone: $("#c-phone").value }, "Company information saved")
          .then(function () { ui.editCompany = false; render(); }, done);
        break;
      case "phone-form":
        act("PATCH", "/api/account", { notifyPhone: $("#notify-phone").value }, "Notification number saved").then(function () { ui.editPhone = false; render(); }, done);
        break;
      case "team-form":
        act("POST", "/api/team", { name: $("#tm-name").value, role: $("#tm-role").value }, "Team member added").then(done, done);
        break;
      case "password-form":
        api("POST", "/api/password", { current: $("#pw-current").value, next: $("#pw-next").value })
          .then(function () { toast("Password changed"); f.reset(); }, function (err) { toast(err.message); }).then(done);
        break;
      default: done();
    }
  });

  document.addEventListener("input", function (e) {
    if (e.target.id === "lead-search") { ui.q = e.target.value; refreshRows(); }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "status-filter") { ui.tab = e.target.value; render(); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("#alert").hidden) hideAlert();
  });

  // Swipe up on the alert to dismiss
  var touchY = null;
  $("#alert").addEventListener("touchstart", function (e) { touchY = e.touches[0].clientY; }, { passive: true });
  $("#alert").addEventListener("touchend", function (e) {
    if (touchY != null && touchY - e.changedTouches[0].clientY > 80) hideAlert();
    touchY = null;
  });
  $("#alert").addEventListener("click", function (e) { if (e.target.id === "alert") hideAlert(); });

  // Keep "2 min ago" labels fresh
  setInterval(function () {
    $$("[data-ts]").forEach(function (el) { el.textContent = rel(+el.getAttribute("data-ts")); });
  }, 30000);

  // ---------- Live updates ----------
  function listen() {
    if (!("EventSource" in window)) { setInterval(backgroundRefresh, 30000); return; }
    var es = new EventSource("/api/events");
    es.addEventListener("lead", function (ev) {
      var data = {};
      try { data = JSON.parse(ev.data); } catch (e) { /* ignore */ }
      backgroundRefresh().then(function () {
        var l = lead(data.id) || data;
        showAlert(l);
        if (state.settings.sound) chime();
        browserNotify(l);
      }, function () {});
    });
    es.addEventListener("update", function () { backgroundRefresh().catch(function () {}); });
    es.onopen = function () { $("#sys-updated").textContent = "just now"; };
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && state) backgroundRefresh().catch(function () {});
  });

  refresh().then(listen, function (e) {
    $("#view").innerHTML = '<div class="card empty"><strong>Couldn\'t load your leads</strong>' + esc(e.message) +
      '<br/><br/><button type="button" class="btn btn-primary btn-sm" onclick="location.reload()">Try again</button></div>';
  });
})();
