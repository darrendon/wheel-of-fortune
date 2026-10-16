// Audience play-along, host side.
//
// The host tab is the referee. Phones get the board with the hidden letters left out (the
// answer never leaves this computer until the puzzle is solved on stage), send in one guess
// per puzzle, and this file scores it on the spot: the more of the puzzle still hidden when
// the guess arrives, the more it's worth. Results stay secret until the puzzle is solved,
// so nobody in the audience can give it away to the teams.

import { Relay, connectAny, brokerFor, makeCode, normalize, TOPIC_ROOT } from "./relay.js?v=__V__";

const STORE_KEY = "wheel.audience.v1";
export const MAX_POINTS = 1000;
const LB_DELAY = 3000; // ms after a puzzle is solved before the TV shows the leaderboard
const ACTIVE_MS = 70000; // a phone counts as here if it checked in this recently

export const aud = {
  on: false,
  status: "off", // off | connecting | live | down | error
  error: "",
  code: null,
  players: {}, // id -> { name, seen }
  guesses: {}, // pid -> { id -> { text, ok, pts } }
  revealed: [], // pids whose results have been shown
  lbManual: null, // the host's L toggle for the current puzzle (null = automatic)
  lbAt: 0,
};

let relay = null;
let topic = "";
let puzzle = null; // what the host app last told us is on the board
let onChange = () => {};
let lastSent = "";
let sendTimer = null;

export function setOnChange(fn) {
  onChange = fn;
}

function save() {
  try {
    const { on, code, players, guesses, revealed } = aud;
    localStorage.setItem(STORE_KEY, JSON.stringify({ on, code, players, guesses, revealed }));
  } catch {
    /* storage unavailable */
  }
}

export function loadAudience() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (s) Object.assign(aud, { on: s.on, code: s.code, players: s.players || {}, guesses: s.guesses || {}, revealed: s.revealed || [] });
  } catch {
    /* fresh start */
  }
  return aud.on;
}

