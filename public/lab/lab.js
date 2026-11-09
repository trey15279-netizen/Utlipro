// SECURITY LAB: Smart Contract Security Academy.
// One-page app with plain #name routes (they survive being hosted inside other pages):
//   #dashboard  #academy  #level-<n>  #lesson-<id>-<step>  #done-<id>
//   #practice   #codelab  #challenge-<id>  #guide  #guide-<id>  #progress
// Hub pages show the main navigation. Focused pages (lessons, challenges, Code Lab)
// show a Back button, progress, and one primary action in the bottom bar.
// Progress saves automatically to this browser's localStorage.
"use strict";
(function () {
  const LEVELS = window.SL_LEVELS, GUIDE = window.SL_GUIDE, CH = window.SL_CHALLENGES;
  const TIERS = window.SL_TIERS, LAB = window.SL_CODELAB, GLOSS = window.SL_GLOSSARY;
  const KEY = "security-lab-academy-v3";
  const STEPS = ["The concept", "Visual explanation", "Code example", "Important line", "Why it matters", "Check your understanding"];
  const SKILLS = [
    ["recognition", "Vulnerability recognition", 3],
    ["code", "Code-reading ability", 1],
    ["exploit", "Exploit-path understanding", 4],
    ["testing", "Testing ability", 5],
    ["reporting", "Audit-report ability", 7]
  ];

  const $ = (id) => document.getElementById(id);
  const $hdr = $("hdr"), $main = $("main"), $bnav = $("bnav"), $bar = $("bar");

  // ---------- Data preparation ----------
  const lines = (s) => s.replace(/^\n/, "").replace(/\n\s*$/, "").split("\n");
  const GUIDE_BY = Object.fromEntries(GUIDE.map((g) => [g.id, g]));
  const LESSONS = [];
  LEVELS.forEach((L) => L.lessons.forEach((l, i) => {
    l.level = L; l.index = i; l.skill = l.skill || L.skill;
    l.danger = [3, 4, 6].includes(L.n);
    if (l.guide) {
      const g = GUIDE_BY[l.guide];
      l.file = g.vuln.file; l.code = g.vuln.code; l.hot = g.vuln.hot;
      l.note = g.root; l.why = g.impact + " " + g.mitigation; l.severity = g.severity;
    }
    LESSONS.push(l);
  }));
  const LESSON_BY = Object.fromEntries(LESSONS.map((l) => [l.id, l]));
  const CH_BY = Object.fromEntries(CH.map((c, i) => { c.n = i + 1; return [c.id, c]; }));
  const CATEGORIES = [...new Set(CH.map((c) => c.category))];

  // ---------- Saved progress ----------
  const blank = () => ({ lessons: {}, challenges: {}, history: [], skills: {}, days: [], lab: {}, last: null, theme: "dark" });
  let S = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s && typeof s === "object" && s.lessons) return Object.assign(blank(), s);
    } catch (e) { /* storage blocked: start fresh */ }
    return blank();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* keep in memory */ } }
  const lp = (id) => (S.lessons[id] = S.lessons[id] || { step: 0, done: false, tries: 0, wrong: [] });
  const dayKey = (x) => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  function touchDay() { const t = dayKey(new Date()); if (!S.days.includes(t)) { S.days.push(t); S.days = S.days.slice(-400); } }
  function recordSkill(k, ok) { const s = (S.skills[k] = S.skills[k] || { n: 0, c: 0 }); s.n++; if (ok) s.c++; }

  // ---------- Derived progress ----------
  const pad = (n) => String(n).padStart(2, "0");
  const isDone = (l) => !!(S.lessons[l.id] && S.lessons[l.id].done);
  const levelDone = (L) => L.lessons.every(isDone);
  const levelUnlocked = (L) => L.n === 1 || levelDone(LEVELS[L.n - 2]);
  const levelCount = (L) => L.lessons.filter(isDone).length;
  const lessonsDone = () => LESSONS.filter(isDone).length;
  const tierUnlocked = (t) => t === 0 || CH.filter((c) => c.tier === t - 1).every((c) => S.challenges[c.id]);
  const answered = () => CH.filter((c) => S.challenges[c.id]);
  function accuracy(list) {
    const a = list || answered();
    if (!a.length) return null;
    return Math.round(100 * a.filter((c) => S.challenges[c.id].correct).length / a.length);
  }
  function nextLesson() {
    const last = S.last && LESSON_BY[S.last];
    if (last && !isDone(last) && levelUnlocked(last.level)) return last;
    return LESSONS.find((l) => !isDone(l) && levelUnlocked(l.level)) || null;
  }
  const currentLevel = () => LEVELS.find((L) => levelUnlocked(L) && !levelDone(L)) || LEVELS[LEVELS.length - 1];
  function streak() {
    const set = new Set(S.days), d = new Date();
    if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function categoryStats() {
    return CATEGORIES.map((cat) => {
      const list = answered().filter((c) => c.category === cat);
      return { cat, n: list.length, acc: accuracy(list), total: CH.filter((c) => c.category === cat).length };
    });
  }
  function weakestTopic() {
    const cats = categoryStats().filter((c) => c.n > 0).sort((a, b) => a.acc - b.acc);
    if (cats.length && cats[0].acc < 100) return { label: cats[0].cat, detail: cats[0].acc + "% challenge accuracy" };
    const sk = SKILLS.map(([k, name]) => ({ name, s: S.skills[k] })).filter((x) => x.s && x.s.n >= 3).sort((a, b) => a.s.c / a.s.n - b.s.c / b.s.n);
    if (sk.length && sk[0].s.c < sk[0].s.n) return { label: sk[0].name, detail: Math.round(100 * sk[0].s.c / sk[0].s.n) + "% first-try accuracy" };
    return null;
  }
  function skillStatus(k) {
    const s = S.skills[k] || { n: 0, c: 0 };
    const pct = s.n ? Math.round(100 * s.c / s.n) : 0;
    if (s.n < 3) return { s, pct, label: "Not yet demonstrated", tone: "muted" };
    if (pct < 50) return { s, pct, label: "Needs work", tone: "danger" };
    if (pct < 80) return { s, pct, label: "Developing", tone: "warning" };
    if (s.n < 6) return { s, pct, label: "Promising", tone: "accent" };
    return { s, pct, label: "Proficient", tone: "success" };
  }
  function rank() {
    const prof = SKILLS.filter(([k]) => skillStatus(k).label === "Proficient").length;
    return prof >= 5 ? "Senior Researcher" : prof >= 3 ? "Researcher" : prof >= 1 ? "Junior Researcher" : "Trainee";
  }

  // ---------- Helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Glossary markup: {{key}} or {{key|shown text}} → a tappable term with a definition tooltip.
  const rich = (s) => esc(s).replace(/\{\{([^}|]+)(?:\|([^}]+))?\}\}/g, (m, k, t) =>
    GLOSS[k] ? '<button type="button" class="term" data-term="' + esc(k) + '" aria-expanded="false">' + (t || k) + "</button>" : (t || k));
  const termsIn = (s) => [...new Set((s.match(/\{\{([^}|]+)/g) || []).map((m) => m.slice(2)))].filter((k) => GLOSS[k]);
  const go = (h) => { if (location.hash === "#" + h) route(); else location.hash = h; };

  const ICONS = {
    logo: '<path d="M12 2.5 20.2 7.2v9.6L12 21.5l-8.2-4.7V7.2z"/><circle cx="12" cy="10.6" r="2.1"/><path d="M12 12.7v3.6"/>',
    dashboard: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    academy: '<path d="m12 3.5 9 5-9 5-9-5z"/><path d="m3 13.5 9 5 9-5"/>',
    practice: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.8"/>',
    guide: '<path d="M2.5 5h6a3.5 3.5 0 0 1 3.5 3.5V20a3 3 0 0 0-3-3H2.5z"/><path d="M21.5 5h-6A3.5 3.5 0 0 0 12 8.5V20a3 3 0 0 1 3-3h6.5z"/>',
    progress: '<path d="M3 12h4l3 7 4-14 3 7h4"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.3 2.4 2.4 4.6-5"/>',
    xCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chev: '<path d="m9.5 6 6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z"/>',
    play: '<path d="M7.5 5v14l11-7z"/>',
    alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.1"/>',
    file: '<path d="M14 3H6.5v18h11V6.5z"/><path d="M14 3v3.5h3.5"/>',
    flame: '<path d="M12 3c3 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-3-1-5 0-7z"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.5 10a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7.2 15h9.6"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    fn: '<path d="M10.5 20c2 0 3-1 3.4-3l2-10c.4-2 1.4-3 3.1-3M8 10h9"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4"/>',
    reset: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
    layers: '<path d="m12 3.5 9 5-9 5-9-5z"/><path d="m3 13.5 9 5 9-5"/>'
  };
  const icon = (n, cls) => '<svg class="i ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[n] || ICONS.info) + "</svg>";

  // ---------- Solidity highlighter ----------
  const KW = new Set("pragma solidity contract interface library is function modifier event emit returns return if else for while do break continue new delete import from using memory storage calldata public private internal external view pure payable virtual override constant immutable constructor receive fallback struct enum mapping require revert assert try catch unchecked true false this super".split(" "));
  const TY = new Set("address bool string bytes bytes4 bytes32 uint uint8 uint16 uint96 uint112 uint128 uint256 int int256 ether wei gwei".split(" "));
  const GL = new Set("msg tx block abi keccak256 ecrecover type vm".split(" "));
  function hl(t, lang) {
    if (lang === "text") return esc(t);
    const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|(\b0x[0-9a-fA-F]+\b|\b\d[\d_]*(?:e\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([\s\S])/g;
    let out = "", m;
    while ((m = re.exec(t))) {
      const s = m[0];
      if (m[1]) out += '<span class="t-c">' + esc(s) + "</span>";
      else if (m[2]) out += '<span class="t-s">' + esc(s) + "</span>";
      else if (m[3]) out += '<span class="t-n">' + esc(s) + "</span>";
      else if (m[4]) {
        let cls = KW.has(s) ? "t-k" : TY.has(s) ? "t-t" : GL.has(s) ? "t-g" : "";
        if (!cls && /^\s*[({]/.test(t.slice(m.index + s.length))) cls = "t-f";
        else if (!cls && /^[A-Z]/.test(s)) cls = "t-y";
        out += cls ? '<span class="' + cls + '">' + esc(s) + "</span>" : esc(s);
      } else out += esc(s);
    }
    return out;
  }
  // A code panel. marks: { line: "danger" | "accent" | "safe" }. pickable: each line is a button.
  function editor(o) {
    const ls = lines(o.code);
    return '<div class="ed"' + (o.id ? ' id="' + o.id + '"' : "") + '><div class="ed-head"><span class="ed-file">' + icon("file") + esc(o.file || "code") + "</span>" + (o.right || "") + "</div>" +
      '<div class="ed-body"' + (o.pickable ? ' role="group" aria-label="Code lines. Select a line."' : "") + ">" +
      ls.map((t, i) => {
        const n = i + 1, mk = o.marks && o.marks[n];
        const cls = "ln" + (mk ? " m-" + mk : "") + (o.pick === n ? " is-picked" : "") + (o.range && n >= o.range[0] && n <= o.range[1] ? " in-range" : "");
        const attrs = o.pickable ? ' role="button" tabindex="0" aria-pressed="' + (o.pick === n) + '" aria-label="Line ' + n + ": " + esc(t.trim() || "blank") + '"' : "";
        return '<div class="' + cls + '" data-line="' + n + '"' + attrs + '><span class="ln-n">' + n + '</span><code class="ln-c">' + (hl(t, o.lang) || " ") + "</code></div>";
      }).join("") + "</div></div>";
  }
  function bindPick(root, fn) {
    if (!root) return;
    root.querySelectorAll(".ln[role=button]").forEach((el) => {
      const pick = () => fn(Number(el.dataset.line));
      el.addEventListener("click", pick);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    });
  }
  function flow(nodes, caption) {
    return '<figure class="flow">' + nodes.map((n) => {
      if (n.startsWith("→")) { const lab = n.slice(1).trim(); return '<div class="fl-arrow"><span class="fl-line" aria-hidden="true"></span>' + (lab ? '<span class="fl-label">' + esc(lab) + "</span>" : "") + "</div>"; }
      const tone = n[0] === "!" ? "danger" : n[0] === "+" ? "safe" : "";
      return '<div class="fl-node' + (tone ? " is-" + tone : "") + '">' + (tone === "danger" ? icon("alert") : tone === "safe" ? icon("check") : '<span class="fl-dot" aria-hidden="true"></span>') + "<span>" + esc(n.replace(/^[!+]/, "")) + "</span></div>";
    }).join("") + (caption ? "<figcaption>" + esc(caption) + "</figcaption>" : "") + "</figure>";
  }
  const sevChip = (s) => '<span class="sev sev-' + s.toLowerCase() + '">' + esc(s) + "</span>";
  function anatomy(g) {
    const vl = lines(g.vuln.code)[g.vuln.hot - 1].trim();
    const cell = (label, body) => '<div class="an-cell"><span class="an-label">' + label + "</span>" + body + "</div>";
    return '<div class="anatomy">' +
      cell("Root cause", "<p>" + esc(g.root) + "</p>") +
      cell("Attacker preconditions", "<ul>" + g.conditions.map((c) => "<li>" + esc(c) + "</li>").join("") + "</ul>") +
      cell("Vulnerable line", '<code class="an-code">L' + g.vuln.hot + "  " + esc(vl) + "</code>") +
      cell("Exploit path", "<ol>" + g.sequence.map((c) => "<li>" + esc(c) + "</li>").join("") + "</ol>") +
      '<div class="an-row">' + cell("Impact", "<p>" + esc(g.impact) + "</p>") + cell("Severity", sevChip(g.severity)) + "</div>" +
      cell("Mitigation", "<p>" + esc(g.mitigation) + "</p>") +
      cell("Test the fix", "<p>" + esc(g.testing[0]) + "</p>") + "</div>";
  }
  const meter = (pct, tone) => '<div class="meter' + (tone ? " t-" + tone : "") + '" aria-hidden="true"><span style="width:' + Math.max(0, Math.min(100, pct)) + '%"></span></div>';

  // ---------- Shell: header, navigation, bottom bar ----------
  const NAV = [["dashboard", "Dashboard", "dashboard"], ["academy", "Academy", "academy"], ["practice", "Practice", "practice"], ["guide", "Field Guide", "guide"], ["progress", "Progress", "progress"]];
  function hubHeader(active) {
    $hdr.innerHTML = '<div class="hdr-in">' +
      '<a class="brand" href="#dashboard" aria-label="SECURITY LAB, dashboard">' + icon("logo", "brand-mark") + '<span class="brand-text"><span class="brand-name">SECURITY LAB</span><span class="brand-sub">Smart Contract Security Academy</span></span></a>' +
      '<nav class="topnav" aria-label="Main">' + NAV.map(([id, label]) => '<a href="#' + id + '"' + (active === id ? ' aria-current="page"' : "") + ">" + label + "</a>").join("") + "</nav>" +
      '<button type="button" class="icon-btn" id="theme-btn" aria-label="Switch to ' + (S.theme === "light" ? "dark" : "light") + ' theme">' + icon(S.theme === "light" ? "moon" : "sun") + "</button></div>";
    $bnav.innerHTML = NAV.map(([id, label, ic]) => '<a href="#' + id + '"' + (active === id ? ' aria-current="page"' : "") + ">" + icon(ic) + "<span>" + (id === "guide" ? "Guide" : label) + "</span></a>").join("");
    $("theme-btn").onclick = () => { S.theme = S.theme === "light" ? "dark" : "light"; save(); applyTheme(); hubHeader(active); };
  }
  function focusHeader(o) {
    // o: { back, backLabel, title, sub, at, of, label }
    $hdr.innerHTML = '<div class="hdr-in focus">' +
      '<a class="back-btn" href="' + o.back + '">' + icon("back") + "<span>" + esc(o.backLabel || "Back") + "</span></a>" +
      '<div class="focus-title"><span class="ft-main">' + esc(o.title) + "</span>" + (o.sub ? '<span class="ft-sub">' + esc(o.sub) + "</span>" : "") + "</div></div>" +
      (o.of ? '<div class="hdr-progress"><div class="segs" role="progressbar" aria-valuemin="0" aria-valuemax="' + o.of + '" aria-valuenow="' + o.at + '" aria-label="' + esc(o.label) + '">' +
        (o.of <= 8 ? Array.from({ length: o.of }, (_, k) => '<span class="seg' + (k < o.at ? " on" : "") + '"></span>').join("") : '<span class="seg-track"><span class="seg-fill" style="width:' + (100 * o.at / o.of) + '%"></span></span>') +
        '</div><span class="segs-label">' + esc(o.label) + "</span></div>" : "");
    $bnav.innerHTML = "";
  }
  const subBack = (href, label) => '<a class="sub-back" href="' + href + '">' + icon("back") + esc(label) + "</a>";
  // Bottom action bar: exactly one primary button, optionally one quiet secondary.
  function actionbar(p, s) {
    if (!p) { $bar.innerHTML = ""; return; }
    $bar.innerHTML = (p.hint ? '<p class="bar-hint">' + esc(p.hint) + "</p>" : "") + '<div class="bar-in">' + (s ? '<button type="button" class="btn btn-ghost" id="bar-s">' + esc(s.label) + "</button>" : "") +
      '<button type="button" class="btn btn-primary btn-lg" id="bar-p"' + (p.disabled ? " disabled" : "") + ">" + (p.icon ? icon(p.icon) : "") + "<span>" + esc(p.label) + "</span>" + (p.icon ? "" : icon("arrow")) + "</button></div>";
    $("bar-p").onclick = p.action;
    if (s) $("bar-s").onclick = s.action;
  }

  // ---------- Tooltips (glossary terms) and modal dialogs ----------
  let tipFor = null;
  function hideTip() { const t = $("tip"); if (t) t.remove(); if (tipFor) { tipFor.setAttribute("aria-expanded", "false"); tipFor.removeAttribute("aria-describedby"); } tipFor = null; }
  function showTip(btn) {
    if (tipFor === btn) { hideTip(); return; }
    hideTip();
    const [term, def] = GLOSS[btn.dataset.term];
    const tip = document.createElement("div");
    tip.id = "tip"; tip.className = "tip"; tip.setAttribute("role", "tooltip");
    tip.innerHTML = "<strong>" + esc(term) + "</strong><p>" + esc(def) + "</p>";
    document.body.appendChild(tip);
    const r = btn.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    const w = Math.min(320, vw - 32);
    tip.style.width = w + "px";
    tip.style.left = Math.max(16, Math.min(vw - 16 - w, r.left + r.width / 2 - w / 2)) + window.scrollX + "px";
    const h = tip.offsetHeight;
    const above = r.bottom + 10 + h > window.innerHeight - 100 && r.top - h - 10 > 70;
    tip.style.top = (above ? r.top - h - 10 : r.bottom + 10) + window.scrollY + "px";
    btn.setAttribute("aria-expanded", "true"); btn.setAttribute("aria-describedby", "tip");
    tipFor = btn;
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-term]");
    if (t) { showTip(t); return; }
    if (!e.target.closest(".tip")) hideTip();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { hideTip(); closeModal(); } });
  window.addEventListener("scroll", () => { if (tipFor) hideTip(); }, { passive: true });

  let modalReturn = null;
  function openModal(o) {
    closeModal();
    modalReturn = document.activeElement;
    const m = document.createElement("div");
    m.className = "modal-back"; m.id = "modal";
    m.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-t" aria-describedby="modal-d"><h2 id="modal-t">' + esc(o.title) + '</h2><p id="modal-d">' + esc(o.body) + "</p>" +
      '<div class="modal-actions"><button type="button" class="btn btn-secondary" id="modal-no">Cancel</button><button type="button" class="btn ' + (o.danger ? "btn-danger" : "btn-primary") + '" id="modal-yes">' + esc(o.confirm) + "</button></div></div>";
    document.body.appendChild(m);
    m.addEventListener("click", (e) => { if (e.target === m) closeModal(); });
    $("modal-no").onclick = closeModal;
    $("modal-yes").onclick = () => { closeModal(); o.onConfirm(); };
    m.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const f = [$("modal-no"), $("modal-yes")];
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[1]) { e.preventDefault(); f[0].focus(); }
    });
    $("modal-no").focus();
  }
  function closeModal() { const m = $("modal"); if (m) { m.remove(); if (modalReturn && modalReturn.isConnected) modalReturn.focus(); modalReturn = null; } }

  // ---------- Hub screens ----------
  const chip = (kind, text) => '<span class="chip chip-' + kind + '">' + (kind === "done" ? icon("check") : kind === "locked" ? icon("lock") : kind === "fail" ? icon("x") : "") + esc(text) + "</span>";
  function levelStatus(L) {
    if (!levelUnlocked(L)) return ["locked", "Locked"];
    if (levelDone(L)) return ["done", "Completed"];
    return L.lessons.some((l) => S.lessons[l.id] && (S.lessons[l.id].done || S.lessons[l.id].step > 0)) ? ["active", "In progress"] : ["open", "Available"];
  }
  function pathList(compact) {
    return '<ol class="path">' + LEVELS.map((L) => {
      const [k, t] = levelStatus(L);
      return '<li class="path-item is-' + k + '"><a class="path-row" href="#level-' + L.n + '">' +
        '<span class="path-node" aria-hidden="true">' + (k === "done" ? icon("check") : k === "locked" ? icon("lock") : pad(L.n)) + "</span>" +
        '<span class="path-text"><span class="path-k">Level ' + pad(L.n) + '</span><span class="path-t">' + esc(L.title) + "</span>" +
        (compact ? "" : '<span class="path-s">' + esc(L.summary) + "</span>") + "</span>" +
        '<span class="path-meta">' + chip(k, t) + '<span class="path-count">' + levelCount(L) + "/" + L.lessons.length + "</span></span></a></li>";
    }).join("") + "</ol>";
  }

  function dashboard() {
    hubHeader("dashboard");
    const nl = nextLesson(), L = currentLevel(), acc = accuracy(), wt = weakestTopic(), st = streak(), done = lessonsDone();
    const stat = (label, value, sub, ic, wide) => '<div class="stat' + (wide ? " stat-wide" : "") + '"><span class="stat-l">' + icon(ic) + label + '</span><span class="stat-v">' + value + "</span>" + (sub ? '<span class="stat-s">' + sub + "</span>" : "") + "</div>";
    let cont;
    if (nl) {
      const p = lp(nl.id);
      cont = '<section class="card feature" aria-labelledby="ct-h"><p class="eyebrow">Continue training</p>' +
        '<p class="feature-k">Level ' + pad(nl.level.n) + " · " + esc(nl.level.title) + "</p>" +
        '<h2 id="ct-h">' + esc(nl.title) + '</h2><p class="muted">' + esc(nl.summary) + "</p>" +
        '<div class="feature-prog"><span>' + (p.step > 0 ? "Step " + p.step + " of 6 · " + STEPS[p.step - 1] : "Not started · 6 short steps") + "</span>" + meter(100 * p.step / 6) + "</div>" +
        '<a class="btn btn-primary btn-lg" href="#lesson-' + nl.id + "-" + Math.max(1, p.step) + '">' + (p.step > 0 ? "Continue lesson" : "Start lesson") + icon("arrow") + "</a></section>";
    } else {
      cont = '<section class="card feature"><p class="eyebrow">Curriculum complete</p><h2>All 7 levels finished</h2><p class="muted">Keep sharpening your judgment in the Challenge Arena.</p><a class="btn btn-primary btn-lg" href="#practice">Open the Challenge Arena' + icon("arrow") + "</a></section>";
    }
    $main.innerHTML = '<div class="page">' +
      '<header class="page-head"><h1 tabindex="-1">Researcher Training</h1><p class="lead">Build the skills to identify, understand, and test smart-contract vulnerabilities.</p></header>' + cont +
      '<section class="stats" aria-label="Your training at a glance">' +
        stat("Current level", "L" + pad(L.n), esc(L.title), "layers") +
        stat("Lessons", done + "<small>/" + LESSONS.length + "</small>", Math.round(100 * done / LESSONS.length) + "% of curriculum", "checkCircle") +
        stat("Challenge accuracy", acc === null ? "—" : acc + "<small>%</small>", answered().length + " of " + CH.length + " attempted", "target") +
        stat("Streak", st + "<small> day" + (st === 1 ? "" : "s") + "</small>", st ? "Train today to keep it" : "Train today to start one", "flame") +
        stat("Weakest topic", wt ? esc(wt.label) : "Not enough data", wt ? esc(wt.detail) : "Answer challenges to find out", "alert", true) +
      "</section>" +
      '<section class="card" aria-labelledby="path-h"><div class="card-head"><h2 id="path-h" class="eyebrow">Your training path</h2><a class="link" href="#academy">Academy' + icon("chev") + "</a></div>" + pathList(true) + "</section>" +
      '<p class="save-note">' + icon("checkCircle") + "Progress saves automatically in this browser.</p></div>";
    actionbar(null);
  }

  function academy() {
    hubHeader("academy");
    const done = lessonsDone();
    $main.innerHTML = '<div class="page"><header class="page-head"><p class="eyebrow">Academy</p><h1 tabindex="-1">Seven levels to professional auditing</h1>' +
      '<p class="lead">Each level unlocks when the previous one is complete. Every lesson ends with a check you must answer correctly.</p>' +
      '<div class="head-prog"><span>' + done + " of " + LESSONS.length + " lessons completed</span>" + meter(100 * done / LESSONS.length) + "</div></header>" +
      pathList(false) + "</div>";
    actionbar(null);
  }

  function levelPage(n) {
    const L = LEVELS[n - 1];
    if (!L) return go("academy");
    hubHeader("academy");
    const unlocked = levelUnlocked(L), cnt = levelCount(L);
    const next = L.lessons.find((l) => !isDone(l));
    const rows = L.lessons.map((l, i) => {
      const p = lp(l.id);
      const st = !unlocked ? ["locked", "Locked"] : p.done ? ["done", "Completed"] : p.step > 0 ? ["active", "Step " + p.step + "/6"] : ["open", "Not started"];
      const inner = '<span class="lr-n">' + L.n + "." + (i + 1) + '</span><span class="lr-text"><span class="lr-t">' + esc(l.title) + '</span><span class="lr-s">' + esc(l.summary) + "</span></span>" + chip(st[0], st[1]);
      return "<li>" + (unlocked ? '<a class="lesson-row" href="#lesson-' + l.id + "-" + (p.done ? 1 : Math.max(1, p.step)) + '">' + inner + "</a>" : '<div class="lesson-row is-locked">' + inner + "</div>") + "</li>";
    }).join("");
    const cta = !unlocked ? "" : '<a class="btn btn-primary btn-lg inline-cta" href="#lesson-' + (next ? next.id + "-" + Math.max(1, lp(next.id).step) : L.lessons[0].id + "-1") + '">' +
      (next ? (cnt || lp(next.id).step ? "Continue: " + esc(next.title) : "Start Level " + pad(L.n)) : "Review this level") + icon("arrow") + "</a>";
    $main.innerHTML = '<div class="page narrow">' + subBack("#academy", "Academy") +
      '<header class="page-head"><p class="eyebrow">Level ' + pad(L.n) + '</p><h1 tabindex="-1">' + esc(L.title) + '</h1><p class="lead">' + esc(L.summary) + "</p>" +
      '<div class="head-prog"><span>' + cnt + " of " + L.lessons.length + " lessons completed</span>" + meter(100 * cnt / L.lessons.length, levelDone(L) ? "success" : "") + "</div></header>" +
      (unlocked ? "" : '<div class="notice notice-muted">' + icon("lock") + "<p>Complete <strong>Level " + pad(L.n - 1) + ": " + esc(LEVELS[L.n - 2].title) + "</strong> to unlock this level.</p></div>") +
      cta + '<ol class="lesson-list">' + rows + "</ol></div>";
    actionbar(null);
  }

  // ---------- Lessons: six steps, one per screen ----------
  const lessonUI = { pick: {}, sel: {} };
  function lessonPage(l, step) {
    if (!levelUnlocked(l.level)) return go("level-" + l.level.n);
    step = Math.max(1, Math.min(6, step || 1));
    const p = lp(l.id);
    if (!p.done) p.step = step;
    S.last = l.id; touchDay(); save();
    const L = l.level;
    focusHeader({ back: step === 1 ? "#level-" + L.n : "#lesson-" + l.id + "-" + (step - 1), backLabel: step === 1 ? "Level " + pad(L.n) : "Back",
      title: l.title, sub: "Level " + pad(L.n) + " · Lesson " + (l.index + 1) + " of " + L.lessons.length, at: step, of: 6, label: "Step " + step + " of 6 · " + STEPS[step - 1] });
    const head = '<p class="step-k"><span>' + pad(step) + "</span>" + STEPS[step - 1] + "</p>";
    const nextStep = () => go("lesson-" + l.id + "-" + (step + 1));
    const ls = lines(l.code);
    const pick = lessonUI.pick[l.id] || p.pick;

    if (step === 1) {
      const terms = termsIn(l.concept);
      $main.innerHTML = '<div class="page narrow">' + head + '<h1 tabindex="-1">' + esc(l.title) + '</h1><p class="lead">' + rich(l.concept) + "</p>" +
        (terms.length ? '<section class="terms" aria-labelledby="kt-h"><h2 id="kt-h" class="eyebrow">Key terms</h2><dl>' + terms.map((k) => "<div><dt>" + esc(GLOSS[k][0]) + "</dt><dd>" + esc(GLOSS[k][1]) + "</dd></div>").join("") + "</dl></section>" : "") +
        '<p class="hint">' + icon("info") + "Tap an underlined term to see its definition.</p></div>";
      actionbar({ label: "Continue", action: nextStep });
    } else if (step === 2) {
      $main.innerHTML = '<div class="page narrow">' + head + '<h1 tabindex="-1">' + esc(l.title) + "</h1>" +
        (l.guide ? '<p class="lead">The full anatomy of this vulnerability, part by part.</p>' + anatomy(GUIDE_BY[l.guide]) : flow(l.flow, l.caption)) + "</div>";
      actionbar({ label: "Continue", action: nextStep });
    } else if (step === 3) {
      $main.innerHTML = '<div class="page narrow">' + head + '<h1 tabindex="-1">Read the code</h1><p class="lead">Which line matters most? Tap it to commit to a guess before the reveal.</p>' +
        editor({ file: l.file, code: l.code, lang: l.lang, pickable: true, pick, id: "lesson-ed" }) +
        '<p class="hint" aria-live="polite">' + icon("info") + (pick ? "You picked line " + pick + "." : "No line selected yet. Guessing is optional.") + "</p></div>";
      bindPick($("lesson-ed"), (n) => { lessonUI.pick[l.id] = n; p.pick = n; save(); lessonPage(l, 3); });
      actionbar({ label: "Show the important line", action: nextStep });
    } else if (step === 4) {
      const kind = l.danger ? "danger" : "accent";
      $main.innerHTML = '<div class="page narrow">' + head + '<h1 tabindex="-1">Line ' + l.hot + " is the one that matters</h1>" +
        editor({ file: l.file, code: l.code, lang: l.lang, marks: { [l.hot]: kind } }) +
        '<div class="callout c-' + kind + '"><span class="callout-k">Line ' + l.hot + '</span><code class="callout-code">' + esc(ls[l.hot - 1].trim()) + "</code><p>" + esc(l.note) + "</p></div>" +
        (pick ? '<p class="pick-result' + (pick === l.hot ? " ok" : "") + '">' + icon(pick === l.hot ? "checkCircle" : "info") + (pick === l.hot ? "You picked line " + pick + ". Exactly right." : "You picked line " + pick + ". Compare it with line " + l.hot + ".") + "</p>" : "") + "</div>";
      actionbar({ label: "Continue", action: nextStep });
    } else if (step === 5) {
      $main.innerHTML = '<div class="page narrow">' + head + '<h1 tabindex="-1">Why it matters</h1><p class="lead">' + rich(l.why) + "</p>" +
        (l.severity ? '<div class="kv"><span>Typical severity</span>' + sevChip(l.severity) + "</div>" : "") +
        (l.danger ? '<div class="notice notice-warning">' + icon("alert") + "<p>Educational example. A real finding requires checking the complete contract and every reachable execution path.</p></div>" : "") + "</div>";
      actionbar({ label: "Check your understanding", action: nextStep });
    } else checkStep(l, p, head);
  }

  function checkStep(l, p, head) {
    const sel = lessonUI.sel[l.id];
    const last = p.lastResult;
    const solved = p.done;
    const showWrong = !!(last && !last.correct && !solved);
    const opts = l.a.map((o, i) => {
      const wrong = (p.wrong || []).includes(i) && !solved;
      let cls = "opt";
      if (solved && i === l.c) cls += " is-right";
      else if (solved) cls += " is-dim";
      else if (wrong) cls += " is-wrong";
      else if (sel === i) cls += " is-sel";
      const dis = solved || wrong || showWrong;
      return '<button type="button" class="' + cls + '" role="radio" aria-checked="' + (solved ? i === l.c : sel === i) + '" data-i="' + i + '"' + (dis ? " disabled" : "") + '><span class="opt-k">' + "ABCD"[i] + '</span><span class="opt-t">' + esc(o) +
        (solved && i === l.c ? '<span class="opt-m">' + icon("check") + "Correct answer</span>" : wrong ? '<span class="opt-m">' + icon("x") + "Not this one</span>" : "") + "</span></button>";
    }).join("");
    let fb = "";
    if (solved) fb = '<div class="feedback f-ok" role="status">' + icon("checkCircle") + "<div><strong>Correct.</strong> " + esc(l.fb) +
      (p.first === false ? '<p class="muted small">You needed more than one try, so this counts as a miss in your ' + esc(SKILLS.find((s) => s[0] === l.skill)[1].toLowerCase()) + " score.</p>" : "") + "</div></div>";
    else if (showWrong) fb = '<div class="feedback f-bad" role="status">' + icon("xCircle") + "<div><strong>Not quite.</strong> “" + esc(l.a[last.choice]) + "” is not the answer. Hint: " + esc(l.note) + "</div></div>";
    $main.innerHTML = '<div class="page narrow">' + head + '<h1 tabindex="-1" class="q">' + esc(l.q) + '</h1><div class="opts" role="radiogroup" aria-label="Answers">' + opts + "</div>" + fb + "</div>";
    $main.querySelectorAll(".opt:not([disabled])").forEach((b) => { b.onclick = () => { lessonUI.sel[l.id] = Number(b.dataset.i); checkStep(l, p, head); }; });

    if (solved) actionbar({ label: "Finish lesson", action: () => go("done-" + l.id) });
    else if (showWrong) actionbar({ label: "Try again", action: () => { p.lastResult = null; lessonUI.sel[l.id] = undefined; save(); checkStep(l, p, head); } });
    else actionbar({ label: "Submit answer", disabled: sel === undefined, hint: sel === undefined ? "Choose an answer, then submit." : "", action: () => {
      const ok = sel === l.c;
      p.tries = (p.tries || 0) + 1;
      if (p.first === undefined) { p.first = ok; recordSkill(l.skill, ok); }
      p.lastResult = { choice: sel, correct: ok };
      if (ok) { p.done = true; p.step = 6; p.doneAt = Date.now(); }
      else p.wrong = (p.wrong || []).concat(sel);
      lessonUI.sel[l.id] = undefined;
      touchDay(); save();
      checkStep(l, p, head);
      const f = $main.querySelector(".feedback");
      if (f) { f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); f.scrollIntoView({ block: "nearest" }); }
    } });
  }

  function donePage(l) {
    const p = lp(l.id);
    if (!p.done) return go("lesson-" + l.id + "-6");
    const L = l.level, cnt = levelCount(L);
    focusHeader({ back: "#level-" + L.n, backLabel: "Level " + pad(L.n), title: "Lesson complete", sub: l.title, at: cnt, of: L.lessons.length, label: cnt + " of " + L.lessons.length + " lessons in Level " + pad(L.n) });
    const nextInLevel = L.lessons.find((x) => !isDone(x));
    const nextL = LEVELS[L.n];
    $main.innerHTML = '<div class="page narrow"><div class="done-head">' + icon("checkCircle", "done-i") + '<p class="eyebrow">Lesson complete</p><h1 tabindex="-1">' + esc(l.title) + "</h1>" +
      '<p class="lead">' + (p.first ? "Answered correctly on the first try." : "Completed after " + p.tries + " tries. This topic is flagged for review on your Progress page.") + "</p></div>" +
      '<section class="card"><h2 class="eyebrow">Key takeaway</h2><p>' + rich(l.why) + "</p></section>" +
      (levelDone(L) ? '<div class="notice notice-success">' + icon("checkCircle") + "<p><strong>Level " + pad(L.n) + " complete.</strong> " + (nextL ? "Level " + pad(nextL.n) + ", " + esc(nextL.title) + ", is now unlocked." : "You have finished the full curriculum.") + "</p></div>" : "") + "</div>";
    let primary;
    if (nextInLevel) primary = { label: "Next lesson", action: () => go("lesson-" + nextInLevel.id + "-" + Math.max(1, lp(nextInLevel.id).step)) };
    else if (nextL) primary = { label: "Start Level " + pad(nextL.n), action: () => go("level-" + nextL.n) };
    else primary = { label: "Open the Challenge Arena", action: () => go("practice") };
    actionbar(primary, { label: "Level overview", action: () => go("level-" + L.n) });
  }

  // ---------- Practice: Code Lab + Challenge Arena ----------
  function nextChallenge(after) {
    const start = after ? CH.indexOf(after) + 1 : 0;
    return CH.slice(start).concat(CH.slice(0, start)).find((c) => tierUnlocked(c.tier) && !S.challenges[c.id]) || null;
  }
  function practice() {
    hubHeader("practice");
    const acc = accuracy(), nc = nextChallenge(), runs = S.lab || {};
    const tiers = TIERS.map((name, t) => {
      const list = CH.filter((c) => c.tier === t), open = tierUnlocked(t);
      const done = list.filter((c) => S.challenges[c.id]).length;
      return '<section class="tier' + (open ? "" : " is-locked") + '" aria-labelledby="tier-' + t + '"><div class="tier-head"><h3 id="tier-' + t + '">' + (open ? "" : icon("lock")) + esc(name) + '</h3><span class="tier-meta">' + (open ? done + "/" + list.length + " attempted" : "Attempt every " + TIERS[t - 1] + " challenge to unlock") + "</span></div>" +
        '<ul class="ch-list">' + list.map((c) => {
          const r = S.challenges[c.id];
          const st = !open ? ["locked", "Locked"] : r ? (r.correct ? ["done", "Correct"] : ["fail", "Incorrect"]) : ["open", "Not attempted"];
          const inner = '<span class="ch-id">CH-' + pad(c.n) + '</span><span class="ch-cat">' + esc(c.category) + "</span>" + chip(st[0], st[1]);
          return "<li>" + (open ? '<a class="ch-row" href="#challenge-' + c.id + '">' + inner + "</a>" : '<div class="ch-row is-locked">' + inner + "</div>") + "</li>";
        }).join("") + "</ul></section>";
    }).join("");
    $main.innerHTML = '<div class="page"><header class="page-head"><p class="eyebrow">Practice</p><h1 tabindex="-1">Practice on real code</h1><p class="lead">Review contracts, commit to an assessment, and see the full analysis only after you submit.</p></header>' +
      '<section class="card feature lab-feature"><span class="lab-f-icon">' + icon("flask") + '</span><div class="lab-f-body"><p class="eyebrow">Code Lab</p><h2>SimpleVault.sol · reentrancy review</h2><p class="muted">Editor with line notes, vulnerable and fixed versions, function navigation, and a simulated test that runs in your browser.</p>' +
      '<p class="lab-status">' + (runs.vulnerable ? chip("done", "Exploit reproduced") : chip("open", "Not run yet")) + (runs.fixed ? chip("done", "Fix verified") : "") + "</p>" +
      '<a class="btn btn-secondary" href="#codelab">Open Code Lab' + icon("arrow") + "</a></div></section>" +
      '<section class="arena" aria-labelledby="arena-h"><div class="arena-head"><div><p class="eyebrow">Challenge Arena</p><h2 id="arena-h">' + CH.length + " assessments, Beginner to Researcher</h2></div>" +
      '<div class="arena-stats"><span><strong>' + (acc === null ? "—" : acc + "%") + "</strong>accuracy</span><span><strong>" + answered().length + "/" + CH.length + "</strong>attempted</span></div></div>" +
      (nc ? '<a class="btn btn-primary btn-lg inline-cta" href="#challenge-' + nc.id + '">' + (answered().length ? "Next challenge: CH-" + pad(nc.n) : "Start with CH-01") + icon("arrow") + "</a>" : '<div class="notice notice-success">' + icon("checkCircle") + "<p>Every unlocked challenge has been attempted. Review any of them below.</p></div>") +
      tiers + "</section></div>";
    actionbar(null);
  }

  const chUI = { sel: {}, fsel: {} };
  function challengePage(c) {
    if (!tierUnlocked(c.tier)) return go("practice");
    const r = S.challenges[c.id], sel = chUI.sel[c.id];
    focusHeader({ back: "#practice", backLabel: "Arena", title: "CH-" + pad(c.n) + " · " + TIERS[c.tier], sub: c.category, at: c.n, of: CH.length, label: "Challenge " + c.n + " of " + CH.length });
    const meta = '<dl class="assess-meta"><div><dt>Challenge</dt><dd>CH-' + pad(c.n) + "</dd></div><div><dt>Difficulty</dt><dd>" + TIERS[c.tier] + "</dd></div><div><dt>Category</dt><dd>" + esc(c.category) + "</dd></div><div><dt>Status</dt><dd>" + (r ? (r.correct ? '<b class="ok">Correct</b>' : '<b class="bad">Incorrect</b>') : "Open") + "</dd></div></dl>";
    const marks = r ? { [c.line]: c.severity === "None" ? "accent" : "danger" } : null;
    const opts = c.options.map((o, i) => {
      let cls = "opt";
      if (r) { if (i === c.answer) cls += " is-right"; else if (i === r.choice) cls += " is-wrong"; else cls += " is-dim"; }
      else if (sel === i) cls += " is-sel";
      return '<button type="button" class="' + cls + '" role="radio" aria-checked="' + (r ? i === r.choice : sel === i) + '" data-i="' + i + '"' + (r ? " disabled" : "") + '><span class="opt-k">' + "ABCD"[i] + '</span><span class="opt-t">' + esc(o) +
        (r && i === c.answer ? '<span class="opt-m">' + icon("check") + "Correct answer</span>" : r && i === r.choice ? '<span class="opt-m">' + icon("x") + "Your answer</span>" : "") + "</span></button>";
    }).join("");
    let report = "";
    if (r) {
      const g = GUIDE_BY[c.guide], fr = r.follow, fsel = chUI.fsel[c.id];
      report = '<div class="result-banner ' + (r.correct ? "f-ok" : "f-bad") + '" role="status">' + icon(r.correct ? "checkCircle" : "xCircle") + "<div><strong>" + (r.correct ? "Correct assessment." : "Incorrect assessment.") + "</strong> " + (r.correct ? "Here is the full analysis." : "Study the analysis, then take the follow-up test.") + "</div></div>" +
        '<section class="report" aria-labelledby="rp-h"><h2 id="rp-h" class="eyebrow">Analysis</h2>' +
        '<div class="rp"><span class="rp-k">' + (c.severity === "None" ? "Line in question" : "Vulnerable line") + '</span><code class="rp-code">L' + c.line + "  " + esc(lines(c.code)[c.line - 1].trim()) + "</code></div>" +
        '<div class="rp"><span class="rp-k">Root cause</span><p>' + esc(c.root) + "</p></div>" +
        '<div class="rp"><span class="rp-k">Attacker preconditions</span><ul>' + c.pre.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul></div>" +
        '<div class="rp"><span class="rp-k">Exploit path</span><ol>' + c.path.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol></div>" +
        '<div class="rp rp-row"><div><span class="rp-k">Impact</span><p>' + esc(c.impact) + '</p></div><div><span class="rp-k">Severity</span>' + sevChip(c.severity) + "</div></div>" +
        '<div class="rp"><span class="rp-k">Mitigation</span><p>' + esc(c.mitigation) + "</p></div>" +
        '<a class="link" href="#guide-' + g.id + '">' + icon("guide") + "Field Guide: " + esc(g.name) + "</a></section>" +
        '<section class="card followup" aria-labelledby="fu-h"><p class="eyebrow">Follow-up test</p><h2 id="fu-h" class="q-sm">' + esc(c.follow.q) + '</h2><div class="opts" role="radiogroup" aria-label="Follow-up answers">' +
        c.follow.options.map((o, i) => {
          let cls = "opt opt-sm";
          if (fr) { if (i === c.follow.answer) cls += " is-right"; else if (i === fr.choice) cls += " is-wrong"; else cls += " is-dim"; }
          else if (fsel === i) cls += " is-sel";
          return '<button type="button" class="' + cls + '" role="radio" aria-checked="' + (fr ? i === fr.choice : fsel === i) + '" data-f="' + i + '"' + (fr ? " disabled" : "") + '><span class="opt-k">' + "ABC"[i] + '</span><span class="opt-t">' + esc(o) + "</span></button>";
        }).join("") + "</div>" +
        (fr ? '<p class="fu-result ' + (fr.correct ? "ok" : "bad") + '">' + icon(fr.correct ? "checkCircle" : "xCircle") + (fr.correct ? "Correct." : "Not quite. The highlighted option is the right one.") + "</p>"
          : '<button type="button" class="btn btn-secondary" id="fu-check"' + (fsel === undefined ? " disabled" : "") + ">Check follow-up answer</button>") + "</section>";
    }
    $main.innerHTML = '<div class="page assess"><div class="assess-grid"><div class="assess-code">' + meta + editor({ file: c.file, code: c.code, marks }) + "</div>" +
      '<div class="assess-q"><p class="step-k"><span>Q</span>Assessment question</p><h1 tabindex="-1" class="q">' + esc(c.q) + '</h1><div class="opts" role="radiogroup" aria-label="Answers">' + opts + "</div>" + report + "</div></div></div>";

    if (!r) {
      $main.querySelectorAll("[data-i]").forEach((b) => { b.onclick = () => { chUI.sel[c.id] = Number(b.dataset.i); challengePage(c); }; });
      actionbar({ label: "Submit assessment", disabled: sel === undefined, hint: sel === undefined ? "Select one answer. The analysis appears after you submit." : "", action: () => {
        const ok = sel === c.answer;
        S.challenges[c.id] = { choice: sel, correct: ok, at: Date.now() };
        S.history.unshift({ id: c.id, correct: ok, at: Date.now() }); S.history = S.history.slice(0, 100);
        recordSkill(c.skill, ok); touchDay(); save();
        challengePage(c);
        const b = $main.querySelector(".result-banner");
        if (b) { b.setAttribute("tabindex", "-1"); b.focus({ preventScroll: true }); b.scrollIntoView({ block: "center" }); }
      } });
    } else {
      $main.querySelectorAll("[data-f]").forEach((b) => { b.onclick = () => { chUI.fsel[c.id] = Number(b.dataset.f); const y = window.scrollY; challengePage(c); window.scrollTo(0, y); }; });
      const fc = $("fu-check");
      if (fc) fc.onclick = () => {
        const ok = chUI.fsel[c.id] === c.follow.answer;
        r.follow = { choice: chUI.fsel[c.id], correct: ok };
        recordSkill(c.follow.skill, ok); touchDay(); save();
        const y = window.scrollY; challengePage(c); window.scrollTo(0, y);
        const f = $main.querySelector(".fu-result"); if (f) f.scrollIntoView({ block: "nearest" });
      };
      const nc = nextChallenge(c);
      actionbar(nc ? { label: "Next challenge: CH-" + pad(nc.n), action: () => go("challenge-" + nc.id) } : { label: "Back to the Arena", action: () => go("practice") });
    }
  }

  // Code Lab: editor with function navigation, vulnerable/fixed tabs, explanation and test panels.
  const labUI = { version: "vulnerable", panel: "explain", line: null, range: null, out: null };
  function functionsOf(code) {
    const ls = lines(code), fns = [];
    ls.forEach((t, i) => {
      const m = /\bfunction\s+(\w+)|\b(receive|constructor)\s*\(/.exec(t);
      if (!m || t.trim().startsWith("//")) return;
      let depth = 0, end = i;
      for (let j = i; j < ls.length; j++) {
        depth += (ls[j].match(/\{/g) || []).length - (ls[j].match(/\}/g) || []).length;
        if (depth <= 0 && ls[j].includes("}")) { end = j; break; }
      }
      fns.push({ name: (m[1] || m[2]) + "()", start: i + 1, end: end + 1 });
    });
    return fns;
  }
  // A JavaScript model of the reference test. It mirrors the contract logic; it is not Solidity.
  function simulate(fixed) {
    const out = [], ETH = (n) => n + " ETH";
    let vault = 0, att = 0, received = 0, locked = false, entries = 0;
    out.push({ t: "cmd", s: "simulate test_HonestFundsSurviveReentrancy  (" + (fixed ? "fixed" : "vulnerable") + " version)" });
    out.push({ t: "dim", s: "JavaScript model of SimpleVault. Not Foundry; no Solidity is compiled or executed." });
    vault += 10; out.push({ t: "", s: "alice.deposit{value: 10 ETH}()      vault = " + ETH(vault) });
    vault += 1; att += 1; out.push({ t: "", s: "attacker.deposit{value: 1 ETH}()    vault = " + ETH(vault) });
    const logs = [];
    (function withdraw(depth) {
      entries++;
      const tag = depth === 0 ? "withdraw() #1" : "re-entered withdraw() #" + entries;
      const ind = "  ".repeat(Math.min(depth, 1));
      if (fixed && locked) { logs.push({ t: "ok", s: ind + tag + ": reverted by nonReentrant (caught by the attacker)" }); return; }
      if (fixed) locked = true;
      const amount = att;
      if (fixed) { att = 0; logs.push({ t: "ok", s: tag + ": balances[attacker] = 0 before the call (line 16)" }); }
      vault -= amount; received += amount;
      logs.push({ t: !fixed && depth > 0 ? "bad" : "", s: ind + (fixed ? "" : tag + ": ") + "call{value: " + ETH(amount) + "} → Attacker.receive()   vault = " + ETH(vault) });
      if (vault >= 1 && depth < 40) withdraw(depth + 1);
      if (!fixed) att = 0;
      if (fixed) locked = false;
    })(0);
    if (!fixed && logs.length > 5) { const hidden = logs.length - 4; logs.splice(3, hidden - 1, { t: "dim", s: "  … " + (hidden - 1) + " more re-entries, 1 ETH each …" }); }
    logs.forEach((l) => out.push(l));
    if (!fixed) out.push({ t: "dim", s: "receive(): vault below 1 ETH, stop. Only now does line 15 zero the balance." });
    const pass = vault >= 10;
    out.push({ t: pass ? "pass" : "fail", s: (pass ? "[PASS] " : "[FAIL] ") + "assertEq(vault.balance, 10 ETH): " + ETH(vault) + (pass ? " == " : " != ") + "10 ETH" });
    out.push({ t: "dim", s: "Attacker paid in 1 ETH and got back " + ETH(received) + (received > 1 ? ", stealing " + ETH(received - 1) + " of alice's deposit." : ". No profit.") });
    return { lines: out, pass };
  }
  function codelab() {
    const v = LAB[labUI.version], fixed = labUI.version === "fixed";
    focusHeader({ back: "#practice", backLabel: "Practice", title: "Code Lab", sub: "SimpleVault.sol · reentrancy review" });
    if (labUI.line === null) labUI.line = fixed ? 16 : 13;
    const fns = functionsOf(v.code), note = v.notes[labUI.line], ls = lines(v.code);
    const tab = (id, label, cur, kind) => '<button type="button" role="tab" id="' + kind + "-" + id + '" aria-selected="' + (cur === id) + '" aria-controls="' + kind + '-panel" data-' + kind + '="' + id + '">' + label + "</button>";
    const explain = '<div class="sel-line">' + (note ? '<span class="callout-k">Line ' + labUI.line + '</span><code class="callout-code">' + esc(ls[labUI.line - 1].trim()) + "</code><p>" + esc(note) + "</p>" : '<p class="muted">Line ' + labUI.line + " has no note. Tap a highlighted line, or a line inside a function.</p>") + "</div>" +
      (fixed
        ? '<h3 class="eyebrow">Checks → effects → interactions</h3><ol class="seq"><li><b>Check.</b> Read and validate the balance (lines 14–15).</li><li><b>Effect.</b> Zero the balance before any external code runs (line 16).</li><li><b>Interaction.</b> Only then send ETH (line 17).</li><li><b>Guard.</b> nonReentrant (line 13) blocks re-entry into guarded functions.</li></ol>'
        : '<h3 class="eyebrow">How the attack unfolds</h3><ol class="seq"><li>The attacker deposits 1 ETH from a contract.</li><li>withdraw() reads amount = 1 ETH (line 12).</li><li>Line 13 sends ETH, so the attacker’s receive() runs before line 15.</li><li>receive() calls withdraw() again. The balance still reads 1 ETH, so it pays again.</li><li>This repeats until the vault is empty. Line 15 finally runs, too late.</li></ol>') +
      '<div class="notice notice-warning">' + icon("alert") + "<p>Educational example. A real finding requires checking the complete contract, its inheritance, and every reachable execution path, then proving it with a test.</p></div>";
    const o = labUI.out;
    const test = '<p class="sim-tag">' + icon("terminal") + "<span><strong>Simulation.</strong> Runs a JavaScript model in your browser. It does not compile Solidity and is not a Foundry run.</span></p>" +
      editor({ file: "test/SimpleVault.t.sol (reference)", code: LAB.test }) +
      '<div class="console" id="console" aria-live="polite">' + (o ? o.lines.map((l) => '<div class="cl cl-' + (l.t || "n") + '">' + (l.t === "cmd" ? "$ " : "") + esc(l.s) + "</div>").join("") : '<div class="cl cl-dim">Press “Run simulated test” to run against the ' + labUI.version + " version.</div>") + "</div>";
    $main.innerHTML = '<div class="page lab"><h1 tabindex="-1" class="sr-only">Code Lab: SimpleVault</h1><div class="lab-grid"><div class="lab-left">' +
        '<div class="tabs" role="tablist" aria-label="Contract version">' + tab("vulnerable", "Vulnerable", labUI.version, "ver") + tab("fixed", "Fixed", labUI.version, "ver") + "</div>" +
        '<div class="fn-nav" role="group" aria-label="Jump to function"><span class="fn-k">' + icon("fn") + "Functions</span>" + fns.map((f) => '<button type="button" class="fn-chip" aria-pressed="' + !!(labUI.range && labUI.range[0] === f.start) + '" data-fn="' + f.start + "-" + f.end + '">' + esc(f.name) + "</button>").join("") + "</div>" +
        '<div id="ver-panel" role="tabpanel" aria-labelledby="ver-' + labUI.version + '">' + editor({ file: v.file, code: v.code, marks: v.marks, pickable: true, pick: labUI.line, range: labUI.range, id: "lab-ed", right: '<span class="ed-legend"><i class="lg lg-' + (fixed ? "safe" : "danger") + '"></i>' + (fixed ? "Fixed lines" : "Suspicious lines") + "</span>" }) + "</div>" +
      '</div><div class="lab-right"><div class="tabs" role="tablist" aria-label="Panel">' + tab("explain", "Explanation", labUI.panel, "panel") + tab("test", "Test", labUI.panel, "panel") + "</div>" +
        '<div class="panel" id="panel-panel" role="tabpanel" aria-labelledby="panel-' + labUI.panel + '">' + (labUI.panel === "explain" ? explain : test) + "</div></div></div></div>";
    $main.querySelectorAll("[data-ver]").forEach((b) => { b.onclick = () => { labUI.version = b.dataset.ver; labUI.line = null; labUI.range = null; labUI.out = null; codelab(); }; });
    $main.querySelectorAll("[data-panel]").forEach((b) => { b.onclick = () => { labUI.panel = b.dataset.panel; codelab(); }; });
    $main.querySelectorAll("[data-fn]").forEach((b) => { b.onclick = () => {
      const [a, z] = b.dataset.fn.split("-").map(Number);
      labUI.range = [a, z]; labUI.line = a; labUI.panel = "explain"; codelab();
      const el = $main.querySelector('#lab-ed [data-line="' + a + '"]'); if (el) el.scrollIntoView({ block: "center" });
    }; });
    bindPick($("lab-ed"), (n) => {
      labUI.line = n; labUI.panel = "explain"; codelab();
      if (window.matchMedia("(max-width: 959px)").matches) { const p = $main.querySelector(".lab-right"); if (p) p.scrollIntoView({ block: "start" }); }
    });
    actionbar({ label: "Run simulated test", icon: "play", action: () => {
      labUI.out = simulate(fixed); labUI.panel = "test";
      S.lab = S.lab || {}; S.lab[labUI.version] = labUI.out.pass ? "pass" : "fail"; touchDay(); save();
      codelab();
      const c = $("console"); if (c) c.scrollIntoView({ block: "center" });
    } });
  }

  // ---------- Field Guide ----------
  let guideQuery = "";
  function guidePage() {
    hubHeader("guide");
    $main.innerHTML = '<div class="page"><header class="page-head"><p class="eyebrow">Field Guide</p><h1 tabindex="-1">Vulnerability reference</h1><p class="lead">Definitions, vulnerable and secure code, exploit sequences, testing strategies, and common false positives.</p></header>' +
      '<div class="search"><label for="guide-q" class="sr-only">Search the Field Guide</label>' + icon("search") + '<input id="guide-q" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Search: delegatecall, oracle, signature…" value="' + esc(guideQuery) + '" /></div>' +
      '<p class="muted small" id="guide-count" aria-live="polite"></p><ul class="guide-list" id="guide-list"></ul></div>';
    const input = $("guide-q");
    const render = () => {
      const q = guideQuery.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
      const hits = GUIDE.filter((g) => { const hay = (g.name + " " + g.category + " " + g.keywords + " " + g.definition + " " + g.root).toLowerCase(); return words.every((w) => hay.includes(w)); });
      $("guide-count").textContent = hits.length + (hits.length === 1 ? " entry" : " entries") + (q ? " matching “" + guideQuery.trim() + "”" : "");
      $("guide-list").innerHTML = hits.length ? hits.map((g) => '<li><a class="guide-row" href="#guide-' + g.id + '"><span class="gr-top"><span class="gr-name">' + esc(g.name) + "</span>" + sevChip(g.severity) + '</span><span class="gr-cat">' + esc(g.category) + '</span><span class="gr-def">' + esc(g.definition) + "</span></a></li>").join("")
        : '<li class="empty">' + icon("search") + "<p>No entries match. Try a broader term such as <em>call</em>, <em>price</em>, or <em>owner</em>.</p></li>";
    };
    input.oninput = () => { guideQuery = input.value; render(); };
    render();
    actionbar(null);
  }
  function guideEntry(g) {
    hubHeader("guide");
    const secs = [["def", "Definition"], ["root", "Root cause"], ["vuln", "Vulnerable code"], ["cond", "Attack conditions"], ["seq", "Exploit sequence"], ["impact", "Impact"], ["secure", "Secure code"], ["test", "Testing"], ["fp", "False positives"]];
    const rel = CH.filter((c) => c.guide === g.id && tierUnlocked(c.tier));
    const relL = LESSONS.filter((l) => l.guide === g.id && levelUnlocked(l.level));
    const sec = (id, title, body) => '<section class="g-sec" id="sec-' + id + '" aria-labelledby="h-' + id + '"><h2 id="h-' + id + '">' + title + "</h2>" + body + "</section>";
    $main.innerHTML = '<div class="page narrow">' + subBack("#guide", "Field Guide") +
      '<header class="page-head"><p class="eyebrow">' + esc(g.category) + '</p><h1 tabindex="-1">' + esc(g.name) + '</h1><div class="kv"><span>Typical severity</span>' + sevChip(g.severity) + "</div></header>" +
      '<nav class="jump" aria-label="On this page">' + secs.map(([id, t]) => '<button type="button" data-jump="' + id + '">' + t + "</button>").join("") + "</nav>" +
      sec("def", "Definition", '<p class="lead">' + esc(g.definition) + "</p>") +
      sec("root", "Root cause", "<p>" + esc(g.root) + "</p>") +
      sec("vuln", "Vulnerable code", editor({ file: g.vuln.file, code: g.vuln.code, marks: { [g.vuln.hot]: "danger" } })) +
      sec("cond", "Attack conditions", "<ul>" + g.conditions.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>") +
      sec("seq", "Exploit sequence", '<ol class="seq">' + g.sequence.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol>") +
      sec("impact", "Impact", "<p>" + esc(g.impact) + "</p><p><strong>Mitigation.</strong> " + esc(g.mitigation) + "</p>") +
      sec("secure", "Secure code", editor({ file: g.secure.file, code: g.secure.code, marks: { [g.secure.hot]: "safe" } })) +
      sec("test", "Testing strategy", "<ul>" + g.testing.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>") +
      sec("fp", "Common false positives", "<ul>" + g.falsePositives.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>") +
      ((rel.length || relL.length) ? '<section class="card"><h2 class="eyebrow">Practice this</h2><ul class="rel">' +
        rel.map((c) => '<li><a href="#challenge-' + c.id + '">' + icon("target") + "CH-" + pad(c.n) + " · " + TIERS[c.tier] + " challenge" + icon("chev") + "</a></li>").join("") +
        relL.map((l) => '<li><a href="#lesson-' + l.id + '-1">' + icon("academy") + "Lesson: " + esc(l.title) + icon("chev") + "</a></li>").join("") + "</ul></section>" : "") + "</div>";
    $main.querySelectorAll("[data-jump]").forEach((b) => { b.onclick = () => {
      const s = $("sec-" + b.dataset.jump); if (!s) return;
      s.scrollIntoView({ block: "start" });
      const h = s.querySelector("h2"); h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true });
    }; });
    actionbar(null);
  }

  // ---------- Progress ----------
  function progressPage() {
    hubHeader("progress");
    const acc = accuracy(), done = lessonsDone(), cats = categoryStats();
    const skillRows = SKILLS.map(([k, name, lvl]) => {
      const st = skillStatus(k);
      return '<li class="skill"><div class="skill-top"><span class="skill-n">' + name + "</span>" + chip(st.tone, st.label) + "</div>" + meter(st.s.n ? st.pct : 0, st.tone) +
        '<span class="skill-meta">' + (st.s.n ? st.pct + "% first-try accuracy · " + st.s.n + " graded answer" + (st.s.n === 1 ? "" : "s") : "No graded answers yet") + " · Level " + pad(lvl) + "</span></li>";
    }).join("");
    const weak = [];
    SKILLS.forEach(([k, name, lvl]) => { const st = skillStatus(k); if (st.tone === "danger" || st.tone === "warning") weak.push({ t: name, d: st.pct + "% first-try accuracy", href: "#level-" + lvl, cta: "Review Level " + pad(lvl) }); });
    cats.filter((c) => c.n && c.acc < 60).forEach((c) => { const ch = CH.find((x) => x.category === c.cat); weak.push({ t: c.cat, d: c.acc + "% challenge accuracy", href: "#guide-" + ch.guide, cta: "Field Guide" }); });
    LESSONS.filter((l) => S.lessons[l.id] && S.lessons[l.id].done && S.lessons[l.id].first === false).slice(0, 4).forEach((l) => weak.push({ t: l.title, d: "Lesson check missed on the first try", href: "#lesson-" + l.id + "-1", cta: "Review" }));
    const hist = S.history.slice(0, 12);
    $main.innerHTML = '<div class="page"><header class="page-head"><p class="eyebrow">Researcher progress</p><h1 tabindex="-1">' + rank() + '</h1><p class="lead">Rank comes from demonstrated skill, not from lessons opened. A skill becomes proficient after at least 6 graded answers at 80% or better on the first try.</p></header>' +
      '<section class="stats stats-3" aria-label="Summary">' +
        '<div class="stat"><span class="stat-l">' + icon("checkCircle") + 'Lessons completed</span><span class="stat-v">' + done + "<small>/" + LESSONS.length + "</small></span>" + meter(100 * done / LESSONS.length) + "</div>" +
        '<div class="stat"><span class="stat-l">' + icon("target") + 'Challenge accuracy</span><span class="stat-v">' + (acc === null ? "—" : acc + "<small>%</small>") + '</span><span class="stat-s">' + answered().length + " of " + CH.length + " attempted</span></div>" +
        '<div class="stat"><span class="stat-l">' + icon("flame") + 'Learning streak</span><span class="stat-v">' + streak() + '<small> day' + (streak() === 1 ? "" : "s") + '</small></span><span class="stat-s">' + S.days.length + " active day" + (S.days.length === 1 ? "" : "s") + " in total</span></div>" +
      "</section>" +
      '<div class="prog-grid"><section class="card" aria-labelledby="sk-h"><h2 id="sk-h" class="eyebrow">Skills</h2><ul class="skills">' + skillRows + "</ul></section>" +
      '<section class="card" aria-labelledby="wk-h"><h2 id="wk-h" class="eyebrow">Weak areas</h2>' + (weak.length ? '<ul class="weak">' + weak.map((w) => "<li><div><strong>" + esc(w.t) + '</strong><span class="muted small">' + esc(w.d) + '</span></div><a class="link" href="' + w.href + '">' + esc(w.cta) + icon("chev") + "</a></li>").join("") + "</ul>"
        : '<p class="muted">' + (S.history.length || Object.keys(S.skills).length ? "No weak areas detected so far." : "Answer lesson checks and challenges to reveal weak areas.") + "</p>") + "</section></div>" +
      '<div class="prog-grid"><section class="card" aria-labelledby="cat-h"><h2 id="cat-h" class="eyebrow">Accuracy by category</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th scope="col">Category</th><th scope="col">Tried</th><th scope="col">Accuracy</th></tr></thead><tbody>' +
        cats.map((c) => "<tr><td>" + esc(c.cat) + "</td><td>" + c.n + "/" + c.total + '</td><td class="' + (c.n ? (c.acc >= 80 ? "ok" : c.acc < 60 ? "bad" : "warn") : "") + '">' + (c.n ? c.acc + "%" : "—") + "</td></tr>").join("") + "</tbody></table></div></section>" +
      '<section class="card" aria-labelledby="hi-h"><h2 id="hi-h" class="eyebrow">Challenge history</h2>' + (hist.length ? '<ul class="hist">' + hist.map((h) => { const c = CH_BY[h.id]; return '<li><a href="#challenge-' + c.id + '"><span class="ch-id">CH-' + pad(c.n) + '</span><span class="hist-cat">' + esc(c.category) + "</span>" + (h.correct ? chip("done", "Correct") : chip("fail", "Incorrect")) + '<span class="muted small">' + new Date(h.at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) + "</span></a></li>"; }).join("") + "</ul>" : '<p class="muted">No challenges attempted yet.</p>') + "</section></div>" +
      '<section class="settings" aria-label="Preferences"><button type="button" class="btn btn-secondary" id="theme2">' + icon(S.theme === "light" ? "moon" : "sun") + (S.theme === "light" ? "Use dark theme" : "Use light theme") + '</button><button type="button" class="btn btn-danger-outline" id="reset">' + icon("reset") + "Reset all progress</button></section></div>";
    $("theme2").onclick = () => { S.theme = S.theme === "light" ? "dark" : "light"; save(); applyTheme(); progressPage(); };
    $("reset").onclick = () => openModal({ title: "Reset all progress?", body: "This permanently clears every lesson, challenge result, skill score, and streak saved in this browser.", confirm: "Reset progress", danger: true,
      onConfirm: () => { const th = S.theme; S = blank(); S.theme = th; save(); lessonUI.pick = {}; lessonUI.sel = {}; chUI.sel = {}; chUI.fsel = {}; labUI.out = null; go("dashboard"); } });
    actionbar(null);
  }

  // ---------- Router ----------
  function applyTheme() { document.documentElement.dataset.appTheme = S.theme === "light" ? "light" : "dark"; }
  function route() {
    hideTip(); closeModal();
    const h = location.hash.replace(/^#/, "") || "dashboard";
    let m, focus = false;
    if ((m = /^lesson-(.+)-(\d+)$/.exec(h)) && LESSON_BY[m[1]]) { focus = true; lessonPage(LESSON_BY[m[1]], Number(m[2])); }
    else if ((m = /^done-(.+)$/.exec(h)) && LESSON_BY[m[1]]) { focus = true; donePage(LESSON_BY[m[1]]); }
    else if ((m = /^challenge-(.+)$/.exec(h)) && CH_BY[m[1]]) { focus = true; challengePage(CH_BY[m[1]]); }
    else if (h === "codelab") { focus = true; codelab(); }
    else if ((m = /^level-(\d+)$/.exec(h))) levelPage(Number(m[1]));
    else if ((m = /^guide-(.+)$/.exec(h)) && GUIDE_BY[m[1]]) guideEntry(GUIDE_BY[m[1]]);
    else if (h === "academy") academy();
    else if (h === "practice") practice();
    else if (h === "guide") guidePage();
    else if (h === "progress") progressPage();
    else dashboard();
    document.body.dataset.mode = focus ? "focus" : "hub";
    window.scrollTo(0, 0);
    const h1 = $main.querySelector("h1");
    if (h1) h1.focus({ preventScroll: true });
  }
  applyTheme();
  window.addEventListener("hashchange", route);
  route();
})();
