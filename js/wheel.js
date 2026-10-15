// The wheel: what's on it each round, how it's drawn, and how it spins.
//
// 24 wedges, numbered clockwise from the top. Cash values follow the current show's set
// ($500-$900 plus the top-dollar wedge: $2,500 in Round 1, $3,500 in Rounds 2-3, $5,000 after),
// with two Bankrupts and one Lose a Turn. The show doesn't publish its exact wedge order,
// so the order here is our own; edit these lists to change it.

export const WEDGES = 24;
export const WEDGE_DEG = 360 / WEDGES;

// Cash wedges are numbers. Everything else is a word.
const BASE = [
  "TOP", 600, 700, 600, 650, 500, 700, "BANKRUPT", 600, 550, 500, 600,
  "MILLION", 650, "GIFT", 700, "LOSE A TURN", 800, 500, 650, 500, 900, "BANKRUPT", 850,
];

// Specials that sit on the wheel in Rounds 1-3 until someone picks them up.
export const WILD_WEDGE = 5; // the Wild Card sits on this $500 wedge
export const MILLION_WEDGE = 12; // Bankrupt | One Million | Bankrupt, on a $500 wedge
export const GIFT_WEDGE = 14; // the prize wedge: $500 a letter plus the prize
const MILLION_BASE = 500;
const GIFT_VALUE = 500;
const WILD_BASE = 500;

// Round 2's two Mystery wedges and Round 3's Express wedge replace these cash wedges.
export const MYSTERY_WEDGES = [4, 19];
export const EXPRESS_WEDGE = 9;

const TOP_VALUE = { 1: 2500, 2: 3500, 3: 3500, 4: 5000 };

// Build the wheel for a round. kind: 1 | 2 (Mystery) | 3 (Express) | 4 (Round 4 and later).
// taken: which specials have already been picked up ({ wild, gift, million }).
export function buildWheel(kind, taken = {}) {
  const k = Math.min(Math.max(Number(kind) || 1, 1), 4);
  const early = k <= 3;
  return BASE.map((v, i) => {
    if (v === "TOP") return { kind: "cash", value: TOP_VALUE[k], top: true };
    if (v === "BANKRUPT") return { kind: "bankrupt" };
    if (v === "LOSE A TURN") return { kind: "loseTurn" };
    if (v === "MILLION") {
      return early && !taken.million ? { kind: "million", value: MILLION_BASE } : { kind: "cash", value: 900 };
    }
    if (v === "GIFT") return early && !taken.gift ? { kind: "gift", value: GIFT_VALUE } : { kind: "cash", value: 550 };
    if (k === 2 && MYSTERY_WEDGES.includes(i)) return { kind: "mystery", value: 1000 };
    if (k === 3 && i === EXPRESS_WEDGE) return { kind: "express", value: 1000 };
    const w = { kind: "cash", value: v };
    if (i === WILD_WEDGE && early && !taken.wild) Object.assign(w, { wild: true, value: WILD_BASE });
    return w;
  });
}

// What a wedge does for the round, as a short label.
export function wedgeLabel(w, part) {
  if (!w) return "";
  if (w.kind === "million" && part !== "million") return "BANKRUPT";
  switch (w.kind) {
    case "bankrupt":
      return "BANKRUPT";
    case "loseTurn":
      return "LOSE A TURN";
    case "mystery":
      return "MYSTERY";
    case "express":
      return "EXPRESS";
    case "million":
      return "ONE MILLION";
    case "gift":
      return "PRIZE";
    default:
      return money(w.value);
  }
}

export const money = (n) => "$" + Math.round(n).toLocaleString("en-US");

// Colors for cash wedges, in order around the wheel.
const PALETTE = ["#e5322d", "#f68b1f", "#ffd22e", "#3ab54a", "#1c8fe0", "#7c3fa8", "#ef4f9c", "#00a99d"];

