// Desktop apps on ZooOS (besides the browser). Same shape as a site:
// { name, icon, render(ctx) → html, bind?(view, ctx), live?(view, ctx) }
import { CATEGORIES } from '../state.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;
const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`; };

export const APPS = {
  gate: {
    name: 'Gate Desk',
    icon: 'GD',
    color: '#e2523c',
    render: () => `<div class="app-gate">
      <div class="ag-top">
        <div class="ag-stat"><small>IN QUEUE</small><b class="ag-q">0</b></div>
        <div class="ag-stat"><small>IN THE PARK</small><b class="ag-in">0</b></div>
        <div class="ag-stat"><small>TICKETS SOLD</small><b class="ag-sold">0</b></div>
        <div class="ag-stat"><small>TICKET PRICE</small><b class="ag-price">$0</b><input type="range" min="1" max="80" class="ag-range" /></div>
      </div>
      <div class="ag-cols">
        <section><h3>Recent sales</h3><table class="ag-tx"></table></section>
      </div>
      <p class="ag-tip">Customers order at the window. Print tickets on the printer and hand them over, swipe cards on the reader, and ring cash up at the register.</p>
    </div>`,
    bind(view, ctx) {
      const r = view.querySelector('.ag-range');
      r.value = ctx.state.ticketPrice;
      r.addEventListener('input', () => ctx.state.setPrice(+r.value));
    },
    live(view, { state, visitors }) {
      const set = (s, v) => { const el = view.querySelector(s); if (el) el.textContent = v; };
      set('.ag-q', visitors.queue.length);
      set('.ag-in', visitors.list.filter((v) => ['enter', 'tour', 'watch', 'leave'].includes(v.state)).length);
      set('.ag-sold', state.ticketsSold);
      set('.ag-price', money(state.ticketPrice));
      view.querySelector('.ag-tx').innerHTML = visitors.history.slice(0, 14).map((h) =>
        `<tr><td>${ago(h.time)}</td><td>${esc(h.name)}</td><td>${esc(h.how)}</td><td class="${h.paid ? 'p' : 'n'}">${h.paid ? '+' + money(h.paid) : '-'}</td></tr>`).join('') || '<tr><td>No sales yet</td></tr>';
    },
  },

  analytics: {
    name: 'Analytics',
    icon: 'AN',
    color: '#58b8f0',
    render: () => `<div class="app-an">
      <div class="an-top">
        <div><small>BANK</small><b class="an-bank"></b></div>
        <div><small>INCOME</small><b class="an-in p"></b></div>
        <div><small>EXPENSES</small><b class="an-out n"></b></div>
        <div><small>PROFIT</small><b class="an-net"></b></div>
      </div>
      <h3>Money in and out, every 30 seconds</h3>
      <canvas class="an-chart" width="760" height="260"></canvas>
      <div class="an-legend">${Object.entries(CATEGORIES).map(([, c]) => `<span><i style="background:${c.color}"></i>${c.label}</span>`).join('')}</div>
      <div class="an-cols">
        <section><h3>Totals by category</h3><canvas class="an-bars" width="360" height="190"></canvas></section>
        <section><h3>Staff</h3><table class="an-staff"></table></section>
      </div>
    </div>`,
    live(view, { state }) {
      const tot = state.totals;
      const income = Object.entries(CATEGORIES).filter(([, c]) => c.income).reduce((s, [k]) => s + tot[k], 0);
      const out = Object.entries(CATEGORIES).filter(([, c]) => !c.income).reduce((s, [k]) => s + tot[k], 0);
      const set = (s, v) => { const el = view.querySelector(s); if (el) el.textContent = v; };
      set('.an-bank', money(state.money));
      set('.an-in', money(income));
      set('.an-out', money(out));
      set('.an-net', money(income - out));
      view.querySelector('.an-net').className = 'an-net ' + (income >= out ? 'p' : 'n');
      drawTimeline(view.querySelector('.an-chart'), state.history);
      drawTotals(view.querySelector('.an-bars'), tot);
      view.querySelector('.an-staff').innerHTML = state.staff.map((s) => `<tr><td>${esc(s.role)}</td><td>${money(s.wage)}/min</td></tr>`).join('')
        + `<tr><td><b>Animals (${state.animalCount})</b></td><td>${money(state.animalCount * 2)}/min</td></tr>`;
    },
  },
};

const INK = '#1f2a1c';

// Stacked bars per time bucket: income above the line, spending below.
function drawTimeline(cv, hist) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const pad = { l: 56, r: 10, t: 10, b: 22 };
  const keys = Object.keys(CATEGORIES);
  const up = (b) => keys.filter((k) => CATEGORIES[k].income).reduce((s, k) => s + b[k], 0);
  const dn = (b) => keys.filter((k) => !CATEGORIES[k].income).reduce((s, k) => s + b[k], 0);
  const max = Math.max(50, ...hist.map(up), ...hist.map(dn));
  const zero = pad.t + (H - pad.t - pad.b) / 2;
  const sy = (H - pad.t - pad.b) / 2 / max;
  g.font = '600 11px Inter, system-ui';
  g.fillStyle = '#6b6b6b';
  g.textAlign = 'right';
  for (const v of [max, max / 2, 0, -max / 2, -max]) {
    const y = zero - v * sy;
    g.fillText(money(v), pad.l - 6, y + 4);
    g.strokeStyle = v === 0 ? INK : 'rgba(0,0,0,.08)';
    g.lineWidth = v === 0 ? 2 : 1;
    g.beginPath(); g.moveTo(pad.l, y); g.lineTo(W - pad.r, y); g.stroke();
  }
  const n = 24, bw = (W - pad.l - pad.r) / n;
  hist.forEach((b, i) => {
    const x = pad.l + (n - hist.length + i) * bw + 3;
    let yu = zero, yd = zero;
    for (const k of keys) {
      const h = b[k] * sy;
      if (!h) continue;
      g.fillStyle = CATEGORIES[k].color;
      if (CATEGORIES[k].income) { yu -= h; g.fillRect(x, yu, bw - 6, h); }
      else { g.fillRect(x, yd, bw - 6, h); yd += h; }
    }
  });
  g.textAlign = 'center';
  g.fillStyle = '#6b6b6b';
  g.fillText('now', W - pad.r - bw / 2, H - 6);
  g.fillText(`${hist.length * 30 >= 60 ? Math.round(hist.length / 2) + ' min' : hist.length * 30 + 's'} ago`, pad.l + (n - hist.length) * bw + bw / 2, H - 6);
}

// Horizontal bars for the running total of each category.
function drawTotals(cv, tot) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const keys = Object.keys(CATEGORIES);
  const max = Math.max(1, ...keys.map((k) => tot[k]));
  const rh = H / keys.length;
  g.font = '700 12px Inter, system-ui';
  keys.forEach((k, i) => {
    const y = i * rh;
    g.fillStyle = INK;
    g.textAlign = 'left';
    g.fillText(CATEGORIES[k].label, 0, y + rh * 0.62);
    const w = (W - 170) * (tot[k] / max);
    g.fillStyle = CATEGORIES[k].color;
    g.beginPath(); g.roundRect(100, y + 4, Math.max(2, w), rh - 8, 4); g.fill();
    g.fillStyle = INK;
    g.fillText(money(tot[k]), 106 + w, y + rh * 0.62);
  });
}
