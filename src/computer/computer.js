import * as THREE from 'three';
import { Browser } from './browser.js';
import { sfx } from '../audio.js';
import { damp } from '../util/math.js';
import { APPS } from './apps.js';

export const GLOBE_SVG = `<svg viewBox="0 0 48 48"><defs><linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ec8ff"/><stop offset="1" stop-color="#2b7bd6"/></linearGradient></defs>
<circle cx="24" cy="24" r="21" fill="url(#gl)"/><path d="M10 17c5 1 7-3 11-2s3 6 7 6 4-5 8-4M8 28c4-1 6 3 10 3s5-4 9-3 4 6 10 5" fill="none" stroke="#bff0a8" stroke-width="5" stroke-linecap="round"/>
<circle cx="24" cy="24" r="21" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2"/></svg>`;

// The zoo's computer (office desk and gate desk share it): a fake desktop OS with a web browser
// plus a couple of desktop apps (Gate Desk, Analytics).
export class Computer {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('computer');
    this.isOpen = false;
    this.pose = null;

    // Texture shown on the in-world monitor.
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 376;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.el.innerHTML = `
      <div class="monitor">
        <div class="screen">
          <div class="wallpaper"><div class="sun"></div><div class="hill h1"></div><div class="hill h2"></div><div class="brandmark">ZooOS</div></div>
          <div class="desk-icons"><button class="dicon" data-app="browser">${GLOBE_SVG}<span>The Interwebs</span></button>${Object.entries(APPS).map(([k, a]) => `<button class="dicon" data-app="${k}"><i class="emo" style="background:${a.color}">${a.icon}</i><span>${a.name}</span></button>`).join('')}<button class="dicon" data-app="shop"><i class="emo" style="background:#2fb38a">ZM</i><span>ZooMart!!</span></button></div>
          <div class="window awin hidden"><div class="a-top"><b class="a-title"></b><div class="wbtns"><button class="wbtn" data-a="max">&#x25A1;</button><button class="wbtn close" data-a="close">&#x2715;</button></div></div><div class="a-view"></div></div>
          <div class="window bwin hidden">
            <div class="b-top">
              <div class="b-tabs"></div>
              <button class="b-newtab" title="New tab">+</button>
              <div class="wbtns"><button class="wbtn" data-w="min">&#x2013;</button><button class="wbtn" data-w="max">&#x25A1;</button><button class="wbtn close" data-w="close">&#x2715;</button></div>
            </div>
            <div class="b-toolbar">
              <button class="b-btn" data-nav="back" title="Back">&#x2190;</button>
              <button class="b-btn" data-nav="fwd" title="Forward">&#x2192;</button>
              <button class="b-btn" data-nav="reload" title="Reload">&#x21bb;</button>
              <button class="b-btn" data-nav="home" title="Home">&#x2302;</button>
              <form class="b-form"><span class="lock">&#x1F512;</span><input class="b-addr" spellcheck="false" autocomplete="off" /></form>
            </div>
            <div class="b-bookmarks"></div>
            <div class="b-progress"></div>
            <div class="b-view"></div>
          </div>
          <div class="taskbar">
            <div class="start">ZooOS</div>
            <button class="task-btn hidden">${GLOBE_SVG}<span>The Interwebs</span></button>
            <button class="task-btn app-btn hidden"><i class="emo"></i><span></span></button>
            <div class="spacer"></div>
            <div class="tray"><span class="tray-money"></span><span class="clock"></span></div>
          </div>
        </div>
        <div class="monitor-chin"><span class="brand">ZOOTRONIX</span><button class="standup">Get up, lazybones <kbd>Esc</kbd></button></div>
      </div>`;

    this.win = this.el.querySelector('.bwin');
    this.taskBtn = this.el.querySelector('.task-btn');
    this.browser = new Browser(this.win, game, () => this.drawScreen());

