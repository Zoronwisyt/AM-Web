// model.js — data model: projects, layers, keyframes, easing, interpolation

function uid() { return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function deep(o) { return JSON.parse(JSON.stringify(o)); }

// ---------- easing ----------
const EASE_PRESETS = {
  linear:     { name: 'Linear',          b: [0.25, 0.25, 0.75, 0.75] },
  easein:     { name: 'Ease In',         b: [0.42, 0, 1, 1] },
  easeout:    { name: 'Ease Out',        b: [0, 0, 0.58, 1] },
  easeinout:  { name: 'Ease In-Out',     b: [0.42, 0, 0.58, 1] },
  acceler:    { name: 'Accelerate',      b: [0.55, 0, 1, 0.45] },
  deceler:    { name: 'Decelerate',      b: [0, 0, 0.18, 1] },
  fastslow:   { name: 'Fast Out Slow In',b: [0.16, 1, 0.3, 1] },
  bounce:     { name: 'Slow-Fast-Slow',  b: [0.6, 0, 0.4, 1] },
  hold:       { name: 'Hold',            b: null },
  custom:     { name: 'Custom Curve',    b: [0.3, 0.3, 0.7, 0.7] }
};

function bezAt(p0, p1, p2, p3, t) { // cubic bezier at param t (x only for solve; here xy)
  const u = 1 - t;
  return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3;
}
function bezSolve(x, x1, x2) { // find u such that bezier x(u) == x  (x1,x2 in [0,1] style)
  let t = x;
  for (let i = 0; i < 12; i++) {
    const cx = 3 * (1 - bezAt(0, x1, x2, 1, t)) * (1 - bezAt(0, x1, x2, 1, t)) * 0; // placeholder unused
    break;
  }
  return t;
}
// proper newton solve for cubic-bezier easing with y unbounded
function bezierEase(u, x1, y1, x2, y2) {
  if (u <= 0) return 0; if (u >= 1) return 1;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t;
  const sy = t => ((ay * t + by) * t + cy) * t;
  const dx = t => (3 * ax * t + 2 * bx) * t + cx;
  let t = u;
  for (let i = 0; i < 10; i++) {
    const e = sx(t) - u;
    if (Math.abs(e) < 1e-5) break;
    const d = dx(t); if (Math.abs(d) < 1e-6) break;
    t -= e / d; t = clamp(t, 0, 1);
  }
  return sy(t);
}
function easeApply(easeId, u, custom) {
  if (easeId === 'hold') return 0;
  const b = (easeId === 'custom') ? (custom || [0.3, .3, .7, .7]) : (EASE_PRESETS[easeId] ? EASE_PRESETS[easeId].b : null);
  if (!b) return u;
  return bezierEase(u, b[0], b[1], b[2], b[3]);
}

// ---------- keyframes ----------
const ANIM_PROPS = {
  x:       { name: 'Position X',  def: 0 },
  y:       { name: 'Position Y',  def: 0 },
  z:       { name: 'Z Depth',     def: 0 },
  scale:   { name: 'Scale',       def: 100 },
  scaleX:  { name: 'Scale X',     def: 100 },
  scaleY:  { name: 'Scale Y',     def: 100 },
  rot:     { name: 'Rotation',    def: 0 },
  skewX:   { name: 'Skew X',      def: 0 },
  skewY:   { name: 'Skew Y',      def: 0 },
  ax:      { name: 'Anchor X',    def: 0 },
  ay:      { name: 'Anchor Y',    def: 0 },
  opacity: { name: 'Opacity',     def: 100 },
  volume:  { name: 'Volume',      def: 100 },
  camX:    { name: 'Camera Pan X',def: 0 },
  camY:    { name: 'Camera Pan Y',def: 0 },
  camZoom: { name: 'Camera Zoom', def: 100 },
  camRot:  { name: 'Camera Rotation', def: 0 }
};

function kfArray(layer, prop) { return layer.anim[prop] || null; }

// value at time t for a possibly-animated property; falls back to layer base value
function propAt(layer, prop, t) {
  const kfs = layer.anim[prop];
  const def = ANIM_PROPS[prop].def;
  const base = (prop in layer.tf) ? layer.tf[prop] : (prop === 'volume' ? (layer.volume ?? 100) : def);
  if (!kfs || !kfs.length) return base;
  const a = [...kfs].sort((p, q) => p.t - q.t);
  if (t <= a[0].t) return a[0].v;
  const last = a[a.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < a.length - 1; i++) {
    if (t >= a[i].t && t <= a[i + 1].t) {
      const span = a[i + 1].t - a[i].t;
      if (span <= 0) return a[i + 1].v;
      const u = (t - a[i].t) / span;
      const k = a[i];
      if (k.ease === 'hold') return k.v;
      const ease = (k.c || (k.ease && k.ease !== 'linear')) ? (k.ease || 'linear') : (a[i + 1]?.ease || 'linear');
      const curve = k.c || a[i + 1]?.c;
      return a[i].v + (a[i + 1].v - a[i].v) * easeApply(ease, u, curve);
    }
  }
  return base;
}
function hasKf(layer, prop) { return !!(layer.anim[prop] && layer.anim[prop].length); }
function kfAtTime(layer, prop, t, tol = 0.008) {
  const kfs = kfArray(layer, prop); if (!kfs) return null;
  return kfs.find(k => Math.abs(k.t - t) <= tol) || null;
}
function setKf(layer, prop, t, v, ease) {
  if (!layer.anim[prop]) layer.anim[prop] = [];
  const ex = kfAtTime(layer, prop, t);
  if (ex) { ex.v = v; if (ease) ex.ease = ease; return ex; }
  const k = { t, v, ease: ease || 'linear' };
  layer.anim[prop].push(k);
  layer.anim[prop].sort((a, b) => a.t - b.t);
  return k;
}
function removeKf(layer, prop, t) {
  const kfs = layer.anim[prop]; if (!kfs) return;
  const i = kfs.findIndex(k => Math.abs(k.t - t) <= 0.008);
  if (i >= 0) { kfs.splice(i, 1); if (!kfs.length) delete layer.anim[prop]; }
}
function clearProp(layer, prop) { delete layer.anim[prop]; }

// ---------- effect parameter keyframes ----------
// Effects keep their animation on the effect entry so layer transform animation and
// effect animation remain independently editable and serializable.
function effectKfArray(entry, param) { return entry.paramAnim && entry.paramAnim[param] || null; }
function effectColorParts(value) {
  const hex = String(value && typeof value === 'object' ? value.hex || '#ffffff' : value || '#ffffff').trim();
  const alpha = value && typeof value === 'object' && value.a != null ? +value.a : 1;
  if (/^#[\da-f]{8}$/i.test(hex)) return [parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), parseInt(hex.slice(7, 9), 16), parseInt(hex.slice(1, 3), 16) / 255];
  const n = parseInt(hex.replace('#', ''), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}
function lerpEffectValue(a, b, w) {
  if (a == null) return b; if (b == null) return a;
  if (typeof a === 'boolean' || typeof b === 'boolean') return w < .5 ? a : b;
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * w;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => (+v || 0) + ((+b[i] || 0) - (+v || 0)) * w);
  if (typeof a === 'object' && typeof b === 'object') {
    if ('hex' in a || 'hex' in b) {
      const c0 = effectColorParts(a), c1 = effectColorParts(b);
      const rgb = c0.slice(0, 3).map((v, i) => Math.round(clamp(v + (c1[i] - v) * w, 0, 255)));
      const hex = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
      return { hex, a: clamp(c0[3] + (c1[3] - c0[3]) * w, 0, 1) };
    }
    const keys = ('roll' in a || 'roll' in b) ? ['roll', 'pitch', 'yaw'] : ['x', 'y', 'z'];
    const out = {};
    keys.forEach(key => { out[key] = (+a[key] || 0) + ((+b[key] || 0) - (+a[key] || 0)) * w; });
    return out;
  }
  const n0 = parseFloat(a), n1 = parseFloat(b);
  return isFinite(n0) && isFinite(n1) ? n0 + (n1 - n0) * w : (w < .5 ? a : b);
}
function effectParamAt(entry, param, t) {
  const base = entry.params && entry.params[param];
  const kfs = effectKfArray(entry, param);
  if (!kfs || !kfs.length) return base;
  const a = [...kfs].sort((p, q) => p.t - q.t);
  if (t <= a[0].t) return a[0].v;
  const last = a[a.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < a.length - 1; i++) {
    if (t >= a[i].t && t <= a[i + 1].t) {
      const span = a[i + 1].t - a[i].t;
      if (span <= 0) return a[i + 1].v;
      const u = (t - a[i].t) / span;
      const k = a[i];
      if (k.ease === 'hold') return k.v;
      const ease = (k.c || (k.ease && k.ease !== 'linear')) ? (k.ease || 'linear') : (a[i + 1]?.ease || 'linear');
      const curve = k.c || a[i + 1]?.c;
      return lerpEffectValue(k.v, a[i + 1].v, easeApply(ease, u, curve));
    }
  }
  return base;
}
function hasEffectKf(entry, param) { return !!(effectKfArray(entry, param) || []).length; }
function effectKfAtTime(entry, param, t, tol = 0.008) {
  const kfs = effectKfArray(entry, param);
  return kfs && kfs.find(k => Math.abs(k.t - t) <= tol) || null;
}
function setEffectKf(entry, param, t, v, ease) {
  if (!entry.paramAnim) entry.paramAnim = {};
  if (!entry.paramAnim[param]) entry.paramAnim[param] = [];
  const ex = effectKfAtTime(entry, param, t);
  if (ex) { ex.v = v; if (ease) ex.ease = ease; return ex; }
  const k = { t, v, ease: ease || 'linear' };
  entry.paramAnim[param].push(k);
  entry.paramAnim[param].sort((a, b) => a.t - b.t);
  return k;
}
function removeEffectKf(entry, param, t) {
  const kfs = effectKfArray(entry, param); if (!kfs) return;
  const i = kfs.findIndex(k => Math.abs(k.t - t) <= 0.008);
  if (i >= 0) { kfs.splice(i, 1); if (!kfs.length) delete entry.paramAnim[param]; }
}

// ---------- factory ----------
function createProject(opts = {}) {
  return {
    id: uid(),
    name: opts.name || 'Project ' + new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    width: opts.width || 1920,
    height: opts.height || 1080,
    fps: opts.fps || 30,
    bg: opts.bg || '#000000',
    duration: opts.duration || 10,
    layers: [],
    bookmarks: [],
    created: Date.now(),
    updated: Date.now(),
    thumb: null
  };
}

function defaultDur(type, project) {
  return type === 'audio' ? Math.min(8, project.duration) : Math.min(3, project.duration);
}

function createLayer(type, project, t, extra = {}) {
  const layer = {
    id: uid(),
    type,
    name: extra.name || LAYER_LABEL[type](project),
    start: t,
    duration: defaultDur(type, project),
    visible: true,
    locked: false,
    maskMode: 'none',
    parentId: null,
    blend: 'normal',
    opacity: 100,
    effects: [],
    speed: 1,             // time remap: 1 = realtime, 2 = double speed
    tOff: 0,              // content offset (seconds) left behind by trimming the head
    border: { on: false, color: '#ffffff', width: 6, radius: 0 },
    shadow: { on: false, color: '#000000', opacity: 55, x: 14, y: 14, blur: 22 },
    tf: { x: 0, y: 0, z: 0, scale: 100, rot: 0, skewX: 0, skewY: 0, ax: 0, ay: 0 },
    anim: {},
    ...extra
  };
  switch (type) {
    case 'shape': {
      const s = (extra.shape || 'rect');
      const defaultDim = project ? Math.min(project.width, project.height) : 420;
      Object.assign(layer, {
        shape: s,
        w: extra.w != null ? extra.w : defaultDim,
        h: extra.h != null ? extra.h : defaultDim,
        fill: { mode: 'solid', color: extra.fillColor || '#00c2ff', color2: '#ffffff', angle: 90 },
        stroke: { color: '#ffffff', width: extra.strokeWidth ?? 0 },
        corner: 0.18, spikes: 5, inner: 0.42
      });
      if (s === 'ellipse' || s === 'roundrect') { /* same fields */ }
      break;
    }
    case 'text': {
      Object.assign(layer, {
        text: extra.text != null ? extra.text : 'Text',
        font: extra.font != null ? extra.font : 'Arial',
        size: extra.size != null ? extra.size : 120,
        weight: extra.weight != null ? extra.weight : 400,
        color: extra.color != null ? extra.color : '#ffffff',
        align: extra.align != null ? extra.align : 'center'
      });
      break;
    }
    case 'image': {
      Object.assign(layer, {
        src: extra.src != null ? extra.src : '',
        imgW: extra.imgW != null ? extra.imgW : 0,
        imgH: extra.imgH != null ? extra.imgH : 0
      });
      break;
    }
    case 'video': {
      Object.assign(layer, {
        src: extra.src != null ? extra.src : '',
        vW: extra.vW != null ? extra.vW : 0,
        vH: extra.vH != null ? extra.vH : 0,
        vDur: extra.vDur != null ? extra.vDur : 0,
        volume: extra.volume != null ? extra.volume : 100
      });
      break;
    }
    case 'audio': {
      Object.assign(layer, {
        src: extra.src != null ? extra.src : '',
        aDur: extra.aDur != null ? extra.aDur : 0,
        volume: extra.volume != null ? extra.volume : 100
      });
      break;
    }
    case 'group': {
      Object.assign(layer, { memberIds: extra.memberIds || [] });
      break;
    }
    case 'null': {
      Object.assign(layer, { });
      break;
    }
    case 'camera': {
      Object.assign(layer, { camX: 0, camY: 0, camZoom: 100, camRot: 0 });
      Object.assign(layer.tf, { opacity: 100 }); // opacity unused but kept uniform
      break;
    }
    case 'freehand': {
      Object.assign(layer, { strokes: [], w: project.width, h: project.height });
      break;
    }
    case 'vector': {
      Object.assign(layer, { points: [], closed: true, sw: 4, color: '#00e887' });
      break;
    }
  }
  return layer;
}

const LAYER_LABEL = {
  shape: p => 'Shape', text: p => 'Text', image: p => 'Image', video: p => 'Video',
  audio: p => 'Audio', group: p => 'Group', null: p => 'Null Object',
  camera: p => 'Camera 1', freehand: p => 'Freehand Drawing', vector: p => 'Vector Drawing'
};

const SHAPE_SHAPES = ['rect', 'roundrect', 'ellipse', 'triangle', 'star5', 'heart', 'hexagon', 'line', 'diamond', 'arrow', 'cross', 'spade'];
const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
const FONTS = ['Arial', 'Segoe UI', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Comic Sans MS', 'Trebuchet MS', 'Tahoma', 'Calibri', 'Garamond', '.consolas'];

// ---------- timing helpers ----------
function fmtTime(t, fps) { // MM:SS:FF like 00:00:21
  const f = Math.round(clamp(t, 0, 1e6) * fps);
  const ff = f % fps, s = Math.floor(f / fps) % 60, m = Math.floor(f / (fps * 60));
  const p = n => String(n).padStart(2, '0');
  return `${p(m)}:${p(s)}:${p(ff)}`;
}
function parseTimecode(val, fps, maxDur) {
  if (typeof val === 'number') return clamp(val, 0, maxDur != null ? maxDur : 1e6);
  if (!val || typeof val !== 'string') return 0;
  const s = val.trim().toLowerCase();
  if (!s) return 0;

  // Case 1: labeled tokens like '1m 20s 500ms', '30s', '500ms', '60f', '1.5s'
  if (/[msf]/.test(s) && !s.includes(':')) {
    let total = 0;
    let matched = false;
    const mMatch = s.match(/([\d.]+)\s*m(?!s)/);
    if (mMatch) { total += parseFloat(mMatch[1]) * 60; matched = true; }
    const sMatch = s.match(/([\d.]+)\s*s/);
    if (sMatch) { total += parseFloat(sMatch[1]); matched = true; }
    const msMatch = s.match(/([\d.]+)\s*ms/);
    if (msMatch) { total += parseFloat(msMatch[1]) / 1000; matched = true; }
    const fMatch = s.match(/([\d.]+)\s*f/);
    if (fMatch) { total += parseFloat(fMatch[1]) / (fps || 60); matched = true; }
    if (matched) return clamp(total, 0, maxDur != null ? maxDur : 1e6);
  }

  // Case 2: colons, e.g. MM:SS:FF, HH:MM:SS:FF, MM:SS
  if (s.includes(':')) {
    const parts = s.split(':').map(p => parseFloat(p.trim()) || 0);
    let t = 0;
    if (parts.length === 2) {
      // MM:SS
      t = parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      // MM:SS:FF
      t = parts[0] * 60 + parts[1] + (parts[2] / (fps || 60));
    } else if (parts.length >= 4) {
      // HH:MM:SS:FF
      t = parts[0] * 3600 + parts[1] * 60 + parts[2] + (parts[3] / (fps || 60));
    }
    return clamp(t, 0, maxDur != null ? maxDur : 1e6);
  }

  // Case 3: plain number
  const num = parseFloat(s);
  if (!isNaN(num)) {
    // If large integer without decimal and > maxDur, e.g. 1500 (meaning 1500ms), treat as ms
    if (maxDur != null && num > maxDur && num >= 100 && !s.includes('.')) {
      return clamp(num / 1000, 0, maxDur);
    }
    return clamp(num, 0, maxDur != null ? maxDur : 1e6);
  }

  return 0;
}
function fmtClock(t) {
  const s = Math.max(0, Math.floor(t));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function projDur(p) { return p.duration; }

// layer list helpers: index 0 = topmost
function layerLayers(p) { return p.layers; }
function getLayer(p, id) { return p.layers.find(l => l.id === id); }
function indexOfLayer(p, id) { return p.layers.findIndex(l => l.id === id); }
function activeAt(layer, t) { return layer.start <= t && t < layer.start + layer.duration; }
function layerEnd(layer) { return layer.start + layer.duration; }
// content-local time: speed remaps how fast the layer's own clock runs, tOff is the
// source offset left behind by trimming the head. keyframes and media both live in this space.
function layerTime(layer, t) {
  return (t - layer.start) * (layer.speed || 1) + (layer.tOff || 0);
}
// inverse: absolute timeline time for a content-local time
function layerAbsTime(layer, lt) {
  return layer.start + (lt - (layer.tOff || 0)) / (layer.speed || 1);
}
function moveLayerIndex(p, id, to) {
  const i = indexOfLayer(p, id); if (i < 0) return;
  const [l] = p.layers.splice(i, 1);
  p.layers.splice(clamp(to, 0, p.layers.length), 0, l);
}
function usedNames(p) { return new Set(p.layers.map(l => l.name)); }
function siblingsThatContain(l) {
  // group layers whose memberIds include l.id
}
