// Sound cues. Every cue has a built-in sound made in the browser, so the game sounds
// right with an empty sounds/ folder. To use your own audio instead, drop a file into
// sounds/ with the name below (or change the name here); the file plays in place of the
// built-in sound. The theme and bonus music only play if you add a file for them; the
// toss-up music has a built-in loop too.

const SOUND_FILES = {
  // Music (loops)
  theme: "theme.mp3", // title screen and team setup
  bonusMusic: "bonus.mp3", // walking up to the Bonus Round
  tossupMusic: "tossup.mp3", // while toss-up letters fill in; pauses when the reveal stops

  // Short cues
  ding: "ding.mp3", // one letter lights up on the board
  buzzer: "buzzer.mp3", // letter not in the puzzle, already called, wrong solve
  bankrupt: "bankrupt.mp3", // landed on Bankrupt
  loseTurn: "lose-turn.mp3", // landed on Lose a Turn
  peg: "peg.mp3", // the flapper hitting a peg as the wheel turns
  solve: "solve.mp3", // a puzzle is solved
  tossTick: "tossup-letter.mp3", // a letter pops in during a toss-up
  ringIn: "ring-in.mp3", // a team rings in on a toss-up
  noMore: "no-more.mp3", // "no more vowels" / "only vowels remain"
  timeUp: "time-up.mp3", // time for the Final Spin
  tick: "tick.mp3", // speed-up and Bonus Round clocks
  clockOut: "clock-out.mp3", // a clock runs out
  mystery: "mystery.mp3", // a Mystery wedge is flipped
  express: "express.mp3", // riding the Express
  claim: "claim.mp3", // Wild Card, prize or Million Dollar Wedge picked up
  envelope: "envelope.mp3", // the Bonus Round envelope is opened
};

const MUSIC = new Set(["theme", "bonusMusic", "tossupMusic"]);
// Music with a built-in loop, used when there's no file for it.
const MUSIC_SYNTH = new Set(["tossupMusic"]);

let music = null; // an <audio> element, or the built-in loop's controller
let musicName = null;
let musicPaused = false;
let muted = false;
let ctx = null;
const missing = new Set();
const checked = new Map(); // name -> Promise<boolean>, does the file exist?

export function playSound(name) {
  if (MUSIC.has(name)) return playMusic(name);
  if (muted) return;
  const file = SOUND_FILES[name];
  if (!file || missing.has(name)) return synth(name);
  // Peg clicks come fast; only use a file once we know it's there, so a missing file
  // doesn't queue up dozens of failed loads.
  if (!checked.has(name)) {
    checked.set(
      name,
      fetch(`sounds/${file}`, { method: "HEAD" })
        .then((r) => {
          if (!r.ok) missing.add(name);
          return r.ok;
        })
        .catch(() => {
          missing.add(name);
          return false;
        })
    );
    return synth(name);
  }
  checked.get(name).then((ok) => {
    if (!ok) return synth(name);
    const audio = new Audio(`sounds/${file}`);
    audio.play().catch(() => {});
  });
}

// Look for every sound file up front, so the first time a cue plays it already knows
// whether to use your file or the built-in sound.
export function checkSoundFiles() {
  for (const [name, file] of Object.entries(SOUND_FILES)) {
    if ((MUSIC.has(name) && !MUSIC_SYNTH.has(name)) || checked.has(name)) continue;
    checked.set(
      name,
      fetch(`sounds/${file}`, { method: "HEAD", cache: "no-cache" })
        .then((r) => {
          const ok = r.ok && !(r.headers.get("content-type") || "").includes("text/html");
          if (!ok) missing.add(name);
          return ok;
        })
        .catch(() => {
          missing.add(name);
          return false;
        })
    );
  }
}