    this.awin = this.el.querySelector('.awin');
    this.appBtn = this.el.querySelector('.app-btn');
    this.app = null;
    for (const ic of this.el.querySelectorAll('.dicon')) {
      ic.addEventListener('click', () => {
        const a = ic.dataset.app;
        if (a === 'browser') this.openBrowser();
        else if (a === 'shop') { this.openBrowser(); this.browser.navigate('zoomart.zoo'); }
        else this.openApp(a);
      });
    }
    this.awin.querySelector('[data-a="close"]').addEventListener('click', () => { this.awin.classList.add('hidden'); this.appBtn.classList.add('hidden'); this.app = null; this.drawScreen(); });
    this.awin.querySelector('[data-a="max"]').addEventListener('click', () => this.awin.classList.toggle('max'));
    this.appBtn.addEventListener('click', () => { this.awin.classList.toggle('hidden'); this.drawScreen(); });
    this.appCtx = { state: game.state, get visitors() { return game.visitors; }, sfx };
    game.state.on(() => this.liveApp());
    setInterval(() => this.liveApp(), 1000);
    this.taskBtn.addEventListener('click', () => {
      if (this.win.classList.contains('hidden')) this.openBrowser();
      else { this.win.classList.add('hidden'); this.drawScreen(); }
    });
    this.win.querySelector('[data-w="min"]').addEventListener('click', () => { this.win.classList.add('hidden'); this.drawScreen(); });
    this.win.querySelector('[data-w="max"]').addEventListener('click', () => this.win.classList.toggle('max'));
    this.win.querySelector('[data-w="close"]').addEventListener('click', () => {
      this.win.classList.add('hidden');
      this.taskBtn.classList.add('hidden');
      this.drawScreen();
    });
    this.el.querySelector('.standup').addEventListener('click', () => this.close(true));
    addEventListener('keydown', (e) => { if (this.isOpen && e.code === 'Escape') this.close(false); });
    this.el.addEventListener('mousedown', () => sfx.click());

    const tick = () => {
      this.el.querySelector('.clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      this.el.querySelector('.tray-money').textContent = `$${game.state.money.toLocaleString()}`;
    };
    tick();
    setInterval(tick, 1000);
    game.state.on(tick);
    this.drawScreen();
  }

  openApp(key) {
    const a = APPS[key];
    this.app = key;
    this.awin.querySelector('.a-title').textContent = a.name;
    const view = this.awin.querySelector('.a-view');
    view.innerHTML = a.render(this.appCtx);
    a.bind?.(view, this.appCtx);
    this.awin.classList.remove('hidden');
    this.appBtn.classList.remove('hidden');
    this.appBtn.querySelector('.emo').textContent = a.icon;
    this.appBtn.querySelector('span').textContent = a.name;
    this.win.classList.add('hidden');
    this.liveApp();
    this.drawScreen();
  }

  liveApp() {
    if (!this.app || this.awin.classList.contains('hidden')) return;
    APPS[this.app].live?.(this.awin.querySelector('.a-view'), this.appCtx);
  }

  openBrowser() {
    this.awin.classList.add('hidden');
    this.win.classList.remove('hidden');
    this.taskBtn.classList.remove('hidden');
    this.drawScreen();
  }

  open(pose, app) {
    if (this.isOpen) return;
    this.isOpen = true;
    this.pose = pose;
    if (app) this.openApp(app);
    this.game.mode = 'computer';
    this.game.input.enabled = false;
    this.game.input.clear();
    this.game.grabber.release();
    document.exitPointerLock();
    setTimeout(() => { if (this.isOpen) this.el.classList.add('open'); }, 280);
  }

