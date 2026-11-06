// ui-common.js — modals, color picker, swatches, toast, file helpers

const Modals = {
  open(id) {
    document.getElementById(id).hidden = false;
    Modals._stack.push(id);
  },
  close(id) {
    const el = document.getElementById(id); if (el) el.hidden = true;
    Modals._stack = Modals._stack.filter(x => x !== id);
  },
  closeTop() { const s = Modals._stack; if (s.length) this.close(s[s.length - 1]); },
  _stack: []
};

function toast(msg, ms = 1800) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.hidden = true, ms);
}

// ---------- color picker ----------
const ColorPick = {
  hsv: { h: 190, s: 80, v: 95 },
  onChange: null,
  init() {
    if (ColorPick._inited) return;
    ColorPick._inited = true;
    const sv = document.getElementById('cp-sv-c');
    drawSV(); drawHue();
    document.getElementById('cp-hue').addEventListener('click', e => {
      const r = e.target.getBoundingClientRect();
      ColorPick.hsv.h = Math.round((e.clientX - r.left) / r.width * 360) % 360;
      drawHue(); drawSV(); sync();
    });
    sv.addEventListener('pointerdown', e => {
      const mv = ev => {
        const r = sv.getBoundingClientRect();
        ColorPick.hsv.s = clamp((ev.clientX - r.left) / r.width, 0, 1) * 100;
        ColorPick.hsv.v = clamp(1 - (ev.clientY - r.top) / r.height, 0, 1) * 100;
        drawSV(); sync();
      };
      mv(e);
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    for (const [inId, fn] of [['cp-hex', ColorPick.hexIn], ['cp-r', srgb('r')], ['cp-g', srgb('g')], ['cp-b', srgb('b')], ['cp-h', shsl('h')], ['cp-s', shsl('s')], ['cp-l', shsl('l')]])
      document.getElementById(inId).addEventListener('change', fn);
    document.getElementById('cp-save').addEventListener('click', ColorPick.saveToPalette);
    if (window.EyeDropper) {
      const b = document.getElementById('cp-eyebrow'); b.hidden = false;
      b.addEventListener('click', async () => {
        try { const r = await new EyeDropper().open(); ColorPick.setHex(r.sRGBHex); ColorPick.emit(); } catch { }
      });
    }
    ColorPick.renderPalette();
  },
  setHex(hex) {
    const { h, s, v } = rgb2hsv(...hex2rgb(hex));
    ColorPick.hsv = { h, s, v };
    drawSV(); sync();
  },
  hex() { return hsv2hex(ColorPick.hsv.h, ColorPick.hsv.s, ColorPick.hsv.v); },
  open(initial, onChange) {
    ColorPick.init();
    ColorPick.onChange = onChange;
    if (initial) ColorPick.setHex(initial);
    Modals.open('m-color');
  },
  emit() { if (ColorPick.onChange) { const hx = ColorPick.hex(); ColorPick.onChange(hx); syncSwatch(getSwatchTargets()[0], hx); } },
  saveToPalette() {
    const pal = ColorPick.palette();
    pal.unshift(ColorPick.hex());
    if (pal.length > 12) pal.length = 12;
    localStorage.setItem('amweb-palette', JSON.stringify(pal));
    ColorPick.renderPalette(); toast('Color saved to palette');
  },
  palette() { try { return JSON.parse(localStorage.getItem('amweb-palette')) || []; } catch { return []; } },
  renderPalette() {
    const el = document.getElementById('cp-palette'); el.innerHTML = '';
    for (const c of ColorPick.palette()) {
      const b = document.createElement('button');
      b.style.background = c;
      b.addEventListener('click', () => { ColorPick.setHex(c); ColorPick.emit(); });
      el.appendChild(b);
    }
  }
};
function getSwatchTargets() { return ColorPick._swatches || []; }
function syncSwatch(swatchEl, hex) { if (swatchEl) swatchEl.style.background = hex; }

function drawSV() {
  const { h } = ColorPick.hsv;
  const cv = document.getElementById('cp-sv-c'), ctx = cv.getContext('2d');
  const w = cv.width, hh = cv.height;
  for (let y = 0; y < hh; y += 1) {
    const rowHsv = { h, s: 100, v: (1 - y / hh) * 100 };
    const g = ctx.createLinearGradient(0, 0, w, 0);
    const [r0, g0, b0] = hsv2rgb(h, 0, rowHsv.v);
    const [r1, g1, b1] = hsv2rgb(h, 100, rowHsv.v);
    g.addColorStop(0, `rgb(${r0},${g0},${b0})`); g.addColorStop(1, `rgb(${r1},${g1},${b1})`);
    ctx.fillStyle = g; ctx.fillRect(0, y, w, 1);
  }
}
function drawHue() {
  const cv = document.getElementById('cp-hue'), ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, cv.width, 0);
  for (let i = 0; i <= 6; i++) { const [r, gg, b] = hsv2rgb(i / 6 * 360, 100, 100); g.addColorStop(i / 6, `rgb(${r},${gg},${b})`); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
}
function sync() {
  const { h, s, v } = ColorPick.hsv;
  const hx = hsv2hex(h, s, v), [r, g, b] = hex2rgb(hx);
  const dot = document.getElementById('cp-sv-dot');
  dot.style.left = (s / 100 * 256) + 'px'; dot.style.top = ((1 - v / 100) * 180) + 'px';
  const hexEl = document.getElementById('cp-hex'); if (document.activeElement !== hexEl) hexEl.value = hx;
  const set = (id, val) => { const el = document.getElementById(id); if (document.activeElement !== el) el.value = val; };
  set('cp-r', r); set('cp-g', g); set('cp-b', b);
  const [hs, ss, ls] = rgb2hsl(r, g, b);
  set('cp-h', Math.round(hs)); set('cp-s', Math.round(ss)); set('cp-l', Math.round(ls));
  ColorPick._hex = hx;
  if (ColorPick.onChange) ColorPick.onChange(hx);
}
function srgb(ch) { return () => { const hx = rgb2hex(+cpVal('cp-r'), +cpVal('cp-g'), +cpVal('cp-b')); ColorPick.setHex(hx); ColorPick._hex = hx; if (ColorPick.onChange) ColorPick.onChange(hx); }; }
function shsl(ch) { return () => { const [r, g, b] = hsl2rgb(+cpVal('cp-h'), +cpVal('cp-s'), +cpVal('cp-l')); const hx = rgb2hex(r, g, b); ColorPick.setHex(hx); ColorPick._hex = hx; if (ColorPick.onChange) ColorPick.onChange(hx); }; }
function cpVal(id) { return +document.getElementById(id).value || 0; }

// bind a swatch button to open picker and remember target
function bindSwatch(btn, getFn, setFn) {
  btn.addEventListener('click', () => {
    ColorPick.open(getFn(), hex => { setFn(hex); btn.style.background = hex; });
    ColorPick._swatches = [btn];
  });
}

// ---------- color utils ----------
function hex2rgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb2hex(r, g, b) { return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
function rgb2sv2(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); }
  if (h < 0) h += 360;
  return [h, mx ? d / mx * 100 : 0, mx * 100];
}
function hsv2rgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
const hsv2hex = (h, s, v) => rgb2hex(...hsv2rgb(h, s, v));
const rgb2hsv = (r, g, b) => { const x = rgb2sv2(r, g, b); return { h: x[0], s: x[1], v: x[2] }; };
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d) {
    s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, s * 100, l * 100];
}
function hsl2rgb(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// ---------- generic wiring ----------
document.addEventListener('click', e => {
  const x = e.target.closest('[data-close]');
  if (x) {
    const sheet = x.closest('.modal');
    Modals.close(sheet?.id);
    e.stopPropagation();
  }
  if (!e.target.closest('.context') && !e.target.closest('.bmenu') && !e.target.closest('#m-layer')) {
    const ctx = document.getElementById('m-layer'); if (ctx) ctx.hidden = true;
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') Modals.closeTop();
});

// read file as dataURL
function readDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}
function download(name, url) {
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
}
