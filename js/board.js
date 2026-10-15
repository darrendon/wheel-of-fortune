// The puzzle board: four rows of 12, 14, 14 and 12 spaces, the short rows centered under
// the long ones, like the show's board.

export const COLS = 14;
export const ROW_WIDTH = [12, 14, 14, 12];
export const ROW_START = [1, 0, 0, 1]; // first usable column in each row

export const VOWELS = new Set(["A", "E", "I", "O", "U"]);
export const isLetter = (ch) => /^[A-Z]$/.test(ch);

// Which rows a puzzle with n lines uses, in order of preference.
const ROW_SETS = {
  1: [[1], [2]],
  2: [[1, 2]],
  3: [
    [0, 1, 2],
    [1, 2, 3],
  ],
  4: [[0, 1, 2, 3]],
};

// Split words into lines that fit the given widths, as evenly as possible.
function split(words, widths) {
  const n = widths.length;
  let best = null;
  const lens = (ws) => ws.join(" ").length;
  const go = (start, line, acc) => {
    if (line === n) {
      if (start !== words.length) return;
      const ls = acc.map(lens);
      const score = ls.reduce((s, l, i) => s + (widths[i] - l) ** 2, 0);
      if (!best || score < best.score) best = { lines: acc.map((ws) => ws.join(" ")), score };
      return;
    }
    for (let end = start + 1; end <= words.length; end++) {
      const ws = words.slice(start, end);
      if (lens(ws) > widths[line]) break;
      if (line === n - 1 && end !== words.length) continue;
      go(end, line + 1, [...acc, ws]);
    }
  };
  go(0, 0, []);
  return best;
}

// Lay a puzzle out on the board. A "/" in the puzzle forces a line break.
// Returns { cells: [{ r, c, ch }], error }.
export function layout(puzzle) {
  const text = String(puzzle || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  let placed = null;
  if (text.includes("/")) {
    const lines = text.split("/").map((l) => l.trim()).filter(Boolean);
    for (const rows of ROW_SETS[lines.length] || []) {
      if (lines.every((l, i) => l.length <= ROW_WIDTH[rows[i]])) {
        placed = { rows, lines };
        break;
      }
    }
  } else {
    const words = text.split(" ").filter(Boolean);
    for (let n = 1; n <= 4 && !placed; n++) {
      let best = null;
      for (const rows of ROW_SETS[n]) {
        const s = split(
          words,
          rows.map((r) => ROW_WIDTH[r])
        );
        if (s && (!best || s.score < best.score)) best = { rows, lines: s.lines, score: s.score };
      }
      if (best) placed = best;
    }
  }
  if (!placed) return { cells: [], error: `"${puzzle}" doesn't fit on the board` };
  const cells = [];
  placed.lines.forEach((line, i) => {
    const r = placed.rows[i];
    const start = Math.floor((COLS - line.length) / 2);
    [...line].forEach((ch, k) => {
      if (ch !== " ") cells.push({ r, c: start + k, ch });
    });
  });
  return { cells, error: null };
}

// The letters in a puzzle, for checking what's left.
export function lettersIn(cells) {
  return new Set(cells.filter((c) => isLetter(c.ch)).map((c) => c.ch));
}

export function plainAnswer(puzzle) {
  return String(puzzle || "")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// Draw the board. tile(cell) -> "hidden" | "lit" | "shown"; ghost: show hidden letters faintly
// (host only). justShown: cell indexes that should play the turn animation.
export function boardHtml(cells, { tile, ghost = false, justShown = new Set(), wave = false } = {}) {
  const byPos = new Map(cells.map((c, i) => [c.r * COLS + c.c, i]));
  let html = "";
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < COLS; c++) {
      const inRow = c >= ROW_START[r] && c < ROW_START[r] + ROW_WIDTH[r];
      if (!inRow) {
        html += `<div class="sp void"></div>`;
        continue;
      }
      const i = byPos.get(r * COLS + c);
      if (i === undefined) {
        html += `<div class="sp"></div>`;
        continue;
      }
      const cell = cells[i];
      const letter = isLetter(cell.ch);
      const st = letter ? tile(i) : "shown";
      const anim = justShown.has(i) ? " turn" : "";
      const delay = wave && justShown.has(i) ? ` style="animation-delay:${(c * 45 + r * 20)}ms"` : "";
      const ch = cell.ch === "&" ? "&amp;" : cell.ch;
      if (st === "shown") html += `<div class="sp in shown${anim}"${delay}><span>${ch}</span></div>`;
      else if (st === "lit") html += `<div class="sp in lit"></div>`;
      else html += `<div class="sp in${ghost ? " ghost" : ""}">${ghost ? `<span>${ch}</span>` : ""}</div>`;
    }
  }
  return `<div class="pboard"><div class="pgrid">${html}</div></div>`;
}
