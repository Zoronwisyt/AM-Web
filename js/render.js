// render.js — canvas compositor: camera, matrices, masks, media sync, bounds, waves, thumbs

// ---------- 2D matrix (a,b,c,d,e,f) ----------
const M_ID = [1, 0, 0, 1, 0, 0];
function mmul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}
const mT = (x, y) => [1, 0, 0, 1, x, y];
function mR(deg) { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; }
function mS(s, sy) { sy = sy == null ? s : sy; return [s, 0, 0, sy, 0, 0]; }
function mSkew(kx, ky) { return [1, Math.tan(ky * Math.PI / 180), Math.tan(kx * Math.PI / 180), 1, 0, 0]; }
function mApply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
function mToCtx(ctx, m) { ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]); }

// ---------- media elements ----------
const VIDEOS = {}, AUDIOS = {}, VIDEO_PEAKS = {};
function videoEl(layer) {
  let v = VIDEOS[layer.id];
  if (!v) {
    v = document.createElement('video');
    v.src = layer.src; v.muted = false; v.preload = 'auto'; v.playsInline = true; v.loop = true;
    VIDEOS[layer.id] = v;
  }
  return v;
}
function audioEl(layer) {
  let a = AUDIOS[layer.id];
  if (!a) { a = new Audio(layer.src); a.preload = 'auto'; AUDIOS[layer.id] = a; }
  return a;
}

// matrix chain incl. parents; layer-local (0,0) sits at composition center
// fx: {dx,dy,ang,sx,sy} — deltas from the effects script phase
function layerXf(project, layer, t, seen = new Set(), childOf = false, fx = null) {
  const lt = layerTime(layer, t);        // speed / trim remap lives here
  const o = {
    x: propAt(layer, 'x', lt), y: propAt(layer, 'y', lt), z: propAt(layer, 'z', lt),
    scale: propAt(layer, 'scale', lt) / 100, rot: propAt(layer, 'rot', lt),
    scaleX: (layer.tf && layer.tf.scaleX != null ? propAt(layer, 'scaleX', lt) / 100 : 1),
    scaleY: (layer.tf && layer.tf.scaleY != null ? propAt(layer, 'scaleY', lt) / 100 : 1),
    skewX: propAt(layer, 'skewX', lt), skewY: propAt(layer, 'skewY', lt),
    ax: propAt(layer, 'ax', lt), ay: propAt(layer, 'ay', lt),
    opacity: propAt(layer, 'opacity', lt)
  };
  const fdx = fx ? (fx.dx || 0) : 0, fdy = fx ? (fx.dy || 0) : 0;
  const fang = fx ? (fx.ang || 0) : 0;
  const fsx = fx ? (fx.sx || 1) : 1, fsy = fx ? (fx.sy || 1) : 1;
  // Matrix calculation matching Alight Motion APK:
  // Matrix.preTranslate(location.x, location.y)
  // Matrix.preTranslate(pivot.x, pivot.y)
  // Matrix.preRotate(rotation)
  // Matrix.preScale(scale.x, scale.y)
  // Matrix.preSkew(skew.x, skew.y)
  // Matrix.preTranslate(-pivot.x, -pivot.y)
  //
  // In our local coordinate space:
  // (o.x + fdx, o.y + fdy) is the location relative to center.
  // (o.ax, o.ay) is the pivot / anchor point.
  const zPerspective = Math.max(0.02, 1000 / Math.max(10, 1000 + o.z));
  const totSx = o.scale * o.scaleX * zPerspective * fsx;
  const totSy = o.scale * o.scaleY * zPerspective * fsy;

  let local = mT(o.x + fdx, o.y + fdy);
  if (o.ax || o.ay) local = mmul(local, mT(o.ax, o.ay));
  local = mmul(local, mR(o.rot + fang));
  local = mmul(local, mS(totSx, totSy));
  local = mmul(local, mSkew(o.skewX, o.skewY));
  if (o.ax || o.ay) local = mmul(local, mT(-o.ax, -o.ay));
  // root layers are seeded at comp center; children inherit the parent frame
  let m = childOf ? local : mmul(mT(project.width / 2, project.height / 2), local);
  if (layer.parentId && !seen.has(layer.parentId)) {
    const p = getLayer(layer._proj || project, layer.parentId);
    if (p && p !== layer) {
      seen.add(layer.parentId);
      const pm = layerXf(p._proj || project, p, t, seen, false);
      m = mmul(pm.m, local);
      o.opacity *= (propAt(p, 'opacity', layerTime(p, t)) / 100);
    }
  }
  return { o, m };
}

// scripted-env velocity surface (px/s, %/s, deg/s) from transform derivative
function fxEnvVelocity(layer, t, fps) {
  const dt = 1 / Math.max(fps || 30, 1);
  const x0 = propAt(layer, 'x', t), y0 = propAt(layer, 'y', t);
  const x1 = propAt(layer, 'x', t - dt), y1 = propAt(layer, 'y', t - dt);
  const vx = (x0 - x1) / dt;
  const vy = (y0 - y1) / dt;
  return {
    velocity: Math.hypot(vx, vy),
    velocityVec: [vx, vy],
    scaleVelocity: Math.abs(propAt(layer, 'scale', t) - propAt(layer, 'scale', t - dt)) / dt,
    angularVelocity: Math.abs(propAt(layer, 'rot', t) - propAt(layer, 'rot', t - dt)) / dt
  };
}

