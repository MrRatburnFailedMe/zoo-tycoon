// The in-game "Zoonet": fake websites the zookeepers use to run the business.
// Each site: { title(url), color, render(url, ctx) → html, bind?(view, ctx, url), live?(view, ctx, url) }

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `$${Math.round(n).toLocaleString()}`;

export const BOOKMARKS = [
  { name: 'Zoogle', url: 'zoogle.zoo', color: '#2f9e44' },
  { name: 'ZooAds', url: 'zooads.zoo', color: '#ff8a3d' },
  { name: 'TicketHub', url: 'tickethub.zoo', color: '#6c3fd1' },
  { name: 'ZooBank', url: 'bank.zoo', color: '#1e6091' },
  { name: 'ZooMart', url: 'zoomart.zoo', color: '#2fb38a' },
  { name: 'Zoopedia', url: 'zoopedia.zoo', color: '#555' },
];

const INDEX = [
  { url: 'zooads.zoo', title: 'ZooAds: Marketing for Zoos', desc: 'Buy flyers, radio jingles and billboards. More hype means more visitors.', tags: 'ads marketing hype advertise promote billboard radio' },
  { url: 'tickethub.zoo', title: 'TicketHub: Set your ticket price', desc: 'Control what visitors pay at the gate and see live sales.', tags: 'tickets price sell sales visitors gate' },
  { url: 'zoomart.zoo', title: 'ZooMart: Zoo supplies, delivered fast', desc: 'Animal feed, cleaning supplies, glass repair kits and more. Delivered by truck to your front gate.', tags: 'shop buy store feed food cleaning supplies order delivery truck cart' },
  { url: 'bank.zoo', title: 'ZooBank: Online Banking', desc: 'Check your balance and every transaction your zoo has made.', tags: 'bank money balance cash transactions' },
  { url: 'zoopedia.zoo', title: 'Zoopedia: The Free Animal Encyclopedia', desc: 'Facts about lions, penguins, elephants and their... output.', tags: 'animals lion penguin elephant facts wiki poop' },
  { url: 'zoopedia.zoo/poop', title: 'How to clean animal poop: Zoopedia', desc: 'Step 1: pick it up. Step 2: throw it in the dumpster. Step 3: wash hands (optional).', tags: 'poop clean dung cleanup dumpster' },
];

export function notFound(host) {
  return `<div class="nf"><div class="big">404</div><h2>This site can't be reached</h2>
    <p><b>${esc(host)}</b> isn't on the Zoonet. Try <a data-href="zoogle.zoo">Zoogle</a>, or type a real address like <i>wikipedia.org</i>.</p></div>`;
}

const LOGO = '<div class="zg-logo"><span>Z</span><span>o</span><span>o</span><span>g</span><span>l</span><span>e</span></div>';

const CAMPAIGNS = [
  { id: 'flyer', icon: 'FL', name: 'Photocopied Flyers', cost: 50, hype: 8, blurb: 'Staple them to every lamppost in town. Some may be upside down.' },
  { id: 'radio', icon: 'RA', name: 'Local Radio Jingle', cost: 150, hype: 25, blurb: '30 seconds of a guy yelling "ZOO!" over a kazoo.' },
  { id: 'billboard', icon: 'BB', name: 'Highway Billboard', cost: 400, hype: 70, blurb: 'A giant lion pointing at the exit ramp. Very persuasive.' },
  { id: 'goat', icon: 'GT', name: 'Influencer Goat', cost: 1000, hype: 200, blurb: 'A goat with 2M followers visits the zoo. Results not guaranteed.' },
];

// ZooMart catalogue: item type → price. Orders arrive by truck at the front gate.
export const PRODUCTS = [
  { type: 'feed', icon: 'FD', price: 30, desc: 'Feeds anything. Drop it in an enclosure.' },
  { type: 'fish', icon: 'FS', price: 20, desc: 'Penguins go wild for it.' },
  { type: 'bananas', icon: 'BN', price: 15, desc: 'Monkeys, gorillas, you.' },
  { type: 'haybale', icon: 'HY', price: 20, desc: 'Elephant and hippo snacks.' },
  { type: 'spray', icon: 'SP', price: 25, desc: 'Press F to dissolve nearby poop.' },
  { type: 'glasskit', icon: 'GK', price: 80, desc: 'Press F to fix every smashed pane.' },
  { type: 'ball', icon: 'BL', price: 10, desc: 'Bouncy. Throwable. Irresistible.' },
  { type: 'cone', icon: 'CN', price: 5, desc: 'Look official.' },
  { type: 'plant', icon: 'PL', price: 15, desc: 'Brightens up the place.' },
  { type: 'megaphone', icon: 'MG', price: 40, desc: 'Yell at people for hype.' },
];
const cart = {};

