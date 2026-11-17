import { sfx } from '../audio.js';

// The cash register at the ticket window. Put a customer's cash in it (hold the notes, press E on
// the register) and it opens: work out their change (there's a calculator), click zoo dollars out of
// the drawer into the change tray, then hand it over. Loose cash with no customer just gets banked.

const BILLS = [
  { v: 20, name: 'Lion', color: '#f2a33a', ink: '#6b3b05' },
  { v: 10, name: 'Elephant', color: '#7f9cc4', ink: '#22344d' },
  { v: 5, name: 'Penguin', color: '#38b8ad', ink: '#0d3f3b' },
  { v: 1, name: 'Monkey', color: '#7cc466', ink: '#1f4a16' },
];

// Little animal portraits for the notes (simple shapes, no text).
const FACES = {
  Lion: `<circle cx="20" cy="20" r="17" fill="#b5651d"/><circle cx="20" cy="21" r="11" fill="#f5c26b"/><circle cx="16" cy="19" r="1.6" fill="#222"/><circle cx="24" cy="19" r="1.6" fill="#222"/><path d="M17 25 q3 3 6 0" stroke="#222" stroke-width="1.4" fill="none"/><ellipse cx="20" cy="23" rx="2" ry="1.4" fill="#5a3410"/>`,
  Elephant: `<ellipse cx="9" cy="19" rx="7" ry="10" fill="#9aa3ad"/><ellipse cx="31" cy="19" rx="7" ry="10" fill="#9aa3ad"/><circle cx="20" cy="18" r="10" fill="#b8c0c8"/><rect x="18" y="22" width="4" height="13" rx="2" fill="#b8c0c8"/><circle cx="16" cy="16" r="1.5" fill="#222"/><circle cx="24" cy="16" r="1.5" fill="#222"/>`,
  Penguin: `<ellipse cx="20" cy="21" rx="12" ry="15" fill="#22252b"/><ellipse cx="20" cy="24" rx="8" ry="11" fill="#f4f4f0"/><circle cx="16.5" cy="15" r="1.6" fill="#fff"/><circle cx="23.5" cy="15" r="1.6" fill="#fff"/><path d="M17.5 19 l2.5 3 l2.5 -3z" fill="#f29a2e"/>`,
  Monkey: `<circle cx="8" cy="18" r="5" fill="#7a4a2a"/><circle cx="32" cy="18" r="5" fill="#7a4a2a"/><circle cx="20" cy="19" r="12" fill="#8b5a33"/><ellipse cx="20" cy="22" rx="8" ry="7" fill="#e8c39e"/><circle cx="16.5" cy="17" r="1.5" fill="#222"/><circle cx="23.5" cy="17" r="1.5" fill="#222"/><path d="M17 25 q3 2 6 0" stroke="#222" stroke-width="1.3" fill="none"/>`,
};

const billHTML = (b, extra = '') => `<button class="rg-bill" data-v="${b.v}" style="--c:${b.color};--ink:${b.ink}" ${extra}>
  <span class="rg-denom">$${b.v}</span><svg viewBox="0 0 40 40">${FACES[b.name]}</svg><span class="rg-denom r">$${b.v}</span><small>${b.name}</small></button>`;

