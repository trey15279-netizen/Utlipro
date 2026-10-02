(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function initial(name) { return esc(String(name || "?").trim().charAt(0).toUpperCase() || "?"); }
  function av(agent, cls) {
    return '<span class="av' + (cls ? " " + cls : "") + '" style="--c:' + esc(agent ? agent.color : "#74777f") + '" aria-hidden="true">' + initial(agent ? agent.name : "?") + "</span>";
  }
  function clock(t) { var d = new Date(t); return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }

  var state = { status: null, agents: [], rooms: [], room: null, routeKey: "" };
  var es = null, esRoom = null;

  // ---------- Server calls ----------
  function api(method, url, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (!res.ok) throw new Error(d.error || "Something went wrong.");
        return d;
      });
    }, function () { throw new Error("Can't reach Agent Hub. Is the server still running?"); });
  }
  var toastTimer;
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  function loadLists() {
    return Promise.all([api("GET", "/api/agents"), api("GET", "/api/rooms")]).then(function (r) {
      state.agents = r[0]; state.rooms = r[1]; renderSide();
    });
  }
  function loadStatus() {
    return api("GET", "/api/status").then(function (s) { state.status = s; renderEngine(); }, function () {});
  }

  // ---------- Sidebar ----------
  function renderEngine() {
    var s = state.status, el = $("#engine");
    if (!s) { el.innerHTML = ""; return; }
    el.className = "engine " + (s.ollama ? "on" : "off");
    el.innerHTML = '<span class="dot"></span><span>' + (s.ollama
      ? (s.models.length ? "Ollama running · " + s.models.length + " model" + (s.models.length === 1 ? "" : "s") : "Ollama running · no models yet")
      : "Ollama isn't running") + "</span>";
  }
  function renderSide() {
    var key = state.routeKey;
    $("#room-list").innerHTML = state.rooms.length ? state.rooms.map(function (r) {
      return '<a href="#room-' + r.id + '" class="' + (key === "room-" + r.id ? "active" : "") + '"><span class="t"><strong>' + esc(r.title) + "</strong><small>" +
        (r.message_count ? r.message_count + " message" + (r.message_count === 1 ? "" : "s") : "No messages yet") + "</small></span>" + (r.running ? '<span class="live" title="Agents are talking"></span>' : "") + "</a>";
    }).join("") : '<p class="side-empty">No rooms yet.</p>';
    $("#agent-list").innerHTML = state.agents.length ? state.agents.map(function (a) {
      return '<a href="#agent-' + a.id + '" class="' + (key === "agent-" + a.id ? "active" : "") + '">' + av(a) + '<span class="t"><strong>' + esc(a.name) + "</strong><small>" + esc(a.role || a.model) + "</small></span></a>";
    }).join("") : '<p class="side-empty">No agents yet.</p>';
  }

  // ---------- Pages ----------
  function setupHelp() {
    var s = state.status;
    if (s && s.ollama && s.models.length) return "";
    return '<div class="setup"><h2>' + (s && s.ollama ? "Download a model" : "Set up your free local AI") + "</h2><ol>" +
      (s && s.ollama ? "" : '<li>Install <strong>Ollama</strong> from <a href="https://ollama.com" target="_blank" rel="noopener" style="color:var(--accent)">ollama.com</a> and open it.</li>') +
      "<li>Open a terminal and run <code>ollama pull " + esc(s ? s.defaultModel : "llama3.2") + "</code>. It's a one-time download of about 2 GB.</li>" +
      "<li>Come back here. The status in the corner turns green.</li></ol></div>";
  }

  function viewHome() {
    return '<div class="page"><div class="page-inner"><h1>Your agents, talking to each other</h1>' +
      '<p class="lede">Make agents with their own personalities, put them in a room, give them a topic, and watch them work it out. Everything runs on your computer.</p>' +
      setupHelp() +
      '<div class="actions"><a class="btn btn-primary" href="#new-room">Start a room</a><a class="btn btn-ghost" href="#new-agent">Create an agent</a></div></div></div>';
  }

  function modelField(current) {
    var s = state.status, models = (s && s.models) || [];
    var val = current || (s ? s.defaultModel : "llama3.2");
    if (models.length) {
      var opts = models.slice();
      if (opts.indexOf(val) < 0) opts.unshift(val);
      return '<select class="select" id="f-model">' + opts.map(function (m) {
        return "<option" + (m === val ? " selected" : "") + ">" + esc(m) + "</option>";
      }).join("") + "</select>" + (models.indexOf(val) < 0 ? '<small>"' + esc(val) + '" isn\'t downloaded. Run <code>ollama pull ' + esc(val) + "</code> or pick another.</small>" : "");
    }
    return '<input class="input mono" id="f-model" value="' + esc(val) + '" placeholder="llama3.2"/><small>Any model from ollama.com/library, after <code>ollama pull</code>.</small>';
  }

  function viewAgent(agent) {
    var isNew = !agent;
    var a = agent || { name: "", role: "", prompt: "", color: ["#5b6cff", "#e5484d", "#12a594", "#f76b15", "#8e4ec6", "#0090ff"][state.agents.length % 6] };
    return '<div class="page"><div class="page-inner"><a class="back" href="#">← Back</a>' +
      '<div style="display:flex;gap:14px;align-items:center;margin-bottom:20px">' + (isNew ? "" : av(a, "lg")) +
      "<div><h1>" + (isNew ? "New agent" : esc(a.name)) + '</h1><p class="lede" style="margin:0">' + (isNew ? "Give it a name, a job and a personality." : esc(a.role)) + "</p></div></div>" +
      '<form class="form" id="agent-form" data-id="' + (isNew ? "" : a.id) + '">' +
      '<div class="row"><label class="field"><span>Name</span><input class="input" id="f-name" required maxlength="40" value="' + esc(a.name) + '" placeholder="Researcher"/></label>' +
      '<label class="field"><span>Color</span><input type="color" class="color-input" id="f-color" value="' + esc(a.color) + '"/></label></div>' +
      '<label class="field"><span>Role</span><input class="input" id="f-role" maxlength="120" value="' + esc(a.role) + '" placeholder="Digs up facts and examples"/><small>One line other agents see about this agent.</small></label>' +
      '<label class="field"><span>Personality and instructions</span><textarea class="textarea" id="f-prompt" maxlength="4000" placeholder="You are curious and thorough. You back up points with examples, and you ask follow-up questions when something is vague.">' + esc(a.prompt) + "</textarea></label>" +
      '<label class="field"><span>Model</span>' + modelField(a.model) + "</label>" +
      '<p class="error" id="form-error" hidden></p>' +
      '<div class="actions"><button class="btn btn-primary" type="submit">' + (isNew ? "Create agent" : "Save changes") + "</button>" +
      (isNew ? "" : '<span class="spacer"></span><button class="btn btn-ghost btn-sm" type="button" data-action="delete-agent" data-id="' + a.id + '">Delete agent</button>') + "</div></form></div></div>";
  }

  function viewNewRoom() {
    var picks = state.agents.map(function (a, i) {
      return '<label class="pick"><input type="checkbox" name="agent" value="' + a.id + '"' + (i < 3 ? " checked" : "") + "/>" + av(a) +
        '<span class="t"><strong>' + esc(a.name) + "</strong><small>" + esc(a.role || a.model) + "</small></span></label>";
    }).join("");
    return '<div class="page"><div class="page-inner"><a class="back" href="#">← Back</a><h1>New room</h1>' +
      '<p class="lede">Pick who\'s in the conversation and what it\'s about.</p>' + setupHelp() +
      '<form class="form" id="room-form">' +
      '<label class="field"><span>Room name</span><input class="input" id="r-title" required maxlength="80" placeholder="Side hustle ideas"/></label>' +
      '<label class="field"><span>Topic</span><textarea class="textarea" id="r-topic" maxlength="1000" placeholder="Come up with 3 ways to make an extra $500 a month working 10 hours a week, and pick the best one."></textarea><small>The agents start from this. You can jump in any time.</small></label>' +
      '<div class="field"><span>Agents</span>' + (picks ? '<div class="picks">' + picks + "</div>" : '<p class="side-empty">Create an agent first.</p>') + "</div>" +
      '<p class="error" id="form-error" hidden></p>' +
      '<div class="actions"><button class="btn btn-primary" type="submit">Create room</button></div></form></div></div>';
  }

  // ---------- Room ----------
  function fmtText(text) {
    var names = state.room ? state.room.agents.map(function (a) { return a.name; }) : [];
    var html = esc(text);
    names.forEach(function (n) {
      var safe = esc(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      html = html.replace(new RegExp("@" + safe + "(?![\\w-])", "gi"), function (m) { return '<span class="at">' + m + "</span>"; });
    });
    return html;
  }
  function msgHtml(m) {
    var agent = m.agent_id && state.room ? state.room.agents.filter(function (a) { return a.id === m.agent_id; })[0] : null;
    var you = !m.agent_id && m.author === "You";
    var who = agent || { name: m.author, color: you ? "#17181c" : "#74777f" };
    return '<div class="msg ' + (you ? "you " : "") + esc(m.status) + '" id="m-' + m.id + '" style="--c:' + esc(who.color) + '">' + (you ? "" : av(who)) +
      '<div class="body"><div class="who"><strong>' + esc(m.author) + "</strong><time>" + clock(m.at) + '</time></div><div class="text">' + fmtText(m.content) + "</div></div></div>";
  }
  function viewRoom() {
    var r = state.room;
    var feed = r.messages.length ? r.messages.map(msgHtml).join("") :
      '<div class="empty-feed"><strong>Nobody has said anything yet</strong>Tap <b>Let them talk</b> to start the conversation' + (r.topic ? " about the topic" : "") + ", or say something first.</div>";
    return '<header class="room-head"><a class="back" href="#">←</a><div class="titles"><h1>' + esc(r.title) + "</h1><p>" + esc(r.topic || r.agents.map(function (a) { return a.name; }).join(", ")) + "</p></div>" +
      '<div class="cast">' + r.agents.map(function (a) { return av(a); }).join("") + "</div>" +
      '<button class="btn btn-ghost btn-sm" data-action="clear-room">' + (state.confirmClear ? "Tap again to clear" : "Clear") + "</button>" +
      '<button class="btn btn-ghost btn-sm" data-action="delete-room">' + (state.confirmDelete ? "Tap again to delete" : "Delete") + "</button></header>" +
      '<div class="feed" id="feed">' + feed + "</div>" +
      '<div class="composer"><form id="say-form"><textarea id="say" rows="1" placeholder="Say something to the agents… (use @Name to ask someone)" maxlength="4000"></textarea>' +
      '<button class="btn btn-primary" type="submit">Send</button></form>' +
      '<div class="controls"><label for="turns">Turns</label><select id="turns">' + [1, 3, 6, 10, 20].map(function (n) {
        return "<option" + (n === (state.turns || 3) ? " selected" : "") + ">" + n + "</option>";
      }).join("") + "</select>" +
      '<button class="btn btn-ghost btn-sm" type="button" data-action="run" id="run-btn"' + (r.running ? " hidden" : "") + ">Let them talk</button>" +
      '<button class="btn btn-danger btn-sm" type="button" data-action="stop" id="stop-btn"' + (r.running ? "" : " hidden") + ">Stop</button>" +
      '<span class="spacer"></span><label><input type="checkbox" id="auto-reply"' + (state.autoReply === false ? "" : " checked") + "/> Agents reply when I send</label></div></div>";
  }
  function scrollFeed() { var f = $("#feed"); if (f) f.scrollTop = f.scrollHeight; }
  function nearBottom() { var f = $("#feed"); return !f || f.scrollHeight - f.scrollTop - f.clientHeight < 120; }
  function setRunning(on) {
    if (!state.room) return;
    state.room.running = on;
    var run = $("#run-btn"), stop = $("#stop-btn");
    if (run) run.hidden = on;
    if (stop) stop.hidden = !on;
    var r = state.rooms.filter(function (x) { return x.id === state.room.id; })[0];
    if (r) { r.running = on; renderSide(); }
  }
  function appendMsg(m) {
    var feed = $("#feed"); if (!feed) return;
    var stick = nearBottom();
    var empty = feed.querySelector(".empty-feed"); if (empty) empty.remove();
    feed.insertAdjacentHTML("beforeend", msgHtml(m));
    if (stick) scrollFeed();
  }

  function listen(roomId) {
    if (esRoom === roomId) return;
    if (es) es.close();
    esRoom = roomId;
    es = new EventSource("/api/rooms/" + roomId + "/events");
    var mine = function (fn) { return function (ev) { if (!state.room || state.room.id !== roomId) return; fn(JSON.parse(ev.data)); }; };
    es.addEventListener("message", mine(function (d) {
      if (state.room.messages.some(function (m) { return m.id === d.message.id; })) return;
      state.room.messages.push(d.message); appendMsg(d.message);
    }));
    es.addEventListener("start", mine(function (d) { state.room.messages.push(d.message); appendMsg(d.message); }));
    es.addEventListener("token", mine(function (d) {
      var m = state.room.messages.filter(function (x) { return x.id === d.id; })[0];
      if (!m) return;
      var stick = nearBottom();
      m.content += d.text;
      var el = $("#m-" + d.id + " .text"); if (el) el.textContent = m.content;
      if (stick) scrollFeed();
    }));
    es.addEventListener("done", mine(function (d) {
      var m = state.room.messages.filter(function (x) { return x.id === d.id; })[0];
      if (!m) return;
      m.content = d.content; m.status = d.status || "done";
      var el = $("#m-" + d.id); if (el) el.outerHTML = msgHtml(m);
      loadLists();
    }));
    es.addEventListener("failed", mine(function (d) {
      var m = state.room.messages.filter(function (x) { return x.id === d.id; })[0];
      if (m) { m.content = d.error; m.status = "error"; var el = $("#m-" + d.id); if (el) el.outerHTML = msgHtml(m); }
      toast(d.error);
      loadStatus();
    }));
    es.addEventListener("running", mine(function (d) { setRunning(d.running); }));
    es.addEventListener("cleared", mine(function () { state.room.messages = []; render(); }));
  }

  // ---------- Routing ----------
  function route() {
    var h = location.hash.replace(/^#/, "");
    state.routeKey = h;
    state.confirmDelete = false; state.confirmClear = false;
    $("#shell").classList.toggle("detail", !!h);
    renderSide();
    var main = $("#main");
    var m;
    if ((m = h.match(/^room-(.+)$/))) {
      api("GET", "/api/rooms/" + m[1]).then(function (room) {
        if (state.routeKey !== h) return;
        state.room = room; render(); listen(room.id); scrollFeed();
      }, function (e) { main.innerHTML = '<div class="page"><a class="back" href="#">← Back</a><p>' + esc(e.message) + "</p></div>"; });
      return;
    }
    state.room = null;
    if (es) { es.close(); es = null; esRoom = null; }
    if (h === "new-agent") main.innerHTML = viewAgent(null);
    else if (h === "new-room") main.innerHTML = viewNewRoom();
    else if ((m = h.match(/^agent-(.+)$/))) {
      var a = state.agents.filter(function (x) { return x.id === m[1]; })[0];
      main.innerHTML = a ? viewAgent(a) : '<div class="page"><a class="back" href="#">← Back</a><p>That agent doesn\'t exist.</p></div>';
    } else main.innerHTML = viewHome();
  }
  function render() { if (state.room) { $("#main").innerHTML = viewRoom(); scrollFeed(); } }

  // ---------- Events ----------
  window.addEventListener("hashchange", route);

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]"); if (!el) return;
    var a = el.getAttribute("data-action"), room = state.room;
    if (a === "run" && room) {
      state.turns = Number($("#turns").value);
      api("POST", "/api/rooms/" + room.id + "/run", { turns: state.turns }).catch(function (err) { toast(err.message); });
    } else if (a === "stop" && room) {
      api("POST", "/api/rooms/" + room.id + "/stop", {}).catch(function (err) { toast(err.message); });
    } else if (a === "clear-room" && room) {
      if (!state.confirmClear) { state.confirmClear = true; render(); return; }
      state.confirmClear = false;
      api("POST", "/api/rooms/" + room.id + "/clear", {}).then(loadLists, function (err) { toast(err.message); });
    } else if (a === "delete-room" && room) {
      if (!state.confirmDelete) { state.confirmDelete = true; render(); return; }
      api("DELETE", "/api/rooms/" + room.id).then(function () { location.hash = ""; return loadLists(); }, function (err) { toast(err.message); });
    } else if (a === "delete-agent") {
      if (el.textContent !== "Tap again to delete") { el.textContent = "Tap again to delete"; el.className = "btn btn-danger btn-sm"; return; }
      api("DELETE", "/api/agents/" + el.getAttribute("data-id")).then(function () { location.hash = ""; toast("Agent deleted"); return loadLists(); }, function (err) { toast(err.message); });
    }
  });

  document.addEventListener("change", function (e) {
    if (e.target.id === "auto-reply") state.autoReply = e.target.checked;
    if (e.target.id === "turns") state.turns = Number(e.target.value);
  });

  document.addEventListener("keydown", function (e) {
    if (e.target.id === "say" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#say-form").requestSubmit(); }
  });
  document.addEventListener("input", function (e) {
    if (e.target.id === "say") { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }
  });

  function showError(msg) { var p = $("#form-error"); if (p) { p.textContent = msg; p.hidden = false; } else toast(msg); }

  document.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, btn = f.querySelector("[type=submit]");
    if (btn) btn.disabled = true;
    var done = function () { if (btn) btn.disabled = false; };

    if (f.id === "agent-form") {
      var body = { name: $("#f-name").value, role: $("#f-role").value, prompt: $("#f-prompt").value, model: $("#f-model").value, color: $("#f-color").value };
      var editId = f.getAttribute("data-id");
      api(editId ? "PATCH" : "POST", editId ? "/api/agents/" + editId : "/api/agents", body).then(function (agent) {
        toast(editId ? "Saved" : agent.name + " is ready");
        return loadLists().then(function () { location.hash = "agent-" + agent.id; route(); });
      }).catch(function (err) { showError(err.message); }).then(done);
    } else if (f.id === "room-form") {
      var ids = Array.prototype.map.call(f.querySelectorAll("input[name=agent]:checked"), function (i) { return i.value; });
      api("POST", "/api/rooms", { title: $("#r-title").value, topic: $("#r-topic").value, agentIds: ids }).then(function (room) {
        return loadLists().then(function () { location.hash = "room-" + room.id; });
      }).catch(function (err) { showError(err.message); }).then(done);
    } else if (f.id === "say-form" && state.room) {
      var input = $("#say"), text = input.value.trim(), roomId = state.room.id;
      if (!text) { done(); return; }
      api("POST", "/api/rooms/" + roomId + "/messages", { content: text }).then(function () {
        input.value = ""; input.style.height = "auto";
        if (state.autoReply !== false && !state.room.running) {
          return api("POST", "/api/rooms/" + roomId + "/run", { turns: Number($("#turns").value) });
        }
      }).catch(function (err) { toast(err.message); }).then(function () { done(); input.focus(); });
    } else done();
  });

  // ---------- Start ----------
  loadStatus().then(loadLists).then(route, route);
  setInterval(loadStatus, 15000);
})();