function wedgeFill(w, i) {
  if (w.kind === "bankrupt") return "#111";
  if (w.kind === "loseTurn") return "#f4f4f4";
  if (w.kind === "mystery") return "#4b2a8f";
  if (w.kind === "express") return "url(#g-express)";
  if (w.kind === "million") return "#111";
  if (w.kind === "gift") return "#e9f7ff";
  if (w.top) return "url(#g-top)";
  return PALETTE[i % PALETTE.length];
}

function wedgeInk(w, i) {
  if (w.kind === "bankrupt" || w.kind === "mystery" || w.kind === "express" || w.kind === "million") return "#fff";
  if (w.kind === "loseTurn" || w.kind === "gift") return "#111";
  const fill = PALETTE[i % PALETTE.length];
  return fill === "#ffd22e" ? "#111" : w.top ? "#111" : "#fff";
}

const polar = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)];
};

function slice(a0, a1, r0, r1) {
  const [x0, y0] = polar(a0, r1);
  const [x1, y1] = polar(a1, r1);
  const [x2, y2] = polar(a1, r0);
  const [x3, y3] = polar(a0, r0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r1} ${r1} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} A${r0} ${r0} 0 ${large} 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`;
}

// Letters stacked along the wedge from the rim inward, each upright toward the rim.
function stacked(text, angle, ink, { start = 440, step = 44, size = 46, weight = 700, stroke = null } = {}) {
  const chars = [...text];
  return chars
    .map((ch, k) => {
      if (ch === " ") return "";
      const [x, y] = polar(angle, start - k * step);
      const s = stroke ? ` stroke="${stroke}" stroke-width="2" paint-order="stroke"` : "";
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" transform="rotate(${angle} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${ink}" font-size="${size}" font-weight="${weight}" text-anchor="middle" dominant-baseline="central"${s}>${ch}</text>`;
    })
    .join("");
}

function cashText(value) {
  // "$5000" reads better stacked than "$5,000"
  return "$" + String(value);
}

const R = 470; // rim radius
const HUB = 92;

