// The phone page for audience play-along.
//
// Phones only ever see what the TV shows: the board with hidden letters left blank. Each
// person locks in one guess per puzzle; the host's laptop checks it and scores it, and the
// result shows up here once the puzzle is solved on stage.

import { boardHtml, VOWELS } from "./board.js?v=__V__";
import { Relay, brokerFor, cleanCode, TOPIC_ROOT } from "./relay.js?v=__V__";

const STORE_KEY = "wheel.play.v1";
const MAX_POINTS = 1000;

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  } catch {
    return null;
  }
}

function store() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(me));
  } catch {
    /* private window: fine, just won't remember */
  }
}

const me = Object.assign({ id: "p" + Math.random().toString(36).slice(2, 12), name: "", code: "", joined: false }, load() || {});
const params = new URLSearchParams(location.search);
const linkCode = cleanCode(params.get("code"));
if (linkCode && linkCode !== me.code) {
  me.code = linkCode;
  me.joined = false;
}
store();

let relay = null;
let topic = "";
let status = "idle"; // idle | connecting | live | down
let view = null; // the latest board from the host
let pending = null; // { pid, text } sent but not confirmed yet
let joinError = "";
let lastJoinSent = 0;
let resendTimer = null;
let formKey = "";

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

function connect() {
  const broker = brokerFor(me.code);
  if (!broker) return;
  relay?.close();
  view = null;
  topic = TOPIC_ROOT + me.code;
  relay = new Relay(broker.url, {
    onMessage: (t, m) => {
      if (t !== topic + "/s") return;
      view = m;
      const mine = m.players?.[me.id];
      if (!m.closed && !mine) sendJoin();
      if (pending && (pending.pid !== m.pid || mine?.g)) pending = null;
      render();
    },
    onStatus: (s) => {
      status = s;
      if (s === "live") sendJoin(true);
      render();
    },
  });
  relay.subscribe(topic + "/s");
  relay.start();
  status = "connecting";
}

function sendJoin(force = false) {
  if (!relay) return;
  if (!force && Date.now() - lastJoinSent < 3000) return;
  lastJoinSent = Date.now();
  relay.publish(topic + "/h", { t: "join", id: me.id, name: me.name });
}

// Check in now and then so the host knows we're still here.
setInterval(() => sendJoin(true), 25000);

