// ui-editor.js — editor screen: stage, playback, timeline, toolbar, add-menu, settings, export
/* global Storage, Modals, toast, showContext, bindSwatch, readDataURL, download */

const Editor = {
  project: null,
  selId: null,
  playing: false,
  t: 0,
  zoom: 1,            // preview zoom
  pps: 120,           // timeline px per second
  gutterWidth: 100,   // left gutter width for eye/type/drag-handle
  undoStack: [], redoStack: [],
  clipboard: null,
  raf: null,

  async open(project) {
    Editor.project = project;
    Editor.selId = null;
    Editor.t = 0;
    Editor.playing = false;
    Editor.undoStack = []; Editor.redoStack = [];
    document.getElementById('home-screen').classList.remove('active');
    document.getElementById('editor-screen').classList.add('active');
    document.getElementById('ed-title').value = project.name;
    Editor.render();
    Editor.startLoop();
    await Editor.save();
  },
  async backgroundSave() { /* periodic */ },
  async save() {
    const p = Editor.project;
    p.thumb = renderThumb(p, Editor.t).toDataURL('image/png');
    p.updated = Date.now();
    await Storage.put('projects', p);
  },

  // ---------- undo ----------
  pushUndo() {
    Editor.undoStack.push(JSON.stringify(Editor.project));
    if (Editor.undoStack.length > 60) Editor.undoStack.shift();
    Editor.redoStack.length = 0;
  },
  undo() {
    if (!Editor.undoStack.length) return toast('Nothing to undo');
    Editor.redoStack.push(JSON.stringify(Editor.project));
    Editor.project = JSON.parse(Editor.undoStack.pop());
    Editor.selId = null;
    Editor.render();
  },
  redo() {
    if (!Editor.redoStack.length) return toast('Nothing to redo');
    Editor.undoStack.push(JSON.stringify(Editor.project));
    Editor.project = JSON.parse(Editor.redoStack.pop());
    Editor.selId = null;
    Editor.render();
  },
  sel() { return Editor.project ? getLayer(Editor.project, Editor.selId) : null; },

  // ---------- render ----------
  render() {
    const p = Editor.project;
    Editor.fitStage();
    Editor.renderTimeline();
    Editor.renderTransport();
    document.getElementById('ed-title').value = p.name;
    if (typeof Props !== 'undefined') Props.render();
    if (typeof SelBar !== 'undefined') SelBar.render(Editor.sel());
  },
  fitStage() {
    const p = Editor.project;
    const wrap = document.getElementById('canvas-wrap') || document.querySelector('.preview-area');
    const stage = document.getElementById('stage');
    if (!p || !wrap || !stage) return;
    stage.width = p.width; stage.height = p.height;
    const aw = Math.max(60, wrap.clientWidth - 40);
    const ah = Math.max(60, wrap.clientHeight - 40);
    const fit = Math.min(aw / p.width, ah / p.height);
    const z = fit * Editor.zoom;
    stage.style.width = (p.width * z) + 'px';
    stage.style.height = (p.height * z) + 'px';
    stage._z = z;
    const zval = document.getElementById('lb-zval');
    if (zval) zval.textContent = Math.round(Editor.zoom * 100) + '%';
  },
  renderTransport() {
    const p = Editor.project;
    document.getElementById('t-end-input').value = p.duration;
    document.getElementById('t-paste').hidden = !Editor.clipboard;
  },

  // ---------- stage ----------
  draw() {
    const p = Editor.project;
    const stage = document.getElementById('stage');
    const ctx = stage.getContext('2d');
    renderComp(ctx, p, Editor.t, { grid: Editor._grid });
    Editor.updateSelBox();
  },
  updateSelBox() {
    const box = document.getElementById('sel-box');
    const L = Editor.sel();
    if (!L || L.type === 'camera' || L.type === 'audio' || Editor._tool !== 'select') { box.hidden = true; return; }
    const b = layerCornerBBox(Editor.project, L, Editor.t);
    const stage = document.getElementById('stage');
    const z = stage._z || 1;
    box.style.left = (stage.offsetLeft + b.x * z - 0) + 'px';
    box.style.top = (stage.offsetTop + b.y * z - 0) + 'px';
    box.style.width = (b.w * z) + 'px';
    box.style.height = (b.h * z) + 'px';
    box.hidden = false;
  },

  // ---------- preview interaction ----------
  stageInit() {
    const stage = document.getElementById('stage');
    stage.addEventListener('pointerdown', e => {
      const p = Editor.project; if (!p) return;
      if (Editor._tool !== 'select') return;
      const r = stage.getBoundingClientRect();
      const z = stage._z || 1;
      const cx = (e.clientX - r.left) / z, cy = (e.clientY - r.top) / z;
      const L = layerAtPoint(p, cx, cy, Editor.t);
      if (!L) { if (Editor.selId) Editor.select(null); return; }
      Editor.select(L.id);
      if (L.locked) return;
      const X = layerXf(p, L, Editor.t);
      const lt = layerTime(L, Editor.t);
      const startX = propAt(L, 'x', lt), startY = propAt(L, 'y', lt);
      const px = e.clientX, py = e.clientY;
      Editor.pushUndo();
      const move = ev => {
        const dx = (ev.clientX - px) / z, dy = (ev.clientY - py) / z;
        // in-layer coords: compensate rotation/scale around center
        const ang = -X.o.rot * Math.PI / 180;
        const mx = dx * Math.cos(ang) - dy * Math.sin(ang);
        const my = dx * Math.sin(ang) + dy * Math.cos(ang);
        const nx = startX + mx / (X.o.scale || 1), ny = startY + my / (X.o.scale || 1);
        if (hasKf(L, 'x') || hasKf(L, 'y')) {
          setKf(L, 'x', lt, nx); setKf(L, 'y', lt, ny);
        } else { if ('x' in L.tf) L.tf.x = nx; if ('y' in L.tf) L.tf.y = ny; }
        if (typeof Props !== 'undefined' && Props.refreshAnimatedValues) Props.refreshAnimatedValues();
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); Editor.save(); Props.render(); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      e.preventDefault();
    });
  },

  select(id) {
    Editor.selId = id;
    const rows = document.querySelectorAll('.trow');
    rows.forEach(r => r.classList.toggle('sel', r.dataset.layer === id));
    const bars = document.querySelectorAll('.bar');
    bars.forEach(b => b.classList.toggle('sel', b.dataset.layer === id));
    Props.render();
    Editor.updateSelBox();
    const sel = Editor.sel();
    document.querySelectorAll('.rd-btn').forEach(b => b.classList.toggle('active', !!sel));
    if (typeof SelBar !== 'undefined') SelBar.render(sel);
  },

  // ---------- playback ----------
  startLoop() {
    cancelAnimationFrame(Editor.raf);
    let lastTs = 0;
    const step = (ts) => {
      const p = Editor.project;
      if (p) {
        // wall-clock delta — rAF runs at display rate; fixed 1/fps ticks anywhere
        // above the frame rate would guessing-speed playback and re-seek forever.
        const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.12) : 0;
        lastTs = ts;
        if (Editor.playing) {
          Editor.t += dt;
          if (Editor.t > p.duration) Editor.t = 0;
        }
        Editor.draw();
        syncMedia(p, Editor.t, Editor.playing);
        Editor.renderTransportLive();
      }
      Editor.raf = requestAnimationFrame(step);
    };
    Editor.raf = requestAnimationFrame(step);
  },
  renderTransportLive() {
    const p = Editor.project;
    if (!p) return;
    const timeEl = document.getElementById('tl-time');
    if (timeEl && !timeEl.querySelector('input')) {
      timeEl.textContent = fmtTime(Editor.t, p.fps);
    }
    const ph = document.getElementById('tl-playhead');
    if (ph) ph.style.left = (Editor.gutterWidth + Editor.t * Editor.pps) + 'px';
    Editor.drawRuler();
    if (typeof SelBar !== 'undefined') SelBar.tick();
    if (typeof Props !== 'undefined' && Props.refreshAnimatedValues) Props.refreshAnimatedValues();
  },
  seek(t) {
    const p = Editor.project;
    if (!p) return;
    Editor.t = clamp(t, 0, p.duration);
    syncMedia(p, Editor.t, false);
    const timeEl = document.getElementById('tl-time');
    if (timeEl && !timeEl.querySelector('input')) {
      timeEl.textContent = fmtTime(Editor.t, p.fps);
    }
    const ph = document.getElementById('tl-playhead');
    if (ph) ph.style.left = (Editor.gutterWidth + Editor.t * Editor.pps) + 'px';
    Editor.draw();
    Editor.drawRuler();
    if (typeof SelBar !== 'undefined' && SelBar.tick) SelBar.tick();
    if (typeof Props !== 'undefined' && Props.refreshAnimatedValues) Props.refreshAnimatedValues();
  },
  togglePlay() {
    Editor.playing = !Editor.playing;
    document.querySelector('#t-play .i-play').hidden = Editor.playing;
    document.querySelector('#t-play .i-pause').hidden = !Editor.playing;
    if (Editor.playing && Editor.t >= Editor.project.duration - 1 / Editor.project.fps) Editor.t = 0;
  },

  // ---------- timeline ----------
  renderTimeline() {
    const p = Editor.project;
    if (!p) return;
    const totalW = Math.max(400, Math.round(Editor.gutterWidth + p.duration * Editor.pps + 220));
    const rows = document.getElementById('tl-rows');
    rows.innerHTML = '';
    const dropLine = document.createElement('div');
    dropLine.id = 'tl-drop-line';
    dropLine.className = 'tl-drop-line';
    dropLine.hidden = true;
    rows.appendChild(dropLine);

    rows.style.width = totalW + 'px';
    const rul = document.getElementById('tl-ruler');
    rul.width = totalW;
    rul.style.width = totalW + 'px';
    const endInp = document.getElementById('t-end-input');
    if (endInp) endInp.value = Math.round(p.duration);
    const scroll = document.getElementById('tl-scroll');
    const visW = scroll ? scroll.clientWidth : 800;
    // rows topmost first
    for (let i = 0; i < p.layers.length; i++) {
      const L = p.layers[i];
      rows.appendChild(Editor.rowEl(L, p, visW));
    }
    Editor.renderTransportLive();
  },
  rowEl(L, p, visW) {
    const row = document.createElement('div');
    row.className = 'trow' + (L.id === Editor.selId ? ' sel' : '');
    row.dataset.layer = L.id;

    // Gutter: [Eye] [Type-Symbol] [Three-Lines Reorder Handle]
    const gut = document.createElement('div');
    gut.className = 'tgut';
    const eye = document.createElement('div');
    eye.className = 'eye' + (L.visible ? '' : ' off');
    eye.innerHTML = `<svg viewBox="0 0 24 24"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>`;
    eye.title = 'Toggle visibility';
    eye.onclick = e => {
      e.stopPropagation();
      L.visible = !L.visible;
      eye.classList.toggle('off', !L.visible);
      Editor.draw();
    };

    const trail = document.createElement('div');
    trail.className = 'trailicon';
    trail.title = L.type ? (L.type.toUpperCase() + ' layer') : 'Layer';
    if (L.type === 'image' && L.src) trail.innerHTML = `<img src="${L.src}">`;
    else {
      const label = L.type === 'text' ? 'Aa' : L.type === 'camera' ? 'CAM' : L.type === 'null' ? '◇' : L.type === 'group' ? '▣' : L.type === 'shape' ? '▭' : L.type === 'audio' ? '♪' : L.type === 'video' ? ' ▷' : L.type === 'freehand' ? '✎' : '∿';
      trail.textContent = label;
    }

    const grip = document.createElement('div');
    grip.className = 'layer-drag-handle';
    grip.title = 'Hold & drag up or down to reorder layers';
    grip.innerHTML = '<i></i><i></i><i></i>';
    initLayerDragReorder(grip, row, L, p);

    gut.appendChild(eye);
    gut.appendChild(trail);
    gut.appendChild(grip);
    row.appendChild(gut);

    // Track bar (positioned beside gutter, never on top)
    const bar = document.createElement('div');
    bar.className = 'bar' + (L.id === Editor.selId ? ' sel' : '') + (L.type === 'camera' ? ' camera' : '');
    bar.dataset.layer = L.id;
    bar.style.left = (Editor.gutterWidth + L.start * Editor.pps) + 'px';
    bar.style.width = Math.max(14, L.duration * Editor.pps) + 'px';
    const bl = document.createElement('div');
    bl.className = 'blabel';
    bl.textContent = L.name;
    bar.appendChild(bl);
    if (L.type === 'audio' || L.type === 'video') {
      const cv = document.createElement('canvas');
      cv.width = Math.max(14, Math.round(L.duration * Editor.pps)); cv.height = 28;
      cv.className = 'wave';
      bar.appendChild(cv);
      audioPeaks(L).then(pk => pk && drawWaveRow(cv, L, pk, L.type === 'audio' ? '#d6fbff' : '#eaffff'));
    }
    if (L.parentId) bar.style.outline = '1.5px dashed rgba(255,255,255,.5)';
    row.appendChild(bar);

    bar.addEventListener('pointerdown', e => {
      if (e.target.closest === undefined) return;
      if (L.locked) return;
      e.preventDefault();
      Editor.select(L.id);
      const r = bar.getBoundingClientRect();
      const leftZone = e.clientX - r.left < 12, rightZone = r.right - e.clientX < 12;
      const startX = L.start, startDur = L.duration, sx = e.clientX;
      Editor.pushUndo();
      const move = ev => {
        const dx = (ev.clientX - sx) / Editor.pps;
        if (leftZone) {
          const ns = clamp(startX + dx, 0, startX + startDur - 0.05);
          L.duration = startDur + (startX - ns);
          L.start = ns;
        } else if (rightZone) {
          L.duration = Math.max(0.05, startDur + dx);
          if (L.type === 'video' || L.type === 'audio') { /* may exceed media len — ok, loops */ }
        } else {
          L.start = Math.max(0, startX + dx);
        }
        bar.style.left = (Editor.gutterWidth + L.start * Editor.pps) + 'px';
        bar.style.width = Math.max(14, L.duration * Editor.pps) + 'px';
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); Props.render(); Editor.save(); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });

    row.addEventListener('contextmenu', e => {
      e.preventDefault();
      Editor.layerMenu(L, e.clientX, e.clientY);
    });

    if (groupOfLayer(Editor.project, L.id)) gut.style.paddingLeft = '18px';
    return row;
  },
  layerMenu(L, x, y) {
    const p = Editor.project;
    const items = [
      ['Replace Media…', () => Editor.replaceMedia(L)],
      ['Rename', () => { const n = prompt('Layer name', L.name); if (n) { L.name = n; Editor.renderTimeline(); } }],
      ['Move & Transform', () => { Editor.select(L.id); Props.openSection('transform') }],
      ['Color & Fill', () => { Editor.select(L.id); Props.openSection('color') }],
      ['Blending & Opacity', () => { Editor.select(L.id); Props.openSection('blend') }],
      ['Keyframes', () => { Editor.select(L.id); Keyframes.open() }],
      ['—'],
      ['Copy Layer', () => { Editor.clipboard = deep(L); delete Editor.clipboard.id; toast('Layer copied'); Editor.renderTransport(); }],
      ['Paste In Front', Editor.clipboard ? () => Editor.pasteLayer(true) : null],
      ['Duplicate', () => { Editor.pushUndo(); const c = deep(L); c.id = uid(); c.name += ' copy'; c.start = Editor.t; const i = indexOfLayer(p, L.id); p.layers.splice(i, 0, c); Editor.select(c.id); Editor.renderTimeline(); Editor.save(); }],
      ['Split At Playhead', () => {
        if (typeof SelBar !== 'undefined') { Editor.select(L.id); SelBar.split(L); return; }
        if (Editor.t <= L.start || Editor.t >= layerEnd(L)) return toast('Move playhead inside the layer first');
        Editor.pushUndo();
        const right = deep(L); right.id = uid();
        right.start = Editor.t; right.duration = layerEnd(L) - Editor.t;
        right.name = L.name + ' 2';
        L.duration = Editor.t - L.start;
        const i = indexOfLayer(p, L.id); p.layers.splice(i, 0, right);
        Editor.renderTimeline(); Editor.save();
      }],
      ['Trim Start To Playhead', () => { Editor.select(L.id); if (typeof SelBar !== 'undefined') SelBar.trimStart(L); }],
      ['Trim End To Playhead', () => { Editor.select(L.id); if (typeof SelBar !== 'undefined') SelBar.trimEnd(L); }],
      ['Speed / Time Remapping…', () => { Editor.select(L.id); if (typeof SelBar !== 'undefined') SelBar.speedMenu(L, null); }],
      ['Border & Shadow', () => { Editor.select(L.id); Props.openSection('border'); }],
      ['Save as Element', () => Editor.saveElement(L)],
      ['Set Parent', () => ParentPicker.open(L)],
      ['Masking', () => MaskPicker.open(L)],
      (FXUI.isEffectable(L) ? ['Effects…', () => { FXUI.open(); }] : null),
      (L.type === 'video' ? ['Extract Audio', () => { Editor.pushUndo(); const a = createLayer('audio', p, L.start, {}); a.name = L.name + ' audio'; a.src = L.src; a.aDur = L.vDur; a.duration = L.duration; a.volume = 100; p.layers.unshift(a); Editor.renderTimeline(); Editor.save(); toast('Audio extracted'); }] : null),
      ['—'],
      ['Delete Layer', () => { Editor.pushUndo(); Editor.removeLayer(L); }, 'warn']
    ].filter(Boolean);
    showContext(x, y, items);
  },
  removeLayer(L) {
    const p = Editor.project;
    p.layers = p.layers.filter(x => x.id !== L.id);
    for (const g of p.layers) if (g.memberIds) g.memberIds = g.memberIds.filter(id => id !== L.id);
    for (const w of p.layers) if (w.parentId === L.id) w.parentId = null;
    delete VIDEOS[L.id]; delete AUDIOS[L.id];
    if (Editor.selId === L.id) Editor.selId = null;
    Editor.renderTimeline(); Props.render(); Editor.save(); toast('Layer deleted');
  },
  pasteLayer(front) {
    const p = Editor.project;
    if (!Editor.clipboard) return;
    Editor.pushUndo();
    const c = deep(Editor.clipboard);
    c.id = uid();
    c.start = Editor.t; c.duration = clamp(Editor.clipboard.duration, 0.05, p.duration - Editor.t);
    p.layers.splice(front ? 0 : p.layers.length, 0, c);
    Editor.select(c.id); Editor.renderTimeline(); Editor.save();
    toast('Layer pasted');
  },

  // ---------- add menu ----------
  addChannelInit() {
    document.querySelectorAll('.rd-btn').forEach(b => {
      b.addEventListener('click', () => {
        const which = b.dataset.add;
        if (which === 'shape') AddMenus.shape();
        else if (which === 'fx') FXUI.open();
        else if (which === 'media') document.getElementById('file-media').click();
        else if (which === 'audio') document.getElementById('file-audio').click();
        else if (which === 'object') Modals.open('m-object');
        else if (which === 'elements') AddMenus.elements();
        else if (which === 'text') AddMenus.text(null);
        else if (which === 'freehand') AddMenus.freehand();
        else if (which === 'vector') AddMenus.vector();
        else if (which === 'record') AddMenus.record();
      });
    });
    document.querySelectorAll('#m-object [data-obj]').forEach(b => b.addEventListener('click', () => {
      Modals.close('m-object');
      const p = Editor.project;
      Editor.pushUndo();
      const type = b.dataset.obj;
      const L = createLayer(type, p, Editor.t);
      L.name = type === 'camera' ? 'Camera 1' : L.name;
      if (type === 'camera') { L.camX = 0; L.camY = 0; L.duration = p.duration; }
      p.layers.unshift(L);
      if (type === 'camera') toast('Camera added — keyframe camX/camY/zoom to move');
      Editor.renderTimeline();
      try { Editor.select(L.id); } catch (err) { console.warn('select err', err); }
      Editor.save();
    }));
    document.getElementById('file-media').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const url = await readDataURL(f);
      const isVid = f.type.startsWith('video');
      const p = Editor.project;
      Editor.pushUndo();
      const L = createLayer(isVid ? 'video' : 'image', p, Editor.t);
      L.name = f.name.replace(/\.[^.]+$/, '');
      L.src = url;
      await new Promise(res => {
        const m = document.createElement(isVid ? 'video' : 'img');
        m.onloadedmetadata || (m.onload = res);
        m.onloadedmetadata = () => { res(); };
        m.onerror = () => res();
        m.src = url;
      });
      if (isVid) {
        const v = videoEl(L);
        await new Promise(res => { if (v.readyState >= 1) res(); else v.onloadedmetadata = res; });
        L.vW = v.videoWidth || 1920; L.vH = v.videoHeight || 1080;
        const dur = (isFinite(v.duration) && v.duration > 0) ? v.duration : 5;
        L.vDur = dur;
        if (L.start + dur > p.duration) {
          p.duration = Math.ceil(L.start + dur);
        }
        L.duration = Math.max(0.1, Math.min(dur, p.duration - L.start));
        // cheap video thumbs (first frame)
        const c = document.createElement('canvas'); c.width = 48; c.height = 48;
        try { v.currentTime = 0.1; c.getContext('2d').drawImage(v, 0, 0, 48, 48); } catch { }
      }
      p.layers.splice(0, 0, L);
      Editor.renderTimeline();
      try { Editor.select(L.id); } catch (err) { console.warn('select err', err); }
      Editor.save();
      toast(isVid ? 'Video added' : 'Image added');
    });
    document.getElementById('file-audio').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const url = await readDataURL(f);
      const p = Editor.project;
      Editor.pushUndo();
      const L = createLayer('audio', p, Editor.t);
      L.name = f.name.replace(/\.[^.]+$/, '');
      L.src = url;
      const probe = new Audio(url);
      await new Promise(res => { probe.onloadedmetadata = res; probe.onerror = res; });
      L.aDur = (isFinite(probe.duration) && probe.duration > 0) ? probe.duration : 5;
      if (L.start + L.aDur > p.duration) {
        p.duration = Math.ceil(L.start + L.aDur);
      }
      L.duration = Math.max(0.1, Math.min(L.aDur, p.duration - L.start));
      p.layers.splice(0, 0, L);
      Editor.renderTimeline();
      try { Editor.select(L.id); } catch (err) { console.warn('select err', err); }
      Editor.save();
      toast('Audio added');
    });

    const repInput = document.getElementById('file-replace-media');
    if (repInput) {
      repInput.addEventListener('change', async e => {
        const f = e.target.files[0];
        e.target.value = '';
        if (!f) return;
        const p = Editor.project;
        if (!p) return;
        const targetId = repInput._targetLayerId || Editor.selId;
        const L = p.layers.find(x => x.id === targetId) || Editor.sel();
        if (!L) return toast('No layer selected');

        const url = await readDataURL(f);
        Editor.pushUndo();

        const isVid = f.type.startsWith('video');
        const isAud = f.type.startsWith('audio');
        const oldType = L.type;

        // Invalidate cached media elements
        if (typeof IMGS !== 'undefined' && IMGS[L.id]) delete IMGS[L.id];
        if (typeof VIDEOS !== 'undefined' && VIDEOS[L.id]) {
          try { VIDEOS[L.id].pause(); VIDEOS[L.id].src = ''; } catch(err) {}
          delete VIDEOS[L.id];
        }
        if (typeof AUDIOS !== 'undefined' && AUDIOS[L.id]) {
          try { AUDIOS[L.id].pause(); AUDIOS[L.id].src = ''; } catch(err) {}
          delete AUDIOS[L.id];
        }
        if (typeof FRAME_CACHE !== 'undefined' && FRAME_CACHE[L.id]) delete FRAME_CACHE[L.id];

        L.src = url;

        if (isVid) {
          L.type = 'video';
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.src = url;
          await new Promise(res => { v.onloadedmetadata = res; v.onerror = res; });
          L.vW = v.videoWidth || 1920;
          L.vH = v.videoHeight || 1080;
          const dur = (isFinite(v.duration) && v.duration > 0) ? v.duration : (L.duration || 5);
          L.vDur = dur;
          if (L.scW) {
            L.scH = Math.round(L.scW * (L.vH / L.vW));
          } else if (oldType === 'shape' && L.w && L.h) {
            L.scW = L.w;
            L.scH = Math.round(L.w * (L.vH / L.vW));
          }
        } else if (isAud) {
          L.type = 'audio';
          const probe = new Audio(url);
          await new Promise(res => { probe.onloadedmetadata = res; probe.onerror = res; });
          L.aDur = (isFinite(probe.duration) && probe.duration > 0) ? probe.duration : (L.duration || 5);
        } else {
          L.type = 'image';
          const img = new Image();
          img.src = url;
          await new Promise(res => { img.onload = res; img.onerror = res; });
          L.imgW = img.naturalWidth || 1080;
          L.imgH = img.naturalHeight || 1080;
          if (L.scW) {
            L.scH = Math.round(L.scW * (L.imgH / L.imgW));
          } else if (oldType === 'shape' && L.w && L.h) {
            L.scW = L.w;
            L.scH = Math.round(L.w * (L.imgH / L.imgW));
          }
        }

        L.name = f.name.replace(/\.[^.]+$/, '');
        Editor.renderTimeline();
        Editor.draw();
        if (typeof Props !== 'undefined') Props.render();
        if (typeof SelBar !== 'undefined') SelBar.render(L);
        Editor.save();
        toast('Media replaced: ' + f.name);
      });
    }
  },

  replaceMedia(L) {
    L = L || Editor.sel();
    if (!L) return toast('Select a layer to replace its media');
    const input = document.getElementById('file-replace-media');
    if (!input) return;
    input._targetLayerId = L.id;
    input.value = '';
    input.click();
  },

  async saveElement(L) {
    const thumbC = renderThumb(Editor.project, Editor.t, 200);
    const el = { id: uid(), name: L.name, type: L.type, layer: serializeLayer(L), thumb: thumbC.toDataURL('image/png'), created: Date.now() };
    await Storage.put('elements', el);
    toast('Saved to Elements');
  },
  async addElementFromHome(elem) {
    if (!Editor.project) { toast('Open a project first'); return; }
    const p = Editor.project;
    Editor.pushUndo();
    const L = deepDeser(elem.layer);
    L.id = uid(); L.start = Editor.t;
    p.layers.splice(0, 0, L);
    Editor.select(L.id); Editor.renderTimeline(); Editor.save();
    document.getElementById('home-screen').classList.remove('active');
    document.getElementById('editor-screen').classList.add('active');
    toast('Element added');
  },

  bookmarkToggle() {
    const p = Editor.project;
    const i = p.bookmarks.findIndex(b => Math.abs(b - Editor.t) < 0.05);
    if (i >= 0) { p.bookmarks.splice(i, 1); toast('Bookmark removed'); }
    else { p.bookmarks.push(+Editor.t.toFixed(2)); toast('Bookmark added'); }
    p.bookmarks.sort((a, b) => a - b);
    Editor.renderTransportLive(); Editor.save();
  },

  drawRuler() {
    const p = Editor.project;
    if (!p) return;
    const rul = document.getElementById('tl-ruler');
    if (!rul) return;
    const ctx = rul.getContext('2d');
    const W = rul.width, H = rul.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1016'; ctx.fillRect(0, 0, W, H);
    const pps = Editor.pps;
    const gw = Editor.gutterWidth || 100;
    // ticks each second, minor between (offset by gutterWidth)
    ctx.strokeStyle = '#39404d'; ctx.fillStyle = '#8d97a5'; ctx.font = '10px Segoe UI'; ctx.textBaseline = 'top';
    const spanSec = (W - gw) / pps;
    for (let s = 0; s <= spanSec; s++) {
      const x = gw + s * pps;
      ctx.beginPath(); ctx.moveTo(x, H - 12); ctx.lineTo(x, H - 2); ctx.stroke();
      // minor ticks: quarter
      for (let q = 1; q < 4; q++) {
        ctx.beginPath(); ctx.moveTo(x + q * pps / 4, H - 6); ctx.lineTo(x + q * pps / 4, H - 2); ctx.stroke();
      }
      if (x < W - 40) ctx.fillText(s + 's', x + 3, 2);
    }
    // bookmarks
    for (const b of p.bookmarks) {
      const x = gw + b * pps;
      ctx.fillStyle = '#f5c451';
      ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x - 4, H - 6); ctx.lineTo(x + 4, H - 6); ctx.closePath(); ctx.fill();
    }
    // time chip near playhead
    const px = gw + Editor.t * pps;
    const label = fmtTime(Editor.t, p.fps);
    ctx.font = 'bold 11px Segoe UI';
    const wTxt = ctx.measureText(label).width + 12;
    ctx.fillStyle = '#1c212b';
    roundRectPath(ctx, Math.min(W - wTxt - 2, Math.max(gw + 2, px - wTxt / 2)), 4, wTxt, 18, 5); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(label, Math.min(W - wTxt / 2 - 2, Math.max(gw + wTxt / 2 + 2, px)), 8);
    ctx.textAlign = 'left';
  },

  // ---------- settings & import ----------
  settingsInit() {
    document.getElementById('btn-settings').addEventListener('click', () => { Modals.open('m-settings'); Settings.fill(Editor.project); });
    const btnExp = document.getElementById('btn-export');
    if (btnExp) {
      btnExp.addEventListener('click', () => {
        if (typeof Ex !== 'undefined' && Ex.open) Ex.open();
        else Modals.open('m-export');
      });
    }
    
    // Top-bar Import XML button
    const btnImpTop = document.getElementById('btn-import-xml-top');
    const fileImpXml = document.getElementById('file-import-xml');
    if (btnImpTop && fileImpXml) {
      btnImpTop.onclick = () => fileImpXml.click();
      fileImpXml.onchange = async e => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        await Editor.importXmlFile(file);
      };
    }

    // Drag-and-drop XML files directly onto the editor stage
    const edScr = document.getElementById('editor-screen');
    if (edScr) {
      edScr.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
      edScr.addEventListener('drop', async e => {
        e.preventDefault(); e.stopPropagation();
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f && (f.name.endsWith('.xml') || f.name.endsWith('.alightproj') || f.name.endsWith('.json'))) {
          await Editor.importXmlFile(f);
        }
      });
    }
  },

  async importXmlFile(file) {
    try {
      const text = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file);
      });
      const trimmed = text.trim();
      if (trimmed.startsWith('<?xml') || trimmed.startsWith('<scene') || trimmed.startsWith('<shape') || trimmed.startsWith('<element')) {
        if (typeof AMXML === 'undefined') throw new Error('XML Engine not loaded');
        const { project, missingFonts } = AMXML.import(trimmed);
        project.id = typeof uid === 'function' ? uid() : 'p_' + Date.now();
        project.updated = Date.now();
        await Storage.put('projects', project);
        toast('XML Project loaded');

        if (missingFonts && missingFonts.length) {
          AMXML.showMissingFontsDialog(missingFonts, () => {
            Editor.open(project);
          });
        } else {
          Editor.open(project);
        }
        return;
      }

      // JSON fallback
      const p = JSON.parse(trimmed);
      if (!p || !p.layers || !p.width) throw new Error('Invalid project structure');
      p.id = typeof uid === 'function' ? uid() : 'p_' + Date.now();
      p.updated = Date.now();
      await Storage.put('projects', p);
      toast('Project loaded');
      Editor.open(p);
    } catch (err) {
      console.error('Import error:', err);
      toast('Error importing file: ' + (err.message || ''));
    }
  }
};

