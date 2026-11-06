// selection-bar.js — the layer action panel that appears when a single layer is selected.
// top row: speed · trim start · split · trim end · volume
// middle:  color & fill · border & shadow · blending & opacity
// bottom:  move & transform · edit shape · effects

const SelBar = {
  el: null,
  _L: null,

  icons: {
    speed: `<svg viewBox="0 0 24 24"><path d="M4.6 17.4a9 9 0 1 1 14.8 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12 12.5l3.6-3.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="13.4" r="1.5" fill="currentColor"/><path d="M6.4 8.6l.9.7M17.6 8.6l-.9.7M4.2 13.4h1.2M18.6 13.4h1.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    trimStart: `<svg viewBox="0 0 24 24"><path d="M4 8.4h3v7.2H4M8.2 8.4h2.4v7.2H8.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="2.2 2.4"/><path d="M13.4 5.6v12.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M15.6 8.4h3v7.2h-3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>`,
    split: `<svg viewBox="0 0 24 24"><path d="M4 8.4h5.4v7.2H4z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M14.6 8.4H20v7.2h-5.4z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 4.6v14.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    trimEnd: `<svg viewBox="0 0 24 24"><path d="M17.8 3.4v17.2M5 8.4h3v7.2H5" fill="none" stroke="currentColor" stroke-width="1.7" transform="translate(0 -0.4)"/><path d="M10.6 5.6v12.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12.8 8.4h2.4v7.2h-2.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="2.2 2.4"/></svg>`,
    volume: `<svg viewBox="0 0 24 24"><path d="M4 9.4h3.2L12 5.4v13.2L7.2 14.6H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M15 8.6a4.8 4.8 0 0 1 0 6.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M17.4 6.2a8 8 0 0 1 0 11.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    fill: `<svg viewBox="0 0 24 24"><path d="M9.4 4.2l7.4 7.4-6 6a1.6 1.6 0 0 1-2.3 0l-5-5a1.6 1.6 0 0 1 0-2.3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6.4 9.2l6.2 6.2" stroke="currentColor" stroke-width="1.6"/><path d="M18.4 14.6s1.8 2.2 1.8 3.4a1.8 1.8 0 1 1-3.6 0c0-1.2 1.8-3.4 1.8-3.4z" fill="currentColor"/></svg>`,
    border: `<svg viewBox="0 0 24 24"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4.4" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="7.4" y="7.4" width="9.2" height="9.2" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.4v9.2" stroke="currentColor" stroke-width="1.4" opacity=".55"/></svg>`,
    blend: `<svg viewBox="0 0 24 24"><path d="M12 3.4l8.2 4.6L12 12.6 3.8 8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 12.6l8 4.5 8-4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 16.8l8 4.5 8-4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    move: `<svg viewBox="0 0 24 24"><path d="M12 3.4v17.2M3.4 12h17.2" stroke="currentColor" stroke-width="1.5" opacity=".45"/><path d="M12 3.4l-2.3 2.9h4.6zM12 20.6l-2.3-2.9h4.6zM3.4 12l2.9-2.3v4.6zM20.6 12l-2.9-2.3v4.6z" fill="currentColor"/><path d="M9.6 8.4a5.2 5.2 0 0 1 7 .2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M9.6 8.4l2.9-.4-.6 2.7z" fill="currentColor"/><path d="M14.4 15.6a5.2 5.2 0 0 1-7-.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M14.4 15.6l-2.9.4.6-2.7z" fill="currentColor"/></svg>`,
    shape: `<svg viewBox="0 0 24 24"><circle cx="7.6" cy="7.6" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16.4 4.4l3.4 6H13z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><rect x="4.2" y="13.6" width="6.8" height="6.8" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16.8 20.4s-3.6-2.2-3.6-4.6a1.9 1.9 0 0 1 3.6-.7 1.9 1.9 0 0 1 3.6.7c0 2.4-3.6 4.6-3.6 4.6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    fx: `<svg viewBox="0 0 24 24"><path d="M12 12V3.6M12 12v8.4M12 12H3.6M12 12h8.4M12 12l6-6M12 12l-6 6M12 12l6 6M12 12l-6-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/></svg>`,
    replace: `<svg viewBox="0 0 24 24"><path d="M4 16l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 19V9a4 4 0 0 1 4-4h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20 8l-3-3-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 5v10a4 4 0 0 1-4 4h-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`
  },

  init() {
    if (SelBar.el) return;
    const host = document.querySelector('.preview-area');
    if (!host) return;
    try { SelBar.collapsed = localStorage.getItem('am-selbar-collapsed') === '1'; } catch { SelBar.collapsed = false; }
    const el = document.createElement('div');
    el.id = 'sel-actions';
    el.className = 'sel-actions';
    el.hidden = true;
    el.innerHTML = `
      <div class="sa-row-top">
        <button class="sa-mini" data-act="speed" title="Speed / time remapping">${SelBar.icons.speed}<i class="sa-corner">▾</i></button>
        <div class="sa-join">
          <button class="sa-mini" data-act="trimstart" title="Trim start to playhead">${SelBar.icons.trimStart}</button>
          <button class="sa-mini" data-act="split" title="Split at playhead">${SelBar.icons.split}</button>
          <button class="sa-mini" data-act="trimend" title="Trim end to playhead">${SelBar.icons.trimEnd}</button>
        </div>
        <button class="sa-mini" data-act="volume" title="Volume">${SelBar.icons.volume}<i class="sa-corner">▾</i></button>
        <button class="sa-mini" data-act="replace" title="Replace Media">${SelBar.icons.replace}</button>
        <button class="sa-tog" data-toggle="1" title="Collapse / expand">▾</button>
      </div>
      <div class="sa-grid">
        <button class="sa-big" data-act="color">${SelBar.icons.fill}<span>Color &amp; Fill</span></button>
        <button class="sa-big" data-act="border">${SelBar.icons.border}<span>Border &amp; Shadow</span></button>
        <button class="sa-big" data-act="blend">${SelBar.icons.blend}<span>Blending &amp; Opacity</span></button>
        <button class="sa-big" data-act="transform">${SelBar.icons.move}<span>Move &amp; Transform</span></button>
        <button class="sa-big" data-act="shape">${SelBar.icons.shape}<span>Edit Shape</span></button>
        <button class="sa-big" data-act="fx">${SelBar.icons.fx}<span>Effects</span></button>
      </div>`;
    host.appendChild(el);
    SelBar.el = el;
    el.addEventListener('click', e => {
      if (e.target.closest('[data-toggle]')) {
        e.preventDefault(); e.stopPropagation();
        SelBar.setCollapsed(!SelBar.collapsed, true);
        return;
      }
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      e.preventDefault(); e.stopPropagation();
      SelBar.run(b.dataset.act, b);
    });
    // never let a click on the bar deselect through the stage
    el.addEventListener('pointerdown', e => e.stopPropagation());
  },

  // hide/show + refresh enabled states
  tick() {
    if (!SelBar.el || SelBar.el.hidden) return;
    const L = SelBar._L; if (!L) return;
    const inside = Editor.t > L.start + 1e-4 && Editor.t < layerEnd(L) - 1e-4 ? 1 : 0;
    if (inside !== SelBar._inside) { SelBar._inside = inside; SelBar.render(L); }
  },

  setCollapsed(on, remember) {
    SelBar.collapsed = !!on;
    SelBar.force = !SelBar.collapsed ? true : false;   // explicit expand wins over the auto rule
    if (SelBar.el) {
      SelBar.el.classList.toggle('collapsed', SelBar.collapsed);
      const t = SelBar.el.querySelector('[data-toggle]');
      if (t) { t.textContent = SelBar.collapsed ? '▴' : '▾'; t.title = SelBar.collapsed ? 'Expand controls' : 'Collapse controls'; }
    }
    if (remember) { try { localStorage.setItem('am-selbar-collapsed', SelBar.collapsed ? '1' : '0'); } catch { } }
    if (SelBar._L) SelBar.render(SelBar._L);
  },

  render(L) {
    if (!SelBar.el) SelBar.init();
    if (!SelBar.el) return;
    const host = document.querySelector('.preview-area');
    const editing = host && document.getElementById('editor-screen') &&
      document.getElementById('editor-screen').classList.contains('active');
    const visible = !!L && !!editing;
    if (!visible) {
      SelBar.el.hidden = true;
      SelBar._L = null;
      if (host) { host.classList.remove('has-sel'); host.style.paddingBottom = ''; if (Editor.project) Editor.fitStage(); }
      SelBar._vis = false;
      return;
    }
    SelBar.el.hidden = false;
    const wantsFull = !SelBar.collapsed;
    const tall = host ? (host.clientHeight >= 220) : true;
    const collapse = !wantsFull || (!tall && !SelBar.force);
    SelBar.el.classList.toggle('collapsed', collapse);
    const tog = SelBar.el.querySelector('[data-toggle]');
    if (tog) tog.textContent = collapse ? '▴' : '▾';
    if (host) {
      host.classList.add('has-sel');
      host.style.paddingBottom = '';
    }
    SelBar._visible = true;
    if (!SelBar._vis) { SelBar._vis = true; }
    if (Editor.project) Editor.fitStage();
    SelBar._L = L;
    const t = Editor.t, end = layerEnd(L);
    const inside = t > L.start + 1e-4 && t < end - 1e-4;
    SelBar._inside = inside ? 1 : 0;
    const media = L.type === 'video' || L.type === 'audio';
    const visual = !['audio', 'camera', 'group', 'null'].includes(L.type);
    const state = {
      speed: L.type !== 'camera',
      trimstart: inside,
      split: inside,
      trimend: inside,
      volume: media,
      replace: L.type !== 'camera' && L.type !== 'null',
      color: !['audio', 'camera', 'group', 'null'].includes(L.type),
      border: visual,
      blend: L.type !== 'audio' && L.type !== 'camera',
      transform: L.type !== 'camera',
      shape: L.type === 'shape',
      fx: !!(typeof FXUI !== 'undefined' && FXUI.isEffectable(L))
    };
    SelBar.el.querySelectorAll('[data-act]').forEach(b => {
      const on = state[b.dataset.act] !== false;
      b.disabled = !on;
      b.classList.toggle('off', !on);
    });
    const sp = L.speed || 1;
    SelBar.el.querySelector('[data-act="speed"]').title =
      `${sp === 1 ? 'Speed: 1×' : 'Speed: ' + (Math.round(sp * 100) / 100) + '×'} — click for time remapping`;
    const vol = propAt(L, 'volume', layerTime(L, t));
    SelBar.el.querySelector('[data-act="volume"]').title = media ? `Volume: ${Math.round(vol)}%` : 'Volume (media layers only)';
    const repEl = SelBar.el.querySelector('[data-act="replace"]');
    if (repEl) repEl.title = `Replace media (${L.name || L.type})`;
  },

  run(act, btn) {
    const L = SelBar._L || Editor.sel();
    if (!L) return;
    const P = {
      speed: () => SelBar.speedMenu(L, btn),
      trimstart: () => SelBar.trimStart(L),
      split: () => SelBar.split(L),
      trimend: () => SelBar.trimEnd(L),
      volume: () => SelBar.volumePop(L, btn),
      replace: () => Editor.replaceMedia(L),
      color: () => { Editor.select(L.id); Props.openSection('color'); },
      border: () => { Editor.select(L.id); Props.openSection('border'); },
      blend: () => { Editor.select(L.id); Props.openSection('blend'); },
      transform: () => { Editor.select(L.id); Props.openSection('transform'); },
      shape: () => ShapeEdit.open(L),
      fx: () => { if (typeof FXUI !== 'undefined') { Editor.select(L.id); FXUI.open(); } }
    };
    if (P[act]) P[act]();
  },

  commit() {
    Editor.renderTimeline();
    Editor.draw();
    Props.render();
    SelBar.render(Editor.sel());
    Editor.save();
  },

  // ---------- speed / time remapping ----------
  speedMenu(L, btn) {
    const cur = L.speed || 1;
    const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
    const r = btn && btn.getBoundingClientRect && btn.nodeType === 1
      ? btn.getBoundingClientRect()
      : { left: Math.max(12, innerWidth / 2 - 110), bottom: innerHeight / 2 };
    const items = speeds.map(s => [
      (Math.abs(s - cur) < 1e-3 ? '✓ ' : '   ') + (s === 1 ? '1× (normal)' : (Math.round(s * 100) / 100) + '×'),
      () => SelBar.setSpeed(L, s)
    ]);
    items.push(['—']);
    items.push(['Custom speed…', () => {
      const v = parseFloat(prompt('Playback speed (0.0625 – 16)', String(cur)));
      if (isFinite(v) && v !== 0) SelBar.setSpeed(L, clamp(v, 0.0625, 16));
    }]);
    items.push(['Reset to 1×', () => SelBar.setSpeed(L, 1)]);
    showContext(r.left, r.bottom + 6, items);
  },

  setSpeed(L, s) {
    Editor.pushUndo();
    L.speed = s;
    SelBar.commit();
    toast(s === 1 ? 'Speed reset to 1×' : 'Speed ' + (Math.round(s * 100) / 100) + '×');
  },

  // ---------- trim / split ----------
  trimStart(L) {
    const t = Editor.t, end = layerEnd(L);
    if (!(t > L.start + 1e-4 && t < end - 1e-4)) return toast('Move the playhead inside the layer first');
    Editor.pushUndo();
    const cut = t - L.start;
    L.tOff = (L.tOff || 0) + cut * (L.speed || 1);   // keep the same content on screen
    L.start = t;
    L.duration = end - t;
    SelBar.commit();
    toast('Trimmed start');
  },

  trimEnd(L) {
    const t = Editor.t;
    if (!(t > L.start + 1e-4 && t < layerEnd(L) - 1e-4)) return toast('Move the playhead inside the layer first');
    Editor.pushUndo();
    L.duration = t - L.start;
    SelBar.commit();
    toast('Trimmed end');
  },

  split(L) {
    const t = Editor.t, end = layerEnd(L);
    if (!(t > L.start + 1e-4 && t < end - 1e-4)) return toast('Move the playhead inside the layer first');
    const p = Editor.project;
    Editor.pushUndo();
    const cut = t - L.start;
    const right = deep(L);
    right.id = uid();
    right.name = L.name + ' 2';
    right.start = t;
    right.duration = end - t;
    right.tOff = (L.tOff || 0) + cut * (L.speed || 1);
    L.duration = cut;
    const i = indexOfLayer(p, L.id);
    p.layers.splice(i, 0, right);
    Editor.select(right.id);
    SelBar.commit();
    toast('Layer split');
  },

  // ---------- volume ----------
  volumePop(L, btn) {
    SelBar.closePop();
    const r = btn.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'sa-pop';
    pop.innerHTML = `
      <div class="sa-pop-h">Volume<span></span></div>
      <input type="range" min="0" max="100" step="1">
      <div class="sa-pop-row">
        <button class="sa-pop-mute">Mute</button>
        <button class="sa-pop-full">100%</button>
        <span class="sa-pop-val"></span>
      </div>`;
    document.body.appendChild(pop);
    pop.style.left = Math.max(8, Math.min(r.left - 40, innerWidth - pop.offsetWidth - 8)) + 'px';
    pop.style.top = Math.min(r.bottom + 6, innerHeight - pop.offsetHeight - 8) + 'px';
    SelBar._pop = pop;
    const range = pop.querySelector('input');
    const val = pop.querySelector('.sa-pop-val');
    const set = v => {
      v = clamp(Math.round(v), 0, 100);
      if (hasKf(L, 'volume')) setKf(L, 'volume', layerTime(L, Editor.t), v);
      else L.volume = v;
      range.value = v; val.textContent = v + '%';
      Editor.draw(); Editor.save();
    };
    range.value = clamp(propAt(L, 'volume', layerTime(L, Editor.t)), 0, 100);
    val.textContent = Math.round(range.value) + '%';
    range.oninput = () => set(+range.value);
    pop.querySelector('.sa-pop-mute').onclick = () => set(0);
    pop.querySelector('.sa-pop-full').onclick = () => set(100);
    pop.addEventListener('pointerdown', e => e.stopPropagation());
    setTimeout(() => {
      const off = ev => {
        if (pop.contains(ev.target)) return;
        SelBar.closePop();
        window.removeEventListener('pointerdown', off, true);
      };
      window.addEventListener('pointerdown', off, true);
    }, 0);
  },

  closePop() {
    if (SelBar._pop && SelBar._pop.parentNode) SelBar._pop.parentNode.removeChild(SelBar._pop);
    SelBar._pop = null;
  }
};

