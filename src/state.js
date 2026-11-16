import { clamp } from './util/math.js';

// Money categories, for the analytics app. Income first, then expenses.
export const CATEGORIES = {
  tickets: { label: 'Tickets', color: '#7cd05a', income: true },
  other: { label: 'Other income', color: '#58b8f0', income: true },
  staff: { label: 'Staff', color: '#ff8a3d' },
  animals: { label: 'Animal care', color: '#e2523c' },
  supplies: { label: 'Supplies', color: '#b06fd8' },
  marketing: { label: 'Marketing', color: '#ffd34d' },
  repairs: { label: 'Repairs', color: '#8a8a8a' },
};
const STAFF = [{ role: 'Keeper', wage: 18 }, { role: 'Keeper', wage: 18 }, { role: 'Janitor', wage: 12 }, { role: 'Gate clerk', wage: 10 }];
const BUCKET = 30; // seconds of game time per analytics bar

// Shared zoo economy. In multiplayer this is the object the host owns and syncs.
// money = the bank account; cash = notes visitors have handed over that still need depositing at the ATM.
export class GameState {
  constructor() {
    this.money = 500;
    this.cash = 0;
    this.hype = 12;
    this.ticketPrice = 15;
    this.ticketsSold = 0;
    this.revenue = 0;
    this.poop = 0;
    this.staff = STAFF;
    this.animalCount = 0;
    this.log = [{ time: Date.now(), label: 'Starting funds', amount: 500, cat: 'other' }];
    this.totals = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, 0]));
    this.history = [this.newBucket(0)];
    this.listeners = new Set();
    this.clock = 0;
    this.payroll = 0;
  }

  newBucket(t) { return { t, ...Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, 0])) }; }

  on(fn) { this.listeners.add(fn); }
  emit() { for (const fn of this.listeners) fn(this); }

  get cleanliness() { return clamp(Math.round(100 - this.poop * 7), 0, 100); }

  // Visitors per minute who turn up at the gate.
  get demand() {
    const priceFactor = clamp(1.5 - this.ticketPrice / 30, 0.05, 1.5);
    return this.hype * 0.45 * Math.pow(this.cleanliness / 100, 1.5) * priceFactor;
  }

  record(label, amount, cat) {
    this.log.unshift({ time: Date.now(), label, amount, cat });
    this.log.length = Math.min(this.log.length, 80);
    this.totals[cat] += Math.abs(amount);
    this.history[this.history.length - 1][cat] += Math.abs(amount);
  }

  earn(amount, label, cat = 'other') {
    this.money += amount;
    this.record(label, amount, cat);
    this.emit();
  }

  // Spending can push the account negative only for bills (wages, upkeep), never for purchases.
  spend(amount, label, cat = 'supplies', { bill = false } = {}) {
    if (amount > this.money && !bill) return false;
    this.money -= amount;
    this.record(label, -amount, cat);
    this.emit();
    return true;
  }

  // A visitor paid for a ticket: card goes straight to the bank, cash goes in the till.
  sellTicket(byCard) {
    const p = this.ticketPrice;
    this.ticketsSold++;
    this.revenue += p;
    if (byCard) this.earn(p, 'Ticket (card)', 'tickets');
    else { this.cash += p; this.record('Ticket (cash)', p, 'tickets'); this.emit(); }
    return p;
  }

  // Notes fed into the ATM move from cash on hand to the bank.
  deposit(n) {
    if (n <= 0) return 0;
    this.cash = Math.max(0, this.cash - n);
    this.money += n;
    this.log.unshift({ time: Date.now(), label: 'ATM cash deposit', amount: n, cat: 'deposit' });
    this.emit();
    return n;
  }

  addHype(n) { this.hype = clamp(this.hype + n, 0, 400); this.emit(); }
  setPoop(n) { if (n !== this.poop) { this.poop = n; this.emit(); } }
  setPrice(p) { this.ticketPrice = clamp(Math.round(p), 1, 80); this.emit(); }

  update(dt) {
    this.clock += dt;
    const cur = this.history[this.history.length - 1];
    if (this.clock - cur.t >= BUCKET) {
      this.history.push(this.newBucket(cur.t + BUCKET));
      if (this.history.length > 24) this.history.shift();
    }
    // Every minute: pay the staff and feed the animals.
    this.payroll += dt;
    if (this.payroll >= 60) {
      this.payroll -= 60;
      const wages = this.staff.reduce((s, p) => s + p.wage, 0);
      this.spend(wages, `Wages (${this.staff.length} staff)`, 'staff', { bill: true });
      if (this.animalCount) this.spend(this.animalCount * 2, `Animal upkeep (${this.animalCount})`, 'animals', { bill: true });
      this.hype = Math.max(5, this.hype * 0.97);
      this.emit();
    }
  }
}