  close(viaClick) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('open');
    this.game.input.enabled = true;
    this.game.resume(viaClick);
  }

  // Smoothly move the camera to sit in front of the screen.
  updateCamera(dt) {
    if (!this.pose) return;
    const cam = this.game.camera;
    cam.position.lerp(this.pose.position, damp(8, dt));
    const m = new THREE.Matrix4().lookAt(cam.position, this.pose.target, cam.up);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    cam.quaternion.slerp(q, damp(8, dt));
  }

  // The in-world monitor: a cartoon version of the desktop (thick outlines, sticker colours).
  drawScreen() {
    if (!this.browser) return;
    const ctx = this.canvas.getContext('2d');
    const W = this.canvas.width, H = this.canvas.height, INK = '#1f2a1c';
    const shape = (fill, draw, lw = 5) => { ctx.beginPath(); draw(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); };
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#58b8f0');
    sky.addColorStop(0.7, '#a8e2fb');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    shape('#ffd34d', () => ctx.arc(W * 0.83, H * 0.2, 32, 0, Math.PI * 2));
    for (const [cx, cy, s] of [[W * 0.22, H * 0.2, 1], [W * 0.6, H * 0.32, 0.75]]) {
      shape('#fff', () => ctx.roundRect(cx, cy, 90 * s, 28 * s, 14 * s), 4);
      shape('#fff', () => ctx.arc(cx + 50 * s, cy, 20 * s, Math.PI, 0), 4);
    }
    shape('#7cd05a', () => ctx.ellipse(W * 0.25, H * 1.05, W * 0.6, H * 0.4, 0, 0, Math.PI * 2));
    shape('#56b83d', () => ctx.ellipse(W * 0.85, H * 1.1, W * 0.5, H * 0.42, 0, 0, Math.PI * 2));
    ctx.save();
    ctx.translate(W / 2, H * 0.47);
    ctx.rotate(-0.07);
    ctx.font = '800 64px "Baloo 2", system-ui';
    ctx.textAlign = 'center';
    ctx.lineWidth = 9;
    ctx.strokeStyle = INK;
    ctx.strokeText('ZooOS', 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillText('ZooOS', 0, 0);
    ctx.restore();
    // desktop icon
    shape('#fff', () => ctx.roundRect(22, 18, 50, 50, 14), 4);
    shape('#3a9be6', () => ctx.arc(47, 43, 17, 0, Math.PI * 2), 3);
    // browser window
    if (!this.win.classList.contains('hidden')) {
      const max = this.win.classList.contains('max');
      const x = max ? 0 : W * 0.07, y = max ? 0 : H * 0.05, w = max ? W : W * 0.82, h = max ? H - 30 : (H - 30) * 0.9;
      ctx.fillStyle = 'rgba(31,42,28,.85)';
      ctx.beginPath(); ctx.roundRect(x + 7, y + 8, w, h, 16); ctx.fill();
      shape('#fff8e4', () => ctx.roundRect(x, y, w, h, 16), 5);
      shape('#ffd34d', () => ctx.roundRect(x, y, w, 30, [16, 16, 0, 0]), 5);
      ['#7cd05a', '#58b8f0', '#ff6b5b'].forEach((c, i) => shape(c, () => ctx.arc(x + w - 62 + i * 22, y + 15, 7, 0, Math.PI * 2), 3));
      shape('#fff', () => ctx.roundRect(x + 46, y + 38, w - 70, 20, 10), 3);
      ctx.fillStyle = INK;
      ctx.textAlign = 'left';
      ctx.font = '800 13px "Baloo 2", system-ui';
      ctx.fillText(this.browser.currentTitle().slice(0, 22), x + 14, y + 21);
      ctx.fillText(this.browser.currentUrl().slice(0, 50), x + 56, y + 53);
      const cols = ['#ffd34d', '#7cd05a', '#58b8f0', '#ff8a3d'];
      for (let i = 0; i < 4; i++) shape(cols[i], () => ctx.roundRect(x + 28 + (i % 2) * (w - 56) / 2, y + 74 + Math.floor(i / 2) * 70, (w - 72) / 2, 56, 12), 4);
    }
    if (this.app && !this.awin.classList.contains('hidden')) {
      const a = APPS[this.app], x = W * 0.06, y = H * 0.05, w = W * 0.86, h = (H - 30) * 0.88;
      ctx.fillStyle = 'rgba(31,42,28,.85)';
      ctx.beginPath(); ctx.roundRect(x + 7, y + 8, w, h, 16); ctx.fill();
      shape('#fff8e4', () => ctx.roundRect(x, y, w, h, 16), 5);
      shape(a.color, () => ctx.roundRect(x, y, w, 30, [16, 16, 0, 0]), 5);
      ctx.fillStyle = INK;
      ctx.textAlign = 'left';
      ctx.font = '800 15px "Baloo 2", system-ui';
      ctx.fillText(a.name, x + 14, y + 21);
      if (this.app === 'analytics') {
        for (let i = 0; i < 12; i++) {
          const hu = 10 + ((i * 37) % 50), hd = 8 + ((i * 23) % 30);
          shape('#7cd05a', () => ctx.rect(x + 30 + i * 44, y + 150 - hu, 30, hu), 3);
          shape('#ff8a3d', () => ctx.rect(x + 30 + i * 44, y + 150, 30, hd), 3);
        }
      } else {
        for (let i = 0; i < 4; i++) shape(i % 2 ? '#fff' : '#ffe9b0', () => ctx.roundRect(x + 24, y + 48 + i * 52, w - 48, 40, 10), 3);
      }
    }
    shape('#b9814a', () => ctx.rect(-5, H - 30, W + 10, 40), 5);
    shape('#ffd34d', () => ctx.roundRect(8, H - 25, 72, 21, 9), 3);
    ctx.fillStyle = INK;
    ctx.font = '800 15px "Baloo 2", system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('ZooOS', 44, H - 9);
    this.texture.needsUpdate = true;
  }
}