// The main wheel. pointers: [{ deg, color, active }] drawn outside the rim (they don't turn).
export function wheelSvg(wheel, { pointers = [], id = "w" } = {}) {
  const parts = [];
  wheel.forEach((w, i) => {
    const mid = i * WEDGE_DEG;
    const a0 = mid - WEDGE_DEG / 2;
    const a1 = mid + WEDGE_DEG / 2;
    parts.push(`<path d="${slice(a0, a1, HUB, R)}" fill="${wedgeFill(w, i)}" stroke="#222" stroke-width="2"/>`);
    const ink = wedgeInk(w, i);
    if (w.kind === "cash") {
      const t = cashText(w.value);
      parts.push(stacked(t, mid, ink, { size: t.length > 4 ? 50 : 54, step: t.length > 4 ? 52 : 58, start: 425 }));
    } else if (w.kind === "bankrupt") {
      parts.push(stacked("BANKRUPT", mid, "#fff", { size: 34, step: 38, start: 435 }));
    } else if (w.kind === "loseTurn") {
      parts.push(stacked("LOSE A TURN", mid, "#111", { size: 30, step: 33, start: 440 }));
    } else if (w.kind === "mystery") {
      parts.push(stacked("?", mid, "#ffd22e", { size: 80, start: 405 }));
      parts.push(stacked("MYSTERY", mid, "#fff", { size: 30, step: 34, start: 345 }));
    } else if (w.kind === "express") {
      parts.push(stacked("EXPRESS", mid, "#fff", { size: 36, step: 42, start: 432 }));
    } else if (w.kind === "gift") {
      parts.push(stacked("PRIZE", mid, "#0b5", { size: 40, step: 46, start: 430, weight: 800 }));
      parts.push(stacked("$500", mid, "#111", { size: 34, step: 38, start: 200 }));
    } else if (w.kind === "million") {
      // Bankrupt on both sides, the One Million strip down the middle.
      const third = WEDGE_DEG / 3;
      parts.push(`<path d="${slice(mid - third / 2, mid + third / 2, HUB, R)}" fill="url(#g-million)" stroke="#111" stroke-width="1"/>`);
      parts.push(stacked("ONE MILLION", mid, "#fff", { size: 22, step: 27, start: 445, stroke: "#145c2a" }));
      parts.push(stacked("B", mid - third, "#fff", { size: 18, start: 448 }));
      parts.push(stacked("B", mid + third, "#fff", { size: 18, start: 448 }));
    }
    if (w.wild) {
      // the Wild Card, a small card sitting on the wedge
      const [x, y] = polar(mid, 300);
      parts.push(
        `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${mid})"><rect x="-24" y="-34" width="48" height="68" rx="6" fill="url(#g-wild)" stroke="#fff" stroke-width="3"/><text x="0" y="-8" font-size="15" font-weight="800" fill="#fff" text-anchor="middle">WILD</text><text x="0" y="12" font-size="15" font-weight="800" fill="#fff" text-anchor="middle">CARD</text></g>`
      );
    }
  });
  // pegs at every wedge boundary
  for (let i = 0; i < WEDGES; i++) {
    const [x, y] = polar(i * WEDGE_DEG + WEDGE_DEG / 2, R - 10);
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="url(#g-peg)" stroke="#555" stroke-width="1"/>`);
  }
  const ptrs = pointers
    .map((p) => {
      const [x, y] = polar(p.deg, R + 4);
      return `<g class="ptr${p.active ? " on" : ""}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${p.deg})"><path d="M0 18 L-17 -34 L17 -34 Z" fill="${p.color}" stroke="#fff" stroke-width="3"/></g>`;
    })
    .join("");
  return `<svg class="wheel-svg" viewBox="-520 -520 1040 1040" aria-hidden="true">
    <defs>
      <linearGradient id="g-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fdfdfd"/><stop offset=".35" stop-color="#b9bec6"/><stop offset=".55" stop-color="#f2f4f7"/><stop offset="1" stop-color="#8f96a1"/></linearGradient>
      <linearGradient id="g-million" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1f8a3b"/><stop offset=".5" stop-color="#43c463"/><stop offset="1" stop-color="#1f8a3b"/></linearGradient>
      <linearGradient id="g-express" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a1f"/><stop offset="1" stop-color="#c4161c"/></linearGradient>
      <linearGradient id="g-wild" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9b4dff"/><stop offset="1" stop-color="#e2338f"/></linearGradient>
      <radialGradient id="g-peg"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#9aa"/></radialGradient>
      <radialGradient id="g-hub"><stop offset="0" stop-color="#3a6fe0"/><stop offset=".7" stop-color="#173a9a"/><stop offset="1" stop-color="#0b1f5c"/></radialGradient>
    </defs>
    <circle r="${R + 22}" fill="#1b1b1b"/>
    <circle r="${R + 14}" fill="none" stroke="#d9b54a" stroke-width="10"/>
    <g class="rotor" id="${id}-rotor">${parts.join("")}<circle r="${HUB}" fill="url(#g-hub)" stroke="#d9b54a" stroke-width="8"/><circle r="${HUB - 30}" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="3"/></g>
    ${ptrs}
  </svg>`;
}

// The small Bonus Round wheel: 24 envelopes, pointer at the top.
export function bonusWheelSvg(count = 24, { id = "bw", million = false, millionSlot = -1 } = {}) {
  const deg = 360 / count;
  const parts = [];
  for (let i = 0; i < count; i++) {
    const mid = i * deg;
    parts.push(`<path d="${slice(mid - deg / 2, mid + deg / 2, 70, R)}" fill="${i % 2 ? "#c9a227" : "#e8c547"}" stroke="#7a5c00" stroke-width="2"/>`);
    const [x, y] = polar(mid, 360);
    const gold = million && i === millionSlot;
    parts.push(
      `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${mid})"><rect x="-26" y="-40" width="52" height="80" rx="4" fill="${gold ? "#1f8a3b" : "#fffaf0"}" stroke="#7a5c00" stroke-width="2"/><path d="M-26 -40 L0 -10 L26 -40" fill="none" stroke="${gold ? "#fff" : "#b08a1e"}" stroke-width="2"/><text y="18" font-size="${gold ? 16 : 26}" font-weight="800" fill="${gold ? "#fff" : "#b08a1e"}" text-anchor="middle">${gold ? "$1M" : "?"}</text></g>`
    );
  }
  for (let i = 0; i < count; i++) {
    const [x, y] = polar(i * deg + deg / 2, R - 10);
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="url(#g-peg2)" stroke="#555" stroke-width="1"/>`);
  }
  const [px, py] = polar(0, R + 4);
  return `<svg class="wheel-svg bonus" viewBox="-520 -520 1040 1040" aria-hidden="true">
    <defs><radialGradient id="g-peg2"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#9aa"/></radialGradient>
    <radialGradient id="g-hub2"><stop offset="0" stop-color="#fff3c4"/><stop offset="1" stop-color="#b8860b"/></radialGradient></defs>
    <circle r="${R + 22}" fill="#1b1b1b"/><circle r="${R + 14}" fill="none" stroke="#fff" stroke-width="8"/>
    <g class="rotor" id="${id}-rotor">${parts.join("")}<circle r="70" fill="url(#g-hub2)" stroke="#7a5c00" stroke-width="6"/></g>
    <g transform="translate(${px} ${py - 30})"><path d="M0 52 L-22 -6 L22 -6 Z" fill="#e5322d" stroke="#fff" stroke-width="4"/></g>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Spinning
// ---------------------------------------------------------------------------

// A spin is fixed the moment it starts: where the wheel was, how far it will travel and
// for how long. The host and the TV both animate the same spin from these numbers.
export function newSpin(from) {
  const travel = 330 + Math.random() * 560; // degrees: about 1 to 2.5 turns, like a real pull
  const duration = 4200 + (travel / 890) * 3300; // ms
  return { from, travel, duration, startedAt: Date.now() };
}

// Ease-out that slows like friction: fast off the pull, a long coast at the end.
const ease = (p) => 1 - Math.pow(1 - p, 3);

export function spinAngle(spin, now = Date.now()) {
  const p = Math.min(1, Math.max(0, (now - spin.startedAt) / spin.duration));
  return spin.from + spin.travel * ease(p);
}

export const spinEnd = (spin) => spin.from + spin.travel;

// Which wedge sits under a pointer at pointerDeg (0 = top, clockwise) when the wheel is
// turned to angle. part says which third of a Million Dollar Wedge it is.
export function wedgeAt(angle, pointerDeg, count = WEDGES) {
  const deg = 360 / count;
  const a = (((pointerDeg - angle) % 360) + 360 + deg / 2) % 360;
  const index = Math.floor(a / deg) % count;
  const frac = (a % deg) / deg; // 0..1 across the wedge, clockwise
  return { index, frac };
}

// Turn a rotor and click the pegs as they pass. Returns a stop function.
export function animateSpin(getRotor, spin, { pointerDeg = 180, count = WEDGES, onPeg, onDone } = {}) {
  const deg = 360 / count;
  let lastPeg = Math.floor((spin.from - pointerDeg + deg / 2) / deg);
  let raf = null;
  let stopped = false;
  const step = () => {
    if (stopped) return;
    const now = Date.now();
    const angle = spinAngle(spin, now);
    const rotor = getRotor();
    if (rotor) rotor.setAttribute("transform", `rotate(${angle.toFixed(2)})`);
    const peg = Math.floor((angle - pointerDeg + deg / 2) / deg);
    if (peg !== lastPeg) {
      lastPeg = peg;
      onPeg?.();
    }
    if (now - spin.startedAt >= spin.duration) {
      stopped = true;
      onDone?.(angle);
      return;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
  };
}