function sendGuess(text) {
  if (!view?.open || !view.pid) return;
  pending = { pid: view.pid, text };
  // Remember what they typed, so it still shows after a reload.
  const keep = Object.entries(me.last || {}).slice(-5);
  me.last = Object.fromEntries([...keep, [view.pid, text]]);
  store();
  const msg = { t: "guess", id: me.id, pid: view.pid, text };
  relay.publish(topic + "/h", msg);
  clearInterval(resendTimer);
  let tries = 0;
  resendTimer = setInterval(() => {
    if (!pending || pending.pid !== msg.pid || ++tries > 6) return clearInterval(resendTimer);
    relay.publish(topic + "/h", msg);
  }, 2500);
  render();
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

const app = document.getElementById("app");

function render() {
  if (!me.joined) return renderJoin();
  if (!app.querySelector(".pp")) {
    app.innerHTML = `<main class="pp">
      <header class="pp-top" id="pp-top"></header>
      <section id="pp-view"></section>
      <section id="pp-form"></section>
      <section id="pp-lb"></section>
      <footer class="pp-foot"><button class="linkish" id="pp-leave">Change name or room</button></footer>
    </main>`;
    document.getElementById("pp-leave").onclick = () => {
      me.joined = false;
      store();
      relay?.close();
      relay = null;
      app.innerHTML = "";
      render();
    };
  }
  const mine = view?.players?.[me.id];
  const dot = status === "live" ? "live" : status === "down" ? "down" : "connecting";
  document.getElementById("pp-top").innerHTML = `
    <div class="pp-me"><span class="aud-dot ${dot}"></span><strong>${esc(me.name)}</strong></div>
    <div class="pp-score">${mine ? `${mine.p.toLocaleString("en-US")} pts${view.count > 1 ? ` · #${mine.r} of ${view.count}` : ""}` : status === "live" ? "Joining…" : "Connecting…"}</div>`;
  document.getElementById("pp-view").innerHTML = viewHtml(mine);
  renderForm(mine);
  document.getElementById("pp-lb").innerHTML = lbHtml(mine);
}

function viewHtml(mine) {
  if (!view) return `<div class="pp-wait"><div class="pp-spinner"></div><p>${status === "down" ? "Reconnecting…" : "Connecting to the game…"}</p></div>`;
  if (view.closed) return `<div class="pp-wait"><p>The host has turned off play-along for now.</p></div>`;
  if (!view.pid)
    return `<div class="pp-wait"><p class="pp-big">You're in!</p><p>Puzzles show up here as soon as they're on the board. Keep this page open.</p>${lastResult(mine)}</div>`;
  // A hidden space just needs some letter in it for the board to draw it as a blank tile.
  const cells = (view.cells || []).map(([r, c, ch]) => ({ r, c, ch: ch || "M" }));
  const hidden = new Set((view.cells || []).map((x, i) => (x[2] === "" ? i : -1)).filter((i) => i >= 0));
  const board = cells.length
    ? boardHtml(cells, { tile: (i) => (hidden.has(i) ? "hidden" : "shown") })
    : `<div class="pp-wait"><p>Get ready — the board's coming up.</p></div>`;
  const used = view.used?.length
    ? `<div class="used pp-used">${"ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        .split("")
        .map((L) => `<span class="${VOWELS.has(L) ? "vowel" : ""}${view.used.includes(L) ? " gone" : ""}">${L}</span>`)
        .join("")}</div>`
    : "";
  return `<div class="pp-seg">${esc(view.seg)}</div>
    ${board}
    ${view.cat ? `<div class="pp-cat">${esc(view.cat)}</div>` : ""}
    ${used}
    ${view.revealed ? revealHtml(mine) : ""}`;
}

function revealHtml(mine) {
  const g = mine?.g;
  const st = view.stats;
  let mineLine = `<p class="pp-res none">You didn't guess on this one.</p>`;
  if (Array.isArray(g)) {
    mineLine = g[0]
      ? `<p class="pp-res ok">✓ You got it! <strong>+${g[1].toLocaleString("en-US")}</strong></p>`
      : `<p class="pp-res no">✗ You said “${esc(g[2])}”</p>`;
  }
  return `<div class="pp-reveal">
    ${mineLine}
    ${st ? `<p class="small">${st.right} of ${st.locked} got it${st.fastest ? ` · fastest: ${esc(st.fastest.name)} +${st.fastest.pts}` : ""}</p>` : ""}
  </div>`;
}

function lastResult(mine) {
  if (!mine?.l) return "";
  return mine.l[0] ? `<p class="pp-res ok">Last puzzle: ✓ +${mine.l[1]}</p>` : `<p class="pp-res no">Last puzzle: ✗</p>`;
}

// Points for a right answer if they locked in right now.
function worthNow() {
  const letters = (view?.cells || []).filter(([, , ch]) => ch === "" || /[A-Z0-9]/.test(ch));
  const hidden = letters.filter(([, , ch]) => ch === "").length;
  return letters.length ? Math.max(10, Math.round((hidden / letters.length) * (MAX_POINTS / 10)) * 10) : 0;
}

// The guess box is only rebuilt when it has to be, so the keyboard doesn't close while
// letters are turning on the board.
function renderForm(mine) {
  const el = document.getElementById("pp-form");
  let key = "none";
  if (view && !view.closed && view.pid && view.open && view.cells?.length) {
    if (mine?.g) key = "locked:" + view.pid;
    else if (pending?.pid === view.pid) key = "sending:" + view.pid;
    else key = "input:" + view.pid;
  }
  if (key.startsWith("input")) {
    if (formKey !== key) {
      el.innerHTML = `<form class="pp-form" id="pp-guess" autocomplete="off">
        <label for="pp-text">Solve the puzzle <span class="pp-worth">worth <b id="pp-worth"></b> right now</span></label>
        <input id="pp-text" maxlength="60" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="Type the whole answer">
        <button class="btn big gold" type="submit">Lock it in</button>
        <p class="small">One guess per puzzle. You'll find out if you got it when the puzzle's solved on stage.</p>
      </form>`;
      document.getElementById("pp-guess").onsubmit = (e) => {
        e.preventDefault();
        const text = document.getElementById("pp-text").value.trim();
        if (!text) return;
        document.getElementById("pp-text").blur();
        sendGuess(text.toUpperCase());
      };
    }
    document.getElementById("pp-worth").textContent = worthNow().toLocaleString("en-US");
  } else if (key !== formKey) {
    if (key.startsWith("locked") || key.startsWith("sending")) {
      const text = pending?.text || me.last?.[view.pid] || "";
      el.innerHTML = `<div class="pp-locked">${key.startsWith("sending") ? "Sending…" : "🔒 Locked in"}${
        text ? `<strong>${esc(text)}</strong>` : ""
      }<span class="small">Results when the puzzle's solved on stage.</span></div>`;
    } else el.innerHTML = "";
  }
  formKey = key;
}

function lbHtml(mine) {
  if (!view?.top?.length) return "";
  const inTop = view.top.slice(0, 5).some(([n]) => n === me.name);
  return `<div class="pp-lb"><h3>Leaderboard</h3><ol class="lb">${view.top
    .slice(0, 5)
    .map(([n, p, r]) => `<li class="${n === me.name ? "me" : ""}"><span class="lb-rank">${r}</span><span class="lb-name">${esc(n)}</span><strong>${p.toLocaleString("en-US")}</strong></li>`)
    .join("")}${
    mine && !inTop
      ? `<li class="me gap"><span class="lb-rank">${mine.r}</span><span class="lb-name">${esc(me.name)}</span><strong>${mine.p.toLocaleString("en-US")}</strong></li>`
      : ""
  }</ol></div>`;
}

function renderJoin() {
  formKey = "";
  app.innerHTML = `<main class="pp pp-join">
    <div class="pp-logo"></div>
    <h1 class="title small">Play Along</h1>
    <p class="sub">Solve each puzzle on your phone before the teams do. The earlier you lock in the right answer, the more points you get.</p>
    <form id="pp-join" autocomplete="off">
      <label>Room code<input id="pp-code" maxlength="5" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="5 letters" value="${esc(me.code)}"></label>
      <label>Your name<input id="pp-name" maxlength="20" autocorrect="off" placeholder="Name for the leaderboard" value="${esc(me.name)}"></label>
      ${joinError ? `<p class="error">${esc(joinError)}</p>` : ""}
      <button class="btn big gold" type="submit">Join</button>
    </form>
  </main>`;
  document.getElementById("pp-join").onsubmit = (e) => {
    e.preventDefault();
    const code = cleanCode(document.getElementById("pp-code").value);
    const name = document.getElementById("pp-name").value.replace(/\s+/g, " ").trim().slice(0, 20);
    if (code.length !== 5 || !brokerFor(code)) {
      joinError = "That room code doesn't look right. It's the 5 letters on the TV.";
      return renderJoin();
    }
    if (!name) {
      joinError = "Add a name for the leaderboard.";
      return renderJoin();
    }
    joinError = "";
    Object.assign(me, { code, name, joined: true });
    store();
    app.innerHTML = "";
    connect();
    render();
  };
  (me.code ? document.getElementById("pp-name") : document.getElementById("pp-code")).focus();
}

if (me.joined && me.code && me.name) connect();
render();

// For checking things from the browser console.
window.playState = () => ({ me, view, status, pending });