function playMusic(name) {
  if (musicName === name && music) {
    if (musicPaused) resumeMusic();
    return;
  }
  stopMusic();
  if (muted) return;
  const file = SOUND_FILES[name];
  const hasSynth = MUSIC_SYNTH.has(name);
  // Music with a built-in loop uses the file only once we know it's there.
  if (!file || missing.has(name) || (hasSynth && !checked.has(name))) {
    if (hasSynth) startSynthMusic(name);
    return;
  }
  if (hasSynth) {
    musicName = name;
    musicPaused = false;
    checked.get(name).then((ok) => {
      if (musicName !== name || music) return; // stopped or replaced while we checked
      if (ok) startFileMusic(name, file, hasSynth);
      else startSynthMusic(name, musicPaused);
    });
    return;
  }
  startFileMusic(name, file, hasSynth);
}

function startFileMusic(name, file, hasSynth) {
  const audio = new Audio(`sounds/${file}`);
  audio.loop = true;
  audio.volume = 0.6;
  music = audio;
  musicName = name;
  const paused = musicPaused;
  audio.addEventListener(
    "error",
    () => {
      missing.add(name);
      if (music !== audio) return;
      const wasPaused = musicPaused;
      stopMusic();
      if (hasSynth) startSynthMusic(name, wasPaused);
    },
    { once: true }
  );
  if (!paused) audio.play().catch(() => {});
}

function startSynthMusic(name, paused = false) {
  let loop = null;
  try {
    loop = SYNTH_MUSIC[name]?.();
  } catch {
    /* no audio */
  }
  if (!loop) return;
  music = loop;
  musicName = name;
  musicPaused = paused;
  if (!paused) loop.play();
}

// Hold the music where it is (a toss-up stops filling in), and pick it up again later.
export function pauseMusic() {
  if (!musicName) return;
  musicPaused = true;
  music?.pause();
}

export function resumeMusic() {
  if (!musicName || !musicPaused) return;
  musicPaused = false;
  if (muted) return;
  if (music) music.play()?.catch?.(() => {});
}

export function stopMusic() {
  if (music) {
    music.pause();
    music.stop?.();
  }
  music = null;
  musicName = null;
  musicPaused = false;
}

// What's playing, for checking from the console: { name, paused, source, running }.
export function musicStatus() {
  if (!musicName) return { name: null, paused: false, source: null, running: false };
  const source = !music ? "pending" : music instanceof Audio ? "file" : "synth";
  const running = source === "file" ? !music.paused : source === "synth" ? music.running() : false;
  return { name: musicName, paused: musicPaused, source, running };
}

export function toggleMute() {
  muted = !muted;
  if (muted) stopMusic();
  return muted;
}

export function setMuted(v) {
  muted = Boolean(v);
  if (muted) stopMusic();
}

export const isMuted = () => muted;

// Browsers only allow sound after a click; call this from a click handler.
export function unlockAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    /* no audio */
  }
}

// ---------------------------------------------------------------------------
// Built-in sounds
// ---------------------------------------------------------------------------

function ac() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

// A struck bell: a few inharmonic partials that ring out.
function bell(t, freq, len = 1.4, vol = 0.22) {
  const c = ac();
  const out = c.createGain();
  out.gain.value = vol;
  out.connect(c.destination);
  for (const [ratio, amp, decay] of [
    [1, 1, 1],
    [2.0, 0.45, 0.6],
    [2.76, 0.25, 0.4],
    [5.4, 0.12, 0.2],
  ]) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = freq * ratio;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len * decay);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.05);
  }
}

function tone(t, freq, len, { type = "sine", vol = 0.2, slideTo = null, attack = 0.01, filter = null } = {}) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, len - 0.08));
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  let node = o.connect(g);
  if (filter) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filter;
    node = g.connect(f);
  }
  node.connect(c.destination);
  o.start(t);
  o.stop(t + len + 0.05);
}

function noise(t, len, { freq = 2000, q = 1, vol = 0.3, type = "bandpass" } = {}) {
  const c = ac();
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * len)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