export class Register {
  constructor(game) {
    this.game = game;
    this.cash = null; // the notes being rung up
    this.tray = [];
    this.calc = { shown: '0', acc: null, op: null, fresh: true };
    const el = (this.el = document.createElement('div'));
    el.id = 'register';
    el.innerHTML = `<div class="rg-box">
      <div class="rg-head"><b>Zoo Register</b><button class="rg-x" title="Close (Esc)">X</button></div>
      <div class="rg-main">
        <div class="rg-left">
          <div class="rg-order"></div>
          <div class="rg-drawer">${BILLS.map((b) => `<div class="rg-slot">${billHTML(b)}<div class="rg-stack" style="--c:${b.color}"></div></div>`).join('')}</div>
          <div class="rg-traywrap"><div class="rg-traylabel">Change tray <span class="rg-traysum">$0</span></div><div class="rg-tray"></div></div>
          <div class="rg-actions"><button class="rg-clear">Clear tray</button><button class="rg-give">Give change</button></div>
        </div>
        <div class="rg-calc">
          <div class="rg-disp">0</div>
          <div class="rg-keys">${['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', 'C', '0', '=', '+'].map((k) => `<button data-k="${k}" class="${/[0-9]/.test(k) ? '' : 'op'}">${k}</button>`).join('')}</div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(el);
    el.querySelector('.rg-x').onclick = () => this.close();
    el.querySelector('.rg-drawer').onclick = (e) => {
      const b = e.target.closest('.rg-bill');
      if (!b) return;
      this.tray.push(+b.dataset.v);
      sfx.click();
      this.render();
    };
    el.querySelector('.rg-tray').onclick = (e) => {
      const b = e.target.closest('.rg-bill');
      if (!b) return;
      this.tray.splice(+b.dataset.i, 1);
      this.render();
    };
    el.querySelector('.rg-clear').onclick = () => { this.tray = []; this.render(); };
    el.querySelector('.rg-give').onclick = () => this.give();
    el.querySelector('.rg-keys').onclick = (e) => { const k = e.target.closest('[data-k]'); if (k) this.key(k.dataset.k); };
    addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); this.close(); return; }
      const map = { '/': '÷', '*': '×', x: '×', '-': '−', '+': '+', Enter: '=', '=': '=', Backspace: 'C', c: 'C' };
      const k = /^[0-9]$/.test(e.key) ? e.key : map[e.key];
      if (k) { e.preventDefault(); this.key(k); }
    });
  }

  get isOpen() { return this.el.classList.contains('open'); }

  open(cashItem) {
    const g = this.game;
    if (cashItem && !cashItem.payer?.awaitingPayment) {
      // loose notes: straight into the drawer
      const n = cashItem.value ?? 15;
      g.items.remove(cashItem);
      g.state.deposit(n);
      sfx.cash();
      this.onSale?.(['DEPOSIT', `+$${n}`]);
      return;
    }
    if (cashItem) { this.cash = cashItem; g.items.remove(cashItem); }
    this.tray = [];
    this.prevMode = g.mode;
    g.mode = 'register';
    if (document.pointerLockElement) document.exitPointerLock();
    this.el.classList.add('open');
    sfx.cash();
    this.render();
  }

  close() {
    const g = this.game;
    if (!this.isOpen) return;
    // closing mid-sale puts the customer's notes back on the counter
    if (this.cash) {
      const t = g.gate.trayAt;
      const it = g.items.spawn('cash', t.x, t.y, t.z, { value: this.cash.value });
      it.value = this.cash.value;
      it.payer = this.cash.payer;
      this.cash = null;
    }
    this.el.classList.remove('open');
    g.mode = 'resuming';
    g.canvas.requestPointerLock()?.catch?.(() => {});
  }

  render() {
    const el = this.el, v = this.cash?.payer;
    const sum = this.tray.reduce((a, b) => a + b, 0);
    el.querySelector('.rg-order').innerHTML = v
      ? `<div class="rg-line"><span>${v.n} ticket${v.n > 1 ? 's' : ''} at $${this.game.state.ticketPrice}</span><b>$${v.total}</b></div>
         <div class="rg-line"><span>${v.name} paid</span><b>$${this.cash.value}</b></div>
         <div class="rg-line due"><span>Change to give</span><b>?</b></div>`
      : `<div class="rg-line"><span>No sale open. Bring a customer's cash here to ring it up.</span></div>`;
    el.querySelector('.rg-tray').innerHTML = this.tray.map((d, i) => billHTML(BILLS.find((b) => b.v === d), `data-i="${i}"`)).join('');
    el.querySelector('.rg-traysum').textContent = `$${sum}`;
    el.querySelector('.rg-give').disabled = !v;
    el.querySelector('.rg-clear').disabled = !this.tray.length;
  }

  give() {
    const g = this.game, v = this.cash?.payer;
    if (!v) return;
    const due = this.cash.value - v.total;
    const given = this.tray.reduce((a, b) => a + b, 0);
    g.state.sellTickets(v.n, false);
    g.state.changeError(due - given);
    const diff = given - due;
    if (diff === 0) { v.say('Perfect, thanks!', '#b6ffb0'); g.state.addHype(0.4); }
    else if (diff > 0) { v.say(`Ooh, $${diff} extra!`, '#ffd34d'); }
    else { v.say(`Hey! I'm $${-diff} short!`, '#ffb0a0'); g.state.addHype(-1); }
    this.onSale?.(['SALE', `$${v.total}  change $${given}`]);
    this.cash = null;
    this.tray = [];
    v.paidUp();
    this.close();
  }

  key(k) {
    const c = this.calc;
    const val = () => parseFloat(c.shown);
    const run = (a, b, op) => (op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : op === '÷' ? (b ? a / b : 0) : b);
    if (/[0-9]/.test(k)) { c.shown = c.fresh || c.shown === '0' ? k : (c.shown + k).slice(0, 10); c.fresh = false; }
    else if (k === 'C') { c.shown = '0'; c.acc = null; c.op = null; c.fresh = true; }
    else if (k === '=') { if (c.op) { c.shown = String(+run(c.acc, val(), c.op).toFixed(2)); c.acc = null; c.op = null; c.fresh = true; } }
    else { if (c.op && !c.fresh) c.shown = String(+run(c.acc, val(), c.op).toFixed(2)); c.acc = val(); c.op = k; c.fresh = true; }
    this.el.querySelector('.rg-disp').textContent = c.shown + (c.op && c.fresh ? ` ${c.op}` : '');
    sfx.click();
  }
}