// content paths, all centered at origin
function shapePath(layer) {
  const w = layer.w, h = layer.h, hw = w / 2, hh = h / 2, s = layer.shape;
  const p = new Path2D();
  switch (s) {
    case 'rect': p.rect(-hw, -hh, w, h); break;
    case 'roundrect': {
      const auto = Math.min(hw, hh) * 0.18;
      const r = Math.max(0, Math.min(layer.corner > 0 ? layer.corner : auto, Math.min(hw, hh)));
      p.moveTo(-hw + r, -hh);
      p.arcTo(hw, -hh, hw, hh, r); p.arcTo(hw, hh, -hw, hh, r);
      p.arcTo(-hw, hh, -hw, -hh, r); p.arcTo(-hw, -hh, hw, -hh, r); p.closePath(); break;
    }
    case 'ellipse': p.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2); break;
    case 'triangle': p.moveTo(0, -hh); p.lineTo(hw, hh); p.lineTo(-hw, hh); p.closePath(); break;
    case 'diamond': p.moveTo(0, -hh); p.lineTo(hw, 0); p.lineTo(0, hh); p.lineTo(-hw, 0); p.closePath(); break;
    case 'star5': {
      const spikes = Math.max(3, Math.min(24, Math.round(layer.spikes || 5)));
      const inner = clamp(layer.inner == null ? 0.42 : layer.inner, 0.05, 0.95);
      const step = Math.PI / spikes;
      for (let i = 0; i < spikes * 2; i++) {
        const a = -Math.PI / 2 + i * step, r = (i % 2) ? hw * inner : hw;
        i ? p.lineTo(Math.cos(a) * r, Math.sin(a) * r) : p.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      p.closePath(); break;
    }
    case 'heart': {
      const k = hw > hh ? hh / hw : 1; p.moveTo(0, hh * 0.9);
      p.bezierCurveTo(-hw, hh * 0.2, -hw * 0.9, -hh, 0, -hh * 0.25);
      p.bezierCurveTo(hw * 0.9, -hh, hw, hh * 0.2, 0, hh * 0.9); p.closePath(); break;
    }
    case 'hexagon': {
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3;
        const x = Math.cos(a) * hw, y = Math.sin(a) * hh;
        i ? p.lineTo(x, y) : p.moveTo(x, y);
      }
      p.closePath(); break;
    }
    case 'cross': {
      const t = Math.min(hw, hh) * 0.34;
      p.moveTo(-t, -hh); p.lineTo(t, -hh); p.lineTo(t, -t); p.lineTo(hw, -t); p.lineTo(hw, t);
      p.lineTo(t, t); p.lineTo(t, hh); p.lineTo(-t, hh); p.lineTo(-t, t); p.lineTo(-hw, t);
      p.lineTo(-hw, -t); p.lineTo(-t, -t); p.closePath(); break;
    }
    case 'arrow': {
      p.moveTo(-hw, -hh * 0.35); p.lineTo(hw * 0.2, -hh * 0.35); p.lineTo(hw * 0.2, -hh);
      p.lineTo(hw, 0); p.lineTo(hw * 0.2, hh); p.lineTo(hw * 0.2, hh * 0.35); p.lineTo(-hw, hh * 0.35); p.closePath(); break;
    }
    case 'line': p.moveTo(-hw, 0); p.lineTo(hw, 0); break;
    default: p.rect(-hw, -hh, w, h);
  }
  return p;
}

function textLines(layer) { return String(layer.text || '').split('\n'); }

