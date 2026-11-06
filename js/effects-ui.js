// effects-ui.js — effects browser modal + per-effect param rows in the properties panel.
// Layer shape: layer.effects = [ {id, enabled:true, params:{paramId: value}} ]

const FXUI = {
  ready: false,
  filter: { cat: 'primary', q: '', legacy: false },

  async ensureCatalog() {
    if (!FXCatalog.ready) await FXCatalog.load();
    FXUI.ready = FXCatalog.ready;
    return FXUI.ready;
  },

  isEffectable(L) {
    return L && !['audio', 'camera', 'group'].includes(L.type);
  },

  init() {
    FXUI.ensureCatalog();
    // dock button
    const btn = document.querySelector('.rd-btn[data-add="fx"]');
    if (btn) btn.addEventListener('click', () => {
      FXUI.open();
    });
    // browser modal internals
    const search = document.getElementById('fx-search');
    if (search) {
      search.addEventListener('input', () => { FXUI.filter.q = search.value.toLowerCase(); FXUI.renderGrid(); });
      document.getElementById('fx-legacy').checked = false;
      document.getElementById('fx-legacy').onchange = e => { FXUI.filter.legacy = e.target.checked; FXUI.renderChips(); FXUI.renderGrid(); };
    }
    FXUI.renderChips();
    FXUI.renderGrid();
  },

  async open() {
    const ready = FXCatalog.ready ? true : await FXUI.ensureCatalog();
    const L = typeof Editor !== 'undefined' && Editor.sel ? Editor.sel() : null;
    const nm = document.getElementById('fx-layername');
    if (nm) nm.textContent = L ? L.name : 'Catalog';
    FXUI.renderChips();
    FXUI.renderGrid();
    Modals.open('m-effects');
    if (!ready) FXUI.renderCatalogError();
  },

  close() { Modals.close('m-effects'); },

  renderChips() {
    const cats = document.getElementById('fx-cats');
    if (!cats || !FXCatalog.ready) return;
    const matches = d => !FXUI.filter.q || d.name.toLowerCase().includes(FXUI.filter.q) || d.id.includes(FXUI.filter.q) || d.tags.join(' ').toLowerCase().includes(FXUI.filter.q);
    const all = FXCatalog.browserList(FXUI.filter.legacy).filter(matches);
    const primary = FXCatalog.primaryList(FXUI.filter.legacy).filter(matches);
    cats.innerHTML = '';
    const mk = (id, label, count) => {
      const b = document.createElement('button');
      b.className = 'chip' + (FXUI.filter.cat === id ? ' on' : '');
      b.textContent = `${label} (${count})`;
      b.dataset.cat = id;
      b.onclick = () => { FXUI.filter.cat = id; FXUI.renderChips(); FXUI.renderGrid(); };
      cats.appendChild(b);
    };
    mk('primary', 'Primary', primary.length);
    for (const group of FXCatalog.primaryCategories(FXUI.filter.legacy)) {
      const count = FXCatalog.primaryList(FXUI.filter.legacy, group.id).filter(matches).length;
      if (count) mk(`primary:${group.id}`, group.label, count);
    }
    mk('all', 'All effects', all.length);
  },

  renderGrid() {
    const grid = document.getElementById('fx-grid');
    if (!grid) return;
    if (!FXCatalog.ready) { FXUI.renderCatalogError(); return; }
    grid.innerHTML = '';
    const list = FXCatalog.browserList(FXUI.filter.legacy).filter(d => {
      if (FXUI.filter.cat === 'primary' && !FXCatalog.primaryCategory(d)) return false;
      if (FXUI.filter.cat.startsWith('primary:') && FXCatalog.primaryCategory(d) !== FXUI.filter.cat.slice(8)) return false;
      if (FXUI.filter.q) return d.name.toLowerCase().includes(FXUI.filter.q) || d.id.includes(FXUI.filter.q) || d.tags.join(' ').toLowerCase().includes(FXUI.filter.q);
      return true;
    });
    const L = Editor.sel();
    const makeCard = d => {
      const card = document.createElement('button');
      card.className = 'fx-card';
      const applied = L && L.effects && L.effects.some(e => e.id === d.id);
      card.innerHTML = `<div class="fxc-name"></div><div class="fxc-tag">${d.category || 'other'}${d.hasScript ? ' · js' : ''}${d.passes.length ? ' · ' + d.passes.length + 'p' : ''}${applied ? ' · applied' : ''}</div>`;
      const name = d.browserName || d.name;
      card.querySelector('.fxc-name').textContent = name;
      card.title = d.desc && d.desc[0] !== '@' ? d.desc : name;
      card.onclick = () => FXUI.apply(d.id);
      return card;
    };
    const grouped = FXUI.filter.cat === 'primary' || FXUI.filter.cat === 'all';
    if (grouped) {
      grid.classList.add('fx-grouped');
      for (const group of FXCatalog.primaryCategories(FXUI.filter.legacy)) {
        const defs = list.filter(d => FXCatalog.primaryCategory(d) === group.id);
        if (!defs.length) continue;
        const section = document.createElement('section'); section.className = 'fx-group';
        section.innerHTML = '<h3></h3><div class="fx-group-cards"></div>';
        section.querySelector('h3').textContent = group.label;
        const cards = section.querySelector('.fx-group-cards');
        defs.forEach(d => cards.appendChild(makeCard(d)));
        grid.appendChild(section);
      }
      const other = list.filter(d => !FXCatalog.primaryCategory(d));
      if (other.length) {
        const section = document.createElement('section'); section.className = 'fx-group';
        section.innerHTML = '<h3>More Effects</h3><div class="fx-group-cards"></div>';
        other.forEach(d => section.querySelector('.fx-group-cards').appendChild(makeCard(d)));
        grid.appendChild(section);
      }
    } else {
      grid.classList.remove('fx-grouped');
      list.forEach(d => grid.appendChild(makeCard(d)));
    }
    if (!list.length) grid.innerHTML = '<p class="hint">No effects match.</p>';
  },

  renderCatalogError() {
    const grid = document.getElementById('fx-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'fx-err';
    const why = FXCatalog.lastError || 'shader catalog not loaded';
    box.innerHTML = '<div class="fx-err-t">Effects failed to load</div>' +
      '<div class="fx-err-d"></div>' +
      '<button class="fat-btn">Retry</button>';
    box.querySelector('.fx-err-d').textContent = why +
      ' — needs effects/AlightMotionEffects.xml (or js/effects-data.js) next to index.html, served over http.';
    box.querySelector('button').onclick = async () => {
      FXCatalog.ready = false;
      FXUI.ensureCatalog().then(ok => { if (ok) { FXUI.renderChips(); FXUI.renderGrid(); } else FXUI.renderCatalogError(); });
    };
    grid.appendChild(box);
  },

  apply(id) {
    const L = typeof Editor !== 'undefined' && Editor.sel ? Editor.sel() : null;
    if (!L) { toast('Select a layer to apply effect'); return; }
    if (!FXUI.isEffectable(L)) { toast('Effects apply to drawing, media, and text layers'); return; }
    if (!L.effects) L.effects = [];
    if (L.effects.some(e => e.id === id)) { toast('Effect already applied'); Props.render(); return; }
    Editor.pushUndo();
    const entry = FXEngine.makeEntry(id);
    if (!entry) { toast('Effect definition missing'); return; }
    L.effects.push(entry);
    Editor.save();
    Props.render();
    Modals.close('m-effects');
    Editor.select(L.id);
    toast('Effect added');
  },

  // ---------- props panel section ----------
  renderIntoProps(secFx, L) {
    const wrap = document.createElement('div');
    wrap.className = 'fx-applied';
    const add = document.createElement('button');
    add.className = 'fat-btn'; add.textContent = 'Add Effect…';
    add.onclick = () => FXUI.open();
    secFx.appendChild(add);
    if (!L.effects || !L.effects.length) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'No effects. Tap Add Effect…';
      secFx.appendChild(hint);
      return;
    }
    for (let i = 0; i < L.effects.length; i++) {
      const entry = L.effects[i];
      const def = FXCatalog.byId[entry.id];
      if (!def) continue;
      // container
      const box = document.createElement('div');
      box.className = 'fx-eff';
      const head = document.createElement('div');
      head.className = 'fx-eff-h';
      const chk = document.createElement('input');
      chk.type = 'checkbox'; chk.checked = entry.enabled !== false;
      chk.onchange = () => { Editor.pushUndo(); entry.enabled = chk.checked; Editor.save(); Editor.draw(); };
      const nm = document.createElement('span');
      nm.className = 'fx-eff-n'; nm.textContent = def.name; nm.style.flex = '1';
      const glslBtn = document.createElement('button');
      glslBtn.className = 'mini'; glslBtn.textContent = '⟨/⟩'; glslBtn.title = 'View / Edit ShaderToy GLSL';
      glslBtn.onclick = () => FXUI.openShaderToy(def, entry, L);
      const up = document.createElement('button'); up.className = 'mini'; up.textContent = '▲'; up.title = 'Move up';
      up.onclick = () => FXUI.moveEntry(L, i, -1);
      const dn = document.createElement('button'); dn.className = 'mini'; dn.textContent = '▼'; dn.title = 'Move down';
      dn.onclick = () => FXUI.moveEntry(L, i, +1);
      const rm = document.createElement('button'); rm.className = 'mini x'; rm.textContent = '✕'; rm.title = 'Remove effect';
      rm.onclick = () => {
        Editor.pushUndo();
        L.effects.splice(i, 1);
        Editor.save(); Editor.draw(); Props.render();
      };
      head.appendChild(chk); head.appendChild(nm); head.appendChild(glslBtn); head.appendChild(up); head.appendChild(dn); head.appendChild(rm);
      box.appendChild(head);
      // param rows
      for (const p of def.params) {
        const row = FXUI.paramRow(L, entry, p);
        if (row) box.appendChild(row);
      }
      wrap.appendChild(box);
    }
    secFx.appendChild(wrap);
  },

  openShaderToy(def, entry, L) {
    const m = document.getElementById('m-shadertoy');
    if (!m) return;
    const nameEl = document.getElementById('st-effectname');
    if (nameEl) nameEl.textContent = def.name;
    const codeEl = document.getElementById('st-code');
    const glsl = typeof ShaderToyConverter !== 'undefined'
      ? ShaderToyConverter.amToShadertoy(def, entry._customShader)
      : (entry._customShader || '');
    if (codeEl) codeEl.value = glsl;

    document.getElementById('st-copy').onclick = () => {
      navigator.clipboard?.writeText(codeEl.value);
      toast('ShaderToy GLSL copied');
    };

    document.getElementById('st-download').onclick = () => {
      const fn = (def.name || 'effect').replace(/\s+/g, '_') + '.glsl';
      const blob = new Blob([codeEl.value], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fn; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      toast('Downloaded ' + fn);
    };

    document.getElementById('st-apply').onclick = () => {
      entry._customShader = codeEl.value;
      FXEngine._programs.clear();
      Editor.save();
      Editor.draw();
      toast('Shader updated in preview');
    };

    Modals.open('m-shadertoy');
  },

  moveEntry(L, i, dir) {
    const j = i + dir;
    if (j < 0 || j >= (L.effects || []).length) return;
    Editor.pushUndo();
    const [e] = L.effects.splice(i, 1);
    L.effects.splice(j, 0, e);
    Editor.save(); Editor.draw(); Props.render();
  },

  paramRow(L, entry, p) {
    const push = () => { Editor.pushUndo(); };
    const commit = () => { Editor.save(); Editor.draw(); };
    switch (p.kind) {
      case 'section': {
        const h = document.createElement('div');
        h.className = 'fx-sec';
        h.textContent = p.label || '';
        return h;
      }
      case 'tip': {
        const h = document.createElement('div');
        h.className = 'hint fx-tip';
        h.textContent = p.label || '';
        return h;
      }
      case 'texture': return null; // bound automatically (content / comp / buffer)
      case 'spinner': case 'slider': case 'float': {
        const r = document.createElement('div'); r.className = 'prow';
        r.innerHTML = `<span class="pl">${p.label}</span>`;
        const wrap = document.createElement('div'); wrap.className = 'pnumrow fx-param-row';
        const holder = document.createElement('div'); holder.className = 'spin';
        const i = document.createElement('input'); i.type = 'number';
        i.step = String(p.step || 1);
        const dn = document.createElement('button'); dn.textContent = '<';
        const up = document.createElement('button'); up.textContent = '>';
        holder.appendChild(dn); holder.appendChild(i); holder.appendChild(up);
        const lt = () => layerTime(L, Editor.t);
        const set = value => {
          push(); const v = clampVal(value, p.min, p.max);
          if (hasEffectKf(entry, p.id)) setEffectKf(entry, p.id, lt(), v);
          else entry.params[p.id] = v;
          return v;
        };
        const refresh = () => {
          if (document.activeElement !== i) i.value = roundNum(effectParamAt(entry, p.id, lt()));
          dia.classList.toggle('on', !!effectKfAtTime(entry, p.id, lt()));
          dia.classList.toggle('haskf', hasEffectKf(entry, p.id));
        };
        i.onchange = () => { set(+i.value || 0); refresh(); commit(); };
        i.onwheel = e => e.preventDefault();
        dn.onclick = () => { set(effectParamAt(entry, p.id, lt()) - (p.step || 1)); refresh(); commit(); };
        up.onclick = () => { set(effectParamAt(entry, p.id, lt()) + (p.step || 1)); refresh(); commit(); };
        const dia = document.createElement('button'); dia.className = 'kf-dia'; dia.textContent = '◆'; dia.title = 'Toggle parameter keyframe at playhead';
        dia.onclick = e => {
          const time = lt();
          const key = effectKfAtTime(entry, p.id, time);
          if (key) {
            showContext(e.clientX, e.clientY, [
              ['Edit easing…', () => editorEaseForEffect(entry, p.id, key.t)],
              ['Delete keyframe', () => { removeEffectKf(entry, p.id, time); document.getElementById('m-layer').hidden = true; refresh(); Editor.save(); }, 'warn']
            ]);
          } else { setEffectKf(entry, p.id, time, effectParamAt(entry, p.id, time)); refresh(); Editor.save(); toast('Parameter keyframe added'); }
        };
        wrap.appendChild(holder); wrap.appendChild(dia); wrap._refresh = refresh; refresh();
        r.appendChild(wrap);
        return r;
      }
      case 'selector': {
        const r = document.createElement('div'); r.className = 'prow';
        r.innerHTML = `<span class="pl">${p.label}</span>`;
        const sel = document.createElement('select'); sel.className = 'spin';
        (p.choices || []).forEach(c => {
          const o = document.createElement('option');
          o.value = c.value; o.textContent = `${c.label} (${c.value})`;
          sel.appendChild(o);
        });
        sel.value = String(entry.params[p.id] != null ? entry.params[p.id] : (p.def != null ? p.def : (p.choices && p.choices[0] ? p.choices[0].value : 0)));
        sel.onchange = () => { push(); const v = parseFloat(sel.value); entry.params[p.id] = isFinite(v) ? v : sel.value; commit(); };
        sel.style.flex = '1'; sel.style.maxWidth = '210px';
        r.appendChild(sel);
        return r;
      }
      case 'switch': {
        const r = document.createElement('div'); r.className = 'prow';
        r.innerHTML = `<span class="pl">${p.label}</span>`;
        const chk = document.createElement('input'); chk.type = 'checkbox';
        chk.checked = entry.params[p.id] === true || entry.params[p.id] === 'true';
        chk.onchange = () => { push(); entry.params[p.id] = chk.checked; commit(); };
        const dh = document.createElement('div'); dh.className = 'pextra';
        dh.appendChild(chk); r.appendChild(dh);
        return r;
      }
      case 'point': {
        const r = document.createElement('div'); r.className = 'prow';
        r.innerHTML = `<span class="pl">${p.label}</span>`;
        const val = Array.isArray(entry.params[p.id]) ? entry.params[p.id] : [entry.params[p.id] ? entry.params[p.id][0] : 0.5, entry.params[p.id] ? entry.params[p.id][1] : 0.5];
        const mkN = idx => {
          const i = document.createElement('input'); i.type = 'number'; i.value = roundNum((val && val[idx]) || 0);
          i.onchange = () => { push(); const cur = Array.isArray(entry.params[p.id]) ? entry.params[p.id].slice() : [0, 0]; cur[idx] = +i.value || 0; entry.params[p.id] = cur; commit(); };
          return i;
        };
        const w1 = mkN(0), w2 = mkN(1);
        const box = document.createElement('div'); box.className = 'pextra';
        box.appendChild(w1); box.appendChild(document.createTextNode(', ')); box.appendChild(w2);
        r.appendChild(box);
        return r;
      }
      case 'color': {
        const r = document.createElement('div'); r.className = 'prow';
        r.innerHTML = `<span class="pl">${p.label}</span>`;
        const b = document.createElement('button'); b.className = 'swatch';
        const cur = typeof entry.params[p.id] === 'object' ? entry.params[p.id] : { hex: p.def || '#ffffff', a: 1 };
        b.style.background = cur.hex;
        bindSwatch(b, () => { const c = typeof entry.params[p.id] === 'object' ? entry.params[p.id] : cur; return c && c.hex ? c.hex : cur.hex; }, hex => {
          push(); entry.params[p.id] = { hex, a: 1 };
          b.style.background = hex; commit();
        });
        r.appendChild(b);
        return r;
      }
      case 'orient': case 'xyz': {
        const r = document.createElement('div'); r.className = 'prow';
        r.innerHTML = `<span class="pl">${p.label}</span>`;
        const cur = entry.params[p.id] || { x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 };
        const fields = cur.roll !== undefined || cur.pitch !== undefined
          ? [['roll', 'R'], ['pitch', 'P'], ['yaw', 'Y']]
          : [['x', 'X'], ['y', 'Y'], ['z', 'Z']];
        const box = document.createElement('div'); box.className = 'pextra';
        fields.forEach(([k, tag]) => {
          const i = document.createElement('input');
          i.type = 'number'; i.value = roundNum(cur[k] || 0); i.title = tag;
          i.style.width = '52px';
          i.onchange = () => { push(); entry.params[p.id] = Object.assign({}, entry.params[p.id]); entry.params[p.id][k] = +i.value || 0; commit(); };
          box.appendChild(i);
        });
        r.appendChild(box);
        return r;
      }
      default: return null;
    }
  }
};

function roundNum(v) { return Math.round((+v || 0) * 1000) / 1000; }
function clampVal(v, mn, mx) {
  if (isFinite(mn)) v = Math.max(mn, v);
  if (isFinite(mx)) v = Math.min(mx, v);
  return v;
}
