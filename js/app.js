import { playSound, stopMusic, toggleMute, setMuted, isMuted, unlockAudio, checkSoundFiles } from "./sounds.js?v=__V__";
import { layout, boardHtml, isLetter, VOWELS, plainAnswer } from "./board.js?v=__V__";
import {
  buildWheel,
  wheelSvg,
  bonusWheelSvg,
  newSpin,
  spinEnd,
  wedgeAt,
  animateSpin,
  spinAngle,
  wedgeLabel,
  money,
  MYSTERY_WEDGES,
} from "./wheel.js?v=__V__";

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const TEAMS = 4;
const TEAM_COLORS = [
  { key: "red", name: "Red", hex: "#e3262e" },
  { key: "yellow", name: "Yellow", hex: "#f5c400" },
  { key: "blue", name: "Blue", hex: "#1f6fe0" },
  { key: "purple", name: "Purple", hex: "#8a3fd1" },
];
// The wheel has one arrow, at the top (degrees, 0 = top, clockwise).
const POINTER = 0;

const VOWEL_COST = 250;
const SOLVE_MINIMUM = 1000; // solving a round always banks at least this
const CONSOLATION = 1000; // a team that never solved anything goes home with this
const SPEED_BONUS = 1000; // the Final Spin adds this to every consonant
const SPEED_SECONDS = 5;
const MYSTERY_PRIZE = 10000;
const EXPRESS_VALUE = 1000;
const TOSSUP_EVERY = 1100; // ms between toss-up letters
const LIGHT_EVERY = 550; // ms between lit tiles when letters are called
const TURN_EVERY = 300; // ms between tiles turning over
const BONUS_LETTERS = ["R", "S", "T", "L", "N", "E"];
const BONUS_SECONDS = 10;
const DEFAULT_ENVELOPES = [
  40000, 40000, 40000, 40000, 40000, 40000, 45000, 45000, 45000, 45000, 45000, 45000, 50000, 50000, 50000, 50000, 50000,
  60000, 60000, 75000, 75000, 75000, 100000, 100000,
];
const STORE_KEY = "wheel.state.v1";
const UNDO_LIMIT = 80;

// Two views of one game, like the Family Feud setup. The host page has the controls and the
// answers; the board (?view=board) is the tab you cast to the TV. They talk over a
// BroadcastChannel, so both need to be open in the same browser on the same computer.
const IS_BOARD = new URLSearchParams(location.search).get("view") === "board";
const channel = "BroadcastChannel" in window ? new BroadcastChannel("wheel-of-fortune") : null;
const send = (msg) => channel?.postMessage(msg);
let boardSeenAt = 0;
const boardOpen = () => !IS_BOARD && Date.now() - boardSeenAt < 6000;
let musicNow = null;
let soundUnlocked = false;
const MUSIC = new Set(["theme", "bonusMusic"]);

function cue(name) {
  if (IS_BOARD) return;
  if (MUSIC.has(name)) musicNow = name;
  send({ type: "sound", name });
  if (!boardOpen()) playSound(name);
}

function cueStop() {
  if (IS_BOARD) return;
  musicNow = null;
  send({ type: "stopMusic" });
  stopMusic();
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state = freshState();
let gameList = [];
let undoStack = [];
let loadError = "";
let timers = []; // pending reveal steps and clocks; cleared on undo
let fx = { justShown: [], wave: false, flash: null };

function freshState() {
  return {
    screen: "loader", // loader | setup | game | results | bonus
    game: null,
    gameId: null,
    teams: Array.from({ length: TEAMS }, () => newTeam()),
    segs: [],
    segIndex: 0,
    cur: null,
    taken: { wild: false, gift: false, million: false },
    angle: 0, // where the wheel is sitting
    lastStarter: null,
    nextStarter: null,
    tripleWins: [],
    gameOver: false,
    bonus: null,
    tvWheel: false, // TV is showing the wheel instead of the board
  };
}

function newTeam(name = "", members = ["", ""]) {
  return { name, members, total: 0, round: 0, wild: false, million: "none", prizes: [], solved: 0, up: 0 };
}

function save() {
  if (IS_BOARD) return;
  try {
    if (state.game && state.screen !== "loader") localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

function savedGame() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    return s && s.game && !(s.screen === "bonus" && s.bonus?.phase === "done") ? s : null;
  } catch {
    return null;
  }
}

function clearSaved() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* storage unavailable */
  }
}

function snapshot() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

