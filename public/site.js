// Command Hub website: live demo, video, calculator, setup request, scroll effects.
(function () {
  var samples = [
    { n: "Maria Alvarez", s: "Roof Replacement", p: "(864) 555-0142", c: "Spartanburg, SC", t: "Storm damage, wants an estimate this week." },
    { n: "Derek Hall", s: "Leak Inspection", p: "(864) 555-0166", c: "Greer, SC", t: "Ceiling stain after last night's rain." },
    { n: "Tanya Brooks", s: "Hail Damage", p: "(864) 555-0123", c: "Simpsonville, SC", t: "Insurance adjuster comes Friday." },
    { n: "Greg Palmer", s: "Roof Repair", p: "(864) 555-0199", c: "Mauldin, SC", t: "Missing shingles near the chimney." }
  ];
  var rows = [
    { n: "John Smith", s: "Roof Repair", a: "2s ago", fresh: true },
    { n: "Sarah Miller", s: "Roof Replacement", a: "4m ago" },
    { n: "James Carter", s: "Inspection", a: "12m ago" },
    { n: "Lisa Brown", s: "Roof Repair", a: "18m ago" }
  ];
  var idx = 0;
  var el = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function render() {
    el("rows").innerHTML = rows.slice(0, 4).map(function (r) {
      return '<div class="row' + (r.fresh ? " fresh" : "") + '"><span class="av">' + esc(r.n.charAt(0)) + '</span><span class="tx"><b>' + esc(r.n) + '</b><small>' + esc(r.s) + '</small></span><span class="ago">' + esc(r.a) + (r.fresh ? '<br><span class="badge">New</span>' : "") + "</span></div>";
    }).join("");
  }
  render();
  el("submitLead").addEventListener("click", function () {
    var s = samples[idx++ % samples.length];
    el("nName").textContent = s.n; el("nSvc").textContent = s.s; el("nPhone").textContent = s.p;
    el("nCity").textContent = s.c; el("nNote").textContent = s.t; el("when").textContent = "just now"; el("rec").textContent = "";
    rows.forEach(function (r) { r.fresh = false; if (r.a === "2s ago" || r.a === "just now") r.a = "1m ago"; });
    rows.unshift({ n: s.n, s: s.s, a: "just now", fresh: true });
    render();
  });
  document.querySelectorAll("#v-site .act").forEach(function (b) {
    b.addEventListener("click", function () { el("rec").textContent = b.getAttribute("data-act") + " click recorded (demo)"; });
  });

  var timers = [];
  el("play").addEventListener("click", function () {
    timers.forEach(clearTimeout); timers = [];
    var f = el("sForm"), h = el("sHub"), p = el("sPhone"), bar = el("prog");
    [f, h, p].forEach(function (x) { x.classList.remove("glow"); });
    bar.style.transition = "none"; bar.style.width = "0";
    void bar.offsetWidth;
    bar.style.transition = "width 6s linear"; bar.style.width = "100%";
    el("plabel").textContent = "Playing…";
    f.classList.add("glow");
    timers.push(setTimeout(function () { f.classList.remove("glow"); h.classList.add("glow"); }, 2000));
    timers.push(setTimeout(function () { h.classList.remove("glow"); p.classList.add("glow"); }, 4000));
    timers.push(setTimeout(function () { p.classList.remove("glow"); el("plabel").textContent = "Replay walkthrough"; }, 6200));
  });

  el("copy").addEventListener("click", function () {
    var btn = el("copy"), t = el("addr").textContent;
    function done() { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1500); }
    try { navigator.clipboard.writeText(t).then(done, function () { window.getSelection().selectAllChildren(el("addr")); }); }
    catch (e) { window.getSelection().selectAllChildren(el("addr")); }
  });
})();
/* Added: demo video, savings calculator, done-for-you setup request */
(function () {
  function el(id) { return document.getElementById(id); }
  var PRICE = 697;

  // Demo video: shows only once a demo.mp4 is published next to this page.
  var vid = el("demoVid");
  if (vid) {
    var showVid = function () {
      vid.hidden = false;
      var bar = document.querySelector("#player .bar"), scene = document.querySelector("#player .scene");
      if (bar) bar.hidden = true;
      if (scene) scene.style.visibility = "hidden";
      el("player").style.aspectRatio = "16 / 9";
      var pill = document.querySelector("#player .pill");
      if (pill) pill.textContent = "WATCH THE 40-SECOND DEMO";
    };
    if (vid.readyState >= 1) showVid(); else vid.addEventListener("loadedmetadata", showVid);
    vid.addEventListener("error", function () { vid.hidden = true; }, true);
  }

  // Savings calculator
  var money = function (n) { return "$" + Math.round(n).toLocaleString("en-US"); };
  function val(id, max) { var v = parseFloat(el(id).value); return isFinite(v) ? Math.min(Math.max(v, 0), max) : 0; }
  function calc() {
    var leads = val("rLeads", 10000), job = val("rJob", 1000000), miss = val("rMiss", 100) / 100, close = val("rClose", 100) / 100;
    var jobs = leads * miss * close, lost = jobs * job, months = job / PRICE;
    el("rLost").textContent = money(lost);
    el("rJobs").textContent = jobs.toFixed(jobs < 10 ? 1 : 0);
    el("rMonths").textContent = months >= 100 ? Math.round(months) : months.toFixed(1);
    el("oLeads").textContent = leads; el("oJob").textContent = money(job); el("oMiss").textContent = Math.round(miss * 100) + "%"; el("oClose").textContent = Math.round(close * 100) + "%";
    ["rLeads", "rJob", "rMiss", "rClose"].forEach(function (id) { var i = el(id); i.style.setProperty("--p", ((i.value - i.min) / (i.max - i.min) * 100) + "%"); });
    var line = el("rLine");
    if (!job) line.textContent = "Enter your average job value to see what one saved job is worth.";
    else if (lost >= PRICE) line.textContent = "Command Hub costs $697 a month. Saving just one of those jobs pays for about " + Math.floor(months) + " month" + (Math.floor(months) === 1 ? "" : "s") + " of it.";
    else line.textContent = "At these numbers, one saved job still covers about " + months.toFixed(1) + " months of Command Hub.";
  }
  ["rLeads", "rJob", "rMiss", "rClose"].forEach(function (id) { var i = el(id); if (i) i.addEventListener("input", calc); });
  if (el("rLeads")) calc();

  // Setup request: this page can't store visitors' details, so it builds an email for them to send.
  var form = el("setupForm");
  if (!form) return;
  function to() { var a = el("addr"); return a ? a.textContent.trim() : ""; }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = { co: el("fCo").value.trim(), name: el("fName").value.trim(), phone: el("fPhone").value.trim(), email: el("fEmail").value.trim(),
      site: el("fSite").value.trim(), built: el("fBuilt").value, vol: el("fVol").value, note: el("fNote").value.trim() };
    var err = el("fErr"), miss = [];
    if (!f.co) miss.push("company name");
    if (!f.name) miss.push("your name");
    if (f.phone.replace(/\D/g, "").length < 10) miss.push("a 10-digit cell number");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) miss.push("a valid email");
    if (miss.length) { err.textContent = "Please add " + miss.join(", ") + "."; err.hidden = false; return; }
    err.hidden = true;
    var body = "Setup request for Command Hub\n\n" +
      "Company: " + f.co + "\nName: " + f.name + "\nCell: " + f.phone + "\nEmail: " + f.email +
      "\nWebsite: " + (f.site || "(none)") + "\nBuilt with: " + f.built + "\nLeads per month: " + f.vol +
      (f.note ? "\nNotes: " + f.note : "");
    var subject = "Setup request: " + f.co;
    var href = "mailto:" + to() + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    var box = document.createElement("div");
    box.className = "done";
    box.innerHTML = '<svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#14b86a"/><path d="M7 12.5l3 3 7-7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<h3>Last step: send it to us</h3><p>Tap the button to email your details to <b class="toaddr"></b>. If your email app doesn\'t open, copy the details below and send them yourself.</p>' +
      '<pre class="sum"></pre><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn lg send">Email My Setup Request</a><button class="btn ghost copyd" type="button">Copy details</button></div>';
    box.querySelector(".toaddr").textContent = to();
    box.querySelector(".sum").textContent = body;
    box.querySelector(".send").href = href;
    box.querySelector(".copyd").addEventListener("click", function () {
      var b = this, pre = box.querySelector(".sum");
      function sel() { var r = document.createRange(); r.selectNodeContents(pre); var w = window.getSelection(); w.removeAllRanges(); w.addRange(r); b.textContent = "Selected. Copy it now"; }
      try { navigator.clipboard.writeText(body).then(function () { b.textContent = "Copied"; }, sel); } catch (x) { sel(); }
    });
    form.replaceChildren(box);
  });
})();
(function () {
  if (!("IntersectionObserver" in window) || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  var sel = "#v-site .sec-head, #v-site .research .stats > div, #v-site .vs, #v-site .player, #v-site .steps3, #v-site .try .demo, #v-site .frow, #v-site .extras li, #v-site .roi .box > *, #v-site #pricing .wrap > :not(.sec-head), #v-site .start .box > *, #v-site .faq details, #v-site .ccard, #v-site .crew-text";
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -5% 0px", threshold: 0.01 });
  var groups = new Map();
  document.querySelectorAll(sel).forEach(function (n) {
    if (n.getBoundingClientRect().top < window.innerHeight) return;
    var k = n.parentElement, i = groups.get(k) || 0; groups.set(k, i + 1);
    n.style.setProperty("--d", Math.min(i, 4) * 0.08 + "s");
    n.classList.add("rv"); io.observe(n);
  });
  // Near the very bottom some items can't scroll far enough to trigger; show everything left.
  window.addEventListener("scroll", function end() {
    if (window.innerHeight + window.scrollY < document.documentElement.scrollHeight - 40) return;
    document.querySelectorAll("#v-site .rv:not(.in)").forEach(function (n) { n.classList.add("in"); });
    window.removeEventListener("scroll", end);
  }, { passive: true });
})();
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Hero: sample lead alerts pop in over the dashboard.
  var pop = document.getElementById("heroPop");
  if (pop) {
    var L = [["Storm Damage", "Maria Alvarez"], ["Roof Repair", "Derek Hall"], ["Roof Replacement", "Tanya Brooks"], ["Inspection", "Greg Palmer"]], i = 0;
    var pop2 = document.getElementById("heroPop2"), t2;
    var show = function () {
      var x = L[i++ % L.length]; document.getElementById("popSvc").textContent = x[0]; document.getElementById("popName").textContent = x[1];
      document.getElementById("pop2Name").textContent = x[1].split(" ")[0]; pop.classList.add("show");
      clearTimeout(t2); if (reduce) pop2.classList.add("show"); else t2 = setTimeout(function () { pop2.classList.add("show"); }, 1100);
    };
    if (reduce) show();
    else {
      setTimeout(show, 900);
      setInterval(function () { if (document.hidden) return; pop.classList.remove("show"); pop2.classList.remove("show"); setTimeout(show, 700); }, 6200);
    }
  }
  if (!("IntersectionObserver" in window)) return;
  // Menu: highlight the section on screen.
  var links = {};
  document.querySelectorAll("#v-site .links a[href^='#']").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      Object.keys(links).forEach(function (k) { links[k].classList.toggle("on", k === e.target.id); });
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  Object.keys(links).forEach(function (k) { var sct = document.getElementById(k); if (sct && sct.closest("#v-site")) io.observe(sct); });
  // Phones: a trial button that follows you once you're past the hero, hidden at the sign-up form.
  var bar = document.getElementById("mbar"), hero = document.querySelector("#v-site .lhero"), start = document.getElementById("start"), past = false, atForm = false;
  function upd() { var on = past && !atForm; bar.classList.toggle("show", on); bar.setAttribute("aria-hidden", on ? "false" : "true"); bar.querySelector("a").tabIndex = on ? 0 : -1; }
  if (bar && hero && start) {
    new IntersectionObserver(function (es) { past = !es[0].isIntersecting && es[0].boundingClientRect.top < 0; upd(); }).observe(hero);
    new IntersectionObserver(function (es) { atForm = es[0].isIntersecting; upd(); }, { rootMargin: "0px 0px -20% 0px" }).observe(start);
  }
})();
(function () {
  // "Watch demo" buttons scroll to the video and start it.
  document.querySelectorAll("#v-site .watch-demo").forEach(function (a) {
    a.addEventListener("click", function () {
      var v = document.getElementById("demoVid");
      if (v && !v.hidden) setTimeout(function () { try { v.play(); } catch (e) {} }, 600);
    });
  });
  // See It In Action: walk through the four steps.
  var st = document.querySelectorAll("#stepper li"), al = document.getElementById("malert");
  if (!st.length || !al) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;
  var i = 0;
  function tick() {
    st.forEach(function (li, k) { li.classList.toggle("on", k === i); });
    al.classList.toggle("dim", i === 0);
    i = (i + 1) % st.length;
  }
  tick(); setInterval(function () { if (!document.hidden) tick(); }, 1800);
})();
