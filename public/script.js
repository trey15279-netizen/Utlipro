(function () {
  "use strict";

  var icon = function (id) {
    return '<svg class="ico"><use href="#' + id + '"/></svg>';
  };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  // ---------- Mobile nav ----------
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("main-nav");
  toggle.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  nav.addEventListener("click", function (e) {
    if (e.target.tagName === "A") {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  // ---------- Interactive dashboard demo ----------
  var leads = [
    { name: "John Smith", service: "Roof Repair", time: "2m ago", isNew: true },
    { name: "Sarah Miller", service: "Roof Replacement", time: "7m ago", isNew: true },
    { name: "James Carter", service: "Inspection", time: "12m ago" },
    { name: "Lisa Brown", service: "Roof Repair", time: "18m ago" },
    { name: "Robert Davis", service: "Roof Replacement", time: "24m ago" }
  ];
  var activity = [
    { title: "New lead received", detail: "John Smith • Roof Repair", time: "2m ago", ico: "i-user" },
    { title: "Lead called", detail: "Sarah Miller • Roof Replacement", time: "4m ago", ico: "i-user" },
    { title: "Text sent", detail: "James Carter • Inspection", time: "12m ago", ico: "i-bell" },
    { title: "Lead viewed", detail: "Lisa Brown • Roof Repair", time: "18m ago", ico: "i-user" }
  ];

  var leadList = document.getElementById("lead-list");
  var activityList = document.getElementById("activity-list");

  function leadItem(l, enter) {
    return (
      '<li' + (enter ? ' class="enter"' : "") + '>' +
      '<span class="dot-av">' + icon("i-user") + "</span>" +
      '<span class="li-main"><strong>' + esc(l.name) + "</strong><span>" + esc(l.service) + "</span></span>" +
      '<span class="li-meta">' + esc(l.time) + (l.isNew ? '<span class="tag-new">New</span>' : "") + "</span></li>"
    );
  }
  function activityItem(a, enter) {
    return (
      '<li' + (enter ? ' class="enter"' : "") + '>' +
      '<span class="dot-av">' + icon(a.ico) + "</span>" +
      '<span class="li-main"><strong>' + esc(a.title) + "</strong><span>" + esc(a.detail) + "</span><span>" + esc(a.time) + "</span></span></li>"
    );
  }
  function render(enter) {
    leadList.innerHTML = leads.map(function (l, i) { return leadItem(l, enter && i === 0); }).join("");
    activityList.innerHTML = activity.map(function (a, i) { return activityItem(a, enter && i === 0); }).join("");
  }
  render(false);

  var samples = [
    { name: "Emily Johnson", phone: "(864) 555-0142", service: "Storm Damage" },
    { name: "Marcus Lee", phone: "(864) 555-0193", service: "Roof Replacement" },
    { name: "Olivia Martinez", phone: "(864) 555-0128", service: "Leak Repair" },
    { name: "David Wilson", phone: "(864) 555-0176", service: "Inspection" },
    { name: "Ava Thompson", phone: "(864) 555-0111", service: "Gutter Repair" }
  ];
  var sampleIdx = 0;

  var toast = document.getElementById("toast");
  var toastText = document.getElementById("toast-text");
  var phoneNotif = document.getElementById("phone-notif");
  var toastTimer;

  function addLead(lead) {
    // age the existing entries' "New" tag after the first two
    leads.unshift({ name: lead.name, service: lead.service, time: "now", isNew: true });
    leads = leads.slice(0, 5);
    leads.forEach(function (l, i) { if (i > 1) l.isNew = false; });

    activity.unshift({ title: "New lead received", detail: lead.name + " • " + lead.service, time: "now", ico: "i-user" });
    activity = activity.slice(0, 4);
    render(true);

    toastText.textContent = lead.name + " • " + lead.service;
    document.getElementById("pn-name").textContent = lead.name;
    document.getElementById("pn-phone").textContent = lead.phone;
    document.getElementById("pn-service").textContent = lead.service;

    toast.classList.remove("show");
    phoneNotif.classList.remove("show");
    void toast.offsetWidth; // restart transition
    toast.classList.add("show");
    phoneNotif.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 4000);
  }

  document.getElementById("demo-btn").addEventListener("click", function () {
    addLead(samples[sampleIdx++ % samples.length]);
  });

  // Show the initial phone notification shortly after load
  setTimeout(function () { phoneNotif.classList.add("show"); }, 600);

  // ---------- "How it works" mini form ----------
  var flowForm = document.getElementById("flow-form");
  var flowCard = document.querySelector(".flow-card");
  flowForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = {
      name: flowForm.name.value.trim() || "John Smith",
      phone: flowForm.phone.value.trim() || "(864) 555-0187",
      service: flowForm.service.value.trim() || "Roof Repair"
    };
    document.querySelectorAll("[data-flow]").forEach(function (el) {
      el.textContent = data[el.getAttribute("data-flow")];
    });
    flowCard.classList.remove("pulse");
    void flowCard.offsetWidth;
    flowCard.classList.add("pulse");
    addLead(data);
    flowForm.reset();
  });

  // ---------- Testimonial slider ----------
  var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  var dotsWrap = document.getElementById("dots");
  var current = 0;
  var timer;

  slides.forEach(function (_, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", "Show testimonial " + (i + 1));
    b.addEventListener("click", function () { go(i); });
    dotsWrap.appendChild(b);
  });
  var dots = dotsWrap.children;

  function go(i) {
    current = (i + slides.length) % slides.length;
    slides.forEach(function (s, j) { s.classList.toggle("active", j === current); });
    for (var j = 0; j < dots.length; j++) dots[j].classList.toggle("active", j === current);
    clearInterval(timer);
    timer = setInterval(function () { go(current + 1); }, 7000);
  }
  document.getElementById("prev").addEventListener("click", function () { go(current - 1); });
  document.getElementById("next").addEventListener("click", function () { go(current + 1); });
  go(0);

  // ---------- FAQ: one open at a time ----------
  var details = document.querySelectorAll(".faq-list details");
  details.forEach(function (d) {
    d.addEventListener("toggle", function () {
      if (!d.open) return;
      details.forEach(function (o) { if (o !== d) o.open = false; });
    });
  });
})();
