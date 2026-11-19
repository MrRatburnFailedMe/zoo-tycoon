import { sfx } from '../audio.js';
import { BILLS, billOf, billSVG, notesFor } from '../money.js';

// The cash register, seen from above with the drawer open (think supermarket checkout).
//  1. Click the register while holding a customer's cash: their notes land on the counter (left).
//     Drag each note into the slot it belongs in ($20 lion, $10 elephant, $5 penguin, $1 monkey).
//  2. Punch in how many tickets they want on the keypad. The screen works out the change.
//  3. Click notes in the drawer to count the change out into the change tray.
//  4. PRINT: the printer spits out the tickets, tied with a rubber band, and the change goes in
//     your hand. Click the customer while holding each to hand them over.
// Click the register empty-handed to print tickets for a card customer (swipe their card too).

const START = { 20: 4, 10: 8, 5: 10, 1: 25 };

const noteHTML = (v, attrs = '') => `<div class="rg-note" data-v="${v}" ${attrs}>${billSVG(billOf(v))}</div>`;

export class Register {
  constructor(game) {
    this.game = game;
    this.drawer = { ...START };
    this.counter = []; // notes from the customer still to be sorted
    this.tray = []; // change counted out
    this.n = 0; // tickets punched in
    this.sale = null; // { payer, value }
    const el = (this.el = document.createElement('div'));
    el.id = 'register';
    el.innerHTML = `<div class="rg-box">
      <div class="rg-head"><b>Zoo Register 3000</b><span class="rg-sub">drag the moolah into the right holes!</span><button class="rg-x" title="Close (Esc)">X</button></div>
      <div class="rg-top">
        <div class="rg-counter"><div class="rg-label">Customer's money</div><div class="rg-cash"></div></div>
        <div class="rg-screen"><div class="rg-lines"></div></div>
        <div class="rg-pad">
          <div class="rg-label">How many tickets?</div>
          <div class="rg-keys">${[1, 2, 3, 4, 5, 6, 7, 8].map((k) => `<button data-n="${k}">${k}</button>`).join('')}<button data-n="0" class="clr">CLR</button></div>
          <button class="rg-print">PRINT!</button>
        </div>
      </div>
      <div class="rg-drawer">${BILLS.map((b) => `<div class="rg-slot" data-v="${b.v}"><div class="rg-pile"></div><div class="rg-count"></div></div>`).join('')}</div>
      <div class="rg-traywrap"><div class="rg-label">Change tray <b class="rg-traysum">$0</b> <span class="rg-hint">(click notes in the drawer to add, click here to put back)</span></div><div class="rg-tray"></div></div>
    </div>`;
    document.body.appendChild(el);
    el.querySelector('.rg-x').onclick = () => this.close();
    el.querySelector('.rg-keys').onclick = (e) => { const k = e.target.closest('[data-n]'); if (!k) return; this.n = +k.dataset.n; sfx.click(); this.render(); };
    el.querySelector('.rg-print').onclick = () => this.print();
    el.querySelector('.rg-drawer').onclick = (e) => {
      const s = e.target.closest('.rg-slot');
      if (!s || this.dragging) return;
      const v = +s.dataset.v;
      if (this.drawer[v] <= 0) { sfx.error?.(); return; }
      this.drawer[v]--;
      this.tray.push(v);
      sfx.click();
      this.render();
    };
    el.querySelector('.rg-tray').onclick = (e) => {
      const n = e.target.closest('.rg-note');
      if (!n) return;
      const v = +n.dataset.v;
      this.tray.splice(+n.dataset.i, 1);
      this.drawer[v]++;
      sfx.click();
      this.render();
    };
    // drag a customer's note into a drawer slot
    el.querySelector('.rg-cash').addEventListener('pointerdown', (e) => {
      const n = e.target.closest('.rg-note');
      if (!n) return;
      e.preventDefault();
      const i = +n.dataset.i, v = this.counter[i];
      const ghost = n.cloneNode(true);
      ghost.classList.add('rg-ghost');
      document.body.appendChild(ghost);
      n.style.visibility = 'hidden';
      const move = (ev) => { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; };
      move(e);
      this.dragging = true;
      const up = (ev) => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        ghost.remove();
        setTimeout(() => (this.dragging = false), 0);
        const slot = document.elementsFromPoint(ev.clientX, ev.clientY).find((x) => x.classList?.contains('rg-slot'));
        if (slot && +slot.dataset.v === v) {
          this.counter.splice(i, 1);
          this.drawer[v]++;
          sfx.cash?.();
        } else {
          n.style.visibility = '';
          if (slot) { sfx.error?.(); slot.classList.add('nope'); setTimeout(() => slot.classList.remove('nope'), 400); this.flash(`Nope! That's not a $${slot.dataset.v} hole!`); }
        }
        this.render();
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    });
    addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); this.close(); return; }
      if (/^[0-8]$/.test(e.key)) { this.n = +e.key; sfx.click(); this.render(); }
      if (e.key === 'Enter') this.print();
    });
  }

  get isOpen() { return this.el.classList.contains('open'); }

  open(cashItem) {
    const g = this.game;
    if (cashItem?.isChange) return; // change you already counted out: hand it to the customer
    if (cashItem && !cashItem.payer?.awaitingPayment) {
      // loose notes: straight into the drawer
      const n = cashItem.value ?? 15;
      for (const v of notesFor(n)) this.drawer[v] = (this.drawer[v] || 0) + 1;
      g.items.remove(cashItem);
      g.state.deposit(n);
      sfx.cash();
      this.onSale?.(['DEPOSIT', `+$${n}`]);
      return;
    }
    if (cashItem) {
      this.sale = { payer: cashItem.payer, value: cashItem.value };
      this.counter = notesFor(cashItem.value);
      this.n = 0;
      g.items.remove(cashItem);
    } else if (!this.sale) this.n = 0;
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
    // walking away mid-sale: the customer's notes and any counted change go back where they were
    if (this.sale) {
      const t = g.gate.trayAt;
      const back = this.sale.value;
      // whatever was already sorted comes back out of the drawer
      for (const v of notesFor(back)) this.drawer[v] = Math.max(0, this.drawer[v] - 1);
      for (const v of this.counter) this.drawer[v]++;
      const it = g.items.spawn('cash', t.x, t.y, t.z, { value: back });
      it.value = back;
      it.payer = this.sale.payer;
      this.sale = null;
      this.counter = [];
    }
    for (const v of this.tray) this.drawer[v]++;
    this.tray = [];
    this.el.classList.remove('open');
    g.mode = 'resuming';
    g.canvas.requestPointerLock()?.catch?.(() => {});
  }

  flash(text) {
    const s = this.el.querySelector('.rg-sub');
    s.textContent = text;
    s.classList.add('warn');
    clearTimeout(this.flashT);
    this.flashT = setTimeout(() => { s.textContent = 'drag the moolah into the right holes!'; s.classList.remove('warn'); }, 1600);
  }

  render() {
    const el = this.el, price = this.game.state.ticketPrice;
    const v = this.sale?.payer;
    el.querySelector('.rg-cash').innerHTML = this.counter.length
      ? this.counter.map((d, i) => noteHTML(d, `data-i="${i}"`)).join('')
      : `<div class="rg-empty">${this.sale ? 'All sorted! Nice.' : 'No cash on the counter. Bring a customer\'s money here.'}</div>`;
    const total = this.n * price;
    const lines = [];
    lines.push(['TICKETS', `${this.n} x $${price}`]);
    lines.push(['TOTAL', `$${total}`]);
    if (v) {
      lines.push(['WANTS', `${v.n} ticket${v.n > 1 ? 's' : ''}`]);
      lines.push(['PAID', `$${this.sale.value}`]);
      const due = this.sale.value - v.total;
      lines.push([this.counter.length ? 'SORT IT!' : 'CHANGE', this.counter.length ? '...' : `$${Math.max(0, due)}`]);
    } else lines.push(['CARD?', 'swipe it!']);
    el.querySelector('.rg-lines').innerHTML = lines.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    for (const s of el.querySelectorAll('.rg-slot')) {
      const d = +s.dataset.v, c = this.drawer[d];
      s.querySelector('.rg-pile').innerHTML = c ? noteHTML(d) : '';
      s.querySelector('.rg-count').textContent = `x${c}`;
      s.classList.toggle('empty', !c);
    }
    el.querySelector('.rg-tray').innerHTML = this.tray.map((d, i) => noteHTML(d, `data-i="${i}"`)).join('');
    el.querySelector('.rg-traysum').textContent = `$${this.tray.reduce((a, b) => a + b, 0)}`;
    for (const b of el.querySelectorAll('.rg-keys [data-n]')) b.classList.toggle('on', +b.dataset.n === this.n && this.n > 0);
    el.querySelector('.rg-print').disabled = !this.n || this.counter.length > 0;
  }

  print() {
    const g = this.game;
    if (!this.n) { this.flash('Punch in how many tickets first!'); sfx.error?.(); return; }
    if (this.counter.length) { this.flash('Put the customer\'s money away first!'); sfx.error?.(); return; }
    const n = this.n, sale = this.sale, tray = this.tray;
    this.sale = null; this.counter = []; this.tray = []; this.n = 0;
    if (sale?.payer) {
      const v = sale.payer;
      g.state.sellTickets(v.n, false);
      v.changeDue = sale.value - v.total;
      this.onSale?.(['SALE', `$${v.total}`]);
      v.paidUp();
    }
    g.gate.printBundle(n);
    this.el.classList.remove('open');
    g.mode = 'resuming';
    g.canvas.requestPointerLock()?.catch?.(() => {});
    // the counted change goes straight into your hand
    if (tray.length) {
      const sum = tray.reduce((a, b) => a + b, 0);
      const p = g.camera.position;
      const it = g.items.spawn('cash', p.x, p.y - 0.3, p.z, { value: sum, notes: tray });
      it.value = sum;
      it.isChange = true;
      it.payer = sale?.payer || null;
      it.label = `Change ($${sum})`;
      g.grabber.grab({ entity: it, object: it.group, point: it.body.position.clone ? null : null, distance: 0.5 });
    }
  }
}