export const SITES = {
  'zoomart.zoo': {
    color: '#2fb38a',
    title: () => 'ZooMart: Shop',
    render(u, { state, game }) {
      const names = Object.fromEntries(PRODUCTS.map((p) => [p.type, game.itemName(p.type)]));
      return `<div class="zm"><h1>ZooMart</h1><p>Everything a zoo needs. Delivered to your front gate in 10–15 seconds by a very fast truck.</p>
        <div class="zm-wrap">
          <div class="zm-grid">${PRODUCTS.map((p) => `<div class="zm-card"><div class="ic">${p.icon}</div><h3>${esc(names[p.type])}</h3><p>${esc(p.desc)}</p><button data-add="${p.type}">Add · ${money(p.price)}</button></div>`).join('')}</div>
          <div class="zm-cart"><h3>Your cart</h3><div class="zm-rows"></div>
            <div class="zm-total"><span>Total</span><span class="zm-sum">$0</span></div>
            <button class="zm-checkout" disabled>Checkout</button>
            <div class="zm-status hidden"></div>
            <small>Balance: <b class="zm-bal">${money(state.money)}</b></small>
          </div>
        </div></div>`;
    },
    bind(view, ctx) {
      const draw = () => {
        const rows = Object.entries(cart).filter(([, n]) => n > 0);
        const sum = rows.reduce((s, [t, n]) => s + PRODUCTS.find((p) => p.type === t).price * n, 0);
        view.querySelector('.zm-rows').innerHTML = rows.length ? rows.map(([t, n]) => `<div class="row"><span>${esc(ctx.game.itemName(t))}</span><span><button data-dec="${t}">−</button> ${n} <button data-add="${t}">+</button></span></div>`).join('') : '<p>Empty. Go on, treat yourself.</p>';
        view.querySelector('.zm-sum').textContent = money(sum);
        view.querySelector('.zm-checkout').disabled = !rows.length || !ctx.game.delivery.canOrder();
        return sum;
      };
      view.addEventListener('click', (e) => {
        const add = e.target.closest('[data-add]'), dec = e.target.closest('[data-dec]');
        if (add) { cart[add.dataset.add] = (cart[add.dataset.add] || 0) + 1; ctx.sfx.click(); draw(); }
        if (dec) { cart[dec.dataset.dec] = Math.max(0, cart[dec.dataset.dec] - 1); draw(); }
      });
      view.querySelector('.zm-checkout').addEventListener('click', () => {
        const sum = draw();
        const list = Object.entries(cart).filter(([, n]) => n > 0).flatMap(([t, n]) => Array(n).fill(t));
        if (list.length > 24) { ctx.sfx.error(); this.say(view, 'Max 24 items per truck!'); return; }
        if (!ctx.state.spend(sum, `ZooMart order (${list.length} items)`, 'supplies')) { ctx.sfx.error(); this.say(view, 'Not enough money in the bank.'); return; }
        ctx.sfx.cash();
        ctx.game.delivery.order(list);
        for (const k of Object.keys(cart)) delete cart[k];
        draw();
      });
      draw();
    },
    say(view, text) { const s = view.querySelector('.zm-status'); s.classList.remove('hidden'); s.textContent = text; },
    live(view, ctx) {
      const st = ctx.game.delivery.status();
      const el = view.querySelector('.zm-status');
      if (el && st) { el.classList.remove('hidden'); el.textContent = st; }
      const bal = view.querySelector('.zm-bal');
      if (bal) bal.textContent = money(ctx.state.money);
    },
  },


  'zoogle.zoo': {
    color: '#2f9e44',
    title: (u) => (u.pathname.startsWith('/search') ? `${u.searchParams.get('q')} - Zoogle Search` : 'Zoogle'),
    render(u) {
      if (u.pathname.startsWith('/search')) {
        const q = u.searchParams.get('q') || '';
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        let hits = INDEX.filter((r) => words.some((w) => (r.title + ' ' + r.tags).toLowerCase().includes(w)));
        if (!hits.length) hits = INDEX;
        return `<div class="zg-results">
          <header>${LOGO}<form class="zg-search"><input name="q" value="${esc(q)}" /></form></header>
          <div class="zg-meta">About ${hits.length} result${hits.length > 1 ? 's' : ''} on the Zoonet (0.0${Math.floor(Math.random() * 9) + 1} seconds)</div>
          ${hits.map((r) => `<div class="zg-res"><div class="u">https://${r.url}</div><h3 data-href="${r.url}">${esc(r.title)}</h3><p>${esc(r.desc)}</p></div>`).join('')}
          <div class="zg-res"><p>Looking for the real internet? Type a full address (like <i>wikipedia.org</i>) into the address bar.</p></div>
        </div>`;
      }
      return `<div class="zg-home">${LOGO}
        <form class="zg-search"><span>Go</span><input name="q" placeholder="Search the Zoonet or type a URL" /></form>
        <div class="zg-btns"><button type="button" class="zg-go">Zoogle Search</button><button type="button" class="zg-wild">I'm Feeling Wild</button></div>
        <div class="zg-quick">${BOOKMARKS.slice(1).map((b) => `<div data-href="${b.url}"><i style="background:${b.color}">${b.name[0]}</i>${b.name}</div>`).join('')}</div>
      </div>`;
    },
    bind(view, ctx) {
      const form = view.querySelector('.zg-search');
      const input = form.querySelector('input');
      const submit = () => { if (input.value.trim()) ctx.go(input.value.includes('.') && !input.value.includes(' ') ? input.value : `zoogle.zoo/search?q=${encodeURIComponent(input.value)}`); };
      form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
      view.querySelector('.zg-go')?.addEventListener('click', submit);
      view.querySelector('.zg-wild')?.addEventListener('click', () => ctx.go(INDEX[Math.floor(Math.random() * INDEX.length)].url));
      if (!view.querySelector('.zg-results')) setTimeout(() => input.focus(), 50);
    },
  },

  'zooads.zoo': {
    color: '#ff8a3d',
    title: () => 'ZooAds: Campaigns',
    render(u, { state }) {
      return `<div class="za">
        <div class="za-hero"><h1>ZooAds</h1><p>Get butts in seats. Or on benches. Near animals.</p></div>
        <div class="za-stats">
          <div class="za-stat"><small>BALANCE</small><b class="za-bal">${money(state.money)}</b></div>
          <div class="za-stat"><small>HYPE</small><b class="za-hype">${Math.round(state.hype)}</b></div>
          <div class="za-stat"><small>EXPECTED VISITORS / MIN</small><b class="za-dem">${state.demand.toFixed(1)}</b></div>
        </div>
        <div class="za-grid">${CAMPAIGNS.map((c) => `
          <div class="za-card"><div class="ic">${c.icon}</div><h3>${c.name}</h3><p>${c.blurb}</p>
            <div class="row"><span class="cost">${money(c.cost)}</span><span class="hy">+${c.hype} hype</span></div>
            <button data-buy="${c.id}">Launch campaign</button></div>`).join('')}
        </div></div>`;
    },
    bind(view, ctx) {
      view.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
        const c = CAMPAIGNS.find((x) => x.id === b.dataset.buy);
        if (ctx.state.spend(c.cost, `Ad: ${c.name}`, 'marketing')) {
          ctx.state.addHype(c.hype);
          ctx.sfx.cash();
          ctx.toast(`Campaign launched: ${c.name} (+${c.hype} hype)`, 'info');
        } else {
          ctx.sfx.error();
          ctx.toast(`Not enough money for ${c.name}`, 'bad');
        }
      }));
    },
    live(view, { state }) {
      const set = (s, v) => { const el = view.querySelector(s); if (el) el.textContent = v; };
      set('.za-bal', money(state.money));
      set('.za-hype', Math.round(state.hype));
      set('.za-dem', state.demand.toFixed(1));
    },
  },

  'tickethub.zoo': {
    color: '#6c3fd1',
    title: () => 'TicketHub: Dashboard',
    render(u, { state }) {
      return `<div class="th"><h1>TicketHub</h1><p>Set the gate price. Cheap tickets bring crowds, expensive ones bring... fewer crowds.</p>
        <div class="panel"><small>TICKET PRICE</small><div class="price">${money(state.ticketPrice)}</div>
          <input type="range" min="1" max="80" value="${state.ticketPrice}" class="th-range" /></div>
        <div class="panel grid">
          <div><small>TICKETS SOLD</small><b class="th-sold">${state.ticketsSold}</b></div>
          <div><small>TICKET REVENUE</small><b class="th-rev">${money(state.revenue)}</b></div>
          <div><small>VISITORS / MIN</small><b class="th-dem">${state.demand.toFixed(1)}</b></div>
          <div><small>HYPE</small><b class="th-hype">${Math.round(state.hype)}</b></div>
          <div><small>CLEANLINESS</small><b class="th-clean">${state.cleanliness}%</b></div>
          <div><small>POOPS ON SITE</small><b class="th-poop">${state.poop}</b></div>
        </div></div>`;
    },
    bind(view, { state }) {
      const r = view.querySelector('.th-range');
      r.addEventListener('input', () => { state.setPrice(+r.value); view.querySelector('.price').textContent = money(state.ticketPrice); });
    },
    live(view, { state }) {
      const set = (s, v) => { const el = view.querySelector(s); if (el) el.textContent = v; };
      set('.th-sold', state.ticketsSold);
      set('.th-rev', money(state.revenue));
      set('.th-dem', state.demand.toFixed(1));
      set('.th-hype', Math.round(state.hype));
      set('.th-clean', `${state.cleanliness}%`);
      set('.th-poop', state.poop);
    },
  },

  'bank.zoo': {
    color: '#1e6091',
    title: () => 'ZooBank: Accounts',
    render(u, { state }) {
      const rows = state.log.slice(0, 25).map((e) => `<tr><td class="t">${new Date(e.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</td><td>${esc(e.label)}</td><td class="${e.amount >= 0 ? 'p' : 'n'}">${e.amount >= 0 ? '+' : '−'}${money(Math.abs(e.amount))}</td></tr>`).join('');
      return `<div class="bk"><h1>ZooBank</h1>
        <div class="bk-card"><small>ZOO OPERATING ACCOUNT</small><div class="bal">${money(state.money)}</div><small>Account •••• 4242</small></div>
        <table>${rows}</table></div>`;
    },
    live(view, ctx, u) { view.innerHTML = `<div class="site">${this.render(u, ctx)}</div>`; },
  },

  'zoopedia.zoo': {
    color: '#555',
    title: (u) => `${PAGES[u.pathname.slice(1)]?.title || 'Zoopedia'}: Zoopedia`,
    render(u) {
      const page = PAGES[u.pathname.slice(1)] || PAGES[''];
      return `<div class="zp"><nav>${Object.entries(PAGES).map(([k, p]) => `<a data-href="zoopedia.zoo/${k}">${p.title}</a>`).join('')}</nav>
        <h1>${page.title}</h1>${page.body}</div>`;
    },
  },
};

const PAGES = {
  '': { title: 'Main Page', body: '<p>Welcome to <b>Zoopedia</b>, the encyclopedia anyone can edit (please don\'t).</p><p>Pick an article above.</p>' },
  lion: { title: 'Lion', body: '<p>The lion is a large cat that spends up to 20 hours a day resting. Your lions are no exception.</p><p>Lions live in groups called <i>prides</i>. A group of zookeepers is called <i>understaffed</i>.</p>' },
  penguin: { title: 'Penguin', body: '<p>Penguins are flightless birds that are excellent swimmers. They waddle to save energy, and because it looks funny.</p>' },
  elephant: { title: 'Elephant', body: '<p>Elephants are the largest land animals. An adult can produce over 100 kg of dung per day.</p><p>Bring a bigger bucket.</p>' },
  poop: { title: 'Poop', body: '<p><b>Zookeeping 101.</b> Animal waste lowers zoo cleanliness, and cleanliness drives ticket sales.</p><ol><li>Hold <b>left mouse</b> on the poop to grab it.</li><li>Carry it to the green dumpster behind ZOO HQ or any bin.</li><li>Drop it in. Feel accomplished.</li></ol><p>Do not run over it. You will slip.</p>' },
};