// After an undo or a reload: finish anything that was halfway through.
function settle() {
  clearTimers();
  const p = state.cur || state.bonus;
  if (p?.lit?.length) {
    for (const i of p.lit) p.shown[i] = true;
    p.lit = [];
  }
  if (state.cur?.phase === "running") state.cur.phase = "paused";
  if (state.cur?.phase === "speedClock") state.cur.phase = "speed";
  if (state.bonus?.phase === "clock") state.bonus.phase = "ready";
  state.tvWheel = false;
  if (state.cur?.spin && (state.cur.phase === "spinning" || state.cur.phase === "finalSpinning")) landNow();
  if (state.bonus?.phase === "spinning") bonusLand();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const teamName = (i) => (state.teams[i]?.name || "").trim() || `${TEAM_COLORS[i].name} Team`;
const spinner = (i) => {
  const t = state.teams[i];
  const m = (t.members || []).map((x) => (x || "").trim()).filter(Boolean);
  return m.length ? m[t.up % m.length] : "";
};
const next = (i) => (i + 1) % TEAMS;

function later(ms, fn) {
  const id = setTimeout(() => {
    timers = timers.filter((t) => t !== id);
    fn();
  }, ms);
  timers.push(id);
  return id;
}

function clearTimers() {
  for (const t of timers) {
    clearTimeout(t);
    clearInterval(t);
  }
  timers = [];
  stopSpinAnim?.();
  animatingSpin = null;
  state.tvWheel = false;
}

function flash(text, kind = "plain") {
  fx.flash = { text, kind, id: Date.now() + Math.random() };
}

// Letters in the puzzle that haven't been called yet.
function remaining(p, vowels) {
  const left = new Set();
  p.cells.forEach((c, i) => {
    if (isLetter(c.ch) && !p.shown[i] && !p.used.includes(c.ch) && VOWELS.has(c.ch) === vowels) left.add(c.ch);
  });
  return left;
}

function cellsWith(p, letter) {
  return p.cells.map((c, i) => (c.ch === letter ? i : -1)).filter((i) => i >= 0);
}

const tileState = (p) => (i) => (p.shown[i] ? "shown" : p.lit.includes(i) ? "lit" : "hidden");

// ---------------------------------------------------------------------------
// Loading a game
// ---------------------------------------------------------------------------

function checkPuzzle(text, where) {
  const { error } = layout(text);
  if (error) throw new Error(`${where}: ${error}. Shorten it, or add "/" where the lines should break.`);
}

function expand(game) {
  const segs = [];
  (game.rounds || []).forEach((r, n) => {
    const where = `Item ${n + 1} in "rounds"`;
    if (r.type === "tossup") {
      checkPuzzle(r.puzzle, where);
      segs.push({ kind: "tossup", value: Number(r.value) || 1000, category: r.category || "", puzzle: r.puzzle, decides: Boolean(r.decidesStart) });
    } else if (r.type === "triple" || r.type === "quadruple") {
      const n = r.type === "triple" ? 3 : 4;
      if (!Array.isArray(r.puzzles) || r.puzzles.length !== n)
        throw new Error(`${where}: a ${r.type === "triple" ? "Triple" : "Quadruple"} Toss-Up needs exactly ${n} puzzles`);
      r.puzzles.forEach((p, k) => {
        checkPuzzle(p, `${where}, puzzle ${k + 1}`);
        segs.push({
          kind: "tossup",
          value: Number(r.value) || 2000,
          category: r.category || "",
          puzzle: p,
          triple: { i: k, n, sweep: Number(r.sweepBonus ?? 4000) },
          decides: k === n - 1,
        });
      });
    } else if (r.type === "round") {
      checkPuzzle(r.puzzle, where);
      segs.push({
        kind: "round",
        wheel: Math.min(4, Math.max(1, Number(r.wheel) || 1)),
        top: Number(r.top) || null,
        category: r.category || "",
        puzzle: r.puzzle,
        prize: r.prize || "",
        speedUp: Boolean(r.speedUp),
        name: r.name || "",
      });
    } else {
      throw new Error(`${where}: "type" should be "tossup", "triple", "quadruple" or "round"`);
    }
  });
  if (!segs.length) throw new Error('The game file has no "rounds"');
  if (game.tiebreaker) checkPuzzle(game.tiebreaker.puzzle, "The tiebreaker");
  const b = game.bonus;
  if (b) {
    if (!Array.isArray(b.categories) || !b.categories.length) throw new Error('"bonus" needs "categories" to choose from');
    b.categories.forEach((c, k) => checkPuzzle(c.puzzle, `Bonus category ${k + 1}`));
  }
  return segs;
}

async function loadGameById(id) {
  const res = await fetch(`games/${encodeURIComponent(id)}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Couldn't find games/${id}.json`);
  startSetup(await res.json(), id);
}

function startSetup(game, id) {
  const segs = expand(game);
  const teams = state.teams.map((t) => newTeam(t.name, [...t.members]));
  state = freshState();
  Object.assign(state, { screen: "setup", game, gameId: id, segs, teams });
  undoStack = [];
  loadError = "";
  cue("theme");
  render();
}

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

function segName(seg) {
  if (!seg) return "";
  if (seg.kind === "tossup") {
    if (seg.tiebreaker) return "Tiebreaker Toss-Up";
    if (seg.triple) return `${seg.triple.n === 4 ? "Quadruple" : "Triple"} Toss-Up · ${seg.triple.i + 1} of ${seg.triple.n}`;
    return `Toss-Up · ${money(seg.value)}`;
  }
  if (seg.name) return seg.name;
  const n = state.segs.filter((s, k) => s.kind === "round" && k <= state.segs.indexOf(seg)).length;
  if (seg.wheel === 2) return `Round ${n} · Mystery Round`;
  if (seg.prize) return `Round ${n} · Prize Puzzle`;
  return `Round ${n}`;
}

function puzzleState(seg) {
  const { cells } = layout(seg.puzzle);
  const shown = cells.map((c) => !isLetter(c.ch));
  return { cells, shown, lit: [], used: [] };
}

function startSegment(i) {
  clearTimers();
  state.segIndex = i;
  const seg = state.segs[i];
  for (const t of state.teams) t.round = 0;
  state.tvWheel = false;
  if (seg.kind === "tossup") {
    const p = puzzleState(seg);
    const hidden = p.cells.map((c, k) => k).filter((k) => !p.shown[k]);
    state.cur = {
      ...p,
      seg,
      kind: "tossup",
      phase: "ready",
      order: shuffle(hidden),
      locked: [],
      buzzed: null,
      winner: null,
      only: seg.only || null,
    };
  } else {
    const p = puzzleState(seg);
    let starter = state.nextStarter;
    if (starter == null) starter = state.lastStarter == null ? 0 : next(state.lastStarter);
    state.nextStarter = null;
    state.lastStarter = starter;
    const mystery = {};
    if (seg.wheel === 2) {
      const flip = Math.random() < 0.5;
      mystery[MYSTERY_WEDGES[0]] = flip ? MYSTERY_PRIZE : "bankrupt";
      mystery[MYSTERY_WEDGES[1]] = flip ? "bankrupt" : MYSTERY_PRIZE;
    }
    state.cur = {
      ...p,
      seg,
      kind: "round",
      phase: seg.speedUp ? "finalSpin" : "turn",
      control: starter,
      value: 0,
      landed: null,
      spin: null,
      canWild: false,
      wildArmed: false,
      mystery,
      mysteryFlipped: false,
      pending: 0,
      express: false,
      speed: seg.speedUp,
      speedValue: 0,
      clockEnds: 0,
      said: { cons: false, vow: false },
      note: "",
      solvedBy: null,
    };
    if (seg.speedUp) {
      cue("timeUp");
      flash("Final Spin", "gold");
    }
  }
  render();
}

function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function nextSegment() {
  if (state.gameOver || state.segIndex + 1 >= state.segs.length) return endMainGame();
  startSegment(state.segIndex + 1);
}

function endMainGame() {
  clearTimers();
  // A tie for the lead goes to a tiebreaker toss-up, if the episode has one.
  const best = Math.max(...state.teams.map((t) => t.total));
  const tied = state.teams.map((t, i) => (t.total === best ? i : -1)).filter((i) => i >= 0);
  if (tied.length > 1 && state.game.tiebreaker && !state.tiebreakDone) {
    state.tiebreakDone = true;
    const tb = state.game.tiebreaker;
    const seg = { kind: "tossup", value: Number(tb.value) || 1000, category: tb.category || "", puzzle: tb.puzzle, tiebreaker: true, only: tied };
    state.segs.push(seg);
    state.gameOver = false;
    return startSegment(state.segs.length - 1);
  }
  state.screen = "results";
  state.cur = null;
  cue("solve");
  render();
}

// ---------------------------------------------------------------------------
// Revealing letters
// ---------------------------------------------------------------------------

// Light each tile with a ding, then turn them over one at a time, like the show.
function lightAndTurn(p, idxs, then) {
  if (!idxs.length) return then?.();
  idxs.forEach((idx, k) => {
    later(k * LIGHT_EVERY, () => {
      if (!p.lit.includes(idx)) p.lit.push(idx);
      cue("ding");
      render();
    });
  });
  const turnAt = (idxs.length - 1) * LIGHT_EVERY + 700;
  idxs.forEach((idx, k) => {
    later(turnAt + k * TURN_EVERY, () => {
      p.lit = p.lit.filter((x) => x !== idx);
      p.shown[idx] = true;
      fx.justShown.push(idx);
      render();
      if (k === idxs.length - 1) then?.();
    });
  });
}

// Everything still hidden turns over at once (a solve).
function revealAll(p) {
  clearTimers();
  p.lit = [];
  p.cells.forEach((c, i) => {
    if (!p.shown[i]) {
      p.shown[i] = true;
      fx.justShown.push(i);
    }
  });
  fx.wave = true;
}

function announceLeftovers() {
  const p = state.cur;
  if (!p || p.kind !== "round") return;
  const cons = remaining(p, false).size === 0;
  const vow = remaining(p, true).size === 0;
  if (cons && vow) return;
  if (cons && !p.said.cons) {
    p.said.cons = true;
    cue("noMore");
    flash("Only vowels remain");
  } else if (vow && !p.said.vow) {
    p.said.vow = true;
    cue("noMore");
    flash("No more vowels");
  }
}

// ---------------------------------------------------------------------------
// Toss-ups
// ---------------------------------------------------------------------------

function tossupRun() {
  const p = state.cur;
  if (p.phase !== "running") return;
  const hidden = p.order.filter((i) => !p.shown[i]);
  if (hidden.length <= 1) {
    p.phase = "last";
    render();
    return;
  }
  const i = hidden[0];
  p.shown[i] = true;
  fx.justShown.push(i);
  cue("tossTick");
  render();
  later(TOSSUP_EVERY, tossupRun);
}

function tossupStart() {
  const p = state.cur;
  if (!["ready", "paused"].includes(p.phase)) return;
  snapshot();
  p.phase = "running";
  render();
  later(p.order.some((i) => p.shown[i]) ? 400 : 900, tossupRun);
}

function tossupPause() {
  const p = state.cur;
  if (p.phase !== "running") return;
  clearTimers();
  p.phase = "paused";
  render();
}

const canRing = (p, t) =>
  ["running", "paused", "last", "ready"].includes(p.phase) && !p.locked.includes(t) && (!p.only || p.only.includes(t));

function ringIn(t) {
  const p = state.cur;
  if (!canRing(p, t)) return;
  snapshot();
  clearTimers();
  p.phase = "buzzed";
  p.buzzed = t;
  cue("ringIn");
  render();
}

function tossupRight() {
  const p = state.cur;
  if (p.phase !== "buzzed") return;
  snapshot();
  const t = p.buzzed;
  const seg = p.seg;
  p.winner = t;
  p.phase = "done";
  const team = state.teams[t];
  team.total += seg.value;
  team.solved += 1;
  let note = `${teamName(t)} +${money(seg.value)}`;
  if (seg.triple) {
    state.tripleWins[seg.triple.i] = t;
    const { n } = seg.triple;
    const wins = state.tripleWins.slice(0, n);
    if (seg.triple.i === n - 1 && wins.length === n && wins.every((w) => w === t) && seg.triple.sweep) {
      team.total += seg.triple.sweep;
      note += ` · swept all ${n === 4 ? "four" : "three"}, +${money(seg.triple.sweep)}`;
    }
  }
  if (seg.decides || seg.tiebreaker || isSecondTossup(seg)) state.nextStarter = t;
  p.note = note;
  revealAll(p);
  cue("solve");
  flash(money(seg.value), "gold");
  render();
}

// The last toss-up before the first round decides who spins first.
function isSecondTossup(seg) {
  const i = state.segs.indexOf(seg);
  return state.segs[i + 1]?.kind === "round" && !seg.triple;
}

function tossupWrong() {
  const p = state.cur;
  if (p.phase !== "buzzed") return;
  snapshot();
  p.locked.push(p.buzzed);
  p.buzzed = null;
  cue("buzzer");
  const left = [...Array(TEAMS).keys()].filter((t) => canRingAfter(p, t));
  if (!left.length) return tossupNobody(true);
  const hidden = p.order.filter((i) => !p.shown[i]);
  p.phase = hidden.length <= 1 ? "last" : "running";
  render();
  if (p.phase === "running") later(900, tossupRun);
}

const canRingAfter = (p, t) => !p.locked.includes(t) && (!p.only || p.only.includes(t));

function tossupNobody(already = false) {
  const p = state.cur;
  if (p.phase === "done") return;
  if (!already) snapshot();
  p.phase = "done";
  p.winner = null;
  p.note = "Nobody solved it";
  if (p.seg.triple) state.tripleWins[p.seg.triple.i] = null;
  revealAll(p);
  render();
}

// ---------------------------------------------------------------------------
// Rounds: the wheel
// ---------------------------------------------------------------------------

function currentWheel() {
  const p = state.cur;
  const kind = p?.kind === "round" ? p.seg.wheel : 1;
  const w = buildWheel(kind, state.taken, p?.kind === "round" ? p.seg.top : null);
  if (p?.mysteryFlipped) for (const i of MYSTERY_WEDGES) w[i] = { kind: "cash", value: 1000 };
  return w;
}

const consonantsLeft = (p) => remaining(p, false).size > 0;
const vowelsLeft = (p) => remaining(p, true).size > 0;

function giveControl(t) {
  const p = state.cur;
  p.control = t;
  p.canWild = false;
  p.wildArmed = false;
  p.value = 0;
  p.landed = null;
  state.teams[t].up += 1;
}

function passTurn() {
  const p = state.cur;
  p.express = false;
  giveControl(next(p.control));
  p.phase = p.speed ? "speed" : "turn";
}

function spin() {
  const p = state.cur;
  if (p?.kind !== "round") return;
  const final = p.phase === "finalSpin";
  if (!final && (p.phase !== "turn" || !consonantsLeft(p) || p.express)) return;
  snapshot();
  p.canWild = false;
  p.wildArmed = false;
  p.note = "";
  p.spin = newSpin(state.angle);
  p.phase = final ? "finalSpinning" : "spinning";
  state.tvWheel = true;
  render();
  startSpinAnim();
  later(p.spin.duration + 80, land);
}

function landNow() {
  land();
}

function land() {
  const p = state.cur;
  if (!p?.spin || !["spinning", "finalSpinning"].includes(p.phase)) return;
  const final = p.phase === "finalSpinning";
  const end = spinEnd(p.spin);
  state.angle = ((end % 360) + 360) % 360;
  p.spin = null;
  const wheel = currentWheel();
  const { index, frac } = wedgeAt(state.angle, POINTER);
  const w = wheel[index];
  const part = w.kind === "million" ? (frac > 1 / 3 && frac < 2 / 3 ? "million" : "bankrupt") : null;
  p.landed = { index, part, kind: part === "bankrupt" ? "bankrupt" : w.kind, value: w.value || 0, wild: Boolean(w.wild) };
  later(1700, () => {
    state.tvWheel = false;
    render();
  });

  if (final) {
    if (p.landed.kind === "bankrupt" || p.landed.kind === "loseTurn") {
      p.phase = "finalSpin";
      p.note = `${wedgeLabel(w, part)} doesn't count on the Final Spin. Spin again.`;
    } else {
      p.speedValue = (p.landed.value || 0) + SPEED_BONUS;
      p.speed = true;
      p.phase = "speed";
      flash(`${money(p.speedValue)} a consonant`, "gold");
      cue("ding");
    }
    return render();
  }

  if (p.landed.kind === "bankrupt") {
    cue("bankrupt");
    flash("Bankrupt", "black");
    p.note = `${teamName(p.control)} hit Bankrupt.`;
    bankrupt(p.control);
    passTurn();
  } else if (p.landed.kind === "loseTurn") {
    cue("loseTurn");
    flash("Lose a Turn", "white");
    p.note = `${teamName(p.control)} lose a turn.`;
    passTurn();
  } else {
    p.value = p.landed.value;
    p.phase = "call";
  }
  render();
}

function bankrupt(t) {
  const team = state.teams[t];
  team.round = 0;
  team.wild = false;
  if (team.million !== "none") team.million = "none";
  team.prizes = team.prizes.filter((x) => x.banked);
}

// ---------------------------------------------------------------------------
// Rounds: letters
// ---------------------------------------------------------------------------

function callLetter(L) {
  if (state.screen === "bonus") return bonusPick(L);
  const p = state.cur;
  if (!p || p.kind !== "round") return;
  const vowel = VOWELS.has(L);
  if (p.phase === "call") return vowel ? note("Vowels have to be bought before spinning.") : spunConsonant(L);
  if (p.phase === "turn") {
    if (vowel) return buyVowel(L);
    if (p.wildArmed) return spunConsonant(L, true);
    return note("Spin first, buy a vowel, or solve.");
  }
  if (p.phase === "express") return vowel ? buyVowel(L) : expressConsonant(L);
  if (p.phase === "speed") return speedLetter(L);
}

function note(text) {
  if (state.cur) state.cur.note = text;
  render();
}

function miss(p, L, why) {
  if (L && !p.used.includes(L)) p.used.push(L);
  cue("buzzer");
  p.note = why;
}

function spunConsonant(L, wild = false) {
  const p = state.cur;
  snapshot();
  const t = p.control;
  const team = state.teams[t];
  if (wild) {
    team.wild = false;
    p.wildArmed = false;
  }
  if (p.used.includes(L)) {
    miss(p, null, `${L} was already called.`);
    passTurn();
    return render();
  }
  const where = cellsWith(p, L);
  if (!where.length) {
    miss(p, L, `No ${L}.`);
    passTurn();
    return render();
  }
  p.used.push(L);
  const n = where.length;
  const amount = p.value * n;
  p.note = `${n} ${L}${n > 1 ? "'s" : ""} — ${money(amount)}`;
  const landed = p.landed || {};
  if (!wild && landed.kind === "mystery") {
    p.pending = amount;
    p.phase = "mysteryChoice";
  } else {
    team.round += amount;
    if (!wild && landed.wild && !state.taken.wild) {
      state.taken.wild = true;
      team.wild = true;
      cue("claim");
      flash("Wild Card!", "purple");
    }
    if (!wild && landed.kind === "gift" && !state.taken.gift) {
      state.taken.gift = true;
      team.prizes.push({ label: state.game.giftPrize || "Mystery gift", banked: false, kind: "gift" });
      cue("claim");
      flash("Prize!", "gold");
    }
    if (!wild && landed.kind === "million" && landed.part === "million" && !state.taken.million) {
      state.taken.million = true;
      team.million = "held";
      cue("claim");
      flash("Million Dollar Wedge", "green");
    }
    if (!wild && landed.kind === "express") {
      p.phase = "expressChoice";
    } else {
      p.phase = "turn";
      p.canWild = team.wild && consonantsLeft(p) ? p.value : false;
    }
  }
  render();
  lightAndTurn(p, where, () => {
    announceLeftovers();
    render();
  });
}

function buyVowel(L) {
  const p = state.cur;
  const team = state.teams[p.control];
  if (!vowelsLeft(p) && !p.used.includes(L)) return note("No vowels left.");
  if (team.round < VOWEL_COST) return note(`A vowel costs ${money(VOWEL_COST)} and they have ${money(team.round)} this round.`);
  snapshot();
  team.round -= VOWEL_COST;
  p.canWild = false;
  if (p.used.includes(L)) {
    miss(p, null, `${L} was already called.`);
    if (p.express) {
      expressCrash(p);
    } else passTurn();
    return render();
  }
  const where = cellsWith(p, L);
  if (!where.length) {
    miss(p, L, `No ${L}.`);
    if (p.express) expressCrash(p);
    else passTurn();
    return render();
  }
  p.used.push(L);
  p.note = `${where.length} ${L}${where.length > 1 ? "'s" : ""}`;
  render();
  lightAndTurn(p, where, () => {
    announceLeftovers();
    render();
  });
}

function useWild() {
  const p = state.cur;
  if (p.phase !== "turn" || !p.canWild || !state.teams[p.control].wild) return;
  snapshot();
  p.wildArmed = true;
  p.value = p.canWild;
  p.canWild = false;
  p.note = `Wild Card: call another consonant for ${money(p.value)}.`;
  render();
}

function mysteryChoice(flip) {
  const p = state.cur;
  if (p.phase !== "mysteryChoice") return;
  snapshot();
  const team = state.teams[p.control];
  if (!flip) {
    team.round += p.pending;
    p.pending = 0;
    p.phase = "turn";
    p.canWild = team.wild && consonantsLeft(p) ? p.value : false;
    return render();
  }
  const inside = p.mystery[p.landed.index];
  p.mysteryFlipped = true;
  p.pending = 0;
  cue("mystery");
  if (inside === "bankrupt") {
    later(950, () => {
      cue("bankrupt");
      flash("Bankrupt", "black");
      render();
    });
    p.note = "It was Bankrupt.";
    bankrupt(p.control);
    passTurn();
  } else {
    later(950, () => {
      cue("claim");
      flash(money(inside), "gold");
      render();
    });
    team.round += inside;
    p.note = `${money(inside)}!`;
    p.phase = "turn";
  }
  render();
}

function expressChoice(ride) {
  const p = state.cur;
  if (p.phase !== "expressChoice") return;
  snapshot();
  if (ride) {
    p.express = true;
    p.phase = "express";
    p.value = EXPRESS_VALUE;
    cue("express");
    flash("All aboard the Express", "red");
  } else {
    p.phase = "turn";
    p.canWild = state.teams[p.control].wild && consonantsLeft(p) ? p.value : false;
  }
  render();
}

function expressConsonant(L) {
  const p = state.cur;
  snapshot();
  const where = p.used.includes(L) ? [] : cellsWith(p, L);
  if (!where.length) {
    miss(p, p.used.includes(L) ? null : L, p.used.includes(L) ? `${L} was already called.` : `No ${L}.`);
    expressCrash(p);
    return render();
  }
  p.used.push(L);
  const amount = EXPRESS_VALUE * where.length;
  state.teams[p.control].round += amount;
  p.note = `${where.length} ${L}${where.length > 1 ? "'s" : ""} — ${money(amount)}`;
  render();
  lightAndTurn(p, where, () => {
    announceLeftovers();
    render();
  });
}

// A miss on the Express counts as Bankrupt.
function expressCrash(p) {
  later(700, () => {
    cue("bankrupt");
    flash("Bankrupt", "black");
    render();
  });
  bankrupt(p.control);
  passTurn();
}

function finalSpin() {
  const p = state.cur;
  if (p?.kind !== "round" || p.speed || p.phase !== "turn") return;
  snapshot();
  p.phase = "finalSpin";
  p.canWild = false;
  p.wildArmed = false;
  p.note = "";
  cue("timeUp");
  flash("Final Spin", "gold");
  render();
}

function speedLetter(L) {
  const p = state.cur;
  if (p.phase !== "speed") return;
  snapshot();
  if (p.used.includes(L) || !cellsWith(p, L).length) {
    miss(p, p.used.includes(L) ? null : L, p.used.includes(L) ? `${L} was already called.` : `No ${L}.`);
    passTurn();
    return render();
  }
  const where = cellsWith(p, L);
  p.used.push(L);
  const vowel = VOWELS.has(L);
  const amount = vowel ? 0 : p.speedValue * where.length;
  state.teams[p.control].round += amount;
  p.note = vowel ? `${where.length} ${L}${where.length > 1 ? "'s" : ""} (vowels are free)` : `${where.length} ${L}${where.length > 1 ? "'s" : ""} — ${money(amount)}`;
  p.phase = "speedReveal";
  render();
  lightAndTurn(p, where, () => {
    if (state.cur !== p || p.phase !== "speedReveal") return;
    p.phase = "speedClock";
    p.clockEnds = Date.now() + SPEED_SECONDS * 1000;
    runClock(p, SPEED_SECONDS, () => {
      if (state.cur !== p || p.phase !== "speedClock") return;
      cue("clockOut");
      p.note = "Time.";
      passTurn();
      render();
    });
    render();
  });
}

// Tick each second; then() when it runs out.
function runClock(owner, seconds, then) {
  for (let s = 1; s <= seconds; s++) {
    later(s * 1000, () => {
      if (s < seconds) cue("tick");
      else then();
      if (s < seconds) render();
    });
  }
}

// ---------------------------------------------------------------------------
// Solving
// ---------------------------------------------------------------------------

function solveRight() {
  if (state.screen === "bonus") return bonusSolved(true);
  const p = state.cur;
  if (!p) return;
  if (p.kind === "tossup") return tossupRight();
  if (!["turn", "express", "speed", "speedClock", "speedReveal", "call"].includes(p.phase)) return;
  if (p.phase === "call" && !p.speed) return note("They spun — they need to call a consonant first.");
  snapshot();
  const t = p.control;
  const team = state.teams[t];
  const amount = Math.max(team.round, SOLVE_MINIMUM);
  team.total += amount;
  team.solved += 1;
  for (const x of team.prizes) x.banked = true;
  if (team.million === "held") team.million = "banked";
  if (p.seg.prize) team.prizes.push({ label: p.seg.prize, banked: true, kind: "trip" });
  for (const other of state.teams) other.round = 0;
  p.solvedBy = t;
  p.banked = amount;
  p.note = `${teamName(t)} bank ${money(amount)}${team.round < SOLVE_MINIMUM && amount === SOLVE_MINIMUM ? " (the minimum)" : ""}${p.seg.prize ? ` and win ${p.seg.prize}` : ""}`;
  p.phase = "done";
  p.express = false;
  if (p.speed) state.gameOver = true;
  revealAll(p);
  cue("solve");
  flash("Solved!", "gold");
  render();
}

function solveWrong() {
  if (state.screen === "bonus") return;
  const p = state.cur;
  if (!p) return;
  if (p.kind === "tossup") return tossupWrong();
  if (!["turn", "express", "speed", "speedClock", "speedReveal"].includes(p.phase)) return;
  snapshot();
  clearTimers();
  for (const i of p.lit) p.shown[i] = true;
  p.lit = [];
  cue("buzzer");
  p.note = "That's not it.";
  if (p.express) expressCrash(p);
  else passTurn();
  render();
}

// Time's up on a turn, or the host just needs to move play along.
function loseTurn() {
  const p = state.cur;
  if (p?.kind !== "round" || !["turn", "call", "speed"].includes(p.phase)) return;
  snapshot();
  cue("buzzer");
  p.note = `${teamName(p.control)} lose their turn.`;
  if (p.express) expressCrash(p);
  else passTurn();
  render();
}

function setControl(t) {
  const p = state.cur;
  if (p?.kind !== "round" || !["turn", "speed", "finalSpin"].includes(p.phase) || p.control === t) return;
  snapshot();
  p.express = false;
  giveControl(t);
  p.note = `${teamName(t)} have control.`;
  render();
}

// ---------------------------------------------------------------------------
// Bonus Round
// ---------------------------------------------------------------------------

function leaderIndex() {
  let best = 0;
  state.teams.forEach((t, i) => {
    if (t.total > state.teams[best].total) best = i;
  });
  return best;
}

function envelopes() {
  const list = (state.game.bonus?.envelopes || DEFAULT_ENVELOPES).slice(0, 24);
  while (list.length < 24) list.push(list[list.length % Math.max(1, list.length)] ?? 40000);
  return list;
}

function millionSlot(list) {
  let slot = list.findIndex((v) => v === 100000);
  if (slot < 0) slot = list.reduce((b, v, i) => (typeof v === "number" && v > (list[b] || 0) ? i : b), 0);
  return slot;
}

function startBonus() {
  if (!state.game.bonus) return;
  snapshot();
  clearTimers();
  const t = leaderIndex();
  const team = state.teams[t];
  state.screen = "bonus";
  state.cur = null;
  state.bonus = {
    team: t,
    phase: "category",
    choice: null,
    cells: [],
    shown: [],
    lit: [],
    used: [],
    picks: [],
    extra: team.wild,
    million: team.million === "banked" || team.million === "held",
    spin: null,
    angle: 0,
    envelope: null,
    solved: null,
    clockEnds: 0,
  };
  cue("bonusMusic");
  render();
}

function bonusChoose(k) {
  const b = state.bonus;
  if (b.phase !== "category") return;
  const c = state.game.bonus.categories[k];
  if (!c) return;
  snapshot();
  const { cells } = layout(c.puzzle);
  Object.assign(b, { choice: k, category: c.category || "", puzzle: c.puzzle, cells, shown: cells.map((x) => !isLetter(x.ch)), phase: "spin" });
  render();
}

function bonusSpin() {
  const b = state.bonus;
  if (b.phase !== "spin") return;
  snapshot();
  b.spin = newSpin(b.angle);
  b.phase = "spinning";
  state.tvWheel = true;
  render();
  startSpinAnim();
  later(b.spin.duration + 80, bonusLand);
}

function bonusLand() {
  const b = state.bonus;
  if (b.phase !== "spinning") return;
  b.angle = ((spinEnd(b.spin) % 360) + 360) % 360;
  b.spin = null;
  b.envelope = wedgeAt(b.angle, 0, 24).index;
  b.phase = "rstlne";
  later(1800, () => {
    state.tvWheel = false;
    render();
  });
  render();
}

function bonusRstlne() {
  const b = state.bonus;
  if (b.phase !== "rstlne") return;
  snapshot();
  cueStop();
  b.used.push(...BONUS_LETTERS);
  const where = b.cells.map((c, i) => (BONUS_LETTERS.includes(c.ch) ? i : -1)).filter((i) => i >= 0);
  b.phase = "revealing";
  render();
  lightAndTurn(b, where, () => {
    b.phase = "picks";
    render();
  });
}

const picksNeeded = (b) => ({ cons: 3 + (b.extra ? 1 : 0), vow: 1 });

function bonusPick(L) {
  const b = state.bonus;
  if (b?.phase !== "picks") return;
  const need = picksNeeded(b);
  const vowel = VOWELS.has(L);
  const have = b.picks.filter((x) => VOWELS.has(x) === vowel).length;
  if (b.used.includes(L) || b.picks.includes(L)) return;
  if (have >= (vowel ? need.vow : need.cons)) return;
  b.picks.push(L);
  render();
}

function bonusUnpick() {
  const b = state.bonus;
  if (b?.phase !== "picks" || !b.picks.length) return;
  b.picks.pop();
  render();
}

const picksDone = (b) => {
  const need = picksNeeded(b);
  return b.picks.filter((x) => VOWELS.has(x)).length === need.vow && b.picks.filter((x) => !VOWELS.has(x)).length === need.cons;
};

function bonusRevealPicks() {
  const b = state.bonus;
  if (b.phase !== "picks" || !picksDone(b)) return;
  snapshot();
  b.used.push(...b.picks);
  const where = b.cells.map((c, i) => (b.picks.includes(c.ch) ? i : -1)).filter((i) => i >= 0);
  b.phase = "revealing";
  render();
  const done = () => {
    b.phase = "ready";
    render();
  };
  if (!where.length) {
    later(800, done);
  } else lightAndTurn(b, where, done);
}

function bonusClock() {
  const b = state.bonus;
  if (b.phase !== "ready") return;
  snapshot();
  b.phase = "clock";
  b.clockEnds = Date.now() + BONUS_SECONDS * 1000;
  runClock(b, BONUS_SECONDS, () => {
    if (state.bonus !== b || b.phase !== "clock") return;
    cue("clockOut");
    bonusSolved(false, true);
  });
  render();
}

function bonusSolved(solved, timeout = false) {
  const b = state.bonus;
  if (!b || !["clock", "ready"].includes(b.phase)) return;
  if (!timeout) snapshot();
  clearTimers();
  b.solved = solved;
  b.phase = "reveal";
  revealAll(b);
  if (solved) {
    cue("solve");
    flash("Solved!", "gold");
  } else if (!timeout) cue("buzzer");
  render();
}

function bonusOpen() {
  const b = state.bonus;
  if (b.phase !== "reveal") return;
  snapshot();
  b.phase = "done";
  cue("envelope");
  render();
}

function bonusPrize() {
  const b = state.bonus;
  const list = envelopes();
  let v = list[b.envelope];
  if (b.million && b.envelope === millionSlot(list)) v = 1000000;
  return typeof v === "number" ? money(v) : String(v);
}

// ---------------------------------------------------------------------------
// Actions from the page
// ---------------------------------------------------------------------------

const actions = {
  pickGame: async ({ id }) => {
    try {
      await loadGameById(id);
    } catch (e) {
      loadError = e.message;
      render();
    }
  },
  resume: () => {
    const s = savedGame();
    if (!s) return;
    state = s;
    settle();
    if (state.screen === "setup") cue("theme");
    render();
  },
  startGame: () => {
    readTeamInputs();
    clearSaved();
    cueStop();
    state.screen = "game";
    startSegment(0);
  },
  backToEpisodes: () => {
    readTeamInputs();
    state.screen = "loader";
    render();
  },
  primary: () => primary(),
  spin: () => spin(),
  tossupStart: () => tossupStart(),
  tossupPause: () => tossupPause(),
  ring: ({ t }) => ringIn(Number(t)),
  right: () => solveRight(),
  wrong: () => solveWrong(),
  nobody: () => tossupNobody(),
  letter: ({ l }) => callLetter(l),
  loseTurn: () => loseTurn(),
  useWild: () => useWild(),
  mystery: ({ flip }) => mysteryChoice(flip === "1"),
  express: ({ ride }) => expressChoice(ride === "1"),
  finalSpin: () => finalSpin(),
  control: ({ t }) => setControl(Number(t)),
  next: () => {
    snapshot();
    nextSegment();
  },
  bonus: () => startBonus(),
  bonusChoose: ({ k }) => bonusChoose(Number(k)),
  bonusSpin: () => bonusSpin(),
  bonusRstlne: () => bonusRstlne(),
  unpick: () => bonusUnpick(),
  revealPicks: () => bonusRevealPicks(),
  bonusClock: () => bonusClock(),
  bonusMiss: () => bonusSolved(false),
  bonusOpen: () => bonusOpen(),
  playAgain: () => {
    clearSaved();
    startSetup(state.game, state.gameId);
  },
  undo: () => undo(),
  toggleMute: () => {
    toggleMute();
    send({ type: "mute", muted: isMuted() });
    render();
  },
  openBoard: () => window.open(`${location.pathname}?view=board`, "wheel-board"),
  unlockSound: () => {
    unlockAudio();
    if (soundUnlocked) return;
    soundUnlocked = true;
    render();
    send({ type: "hello" });
  },
  fullscreen: () => document.documentElement.requestFullscreen?.().catch(() => {}),
};

function undo() {
  const prev = undoStack.pop();
  if (!prev) return;
  state = JSON.parse(prev);
  settle();
  render();
}

// Space: whatever the obvious next step is.
function primary() {
  if (state.screen === "results") return startBonus();
  if (state.screen === "bonus") {
    const b = state.bonus;
    if (b.phase === "spin") return bonusSpin();
    if (b.phase === "rstlne") return bonusRstlne();
    if (b.phase === "picks") return bonusRevealPicks();
    if (b.phase === "ready") return bonusClock();
    if (b.phase === "reveal") return bonusOpen();
    return;
  }
  const p = state.cur;
  if (!p) return;
  if (p.kind === "tossup") {
    if (p.phase === "ready" || p.phase === "paused") return tossupStart();
    if (p.phase === "running") return tossupPause();
    if (p.phase === "last") return tossupNobody();
    if (p.phase === "done") return actions.next();
    return;
  }
  if (p.phase === "turn" || p.phase === "finalSpin") return spin();
  if (p.phase === "done") return actions.next();
}

// ---------------------------------------------------------------------------
// The wheel on the page
// ---------------------------------------------------------------------------

// The wheel lives outside the re-rendered markup so a spin isn't interrupted by a render.
let wheelHolder = null;
let wheelKey = "";
let stopSpinAnim = null;
let animatingSpin = null;

function wheelElement() {
  const bonusMode = state.screen === "bonus";
  const key = bonusMode
    ? `bonus-${state.bonus?.million}`
    : `${state.cur?.kind === "round" ? `${state.cur.seg.wheel}-${state.cur.seg.top}` : 1}-${JSON.stringify(state.taken)}-${state.cur?.mysteryFlipped}-${state.cur?.control}`;
  if (!wheelHolder) {
    wheelHolder = document.createElement("div");
    wheelHolder.className = "wheel-holder";
  }
  if (key !== wheelKey) {
    wheelKey = key;
    if (bonusMode) {
      const list = envelopes();
      wheelHolder.innerHTML = bonusWheelSvg(24, { million: state.bonus?.million, millionSlot: millionSlot(list) });
    } else {
      const control = state.cur?.kind === "round" ? state.cur.control : -1;
      const pointers = [{ deg: POINTER, color: control >= 0 ? TEAM_COLORS[control].hex : "#e5322d", active: true }];
      wheelHolder.innerHTML = wheelSvg(currentWheel(), { pointers });
    }
  }
  const spinNow = bonusMode ? state.bonus?.spin : state.cur?.spin;
  if (!spinNow || !animatingSpin) {
    const angle = bonusMode ? state.bonus?.angle || 0 : state.angle;
    wheelHolder.querySelector(".rotor")?.setAttribute("transform", `rotate(${angle})`);
  }
  return wheelHolder;
}

function placeWheel() {
  const slot = document.getElementById("wheel-slot");
  const el = wheelElement();
  if (slot && el.parentElement !== slot) slot.appendChild(el);
  if (!slot && el.parentElement) el.remove();
  const spinNow = state.screen === "bonus" ? state.bonus?.spin : state.cur?.spin;
  if (spinNow && animatingSpin !== spinNow.startedAt) startSpinAnim();
}

function startSpinAnim() {
  const bonusMode = state.screen === "bonus";
  const s = bonusMode ? state.bonus?.spin : state.cur?.spin;
  if (!s || animatingSpin === s.startedAt) return;
  stopSpinAnim?.();
  animatingSpin = s.startedAt;
  const pointerDeg = bonusMode ? 0 : POINTER;
  const sounding = IS_BOARD ? soundUnlocked : !boardOpen();
  stopSpinAnim = animateSpin(() => wheelHolder?.querySelector(".rotor"), s, {
    pointerDeg,
    count: 24,
    onPeg: () => sounding && playSound("peg"),
    onDone: () => {
      animatingSpin = null;
    },
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

let lastView = null;

function render() {
  const app = document.getElementById("app");
  if (!IS_BOARD) {
    // Keep typed team names when the screen redraws.
    if (state.screen === "setup") readTeamInputs();
  }
  const html = IS_BOARD ? renderBoard() : renderHost();
  app.innerHTML = html + (IS_BOARD ? renderSoundPrompt() : "");
  placeWheel();
  showFlash(fx.flash);
  if (!IS_BOARD) send({ type: "state", state, fx });
  fx = { justShown: [], wave: false, flash: null };
  const view = state.screen + state.segIndex;
  if (view !== lastView) window.scrollTo(0, 0);
  lastView = view;
  save();
}

// Big announcements ("Bankrupt", "Solved!") sit in their own layer so a redraw doesn't cut them off.
let flashEl = null;
function showFlash(f) {
  if (!f) return;
  if (!flashEl) {
    flashEl = document.createElement("div");
    flashEl.className = "flash-layer";
    document.body.appendChild(flashEl);
  }
  flashEl.innerHTML = `<div class="flash ${esc(f.kind)}"><span>${esc(f.text)}</span></div>`;
}

function renderSoundPrompt() {
  if (soundUnlocked) return "";
  return `<button class="sound-prompt" data-action="unlockSound">Click anywhere to turn on sound · press F for full screen</button>`;
}

function podium(i, { host = false, showRound = true } = {}) {
  const t = state.teams[i];
  const p = state.cur;
  const active =
    (p?.kind === "round" && p.control === i && p.phase !== "done") ||
    (p?.kind === "tossup" && p.buzzed === i) ||
    (state.screen === "bonus" && state.bonus?.team === i);
  const locked = p?.kind === "tossup" && (p.locked.includes(i) || (p.only && !p.only.includes(i)));
  const winner = (p?.kind === "tossup" && p.winner === i) || (p?.kind === "round" && p.solvedBy === i);
  const icons = [
    t.wild ? `<span class="ic wild" title="Wild Card">WILD</span>` : "",
    t.million !== "none" ? `<span class="ic mil" title="Million Dollar Wedge">$1M</span>` : "",
    ...t.prizes.map((x) => `<span class="ic gift${x.banked ? "" : " risk"}" title="${esc(x.label)}">${x.kind === "trip" ? "✈" : "🎁"}</span>`),
  ].join("");
  const sp = spinner(i);
  const tag = host ? "button" : "div";
  const attrs = host ? ` data-action="control" data-t="${i}" title="Give ${esc(teamName(i))} control"` : "";
  const inRound = p?.kind === "round" && p.phase !== "done";
  return `<${tag} class="podium c-${TEAM_COLORS[i].key}${active ? " active" : ""}${locked ? " locked" : ""}${winner ? " won" : ""}"${attrs}>
    <div class="pod-name">${esc(teamName(i))}${sp && inRound ? `<small>${esc(sp)}</small>` : ""}</div>
    <div class="pod-score">${money(inRound && showRound ? t.round : t.total)}</div>
    <div class="pod-total">${inRound && showRound ? `Total ${money(t.total)}` : "&nbsp;"}</div>
    <div class="pod-icons">${icons}</div>
  </${tag}>`;
}

const podiums = (opts) => `<div class="podiums">${state.teams.map((_, i) => podium(i, opts)).join("")}</div>`;

function usedLetters(p, { host = false } = {}) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  return `<div class="used${host ? " pad" : ""}">${letters
    .map((L) => {
      const used = p.used.includes(L);
      const v = VOWELS.has(L) ? " vowel" : "";
      if (host) return `<button class="key${v}${used ? " gone" : ""}" data-action="letter" data-l="${L}" ${used ? "disabled" : ""}>${L}</button>`;
      return `<span class="${v}${used ? " gone" : ""}">${L}</span>`;
    })
    .join("")}</div>`;
}

// ---- Host ----------------------------------------------------------------

function topbar(title, extra = "") {
  return `<header class="topbar">
    <div class="brand"><span class="mini-wheel-ic"></span>${esc(title)}</div>
    <div class="top-actions">${extra}
      ${
        state.screen !== "loader"
          ? `<button class="btn ghost" data-action="openBoard" title="Open the TV board">📺 ${boardOpen() ? "Board open" : "Open board"}</button>`
          : ""
      }
      ${undoStack.length ? `<button class="btn ghost" data-action="undo" title="Undo (Ctrl+Z)">↶ Undo</button>` : ""}
      <button class="btn ghost" data-action="toggleMute">${isMuted() ? "🔇 Muted" : "🔊 Sound"}</button>
    </div>
  </header>`;
}

function renderHost() {
  const screens = { loader: hostLoader, setup: hostSetup, game: hostGame, results: hostResults, bonus: hostBonus };
  return screens[state.screen]();
}

function hostLoader() {
  const saved = savedGame();
  return `${topbar("Wheel of Fortune · Host")}
  <main class="loader">
    <div class="title-wheel" id="wheel-slot"></div>
    <h1 class="title">Wheel of Fortune</h1>
    <p class="sub">Four teams, one wheel. Pick an episode to set up the teams.</p>
    ${loadError ? `<p class="error">${esc(loadError)}</p>` : ""}
    ${saved ? `<button class="btn big gold" data-action="resume">Resume ${esc(saved.game.title || "game")}</button>` : ""}
    <div class="episodes">
      ${gameList
        .map(
          (g) => `<button class="episode" data-action="pickGame" data-id="${esc(g.id)}"><strong>${esc(g.title)}</strong><span>${esc(g.description || "")}</span></button>`
        )
        .join("")}
    </div>
    <label class="file">Load a game file… <input type="file" accept=".json,application/json" id="file-input"></label>
  </main>`;
}

function hostSetup() {
  return `${topbar(state.game.title || "Wheel of Fortune")}
  <main class="setup">
    <h2>Teams</h2>
    <p class="sub">Partners take turns at the wheel. Names are optional.</p>
    <div class="team-grid">
      ${state.teams
        .map(
          (t, i) => `<div class="team-card c-${TEAM_COLORS[i].key}">
        <div class="swatch"></div>
        <input class="tname" data-i="${i}" placeholder="${TEAM_COLORS[i].name} Team" value="${esc(t.name)}">
        <input class="tmember" data-i="${i}" data-m="0" placeholder="Player 1" value="${esc(t.members[0])}">
        <input class="tmember" data-i="${i}" data-m="1" placeholder="Player 2" value="${esc(t.members[1])}">
      </div>`
        )
        .join("")}
    </div>
    <div class="row">
      <button class="btn ghost" data-action="backToEpisodes">← Episodes</button>
      <button class="btn big gold" data-action="startGame">Start the game →</button>
    </div>
    <div class="run">
      <h3>Running order</h3>
      <ol>${state.segs.map((s) => `<li>${esc(segName(s))}${s.speedUp ? " · Final Spin" : ""} — <em>${esc(s.category)}</em></li>`).join("")}${
        state.game.bonus ? "<li>Bonus Round</li>" : ""
      }</ol>
    </div>
  </main>`;
}

function readTeamInputs() {
  document.querySelectorAll(".tname").forEach((el) => {
    state.teams[el.dataset.i].name = el.value;
  });
  document.querySelectorAll(".tmember").forEach((el) => {
    state.teams[el.dataset.i].members[el.dataset.m] = el.value;
  });
}

function hostGame() {
  const p = state.cur;
  const seg = p.seg;
  const title = segName(seg);
  return `${topbar(title, `<span class="hint-keys">Space · Enter ✓ · Esc ✗ · letters · Ctrl+Z</span>`)}
  <main class="host-game">
    <section class="host-left">
      ${boardHtml(p.cells, { tile: tileState(p), ghost: true, justShown: new Set(fx.justShown), wave: fx.wave })}
      <div class="cat">${esc(seg.category)}</div>
      <div class="answer">Answer: <strong>${esc(plainAnswer(seg.puzzle))}</strong></div>
      ${p.kind === "round" ? usedLetters(p, { host: true }) : ""}
    </section>
    <aside class="host-right">
      ${p.kind === "round" ? `<div class="mini" id="wheel-slot"></div>` : ""}
      <div class="panel">${p.kind === "tossup" ? tossupPanel(p) : roundPanel(p)}</div>
    </aside>
  </main>
  ${podiums({ host: true })}`;
}

function tossupPanel(p) {
  const seg = p.seg;
  const ringButtons = state.teams
    .map((_, t) => {
      const ok = canRing(p, t);
      return `<button class="btn ring c-${TEAM_COLORS[t].key}" data-action="ring" data-t="${t}" ${ok ? "" : "disabled"}>${t + 1} · ${esc(teamName(t))}</button>`;
    })
    .join("");
  let body = "";
  if (p.phase === "ready")
    body = `<p>${seg.triple ? `${seg.triple.n === 4 ? "Four" : "Three"} related toss-ups in a row, same category. ` : ""}${seg.only ? "Only the tied teams can ring in. " : ""}Letters fill in at random until a team rings in.</p>
    <button class="btn big gold" data-action="tossupStart">Start (Space)</button>`;
  else if (p.phase === "running") body = `<p>Filling in… press a team's number when they ring in.</p><button class="btn" data-action="tossupPause">Pause (Space)</button>`;
  else if (p.phase === "paused") body = `<p>Paused.</p><button class="btn big gold" data-action="tossupStart">Resume (Space)</button>`;
  else if (p.phase === "last")
    body = `<p>One letter left. If nobody rings in, nobody wins it.</p><button class="btn" data-action="nobody">Nobody (Space)</button>`;
  else if (p.phase === "buzzed")
    body = `<p class="who c-${TEAM_COLORS[p.buzzed].key}">${esc(teamName(p.buzzed))} rang in.</p>
    <div class="row"><button class="btn big green" data-action="right">✓ Right (Enter)</button><button class="btn big red" data-action="wrong">✗ Wrong (Esc)</button></div>`;
  else if (p.phase === "done") body = `<p class="result">${esc(p.note)}</p><button class="btn big gold" data-action="next">Next (Space)</button>`;
  return `<h3>${esc(segName(seg))}</h3>
    <div class="value">${money(seg.value)}</div>
    ${body}
    ${["ready", "running", "paused", "last"].includes(p.phase) ? `<div class="rings">${ringButtons}</div>` : ""}`;
}

function roundPanel(p) {
  const t = p.control;
  const team = state.teams[t];
  const who = `<p class="who c-${TEAM_COLORS[t].key}">${esc(teamName(t))}${spinner(t) ? ` · ${esc(spinner(t))}` : ""}</p>`;
  const cons = consonantsLeft(p);
  const vows = vowelsLeft(p);
  const noteLine = p.note ? `<p class="note">${esc(p.note)}</p>` : "";
  const solveRow = `<div class="row"><button class="btn green" data-action="right">✓ Solved (Enter)</button><button class="btn red" data-action="wrong">✗ Wrong solve</button></div>`;
  const left = `<p class="left">${cons ? "" : "Only vowels remain. "}${vows ? "" : "No more vowels."}</p>`;
  switch (p.phase) {
    case "turn":
      return `${who}${noteLine}
        <p>Spin, buy a vowel (${money(VOWEL_COST)}), or solve.</p>
        <div class="row">
          <button class="btn big gold" data-action="spin" ${cons ? "" : "disabled"}>Spin (Space)</button>
          ${p.canWild && team.wild ? `<button class="btn purple" data-action="useWild">Use Wild Card</button>` : ""}
        </div>
        <div class="row vowels">${[...VOWELS]
          .map((v) => `<button class="key vowel" data-action="letter" data-l="${v}" ${p.used.includes(v) || team.round < VOWEL_COST ? "disabled" : ""}>${v}</button>`)
          .join("")}<span class="small">buy</span></div>
        ${left}${solveRow}
        <div class="row small-row">
          <button class="btn ghost" data-action="loseTurn">Time's up / pass (Esc)</button>
          ${p.seg.wheel >= 4 && !p.speed ? `<button class="btn ghost" data-action="finalSpin">⏱ Final Spin</button>` : ""}
        </div>`;
    case "spinning":
    case "finalSpinning":
      return `${who}<p class="big-note">Spinning…</p>`;
    case "call":
      return `${who}<p class="big-note">${landedLabel(p)}</p>${noteLine}
        <p>Type the consonant they call.</p>
        <div class="row small-row"><button class="btn ghost" data-action="loseTurn">Time's up (Esc)</button></div>`;
    case "mysteryChoice":
      return `${who}${noteLine}<p>Take ${money(p.pending)}, or give it up to flip the Mystery wedge: ${money(MYSTERY_PRIZE)} or Bankrupt.</p>
        <div class="row"><button class="btn big green" data-action="mystery" data-flip="0">Keep ${money(p.pending)}</button><button class="btn big purple" data-action="mystery" data-flip="1">Flip it</button></div>`;
    case "expressChoice":
      return `${who}${noteLine}<p>Ride the Express? Consonants are ${money(EXPRESS_VALUE)} each, vowels ${money(VOWEL_COST)}, no spinning — but any miss or wrong solve is Bankrupt.</p>
        <div class="row"><button class="btn big red" data-action="express" data-ride="1">🚂 Ride it</button><button class="btn big" data-action="express" data-ride="0">Pass, keep playing</button></div>`;
    case "express":
      return `${who}<p class="big-note">🚂 Express</p>${noteLine}<p>Type letters as they call them. A miss is Bankrupt.</p>${left}${solveRow}`;
    case "finalSpin":
      return `${who}<p class="big-note">Final Spin</p>${noteLine}<p>Whatever it lands on, plus ${money(SPEED_BONUS)}, is what every consonant is worth from here on. Vowels are free. After each right letter, they get ${SPEED_SECONDS} seconds to solve.</p>
        <button class="btn big gold" data-action="spin">Spin (Space)</button>`;
    case "speed":
      return `${who}<p class="big-note">${money(p.speedValue)} a consonant</p>${noteLine}<p>Type the letter they call. Vowels are free.</p>${left}${solveRow}`;
    case "speedReveal":
      return `${who}<p class="big-note">${money(p.speedValue)} a consonant</p>${noteLine}${solveRow}`;
    case "speedClock":
      return `${who}<p class="big-note clock" data-ends="${p.clockEnds}">${clockLeft(p.clockEnds)}</p>${noteLine}${solveRow}`;
    case "done":
      return `<p class="result">${esc(p.note)}</p><button class="btn big gold" data-action="next">${
        state.gameOver || state.segIndex + 1 >= state.segs.length ? "Final scores" : "Next round"
      } (Space)</button>`;
  }
  return "";
}

function landedLabel(p) {
  const l = p.landed;
  if (!l) return "";
  if (l.kind === "mystery") return `Mystery · ${money(l.value)}`;
  if (l.kind === "express") return `Express · ${money(l.value)}`;
  if (l.kind === "gift") return `Prize · ${money(l.value)}`;
  if (l.kind === "million") return `One Million · ${money(l.value)}`;
  if (p.wildArmed) return `Wild Card · ${money(p.value)}`;
  return `${money(l.value)}${l.wild ? " + Wild Card" : ""}`;
}

const clockLeft = (ends) => Math.max(0, Math.ceil((ends - Date.now()) / 1000));

function standings() {
  return state.teams
    .map((t, i) => ({ i, total: t.total, final: t.total > 0 ? t.total : CONSOLATION, consolation: t.total === 0 }))
    .sort((a, b) => b.total - a.total);
}

function hostResults() {
  const lead = leaderIndex();
  return `${topbar("Final scores")}
  <main class="results">
    <h2><span class="c-text-${TEAM_COLORS[lead].key}">${esc(teamName(lead))}</span> go to the Bonus Round</h2>
    <ol class="stand">${standings()
      .map(
        (s) => `<li class="c-${TEAM_COLORS[s.i].key}"><span>${esc(teamName(s.i))}</span><strong>${money(s.final)}</strong>${
          s.consolation ? "<em>house minimum</em>" : ""
        }</li>`
      )
      .join("")}</ol>
    ${state.game.bonus ? `<button class="btn big gold" data-action="bonus">Bonus Round (Space)</button>` : `<button class="btn" data-action="playAgain">Play again</button>`}
  </main>`;
}

function hostBonus() {
  const b = state.bonus;
  const t = b.team;
  const cats = state.game.bonus.categories;
  let panel = "";
  const need = picksNeeded(b);
  switch (b.phase) {
    case "category":
      panel = `<p>${esc(teamName(t))} pick a category.</p>${cats
        .map((c, k) => `<button class="btn big" data-action="bonusChoose" data-k="${k}">${esc(c.category)}</button>`)
        .join("")}`;
      break;
    case "spin":
    case "spinning":
      panel = `<p>${b.million ? "They kept the Million Dollar Wedge, so one envelope holds $1,000,000. " : ""}They spin the bonus wheel for an envelope. It stays sealed until the end.</p>
        <button class="btn big gold" data-action="bonusSpin" ${b.phase === "spin" ? "" : "disabled"}>${b.phase === "spin" ? "Spin (Space)" : "Spinning…"}</button>`;
      break;
    case "rstlne":
      panel = `<p>Envelope picked. Now R, S, T, L, N and E.</p><button class="btn big gold" data-action="bonusRstlne">Show R S T L N E (Space)</button>`;
      break;
    case "revealing":
      panel = `<p class="big-note">…</p>`;
      break;
    case "picks":
      panel = `<p>Type ${need.cons} consonants and ${need.vow} vowel${b.extra ? " (the Wild Card gives them a 4th consonant)" : ""}.</p>
        <div class="picks">${b.picks.map((x) => `<span>${x}</span>`).join("") || "<em>none yet</em>"}</div>
        ${usedLetters(b, { host: true })}
        <div class="row"><button class="btn" data-action="unpick" ${b.picks.length ? "" : "disabled"}>⌫ Undo letter</button>
        <button class="btn big gold" data-action="revealPicks" ${picksDone(b) ? "" : "disabled"}>Show letters (Space)</button></div>`;
      break;
    case "ready":
      panel = `<p>${BONUS_SECONDS} seconds to solve. They can guess as many times as they like.</p><button class="btn big gold" data-action="bonusClock">Start the clock (Space)</button>`;
      break;
    case "clock":
      panel = `<p class="big-note clock" data-ends="${b.clockEnds}">${clockLeft(b.clockEnds)}</p>
        <div class="row"><button class="btn big green" data-action="right">✓ Solved (Enter)</button><button class="btn red" data-action="bonusMiss">✗ Give up</button></div>`;
      break;
    case "reveal":
      panel = `<p class="result">${b.solved ? "Solved!" : "Not this time."}</p><button class="btn big gold" data-action="bonusOpen">Open the envelope (Space)</button>`;
      break;
    case "done":
      panel = `<p class="result">${b.solved ? `${esc(teamName(t))} win ${esc(bonusPrize())}!` : `It was ${esc(bonusPrize())}.`}</p><button class="btn" data-action="playAgain">Play again</button>`;
      break;
  }
  const showBoard = b.cells.length && !["category", "spin", "spinning"].includes(b.phase);
  return `${topbar("Bonus Round")}
  <main class="host-game">
    <section class="host-left">
      ${
        showBoard
          ? `${boardHtml(b.cells, { tile: tileState(b), ghost: true, justShown: new Set(fx.justShown), wave: fx.wave })}
      <div class="cat">${esc(b.category)}</div><div class="answer">Answer: <strong>${esc(plainAnswer(b.puzzle))}</strong></div>`
          : `<div class="bonus-cats">${cats
              .map((c, k) => `<div class="bc${b.choice === k ? " on" : ""}"><strong>${esc(c.category)}</strong><span>${esc(plainAnswer(c.puzzle))}</span></div>`)
              .join("")}</div>`
      }
      ${b.envelope != null ? `<p class="small">Envelope ${b.envelope + 1}: <strong>${esc(bonusPrize())}</strong> (only you can see this)</p>` : ""}
    </section>
    <aside class="host-right">
      <div class="mini" id="wheel-slot"></div>
      <div class="panel"><p class="who c-${TEAM_COLORS[t].key}">${esc(teamName(t))}</p>${panel}</div>
    </aside>
  </main>`;
}

// ---- TV board ------------------------------------------------------------

function renderBoard() {
  if (state.screen === "loader" || state.screen === "setup") return tvTitle();
  if (state.screen === "results") return tvResults();
  if (state.screen === "bonus") return tvBonus();
  return tvGame();
}

function tvTitle() {
  return `<main class="tv tv-title">
    <div class="title-wheel big" id="wheel-slot"></div>
    <h1 class="title">Wheel of Fortune</h1>
    ${state.game ? `<p class="sub">${esc(state.game.title || "")}</p>` : ""}
    ${state.screen === "setup" ? podiums({ showRound: false }) : ""}
  </main>`;
}

function tvHead() {
  const p = state.cur;
  const seg = p.seg;
  let right = "";
  if (p.kind === "tossup") right = `<span class="chip gold">${money(seg.value)}</span>`;
  else if (p.speed && p.speedValue) right = `<span class="chip gold">${money(p.speedValue)} a consonant</span>`;
  else if (p.express) right = `<span class="chip red">🚂 Express</span>`;
  else if (p.phase === "call" || p.wildArmed) right = `<span class="chip c-${TEAM_COLORS[p.control].key}">${esc(landedLabel(p))}</span>`;
  else if (p.phase === "speedClock") right = `<span class="chip gold clock" data-ends="${p.clockEnds}">${clockLeft(p.clockEnds)}</span>`;
  const prize = seg.prize && p.kind === "round" ? `<span class="chip prize">Prize Puzzle</span>` : "";
  return `<div class="tv-head"><span class="seg">${esc(segName(seg))}${p.speed && !seg.speedUp ? " · Final Spin" : ""}</span>${prize}<span class="grow"></span>${right}</div>`;
}

function tvGame() {
  const p = state.cur;
  const solvedLine =
    p.phase === "done" && p.kind === "round" && p.solvedBy != null
      ? `<div class="tv-banner c-${TEAM_COLORS[p.solvedBy].key}">${esc(teamName(p.solvedBy))} · ${money(p.banked)}${p.seg.prize ? ` · ${esc(p.seg.prize)}` : ""}</div>`
      : p.phase === "done" && p.kind === "tossup" && p.winner != null
        ? `<div class="tv-banner c-${TEAM_COLORS[p.winner].key}">${esc(teamName(p.winner))} · ${money(p.seg.value)}</div>`
        : "";
  return `<main class="tv tv-game">
    ${tvHead()}
    <div class="tv-board">${boardHtml(p.cells, { tile: tileState(p), justShown: new Set(fx.justShown), wave: fx.wave })}</div>
    <div class="tv-cat">${esc(p.seg.category)}</div>
    ${p.kind === "round" ? usedLetters(p) : `<div class="used spacer"></div>`}
    ${solvedLine}
    ${podiums()}
    <div class="tv-wheel${state.tvWheel ? " on" : ""}">
      <div class="tv-wheel-label">${p.kind === "round" ? `<span class="c-text-${TEAM_COLORS[p.control].key}">${esc(teamName(p.control))}</span>${spinner(p.control) ? ` · ${esc(spinner(p.control))}` : ""}` : ""}</div>
      <div class="cam flat main"><div id="wheel-slot" class="cam-wheel"></div></div>
      ${p.landed && !p.spin ? `<div class="tv-landed">${esc(landedLabel(p) || "")}</div>` : ""}
    </div>
  </main>`;
}

function tvResults() {
  const lead = leaderIndex();
  return `<main class="tv tv-results">
    <h1 class="title small">Final Scores</h1>
    <ol class="stand big">${standings()
      .map((s) => `<li class="c-${TEAM_COLORS[s.i].key}${s.i === lead ? " lead" : ""}"><span>${esc(teamName(s.i))}</span><strong>${money(s.final)}</strong></li>`)
      .join("")}</ol>
    <p class="sub">${esc(teamName(lead))} play the Bonus Round</p>
  </main>`;
}

function tvBonus() {
  const b = state.bonus;
  const t = b.team;
  const cats = state.game.bonus.categories;
  const board = b.cells.length && !["category", "spin", "spinning"].includes(b.phase);
  const right =
    b.phase === "clock"
      ? `<span class="chip gold clock" data-ends="${b.clockEnds}">${clockLeft(b.clockEnds)}</span>`
      : b.picks.length || b.phase === "picks"
        ? `<span class="chip picks">${["R", "S", "T", "L", "N", "E"].join(" ")}${b.picks.length ? " + " + b.picks.join(" ") : ""}</span>`
        : "";
  return `<main class="tv tv-game tv-bonus">
    <div class="tv-head"><span class="seg">Bonus Round · <span class="c-text-${TEAM_COLORS[t].key}">${esc(teamName(t))}</span></span><span class="grow"></span>${right}</div>
    ${
      board
        ? `<div class="tv-board">${boardHtml(b.cells, { tile: tileState(b), justShown: new Set(fx.justShown), wave: fx.wave })}</div><div class="tv-cat">${esc(b.category)}</div>`
        : `<div class="tv-cats">${cats.map((c, k) => `<div class="bc${b.choice === k ? " on" : ""}">${esc(c.category)}</div>`).join("")}</div>`
    }
    ${b.phase === "done" ? `<div class="envelope open"><div class="env-card"><small>${b.solved ? "You win" : "You would have won"}</small><strong>${esc(bonusPrize())}</strong></div></div>` : ""}
    ${b.phase === "reveal" ? `<div class="envelope"><div class="env-card sealed">?</div></div>` : ""}
    <div class="tv-wheel${state.tvWheel ? " on" : ""} bonus-cam">
      <div class="tv-wheel-label">Spin for an envelope</div>
      <div class="cam flat"><div id="wheel-slot" class="cam-wheel"></div></div>
    </div>
  </main>`;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

document.addEventListener("click", (e) => {
  if (IS_BOARD) {
    actions.unlockSound();
    return;
  }
  unlockAudio();
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) fn({ ...el.dataset });
});

document.addEventListener("change", async (e) => {
  if (e.target.id !== "file-input") return;
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    startSetup(JSON.parse(await f.text()), null);
  } catch (err) {
    loadError = `That file didn't load: ${err.message}`;
    render();
  }
});

document.addEventListener("keydown", (e) => {
  if (IS_BOARD) {
    if (e.key === "f" || e.key === "F") actions.fullscreen();
    return;
  }
  const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
  if (typing) return;
  if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
    e.preventDefault();
    return undo();
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  unlockAudio();
  if (e.key === " ") {
    e.preventDefault();
    return primary();
  }
  if (e.key === "Enter") {
    e.preventDefault();
    return solveRight();
  }
  if (e.key === "Escape") {
    if (state.cur?.kind === "tossup") return solveWrong();
    if (state.cur?.phase === "call" || state.cur?.phase === "speed") return loseTurn();
    if (state.cur?.phase === "turn" && !state.cur.wildArmed) return loseTurn();
    return solveWrong();
  }
  if (e.key === "Backspace") {
    e.preventDefault();
    return bonusUnpick();
  }
  if (/^[1-4]$/.test(e.key) && state.cur?.kind === "tossup") return ringIn(Number(e.key) - 1);
  if (/^[a-zA-Z]$/.test(e.key) && (state.screen === "game" || state.screen === "bonus")) return callLetter(e.key.toUpperCase());
});

// Clocks on screen count down on their own.
setInterval(() => {
  document.querySelectorAll(".clock[data-ends]").forEach((el) => {
    el.textContent = clockLeft(Number(el.dataset.ends));
  });
}, 200);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function listen() {
  if (!channel) return;
  channel.onmessage = ({ data: m }) => {
    if (IS_BOARD) {
      if (m.type === "state") {
        state = m.state;
        fx = m.fx || fx;
        render();
      } else if (m.type === "sound") {
        if (soundUnlocked) playSound(m.name);
      } else if (m.type === "stopMusic") stopMusic();
      else if (m.type === "mute") setMuted(m.muted);
      return;
    }
    if (m.type === "hello" || m.type === "ping") {
      const was = boardOpen();
      boardSeenAt = Date.now();
      if (m.type === "hello" || !was) {
        stopMusic();
        send({ type: "mute", muted: isMuted() });
        if (musicNow) send({ type: "sound", name: musicNow });
        render();
      }
    }
  };
}

async function init() {
  checkSoundFiles();
  listen();
  if (IS_BOARD) {
    document.title = "Wheel of Fortune";
    document.body.classList.add("is-board");
    render();
    send({ type: "hello" });
    setInterval(() => send({ type: "ping" }), 2000);
    return;
  }
  document.title = "Wheel of Fortune · Host";
  let was = false;
  setInterval(() => {
    if (boardOpen() !== was) {
      was = boardOpen();
      if (!["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) render();
    }
  }, 2000);
  try {
    const res = await fetch("games/index.json", { cache: "no-cache" });
    gameList = res.ok ? await res.json() : [];
  } catch {
    gameList = [];
  }
  const id = new URLSearchParams(location.search).get("game");
  if (id && !savedGame()) {
    try {
      await loadGameById(id);
      return;
    } catch (e) {
      loadError = e.message;
    }
  }
  render();
}

// For poking at a game from the browser console.
window.wheelState = () => state;

init();