// ================= EDIT SHAPE =================
const ShapeEdit = {
  _L: null,
  open(L) {
    if (!L || L.type !== 'shape') return toast('Edit Shape applies to shape layers');
    SelBar.closePop();
    ShapeEdit._L = L;
    const grid = document.getElementById('es-grid');
    if (grid && !grid.childElementCount) {
      for (const s of SHAPE_SHAPES) {
        const b = document.createElement('button');
        b.dataset.shape = s;
        b.innerHTML = ic(s);
        b.title = s;
        b.onclick = () => {
          const l = ShapeEdit._L; if (!l) return;
          Editor.pushUndo();
          l.shape = s;
          ShapeEdit.fill(l);
          Editor.draw(); Editor.save();
        };
        grid.appendChild(b);
      }
    }
    ShapeEdit.fill(L);
    Modals.open('m-editshape');
  },
  fill(L) {
    const g = (id) => document.getElementById(id);
    g('es-w').value = Math.round(L.w);
    g('es-h').value = Math.round(L.h);
    g('es-corner').value = Math.round(L.corner || 0);
    g('es-spikes').value = L.spikes || 5;
    g('es-inner').value = Math.round((L.inner == null ? 0.42 : L.inner) * 100);
    g('es-corner-row').hidden = L.shape !== 'roundrect';
    g('es-spikes-row').hidden = L.shape !== 'star5';
    g('es-inner-row').hidden = L.shape !== 'star5';
    document.querySelectorAll('#es-grid button').forEach(b => b.classList.toggle('on', b.dataset.shape === L.shape));
    g('es-w').onchange = () => { Editor.pushUndo(); L.w = Math.max(4, +g('es-w').value); Editor.draw(); Editor.save(); };
    g('es-h').onchange = () => { Editor.pushUndo(); L.h = Math.max(4, +g('es-h').value); Editor.draw(); Editor.save(); };
    g('es-corner').onchange = () => { Editor.pushUndo(); L.corner = Math.max(0, +g('es-corner').value); Editor.draw(); Editor.save(); };
    g('es-spikes').onchange = () => { Editor.pushUndo(); L.spikes = clamp(Math.round(+g('es-spikes').value), 3, 24); Editor.draw(); Editor.save(); };
    g('es-inner').onchange = () => { Editor.pushUndo(); L.inner = clamp(+g('es-inner').value, 5, 95) / 100; Editor.draw(); Editor.save(); };
  }
};