function groupOfLayer(p, id) {
  for (const g of p.layers) if (g.type === 'group' && g.memberIds.includes(id)) return g.id;
  return null;
}
function serializeLayer(L) { const c = deep(L); delete c.id; return c; }
function deepDeser(o) { const c = deep(o); c.id = c.id || uid(); return c; }
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------- settings modal ----------
const Settings = {
  fill(p, homeMode) {
    Settings._home = !!homeMode;
    document.getElementById('ps-name').value = p.name;
    document.getElementById('ps-w').value = p.width;
    document.getElementById('ps-h').value = p.height;
    document.getElementById('ps-fps').value = p.fps;
    document.getElementById('ps-dur').value = p.duration;
    document.getElementById('ps-bg').style.background = p.bg;
    Settings._bg = p.bg;
    const ar = (p.width / p.height).toFixed(2);
    document.querySelectorAll('#ps-aspect button').forEach(b => {
      const [a, c] = b.dataset.ar.split(':').map(Number);
      b.classList.toggle('on', Math.abs(a / c - ar) < 0.02);
    });
  },
  init() {
    document.querySelectorAll('#ps-aspect button').forEach(b => b.addEventListener('click', () => {
      const [a, c] = b.dataset.ar.split(':').map(Number);
      const h = 1080;
      document.getElementById('ps-w').value = Math.round(h * a / c);
      document.getElementById('ps-h').value = h;
      document.querySelectorAll('#ps-aspect button').forEach(x => x.classList.toggle('on', x === b));
    }));
    bindSwatch(document.getElementById('ps-bg'), () => Editor.project ? Editor.project.bg : '#000000', hex => {
      Settings._bg = hex;
      document.getElementById('ps-bg').style.background = hex;
    });
    document.getElementById('ps-save').addEventListener('click', () => {
      const opts = {
        name: document.getElementById('ps-name').value || 'Project',
        width: Math.max(16, +document.getElementById('ps-w').value),
        height: Math.max(16, +document.getElementById('ps-h').value),
        fps: clamp(+document.getElementById('ps-fps').value, 1, 120),
        duration: Math.max(0.2, +document.getElementById('ps-dur').value),
        bg: Settings._bg || '#000000'
      };
      if (Settings._home) {
        Modals.close('m-settings');
        if (Settings.onSave) { const f = Settings.onSave; Settings.onSave = null; f(opts); }
        return;
      }
      const p = Editor.project;
      Editor.pushUndo();
      Object.assign(p, opts);
      Modals.close('m-settings');
      Editor.render(); Editor.save();
    });
  }
};

