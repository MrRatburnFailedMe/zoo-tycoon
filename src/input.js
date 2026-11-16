// Keyboard + mouse state with per-frame edge detection.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.buttons = new Set();
    this.btnPressed = new Set();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true; // false while typing on the computer

    addEventListener('keydown', (e) => {
      if (!this.enabled || e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons.add(e.button);
      this.btnPressed.add(e.button);
    });
    addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.clear();
    });
  }

  clear() { this.keys.clear(); this.buttons.clear(); }
  down(code) { return this.keys.has(code); }
  justPressed(code) { return this.pressed.has(code); }
  mouseDown(b) { return this.buttons.has(b); }
  mousePressed(b) { return this.btnPressed.has(b); }

  endFrame() {
    this.pressed.clear();
    this.btnPressed.clear();
    this.dx = this.dy = this.wheel = 0;
  }
}