const SYNTHS = {
  ding: (t) => bell(t, 1318, 1.3, 0.2),
  buzzer: (t) => {
    tone(t, 98, 0.75, { type: "sawtooth", vol: 0.16, filter: 900 });
    tone(t, 104, 0.75, { type: "square", vol: 0.08, filter: 700 });
  },
  bankrupt: (t) => {
    tone(t, 330, 1.25, { type: "sawtooth", vol: 0.15, slideTo: 70, filter: 1400 });
    tone(t + 0.02, 247, 1.25, { type: "square", vol: 0.06, slideTo: 55, filter: 900 });
  },
  loseTurn: (t) => {
    tone(t, 392, 0.28, { type: "triangle", vol: 0.2 });
    tone(t + 0.3, 311, 0.55, { type: "triangle", vol: 0.2, slideTo: 262 });
  },
  peg: (t) => noise(t, 0.025, { freq: 3200, q: 3, vol: 0.55 }),
  solve: (t) => {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => bell(t + i * 0.07, f, 1.6, 0.13));
    [523, 659, 784].forEach((f) => tone(t + 0.4, f, 1.2, { type: "triangle", vol: 0.07 }));
  },
  tossTick: (t) => tone(t, 880, 0.12, { type: "square", vol: 0.06, filter: 2500 }),
  ringIn: (t) => {
    tone(t, 740, 0.12, { type: "square", vol: 0.1, filter: 3000 });
    tone(t + 0.13, 988, 0.22, { type: "square", vol: 0.1, filter: 3000 });
  },
  noMore: (t) => {
    bell(t, 880, 0.9, 0.14);
    bell(t + 0.22, 698, 1.1, 0.14);
  },
  timeUp: (t) => {
    [659, 784, 988].forEach((f, i) => bell(t + i * 0.32, f, 1.4, 0.18));
  },
  tick: (t) => noise(t, 0.04, { freq: 1600, q: 6, vol: 0.5 }),
  clockOut: (t) => {
    tone(t, 165, 0.9, { type: "sawtooth", vol: 0.13, filter: 1200 });
    tone(t, 175, 0.9, { type: "square", vol: 0.07, filter: 900 });
  },
  mystery: (t) => {
    for (let i = 0; i < 16; i++) noise(t + i * 0.055, 0.05, { freq: 180 + i * 6, q: 0.8, vol: 0.25 + i * 0.02, type: "lowpass" });
  },
  express: (t) => {
    // a two-tone train whistle
    for (const [f, d] of [
      [587, 0],
      [740, 0],
      [880, 0],
    ]) {
      tone(t + d, f, 0.45, { type: "sawtooth", vol: 0.05, filter: 2200, attack: 0.05 });
      tone(t + 0.55, f * 0.94, 0.8, { type: "sawtooth", vol: 0.05, filter: 2200, attack: 0.05 });
    }
  },
  claim: (t) => {
    [1047, 1319, 1568, 2093].forEach((f, i) => bell(t + i * 0.06, f, 0.8, 0.1));
  },
  envelope: (t) => {
    noise(t, 0.25, { freq: 5000, q: 0.5, vol: 0.15 });
    [523, 659, 784, 1047].forEach((f, i) => tone(t + 0.25 + i * 0.12, f, 0.5, { type: "triangle", vol: 0.15 }));
    [523, 659, 784, 1047].forEach((f) => tone(t + 0.8, f, 1.3, { type: "triangle", vol: 0.08 }));
  },
};

function synth(name) {
  const fn = SYNTHS[name];
  if (!fn || muted) return;
  try {
    const c = ac();
    if (c.state === "suspended") c.resume();
    fn(c.currentTime + 0.01);
  } catch {
    /* no audio */
  }
}

// ---------------------------------------------------------------------------
// Built-in music
// ---------------------------------------------------------------------------

