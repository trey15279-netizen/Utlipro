// Security Lab: a tiny, phone-first learning app.
// Screens (hash routes, so the iPhone swipe-back gesture works too):
//   #/                    Home: progress + the one thing to do next
//   #/lesson/<id>/<n>     Lesson step n (0 = "what you'll learn")
//   #/quiz/<id>/<n>       Quiz question n (1-based), one per screen
//   #/result/<id>         Quiz score + next recommended action
// Every screen has: a Back button (top left), where you are (title + progress),
// and exactly one primary button in the bar at the bottom.
"use strict";
(function () {
  const LESSONS = window.LAB_LESSONS || [];
  const STORE_KEY = "security-lab-progress-v1";
  const PASS_RATIO = 2 / 3;

  const $top = document.getElementById("topbar");
  const $screen = document.getElementById("screen");
  const $bar = document.getElementById("actionbar");

  // ---------- Saved progress (automatic, on this device) ----------
  // { lessons: { [id]: { step, done, best, answers: { [qIndex]: choice } } } }
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
  // Escape, then turn [[text]] into a highlight.
  const hl = (s) => esc(s).replace(/\[\[(.+?)\]\]/g, "<mark>$1</mark>");
  const lessonById = (id) => LESSONS.find((l) => l.id === id);
  const indexOf = (lesson) => LESSONS.indexOf(lesson);
  const go = (route) => { location.hash = route; };
  const passMark = (lesson) => Math.ceil(lesson.quiz.length * PASS_RATIO);
  const doneCount = () => LESSONS.filter((l) => prog(l.id).done).length;
  const quizStarted = (p) => Object.keys(p.answers).length > 0;

  function scoreOf(lesson) {
    const p = prog(lesson.id);
    return lesson.quiz.reduce((n, q, i) => n + (p.answers[i] === q.answer ? 1 : 0), 0);
  }

  // Where the learner should go next, with a label for the big button.
  function nextAction() {
    const lesson = LESSONS.find((l) => !prog(l.id).done);
    if (!lesson) return { label: "Review: " + LESSONS[0].title, route: "#/lesson/" + LESSONS[0].id + "/0", lesson: null };
    const p = prog(lesson.id);
    const n = indexOf(lesson) + 1;
    if (quizStarted(p)) {
      const nextQ = lesson.quiz.findIndex((q, i) => p.answers[i] === undefined);
      if (nextQ === -1) return { label: "See your quiz score", route: "#/result/" + lesson.id, lesson, detail: "Quiz finished" };
      return { label: "Continue quiz", route: "#/quiz/" + lesson.id + "/" + (nextQ + 1), lesson, detail: "Question " + (nextQ + 1) + " of " + lesson.quiz.length };
    }
    if (p.step > 0) return { label: "Continue lesson " + n, route: "#/lesson/" + lesson.id + "/" + p.step, lesson, detail: "Step " + p.step + " of " + lesson.steps.length };
    return { label: "Start lesson " + n, route: "#/lesson/" + lesson.id + "/0", lesson, detail: "About " + lesson.minutes + " minutes" };
  }

  // ---------- Shared screen parts ----------
  function topbar(opts) {
    // opts: { back: route|null, title, progress: {at, of, label} }
    let html = "";
    if (opts.back) {
      html += '<div class="topbar-row">' +
        '<a class="back" href="' + opts.back + '" aria-label="Back"><span aria-hidden="true">‹</span> Back</a>' +
        '<span class="topbar-title">' + esc(opts.title || "") + "</span>" +
        (opts.home ? '<a class="home-link" href="#/">Home</a>' : '<span class="home-link-spacer"></span>') +
        "</div>";
    } else {
      html += '<div class="topbar-row topbar-home"><span class="brand"><span class="brand-icon" aria-hidden="true">🛡️</span> Security Lab</span></div>';
    }
    if (opts.progress) {
      const pct = Math.round((opts.progress.at / opts.progress.of) * 100);
      html += '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + opts.progress.of + '" aria-valuenow="' + opts.progress.at + '" aria-label="' + esc(opts.progress.label) + '">' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="progress-label">' + esc(opts.progress.label) + "</span></div>";
    }
    $top.innerHTML = html;
  }

  // The bottom bar: one big primary button (and, rarely, one quiet secondary link).
  function actionbar(primary, secondary, hint) {
    let html = "";
    if (hint) html += '<p class="action-hint">' + esc(hint) + "</p>";
    if (primary) html += '<button type="button" class="btn-primary" id="primary">' + esc(primary.label) + ' <span aria-hidden="true">→</span></button>';
    if (secondary) html += '<button type="button" class="btn-secondary" id="secondary">' + esc(secondary.label) + "</button>";
    $bar.innerHTML = html;
    if (primary) document.getElementById("primary").onclick = primary.action;
    if (secondary) document.getElementById("secondary").onclick = secondary.action;
  }

  function wordsBox(words) {
    if (!words || !words.length) return "";
    return '<section class="words" aria-label="New words">' + words.map((w) =>
      '<div class="word"><span class="word-tag">New word</span><strong>' + esc(w[0]) + "</strong><span>" + esc(w[1]) + "</span></div>"
    ).join("") + "</section>";
  }

  function visual(v) {
    if (!v) return "";
    if (v.type === "flow") {
      return '<figure class="flow">' + v.nodes.map((n) => n.arrow !== undefined
        ? '<div class="flow-arrow" aria-hidden="false"><span class="flow-arrow-line" aria-hidden="true">↓</span><span class="flow-arrow-label">' + esc(n.arrow) + "</span></div>"
        : '<div class="flow-node tone-' + (n.tone || "neutral") + '"><span class="flow-icon" aria-hidden="true">' + esc(n.icon || "") + "</span><span>" + esc(n.text) + "</span></div>"
      ).join("") + "</figure>";
    }
    if (v.type === "compare") {
      const side = (s, tone, mark) => '<div class="compare-card tone-' + (s.tone || tone) + '">' +
        '<span class="compare-label"><span aria-hidden="true">' + mark(s.tone || tone) + "</span> " + esc(s.label) + "</span>" +
        '<code class="compare-value">' + hl(s.value) + "</code>" +
        '<span class="compare-note">' + esc(s.note) + "</span></div>";
      const mark = (t) => (t === "good" ? "✓" : t === "bad" ? "✗" : "•");
      return '<figure class="compare">' + side(v.bad, "bad", mark) + side(v.good, "good", mark) + "</figure>";
    }
    if (v.type === "code") {
      return '<figure class="code">' + (v.caption ? '<figcaption>' + esc(v.caption) + "</figcaption>" : "") +
        "<pre><code>" + v.lines.map(hl).join("\n") + "</code></pre>" +
        '<p class="code-key"><mark>Highlighted</mark> = the part to look at</p></figure>';
    }
    if (v.type === "message") {
      return '<figure class="message"><div class="message-head"><span aria-hidden="true">✉️</span> Message</div>' +
        '<div class="message-body">' + v.lines.map((l) => "<div>" + hl(l) + "</div>").join("") + "</div>" +
        '<p class="code-key"><mark>Highlighted</mark> = the warning sign</p></figure>';
    }
    if (v.type === "try-sql") return trySqlHtml();
    return "";
  }

  // ---------- Hands-on: build the SQL question live ----------
  const SQL_EXAMPLES = [
    { label: "Normal name", value: "alice" },
    { label: "The trick", value: "' OR '1'='1" }
  ];
  function trySqlHtml() {
    return '<figure class="try">' +
      '<p class="try-step"><strong>1.</strong> Tap an example:</p>' +
      '<div class="try-chips">' + SQL_EXAMPLES.map((e, i) =>
        '<button type="button" class="chip" data-try="' + i + '">' + esc(e.label) + ": <code>" + esc(e.value) + "</code></button>").join("") + "</div>" +
      '<label class="try-step" for="try-input"><strong>2.</strong> Or type a name:</label>' +
      '<input id="try-input" class="try-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Type a name" />' +
      '<p class="try-step"><strong>3.</strong> The question the website sends:</p>' +
      '<pre class="try-out"><code id="try-out"></code></pre>' +
      '<p class="try-result" id="try-result" aria-live="polite"></p></figure>';
  }
  function bindTrySql() {
    const input = document.getElementById("try-input");
    if (!input) return;
    const out = document.getElementById("try-out");
    const result = document.getElementById("try-result");
    const render = () => {
      const v = input.value;
      out.innerHTML = "SELECT * FROM users\nWHERE name = '<mark>" + esc(v) + "</mark>'";
      if (!v) { result.className = "try-result"; result.textContent = "Tap an example above to see what happens."; }
      else if (v.includes("'")) { result.className = "try-result tone-bad"; result.textContent = "⚠ The typing broke out of the quotes and changed the question. It now matches every user."; }
      else { result.className = "try-result tone-good"; result.textContent = "✓ Normal question. It only looks for \"" + v + "\"."; }
    };
    $screen.querySelectorAll("[data-try]").forEach((b) => {
      b.onclick = () => { input.value = SQL_EXAMPLES[Number(b.dataset.try)].value; render(); };
    });
    input.oninput = render;
    render();
  }

  // ---------- Screens ----------
  function homeScreen() {
    const next = nextAction();
    const done = doneCount();
    const fresh = !Object.keys(state.lessons).some((id) => state.lessons[id].step > 0 || state.lessons[id].done || quizStarted(state.lessons[id]));
    topbar({ back: null, progress: { at: done, of: LESSONS.length, label: done + " of " + LESSONS.length + " lessons complete" } });

    let html = "";
    if (next.lesson) {
      html += '<section class="card next-card">' +
        '<p class="eyebrow">' + (fresh ? "Start here" : "Up next") + "</p>" +
        '<h1 tabindex="-1">' + esc(next.lesson.title) + "</h1>" +
        '<p class="lead">' + esc(next.lesson.goal) + "</p>" +
        '<p class="meta">Lesson ' + (indexOf(next.lesson) + 1) + " · " + esc(next.detail) + "</p></section>";
    } else {
      html += '<section class="card next-card done-card"><p class="eyebrow">All done</p><h1 tabindex="-1">🎉 You finished every lesson</h1>' +
        '<p class="lead">Review any lesson below to keep it fresh.</p></section>';
    }

    if (fresh) {
      html += '<section class="how" aria-label="How it works"><h2>How it works</h2><ol class="how-steps">' +
        '<li><span aria-hidden="true">📖</span> Read short steps</li>' +
        '<li><span aria-hidden="true">❓</span> Answer 3 questions</li>' +
        '<li><span aria-hidden="true">✅</span> Lesson complete</li></ol></section>';
    }

    html += '<section aria-label="All lessons"><h2>All lessons</h2><ol class="lesson-list">' + LESSONS.map((l, i) => {
      const p = prog(l.id);
      const status = p.done ? { cls: "done", text: "✓ Done" }
        : quizStarted(p) ? { cls: "active", text: "Quiz started" }
        : p.step > 0 ? { cls: "active", text: "Step " + p.step + " of " + l.steps.length }
        : { cls: "new", text: l.minutes + " min" };
      const route = p.done || p.step === 0 ? "#/lesson/" + l.id + "/0" : quizStarted(p) ? nextRouteForQuiz(l) : "#/lesson/" + l.id + "/" + p.step;
      return '<li><a class="lesson-row" href="' + route + '"><span class="lesson-num' + (p.done ? " is-done" : "") + '" aria-hidden="true">' + (p.done ? "✓" : i + 1) + "</span>" +
        '<span class="lesson-text"><span class="lesson-title">' + esc(l.title) + '</span><span class="lesson-status status-' + status.cls + '">' + esc(status.text) + "</span></span>" +
        '<span class="chev" aria-hidden="true">›</span></a></li>';
    }).join("") + "</ol></section>";

    html += '<p class="saved-note"><span aria-hidden="true">💾</span> Your progress saves automatically on this device.</p>';
    $screen.innerHTML = html;
    actionbar({ label: next.label, action: () => go(next.route) });
  }

  function nextRouteForQuiz(lesson) {
    const p = prog(lesson.id);
    const i = lesson.quiz.findIndex((q, k) => p.answers[k] === undefined);
    return i === -1 ? "#/result/" + lesson.id : "#/quiz/" + lesson.id + "/" + (i + 1);
  }

  function lessonScreen(lesson, n) {
    const total = lesson.steps.length;
    n = Math.max(0, Math.min(n, total));
    const p = prog(lesson.id);
    if (!p.done) { p.step = n; save(); } // where "Continue" should land next time

    const back = n === 0 ? "#/" : "#/lesson/" + lesson.id + "/" + (n - 1);
    const label = n === 0 ? "Lesson " + (indexOf(lesson) + 1) + " of " + LESSONS.length : "Step " + n + " of " + total;
    topbar({ back, title: lesson.title, home: n > 0, progress: { at: n, of: total + 1, label } });

    if (n === 0) {
      $screen.innerHTML = '<p class="eyebrow">Lesson ' + (indexOf(lesson) + 1) + "</p>" +
        '<h1 tabindex="-1">' + esc(lesson.title) + "</h1>" +
        '<p class="lead">' + esc(lesson.goal) + "</p>" +
        '<section class="card"><h2>You will learn</h2><ol class="outline">' +
        lesson.steps.map((s) => "<li>" + esc(s.title) + "</li>").join("") +
        '</ol><p class="meta">' + total + " short steps · " + lesson.quiz.length + " questions · about " + lesson.minutes + " min</p></section>";
      actionbar({ label: "Start", action: () => go("#/lesson/" + lesson.id + "/1") });
      return;
    }

    const s = lesson.steps[n - 1];
    $screen.innerHTML = '<h1 tabindex="-1">' + esc(s.title) + "</h1>" +
      '<p class="lead">' + esc(s.text) + "</p>" +
      visual(s.visual) + wordsBox(s.words);
    bindTrySql();
    if (n < total) actionbar({ label: "Next", action: () => go("#/lesson/" + lesson.id + "/" + (n + 1)) });
    else actionbar({ label: "Start the quiz", action: () => {
      prog(lesson.id).answers = {}; save();
      go("#/quiz/" + lesson.id + "/1");
    } });
  }

  function quizScreen(lesson, n) {
    const total = lesson.quiz.length;
    n = Math.max(1, Math.min(n, total));
    const p = prog(lesson.id);
    const i = n - 1;
    const q = lesson.quiz[i];
    const chosen = p.answers[i];
    const answered = chosen !== undefined;

    const back = n === 1 ? "#/lesson/" + lesson.id + "/" + lesson.steps.length : "#/quiz/" + lesson.id + "/" + (n - 1);
    topbar({ back, title: lesson.title + " quiz", home: true, progress: { at: n - (answered ? 0 : 1), of: total, label: "Question " + n + " of " + total } });

    let html = '<p class="eyebrow">Question ' + n + " of " + total + "</p>" +
      '<h1 tabindex="-1">' + esc(q.q) + "</h1>" +
      '<div class="answers" role="group" aria-label="Answers">' + q.options.map((opt, k) => {
        let cls = "answer";
        let mark = "";
        if (answered) {
          if (k === q.answer) { cls += " is-right"; mark = '<span class="answer-mark">✓ Right answer</span>'; }
          else if (k === chosen) { cls += " is-wrong"; mark = '<span class="answer-mark">✗ Your answer</span>'; }
          else cls += " is-dim";
        }
        return '<button type="button" class="' + cls + '" data-k="' + k + '"' + (answered ? " disabled" : "") + ">" +
          '<span class="answer-letter" aria-hidden="true">' + "ABCD"[k] + "</span><span>" + esc(opt) + mark + "</span></button>";
      }).join("") + "</div>";

    if (answered) {
      const right = chosen === q.answer;
      html += '<div class="feedback ' + (right ? "tone-good" : "tone-bad") + '" role="status">' +
        "<strong>" + (right ? "✓ Correct!" : "✗ Not quite.") + "</strong> " + esc(q.why) + "</div>";
    }
    $screen.innerHTML = html;

    if (!answered) {
      $screen.querySelectorAll("[data-k]").forEach((b) => {
        b.onclick = () => { p.answers[i] = Number(b.dataset.k); save(); quizScreen(lesson, n); focusFeedback(); };
      });
      actionbar(null, null, "Tap an answer above");
    } else if (n < total) {
      actionbar({ label: "Next question", action: () => go("#/quiz/" + lesson.id + "/" + (n + 1)) });
    } else {
      actionbar({ label: "See my score", action: () => go("#/result/" + lesson.id) });
    }
  }

  function focusFeedback() {
    const f = $screen.querySelector(".feedback");
    if (f) { f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); f.scrollIntoView({ block: "nearest" }); }
  }

  function resultScreen(lesson) {
    const p = prog(lesson.id);
    const total = lesson.quiz.length;
    if (Object.keys(p.answers).length < total) { go(nextRouteForQuiz(lesson)); return; }
    const score = scoreOf(lesson);
    const passed = score >= passMark(lesson);
    if (passed) { p.done = true; p.step = 0; }
    p.best = Math.max(p.best || 0, score);
    save();

    topbar({ back: "#/quiz/" + lesson.id + "/" + total, title: lesson.title, home: true, progress: { at: doneCount(), of: LESSONS.length, label: doneCount() + " of " + LESSONS.length + " lessons complete" } });

    const nextLesson = LESSONS[indexOf(lesson) + 1];
    const stars = Array.from({ length: total }, (_, k) => '<span class="' + (k < score ? "star on" : "star") + '">' + (k < score ? "★" : "☆") + "</span>").join("");
    $screen.innerHTML = '<div class="result ' + (passed ? "tone-good" : "tone-bad") + '">' +
      '<div class="result-stars" aria-hidden="true">' + stars + "</div>" +
      '<h1 tabindex="-1">' + (passed ? "Lesson complete!" : "Almost there") + "</h1>" +
      '<p class="result-score">You got <strong>' + score + " of " + total + "</strong> right.</p>" +
      '<p class="lead">' + (passed ? "Nice work. Your progress is saved." : "You need " + passMark(lesson) + " of " + total + " to pass. A quick review will help.") + "</p></div>" +
      (passed && nextLesson ? '<section class="card"><p class="eyebrow">Up next</p><h2>' + esc(nextLesson.title) + "</h2><p>" + esc(nextLesson.goal) + "</p></section>" : "");

    const retry = () => { p.answers = {}; save(); go("#/quiz/" + lesson.id + "/1"); };
    if (!passed) actionbar({ label: "Review the lesson", action: () => go("#/lesson/" + lesson.id + "/1") }, { label: "Try the quiz again", action: retry });
    else if (nextLesson) actionbar({ label: "Start lesson " + (indexOf(nextLesson) + 1), action: () => go("#/lesson/" + nextLesson.id + "/0") }, { label: "Back to home", action: () => go("#/") });
    else actionbar({ label: "Back to home", action: () => go("#/") });
  }

  // ---------- Router ----------
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const lesson = parts[1] ? lessonById(parts[1]) : null;
    if (parts[0] === "lesson" && lesson) lessonScreen(lesson, parseInt(parts[2], 10) || 0);
    else if (parts[0] === "quiz" && lesson) quizScreen(lesson, parseInt(parts[2], 10) || 1);
    else if (parts[0] === "result" && lesson) resultScreen(lesson);
    else homeScreen();
    window.scrollTo(0, 0);
    const h1 = $screen.querySelector("h1");
    if (h1) h1.focus({ preventScroll: true });
  }

  window.addEventListener("hashchange", route);
  route();
})();
