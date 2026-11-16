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

// Painted wooden/metal sign board.
export function signTexture(text, { w = 1024, h = 256, bg = '#2f5d3a', fg = '#fff3c4', edge = '#1b3322', size = 140, sub = null } = {}) {
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = bg;
    roundRect(ctx, 14, 14, w - 28, h - 28, 22);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${size}px "Baloo 2", system-ui, sans-serif`;
    let fs = size;
    while (ctx.measureText(text).width > w - 80 && fs > 20) { fs -= 6; ctx.font = `900 ${fs}px "Baloo 2", system-ui, sans-serif`; }
    ctx.fillText(text, w / 2, sub ? h * 0.42 : h / 2 + fs * 0.06);
    if (sub) {
      ctx.globalAlpha = 0.8;
      ctx.font = `700 ${Math.round(size * 0.32)}px Inter, system-ui, sans-serif`;
      ctx.fillText(sub, w / 2, h * 0.78);
    }
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
