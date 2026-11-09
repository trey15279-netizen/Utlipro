// Security Lab: a phone-first learning site.
// Screens (plain #names, so links work anywhere, and the iPhone swipe-back gesture works):
//   #home                 Home: progress path + the one thing to do next
//   #lesson-<id>-<n>      Lesson step n (0 = "what you'll learn")
//   #quiz-<id>-<n>        Quiz question n (1-based), one per screen
//   #result-<id>          Quiz score + next recommended action
// Every screen has: a Back button (top left), where you are (title + progress),
// and exactly one primary button in the bar at the bottom.
"use strict";
(function () {
  const LESSONS = window.LAB_LESSONS || [];
  const STORE_KEY = "security-lab-progress-v1";
  const PASS_RATIO = 2 / 3;
  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $top = document.getElementById("topbar");
  const $screen = document.getElementById("screen");
  const $bar = document.getElementById("actionbar");

  // ---------- Icons (Material Symbols font, loaded with the page) ----------
  const SYMBOLS = {
    key: "key", hook: "phishing", lock: "lock", database: "database", bot: "smart_toy", mail: "mail",
    globe: "language", wifi: "wifi", phone: "smartphone", bank: "account_balance", shield: "verified_user",
    alert: "warning", check: "check", x: "close", keyboard: "keyboard", code: "code", flag: "flag",
    cup: "local_cafe", leak: "crisis_alert", eye: "visibility", pencil: "edit", back: "arrow_back",
    home: "home", book: "menu_book", help: "quiz", trophy: "emoji_events", save: "cloud_done",
    arrow: "arrow_forward", lab: "science", tap: "touch_app"
  };
  const icon = (name, cls) => '<span class="icon msr ' + (cls || "") + '" aria-hidden="true">' + (SYMBOLS[name] || "help") + "</span>";

  // ---------- Saved progress (automatic, on this device) ----------
  // { lessons: { [id]: { step, done, best, answers: { [qIndex]: choice } } }, finishedAt, name }
  let state = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (s && typeof s === "object" && s.lessons) return s;
    } catch (e) { /* private mode or blocked storage: start fresh */ }
    return { lessons: {} };
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* keep going in memory */ }
  }
  function prog(id) {
    if (!state.lessons[id]) state.lessons[id] = { step: 0, done: false, best: 0, answers: {} };
    return state.lessons[id];
  }

  // ---------- Helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hl = (s) => esc(s).replace(/\[\[(.+?)\]\]/g, "<mark>$1</mark>"); // [[text]] → highlight
  const stepTitle = (t) => { const s = t.replace(/^Lab: /, ""); return s.charAt(0).toUpperCase() + s.slice(1); };
  const plain = (s) => String(s).replace(/\[\[|\]\]/g, "");
  const lessonById = (id) => LESSONS.find((l) => l.id === id);
  const indexOf = (lesson) => LESSONS.indexOf(lesson);
  const go = (route) => { location.hash = route; };
  const passMark = (lesson) => Math.ceil(lesson.quiz.length * PASS_RATIO);
  const doneCount = () => LESSONS.filter((l) => prog(l.id).done).length;
  const quizStarted = (p) => Object.keys(p.answers).length > 0;
  const totalMinutes = LESSONS.reduce((n, l) => n + l.minutes, 0);
  const totalQuestions = LESSONS.reduce((n, l) => n + l.quiz.length, 0);
  const isFresh = () => !LESSONS.some((l) => { const p = prog(l.id); return p.step > 0 || p.done || quizStarted(p); });

  function scoreOf(lesson) {
    const p = prog(lesson.id);
    return lesson.quiz.reduce((n, q, i) => n + (p.answers[i] === q.answer ? 1 : 0), 0);
  }
  function quizRoute(lesson) {
    const p = prog(lesson.id);
    const i = lesson.quiz.findIndex((q, k) => p.answers[k] === undefined);
    return i === -1 ? "#result-" + lesson.id : "#quiz-" + lesson.id + "-" + (i + 1);
  }
  // Where a lesson should open when you tap it.
  function resumeRoute(lesson) {
    const p = prog(lesson.id);
    if (p.done || (p.step === 0 && !quizStarted(p))) return "#lesson-" + lesson.id + "-0";
    if (quizStarted(p)) return quizRoute(lesson);
    return "#lesson-" + lesson.id + "-" + p.step;
  }

  // Where the learner should go next, with a label for the big button.
  function nextAction() {
    const lesson = LESSONS.find((l) => !prog(l.id).done);
    if (!lesson) return { label: "Review lesson 1", route: "#lesson-" + LESSONS[0].id + "-0", lesson: null };
    const p = prog(lesson.id);
    const n = indexOf(lesson) + 1;
    if (quizStarted(p)) {
      const nextQ = lesson.quiz.findIndex((q, i) => p.answers[i] === undefined);
      if (nextQ === -1) return { label: "See your quiz score", route: "#result-" + lesson.id, lesson, detail: "Quiz finished" };
      return { label: "Continue the quiz", route: quizRoute(lesson), lesson, detail: "Quiz · question " + (nextQ + 1) + " of " + lesson.quiz.length };
    }
    if (p.step > 0) return { label: "Continue lesson " + n, route: resumeRoute(lesson), lesson, detail: "Step " + p.step + " of " + lesson.steps.length };
    return { label: (isFresh() ? "Start lesson 1" : "Start lesson " + n), route: resumeRoute(lesson), lesson, detail: lesson.minutes + " min · " + lesson.steps.length + " steps · " + lesson.quiz.length + " questions" };
  }

  // ---------- Shared screen parts ----------
  function topbar(opts) {
    // opts: { back, title, home, segments: {at, of}, label }
    let html = "";
    if (opts.back) {
      html += '<div class="topbar-row">' +
        '<a class="back" href="' + opts.back + '">' + icon("back") + "<span>Back</span></a>" +
        '<span class="topbar-title">' + esc(opts.title || "") + "</span>" +
        (opts.home ? '<a class="home-link" href="#home">' + icon("home") + "<span>Home</span></a>" : '<span class="home-link"></span>') +
        "</div>";
    } else {
      html += '<div class="topbar-row"><a class="brand" href="#home"><span class="brand-mark">' + icon("shield", "fill") + "</span>Security Lab</a>" +
        '<span class="brand-progress">' + doneCount() + "/" + LESSONS.length + " done</span></div>";
    }
    if (opts.segments) {
      const { at, of } = opts.segments;
      html += '<div class="steps" role="progressbar" aria-valuemin="0" aria-valuemax="' + of + '" aria-valuenow="' + at + '" aria-label="' + esc(opts.label) + '">' +
        '<div class="steps-track">' + Array.from({ length: of }, (_, k) => '<span class="seg' + (k < at ? " is-on" : "") + (k === at - 1 ? " is-now" : "") + '"></span>').join("") + "</div>" +
        '<span class="steps-label">' + esc(opts.label) + "</span></div>";
    }
    $top.innerHTML = html;
  }

  // The bottom bar: one big primary button (and, rarely, one quiet secondary link).
  function actionbar(primary, secondary, hint) {
    let html = '<div class="actionbar-inner">';
    if (hint) html += '<p class="action-hint">' + icon("tap") + esc(hint) + "</p>";
    if (primary) html += '<button type="button" class="btn-primary" id="primary"><span>' + esc(primary.label) + "</span>" + icon("arrow") + "</button>";
    if (secondary) html += '<button type="button" class="btn-secondary" id="secondary">' + esc(secondary.label) + "</button>";
    $bar.innerHTML = html + "</div>";
    if (primary) document.getElementById("primary").onclick = primary.action;
    if (secondary) document.getElementById("secondary").onclick = secondary.action;
  }

  function wordsBox(words) {
    if (!words || !words.length) return "";
    return '<section class="words" aria-label="New words">' + words.map((w) =>
      '<div class="word">' + icon("book", "word-icon") + '<div><span class="word-tag">New word</span><strong>' + esc(w[0]) + "</strong><p>" + esc(w[1]) + "</p></div></div>"
    ).join("") + "</section>";
  }

  // ---------- Visuals ----------
  function visual(v) {
    if (!v) return "";
    if (v.type === "flow") {
      return '<figure class="flow">' + v.nodes.map((n) => n.arrow !== undefined
        ? '<div class="flow-arrow"><span class="flow-line" aria-hidden="true"></span><span class="flow-arrow-label">' + esc(n.arrow) + "</span></div>"
        : '<div class="flow-node tone-' + (n.tone || "neutral") + '"><span class="flow-icon">' + icon(n.icon) + "</span><span>" + esc(n.text) + "</span>" +
          (n.tone === "bad" ? '<span class="tag tag-bad">Danger</span>' : n.tone === "good" ? '<span class="tag tag-good">Safe</span>' : "") + "</div>"
      ).join("") + "</figure>";
    }
    if (v.type === "compare") {
      const side = (s, tone) => {
        const t = s.tone || tone;
        return '<div class="compare-card tone-' + t + '"><span class="compare-label">' +
          (t === "good" ? icon("check") : t === "bad" ? icon("x") : icon("eye")) + esc(s.label) + "</span>" +
          '<code class="compare-value">' + hl(s.value) + "</code>" +
          '<span class="compare-note">' + esc(s.note) + "</span></div>";
      };
      return '<figure class="compare">' + side(v.bad, "bad") + side(v.good, "good") + "</figure>";
    }
    if (v.type === "code") {
      return '<figure class="editor"><div class="editor-bar"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="editor-file">' + esc(v.file || "code") + "</span></div>" +
        '<pre class="editor-body"><code>' + v.lines.map((l, i) => '<span class="ln' + (l.includes("[[") ? " is-hot" : "") + '"><span class="ln-no" aria-hidden="true">' + (i + 1) + "</span>" + (hl(l) || " ") + "</span>").join("") + "</code></pre>" +
        '<figcaption class="key"><mark>Highlighted</mark> = the part to look at</figcaption></figure>';
    }
    if (v.type === "lab") return '<figure class="lab" data-lab="' + v.lab + '">' + LABS[v.lab].html(v) + "</figure>";
    return "";
  }

  // ---------- Hands-on labs ----------
  const COMMON = ["123456", "password", "qwerty", "111111", "iloveyou", "sunshine", "letmein", "admin", "welcome", "monkey", "dragon", "123456789", "password1"];
  function guessTime(pw) {
    if (!pw) return null;
    if (COMMON.includes(pw.toLowerCase())) return { secs: 0, level: 0 };
    let pool = 0;
    if (/[a-z]/.test(pw)) pool += 26;
    if (/[A-Z]/.test(pw)) pool += 26;
    if (/[0-9]/.test(pw)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
    const bits = pw.length * Math.log2(pool || 1);
    const secs = Math.pow(2, bits) / 2 / 1e10; // a fast attacker: 10 billion guesses a second
    const level = secs < 3600 ? 0 : secs < 3.15e7 ? 1 : secs < 3.15e9 ? 2 : 3;
    return { secs, level };
  }
  function humanTime(s) {
    if (s < 1) return "instantly";
    const units = [["second", 60], ["minute", 60], ["hour", 24], ["day", 365], ["year", 100], ["century", 1e9]];
    let v = s;
    for (const [name, step] of units) {
      if (v < step) { const n = Math.floor(v); return n + " " + (n === 1 ? name : name === "century" ? "centuries" : name + "s"); }
      v /= step;
    }
    return "billions of years";
  }

  const LABS = {
    password: {
      html: () => '<p class="lab-tag">' + icon("lab") + "Live lab</p>" +
        '<div class="chips">' + ["sunshine", "Sunsh1ne!", "purple-tiger-river-lamp"].map((e) => '<button type="button" class="chip" data-ex="' + esc(e) + '"><code>' + esc(e) + "</code></button>").join("") + "</div>" +
        '<label class="lab-label" for="pw-input">Or type a made-up one</label>' +
        '<input id="pw-input" class="lab-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Type a made-up password" />' +
        '<div class="meter" aria-hidden="true"><span></span><span></span><span></span><span></span></div>' +
        '<p class="lab-result" id="pw-result" aria-live="polite"></p>',
      bind(root) {
        const input = root.querySelector("#pw-input");
        const out = root.querySelector("#pw-result");
        const meter = root.querySelector(".meter");
        const labels = ["Very weak", "Weak", "Good", "Strong"];
        const render = () => {
          const r = guessTime(input.value);
          meter.dataset.level = r ? r.level : "";
          if (!r) { out.className = "lab-result"; out.innerHTML = "Tap an example above to test it."; return; }
          out.className = "lab-result level-" + r.level;
          out.innerHTML = "<strong>" + labels[r.level] + ".</strong> A guessing program could crack it <strong>" + (r.secs < 1 ? "instantly" : "in " + humanTime(r.secs)) + "</strong>.";
        };
        root.querySelectorAll("[data-ex]").forEach((b) => { b.onclick = () => { input.value = b.dataset.ex; render(); }; });
        input.oninput = render;
        render();
      }
    },

    flags: {
      html: (v) => {
        const e = v.email;
        const total = e.parts.filter((p) => p.flag).length;
        const part = (p) => {
          const inner = p.button
            ? '<span class="mail-button">' + esc(p.button) + '</span><span class="mail-url">' + icon("globe") + "<span>" + hl(p.url) + "</span></span>"
            : (p.label ? '<span class="mail-label">' + esc(p.label) + "</span>" : "") + "<span>" + hl(p.text) + "</span>";
          return '<button type="button" class="mail-part' + (p.button ? " is-cta" : "") + '" data-part="' + p.id + '">' + inner + "</button>";
        };
        return '<p class="lab-tag">' + icon("flag") + 'Tap the clues · <span id="flag-count">0</span> of ' + total + " found</p>" +
          '<div class="mail"><div class="mail-head"><span class="avatar" aria-hidden="true">' + esc(e.name[0]) + '</span><span class="mail-name">' + esc(e.name) + "</span></div>" +
          e.parts.map(part).join("") + "</div>" +
          '<p class="lab-result" id="flag-result" aria-live="polite">Tap any part of the email that looks suspicious.</p>';
      },
      bind(root, v) {
        const parts = v.email.parts;
        const total = parts.filter((p) => p.flag).length;
        const found = new Set();
        const out = root.querySelector("#flag-result");
        root.querySelectorAll("[data-part]").forEach((b) => {
          b.onclick = () => {
            const p = parts.find((x) => x.id === b.dataset.part);
            if (p.flag) {
              found.add(p.id);
              b.classList.add("is-flag");
              root.querySelector("#flag-count").textContent = found.size;
              out.className = "lab-result tone-bad";
              out.innerHTML = "<strong>Red flag " + found.size + " of " + total + ".</strong> " + esc(plain(p.why));
              if (found.size === total) { out.className = "lab-result tone-good"; out.innerHTML = "<strong>You found all " + total + "!</strong> " + esc(plain(p.why)); }
            } else {
              b.classList.add("is-ok");
              out.className = "lab-result";
              out.innerHTML = "This part alone isn't a clue. Keep looking.";
            }
          };
        });
      }
    },

    https: {
      html: () => '<p class="lab-tag">' + icon("lab") + "Live lab</p>" +
        '<div class="toggle" role="group" aria-label="Connection type">' +
        '<button type="button" class="toggle-btn" data-mode="http" aria-pressed="true">http://</button>' +
        '<button type="button" class="toggle-btn" data-mode="https" aria-pressed="false">' + icon("lock") + "https://</button></div>" +
        '<div class="trip">' +
          '<div class="trip-stop">' + icon("phone") + "<span>Your phone</span></div>" +
          '<div class="trip-wire"><span class="packet" aria-hidden="true"></span></div>' +
          '<div class="trip-stop trip-snoop">' + icon("eye") + '<span>Someone on the café Wi-Fi sees:</span><code id="snoop-sees"></code></div>' +
          '<div class="trip-wire"><span class="packet" aria-hidden="true"></span></div>' +
          '<div class="trip-stop">' + icon("bank") + "<span>Your bank reads:</span><code>password=sunflower</code></div>" +
        "</div>" +
        '<p class="lab-result" id="https-result" aria-live="polite"></p>',
      bind(root) {
        const sees = root.querySelector("#snoop-sees");
        const out = root.querySelector("#https-result");
        const set = (mode) => {
          root.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
          root.querySelector(".trip").dataset.mode = mode;
          if (mode === "http") {
            sees.textContent = "password=sunflower";
            out.className = "lab-result tone-bad";
            out.innerHTML = "<strong>Exposed.</strong> Without https, the snoop reads your password.";
          } else {
            sees.textContent = "x8$kQ#2v!Lp9@Wz…";
            out.className = "lab-result tone-good";
            out.innerHTML = "<strong>Scrambled.</strong> Only your bank can unscramble it.";
          }
        };
        root.querySelectorAll("[data-mode]").forEach((b) => { b.onclick = () => set(b.dataset.mode); });
        set("http");
      }
    },

    sql: {
      html: () => '<p class="lab-tag">' + icon("lab") + "Live lab</p>" +
        '<div class="chips">' + [["Normal name", "alice"], ["The trick", "' OR '1'='1"]].map((e) =>
          '<button type="button" class="chip" data-ex="' + esc(e[1]) + '">' + esc(e[0]) + ": <code>" + esc(e[1]) + "</code></button>").join("") + "</div>" +
        '<label class="lab-label" for="sql-input">Or type a name</label>' +
        '<input id="sql-input" class="lab-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Type a name" />' +
        '<p class="lab-label">The question the website sends</p>' +
        '<pre class="editor-body sql-out"><code id="sql-out"></code></pre>' +
        '<p class="lab-result" id="sql-result" aria-live="polite"></p>',
      bind(root) {
        const input = root.querySelector("#sql-input");
        const out = root.querySelector("#sql-out");
        const result = root.querySelector("#sql-result");
        const render = () => {
          const v = input.value;
          out.innerHTML = "SELECT * FROM users\nWHERE name = '<mark>" + esc(v) + "</mark>'";
          if (!v) { result.className = "lab-result"; result.textContent = "Tap an example above to see what happens."; }
          else if (v.includes("'")) { result.className = "lab-result tone-bad"; result.innerHTML = "<strong>Hijacked.</strong> The typing broke out of the quotes and changed the question. It now matches every user."; }
          else { result.className = "lab-result tone-good"; result.innerHTML = "<strong>Normal.</strong> It only looks for \"" + esc(v) + "\"."; }
        };
        root.querySelectorAll("[data-ex]").forEach((b) => { b.onclick = () => { input.value = b.dataset.ex; render(); }; });
        input.oninput = render;
        render();
      }
    }
  };

  function bindLabs(step) {
    const root = $screen.querySelector("[data-lab]");
    if (root && step && step.visual) LABS[step.visual.lab].bind(root, step.visual);
  }

  // ---------- Screens ----------
  function homeScreen() {
    const next = nextAction();
    const done = doneCount();
    const fresh = isFresh();
    topbar({ back: null });

    let html = "";
    if (fresh) {
      html += '<section class="hero"><p class="eyebrow">Free · made for your phone</p>' +
        '<h1 tabindex="-1">Learn how hackers trick people. Then stop them.</h1>' +
        '<p class="lead">' + LESSONS.length + " short lessons. No experience needed.</p>" +
        '<ul class="facts"><li><strong>' + LESSONS.length + "</strong> lessons</li><li><strong>" + totalMinutes + "</strong> minutes</li><li><strong>" + LESSONS.filter((l) => l.steps.some((s) => s.visual && s.visual.type === "lab")).length + "</strong> hands-on labs</li></ul></section>" +
        '<section class="how" aria-label="How it works"><h2>How each lesson works</h2><ol class="how-steps">' +
        "<li>" + icon("book") + "<span><strong>Read</strong> short steps with pictures</span></li>" +
        "<li>" + icon("bot") + "<span><strong>Try</strong> a hands-on lab</span></li>" +
        "<li>" + icon("help") + "<span><strong>Answer</strong> " + LESSONS[0].quiz.length + " quick questions</span></li></ol></section>";
    } else if (next.lesson) {
      html += '<section class="hero hero-back"><p class="eyebrow">Welcome back</p>' +
        '<h1 tabindex="-1">' + (done === 0 ? "Pick up where you left off." : "You've finished " + done + " of " + LESSONS.length + " lessons.") + "</h1>" +
        '<div class="ring-row">' + ring(done, LESSONS.length) + '<p class="lead">Up next: <strong>' + esc(next.lesson.title) + "</strong>. " + esc(next.detail) + ".</p></div></section>";
    } else {
      html += certificate();
    }

    html += '<section aria-labelledby="path-h"><h2 id="path-h">Your path</h2><ol class="path">' + LESSONS.map((l, i) => {
      const p = prog(l.id);
      const isNext = next.lesson === l;
      const status = p.done ? "Done · " + l.badge + " badge"
        : quizStarted(p) ? "Quiz in progress"
        : p.step > 0 ? "Step " + p.step + " of " + l.steps.length
        : l.minutes + " min";
      return '<li class="path-item' + (p.done ? " is-done" : "") + (isNext ? " is-next" : "") + '">' +
        '<a class="path-row" href="' + resumeRoute(l) + '">' +
        '<span class="path-dot">' + (p.done ? icon("check") : icon(l.icon)) + "</span>" +
        '<span class="path-text"><span class="path-kicker">Lesson ' + (i + 1) + (isNext ? ' · <b>You are here</b>' : "") + "</span>" +
        '<span class="path-title">' + esc(l.title) + '</span><span class="path-status">' + esc(status) + "</span></span>" +
        '<span class="chev" aria-hidden="true">›</span></a></li>';
    }).join("") + "</ol></section>";

    html += '<p class="saved-note">' + icon("save") + "Your progress saves automatically on this device.</p>";
    $screen.innerHTML = html;
    bindCertificate();
    actionbar({ label: next.label, action: () => go(next.route) });
  }

  function ring(at, of) {
    const r = 26, c = 2 * Math.PI * r, f = of ? at / of : 0;
    return '<svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="32" cy="32" r="' + r + '" class="ring-fg" stroke-dasharray="' + (c * f).toFixed(1) + " " + c.toFixed(1) + '"/>' +
      '<text x="32" y="37" text-anchor="middle">' + at + "/" + of + "</text></svg>";
  }

  function certificate() {
    const date = new Date(state.finishedAt || Date.now()).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    return '<section class="cert"><p class="eyebrow">Certificate of completion</p>' +
      '<h1 tabindex="-1">Security Lab graduate</h1>' +
      '<label class="cert-label" for="cert-name">Your name</label>' +
      '<input id="cert-name" class="cert-name" type="text" autocomplete="name" placeholder="Type your name" value="' + esc(state.name || "") + '" />' +
      '<p class="cert-line">finished all ' + LESSONS.length + " lessons on " + esc(date) + ".</p>" +
      '<ul class="badges">' + LESSONS.map((l) => "<li>" + icon(l.icon) + "<span>" + esc(l.badge) + "</span></li>").join("") + "</ul></section>";
  }
  function bindCertificate() {
    const n = document.getElementById("cert-name");
    if (n) n.oninput = () => { state.name = n.value.slice(0, 60); save(); };
  }

  function lessonScreen(lesson, n) {
    const total = lesson.steps.length;
    n = Math.max(0, Math.min(n, total));
    const p = prog(lesson.id);
    if (!p.done) { p.step = n; save(); } // where "Continue" should land next time

    const back = n === 0 ? "#home" : "#lesson-" + lesson.id + "-" + (n - 1);
    topbar({ back, title: lesson.title, home: n > 0, segments: { at: n, of: total }, label: n === 0 ? "Lesson " + (indexOf(lesson) + 1) + " of " + LESSONS.length : "Step " + n + " of " + total });

    if (n === 0) {
      $screen.innerHTML = '<section class="intro"><span class="intro-icon">' + icon(lesson.icon) + "</span>" +
        '<p class="eyebrow">Lesson ' + (indexOf(lesson) + 1) + " of " + LESSONS.length + "</p>" +
        '<h1 tabindex="-1">' + esc(lesson.title) + "</h1>" +
        '<p class="lead">' + esc(lesson.goal) + "</p></section>" +
        '<section class="card"><h2>You will learn</h2><ol class="outline">' +
        lesson.steps.map((s) => "<li>" + (s.visual && s.visual.type === "lab" ? '<span class="tag tag-lab">Lab</span>' : "") + esc(stepTitle(s.title)) + "</li>").join("") +
        '</ol><p class="meta">' + icon("help") + lesson.quiz.length + " quiz questions at the end · about " + lesson.minutes + " min</p></section>" +
        '<p class="earn">' + icon("trophy") + "Pass the quiz to earn the <strong>" + esc(lesson.badge) + "</strong> badge.</p>";
      actionbar({ label: "Start step 1", action: () => go("#lesson-" + lesson.id + "-1") });
      return;
    }

    const s = lesson.steps[n - 1];
    const isLab = s.visual && s.visual.type === "lab";
    $screen.innerHTML = '<p class="eyebrow">' + (isLab ? "Hands-on lab" : "Step " + n) + "</p>" +
      '<h1 tabindex="-1">' + esc(stepTitle(s.title)) + "</h1>" +
      '<p class="lead">' + esc(s.text) + "</p>" +
      (s.note ? '<p class="note">' + icon("alert") + esc(s.note) + "</p>" : "") +
      visual(s.visual) + wordsBox(s.words);
    bindLabs(s);
    if (n < total) actionbar({ label: "Next step", action: () => go("#lesson-" + lesson.id + "-" + (n + 1)) });
    else actionbar({ label: "Start the quiz", action: () => { prog(lesson.id).answers = {}; save(); go("#quiz-" + lesson.id + "-1"); } });
  }

  function quizScreen(lesson, n) {
    const total = lesson.quiz.length;
    n = Math.max(1, Math.min(n, total));
    const p = prog(lesson.id);
    const i = n - 1;
    const q = lesson.quiz[i];
    const chosen = p.answers[i];
    const answered = chosen !== undefined;

    const back = n === 1 ? "#lesson-" + lesson.id + "-" + lesson.steps.length : "#quiz-" + lesson.id + "-" + (n - 1);
    topbar({ back, title: lesson.title + " quiz", home: true, segments: { at: n - (answered ? 0 : 1), of: total }, label: "Question " + n + " of " + total });

    let html = '<p class="eyebrow">Quiz · question ' + n + " of " + total + "</p>" +
      '<h1 tabindex="-1" class="question">' + esc(q.q) + "</h1>" +
      '<div class="answers" role="group" aria-label="Answers">' + q.options.map((opt, k) => {
        let cls = "answer", mark = "";
        if (answered) {
          if (k === q.answer) { cls += " is-right"; mark = '<span class="answer-mark">' + icon("check") + "Right answer</span>"; }
          else if (k === chosen) { cls += " is-wrong"; mark = '<span class="answer-mark">' + icon("x") + "Your answer</span>"; }
          else cls += " is-dim";
        }
        return '<button type="button" class="' + cls + '" data-k="' + k + '"' + (answered ? " disabled" : "") + ">" +
          '<span class="answer-letter" aria-hidden="true">' + "ABCD"[k] + '</span><span class="answer-text">' + esc(opt) + mark + "</span></button>";
      }).join("") + "</div>";

    if (answered) {
      const right = chosen === q.answer;
      html += '<div class="feedback ' + (right ? "tone-good" : "tone-bad") + '" role="status">' + icon(right ? "check" : "x", "feedback-icon") +
        "<div><strong>" + (right ? "Correct!" : "Not quite.") + "</strong> " + esc(q.why) + "</div></div>";
    }
    $screen.innerHTML = html;

    if (!answered) {
      $screen.querySelectorAll("[data-k]").forEach((b) => {
        b.onclick = () => { p.answers[i] = Number(b.dataset.k); save(); quizScreen(lesson, n); revealFeedback(); };
      });
      actionbar(null, null, "Tap an answer above");
    } else if (n < total) actionbar({ label: "Next question", action: () => go("#quiz-" + lesson.id + "-" + (n + 1)) });
    else actionbar({ label: "See my score", action: () => go("#result-" + lesson.id) });
  }

  function revealFeedback() {
    const f = $screen.querySelector(".feedback");
    if (!f) return;
    f.setAttribute("tabindex", "-1");
    f.focus({ preventScroll: true });
    const r = f.getBoundingClientRect();
    const barTop = $bar.getBoundingClientRect().top;
    if (r.bottom > barTop) window.scrollBy({ top: r.bottom - barTop + 16, behavior: reduceMotion ? "auto" : "smooth" });
  }

  function resultScreen(lesson) {
    const p = prog(lesson.id);
    const total = lesson.quiz.length;
    if (Object.keys(p.answers).length < total) { go(quizRoute(lesson)); return; }
    const score = scoreOf(lesson);
    const passed = score >= passMark(lesson);
    const firstPass = passed && !p.done;
    if (passed) { p.done = true; p.step = 0; }
    p.best = Math.max(p.best || 0, score);
    if (doneCount() === LESSONS.length && !state.finishedAt) state.finishedAt = Date.now();
    save();

    topbar({ back: "#quiz-" + lesson.id + "-" + total, title: lesson.title, home: true, segments: { at: doneCount(), of: LESSONS.length }, label: doneCount() + " of " + LESSONS.length + " lessons complete" });

    const nextLesson = LESSONS.find((l) => !prog(l.id).done);
    $screen.innerHTML = '<section class="result ' + (passed ? "tone-good" : "tone-bad") + '">' +
      (passed ? '<div class="medal' + (firstPass && !reduceMotion ? " is-new" : "") + '">' + icon(lesson.icon) + "</div>" : ring(score, total)) +
      '<p class="eyebrow">' + (passed ? "Badge earned: " + esc(lesson.badge) : "Score " + score + " of " + total) + "</p>" +
      '<h1 tabindex="-1">' + (passed ? "Lesson complete!" : "Almost there") + "</h1>" +
      '<p class="lead">' + (passed ? "You got <strong>" + score + " of " + total + "</strong> right. Your progress is saved."
        : "You need " + passMark(lesson) + " of " + total + " to pass. A quick review will help.") + "</p></section>" +
      (passed && nextLesson ? '<section class="card up-next"><span class="path-dot">' + icon(nextLesson.icon) + '</span><div><p class="eyebrow">Up next</p><h2>' + esc(nextLesson.title) + "</h2><p>" + esc(nextLesson.goal) + "</p></div></section>" : "") +
      (passed && !nextLesson ? '<section class="card up-next"><span class="path-dot">' + icon("trophy") + '</span><div><p class="eyebrow">All lessons done</p><h2>Your certificate is ready</h2><p>Add your name to it on the home page.</p></div></section>' : "");

    if (firstPass && !reduceMotion) confetti();
    const retry = () => { p.answers = {}; save(); go("#quiz-" + lesson.id + "-1"); };
    if (!passed) actionbar({ label: "Review the lesson", action: () => go("#lesson-" + lesson.id + "-1") }, { label: "Try the quiz again", action: retry });
    else if (nextLesson) actionbar({ label: "Start lesson " + (indexOf(nextLesson) + 1), action: () => go(resumeRoute(nextLesson)) }, { label: "Back to home", action: () => go("#home") });
    else actionbar({ label: "See my certificate", action: () => go("#home") });
  }

  function confetti() {
    const box = document.createElement("div");
    box.className = "confetti";
    box.setAttribute("aria-hidden", "true");
    for (let k = 0; k < 28; k++) {
      const s = document.createElement("i");
      s.style.left = Math.random() * 100 + "%";
      s.style.animationDelay = Math.random() * 0.3 + "s";
      s.style.setProperty("--x", (Math.random() * 80 - 40) + "px");
      s.style.setProperty("--r", (Math.random() * 720 - 360) + "deg");
      s.className = "c" + (k % 4);
      box.appendChild(s);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2200);
  }

  // ---------- Router ----------
  function route() {
    const m = /^#(lesson|quiz|result)-(.+?)(?:-(\d+))?$/.exec(location.hash) || [];
    const lesson = m[2] ? lessonById(m[2]) : null;
    if (m[1] === "lesson" && lesson) lessonScreen(lesson, parseInt(m[3], 10) || 0);
    else if (m[1] === "quiz" && lesson) quizScreen(lesson, parseInt(m[3], 10) || 1);
    else if (m[1] === "result" && lesson) resultScreen(lesson);
    else homeScreen();
    $screen.classList.remove("enter");
    void $screen.offsetWidth; // restart the entrance animation
    $screen.classList.add("enter");
    window.scrollTo(0, 0);
    const h1 = $screen.querySelector("h1");
    if (h1) h1.focus({ preventScroll: true });
  }

  window.addEventListener("hashchange", route);
  route();
})();