// ---------- timeline zoom & scrub ----------
function timelineInit() {
  const scroll = document.getElementById('tl-scroll');
  const rul = document.getElementById('tl-ruler');
  const scrub = e => {
    const gw = Editor.gutterWidth || 100;
    const x = e.clientX - scroll.getBoundingClientRect().left + scroll.scrollLeft;
    Editor.seek((x - gw) / Editor.pps);
  };
  rul.addEventListener('pointerdown', e => {
    scrub(e);
    const mv = ev => scrub(ev);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
  document.getElementById('tl-zin').onclick = () => { Editor.pps = clamp(Editor.pps * 1.4, 24, 600); Editor.renderTimeline(); };
  document.getElementById('tl-zout').onclick = () => { Editor.pps = clamp(Editor.pps / 1.4, 24, 600); Editor.renderTimeline(); };
  document.getElementById('t-end-input').addEventListener('change', e => {
    const v = Math.max(0.2, +e.target.value || 1);
    Editor.pushUndo();
    Editor.project.duration = v;
    Editor.renderTimeline(); Editor.save();
  });
}

function initLayerDragReorder(grip, row, L, p) {
  grip.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    try { grip.setPointerCapture(e.pointerId); } catch (_) {}

    Editor.select(L.id);

    const rowsContainer = document.getElementById('tl-rows');
    const dropLine = document.getElementById('tl-drop-line');
    const startY = e.clientY;
    let isDragging = false;
    let targetIdx = p.layers.findIndex(l => l.id === L.id);

    const onPointerMove = ev => {
      const dy = ev.clientY - startY;
      if (!isDragging && Math.abs(dy) > 3) {
        isDragging = true;
        row.classList.add('dragging-row');
        if (dropLine) dropLine.hidden = false;
      }
      if (!isDragging) return;

      const currentRows = Array.from(rowsContainer.querySelectorAll('.trow'));
      let newTarget = currentRows.length;
      for (let i = 0; i < currentRows.length; i++) {
        const r = currentRows[i].getBoundingClientRect();
        const mid = r.top + r.height / 2;
        if (ev.clientY < mid) {
          newTarget = i;
          break;
        }
      }
      targetIdx = newTarget;

      if (dropLine) {
        if (targetIdx < currentRows.length) {
          dropLine.style.top = currentRows[targetIdx].offsetTop + 'px';
        } else if (currentRows.length > 0) {
          const last = currentRows[currentRows.length - 1];
          dropLine.style.top = (last.offsetTop + last.offsetHeight) + 'px';
        }
      }
    };

    const onPointerUp = ev => {
      try { grip.releasePointerCapture(e.pointerId); } catch (_) {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      row.classList.remove('dragging-row');
      if (dropLine) dropLine.hidden = true;

      if (!isDragging) return;

      const fromIndex = p.layers.findIndex(l => l.id === L.id);
      if (fromIndex === -1) return;

      let finalIdx = targetIdx;
      if (finalIdx > fromIndex) finalIdx--;
      finalIdx = clamp(finalIdx, 0, p.layers.length - 1);

      if (fromIndex !== finalIdx) {
        Editor.pushUndo();
        const [moved] = p.layers.splice(fromIndex, 1);
        p.layers.splice(finalIdx, 0, moved);
        Editor.renderTimeline();
        Editor.draw();
        Editor.save();
        toast(`Moved "${moved.name}" ${finalIdx < fromIndex ? 'up' : 'down'}`);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  });
}

// ---------- left toolbar wiring ----------
function toolbarInit() {
  Editor._tool = 'select'; Editor._grid = false;
  const selBtn = document.getElementById('lb-select');
  const gridBtn = document.getElementById('lb-grid');
  const tlBtn = document.getElementById('lb-timeline');
  const camBtn = document.getElementById('lb-camera');
  selBtn.onclick = () => { Editor._tool = 'select'; selBtn.classList.add('active'); };
  gridBtn.onclick = () => { Editor._grid = !Editor._grid; gridBtn.classList.toggle('active', Editor._grid); };
  tlBtn.onclick = () => {
    const tl = document.getElementById('timeline');
    tl.style.display = tl.style.display === 'none' ? '' : 'none';
    tlBtn.classList.toggle('active', tl.style.display !== 'none');
    Editor.fitStage();
  };
  camBtn.onclick = () => {
    const cam = Editor.project.layers.find(l => l.type === 'camera');
    if (!cam) return toast('Add a Camera from Object');
    Editor.select(cam.id); Props.openSection('cam');
  };
  document.getElementById('lb-zin').onclick = () => { Editor.zoom = clamp((Editor.zoom === 'fit' ? 2 : Editor.zoom * 1.25), 0.5, 6); Editor.fitStage(); };
  document.getElementById('lb-zout').onclick = () => { Editor.zoom = clamp((Editor.zoom === 'fit' ? 2 : Editor.zoom / 1.25), 0.5, 6); Editor.fitStage(); };
  document.getElementById('lb-zfit').onclick = () => { Editor.zoom = 'fit'; Editor.fitStage(); };
  document.getElementById('lb-undo').onclick = () => Editor.undo();
  document.getElementById('lb-redo').onclick = () => Editor.redo();
  document.getElementById('lb-play').onclick = () => Editor.togglePlay();
}

// ---------- transport wiring ----------
function transportInit() {
  document.getElementById('t-play').onclick = () => Editor.togglePlay();
  document.getElementById('t-jstart').onclick = () => Editor.seek(0);
  document.getElementById('t-jend').onclick = () => Editor.seek(Editor.project.duration - 0.001);
  document.getElementById('t-bookmark').onclick = () => Editor.bookmarkToggle();
  document.getElementById('t-copy').onclick = () => {
    const L = Editor.sel(); if (!L) return toast('Select a layer first');
    Editor.clipboard = deep(L); delete Editor.clipboard.id;
    document.getElementById('t-paste').hidden = false;
    toast('Layer copied');
  };
  document.getElementById('t-paste').onclick = () => Editor.pasteLayer(false);
  document.getElementById('ed-title').addEventListener('change', e => {
    Editor.project.name = e.target.value; Editor.save();
  });
  timeJumpInit();
  timelineResizerInit();
}

function timeJumpInit() {
  const timeEl = document.getElementById('tl-time');
  if (!timeEl) return;
  timeEl.title = 'Click to jump to time (e.g. 00:05:29, 2.5s, 500ms, or frames)';

  const startEdit = e => {
    if (e) e.stopPropagation();
    if (timeEl.querySelector('input')) return;
    const p = Editor.project;
    if (!p) return;

    if (Editor.playing) Editor.togglePlay();

    const currStr = fmtTime(Editor.t, p.fps);
    timeEl.innerHTML = `<input id="tl-time-input" class="tl-time-input" type="text" value="${currStr}" spellcheck="false" autocomplete="off" placeholder="00:00:00" title="Enter time (e.g. 00:05:29, 2.5s, 500ms, 45f)">`;
    const input = timeEl.querySelector('input');
    input.focus();
    input.select();

    let finished = false;
    const commit = (shouldSeek = true) => {
      if (finished) return;
      finished = true;
      if (shouldSeek && input.value.trim()) {
        const targetT = parseTimecode(input.value, p.fps, p.duration);
        Editor.seek(targetT);
        Editor.draw();
      }
      timeEl.textContent = fmtTime(Editor.t, p.fps);
    };

    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        commit(true);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        commit(false);
      }
      ev.stopPropagation();
    });

    input.addEventListener('blur', () => commit(true));
    input.addEventListener('click', ev => ev.stopPropagation());
  };

  timeEl.addEventListener('click', startEdit);

  const ph = document.getElementById('tl-playhead');
  if (ph) {
    ph.style.pointerEvents = 'auto';
    ph.style.cursor = 'pointer';
    ph.title = 'Click to jump to time';
    ph.addEventListener('click', e => {
      e.stopPropagation();
      startEdit(e);
    });
  }
}

function timelineResizerInit() {
  const resizer = document.getElementById('tl-resizer');
  const tl = document.getElementById('timeline');
  if (!resizer || !tl) return;

  const savedH = localStorage.getItem('am_tl_height');
  if (savedH) {
    const val = parseInt(savedH, 10);
    if (!isNaN(val) && val >= 180 && val <= window.innerHeight * 0.85) {
      tl.style.height = val + 'px';
    }
  }

  let startY = 0, startH = 0;
  const onPointerMove = e => {
    const dy = startY - e.clientY;
    const minH = 180;
    const maxH = Math.round(window.innerHeight * 0.82);
    const newH = clamp(startH + dy, minH, maxH);
    tl.style.height = newH + 'px';
    Editor.fitStage();
  };

  const onPointerUp = () => {
    resizer.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    const curH = parseInt(tl.style.height, 10);
    if (!isNaN(curH)) localStorage.setItem('am_tl_height', curH);
  };

  resizer.addEventListener('pointerdown', e => {
    e.preventDefault();
    startY = e.clientY;
    startH = tl.getBoundingClientRect().height;
    resizer.classList.add('active');
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });
}
