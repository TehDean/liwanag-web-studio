/*
 * Liwanag chat assistant widget. One file, no dependencies.
 * Add to any page:
 *   <script src="chat-widget.js" defer
 *     data-endpoint="https://<project>.supabase.co/functions/v1/chat"
 *     data-client="liwanag"
 *     data-title="Ask about pricing, timelines or booking"
 *     data-greeting="Hi! Ask me anything about ..."
 *     data-chips="What does a site cost?|How long does it take?"
 *     data-accent="#B23A2B" data-dark="#1F2547" data-soft="#F7EDE0"></script>
 * Styles live in a shadow root, so they never clash with the site's CSS.
 */
(function () {
  var me = document.currentScript;
  if (!me || window.__liwanagChat) return;
  window.__liwanagChat = true;
  var cfg = me.dataset;
  var endpoint = cfg.endpoint + "?client=" + encodeURIComponent(cfg.client);
  var accent = cfg.accent || "#B23A2B", dark = cfg.dark || "#1F2547", soft = cfg.soft || "#F3F4F6";

  function store(kind, key, val) {
    try {
      var s = kind === "local" ? window.localStorage : window.sessionStorage;
      if (val === undefined) return s.getItem(key);
      s.setItem(key, val);
    } catch (e) { return null; }
  }
  var visitorId = store("local", "lw_chat_visitor");
  if (!visitorId) {
    visitorId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
    store("local", "lw_chat_visitor", visitorId);
  }
  var convKey = "lw_chat_conv_" + cfg.client;
  var conversationId = store("session", convKey);
  var busy = false;

  var host = document.createElement("div");
  host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483000";
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    "<style>" +
    ":host{all:initial}*{box-sizing:border-box;font-family:Inter,system-ui,-apple-system,sans-serif}" +
    ".wrap{display:flex;flex-direction:column;align-items:flex-end;gap:10px}" +
    ".panel{width:340px;max-width:calc(100vw - 40px);height:460px;max-height:calc(100vh - 110px);background:#fff;border:1px solid #E7E1D8;border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.16);display:none;flex-direction:column;overflow:hidden}" +
    ".panel.open{display:flex}" +
    ".head{padding:14px 16px;background:" + dark + ";color:#fff;font-weight:600;font-size:14px;display:flex;justify-content:space-between;align-items:center;gap:8px}" +
    ".x{background:none;border:0;color:#fff;font-size:20px;line-height:1;cursor:pointer;padding:0 2px}" +
    ".log{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:1.45;color:" + dark + "}" +
    ".m{padding:9px 12px;border-radius:12px;max-width:88%;white-space:pre-wrap;word-wrap:break-word}" +
    ".bot{background:" + soft + ";align-self:flex-start}" +
    ".me{background:" + accent + ";color:#fff;align-self:flex-end}" +
    ".m a{color:inherit;text-decoration:underline}" +
    ".chips{display:flex;flex-wrap:wrap;gap:6px}" +
    ".chip{border:1px solid #DCCBB8;background:#fff;color:" + dark + ";border-radius:999px;padding:6px 10px;font-size:13px;cursor:pointer}" +
    ".typing{opacity:.6;font-style:italic}" +
    "form{display:flex;gap:8px;padding:10px;border-top:1px solid #EFE7DC}" +
    "input{flex:1;min-width:0;border:1px solid #DCCBB8;border-radius:10px;padding:10px 12px;font-size:16px;color:" + dark + ";outline:none}" +
    "input:focus{border-color:" + accent + "}" +
    ".send{border:0;background:" + accent + ";color:#fff;border-radius:10px;padding:0 14px;font-weight:600;font-size:14px;cursor:pointer}" +
    ".send:disabled{opacity:.5;cursor:default}" +
    ".note{font-size:11px;color:#8A8578;padding:0 12px 8px}" +
    ".bubble{width:56px;height:56px;border-radius:50%;border:0;background:" + accent + ";color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.2)}" +
    "</style>" +
    '<div class="wrap">' +
    '<div class="panel" role="dialog" aria-label="Chat assistant">' +
    '<div class="head"><span class="title"></span><button class="x" type="button" aria-label="Close chat">&times;</button></div>' +
    '<div class="log" aria-live="polite"></div>' +
    '<form><input type="text" maxlength="800" placeholder="Type your question" aria-label="Your question"><button class="send" type="submit">Send</button></form>' +
    '<div class="note">Automated assistant. Chats are saved to improve answers; please don\'t share card numbers or passwords.</div>' +
    "</div>" +
    '<button class="bubble" type="button" aria-label="Open chat assistant"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>' +
    "</div>";

  var panel = root.querySelector(".panel"), log = root.querySelector(".log");
  var form = root.querySelector("form"), input = root.querySelector("input"), send = root.querySelector(".send");
  root.querySelector(".title").textContent = cfg.title || "Questions? Ask here";

  function esc(s) { return s.replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  // Make #section links and web addresses clickable; everything else stays plain text.
  function linkify(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, "$1")
      // [words](#section) and [words](https://...) become links with those words
      .replace(/\[([^\]]+)\]\((#[a-z][\w-]*)\)/gi, '<a href="$2" data-anchor="1">$1</a>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
      .replace(/(^|[\s(])(#[a-z][\w-]*)/gi, '$1<a href="$2" data-anchor="1">$2</a>');
  }
  function add(text, who) {
    var d = document.createElement("div");
    d.className = "m " + who;
    if (who === "bot") d.innerHTML = linkify(text); else d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }
  log.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-anchor]");
    if (!a) return;
    e.preventDefault();
    var el = document.getElementById(a.getAttribute("href").slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth" });
    if (window.innerWidth < 640) toggle(false);
  });

  var greeted = false;
  function greet() {
    if (greeted) return;
    greeted = true;
    add(cfg.greeting || "Hi! How can I help?", "bot");
    var chips = (cfg.chips || "").split("|").filter(Boolean);
    if (chips.length) {
      var row = document.createElement("div");
      row.className = "chips";
      chips.forEach(function (c) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "chip"; b.textContent = c;
        b.onclick = function () { row.remove(); ask(c); };
        row.appendChild(b);
      });
      log.appendChild(row);
    }
  }
  function toggle(open) {
    var willOpen = open === undefined ? !panel.classList.contains("open") : open;
    panel.classList.toggle("open", willOpen);
    if (willOpen) { greet(); setTimeout(function () { input.focus(); }, 50); }
  }
  root.querySelector(".bubble").onclick = function () { toggle(); };
  root.querySelector(".x").onclick = function () { toggle(false); };

  function ask(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    var chips = log.querySelector(".chips");
    if (chips) chips.remove();
    busy = true; send.disabled = true;
    add(text, "me");
    var wait = add("Typing…", "bot typing");
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId: visitorId, conversationId: conversationId, message: text, page: location.href.slice(0, 300) })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.conversationId) { conversationId = d.conversationId; store("session", convKey, conversationId); }
        wait.remove();
        add(d.reply || "Sorry, something went wrong. Please try again.", "bot");
      })
      .catch(function () {
        wait.remove();
        add("Sorry, I can't connect right now. Please try again in a moment.", "bot");
      })
      .then(function () { busy = false; send.disabled = false; input.focus(); });
  }
  form.addEventListener("submit", function (e) { e.preventDefault(); var t = input.value; input.value = ""; ask(t); });

  if (document.body) document.body.appendChild(host);
  else document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(host); });
})();