// solid / linear / radial fill for shape layers
function fillStyleFor(ctx, layer) {
  const f = layer.fill || {};
  const c1 = f.color || '#00c2ff';
  if (f.mode !== 'linear' && f.mode !== 'radial') return c1;
  const hw = (layer.w || 100) / 2, hh = (layer.h || 100) / 2;
  const c2 = f.color2 || '#ffffff';
  if (f.mode === 'radial') {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(hw, hh));
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    return g;
  }
  const a = ((f.angle == null ? 90 : f.angle) * Math.PI) / 180;
  const dx = Math.cos(a) * hw, dy = Math.sin(a) * hh;
  const g = ctx.createLinearGradient(-dx, -dy, dx, dy);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  return g;
}
function hexA(hex, a) {
  const [r, g, b] = hex2rgb(hex || '#000000');
  return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`;
}

// content natural size (untransformed) for bounds & hit-testing
function contentSize(layer) {
  switch (layer.type) {
    case 'shape': return [layer.w, layer.h];
    case 'text': {
      const el = document.createElement('canvas').getContext('2d');
      el.font = `${layer.weight} ${layer.size}px ${layer.font}`;
      const wmax = Math.max(...textLines(layer).map(L => el.measureText(L).width), 10);
      return [wmax, textLines(layer).length * layer.size * 1.25];
    }
    case 'image': {
      const img = IMGS[layer.id]; return img ? [img.naturalWidth, img.naturalHeight] : [layer.imgW || 200, layer.imgH || 200];
    }
    case 'video': { const v = videoEl(layer); return v.videoWidth ? [v.videoWidth, v.videoHeight] : [layer.vW || 200, layer.vH || 200]; }
    case 'vector': {
      const xs = layer.points.map(p => p[0]), ys = layer.points.map(p => p[1]);
      if (!xs.length) return [100, 100];
      return [Math.max(...xs) - Math.min(...xs) + layer.sw, Math.max(...ys) - Math.min(...ys) + layer.sw];
    }
    case 'freehand': return [layer.w, layer.h];
    case 'group': {
      if (layer.w && layer.h) return [layer.w, layer.h];
      const pts = [];
      for (const id of layer.memberIds || []) { const l = layer._proj && getLayer(layer._proj, id); if (l && l.type !== 'audio') { const b = layerBoundsBrief(l); pts.push(b); } }
      if (!pts.length) return [layer.w || 200, layer.h || 200];
      return [Math.max(...pts.map(b => b[2])) - Math.min(...pts.map(b => b[0])), Math.max(...pts.map(b => b[3])) - Math.min(...pts.map(b => b[1]))];
    }
    default: return [200, 200];
  }
}
function layerBoundsBrief(layer) { const [w, h] = contentSize(layer); return [-w / 2, -h / 2, w / 2, h / 2]; }

// ---------- images ----------
const IMGS = {};
function imageEl(layer) {
  let img = IMGS[layer.id];
  if (!img) {
    img = new Image(); img.loaded = false; IMGS[layer.id] = img;
    img.onload = () => { img.loaded = true; };
    if (layer.src) img.src = layer.src;
  }
  return img;
}

// last-good-frame cache per video layer — no black flashes while seeking
const FRAME_CACHE = {};
function cachedVideoFrame(layer, v) {
  let f = FRAME_CACHE[layer.id];
  if (!f) { f = document.createElement('canvas'); FRAME_CACHE[layer.id] = f; f._up = false; }
  if (v && v.readyState >= 2 && v.videoWidth) {
    if (f.width !== v.videoWidth || f.height !== v.videoHeight) { f.width = v.videoWidth; f.height = v.videoHeight; }
    try { f.getContext('2d').drawImage(v, 0, 0); f._up = true; } catch { }
  }
  return f._up ? f : null;
}
// persistent working canvases pool (0/1 masks, 2 fx source, 3 comp snapshot)
const _WORK = [];
function maskCanvas(i) {
  return (_WORK[i] = _WORK[i] || document.createElement('canvas'));
}
function cameraTransformAt(project, t) {
  const cam = project.layers.find(l => l.type === 'camera' && activeAt(l, t));
  if (!cam) return null;
  const lt = layerTime(cam, t);
  return {
    x: propAt(cam, 'camX', lt), y: propAt(cam, 'camY', lt),
    zoom: propAt(cam, 'camZoom', lt) / 100, rot: propAt(cam, 'camRot', lt)
  };
}

function renderComp(ctx, project, t, opts = {}) {
  const w = project.width, h = project.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = project.bg || '#000';
  ctx.fillRect(0, 0, w, h);

  // camera
  const camT = cameraTransformAt(project, t);
  ctx.save();
  if (camT) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(camT.rot * Math.PI / 180);
    ctx.scale(camT.zoom, camT.zoom);
    ctx.translate(-w / 2 - camT.x, -h / 2 - camT.y);
  }

  // group membership map
  const groupOf = {};
  for (const g of project.layers) if (g.type === 'group') for (const id of g.memberIds) groupOf[id] = g.id;

  // mask pairs: maskMode on layer L hides/does not hide; mask geometry from L applied to layer directly BELOW (i+1)
  const maskFor = {}; // subjectIdx -> maskLayer
  const isMaskLayer = new Set();
  const usedIdx = new Set();
  for (let i = 0; i < project.layers.length; i++) {
    const L = project.layers[i];
    if (L.maskMode !== 'none' && L.type !== 'audio' && L.type !== 'camera' && L.type !== 'null') {
      isMaskLayer.add(L.id);
      for (let j = i + 1; j < project.layers.length; j++) {
        const S = project.layers[j];
        if (usedIdx.has(S.id)) continue;
        if (S.type === 'audio' || S.type === 'camera') continue;
        maskFor[S.id] = L; usedIdx.add(S.id); break;
      }
    }
  }

  const temp = maskCanvas(0), inv = maskCanvas(1);
  const tctx = temp.getContext('2d');

  const note = { groupMap: groupOf, skipMembers: true, project, t };

  for (let i = project.layers.length - 1; i >= 0; i--) {
    const L = project.layers[i];
    if (!L.visible) continue;
    if (!activeAt(L, t)) continue;
    if (note.skipMembers && groupOf[L.id]) continue;      // members render with their group
    if (isMaskLayer.has(L.id)) continue;                  // mask geometry rendered with subject
    let X = layerXf(project, L, t);
    let alpha = clamp(X.o.opacity / 100, 0, 1);
    let drawL = L;
    const blend = L.blend === 'normal' ? 'source-over' : L.blend;

    // ---------- effects: script phase + GL chain ----------
    const drawable = ['shape', 'text', 'image', 'video', 'vector', 'freehand'].includes(L.type);
    let entries = null, needsGL = false, needsComp = false, pad = 0;
    if (drawable && L.effects && FXCatalog.ready) {
      entries = L.effects.filter(e => e && e.enabled && FXCatalog.byId[e.id]);
      if (entries.length) {
        // script phase: mutates alpha/transform/text
        const scrEnv = Object.assign({
          time: (layerTime(L, t) - (L.tOff || 0)) / Math.max(L.duration, 1e-6),
          paramTime: layerTime(L, t),
          duration: L.duration,
          fps: project.fps,
          frame: Math.floor(t * project.fps)
        }, fxEnvVelocity(L, t, project.fps));
        for (const e of entries) e._env = scrEnv;
        const fxo = FXEngine.runScripts(L, entries);
        if (fxo.textOut && L.type === 'text') drawL = Object.assign({}, L, { text: fxo.textOut });
        if (fxo.dx || fxo.dy || fxo.ang || fxo.sx !== 1 || fxo.sy !== 1) X = layerXf(project, L, t, new Set(), false, fxo);
        alpha *= fxo.alphaMul;
        alpha = clamp(alpha, 0, 1);
        for (const e of entries) {
          const d = FXCatalog.byId[e.id];
          if (d.hasGL) needsGL = true;
          if (d.needsComp) needsComp = true;
          if (d.overdraw) pad = Math.max(pad, Math.round((d.maxOverdraw || 0.1) * Math.min(w, h)));
        }
      }
    }

    if (needsGL && FXEngine.init()) {
      // 1) layer content into the fx source canvas (comp-sized, padded when overdraw)
      const W = w + pad * 2, H = h + pad * 2;
      const src = maskCanvas(2);
      if (src.width !== W || src.height !== H) { src.width = W; src.height = H; }
      const sctx = src.getContext('2d');
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'source-over';
      sctx.clearRect(0, 0, W, H);
      sctx.save();
      sctx.translate(pad, pad);
      drawCompPre(sctx, project, t, camT);
      drawLayerContent(sctx, drawL, t, X.m, note);
      sctx.restore();
      // 2) comp snapshot (under-layers as displayed)
      let compCv = null;
      if (needsComp) {
        compCv = maskCanvas(3);
        if (compCv.width !== w || compCv.height !== h) { compCv.width = w; compCv.height = h; }
        const ccx = compCv.getContext('2d');
        ccx.setTransform(1, 0, 0, 1, 0, 0);
        ccx.globalAlpha = 1; ccx.globalCompositeOperation = 'source-over';
        ccx.clearRect(0, 0, w, h);
        ccx.drawImage(ctx.canvas, 0, 0, w, h);
      }
      // 3) GL chain
      const has3dEffect = entries.some(e => (FXCatalog.byId[e.id] || {}).category === '3d');
      const effectBounds = has3dEffect ? layerCornerBBox(project, L, t, X) : null;
      const [lW, lH] = contentSize(L);
      const vel = fxEnvVelocity(L, t, project.fps);
      const out = FXEngine.processLayer(src, entries, {
        W, H,
        layerW: lW || w, layerH: lH || h,
        layerMatrix: X.m,
        layerScaleX: (X.o ? (X.o.scale * (X.o.scaleX != null ? X.o.scaleX : 1)) : 1),
        layerScaleY: (X.o ? (X.o.scale * (X.o.scaleY != null ? X.o.scaleY : 1)) : 1),
        layerPivotX: (X.o && X.o.ax) || 0,
        layerPivotY: (X.o && X.o.ay) || 0,
        pad,
        time: (layerTime(L, t) - (L.tOff || 0)) / Math.max(L.duration, 1e-6),
        paramTime: layerTime(L, t),
        startTime: L.start || 0,
        endTime: (L.start || 0) + (L.duration || 1),
        projectWidth: project.width,
        projectHeight: project.height,
        compTex: compCv,
        velocity: vel.velocity,
        velocityVec: vel.velocityVec,
        angularVelocity: vel.angularVelocity,
        scaleVelocity: vel.scaleVelocity,
        layerRect: effectBounds && {
          x: effectBounds.x + pad, y: effectBounds.y + pad,
          w: effectBounds.w, h: effectBounds.h
        }
      });
      if (out) {
        if (maskFor[L.id]) {
          // masked layer: composite (effect output ∩ mask) onto main
          if (temp.width !== w || temp.height !== h) { temp.width = w; temp.height = h; }
          tctx.setTransform(1, 0, 0, 1, 0, 0);
          tctx.globalCompositeOperation = 'source-over';
          tctx.globalAlpha = 1;
          tctx.clearRect(0, 0, w, h);
          tctx.drawImage(out, -pad, -pad);
          const ML = maskFor[L.id];
          const MX = layerXf(project, ML, t);
          tctx.globalCompositeOperation = 'destination-in';
          tctx.save();
          drawCompPre(tctx, project, t, camT);
          drawLayerContent(tctx, ML, t, MX.m, note);
          tctx.restore();
          tctx.globalCompositeOperation = 'source-over';
          ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = blend;
          ctx.drawImage(temp, 0, 0); ctx.restore();
          continue;
        }
        ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = blend;
        ctx.drawImage(out, -pad, -pad); ctx.restore();
        continue;
      }
      // GL produced nothing — fall through to the normal path with drawL/alpha
    }

    if (maskFor[L.id]) {
      const ML = maskFor[L.id];
      if (temp.width !== w || temp.height !== h) { temp.width = w; temp.height = h; }
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.globalCompositeOperation = 'source-over';
      tctx.globalAlpha = 1;
      tctx.clearRect(0, 0, w, h);
      tctx.save();
      drawCompPre(tctx, project, t, camT);
      drawLayerContent(tctx, L, t, X.m, note);
      tctx.restore();
      const MX = layerXf(project, ML, t);
      if (ML.maskMode === 'alpha-invert' || ML.maskMode === 'exclude') {
        // invert the mask alpha, then intersect
        if (inv.width !== w || inv.height !== h) { inv.width = w; inv.height = h; }
        const ic = inv.getContext('2d');
        ic.setTransform(1, 0, 0, 1, 0, 0);
        ic.globalCompositeOperation = 'source-over';
        ic.globalAlpha = 1;
        ic.clearRect(0, 0, w, h);
        ic.fillStyle = '#fff'; ic.fillRect(0, 0, w, h);
        ic.globalCompositeOperation = 'destination-out';
        ic.save();
        drawCompPre(ic, project, t, camT);
        drawLayerContent(ic, ML, t, MX.m, note);
        ic.restore();
        ic.globalCompositeOperation = 'source-over';
        tctx.globalCompositeOperation = 'destination-in';
        tctx.drawImage(inv, 0, 0);
        tctx.globalCompositeOperation = 'source-over';
      } else {
        tctx.globalCompositeOperation = 'destination-in';
        tctx.save();
        drawCompPre(tctx, project, t, camT);
        drawLayerContent(tctx, ML, t, MX.m, note);
        tctx.restore();
        tctx.globalCompositeOperation = 'source-over';
      }
      ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = blend;
      ctx.drawImage(temp, 0, 0); ctx.restore();
      continue;
    }

    if (L.type === 'group') {
      const members = project.layers.filter(x => groupOf[x.id] === L.id);
      if (!members.length) continue;

      const grpW = L.w || project.width;
      const grpH = L.h || project.height;

      // Group offscreen canvas
      const grpCv = maskCanvas(4);
      if (grpCv.width !== grpW || grpCv.height !== grpH) { grpCv.width = grpW; grpCv.height = grpH; }
      const gctx = grpCv.getContext('2d');
      gctx.setTransform(1, 0, 0, 1, 0, 0);
      gctx.globalAlpha = 1;
      gctx.globalCompositeOperation = 'source-over';
      gctx.clearRect(0, 0, grpW, grpH);

      // Render members bottom-to-top (reverse of topmost-first order in project.layers)
      for (let j = members.length - 1; j >= 0; j--) {
        const sub = members[j];
        if (!sub.visible || !activeAt(sub, t)) continue;

        const subX = layerXf(project, sub, t, new Set(), true);
        const subAlpha = clamp(subX.o.opacity / 100, 0, 1);
        const subM = mmul(mT(grpW / 2, grpH / 2), subX.m);

        gctx.save();
        gctx.globalAlpha = subAlpha;
        if (sub.maskMode === 'mask') {
          gctx.globalCompositeOperation = 'destination-in';
        } else if (sub.maskMode === 'exclude' || sub.maskMode === 'alpha-invert') {
          gctx.globalCompositeOperation = 'destination-out';
        } else {
          gctx.globalCompositeOperation = sub.blend === 'normal' ? 'source-over' : sub.blend;
        }

        drawLayerContent(gctx, sub, t, subM, note);
        gctx.restore();
      }

      // Group effects (e.g. flip3, blur, etc.)
      let finalGroupCv = grpCv;
      if (L.effects && L.effects.length && FXCatalog.ready) {
        const entries = L.effects.filter(e => e && e.enabled && FXCatalog.byId[e.id]);
        if (entries.length && FXEngine.init()) {
          const vel = fxEnvVelocity(L, t, project.fps);
          const scrEnv = Object.assign({
            time: (layerTime(L, t) - (L.tOff || 0)) / Math.max(L.duration, 1e-6),
            paramTime: layerTime(L, t),
            duration: L.duration,
            fps: project.fps,
            frame: Math.floor(t * project.fps)
          }, vel);
          for (const e of entries) e._env = scrEnv;
          const fxo = FXEngine.runScripts(L, entries);
          alpha *= fxo.alphaMul;
          alpha = clamp(alpha, 0, 1);

          const out = FXEngine.processLayer(grpCv, entries, {
            W: grpW, H: grpH,
            layerW: grpW, layerH: grpH,
            layerMatrix: X.m,
            layerScaleX: (X.o ? (X.o.scale * (X.o.scaleX != null ? X.o.scaleX : 1)) : 1),
            layerScaleY: (X.o ? (X.o.scale * (X.o.scaleY != null ? X.o.scaleY : 1)) : 1),
            layerPivotX: (X.o && X.o.ax) || 0,
            layerPivotY: (X.o && X.o.ay) || 0,
            pad: 0,
            time: (layerTime(L, t) - (L.tOff || 0)) / Math.max(L.duration, 1e-6),
            paramTime: layerTime(L, t),
            startTime: L.start || 0,
            endTime: (L.start || 0) + (L.duration || 1),
            projectWidth: project.width,
            projectHeight: project.height,
            velocity: vel.velocity,
            velocityVec: vel.velocityVec,
            angularVelocity: vel.angularVelocity,
            scaleVelocity: vel.scaleVelocity
          });
          if (out) finalGroupCv = out;
        }
      }

      // Draw composite group canvas to main ctx
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = blend;
      mToCtx(ctx, X.m);
      ctx.drawImage(finalGroupCv, -grpW / 2, -grpH / 2);
      ctx.restore();
      continue;
    }

    if (L.type === 'audio') continue;
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = blend;
    drawLayerContent(ctx, L, t, X.m, note);
    ctx.restore();
  }

  ctx.restore();
  if (opts.grid) {
    ctx.save(); ctx.globalAlpha = .5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(w * i / 8, 0); ctx.lineTo(w * i / 8, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h * i / 8); ctx.lineTo(w, h * i / 8); ctx.stroke();
    }
    ctx.strokeRect(w * 0.05, h * 0.05, w * .9, h * .9);
    ctx.strokeRect(w * 0.1, h * 0.1, w * .8, h * .8);
    ctx.restore();
  }
}

function applyCamera(ctx, camT, w, h) {
  if (!camT) return;
  ctx.save();
  ctx.translate(w / 2, h / 2); ctx.rotate(camT.rot * Math.PI / 180); ctx.scale(camT.zoom, camT.zoom);
  ctx.translate(-w / 2 - camT.x, -h / 2 - camT.y);
}
function drawCompPre(ctx, project, t, camT) {
  ctx.save();
  if (camT) {
    const w = project.width, h = project.height;
    ctx.translate(w / 2, h / 2); ctx.rotate(camT.rot * Math.PI / 180); ctx.scale(camT.zoom, camT.zoom);
    ctx.translate(-w / 2 - camT.x, -h / 2 - camT.y);
  }
}

// draw a single layer's visual with pre-composed matrix
function drawLayerContent(ctx, layer, t, matrix, note) {
  ctx.save();
  mToCtx(ctx, matrix);
  project$t: {
    const pr = note && note.project;
    const sh = layer.shadow;
    const shadowOn = sh && sh.on && sh.blur >= 0 && (sh.opacity > 0);
    if (shadowOn) {
      ctx.shadowColor = hexA(sh.color, sh.opacity / 100);
      ctx.shadowBlur = Math.max(0, sh.blur || 0);
      ctx.shadowOffsetX = sh.x || 0;
      ctx.shadowOffsetY = sh.y || 0;
    }
    switch (layer.type) {
      case 'shape': {
        const p = shapePath(layer);
        if (layer.fill && layer.shape !== 'line') {
          const fs = fillStyleFor(ctx, layer);
          if (fs) { ctx.fillStyle = fs; ctx.fill(p); }
        }
        if (layer.stroke.width > 0) {
          ctx.strokeStyle = layer.stroke.color; ctx.lineWidth = layer.stroke.width; ctx.stroke(p);
        }
        break;
      }
      case 'text': {
        ctx.font = `${layer.weight} ${layer.size}px "${layer.font}", Arial`;
        ctx.fillStyle = layer.color;
        ctx.textBaseline = 'middle';
        const lines = textLines(layer), lh = layer.size * 1.25;
        const total = lines.length * lh;
        const al = layer.align || 'center';
        ctx.textAlign = al;
        lines.forEach((ln, i) => ctx.fillText(ln, al === 'left' ? -contentSize(layer)[0] / 2 : al === 'right' ? contentSize(layer)[0] / 2 : 0, -total / 2 + (i + 0.5) * lh));
        break;
      }
      case 'image': {
        const img = imageEl(layer);
        if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        break;
      }
      case 'video': {
        const v = videoEl(layer);
        const fr = cachedVideoFrame(layer, v);
        if (fr) ctx.drawImage(fr, -fr.width / 2, -fr.height / 2);
        else if (v && v.readyState >= 2 && v.videoWidth) ctx.drawImage(v, -v.videoWidth / 2, -v.videoHeight / 2);
        break;
      }
      case 'freehand': {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const s of layer.strokes) {
          if (s.fill && s.pts.length > 2) {
            ctx.fillStyle = s.fill; ctx.beginPath();
            s.pts.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]));
            ctx.closePath(); ctx.fill();
          }
          if (s.pts.length > 1) {
            ctx.strokeStyle = s.color; ctx.lineWidth = s.size; ctx.beginPath();
            s.pts.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]));
            ctx.stroke();
          }
        }
        break;
      }
      case 'vector': {
        if (layer.points.length > 2) {
          ctx.beginPath();
          layer.points.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]));
          if (layer.closed !== false) ctx.closePath();
          if (layer.fillOn) { ctx.fillStyle = layer.color; ctx.globalAlpha *= .6; ctx.fill(); ctx.globalAlpha /= .6; }
          if (layer.sw > 0) { ctx.strokeStyle = layer.color; ctx.lineWidth = layer.sw; ctx.stroke(); }
        }
        break;
      }
      case 'group': case 'audio': case 'null': case 'camera': break;
    }
    // border: shape layers already stroke their own outline (L.stroke), everything else
    // gets a frame drawn around its content box
    const bd = layer.border;
    if (bd && bd.on && layer.type !== 'shape' && layer.type !== 'group' && layer.type !== 'camera' && layer.type !== 'audio' && layer.type !== 'null') {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = bd.color || '#ffffff';
      ctx.lineWidth = Math.max(0.5, bd.width || 0);
      const [cw, ch] = contentSize(layer);
      const r = Math.max(0, Math.min(bd.radius || 0, Math.min(cw, ch) / 2));
      const half = ctx.lineWidth / 2;
      ctx.beginPath();
      if (r > 0) {
        const x0 = -cw / 2 - half, y0 = -ch / 2 - half, w0 = cw + ctx.lineWidth, h0 = ch + ctx.lineWidth;
        ctx.moveTo(x0 + r, y0);
        ctx.arcTo(x0 + w0, y0, x0 + w0, y0 + h0, r); ctx.arcTo(x0 + w0, y0 + h0, x0, y0 + h0, r);
        ctx.arcTo(x0, y0 + h0, x0, y0, r); ctx.arcTo(x0, y0, x0 + w0, y0, r);
        ctx.closePath();
      } else {
        ctx.rect(-cw / 2 - half, -ch / 2 - half, cw + ctx.lineWidth, ch + ctx.lineWidth);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

// layer bounds corners in comp space at time t (approx from content box)
function layerCornerBBox(project, layer, t, transform = null) {
  // Callers rendering an effect can supply the already-scripted transform.
  const X = transform || layerXf(project, layer, t);
  const [w0, h0] = (layer.type === 'group') ? [groupBBox(project, layer, t)] : contentSize(layer);
  let bw, bh;
  if (layer.type === 'group') { bw = w0[0]; bh = w0[1]; } else { bw = w0; bh = h0; }
  const pts = [mApply(X.m, -bw / 2, -bh / 2), mApply(X.m, bw / 2, -bh / 2), mApply(X.m, bw / 2, bh / 2), mApply(X.m, -bw / 2, bh / 2)];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), pts };
}
function groupBBox(project, group, t) {
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, got = false;
  for (const id of group.memberIds) {
    const L = getLayer(project, id);
    if (!L || L.type === 'audio' || !L.visible || !activeAt(L, t)) continue;
    const b = layerCornerBBox(project, L, t);
    got = true;
    minx = Math.min(minx, b.x); miny = Math.min(miny, b.y); maxx = Math.max(maxx, b.x + b.w); maxy = Math.max(maxy, b.y + b.h);
  }
  if (!got) return [200, 200];
  return [maxx - minx, maxy - miny];
}
// topmost layer under a comp-space point
function layerAtPoint(project, x, y, t) {
  for (const L of project.layers) {
    if (!L.visible || !activeAt(L, t) || L.type === 'audio' || L.type === 'camera') continue;
    if (L.type === 'group') continue;
    const X = layerXf(project, L, t);
    const inv = minv(X.m); if (!inv) continue;
    const [lx, ly] = mApply(inv, x, y);
    const [w0, h0] = contentSize(L);
    if (lx >= -w0 / 2 - 6 && lx <= w0 / 2 + 6 && ly >= -h0 / 2 - 6 && ly <= h0 / 2 + 6) return L;
  }
  return null;
}
function minv(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return null;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

// ---------- media sync during playback / scrub ----------
// hysteresis: while playing we tolerate small native drift and never re-seek
// while a seek is already in flight — that is what caused the stutter.
function syncMediaEl(el, layer, t, playing, maxAttr) {
  if (!el.src) return;
  const sp = clamp(layer.speed || 1, 0.0625, 16);
  const lt = layerTime(layer, t);          // content time: speed + trim offset
  const dur = isFinite(el.duration) ? el.duration : 0;
  const target = clamp(lt, 0, dur || Math.max(0, lt));
  const v = propAt(layer, 'volume', lt);
  const vol = clamp(v, 0, 100) / 100;
  if (Math.abs(el.volume - vol) > 0.008) el.volume = vol;
  if (Math.abs((el.playbackRate || 1) - sp) > 1e-3) { try { el.playbackRate = sp; } catch { } }
  const live = playing && layer.visible && activeAt(layer, t);
  if (live) {
    // only correct meaningful drift; respects seeking state
    if (!el.seeking && Math.abs(el.currentTime - target) > 0.35) {
      try { el.currentTime = target; } catch { }
    }
    if (el.paused) { el.play().catch(() => { }); }
  } else {
    if (!el.paused) el.pause();
    if (!el.seeking && Math.abs(el.currentTime - target) > 0.05) {
      try {
        el.currentTime = target;
        el.addEventListener('seeked', () => {
          cachedVideoFrame(layer, el);
          if (typeof Editor !== 'undefined' && !Editor.playing) Editor.draw();
        }, { once: true });
      } catch { }
    }
  }
}
function syncMedia(project, t, playing) {
  for (const L of project.layers) {
    if (L.type === 'video') syncMediaEl(videoEl(L), L, t, playing);
    if (L.type === 'audio') syncMediaEl(audioEl(L), L, t, playing);
  }
}
async function syncMediaForRender(project, t) {
  if (!project || !project.layers) return;
  const videoLayers = project.layers.filter(L => L.type === 'video' && L.src && L.visible !== false && activeAt(L, t));
  if (!videoLayers.length) return;

  await Promise.all(videoLayers.map(L => {
    return new Promise(resolve => {
      const v = videoEl(L);
      if (!v) return resolve();

      const lt = layerTime(L, t);
      const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : (L.duration || 0);
      let target = lt;
      if (dur > 0) {
        if (L.loop || v.loop) {
          target = ((target % dur) + dur) % dur;
        } else {
          target = clamp(target, 0, Math.max(0, dur - 0.001));
        }
      } else {
        target = Math.max(0, target);
      }

      const ensureMetadata = cb => {
        if (v.readyState >= 1) return cb();
        const onMeta = () => { v.removeEventListener('loadedmetadata', onMeta); cb(); };
        v.addEventListener('loadedmetadata', onMeta, { once: true });
        setTimeout(cb, 300);
      };

      ensureMetadata(() => {
        if (Math.abs(v.currentTime - target) < 0.003 && v.readyState >= 2) {
          cachedVideoFrame(L, v);
          return resolve();
        }

        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          v.removeEventListener('seeked', onSeeked);
          clearTimeout(timer);
          cachedVideoFrame(L, v);
          resolve();
        };

        const onSeeked = () => {
          if ('requestVideoFrameCallback' in v) {
            v.requestVideoFrameCallback(() => finish());
          } else {
            setTimeout(finish, 15);
          }
        };

        const timer = setTimeout(finish, 200);
        v.addEventListener('seeked', onSeeked, { once: true });

        try {
          if (!v.paused) v.pause();
          v.currentTime = target;
        } catch (e) {
          finish();
        }
      });
    });
  }));
}
function mediaReady(project) { void project; }

// ---------- waveform ----------
async function audioPeaks(layer) {
  if (!layer.src) return null;
  try {
    const r = await fetch(layer.src); const ab = await r.arrayBuffer();
    const ac = new AudioContext();
    const buf = await ac.decodeAudioData(ab);
    const d = buf.getChannelData(0), bins = 120, out = [], step = Math.floor(d.length / bins) || 1;
    for (let i = 0; i < bins; i++) {
      let mx = 0;
      for (let j = i * step; j < (i + 1) * step && j < d.length; j += 8) mx = Math.max(mx, Math.abs(d[j]));
      out.push(mx);
    }
    ac.close();
    return out;
  } catch (e) { return null; }
}
function drawWaveRow(canvas, layer, peaks, color = '#c8f2ff') {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!peaks) return;
  ctx.fillStyle = color;
  const n = peaks.length, bw = Math.max(2, Math.floor(w / n));
  for (let i = 0; i < n; i++) {
    const bh = Math.max(2, peaks[i] * h * 0.92);
    ctx.fillRect(i * bw, (h - bh) / 2, bw * .72, bh);
  }
}

// ---------- thumbnail ----------
function renderThumb(project, t = null, maxW = 320) {
  const t0 = t != null ? t : firstContentTime(project);
  const c = document.createElement('canvas');
  c.width = Math.round(maxW); c.height = Math.round(maxW * project.height / project.width);
  const ctx = c.getContext('2d');
  renderComp(ctx, project, clamp(t0, 0, project.duration), {});
  return c;
}
function firstContentTime(project) {
  let t0 = Infinity;
  for (const L of project.layers) if (L.type !== 'audio' && L.type !== 'camera') t0 = Math.min(t0, L.start);
  return isFinite(t0) ? t0 : 0;
}
