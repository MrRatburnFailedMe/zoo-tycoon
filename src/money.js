import * as THREE from 'three';

// Zoo dollars and bank cards. The same art is used for the notes on the counter (3D textures),
// the register drawer and the change tray (HTML), so the money looks the same everywhere.

export const BILLS = [
  { v: 20, name: 'Lion', color: '#f2a33a', ink: '#6b3b05' },
  { v: 10, name: 'Elephant', color: '#7f9cc4', ink: '#22344d' },
  { v: 5, name: 'Penguin', color: '#38b8ad', ink: '#0d3f3b' },
  { v: 1, name: 'Monkey', color: '#7cc466', ink: '#1f4a16' },
];
export const billOf = (v) => BILLS.find((b) => b.v === v);

// Little animal portraits for the notes (simple shapes, no text).
export const FACES = {
  Lion: `<circle cx="20" cy="20" r="17" fill="#b5651d"/><circle cx="20" cy="21" r="11" fill="#f5c26b"/><circle cx="16" cy="19" r="1.6" fill="#222"/><circle cx="24" cy="19" r="1.6" fill="#222"/><path d="M17 25 q3 3 6 0" stroke="#222" stroke-width="1.4" fill="none"/><ellipse cx="20" cy="23" rx="2" ry="1.4" fill="#5a3410"/>`,
  Elephant: `<ellipse cx="9" cy="19" rx="7" ry="10" fill="#9aa3ad"/><ellipse cx="31" cy="19" rx="7" ry="10" fill="#9aa3ad"/><circle cx="20" cy="18" r="10" fill="#b8c0c8"/><rect x="18" y="22" width="4" height="13" rx="2" fill="#b8c0c8"/><circle cx="16" cy="16" r="1.5" fill="#222"/><circle cx="24" cy="16" r="1.5" fill="#222"/>`,
  Penguin: `<ellipse cx="20" cy="21" rx="12" ry="15" fill="#22252b"/><ellipse cx="20" cy="24" rx="8" ry="11" fill="#f4f4f0"/><circle cx="16.5" cy="15" r="1.6" fill="#fff"/><circle cx="23.5" cy="15" r="1.6" fill="#fff"/><path d="M17.5 19 l2.5 3 l2.5 -3z" fill="#f29a2e"/>`,
  Monkey: `<circle cx="8" cy="18" r="5" fill="#7a4a2a"/><circle cx="32" cy="18" r="5" fill="#7a4a2a"/><circle cx="20" cy="19" r="12" fill="#8b5a33"/><ellipse cx="20" cy="22" rx="8" ry="7" fill="#e8c39e"/><circle cx="16.5" cy="17" r="1.5" fill="#222"/><circle cx="23.5" cy="17" r="1.5" fill="#222"/><path d="M17 25 q3 2 6 0" stroke="#222" stroke-width="1.3" fill="none"/>`,
};

