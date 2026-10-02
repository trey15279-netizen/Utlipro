(function () {
  "use strict";

  // ---------- Helpers ----------
  var KEY = "commandhub-app-v1";
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
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function dial(p) { return String(p || "").replace(/[^\d+]/g, ""); }
  function telHref(p) { return "tel:" + dial(p); }
  function smsHref(p, body) { return "sms:" + dial(p) + (body ? "?&body=" + encodeURIComponent(body) : ""); }
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function clock(t, ampm) {
    var d = new Date(t), h = d.getHours() % 12 || 12, m = ("0" + d.getMinutes()).slice(-2);
    return h + ":" + m + (ampm ? (d.getHours() < 12 ? " AM" : " PM") : "");
  }
  function shortDate(t) { var d = new Date(t); return DAYS[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate(); }
  function fullDate(t) { var d = new Date(t); return MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear() + " at " + clock(t, true); }
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

  // ---------- Sample data ----------
  function seed() {
    var now = Date.now();
    var rows = [
      ["John Smith", "(864) 555-0187", "Roof Repair", 2, "new", "Greenville, SC", "I noticed a leak in my roof after the last storm. Can you come out and take a look?"],
      ["Sarah Miller", "(864) 555-0143", "Roof Replacement", 7, "new", "Simpsonville, SC", "Our roof is about 22 years old and missing shingles. Looking for a replacement quote."],
      ["James Carter", "(864) 555-0169", "Inspection", 12, "new", "Mauldin, SC", "We're buying a house and need a roof inspection before closing next week."],
      ["Lisa Brown", "(864) 555-0175", "Roof Repair", 18, "contacted", "Greer, SC", "The flashing around our chimney is pulling away."],
      ["Robert Davis", "(864) 555-0132", "Roof Replacement", 26, "contacted", "Easley, SC", "Insurance approved a replacement after hail damage. Need someone to schedule."],
      ["Amanda Wilson", "(864) 555-0108", "Inspection", 33, "new", "Taylors, SC", "Want an inspection after the storm last weekend."],
      ["Daniel Harris", "(864) 555-0124", "Roof Repair", 41, "appointment", "Spartanburg, SC", "A few shingles blew off. Need them replaced before more rain."],
      ["Jessica Taylor", "(864) 555-0188", "Roof Replacement", 52, "new", "Anderson, SC", "Looking for quotes on a standing-seam metal roof."],
      ["Brian Lewis", "(864) 555-0163", "Inspection", 28 * 60, "missed", "Powdersville, SC", "Can someone look at a sagging section over the garage?"],
      ["Michael Brooks", "(864) 555-0151", "Roof Replacement", 26 * 60, "won", "Greenville, SC", "Need a full tear-off and new architectural shingles."],
      ["Karen White", "(864) 555-0117", "Gutter Repair", 30 * 60, "won", "Fountain Inn, SC", "Gutters are overflowing and pulling off the fascia."],
      ["Steven Clark", "(864) 555-0196", "Roof Repair", 50 * 60, "won", "Travelers Rest, SC", "Skylight is leaking into the kitchen."]
    ];
    var leads = rows.map(function (r) {
      var at = now - r[3] * MIN;
      var lead = {
        id: uid(), name: r[0], phone: r[1], service: r[2], status: r[4], city: r[5], message: r[6],
        email: r[0].toLowerCase().replace(/\s+/g, "") + "@email.com", source: "Website Form", receivedAt: at,
        messages: [], activity: [{ text: "Lead received from Website Form", at: at }], sample: true
      };
      var step = Math.min(r[3] * MIN / 3, 3 * HOUR);
      if (r[4] !== "new" && r[4] !== "missed") lead.activity.push({ text: "Called " + r[1], at: at + step });
      if (r[4] === "appointment" || r[4] === "won") lead.activity.push({ text: "Status changed to Appointment", at: at + step * 1.5 });
      if (r[4] === "won") lead.activity.push({ text: "Status changed to Won", at: at + step * 2.5 });
      if (r[4] === "missed") lead.activity.push({ text: "No contact within 24 hours. Marked as missed.", at: at + DAY });
      return lead;
    });

    // Earlier leads this week (only counted in the chart), shaped to the example trend
    var target = [6, 6, 9, 10, 12, 15, 17], baseline = {}, today = startOfDay(now);
    target.forEach(function (n, i) {
      var day = today - (6 - i) * DAY;
      var actual = leads.filter(function (l) { return startOfDay(l.receivedAt) === day; }).length;
      baseline[dayKey(day)] = Math.max(0, n - actual);
    });

    var notifications = leads.filter(function (l) { return now - l.receivedAt < HOUR; }).map(function (l, i) {
      return { id: uid(), leadId: l.id, text: "New lead received", detail: l.name + " • " + l.service, at: l.receivedAt, read: i > 1 };
    });

    return {
      v: 1,
      leads: leads,
      baseline: baseline,
      lastWeekTotal: 62,
      notifications: notifications,
      settings: {
        company: "Roofer Pro", owner: "John Carter", email: "john@rooferpro.com", phone: "(864) 555-0123",
        notifyPhone: "(864) 555-0123", sms: true, email_on: true, sound: true, browser: false, twoStep: false,
        website: "https://yourwebsite.com", connected: true, connUpdated: now - 2 * MIN
      },
      team: [{ name: "John Carter", role: "Owner" }, { name: "Maria Lopez", role: "Office Manager" }],
      showSampleNotice: true
    };
  }

  var state;
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var s = JSON.parse(raw); if (s && s.v === 1 && Array.isArray(s.leads)) return s; }
    } catch (e) { /* storage unavailable */ }
    return seed();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } }
  state = load();

  var ui = { route: "dashboard", tab: "all", q: "", sel: {}, confirmDelete: false, detailTab: "details", editCompany: false, editPhone: false, open: {}, guide: false };

  function lead(id) { for (var i = 0; i < state.leads.length; i++) if (state.leads[i].id === id) return state.leads[i]; return null; }
  function sorted() { return state.leads.slice().sort(function (a, b) { return b.receivedAt - a.receivedAt; }); }
  function count(st) { return state.leads.filter(function (l) { return l.status === st; }).length; }
  function lastLead() { return sorted()[0]; }
  function unread() { return state.notifications.filter(function (n) { return !n.read; }).length; }

  function logActivity(l, text) { l.activity.push({ text: text, at: Date.now() }); }
  function setStatus(l, st) {
    if (!l || l.status === st) return;
    l.status = st;
    logActivity(l, "Status changed to " + STATUS[st].label);
  }
  function markContacted(l, how) {
    if (!l) return;
    logActivity(l, how);
    if (l.status === "new" || l.status === "missed") { l.status = "contacted"; logActivity(l, "Status changed to Contacted"); }
    save();
  }

  // ---------- Toast ----------
  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg; t.hidden = false;
    t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2800);
  }

  // ---------- New leads + instant alert ----------
  var SAMPLES = [
    ["Emily Johnson", "(864) 555-0142", "Storm Damage", "Greenville, SC", "Tree limb came down on the roof last night. Need someone ASAP."],
    ["Marcus Lee", "(864) 555-0193", "Roof Replacement", "Greer, SC", "Looking for a quote on a full replacement this fall."],
    ["Olivia Martinez", "(864) 555-0128", "Leak Repair", "Simpsonville, SC", "Water stain on the bedroom ceiling keeps growing."],
    ["David Wilson", "(864) 555-0176", "Inspection", "Easley, SC", "Need an inspection for an insurance claim."],
    ["Ava Thompson", "(864) 555-0111", "Gutter Repair", "Mauldin, SC", "Gutter on the back of the house is hanging loose."]
  ];
  var sampleIdx = 0;

  function addLead(data, isTest) {
    var now = Date.now();
    var l = {
      id: uid(), name: data.name, phone: data.phone, service: data.service || "Roof Repair",
      email: data.email || "", city: data.city || "", message: data.message || "",
      source: isTest ? "Test Lead" : "Website Form", status: "new", receivedAt: now,
      messages: [], activity: [{ text: "Lead received from " + (isTest ? "a test submission" : "Website Form"), at: now }]
    };
    state.leads.push(l);
    state.notifications.unshift({ id: uid(), leadId: l.id, text: "New lead received", detail: l.name + " • " + l.service, at: now, read: false });
    state.notifications = state.notifications.slice(0, 50);
    state.settings.connUpdated = now;
    save();
    render();
    showAlert(l);
    if (state.settings.sound) chime();
    browserNotify(l);
    return l;
  }
  function testLead() {
    var s = SAMPLES[sampleIdx++ % SAMPLES.length];
    addLead({ name: s[0], phone: s[1], service: s[2], city: s[3], message: s[4], email: s[0].toLowerCase().replace(/\s+/g, "") + "@email.com" }, true);
  }

  var alertLead = null, alertTimer;
  function showAlert(l) {
    alertLead = l;
    var now = Date.now();
    $("#alert-time").textContent = clock(now);
    $("#alert-date").textContent = shortDate(now);
    $("#alert-name").textContent = l.name;
    $("#alert-service").textContent = l.service;
    $("#alert-phone").textContent = l.phone;
    $("#alert-call").href = telHref(l.phone);
    $("#alert-call").setAttribute("data-id", l.id);
    $("#alert-text").href = smsHref(l.phone, textTemplate(l));
    $("#alert-text").setAttribute("data-id", l.id);
    var tick = function () {
      var s = Math.max(0, Math.round((Date.now() - l.receivedAt) / 1000));
      $("#alert-ago").textContent = s < 3 ? "Received just now" : "Received " + s + " seconds ago";
    };
    tick(); clearInterval(alertTimer); alertTimer = setInterval(tick, 1000);
    $("#alert").hidden = false;
  }
  function hideAlert() { $("#alert").hidden = true; clearInterval(alertTimer); }
  function textTemplate(l) {
    var first = String(l.name).split(" ")[0];
    return "Hi " + first + ", this is " + state.settings.owner.split(" ")[0] + " with " + state.settings.company +
      ". Thanks for reaching out about your " + String(l.service).toLowerCase() + ". When is a good time to come take a look?";
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
      if (state.settings.browser && "Notification" in window && Notification.permission === "granted") {
        new Notification("New Lead: " + l.name, { body: l.service + " • " + l.phone });
      }
    } catch (e) { /* notifications unavailable */ }
  }

  // ---------- Views ----------
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  }

  function sampleNotice() {
    if (!state.showSampleNotice) return "";
    return '<div class="notice">' + ic("i-bolt") + '<span>You\'re looking at sample leads. Tap <strong>Test Lead</strong> to see an instant alert, or reset the sample data any time in Settings.</span>' +
      '<button type="button" data-action="hide-notice" aria-label="Dismiss">' + ic("i-x") + "</button></div>";
  }

  function viewDashboard() {
    var s = state.settings, last = lastLead();
    var newC = count("new"), contacted = count("contacted") + count("appointment"), won = count("won"), missed = count("missed");
    var stat = function (tab, icon, tone, n, label, sub) {
      return '<button type="button" class="card stat" data-action="goto-tab" data-tab="' + tab + '">' +
        '<span class="stat-ico ' + tone + '">' + ic(icon) + "</span>" +
        '<span><b>' + n + '</b><span class="lbl">' + label + "</span><small>" + sub + "</small></span>" + ic("i-chev") + "</button>";
    };
    var recent = sorted().slice(0, 5).map(function (l) {
      return '<li><a href="#lead-' + l.id + '"><span class="avatar">' + ic("i-user") + '</span><span class="who"><strong>' + esc(l.name) +
        "</strong><span>" + esc(l.service) + '</span></span><span class="when">' + relEl(l.receivedAt) + "</span>" + pill(l.status) + ic("i-chev", "ico chev") + "</a></li>";
    }).join("");

    return sampleNotice() +
      '<div class="dash-head"><div><h1>' + greeting() + ", " + esc(s.owner.split(" ")[0]) + '.</h1><p>Here\'s what\'s happening with your leads today.</p></div>' +
      '<a href="#connection" class="conn-chip' + (s.connected ? "" : " off") + '"><span class="ok">' + ic(s.connected ? "i-check" : "i-x") + "</span><div><strong>" +
      (s.connected ? "Website Connected" : "Website Not Connected") + "</strong><span>" +
      (s.connected ? "Your website is actively sending leads." : "Connect your site to start receiving leads.") + "</span></div>" + ic("i-chev") + "</a></div>" +
      '<div class="stats">' +
      stat("new", "i-bell", "tone-blue", newC, "New Leads", "Need your attention") +
      stat("contacted", "i-phone", "tone-teal", contacted, "Contacted", "Called or texted") +
      stat("won", "i-check", "tone-green", won, "Won / Closed", "Jobs completed") +
      stat("missed", "i-x", "tone-red", missed, "Missed", "Did not get in touch") +
      "</div>" +
      '<div class="dash-grid">' +
      '<section class="card card-pad"><div class="card-head"><h2>Recent Lead Activity</h2><a href="#leads" class="link" data-action="goto-tab" data-tab="all">View All</a></div>' +
      (recent ? '<ul class="recent">' + recent + "</ul>" : '<div class="empty"><strong>No leads yet</strong>New website leads show up here the moment they arrive.</div>') +
      "</section>" +
      '<div class="dash-right">' +
      '<section class="card card-pad">' + chartCard() + "</section>" +
      '<section class="card card-pad"><div class="card-head"><h2>Quick Actions</h2></div><div class="quick">' +
      '<a href="#leads" class="btn btn-primary" data-action="goto-tab" data-tab="all">View All Leads</a>' +
      '<button type="button" class="btn btn-ghost" data-action="test-lead">' + ic("i-chat") + "Test Lead</button>" +
      (last ? '<a class="btn btn-call" href="' + telHref(last.phone) + '" data-action="call" data-id="' + last.id + '">' + ic("i-call") + "Call newest lead</a>" : "") +
      '<a href="#connection" class="btn btn-ghost">' + ic("i-globe") + "Website Setup</a>" +
      "</div></section></div></div>";
  }

  function weekData() {
    var today = startOfDay(Date.now()), out = [];
    for (var i = 6; i >= 0; i--) {
      var day = today - i * DAY;
      var n = (state.baseline[dayKey(day)] || 0) + state.leads.filter(function (l) { return startOfDay(l.receivedAt) === day; }).length;
      out.push({ label: DAYS[new Date(day).getDay()], n: n });
    }
    return out;
  }
  function chartCard() {
    var data = weekData(), total = data.reduce(function (a, d) { return a + d.n; }, 0);
    var pct = state.lastWeekTotal ? Math.round((total - state.lastWeekTotal) / state.lastWeekTotal * 100) : 0;
    var W = 340, H = 150, L = 26, R = 20, T = 14, B = 22;
    var max = Math.max(5, Math.ceil(Math.max.apply(null, data.map(function (d) { return d.n; })) / 5) * 5);
    var x = function (i) { return L + i * (W - L - R) / 6; };
    var y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var ticks = "", step = max / 4;
    for (var k = 0; k <= 4; k++) {
      var v = Math.round(k * step);
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
    return '<div class="card-head"><h2>Leads This Week</h2><span class="trend' + (pct < 0 ? " down" : "") + '">' + (pct >= 0 ? "+" : "") + pct + "% " + ic("i-arrow-ur") + "</span></div>" +
      '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + total + ' leads in the last 7 days">' +
      '<defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1463ff" stop-opacity=".22"/><stop offset="1" stop-color="#1463ff" stop-opacity="0"/></linearGradient></defs>' +
      ticks + '<path d="' + area + '" fill="url(#area)"/><polyline class="ln" points="' + pts.join(" ") + '"/>' + dots + endLabel + "</svg>" +
      '<p class="hint">' + total + " leads in the last 7 days, compared with " + state.lastWeekTotal + " the week before.</p>";
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
        '<div class="lt-cust"><span class="avatar">' + ic("i-user") + '</span><span class="who"><strong>' + esc(l.name) + '</strong><span class="num">' + esc(l.phone) + "</span></span></div>" +
        '<span class="lt-cell lt-svc">' + esc(l.service) + "</span>" +
        '<span class="lt-cell lt-source">' + esc(l.source) + "</span>" +
        '<span class="lt-cell lt-when">' + relEl(l.receivedAt) + "</span>" +
        '<span class="lt-status">' + pill(l.status) + "</span>" +
        '<div class="lt-actions"><a class="btn btn-call btn-sm" href="' + telHref(l.phone) + '" data-action="call" data-id="' + l.id + '">' + ic("i-call") + "Call</a>" +
        '<a class="btn btn-primary btn-sm" href="' + smsHref(l.phone, textTemplate(l)) + '" data-action="text" data-id="' + l.id + '">' + ic("i-chat") + "Text</a>" + ic("i-chev") + "</div></div>";
    }).join("");
    return bulk + head + '<div class="lt-body">' + rows + "</div>";
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
      body = (l.message ? '<div class="thread"><div class="bubble them">' + esc(l.message) + "<small>Website form • " + rel(l.receivedAt) + "</small></div>" + thread + "</div>" : '<div class="thread">' + thread + "</div>") +
        '<form id="msg-form" data-id="' + l.id + '"><div class="field"><label for="msg-body">Text message</label><textarea id="msg-body" class="textarea">' + esc(textTemplate(l)) + "</textarea></div>" +
        '<div class="form-actions" style="margin-top:10px"><button type="submit" class="btn btn-primary">' + ic("i-chat") + "Text " + esc(l.name.split(" ")[0]) + "</button></div>" +
        '<p class="hint">Opens your phone\'s Messages app with this text ready to send to ' + esc(l.phone) + ".</p></form>";
    } else if (ui.detailTab === "activity") {
      body = '<ul class="timeline">' + l.activity.slice().reverse().map(function (a) {
        return "<li>" + esc(a.text) + "<small>" + fullDate(a.at) + "</small></li>";
      }).join("") + "</ul>";
    } else {
      body = '<h3 class="section-title">Form Submission Details</h3><dl class="dl">' +
        "<dt>Service Requested</dt><dd>" + esc(l.service) + "</dd>" +
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
      '<ul class="contact-list"><li>' + ic("i-phone") + '<span class="num">' + esc(l.phone) + "</span></li>" +
      (l.email ? "<li>" + ic("i-mail") + esc(l.email) + "</li>" : "") +
      (l.city ? "<li>" + ic("i-pin") + esc(l.city) + "</li>" : "") + "</ul></div>" +
      '<div class="profile-cta"><a class="btn btn-call" href="' + telHref(l.phone) + '" data-action="call" data-id="' + l.id + '">' + ic("i-call") + "Call</a>" +
      '<a class="btn btn-primary" href="' + smsHref(l.phone, textTemplate(l)) + '" data-action="text" data-id="' + l.id + '">' + ic("i-chat") + "Text</a></div></div></section>" +
      '<section class="card card-pad"><div class="tabs" style="margin-bottom:18px">' + tabs + "</div>" + body + "</section></div>" +
      '<div class="stack"><section class="card card-pad"><h3 class="section-title">Lead Status</h3><div class="stepper">' +
      stepBtn("new", "New") + sep + stepBtn("contacted", "Contacted") + sep + stepBtn("appointment", "Appointment") + sep + stepBtn("won", "Won") + stepBtn("lost", "Lost") +
      "</div>" + (l.status === "missed" ? '<p class="hint">This lead was marked as missed. Call or text to win it back.</p>' : "") + "</section>" +
      (notes.length ? '<section class="card card-pad"><h3 class="section-title">Notes</h3><ul class="timeline">' + notes.slice().reverse().map(function (a) {
        return "<li>" + esc(a.note) + "<small>" + fullDate(a.at) + "</small></li>";
      }).join("") + "</ul></section>" : "") +
      '<section class="card card-pad"><h3 class="section-title">Quick Facts</h3><div class="kv">' +
      "<div><span>Time since lead came in</span><strong>" + relEl(l.receivedAt) + "</strong></div>" +
      "<div><span>Contact attempts</span><strong>" + l.activity.filter(function (a) { return /^(Called|Texted)/.test(a.text); }).length + "</strong></div>" +
      '</div><div class="form-actions" style="margin-top:16px"><button type="button" class="btn btn-ghost btn-sm" data-action="delete-lead" data-id="' + l.id + '">' + (ui.confirmDelete ? "Tap again to delete this lead" : "Delete lead") + "</button></div></section>" +
      "</div></div>";
  }

  function viewNotifications() {
    var items = state.notifications.map(function (n) {
      var l = lead(n.leadId);
      return '<li class="' + (n.read ? "" : "unread") + '"><a href="' + (l ? "#lead-" + n.leadId : "#leads") + '" data-action="read-notif" data-nid="' + n.id + '">' +
        '<span class="avatar">' + ic("i-bell") + '</span><span class="who"><strong>' + esc(n.text) + "</strong><span>" + esc(n.detail) + "</span></span>" +
        '<span class="muted" style="font-size:12px;white-space:nowrap">' + relEl(n.at) + "</span>" + ic("i-chev") + "</a></li>";
    }).join("");
    return '<div class="page-head"><div><h1>Notifications</h1><p>Every alert Command Hub has sent you.</p></div><div class="form-actions">' +
      '<button type="button" class="btn btn-ghost" data-action="read-all"' + (unread() ? "" : " disabled") + ">Mark all as read</button>" +
      '<button type="button" class="btn btn-primary" data-action="test-lead">' + ic("i-bolt") + "Send Test Alert</button></div></div>" +
      '<section class="card">' + (items ? '<ul class="notif-list">' + items + "</ul>" : '<div class="empty"><strong>No notifications yet</strong>You\'ll get an alert here the moment a lead comes in.</div>') + "</section>";
  }

  var SNIPPET = [
    '<form action="YOUR-COMMAND-HUB-FORM-ADDRESS" method="POST">',
    '  <input name="name" placeholder="Name" required>',
    '  <input name="phone" type="tel" placeholder="Phone" required>',
    '  <input name="email" type="email" placeholder="Email">',
    '  <input name="service" placeholder="Service Needed">',
    '  <textarea name="message" placeholder="How can we help?"></textarea>',
    '  <button type="submit">Submit</button>',
    "</form>"
  ].join("\n");

  function viewConnection() {
    var s = state.settings, last = lastLead();
    return '<div class="page-head"><div><h1>Website Connection</h1><p>Connect your website so we can receive and immediately alert you of new leads.</p></div></div>' +
      '<div class="conn-grid"><div class="stack">' +
      '<section class="card card-pad"><div class="conn-status"><span class="big-dot' + (s.connected ? "" : " off") + '"></span><div style="flex:1">' +
      '<h2 class="' + (s.connected ? "" : "off") + '">' + (s.connected ? "Connected" : "Not Connected") + "</h2>" +
      '<p class="muted" style="margin:4px 0 0">' + (s.connected ? (last ? "Last lead received: " + relEl(last.receivedAt) : "Waiting for your first lead.") : "Leads from your website are paused.") + "</p></div>" +
      (last && s.connected ? '<a class="link" href="#lead-' + last.id + '">View Lead</a>' : "") + "</div>" +
      '<div class="form-actions" style="margin-top:16px"><button type="button" class="btn btn-ghost btn-sm" data-action="toggle-conn">' + (s.connected ? "Pause connection" : "Reconnect") + "</button>" +
      '<button type="button" class="btn btn-primary btn-sm" data-action="test-lead">' + ic("i-bolt") + "Send a test lead</button></div></section>" +
      '<section class="card card-pad"><h3 class="section-title">Connection Details</h3><form id="site-form" class="kv">' +
      '<div class="field"><label for="site-url">Website URL</label><input id="site-url" class="input" type="url" value="' + esc(s.website) + '" placeholder="https://yourwebsite.com"/></div>' +
      '<div><span>Form Status</span><strong class="' + (s.connected ? "ok" : "") + '">' + (s.connected ? "Active" : "Paused") + "</strong></div>" +
      "<div><span>Last Updated</span><strong>" + fullDate(s.connUpdated) + "</strong></div>" +
      '<div class="form-actions"><button type="submit" class="btn btn-ghost btn-sm">Save website</button></div></form></section></div>' +
      '<div class="stack"><section class="card card-pad"><h3 class="section-title">Need to set up your website?</h3>' +
      '<p class="muted" style="margin:0 0 14px">Follow our simple guide to connect your form.</p>' +
      '<button type="button" class="btn btn-outline" data-action="guide" aria-expanded="' + ui.guide + '">' + (ui.guide ? "Hide Setup Guide" : "View Setup Guide") + "</button>" +
      (ui.guide ? '<div style="margin-top:18px"><ol class="steps-list"><li>Open the page on your website that has your contact or quote form.</li>' +
        "<li>Replace the form with the code below, or send it to whoever manages your site.</li>" +
        "<li>Your personal form address replaces <strong>YOUR-COMMAND-HUB-FORM-ADDRESS</strong> once your account is live.</li>" +
        "<li>Submit the form once yourself. You should get an alert within seconds.</li></ol>" +
        '<div class="code-wrap"><pre class="code" id="snippet">' + esc(SNIPPET) + '</pre><button type="button" class="btn btn-ghost btn-sm" data-action="copy">' + ic("i-copy") + "Copy</button></div></div>" : "") +
      "</section>" +
      '<section class="card card-pad"><h3 class="section-title">Try it like a customer</h3><p class="muted" style="margin:0 0 14px">Fill out this sample website form to see the lead land in Command Hub.</p>' +
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
    var toggle = function (key, icon, label, sub) {
      return '<div class="toggle-row">' + ic(icon) + '<span class="who"><strong>' + label + "</strong><span>" + sub + "</span></span>" +
        '<button type="button" class="switch" role="switch" aria-label="' + label + '" aria-checked="' + !!s[key] + '" data-action="switch" data-key="' + key + '"></button></div>';
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
      '<div class="field"><label for="c-email">Email</label><input id="c-email" class="input" type="email" value="' + esc(s.email) + '"/></div>' +
      '<div class="field"><label for="c-phone">Phone</label><input id="c-phone" class="input" type="tel" value="' + esc(s.phone) + '"/></div>' +
      '<div class="form-actions span-2"><button type="submit" class="btn btn-primary btn-sm">Save</button><button type="button" class="btn btn-ghost btn-sm" data-action="edit-company">Cancel</button></div></form>' :
      '<div class="company"><span class="avatar">' + ic("i-user") + '</span><dl><dd><strong>' + esc(s.company) + "</strong></dd><dd>" + esc(s.owner) + "</dd><dd>" + esc(s.email) + '</dd><dd class="num">' + esc(s.phone) + "</dd></dl></div>";

    var phoneRow = ui.editPhone ?
      '<form id="phone-form" class="inline-form" style="padding:12px 0;border-top:1px solid var(--line)"><input id="notify-phone" class="input" type="tel" required value="' + esc(s.notifyPhone) + '" aria-label="Notification phone number"/><button type="submit" class="btn btn-primary btn-sm">Save</button></form>' :
      '<div class="toggle-row">' + ic("i-phone") + '<span class="who"><strong>Notification Phone Number</strong><span class="num">' + esc(s.notifyPhone) + '</span></span><button type="button" class="link" data-action="edit-phone">Edit</button></div>';

    return '<div class="page-head"><div><h1>Settings</h1><p>Manage your account, notifications, and more.</p></div></div>' +
      '<div class="settings-grid"><div class="stack">' +
      '<section class="card card-pad"><div class="card-head"><h2>Company Information</h2>' + (ui.editCompany ? "" : '<button type="button" class="link" data-action="edit-company">Edit</button>') + "</div>" + company + "</section>" +
      '<section class="card card-pad"><div class="card-head"><h2>Notifications</h2></div>' +
      toggle("sms", "i-chat", "SMS Notifications", "Text me when a new lead comes in") +
      toggle("email_on", "i-mail", "Email Notifications", "Email me a copy of every lead") +
      toggle("sound", "i-bell", "New Lead Alert Sound", "Play a chime with the alert") +
      toggle("browser", "i-bolt", "Browser Alerts", "Pop-up alerts from this browser") +
      phoneRow + '<p class="hint">Text and email alerts go out once your website is connected to your live account.</p></section></div>' +
      '<section class="card card-pad">' +
      menu("website", "i-globe", "Website Connection", "Manage your website integration", function () {
        return '<p class="muted" style="margin:0 0 10px">' + (s.connected ? "Connected to " + esc(s.website) : "Not connected") + '</p><a href="#connection" class="btn btn-ghost btn-sm">Open Website Connection</a>';
      }) +
      menu("team", "i-users", "Team Members", "Add or remove team members", function () {
        return '<ul class="team">' + state.team.map(function (m, i) {
          return '<li><span class="me-av">' + esc(initials(m.name)) + '</span><span class="who"><strong>' + esc(m.name) + "</strong><span>" + esc(m.role) + "</span></span>" +
            (i === 0 ? "" : '<button type="button" class="link" data-action="remove-member" data-i="' + i + '">Remove</button>') + "</li>";
        }).join("") + '</ul><form id="team-form" class="inline-form"><input id="tm-name" class="input" required placeholder="Name" aria-label="Team member name"/>' +
          '<input id="tm-role" class="input" placeholder="Role" aria-label="Role"/><button type="submit" class="btn btn-primary btn-sm">' + ic("i-plus") + "Add</button></form>";
      }) +
      menu("billing", "i-card", "Billing", "View plan and payment details", function () {
        return '<div class="kv"><div><span>Plan</span><strong>Command Hub Pro — $697/month</strong></div>' +
          "<div><span>Includes</span><strong>Unlimited leads, instant alerts, 1-click call and text, team access</strong></div>" +
          "<div><span>Contract</span><strong>None. Cancel anytime.</strong></div></div>";
      }) +
      menu("security", "i-shield", "Security", "Manage your password and account", function () {
        return '<div class="toggle-row" style="border-top:0">' + ic("i-shield") + '<span class="who"><strong>Two-step verification</strong><span>Ask for a code when signing in on a new device</span></span>' +
          '<button type="button" class="switch" role="switch" aria-label="Two-step verification" aria-checked="' + !!s.twoStep + '" data-action="switch" data-key="twoStep"></button></div>' +
          '<div class="toggle-row"><span class="who"><strong>Sample data</strong><span>Start over with the example leads</span></span>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-action="reset">' + (ui.confirmReset ? "Tap again to reset" : "Reset") + "</button></div>";
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
    var r = parseRoute(), view = $("#view");
    if (r.name !== ui.route || r.id !== ui.routeId) {
      ui.confirmDelete = false; ui.confirmReset = false;
      if (r.name === "lead" && r.id !== ui.routeId) ui.detailTab = "details";
    }
    var changed = r.name !== ui.route || r.id !== ui.routeId;
    ui.route = r.name; ui.routeId = r.id;
    var html = r.name === "leads" ? viewLeads() : r.name === "lead" ? viewLead(r.id) : r.name === "notifications" ? viewNotifications() :
      r.name === "connection" ? viewConnection() : r.name === "settings" ? viewSettings() : viewDashboard();
    view.innerHTML = html;
    var navKey = r.name === "lead" ? "leads" : r.name;
    $$("[data-nav]").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-nav") === navKey); });
    var u = unread();
    $$("[data-unread]").forEach(function (el) { el.hidden = !u; if (el.classList.contains("nav-count")) el.textContent = u; });
    var s = state.settings;
    $("#me-name").textContent = s.owner; $("#me-company").textContent = s.company; $("#me-initials").textContent = initials(s.owner);
    document.title = (u ? "(" + u + ") " : "") + "Command Hub";
    if (changed) window.scrollTo(0, 0);
  }

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
    if (!el && row) { go("lead-" + row.getAttribute("data-open")); return; }
    if (!el) return;
    var a = el.getAttribute("data-action"), id = el.getAttribute("data-id"), l = id ? lead(id) : null;

    switch (a) {
      case "call":
        // Let the tel: link open the phone dialer, and log the attempt.
        markContacted(l, "Called " + (l ? l.phone : ""));
        if (el.id === "alert-call") hideAlert();
        setTimeout(render, 50);
        break;
      case "text":
        markContacted(l, "Texted " + (l ? l.phone : ""));
        if (el.id === "alert-text") hideAlert();
        setTimeout(render, 50);
        break;
      case "test-lead": e.preventDefault(); testLead(); break;
      case "alert-close": hideAlert(); break;
      case "alert-open": hideAlert(); if (alertLead) { markRead(alertLead.id); go("lead-" + alertLead.id); } break;
      case "goto-tab": e.preventDefault(); ui.tab = el.getAttribute("data-tab"); ui.q = ""; go("leads"); break;
      case "tab": ui.tab = el.getAttribute("data-tab"); ui.confirmDelete = false; render(); break;
      case "sel":
        e.stopPropagation(); ui.sel[id] = el.checked; ui.confirmDelete = false; refreshRows(); break;
      case "sel-all":
        filtered().forEach(function (x) { ui.sel[x.id] = el.checked; }); ui.confirmDelete = false; refreshRows(); break;
      case "bulk-clear": ui.sel = {}; ui.confirmDelete = false; refreshRows(); break;
      case "bulk-contacted":
        Object.keys(ui.sel).forEach(function (k) { var x = lead(k); if (ui.sel[k] && x && x.status !== "contacted") setStatus(x, "contacted"); });
        ui.sel = {}; save(); render(); toast("Marked as contacted"); break;
      case "bulk-delete":
        if (!ui.confirmDelete) { ui.confirmDelete = true; refreshRows(); break; }
        var n = 0;
        state.leads = state.leads.filter(function (x) { if (ui.sel[x.id]) { n++; return false; } return true; });
        ui.sel = {}; ui.confirmDelete = false; save(); render(); toast(n + (n === 1 ? " lead deleted" : " leads deleted")); break;
      case "detail-tab": ui.detailTab = el.getAttribute("data-tab"); render(); break;
      case "status":
        setStatus(l, el.getAttribute("data-status")); save(); render(); toast("Status set to " + STATUS[l.status].label); break;
      case "delete-lead":
        if (!ui.confirmDelete) { ui.confirmDelete = true; render(); break; }
        state.leads = state.leads.filter(function (x) { return x.id !== id; });
        ui.confirmDelete = false; save(); go("leads"); toast("Lead deleted"); break;
      case "read-notif": markRead(null, el.getAttribute("data-nid")); break;
      case "read-all": state.notifications.forEach(function (x) { x.read = true; }); save(); render(); break;
      case "hide-notice": state.showSampleNotice = false; save(); render(); break;
      case "toggle-conn":
        state.settings.connected = !state.settings.connected; state.settings.connUpdated = Date.now(); save(); render();
        toast(state.settings.connected ? "Website reconnected" : "Connection paused"); break;
      case "guide": ui.guide = !ui.guide; render(); break;
      case "copy": copySnippet(); break;
      case "switch": toggleSwitch(el.getAttribute("data-key")); break;
      case "menu": var k = el.getAttribute("data-key"); ui.open[k] = !ui.open[k]; render(); break;
      case "edit-company": ui.editCompany = !ui.editCompany; render(); break;
      case "edit-phone": ui.editPhone = true; render(); var p = $("#notify-phone"); if (p) p.focus(); break;
      case "remove-member": state.team.splice(+el.getAttribute("data-i"), 1); save(); render(); break;
      case "reset":
        if (!ui.confirmReset) { ui.confirmReset = true; render(); break; }
        state = seed(); ui = { route: "", tab: "all", q: "", sel: {}, detailTab: "details", open: {}, guide: false };
        save(); go("dashboard"); toast("Sample data restored"); break;
    }
  });

  function markRead(leadId, nid) {
    state.notifications.forEach(function (x) { if (x.id === nid || (leadId && x.leadId === leadId)) x.read = true; });
    save();
  }

  function toggleSwitch(key) {
    var s = state.settings;
    if (key === "browser" && !s.browser) {
      try {
        if (!("Notification" in window)) { toast("This browser doesn't support pop-up alerts."); return; }
        Notification.requestPermission().then(function (p) {
          if (p === "granted") { s.browser = true; save(); render(); toast("Browser alerts turned on"); }
          else toast("Pop-up alerts are blocked. Allow notifications for this site in your browser settings.");
        }).catch(function () { toast("Pop-up alerts are blocked in this browser."); });
      } catch (e) { toast("Pop-up alerts are blocked in this browser."); }
      return;
    }
    s[key] = !s[key];
    if (key === "sound" && s.sound) chime();
    save(); render();
  }

  function copySnippet() {
    var done = function () { toast("Form code copied"); };
    var fallback = function () {
      var pre = $("#snippet"); if (!pre) return;
      var range = document.createRange(); range.selectNodeContents(pre);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      toast("Code selected. Copy it with your device's copy command.");
    };
    try { navigator.clipboard.writeText(SNIPPET).then(done, fallback); } catch (e) { fallback(); }
  }

  document.addEventListener("submit", function (e) {
    var f = e.target;
    e.preventDefault();
    var s = state.settings, l;
    switch (f.id) {
      case "top-search":
        ui.q = $("#top-search-input").value; ui.tab = "all"; go("leads"); break;
      case "msg-form":
        l = lead(f.getAttribute("data-id")); var body = $("#msg-body").value.trim();
        if (!l || !body) return;
        l.messages.push({ from: "you", text: body, at: Date.now() });
        markContacted(l, "Texted " + l.phone);
        render();
        location.href = smsHref(l.phone, body);
        break;
      case "note-form":
        l = lead(f.getAttribute("data-id")); var note = $("#note-body").value.trim();
        if (!l || !note) return;
        l.activity.push({ text: "Note added", note: note, at: Date.now() }); save(); render(); toast("Note saved"); break;
      case "site-form":
        s.website = $("#site-url").value.trim() || s.website; s.connUpdated = Date.now(); save(); render(); toast("Website saved"); break;
      case "demo-form":
        addLead({ name: $("#df-name").value.trim(), phone: $("#df-phone").value.trim(), service: $("#df-service").value, email: $("#df-email").value.trim(), message: $("#df-msg").value.trim() }, false);
        break;
      case "company-form":
        s.company = $("#c-company").value.trim(); s.owner = $("#c-owner").value.trim(); s.email = $("#c-email").value.trim(); s.phone = $("#c-phone").value.trim();
        ui.editCompany = false; save(); render(); toast("Company information saved"); break;
      case "phone-form":
        s.notifyPhone = $("#notify-phone").value.trim(); ui.editPhone = false; save(); render(); toast("Notification number saved"); break;
      case "team-form":
        state.team.push({ name: $("#tm-name").value.trim(), role: $("#tm-role").value.trim() || "Team Member" }); save(); render(); toast("Team member added"); break;
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

  // Keep tabs on other open windows in sync
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) { state = load(); render(); }
  });

  render();
})();
