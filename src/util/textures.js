import * as THREE from 'three';

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Painted board with a paw-print emblem. No words: the owner wants zero text signs in the world.
export function signTexture(_text, { w = 1024, h = 256, bg = '#2f5d3a', fg = '#fff3c4', edge = '#1b3322' } = {}) {
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = bg;
    roundRect(ctx, 14, 14, w - 28, h - 28, 22);
    ctx.fill();
    ctx.fillStyle = fg;
    const paw = (cx, cy, r) => {
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.35, r * 0.62, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      for (const [dx, dy] of [[-0.62, -0.32], [-0.22, -0.7], [0.22, -0.7], [0.62, -0.32]]) { ctx.beginPath(); ctx.ellipse(cx + dx * r, cy + dy * r, r * 0.2, r * 0.26, dx * 0.6, 0, Math.PI * 2); ctx.fill(); }
    };
    const r = h * 0.28, n = Math.max(1, Math.min(5, Math.floor(w / (h * 0.9))));
    for (let i = 0; i < n; i++) { ctx.globalAlpha = i % 2 ? 0.55 : 0.95; paw(w * (i + 0.5) / n, h * 0.52 + (i % 2 ? -h * 0.06 : h * 0.04), r); }
    ctx.globalAlpha = 1;
  });
}

// Floating name tag above a character.
export function labelSprite(text, color = '#ffffff') {
  const tex = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.font = '800 64px "Baloo 2", system-ui, sans-serif';
    const tw = ctx.measureText(text).width + 60;
    ctx.fillStyle = 'rgba(10,20,15,0.55)';
    roundRect(ctx, (w - tw) / 2, 18, tw, 92, 46);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, 68);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.3, 0.325, 1);
  return s;
}

export function plankTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const rows = 8;
    for (let i = 0; i < rows; i++) {
      const l = 52 + Math.random() * 10;
      ctx.fillStyle = `hsl(28, 45%, ${l}%)`;
      ctx.fillRect(0, (i * h) / rows, w, h / rows);
      ctx.fillStyle = 'rgba(60,30,10,0.35)';
      ctx.fillRect(0, (i * h) / rows, w, 3);
      const off = Math.random() * w;
      ctx.fillRect(off, (i * h) / rows, 3, h / rows);
      ctx.globalAlpha = 0.08;
      for (let k = 0; k < 12; k++) ctx.fillRect(0, (i * h) / rows + Math.random() * (h / rows), w, 1);
      ctx.globalAlpha = 1;
    }
  });
}