// A whole note as one SVG (used for both the HTML money and, rasterised, the 3D notes).
export function billSVG(b) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 96">
    <rect x="2" y="2" width="196" height="92" rx="8" fill="${b.color}" stroke="${b.ink}" stroke-width="4"/>
    <rect x="12" y="12" width="176" height="72" rx="5" fill="none" stroke="${b.ink}" stroke-width="2" stroke-dasharray="5 4" opacity="0.6"/>
    <circle cx="100" cy="48" r="30" fill="#fff8e0" stroke="${b.ink}" stroke-width="3"/>
    <svg x="74" y="22" width="52" height="52" viewBox="0 0 40 40">${FACES[b.name]}</svg>
    <text x="20" y="38" font-family="Baloo 2, Arial Black, sans-serif" font-weight="900" font-size="24" fill="${b.ink}">$${b.v}</text>
    <text x="180" y="82" text-anchor="end" font-family="Baloo 2, Arial Black, sans-serif" font-weight="900" font-size="24" fill="${b.ink}">$${b.v}</text>
    <circle cx="160" cy="28" r="9" fill="none" stroke="${b.ink}" stroke-width="2.5" opacity="0.7"/>
    <circle cx="40" cy="70" r="7" fill="${b.ink}" opacity="0.25"/>
  </svg>`;
}

// Notes for an amount: biggest first ($20, $10, $5, $1).
export function notesFor(value, max = 12) {
  const out = [];
  let left = Math.round(value);
  for (const b of BILLS) while (left >= b.v && out.length < max) { out.push(b.v); left -= b.v; }
  return out;
}

// One shared texture per denomination for the 3D notes.
const texCache = new Map();
export function billTexture(v) {
  if (texCache.has(v)) return texCache.get(v);
  const b = billOf(v) || BILLS[3];
  const c = document.createElement('canvas');
  c.width = 400; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = b.color; g.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const img = new Image();
  img.onload = () => { g.drawImage(img, 0, 0, c.width, c.height); tex.needsUpdate = true; };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(billSVG(b));
  texCache.set(v, tex);
  return tex;
}

// ---- bank cards ----
const BANKS = [
  { name: 'ZOOBANK', a: '#1f4fa8', b: '#5aa0ff' },
  { name: 'SAFARI CU', a: '#0f5f45', b: '#3ed6a0' },
  { name: 'JUNGLE PAY', a: '#6a2a8a', b: '#e07aff' },
  { name: 'HONEY BANK', a: '#a8661f', b: '#ffd36b' },
  { name: 'NIGHT OWL', a: '#141418', b: '#4a4d58' },
  { name: 'COCO CARD', a: '#a8323a', b: '#ff8a7a' },
];

// Front and back of a card, drawn once per visitor: gradient, chip, contactless mark, embossed
// number, name and expiry; the back has the magnetic stripe and a signature strip.
export function cardTextures(holder = 'A VISITOR', seed = Math.random()) {
  const bank = BANKS[Math.floor(seed * BANKS.length) % BANKS.length];
  const W = 512, H = 324;
  const digits = Array.from({ length: 16 }, (_, i) => (i === 0 ? 4 : Math.floor(((seed * 9301 + i * 49297) % 1) * 10 + Math.random() * 10) % 10)).join('');
  const front = document.createElement('canvas'); front.width = W; front.height = H;
  let g = front.getContext('2d');
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, bank.a); grad.addColorStop(1, bank.b);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  // swooshes
  g.globalAlpha = 0.14; g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(W * 0.85, H * 0.1, 260, 130, -0.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(W * 0.1, H * 1.05, 220, 90, 0.3, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  // bank name and a paw-print logo
  g.fillStyle = '#fff'; g.font = '900 34px "Baloo 2", Arial Black, sans-serif'; g.fillText(bank.name, 34, 56);
  const paw = (x, y, r) => { g.beginPath(); g.ellipse(x, y + r * 0.5, r * 0.9, r * 0.75, 0, 0, Math.PI * 2); g.fill(); for (const [dx, dy] of [[-0.95, -0.5], [-0.35, -1.05], [0.35, -1.05], [0.95, -0.5]]) { g.beginPath(); g.arc(x + dx * r, y + dy * r, r * 0.36, 0, Math.PI * 2); g.fill(); } };
  g.globalAlpha = 0.9; paw(W - 62, H - 70, 26); g.globalAlpha = 1;
  // EMV chip
  const cx = 52, cy = 104;
  const chip = g.createLinearGradient(cx, cy, cx + 78, cy + 58);
  chip.addColorStop(0, '#f6e08a'); chip.addColorStop(0.5, '#d4a83a'); chip.addColorStop(1, '#f2d277');
  g.fillStyle = chip; g.beginPath(); g.roundRect(cx, cy, 78, 58, 10); g.fill();
  g.strokeStyle = '#8a6a1a'; g.lineWidth = 2;
  for (const y of [cy + 19, cy + 39]) { g.beginPath(); g.moveTo(cx, y); g.lineTo(cx + 26, y); g.moveTo(cx + 52, y); g.lineTo(cx + 78, y); g.stroke(); }
  g.beginPath(); g.roundRect(cx + 26, cy + 10, 26, 38, 6); g.stroke();
  // contactless waves
  g.strokeStyle = '#fff'; g.lineWidth = 4;
  for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(cx + 112, cy + 29, 8 + i * 8, -0.7, 0.7); g.stroke(); }
  // embossed number, expiry and name
  const emboss = (t, x, y, size) => {
    g.font = `700 ${size}px "Courier New", monospace`;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(t, x + 2, y + 2);
    g.fillStyle = '#f4f4f4'; g.fillText(t, x, y);
  };
  emboss(digits.replace(/(.{4})/g, '$1 ').trim(), 34, 214, 38);
  g.font = '700 13px Inter, Arial, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText('VALID', 220, 244); g.fillText('THRU', 220, 258);
  emboss(`0${1 + Math.floor(seed * 9)}/${28 + Math.floor(seed * 5)}`, 268, 258, 24);
  emboss(holder.toUpperCase().slice(0, 20), 34, 294, 26);

  const back = document.createElement('canvas'); back.width = W; back.height = H;
  g = back.getContext('2d');
  g.fillStyle = bank.a; g.fillRect(0, 0, W, H);
  g.fillStyle = '#111'; g.fillRect(0, 34, W, 62); // magnetic stripe
  g.fillStyle = '#f4f1e6'; g.fillRect(30, 124, 330, 50);
  g.strokeStyle = '#d8d2bd'; for (let x = 30; x < 360; x += 10) { g.beginPath(); g.moveTo(x, 124); g.lineTo(x + 20, 174); g.stroke(); }
  g.font = 'italic 26px "Brush Script MT", cursive'; g.fillStyle = '#1b2a6a'; g.fillText(holder, 44, 160);
  g.fillStyle = '#fff'; g.fillRect(370, 124, 80, 50); g.fillStyle = '#111'; g.font = 'italic 700 24px Arial'; g.fillText(String(100 + Math.floor(seed * 899)), 382, 158);
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '13px Inter, Arial'; g.fillText('This card belongs to ' + bank.name + '. If found, give it a banana.', 30, 220);
  const t = (c) => { const x = new THREE.CanvasTexture(c); x.colorSpace = THREE.SRGBColorSpace; x.anisotropy = 4; return x; };
  return { front: t(front), back: t(back), color: bank.a };
}
