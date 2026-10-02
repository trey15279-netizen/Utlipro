// Command Hub site analytics: remembers which campaign or email brought a visitor
// (?c=campaign, ?r=recipient, utm_* tags), records key actions, and loads ad tags when configured.
(function () {
  "use strict";
  var VID = "ch_vid", ATTR = "ch_attr";
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }

  var vid = get(VID);
  if (!vid || !/^[\w-]{8,64}$/.test(vid)) {
    vid = (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).slice(0, 24);
    put(VID, vid);
  }
  var attr = {};
  try { attr = JSON.parse(get(ATTR) || "{}") || {}; } catch (e) { attr = {}; }
  var q = new URLSearchParams(location.search), fresh = {}, any = false;
  ["c", "r", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) {
    var v = q.get(k);
    if (v) { fresh[k] = v.slice(0, 100); any = true; }
  });
  if (any) {
    // A new campaign link replaces the old one, so results credit the latest email.
    attr = fresh;
    attr.landing = location.pathname;
    put(ATTR, JSON.stringify(attr));
  }

  function send(type, label) {
    var body = JSON.stringify({ vid: vid, type: type, label: label || "", path: location.pathname, ref: document.referrer, attr: attr });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon("/t", body)) return;
      fetch("/t", { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(function () {});
    } catch (e) { /* tracking is best-effort */ }
  }

  // ---------- Ad tags (only when set on the server) ----------
  var cfg = window.CH_CONFIG || {};
  if (cfg.metaPixel) {
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    window.fbq("init", cfg.metaPixel);
    window.fbq("track", "PageView");
  }
  if (cfg.googleTag) {
    var g = document.createElement("script");
    g.async = true; g.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(cfg.googleTag);
    document.head.appendChild(g);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", cfg.googleTag);
  }

  window.chTrack = {
    event: send,
    attribution: function () { return { vid: vid, attr: attr }; },
    // Called by the sign-up page after an account is created. The server records the sign-up itself.
    signedUp: function () {
      if (window.fbq) window.fbq("track", "Lead");
      if (window.gtag) {
        window.gtag("event", "sign_up");
        if (cfg.googleSignupConversion) window.gtag("event", "conversion", { send_to: cfg.googleSignupConversion });
      }
    }
  };

  send("pageview");

  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-track]");
    if (el) send(el.getAttribute("data-track"), (el.getAttribute("data-track-label") || el.textContent || "").trim().slice(0, 60));
  });

  if ("IntersectionObserver" in window) {
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var t = en.target.getAttribute("data-track-view");
        if (en.isIntersecting && !seen[t]) { seen[t] = true; send(t); io.unobserve(en.target); }
      });
    }, { threshold: 0.4 });
    document.querySelectorAll("[data-track-view]").forEach(function (el) { io.observe(el); });
  }
})();
