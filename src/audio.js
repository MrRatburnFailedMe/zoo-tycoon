// Tiny synthesized sound kit so the prototype has feedback without any audio files.
// Swap these out for real samples later.
let ctx = null;
let master = null;
let noiseBuf = null;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ f = 440, f2 = f, type = 'sine', dur = 0.15, vol = 0.2, delay = 0, attack = 0.005 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.2, f = 800, f2 = f, q = 1, type = 'lowpass', delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(0.0002, vol), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

let lastHit = 0;

export const sfx = {
  unlock: () => ac(),
  grab: () => tone({ f: 420, f2: 760, type: 'triangle', dur: 0.09, vol: 0.12 }),
  drop: () => tone({ f: 500, f2: 260, type: 'triangle', dur: 0.08, vol: 0.07 }),
  snap: () => tone({ f: 900, f2: 200, type: 'square', dur: 0.12, vol: 0.06 }),
  throw: () => noise({ dur: 0.25, vol: 0.25, f: 400, f2: 2400, type: 'bandpass', q: 2 }),
  jump: () => tone({ f: 260, f2: 420, type: 'sine', dur: 0.12, vol: 0.06 }),
  step: (v) => noise({ dur: 0.06, vol: 0.03 + v * 0.006, f: 900, f2: 300 }),
  land: (v) => { noise({ dur: 0.14, vol: Math.min(0.35, v * 0.03), f: 500, f2: 90 }); },
  slip: () => { tone({ f: 1400, f2: 180, type: 'sine', dur: 0.55, vol: 0.14 }); noise({ dur: 0.2, vol: 0.12, f: 2000, f2: 600, type: 'bandpass', q: 3, delay: 0.05 }); },
  bonk: () => { tone({ f: 180, f2: 70, type: 'square', dur: 0.18, vol: 0.12 }); tone({ f: 1200, f2: 1100, type: 'sine', dur: 0.4, vol: 0.05, delay: 0.05 }); },
  oof: () => tone({ f: 240, f2: 110, type: 'sawtooth', dur: 0.22, vol: 0.07 }),
  pop: () => tone({ f: 300, f2: 900, type: 'sine', dur: 0.12, vol: 0.1 }),
  honk: () => { tone({ f: 330, f2: 300, type: 'square', dur: 0.45, vol: 0.09, attack: 0.02 }); tone({ f: 415, f2: 380, type: 'sawtooth', dur: 0.45, vol: 0.06, attack: 0.02 }); },
  cash: () => { tone({ f: 1320, type: 'triangle', dur: 0.12, vol: 0.12 }); tone({ f: 1760, type: 'triangle', dur: 0.3, vol: 0.12, delay: 0.08 }); },
  plop: (vol = 1) => tone({ f: 180, f2: 60, type: 'sine', dur: 0.18, vol: 0.12 * vol }),
  click: () => tone({ f: 1800, f2: 1200, type: 'square', dur: 0.03, vol: 0.04 }),
  error: () => tone({ f: 200, f2: 180, type: 'square', dur: 0.2, vol: 0.06 }),
  // Animal noises; v = 0..1 loudness (falls off with distance).
  roar: (v = 1) => { noise({ dur: 1.1, vol: 0.22 * v, f: 420, f2: 140, q: 3, type: 'bandpass' }); tone({ f: 120, f2: 70, type: 'sawtooth', dur: 1.0, vol: 0.08 * v, attack: 0.1 }); },
  grunt: (v = 1) => { tone({ f: 90, f2: 60, type: 'sawtooth', dur: 0.35, vol: 0.12 * v, attack: 0.03 }); tone({ f: 70, f2: 55, type: 'sawtooth', dur: 0.4, vol: 0.1 * v, delay: 0.3 }); },
  screech: (v = 1) => { for (let i = 0; i < 3; i++) tone({ f: 900 + i * 120, f2: 1500, type: 'square', dur: 0.09, vol: 0.05 * v, delay: i * 0.11 }); },
  splash: (v = 1) => noise({ dur: 0.5, vol: 0.18 * v, f: 1600, f2: 300 }),
  // held-animal panic
  slap: () => { noise({ dur: 0.07, vol: 0.5, f: 2500, f2: 1200, type: 'highpass' }); tone({ f: 260, f2: 90, type: 'square', dur: 0.08, vol: 0.12 }); },
  scream: (v = 1) => {
    const p = 0.85 + Math.random() * 0.4;
    for (let i = 0; i < 6; i++) tone({ f: (700 + (i % 2) * 160) * p, f2: (820 + (i % 2) * 200) * p, type: 'sawtooth', dur: 0.16, vol: 0.07 * v, delay: i * 0.13 });
    tone({ f: 1100 * p, f2: 380 * p, type: 'sawtooth', dur: 0.5, vol: 0.08 * v, delay: 0.78 });
  },
  boing: () => tone({ f: 160, f2: 620, type: 'sine', dur: 0.35, vol: 0.14 }),
  flush: () => { noise({ dur: 1.4, vol: 0.18, f: 900, f2: 300, type: 'lowpass' }); noise({ dur: 0.8, vol: 0.08, f: 2500, f2: 800, type: 'bandpass', q: 1, delay: 0.3 }); },
  print: () => { for (let i = 0; i < 6; i++) tone({ f: 900 + (i % 2) * 300, type: 'square', dur: 0.03, vol: 0.03, delay: i * 0.05 }); noise({ dur: 0.3, vol: 0.05, f: 3000, type: 'bandpass', q: 2 }); },
  swipe: () => noise({ dur: 0.25, vol: 0.12, f: 1200, f2: 4000, type: 'bandpass', q: 1.5 }),
  beep: () => { tone({ f: 1500, type: 'square', dur: 0.08, vol: 0.05 }); tone({ f: 2000, type: 'square', dur: 0.12, vol: 0.05, delay: 0.1 }); },
  glass: (v = 1) => {
    noise({ dur: 0.5, vol: 0.4 * v, f: 6000, f2: 2500, type: 'highpass' });
    for (let i = 0; i < 7; i++) tone({ f: 2500 + Math.random() * 3000, type: 'sine', dur: 0.12, vol: 0.05 * v, delay: 0.05 + Math.random() * 0.5 });
  },
  trumpet: (v = 1) => { tone({ f: 330, f2: 700, type: 'sawtooth', dur: 0.9, vol: 0.12 * v, attack: 0.08 }); tone({ f: 335, f2: 690, type: 'square', dur: 0.9, vol: 0.05 * v, attack: 0.08 }); },
  drum: (v = 1) => { for (let i = 0; i < 6; i++) tone({ f: 110, f2: 60, type: 'sine', dur: 0.12, vol: 0.25 * v, delay: i * 0.13 }); },
  squawk: (v = 1) => { tone({ f: 700, f2: 1100, type: 'sawtooth', dur: 0.12, vol: 0.06 * v }); tone({ f: 900, f2: 500, type: 'sawtooth', dur: 0.18, vol: 0.06 * v, delay: 0.14 }); },
  reverse: (v = 1) => tone({ f: 1050, type: 'square', dur: 0.35, vol: 0.05 * v }),
  engine: (v = 1, f = 70) => tone({ f, f2: f * 1.05, type: 'sawtooth', dur: 0.12, vol: 0.025 * v }),
  hurt: () => { tone({ f: 330, f2: 150, type: 'square', dur: 0.18, vol: 0.08 }); noise({ dur: 0.12, vol: 0.12, f: 900 }); },

  // Impact sound picked by material, attenuated by distance to the listener.
  hit(kind, speed, dist) {
    if (!ctx) return;
    const now = performance.now();
    if (now - lastHit < 45) return;
    lastHit = now;
    const att = 1 / (1 + dist * 0.25);
    const v = Math.min(1, speed / 10) * att;
    if (v < 0.03) return;
    switch (kind) {
      case 'ball': tone({ f: 160 + speed * 15, f2: 120, type: 'sine', dur: 0.12, vol: 0.25 * v }); break;
      case 'squish': noise({ dur: 0.12, vol: 0.4 * v, f: 600, f2: 150, q: 4, type: 'bandpass' }); break;
      case 'metal': tone({ f: 620, f2: 560, type: 'triangle', dur: 0.25, vol: 0.12 * v }); noise({ dur: 0.05, vol: 0.2 * v, f: 3000 }); break;
      case 'soft': noise({ dur: 0.1, vol: 0.25 * v, f: 700, f2: 200 }); break;
      case 'body': noise({ dur: 0.12, vol: 0.35 * v, f: 400, f2: 80 }); break;
      default: noise({ dur: 0.1, vol: 0.4 * v, f: 450, f2: 90 }); tone({ f: 110, f2: 60, dur: 0.08, vol: 0.15 * v });
    }
  },
};

// A little looping zoo tune for the radios. toggle() returns whether it's now playing.
export const music = (() => {
  let timer = null, step = 0;
  const MEL = [0, 4, 7, 12, 7, 4, 5, 9, 12, 9, 5, 2, 7, 11, 14, 11];
  const BASS = [0, 0, 5, 5, 7, 7, 0, 0];
  const hz = (n) => 392 * Math.pow(2, n / 12);
  const tick = () => {
    tone({ f: hz(MEL[step % MEL.length]), type: 'triangle', dur: 0.18, vol: 0.05 });
    if (step % 2 === 0) tone({ f: hz(BASS[(step / 2) % BASS.length] - 24), type: 'sine', dur: 0.3, vol: 0.06 });
    step++;
  };
  return {
    get on() { return !!timer; },
    toggle() {
      if (timer) { clearInterval(timer); timer = null; return false; }
      step = 0; tick(); timer = setInterval(tick, 220); return true;
    },
  };
})();
