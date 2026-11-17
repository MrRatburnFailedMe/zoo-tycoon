import { SITES, BOOKMARKS, notFound } from './sites.js';
import { sfx } from '../audio.js';

const HOME = 'zoogle.zoo';

function normalize(input) {
  const s = input.trim();
  if (!s) return `https://${HOME}/`;
  if (/^https?:\/\//i.test(s)) return s;
  if (!/\s/.test(s) && /\.[a-z]{2,}(\/|\?|$|:)/i.test(s)) return `https://${s}`;
  return `https://${HOME}/search?q=${encodeURIComponent(s)}`;
}

function display(url) {
  const u = new URL(url);
  if (u.hostname.endsWith('.zoo')) return u.hostname + (u.pathname === '/' ? '' : u.pathname) + u.search;
  return url;
}

// A small tabbed browser. *.zoo hosts are the in-game "Zoonet"; anything else loads in an iframe.
export class Browser {
  constructor(root, game, onChange) {
    this.root = root;
    this.game = game;
    this.onChange = onChange;
    this.tabs = [];
    this.active = null;
    this.seq = 0;
    const q = (s) => root.querySelector(s);
    this.el = { tabs: q('.b-tabs'), addr: q('.b-addr'), form: q('.b-form'), view: q('.b-view'), progress: q('.b-progress'), bookmarks: q('.b-bookmarks'), lock: q('.lock') };

    q('.b-newtab').addEventListener('click', () => this.newTab(HOME));
    root.querySelector('[data-nav="back"]').addEventListener('click', () => this.go(-1));
    root.querySelector('[data-nav="fwd"]').addEventListener('click', () => this.go(1));
    root.querySelector('[data-nav="reload"]').addEventListener('click', () => this.render());
    root.querySelector('[data-nav="home"]').addEventListener('click', () => this.navigate(HOME));
    this.el.form.addEventListener('submit', (e) => { e.preventDefault(); this.navigate(this.el.addr.value); this.el.addr.blur(); });
    this.el.addr.addEventListener('focus', () => this.el.addr.select());

    this.el.bookmarks.innerHTML = BOOKMARKS.map((b) => `<button class="b-bm" data-href="${b.url}"><i style="background:${b.color}"></i>${b.name}</button>`).join('');
    this.el.bookmarks.querySelectorAll('[data-href]').forEach((b) => b.addEventListener('click', () => this.navigate(b.dataset.href)));

    // Generic link handling inside pages.
    this.el.view.addEventListener('click', (e) => {
      const a = e.target.closest('[data-href]');
      if (a) { e.preventDefault(); this.navigate(a.dataset.href); }
    });

    this.ctx = {
      state: game.state,
      game,
      go: (url) => this.navigate(url),
      toast: (t, k) => game.hud.toast(t, k),
      sfx,
    };
    game.state.on(() => this.live());
    setInterval(() => this.live(), 1000); // countdowns (ZooMart delivery) tick even when money doesn't change
    this.newTab(HOME);
  }

  get tab() { return this.active; }
  currentUrl() { const t = this.tab; return t ? display(t.history[t.index]) : ''; }
  currentTitle() { return this.tab ? this.tab.title : ''; }

  newTab(url) {
    const tab = { id: ++this.seq, history: [], index: -1, title: 'New Tab', color: '#ccc' };
    this.tabs.push(tab);
    this.active = tab;
    this.navigate(url);
  }

  closeTab(tab) {
    const i = this.tabs.indexOf(tab);
    this.tabs.splice(i, 1);
    if (!this.tabs.length) return this.newTab(HOME);
    if (this.active === tab) this.active = this.tabs[Math.max(0, i - 1)];
    this.render();
  }

  navigate(input) {
    const url = normalize(input);
    const t = this.tab;
    t.history = t.history.slice(0, t.index + 1);
    t.history.push(url);
    t.index++;
    this.render();
  }

  go(delta) {
    const t = this.tab;
    const i = t.index + delta;
    if (i < 0 || i >= t.history.length) return;
    t.index = i;
    this.render();
  }

  render() {
    const t = this.tab;
    const url = t.history[t.index];
    const u = new URL(url);
    const view = this.el.view;
    this.site = null;
    if (u.hostname.endsWith('.zoo')) {
      const site = SITES[u.hostname];
      if (site) {
        this.site = site;
        this.siteUrl = u;
        view.innerHTML = `<div class="site">${site.render(u, this.ctx)}</div>`;
        site.bind?.(view, this.ctx, u);
        t.title = site.title(u);
        t.color = site.color;
      } else {
        view.innerHTML = notFound(u.hostname);
        t.title = u.hostname;
        t.color = '#bbb';
      }
      this.el.lock.textContent = 'S';
    } else {
      view.innerHTML = `<div class="ext-note">Real web page. Some sites refuse to load inside other pages; if this stays blank, that's why.</div>`;
      const frame = document.createElement('iframe');
      frame.src = url;
      frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
      view.appendChild(frame);
      t.title = u.hostname.replace(/^www\./, '');
      t.color = '#9aa4ad';
      this.el.lock.textContent = u.protocol === 'https:' ? 'S' : '!';
    }
    view.scrollTop = 0;
    this.el.addr.value = display(url);
    this.root.querySelector('[data-nav="back"]').disabled = t.index <= 0;
    this.root.querySelector('[data-nav="fwd"]').disabled = t.index >= t.history.length - 1;
    this.el.progress.classList.remove('go');
    void this.el.progress.offsetWidth;
    this.el.progress.classList.add('go');
    this.renderTabs();
    this.onChange();
  }

  renderTabs() {
    this.el.tabs.innerHTML = '';
    for (const tab of this.tabs) {
      const d = document.createElement('div');
      d.className = `b-tab${tab === this.active ? ' active' : ''}`;
      d.innerHTML = `<i class="fav" style="background:${tab.color}"></i><span class="t"></span><button class="x" title="Close">&#x2715;</button>`;
      d.querySelector('.t').textContent = tab.title;
      d.addEventListener('click', () => { if (this.active !== tab) { this.active = tab; this.render(); } });
      d.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); this.closeTab(tab); });
      this.el.tabs.appendChild(d);
    }
  }

  // Refresh live numbers on the current page when the economy changes.
  live() {
    if (this.site?.live) this.site.live(this.el.view, this.ctx, this.siteUrl);
  }
}