// The toss-up bed: a driving, suspenseful synth loop — a pulsing minor-key bass under a
// kick, ticking hi-hats and a climbing sixteenth-note arpeggio. Notes are scheduled a
// moment ahead, so it can stop the instant a team rings in and pick up where it left off.
function tossupLoop() {
  const c = ac();
  const BPM = 132;
  const STEP = 60 / BPM / 4; // one sixteenth note
  const STEPS = 64; // four bars, then it loops
  const AHEAD = 0.2; // seconds of music scheduled ahead of time
  const BARS = [
    { bass: 55.0, arp: [440.0, 523.25, 659.25, 880.0] }, // A minor
    { bass: 55.0, arp: [440.0, 523.25, 659.25, 987.77] }, // A minor, reaching up
    { bass: 43.65, arp: [349.23, 440.0, 523.25, 698.46] }, // F
    { bass: 41.2, arp: [329.63, 415.3, 493.88, 659.25] }, // E, the tension before it comes round
  ];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 3, 2, 3, 3];
  const noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  let step = 0;
  let nextAt = 0;
  let timer = null;
  let out = null;
  const live = new Set();

  const keep = (node, end) => {
    live.add(node);
    node.onended = () => live.delete(node);
    node.start(Math.max(c.currentTime, end.start));
    node.stop(end.stop);
  };

  function voice(t, freq, len, { type = "sawtooth", vol = 0.1, cutoff = 2000, slideTo = null } = {}) {
    const o = c.createOscillator();
    const g = c.createGain();
    const f = c.createBiquadFilter();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + len);
    f.type = "lowpass";
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f).connect(g).connect(out);
    keep(o, { start: t, stop: t + len + 0.02 });
  }

  function hat(t, vol) {
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(f).connect(g).connect(out);
    keep(src, { start: t, stop: t + 0.05 });
  }

  function schedule(s, t) {
    const bar = BARS[Math.floor(s / 16) % BARS.length];
    const k = s % 16;
    if (k % 4 === 0) voice(t, 130, 0.14, { type: "sine", vol: 0.5, cutoff: 800, slideTo: 42 }); // kick
    if (k % 2 === 0) voice(t, bar.bass * (k % 4 === 2 ? 2 : 1), STEP * 1.7, { vol: 0.2, cutoff: 420 }); // bass pulse
    hat(t, k % 4 === 2 ? 0.16 : 0.05);
    const lift = s >= STEPS - 4 ? 2 : 1; // the last beat jumps an octave into the loop
    voice(t, bar.arp[ARP[k]] * lift, STEP * 0.85, { type: "square", vol: 0.045, cutoff: 2600 });
    if (k === 0) bar.arp.slice(0, 3).forEach((fq) => voice(t, fq / 2, STEP * 15, { vol: 0.025, cutoff: 900 })); // pad
  }

  function tick() {
    while (nextAt < c.currentTime + AHEAD) {
      schedule(step, nextAt);
      nextAt += STEP;
      step = (step + 1) % STEPS;
    }
  }

  return {
    play() {
      if (timer) return;
      if (c.state === "suspended") c.resume();
      out = c.createGain();
      out.gain.value = 0.55;
      out.connect(c.destination);
      nextAt = c.currentTime + 0.05;
      tick();
      timer = setInterval(tick, 25);
    },
    // Stop right away, remembering where it was.
    pause() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      const now = c.currentTime;
      const o = out;
      out = null;
      o.gain.setValueAtTime(o.gain.value, now);
      o.gain.linearRampToValueAtTime(0, now + 0.04);
      for (const n of live) {
        try {
          n.stop(now + 0.05);
        } catch {
          /* already stopped */
        }
      }
      live.clear();
      setTimeout(() => o.disconnect(), 300);
    },
    stop() {
      this.pause();
      step = 0;
    },
    running: () => Boolean(timer),
  };
}

const SYNTH_MUSIC = {
  tossupMusic: tossupLoop,
};