export function joinUrl() {
  const base = location.href.split(/[?#]/)[0].replace(/index\.html$/, "").replace(/\/?$/, "/");
  const extra = new URLSearchParams(location.search).get("broker");
  return `${base}play/?code=${aud.code}${extra ? `&broker=${encodeURIComponent(extra)}` : ""}`;
}

export function shortUrl() {
  return joinUrl()
    .replace(/^https?:\/\//, "")
    .replace(/\?.*$/, "")
    .replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export async function startAudience() {
  if (relay) return;
  aud.on = true;
  aud.status = "connecting";
  aud.error = "";
  save();
  onChange();
  const handlers = {
    onMessage: (t, m) => handle(m),
    onStatus: (s) => {
      if (!aud.on) return;
      aud.status = s === "live" ? "live" : s === "down" ? "down" : "connecting";
      if (s === "live") lastSent = ""; // make sure phones get the latest after a reconnect
      onChange();
      if (s === "live") publishSoon();
    },
  };
  try {
    const existing = aud.code && brokerFor(aud.code);
    if (existing) {
      relay = new Relay(existing.url, handlers);
      await relay.connect(10000).catch(async () => {
        // That relay is down; open a new room somewhere else.
        relay = null;
        const r = await connectAny(handlers);
        relay = r.relay;
        aud.code = makeCode(r.broker.key);
      });
    } else {
      const r = await connectAny(handlers);
      relay = r.relay;
      aud.code = makeCode(r.broker.key);
    }
    topic = TOPIC_ROOT + aud.code;
    relay.subscribe(topic + "/h");
    aud.status = "live";
    save();
    lastSent = "";
    publishSoon();
  } catch (e) {
    relay = null;
    aud.status = "error";
    aud.error = "Couldn't reach any of the free relays. Check the internet connection and try again.";
  }
  onChange();
}

export function stopAudience() {
  aud.on = false;
  aud.status = "off";
  if (relay) {
    // Tell phones the room is closed.
    relay.publish(topic + "/s", { v: 1, closed: true }, true);
    const r = relay;
    setTimeout(() => r.close(), 400);
  }
  relay = null;
  save();
  onChange();
}

// A brand new room code (phones have to join again). Scores are kept.
export function newRoom() {
  const wasOn = aud.on;
  stopAudience();
  aud.code = null;
  save();
  if (wasOn) startAudience();
}

export function resetScores() {
  aud.guesses = {};
  aud.revealed = [];
  save();
  lastSent = "";
  publishSoon();
  onChange();
}

// ---------------------------------------------------------------------------
// Messages from phones
// ---------------------------------------------------------------------------

function handle(m) {
  if (!m || typeof m.id !== "string" || m.id.length > 40) return;
  const now = Date.now();
  if (m.t === "join") {
    const name = String(m.name || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20);
    if (!name) return;
    const known = aud.players[m.id];
    aud.players[m.id] = { name, seen: now };
    if (!known || known.name !== name) {
      save();
      onChange();
    }
    publishSoon();
  } else if (m.t === "guess") {
    const p = aud.players[m.id];
    if (!p) return;
    p.seen = now;
    if (!puzzle || !puzzle.open || m.pid !== puzzle.pid) return publishSoon();
    const book = (aud.guesses[puzzle.pid] ||= {});
    if (book[m.id]) return publishSoon(); // one guess each
    const text = String(m.text || "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    if (!text) return;
    const ok = normalize(text) === normalize(puzzle.answer);
    const pts = ok ? Math.max(10, Math.round((puzzle.hiddenShare * MAX_POINTS) / 10) * 10) : 0;
    book[m.id] = { text, ok, pts };
    save();
    onChange();
    publishSoon();
  }
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

export function scores() {
  const total = {};
  for (const id of Object.keys(aud.players)) total[id] = 0;
  for (const pid of aud.revealed) {
    for (const [id, g] of Object.entries(aud.guesses[pid] || {})) if (g.ok) total[id] = (total[id] || 0) + g.pts;
  }
  return total;
}

// Players sorted by score, with shared ranks for ties.
export function standings() {
  const total = scores();
  const rows = Object.entries(aud.players)
    .map(([id, p]) => ({ id, name: p.name, pts: total[id] || 0 }))
    .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
  let rank = 0;
  let prev = null;
  rows.forEach((r, i) => {
    if (r.pts !== prev) rank = i + 1;
    prev = r.pts;
    r.rank = rank;
  });
  return rows;
}

export const activeCount = () => Object.values(aud.players).filter((p) => Date.now() - p.seen < ACTIVE_MS).length;

// How the current puzzle went: who's locked in, who got it, the fastest.
export function puzzleStats(pid = puzzle?.pid) {
  const book = aud.guesses[pid] || {};
  const list = Object.entries(book);
  const right = list.filter(([, g]) => g.ok).sort((a, b) => b[1].pts - a[1].pts);
  const best = right[0];
  return {
    locked: list.length,
    right: right.length,
    fastest: best ? { name: aud.players[best[0]]?.name || "?", pts: best[1].pts } : null,
  };
}

// Should the TV be showing the leaderboard right now?
export function leaderboardVisible() {
  if (!aud.on || !Object.keys(aud.players).length) return false;
  if (aud.lbManual != null) return aud.lbManual;
  return Boolean(puzzle?.done && puzzle.autoBoard && aud.lbAt && Date.now() >= aud.lbAt);
}

export function toggleLeaderboard() {
  aud.lbManual = !leaderboardVisible();
  onChange();
}

// ---------------------------------------------------------------------------
// Keeping up with the game
// ---------------------------------------------------------------------------

// Called on every redraw with what's on the board:
// { pid, open, done, seg, cat, cells, shown, lit, used, answer, autoBoard }
export function syncPuzzle(p) {
  const prevPid = puzzle?.pid;
  puzzle = p;
  if (p?.pid !== prevPid) {
    aud.lbManual = null;
    aud.lbAt = 0;
  }
  if (p) {
    const letters = p.cells.map((c, i) => [c, i]).filter(([c]) => /[A-Z0-9]/.test(c.ch));
    const hidden = letters.filter(([, i]) => !p.shown[i] || p.lit.includes(i)).length;
    p.hiddenShare = letters.length ? hidden / letters.length : 0;
    const isRevealed = aud.revealed.includes(p.pid);
    if (p.done && !isRevealed) {
      aud.revealed.push(p.pid);
      aud.lbAt = Date.now() + LB_DELAY;
      setTimeout(() => onChange(), LB_DELAY + 50);
      save();
    } else if (!p.done && isRevealed) {
      // The host undid the solve.
      aud.revealed = aud.revealed.filter((x) => x !== p.pid);
      aud.lbAt = 0;
      save();
    }
  }
  publishSoon();
}

function publishSoon() {
  if (!relay || !aud.on) return;
  if (sendTimer) return;
  sendTimer = setTimeout(() => {
    sendTimer = null;
    publishNow();
  }, 120);
}

function publishNow() {
  if (!relay || !aud.on) return;
  const p = puzzle;
  const rows = standings();
  const revealed = p ? aud.revealed.includes(p.pid) : false;
  const book = p ? aud.guesses[p.pid] || {} : {};
  const lastPid = [...aud.revealed].reverse().find((x) => x !== p?.pid || revealed);
  const lastBook = aud.guesses[lastPid] || {};
  const players = {};
  for (const r of rows) {
    const mine = book[r.id];
    const last = lastBook[r.id];
    players[r.id] = {
      n: r.name,
      p: r.pts,
      r: r.rank,
      g: mine ? (revealed ? [mine.ok ? 1 : 0, mine.pts, mine.text] : 1) : 0,
      l: last ? [last.ok ? 1 : 0, last.pts] : null,
    };
  }
  const msg = {
    v: 1,
    room: aud.code,
    count: rows.length,
    top: rows.slice(0, 10).map((r) => [r.name, r.pts, r.rank]),
    players,
    pid: p?.pid || null,
    open: Boolean(p?.open),
    revealed,
    seg: p?.seg || "",
    cat: p?.cat || "",
    title: p?.title || "",
    // Hidden letters are left out entirely.
    cells: p ? p.cells.map((c, i) => [c.r, c.c, p.shown[i] && !p.lit.includes(i) ? c.ch : /[A-Z0-9]/.test(c.ch) ? "" : c.ch]) : [],
    used: p?.used || [],
    answer: p && revealed ? p.answerText : null,
    stats: p && revealed ? puzzleStats(p.pid) : null,
  };
  const json = JSON.stringify(msg);
  if (json === lastSent) return;
  lastSent = json;
  relay.publish(topic + "/s", msg, true);
}

// A summary for the TV board tab.
export function tvSummary() {
  if (!aud.on) return null;
  const rows = standings();
  return {
    status: aud.status,
    code: aud.code,
    url: aud.code ? shortUrl() : "",
    joinUrl: aud.code ? joinUrl() : "",
    count: rows.length,
    top: rows.slice(0, 10).map((r) => ({ name: r.name, pts: r.pts, rank: r.rank })),
    // How the puzzle went, only once it's solved on stage.
    stats: puzzle && aud.revealed.includes(puzzle.pid) ? puzzleStats(puzzle.pid) : null,
    board: leaderboardVisible(),
  };
}
