// ui-props.js — properties panel, text modal, shape presets, elements, freehand/vector, record,
// parent/mask pickers, keyframes modal, easing editor

/* global Modals, Editor, toast, showContext, bindSwatch, readDataURL, EASE_PRESETS, clamp */

// ================= PROPERTIES PANEL =================
const Props = {
  sections: {},
  init() {
    const el = document.createElement('div');
    el.id = 'props-panel';
    el.style.cssText = 'position:fixed;right:112px;top:64px;bottom:286px;width:330px;background:var(--panel);border:1px solid var(--line);border-radius:16px;z-index:30;display:none;flex-direction:column;overflow:hidden';
    el.innerHTML = `
      <div style="display:flex;align-items:center;padding:12px 16px 8px;gap:8px">
        <strong id="props-name" style="flex:1;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></strong>
        <button id="props-x" class="x-btn">✕</button>
      </div>
      <div id="props-body" style="flex:1;overflow-y:auto;padding:4px 14px 16px"></div>`;
    document.body.appendChild(el);
    Props.el = el;
    document.getElementById('props-x').onclick = () => Props.hide();
    // responsive height on timeline toggle
  },
  show() { Props.el.style.display = 'flex'; Props.render(); },
  hide() { Props.el.style.display = 'none'; },
  render() {
    if (!Props.el) return;
    const L = Editor.sel();
    const body = document.getElementById('props-body');
    document.getElementById('props-name').textContent = L ? L.name : 'No layer selected';
    body.innerHTML = '';
    Props.sections = {};
    if (!L) return;
    const mk = (id, title, open = false) => {
      const sec = document.createElement('div');
      sec.className = 'psec';
      const head = document.createElement('button');
      head.className = 'psec-h';
      head.innerHTML = `<span class="caret">${open ? '▾' : '▸'}</span> ${title}`;
      const inner = document.createElement('div');
      inner.className = 'psec-b';
      inner.style.display = open ? '' : 'none';
      head.onclick = () => {
        open = !open;
        head.querySelector('.caret').textContent = open ? '▾' : '▸';
        inner.style.display = open ? '' : 'none';
      };
      sec.appendChild(head); sec.appendChild(inner); body.appendChild(sec);
      Props.sections[id] = inner;
      return inner;
    };
    const row = (label, inp, extraHTML) => {
      const r = document.createElement('div');
      r.className = 'prow';
      r.innerHTML = `<span class="pl">${label}</span>`;
      r.appendChild(inp.wrap || inp);
      if (extraHTML) { const x = document.createElement('div'); x.className = 'pextra'; x.innerHTML = extraHTML; r.appendChild(x); }
      body.lastChild && r.appendChild ? null : null;
      return r;
    };
    const numRow = (label, prop, opts = {}) => {
      const holder = document.createElement('div');
      holder.className = 'pnumrow';
      const spin = document.createElement('div');
      spin.className = 'spin';
      const dn = document.createElement('button'); dn.textContent = '<';
      const input = document.createElement('input'); input.type = 'number'; input.step = opts.step || 1;
      const up = document.createElement('button'); up.textContent = '>';
      spin.appendChild(dn); spin.appendChild(input); spin.appendChild(up);
      holder._prop = prop;
      const get = () => prop in L.tf ? L.tf[prop] : (prop in L ? (L[prop] ?? ANIM_PROPS[prop].def) : ANIM_PROPS[prop].def);
      const at = () => layerTime(L, Editor.t);
      const set = v => {
        Editor.pushUndo();
        if (hasKf(L, prop)) setKf(L, prop, at(), v);
        else if (prop in L.tf) L.tf[prop] = v;
        else L[prop] = v;
        Editor.save();
        Editor.draw();
        Props.refreshAnimatedValues();
      };
      const refresh = () => {
        const raw = propAt(L, prop, at());
        const v = opts.toDisplay ? opts.toDisplay(raw) : raw;
        if (document.activeElement !== input) input.value = (Math.round(v * 1000) / 1000);
        Props.diamondState(input.closest('.pnumrow'), L, prop);
      };
      input.addEventListener('change', () => {
        const val = +input.value;
        const raw = opts.fromDisplay ? opts.fromDisplay(val) : val;
        set(raw);
      });
      dn.onclick = () => {
        const raw = propAt(L, prop, at());
        const disp = opts.toDisplay ? opts.toDisplay(raw) : raw;
        const newDisp = disp - (opts.step || 1);
        const newRaw = opts.fromDisplay ? opts.fromDisplay(newDisp) : newDisp;
        set(newRaw);
        refresh();
      };
      up.onclick = () => {
        const raw = propAt(L, prop, at());
        const disp = opts.toDisplay ? opts.toDisplay(raw) : raw;
        const newDisp = disp + (opts.step || 1);
        const newRaw = opts.fromDisplay ? opts.fromDisplay(newDisp) : newDisp;
        set(newRaw);
        refresh();
      };
      holder.appendChild(spin);
      // keyframe diamond
      const dia = document.createElement('button');
      dia.className = 'kf-dia'; dia.textContent = '◆';
      dia.title = 'Toggle keyframe at playhead';
      dia.onclick = e => {
        const lt = layerTime(L, Editor.t);
        if (kfAtTime(L, prop, lt)) {
          showContext(e.clientX, e.clientY, [
            ['Move playhead here', () => { const k = kfAtTime(L, prop, lt); Editor.seek(layerAbsTime(L, k.t)); }],
            ['Edit easing…', () => { const k = kfAtTime(L, prop, lt); editorEaseFor(L, prop, k.t); }],
            ['Delete keyframe', () => { removeKf(L, prop, lt); document.getElementById('m-layer').hidden = true; refresh(); Props.updateDiamonds(); Keyframes.refreshOpen(); }, 'warn']
          ]);
        } else {
          setKf(L, prop, lt, propAt(L, prop, lt));
          refresh(); Keyframes.refreshOpen(); toast('Keyframe added');
        }
      };
      holder.appendChild(dia);
      holder._refresh = refresh;
      refresh();
      const r = document.createElement('div');
      r.className = 'prow';
      r.innerHTML = `<span class="pl">${label}</span>`;
      r.appendChild(holder);
      return r;
    };
    const style = document.createElement('style');
    if (!document.getElementById('props-style')) {
      style.id = 'props-style';
      style.textContent = `
      .psec{margin-bottom:8px;background:var(--panel2);border-radius:12px;overflow:hidden}
      .psec-h{width:100%;text-align:left;padding:11px 14px;font-weight:600;color:var(--txt2);display:flex;gap:8px;font-size:13.5px}
      .psec-h:hover{color:var(--txt)}
      .psec-b{padding:2px 12px 10px;display:flex;flex-direction:column;gap:6px}
      .prow{display:flex;align-items:center;gap:8px;min-height:34px}
      .prow .pl{font-size:12.5px;color:var(--txt2);min-width:84px}
      .pnumrow{display:flex;align-items:center;gap:6px;flex:1;justify-content:flex-end}
      .spin{display:flex;align-items:center;background:var(--panel3);border-radius:9px;overflow:hidden;flex:1;max-width:210px}
      .spin button{width:26px;height:30px;color:var(--txt2);font-weight:700}
      .spin button:hover{color:var(--accent)}
      .spin input{flex:1;width:100%;background:transparent;border:none;text-align:center;padding:4px 2px}
      .kf-dia{color:var(--txt3);font-size:15px;width:26px;height:30px}
      .kf-dia.haskf{color:var(--txt2)}
      .kf-dia.on{color:var(--accent)}
      .transform-pad{position:relative;min-height:112px;border:1px solid var(--line);border-radius:11px;background:linear-gradient(135deg,#1d2430,#171b24);overflow:hidden;touch-action:none;cursor:grab;display:flex;align-items:center;justify-content:center}
      .transform-pad:active{cursor:grabbing}
      .transform-pad::before,.transform-pad::after{content:"";position:absolute;background:var(--line);opacity:.55}.transform-pad::before{width:1px;top:12px;bottom:12px}.transform-pad::after{height:1px;left:12px;right:12px}
      .transform-pad-msg{position:relative;z-index:1;font-size:12px;color:var(--txt2);padding:8px 12px;border-radius:8px;background:rgba(10,12,16,.48);pointer-events:none}
      .transform-tools{display:flex;gap:5px}.transform-tools button{flex:1;padding:6px 3px;border-radius:8px;background:var(--panel3);border:1px solid var(--line);font-size:11px;color:var(--txt2)}.transform-tools button.on{color:var(--accent);border-color:var(--accent);background:var(--accent-dim)}
      .fat-btn{width:100%;padding:9px;background:var(--panel3);border-radius:10px;text-align:left;font-size:13px}
      .fat-btn:hover{background:#2a3040}`;
      document.head.appendChild(style);
    }

    // TIME
    const secTime = mk('time', 'Time', true);
    {
      const r = document.createElement('div'); r.className = 'prow';
      r.innerHTML = '<span class="pl">Start (s)</span>';
      const i1 = document.createElement('input'); i1.type = 'number'; i1.step = '0.05';
      const i2 = document.createElement('input'); i2.type = 'number'; i2.step = '0.05';
      const w1 = document.createElement('div'); w1.className = 'spin'; w1.appendChild(i1); i1.style.width = '70px';
      const w2 = document.createElement('div'); w2.className = 'spin'; w2.appendChild(i2); i2.style.width = '70px';
      i1.style.background = 'transparent'; i1.style.border = 'none'; i1.style.textAlign = 'center';
      i2.style.background = 'transparent'; i2.style.border = 'none'; i2.style.textAlign = 'center';
      i1.value = L.start.toFixed(2); i2.value = L.duration.toFixed(2);
      i1.onchange = () => { L.start = clamp(+i1.value, 0, Editor.project.duration); i1.value = L.start; Editor.renderTimeline(); Editor.save(); };
      i2.onchange = () => { L.duration = Math.max(0.05, +i2.value); i2.value = L.duration; Editor.renderTimeline(); Editor.save(); };
      r.appendChild(w1); const sp = document.createElement('span'); sp.textContent = 'Dur (s)'; sp.className = 'pl'; sp.style.minWidth = '52px'; r.appendChild(sp); r.appendChild(w2);
      secTime.appendChild(r);
      const dt = document.createElement('div'); dt.className = 'prow';
      dt.innerHTML = `<span class="pl">Visible in</span><span style="font-size:12px;color:var(--txt3)">${fmtClock(L.start)} – ${fmtClock(layerEnd(L))}</span>`;
      secTime.appendChild(dt);
    }

    // MOVE & TRANSFORM
    const secT = mk('transform', 'Move & Transform', true);
    if (L.type !== 'camera') {
      // Determine comp radius (half width & height)
      let contW = Editor.project.width, contH = Editor.project.height;
      if (L.parentId) {
        const pLayer = getLayer(L._proj || Editor.project, L.parentId);
        if (pLayer) {
          if (pLayer.w && pLayer.h) { contW = pLayer.w; contH = pLayer.h; }
          else if (pLayer.groupBounds) { contW = pLayer.groupBounds.w; contH = pLayer.groupBounds.h; }
        }
      }
      const radX = contW / 2;
      const radY = contH / 2;

      // Determine base element size for pixel scale calculation
      let baseW = contW, baseH = contH;
      if (L.type === 'shape') {
        baseW = L.w || 420; baseH = L.h || 420;
      } else if (L.type === 'image') {
        baseW = L.scW || L.imgW || contW; baseH = L.scH || L.imgH || contH;
      } else if (L.type === 'video') {
        baseW = L.scW || L.vW || contW; baseH = L.scH || L.vH || contH;
      } else if (L.type === 'group') {
        baseW = L.w || L.groupBounds?.w || contW; baseH = L.h || L.groupBounds?.h || contH;
      } else if (L.type === 'text') {
        baseW = L.boxW || (L.size * 3) || contW; baseH = L.boxH || L.size || contH;
      } else if (L.w && L.h) {
        baseW = L.w; baseH = L.h;
      }

      const tools = document.createElement('div'); tools.className = 'transform-tools';
      const pad = document.createElement('div'); pad.className = 'transform-pad';
      const msg = document.createElement('span'); msg.className = 'transform-pad-msg'; pad.appendChild(msg);
      let mode = Props._transformMode || 'move';
      const label = {
        move: 'Swipe to move layer',
        scale: 'Swipe to scale layer',
        rotate: 'Swipe to rotate layer',
        skew: 'Swipe to skew layer'
      };
      const setTransform = (prop, value, lt) => {
        if (hasKf(L, prop)) setKf(L, prop, lt, value);
        else L.tf[prop] = value;
      };
      const getStatusText = () => {
        const lt = layerTime(L, Editor.t);
        const curX = propAt(L, 'x', lt), curY = propAt(L, 'y', lt);
        const curScale = propAt(L, 'scale', lt) / 100;
        const curScaleX = (L.tf && L.tf.scaleX != null ? propAt(L, 'scaleX', lt) / 100 : 1);
        const curScaleY = (L.tf && L.tf.scaleY != null ? propAt(L, 'scaleY', lt) / 100 : 1);
        const curRot = propAt(L, 'rot', lt);
        const curSkewX = propAt(L, 'skewX', lt), curSkewY = propAt(L, 'skewY', lt);
        if (mode === 'move') {
          return `X: ${(radX + curX).toFixed(1)}   Y: ${(radY + curY).toFixed(1)}`;
        } else if (mode === 'scale') {
          const w = Math.round(baseW * curScale * curScaleX);
          const h = Math.round(baseH * curScale * curScaleY);
          return `${w} × ${h} px`;
        } else if (mode === 'rotate') {
          return `${curRot.toFixed(1)}°`;
        } else if (mode === 'skew') {
          return `X: ${curSkewX.toFixed(1)}°   Y: ${curSkewY.toFixed(1)}°`;
        }
        return label[mode] || '';
      };
      const redrawTools = () => {
        msg.textContent = getStatusText();
        tools.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
      };
      [['move', 'Move'], ['scale', 'Scale'], ['rotate', 'Rotate'], ['skew', 'Skew']].forEach(([id, text]) => {
        const b = document.createElement('button'); b.dataset.mode = id; b.textContent = text;
        b.onclick = () => { mode = id; Props._transformMode = id; redrawTools(); };
        tools.appendChild(b);
      });
      pad.addEventListener('pointerdown', e => {
        if (L.locked) return;
        const lt = layerTime(L, Editor.t);
        const start = {
          x: e.clientX, y: e.clientY, lt,
          xVal: propAt(L, 'x', lt), yVal: propAt(L, 'y', lt),
          scale: propAt(L, 'scale', lt), rot: propAt(L, 'rot', lt),
          skewX: propAt(L, 'skewX', lt), skewY: propAt(L, 'skewY', lt)
        };
        Editor.pushUndo(); pad.setPointerCapture(e.pointerId);
        const move = ev => {
          const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
          if (mode === 'move') {
            const nx = start.xVal + dx, ny = start.yVal + dy;
            setTransform('x', nx, start.lt);
            setTransform('y', ny, start.lt);
            msg.textContent = `X: ${(radX + nx).toFixed(1)}   Y: ${(radY + ny).toFixed(1)}`;
          } else if (mode === 'scale') {
            const dPx = (dx - dy) * 1.5;
            const newScale = Math.max(1, start.scale + (dPx / Math.max(1, baseW)) * 100);
            setTransform('scale', newScale, start.lt);
            const w = Math.round(baseW * (newScale / 100));
            const h = Math.round(baseH * (newScale / 100));
            msg.textContent = `${w} × ${h} px`;
          } else if (mode === 'rotate') {
            const nr = start.rot + dx * 0.65;
            setTransform('rot', nr, start.lt);
            msg.textContent = `${nr.toFixed(1)}°`;
          } else if (mode === 'skew') {
            const sx = start.skewX + dx * 0.5, sy = start.skewY + dy * 0.5;
            setTransform('skewX', sx, start.lt);
            setTransform('skewY', sy, start.lt);
            msg.textContent = `X: ${sx.toFixed(1)}°   Y: ${sy.toFixed(1)}°`;
          }
          Editor.draw(); Props.refreshAnimatedValues();
        };
        const up = () => {
          pad.removeEventListener('pointermove', move);
          pad.removeEventListener('pointerup', up);
          pad.removeEventListener('pointercancel', up);
          Editor.save();
          redrawTools();
          Props.refreshAnimatedValues();
        };
        pad.addEventListener('pointermove', move); pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
      });
      redrawTools();
      secT.appendChild(tools);
      secT.appendChild(pad);

      // Status hook for refresh
      pad._refresh = redrawTools;

      // Position X & Y: Absolute canvas center coordinates (radius of resolution)
      secT.appendChild(numRow('Position X', 'x', {
        step: 5,
        toDisplay: raw => Math.round((radX + raw) * 10) / 10,
        fromDisplay: disp => disp - radX
      }));
      secT.appendChild(numRow('Position Y', 'y', {
        step: 5,
        toDisplay: raw => Math.round((radY + raw) * 10) / 10,
        fromDisplay: disp => disp - radY
      }));

      // Scale: Actual pixel size like 2160x2160
      secT.appendChild(numRow('Scale (px)', 'scale', {
        step: 10,
        toDisplay: raw => Math.round(baseW * (raw / 100) * 10) / 10,
        fromDisplay: disp => (disp / Math.max(1, baseW)) * 100
      }));
      secT.appendChild(numRow('Scale Width (px)', 'scaleX', {
        step: 10,
        toDisplay: raw => {
          const totScale = propAt(L, 'scale', layerTime(L, Editor.t)) / 100;
          return Math.round(baseW * totScale * (raw / 100) * 10) / 10;
        },
        fromDisplay: disp => {
          const totScale = propAt(L, 'scale', layerTime(L, Editor.t)) / 100;
          return (disp / Math.max(1, baseW * totScale)) * 100;
        }
      }));
      secT.appendChild(numRow('Scale Height (px)', 'scaleY', {
        step: 10,
        toDisplay: raw => {
          const totScale = propAt(L, 'scale', layerTime(L, Editor.t)) / 100;
          return Math.round(baseH * totScale * (raw / 100) * 10) / 10;
        },
        fromDisplay: disp => {
          const totScale = propAt(L, 'scale', layerTime(L, Editor.t)) / 100;
          return (disp / Math.max(1, baseH * totScale)) * 100;
        }
      }));

      secT.appendChild(numRow('Rotation', 'rot', { step: 1 }));
      secT.appendChild(numRow('Anchor X', 'ax', { step: 5 }));
      secT.appendChild(numRow('Anchor Y', 'ay', { step: 5 }));
      secT.appendChild(numRow('Skew X', 'skewX', { step: 1 }));
      secT.appendChild(numRow('Skew Y', 'skewY', { step: 1 }));
      secT.appendChild(numRow('Z Depth', 'z', { step: 5 }));
    }

    // COLOR & FILL
    if (L.type === 'shape') {
      const secC = mk('color', 'Color & Fill');
      if (!L.fill.mode) L.fill.mode = 'solid';
      const modeRow = document.createElement('div'); modeRow.className = 'prow';
      modeRow.innerHTML = '<span class="pl">Fill</span>';
      const chips = document.createElement('div'); chips.className = 'chips';
      [['solid', 'Solid'], ['linear', 'Linear'], ['radial', 'Radial']].forEach(([id, label]) => {
        const b = document.createElement('button');
        b.textContent = label; b.className = L.fill.mode === id ? 'on' : '';
        b.onclick = () => { L.fill.mode = id; Editor.save(); Editor.draw(); Props.render(); };
        chips.appendChild(b);
      });
      modeRow.appendChild(chips); secC.appendChild(modeRow);
      rowSwatch(secC, L.fill.mode === 'solid' ? 'Fill color' : 'Color 1', L.fill.color, hex => { L.fill.color = hex; Editor.save(); Editor.draw(); });
      if (L.fill.mode !== 'solid') {
        rowSwatch(secC, 'Color 2', L.fill.color2 || '#ffffff', hex => { L.fill.color2 = hex; Editor.save(); Editor.draw(); });
        secC.appendChild(pickNumberRow('Angle', L.fill.angle == null ? 90 : L.fill.angle, v => { L.fill.angle = v; Editor.save(); Editor.draw(); }));
      }
      rowSwatch(secC, 'Outline color', L.stroke.color, hex => { L.stroke.color = hex; Editor.save(); Editor.draw(); });
      secC.appendChild(pickNumberRow('Outline width', L.stroke.width, v => { L.stroke.width = Math.max(0, v); Editor.save(); Editor.draw(); }));
      secC.appendChild(pickNumberRow('Shape width', L.w, v => { L.w = Math.max(4, v); Editor.save(); Editor.draw(); }));
      secC.appendChild(pickNumberRow('Shape height', L.h, v => { L.h = Math.max(4, v); Editor.save(); Editor.draw(); }));
    }
    if (L.type === 'text') {
      const secC = mk('color', 'Text');
      const b = document.createElement('button'); b.className = 'fat-btn'; b.textContent = 'Edit text…';
      b.onclick = () => AddMenus.text(L);
      secC.appendChild(b);
      rowSwatch(secC, 'Color', L.color, hex => { L.color = hex; Editor.save(); });
      secC.appendChild(pickNumberRow('Size', L.size, v => { L.size = Math.max(4, v); Editor.save(); }));
    }
    if (L.type === 'vector') {
      const secC = mk('color', 'Vector');
      rowSwatch(secC, 'Color', L.color, hex => { L.color = hex; Editor.save(); });
      secC.appendChild(pickNumberRow('Stroke width', L.sw, v => { L.sw = Math.max(0, v); Editor.save(); }));
    }
    if (L.type === 'freehand') {
      const secC = mk('color', 'Freehand');
      const b = document.createElement('button'); b.className = 'fat-btn'; b.textContent = 'Reopen in drawing editor…';
      b.onclick = () => AddMenus.freehand(L);
      secC.appendChild(b);
    }
    if (L.type === 'image' || L.type === 'video') {
      const secC = mk('color', 'Media & Size');
      const repBtn = document.createElement('button');
      repBtn.className = 'fat-btn accent';
      repBtn.style.marginBottom = '10px';
      repBtn.innerHTML = '⮂ Replace Media…';
      repBtn.onclick = () => Editor.replaceMedia(L);
      secC.appendChild(repBtn);

      const src = L.type === 'video';
      const wd = src ? L.vW : L.imgW, ht = src ? L.vH : L.imgH;
      secC.appendChild(pickNumberRow('Width', src ? (L.scW ?? wd) : (L.scW ?? L.imgW), v => {
        const r = ht / wd; L.scW = Math.max(4, v); L.scH = Math.round(L.scW * r); Editor.save();
      }, { drawnWhenDefault: [wd, ht] }));
      secC.appendChild(pickNumberRow('Height', (L.scW != null ? L.scH : ht), v => {
        const r = wd / ht; L.scH = Math.max(4, v); L.scW = Math.round(L.scH * r); Editor.save();
      }));
    }

    // BLEND & OPACITY (all visual layers)
    if (L.type !== 'audio' && L.type !== 'camera') {
      const secB = mk('blend', 'Blending & Opacity');
      secB.appendChild(numRow('Opacity %', 'opacity', { step: 5 }));
      const r = document.createElement('div'); r.className = 'prow';
      r.innerHTML = `<span class="pl">Blend</span>`;
      const sel = document.createElement('select'); sel.className = 'spin';
      BLEND_MODES.forEach(b2 => { const o = document.createElement('option'); o.value = b2; o.textContent = b2[0].toUpperCase() + b2.slice(1); if (b2 === 'normal') o.textContent = 'Normal'; sel.appendChild(o); });
      sel.value = L.blend || 'normal';
      sel.onchange = () => { L.blend = sel.value; Editor.save(); Editor.draw(); };
      sel.style.flex = '1'; sel.style.maxWidth = '210px';
      r.appendChild(sel); secB.appendChild(r);
    }

    // BORDER & SHADOW (visual layers; shapes expose their outline as the border)
    if (L.type !== 'audio' && L.type !== 'camera' && L.type !== 'group' && L.type !== 'null') {
      const secBo = mk('border', 'Border & Shadow');
      const toggle = (label, val, on) => {
        const r = document.createElement('div'); r.className = 'prow';
        r.innerHTML = `<span class="pl">${label}</span>`;
        const b = document.createElement('button');
        b.className = 'chips'; b.style.marginLeft = 'auto';
        const s = document.createElement('button');
        s.textContent = val ? 'On' : 'Off'; s.className = val ? 'on' : '';
        s.onclick = () => { on(!val); Editor.save(); Editor.draw(); Props.render(); };
        b.appendChild(s); r.appendChild(b); return r;
      };
      if (L.type === 'shape') {
        if (!L.stroke) L.stroke = { color: '#ffffff', width: 0 };
        secBo.appendChild(toggle('Border', (L.stroke.width || 0) > 0, on => { L.stroke.width = on ? Math.max(6, L.stroke.width || 6) : 0; }));
        rowSwatch(secBo, 'Border color', L.stroke.color, hex => { L.stroke.color = hex; Editor.save(); Editor.draw(); });
        secBo.appendChild(pickNumberRow('Border width', L.stroke.width || 0, v => { L.stroke.width = Math.max(0, v); Editor.save(); Editor.draw(); }));
      } else {
        if (!L.border) L.border = { on: false, color: '#ffffff', width: 6, radius: 0 };
        secBo.appendChild(toggle('Border', !!L.border.on, on => { L.border.on = on; }));
        rowSwatch(secBo, 'Border color', L.border.color, hex => { L.border.color = hex; Editor.save(); Editor.draw(); });
        secBo.appendChild(pickNumberRow('Border width', L.border.width, v => { L.border.width = Math.max(0, v); Editor.save(); Editor.draw(); }));
        secBo.appendChild(pickNumberRow('Corner radius', L.border.radius || 0, v => { L.border.radius = Math.max(0, v); Editor.save(); Editor.draw(); }));
      }
      if (!L.shadow) L.shadow = { on: false, color: '#000000', opacity: 55, x: 14, y: 14, blur: 22 };
      secBo.appendChild(toggle('Shadow', !!L.shadow.on, on => { L.shadow.on = on; }));
      rowSwatch(secBo, 'Shadow color', L.shadow.color, hex => { L.shadow.color = hex; Editor.save(); Editor.draw(); });
      secBo.appendChild(pickNumberRow('Shadow opacity', L.shadow.opacity, v => { L.shadow.opacity = clamp(v, 0, 100); Editor.save(); Editor.draw(); }));
      secBo.appendChild(pickNumberRow('Offset X', L.shadow.x, v => { L.shadow.x = v; Editor.save(); Editor.draw(); }));
      secBo.appendChild(pickNumberRow('Offset Y', L.shadow.y, v => { L.shadow.y = v; Editor.save(); Editor.draw(); }));
      secBo.appendChild(pickNumberRow('Blur', L.shadow.blur, v => { L.shadow.blur = Math.max(0, v); Editor.save(); Editor.draw(); }));
    }

    // EFFECTS (visual layers)
    if (typeof FXEngine !== 'undefined' && typeof FXUI !== 'undefined' && FXEngine && FXUI && L.type !== 'audio' && L.type !== 'camera' && L.type !== 'group') {
      const secFx = mk('fx', 'Effects', !!(L.effects && L.effects.length));
      FXUI.renderIntoProps(secFx, L);
    }

    // VIDEO/AUDIO volume
    if (L.type === 'video' || L.type === 'audio') {
      const secV = mk('av', 'Media');
      const repMediaBtn = document.createElement('button');
      repMediaBtn.className = 'fat-btn accent';
      repMediaBtn.style.marginBottom = '8px';
      repMediaBtn.innerHTML = L.type === 'audio' ? '⮂ Replace Audio…' : '⮂ Replace Media…';
      repMediaBtn.onclick = () => Editor.replaceMedia(L);
      secV.appendChild(repMediaBtn);

      secV.appendChild(numRow('Volume %', 'volume', { step: 5 }));
      const b = document.createElement('button'); b.className = 'fat-btn'; b.textContent = 'Extract audio'; 
      b.onclick = () => { const a = createLayer('audio', Editor.project, L.start); a.name = L.name + ' audio'; a.src = L.src; a.duration = L.duration; Editor.pushUndo(); Editor.project.layers.unshift(a); Editor.renderTimeline(); Editor.save(); toast('Audio extracted'); };
      if (L.type === 'video') secV.appendChild(b);
    }

    // CAMERA
    if (L.type === 'camera') {
      const secCam = mk('cam', 'Camera Options', true);
      secCam.appendChild(numRow('Pan X', 'camX', { step: 10 }));
      secCam.appendChild(numRow('Pan Y', 'camY', { step: 10 }));
      secCam.appendChild(numRow('Zoom %', 'camZoom', { step: 5 }));
      secCam.appendChild(numRow('Rotation', 'camRot', { step: 2 }));
    }

    // PARENT / MASK quick
    const secM = mk('misc', 'Group, Parent & Mask');
    {
      const b1 = document.createElement('button'); b1.className = 'fat-btn'; b1.textContent = 'Set Parent…';
      b1.onclick = () => ParentPicker.open(L);
      const b2 = document.createElement('button'); b2.className = 'fat-btn'; b2.textContent = 'Masking…';
      b2.onclick = () => MaskPicker.open(L);
      secM.appendChild(b1); secM.appendChild(b2);
    }
    Props.updateDiamonds();
  },
  openSection(id) {
    Props.show();
    const sec = Props.sections[id];
    if (sec) { sec.style.display = ''; const h = sec.previousSibling; if (h && h.querySelector) h.querySelector('.caret').textContent = '▾'; }
    sec && sec.scrollIntoView({ block: 'center' });
  },
  diamondState(rowEl, L, prop) {
    const dia = rowEl.querySelector('.kf-dia'); if (!dia) return;
    dia.classList.toggle('on', !!kfAtTime(L, prop, Editor.t));
    dia.classList.toggle('haskf', hasKf(L, prop));
  },
  updateDiamonds() {
    if (!Props.el || Props.el.style.display === 'none' || !Editor.project) return;
    Props.el.querySelectorAll('.pnumrow').forEach(r => {
      const prop = r._prop || (r.getAttribute && r.dataset && r.dataset.prop);
      if (!prop) return;
      const L = Editor.sel(); if (!L) return;
      Props.diamondState(r, L, prop);
    });
  },
  refreshAnimatedValues() {
    if (!Props.el || Props.el.style.display === 'none') return;
    Props.el.querySelectorAll('.pnumrow, .fx-param-row, .transform-pad').forEach(r => r._refresh && r._refresh());
    Props.updateDiamonds();
  }
};

// small builders used in sections
function rowSwatch(parent, label, color, onChange) {
  const r = document.createElement('div'); r.className = 'prow';
  r.innerHTML = `<span class="pl">${label}</span>`;
  const b = document.createElement('button'); b.className = 'swatch'; b.style.background = color;
  bindSwatch(b, () => color, hex => { onChange(hex); });
  r.appendChild(b); parent.appendChild(r);
}
function pickNumberRow(label, val, onChange, opts = {}) {
  const r = document.createElement('div'); r.className = 'prow';
  r.innerHTML = `<span class="pl">${label}</span>`;
  const holder = document.createElement('div'); holder.className = 'spin';
  const i = document.createElement('input'); i.type = 'number'; i.value = (opts.drawnWhenDefault ? opts.drawnWhenDefault[0] : val);
  const dn = document.createElement('button'); dn.textContent = '<';
  const up = document.createElement('button'); up.textContent = '>';
  holder.appendChild(dn); holder.appendChild(i); holder.appendChild(up);
  i.style.background = 'transparent'; i.style.border = 'none'; i.style.textAlign = 'center';
  const step = 5;
  dn.onclick = () => { onChange((+i.value) - step); i.value = (+i.value) - step; };
  up.onclick = () => { onChange((+i.value) + step); i.value = (+i.value) + step; };
  i.onchange = () => onChange(+i.value);
  r.appendChild(holder);
  return r;
}

// number row with keyframe support pre-baked (used by numRow factory): tie _prop
// ---------------- PARENT / MASK ----------------
const ParentPicker = {
  open(L) {
    const list = document.getElementById('parent-list');
    list.innerHTML = '';
    const opts = [null, ...Editor.project.layers.filter(x => x.id !== L.id && x.type !== 'audio')];
    for (const p of opts) {
      const b = document.createElement('button');
      b.textContent = p ? `${p.name}` : 'None';
      b.onclick = () => { Editor.pushUndo(); L.parentId = p ? p.id : null; Modals.close('m-parent'); Props.render(); Editor.renderTimeline(); Editor.save(); toast(p ? `Linked to ${p.name}` : 'Parent cleared'); };
      list.appendChild(b);
    }
    Modals.close('m-parent'); Modals.open('m-parent');
  }
};
const MaskPicker = {
  open(L) {
    if (['audio', 'camera'].includes(L.type)) return toast('Masks apply to visual layers');
    const list = document.getElementById('mask-list');
    list.innerHTML = '';
    for (const [val, label] of [['none', 'None'], ['alpha', 'Alpha Mask'], ['alpha-invert', 'Alpha Inverted Mask']]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => { Editor.pushUndo(); L.maskMode = val; Modals.close('m-mask'); Editor.save(); toast(`Mask: ${label}`); };
      list.appendChild(b);
    }
    Modals.close('m-mask'); Modals.open('m-mask');
  }
};

// ---------------- KEYFRAMES MODAL ----------------
const Keyframes = {
  refreshOpen() { const m = document.getElementById('m-key'); if (m && !m.hidden && Keyframes._layer) Keyframes.fill(Keyframes._layer); },
  open() {
    const L = Editor.sel();
    if (!L) return toast('Select a layer first');
    Keyframes._layer = L;
    Modals.open('m-key');
    Keyframes.fill(L);
  },
  fill(L) {
    document.getElementById('k-layername').textContent = L.name;
    const props = document.getElementById('k-props');
    props.innerHTML = '';
    const trackWrap = document.getElementById('k-time-track');
    Keyframes.drawTimeTrack(L);
    for (const [prop, kfs] of Object.entries(L.anim)) {
      if (!kfs || !kfs.length) continue;
      const row = document.createElement('div');
      row.className = 'k-prop';
      row.innerHTML = `<div class="k-pname">${ANIM_PROPS[prop].name}</div><div class="k-diamonds"></div>`;
      const dia = row.querySelector('.k-diamonds');
      const W = () => dia.clientWidth || 300;
      for (const k of kfs) {
        const d = document.createElement('div');
        d.className = 'di';
        d.style.left = (k.t / Editor.project.duration * 100) + '%';
        d.title = `t=${k.t.toFixed(2)} v=${k.v} ease=${k.ease}`;
        d.onclick = e => editorEaseFor(L, prop, k.t, e);
        dia.appendChild(d);
      }
      const rm = document.createElement('button');
      rm.className = 'mini-sel'; rm.textContent = 'Edit…';
      rm.onclick = () => Keyframes.selectProp(L, prop);
      row.appendChild(rm);
      props.appendChild(row);
    }
    if (!props.children.length) props.innerHTML = '<p class="hint">No keyframes on this layer. Use ◆ buttons in Move & Transform or the recorder below.</p>';
    // recorder row: add kf for a chosen property at playhead
    const addRow = document.createElement('div');
    addRow.className = 'k-prop';
    addRow.innerHTML = `<div class="k-pname">Add at playhead</div>`;
    const sel = document.createElement('select'); sel.className = 'mini-sel';
    Object.entries(ANIM_PROPS).filter(([p]) => p !== 'volume' && p !== 'camX' && p !== 'camY').forEach(([p, info]) => { const o = document.createElement('option'); o.value = p; o.textContent = info.name; sel.appendChild(o); });
    if (['camera'].includes(L.type)) { sel.innerHTML = ''; [['camX', 'Camera Pan X'], ['camY', 'Camera Pan Y'], ['camZoom', 'Camera Zoom'], ['camRot', 'Camera Rotation']].forEach(([p, n]) => { const o = document.createElement('option'); o.value = p; o.textContent = n; sel.appendChild(o); }); }
    const add = document.createElement('button'); add.className = 'mini-sel'; add.textContent = '+ Add';
    add.onclick = () => { setKf(L, sel.value, Editor.t, propAt(L, sel.value, Editor.t), 'linear'); Keyframes.fill(L); document.getElementById('m-key')._dirty = true; toast('Keyframe added'); };
    addRow.appendChild(sel); addRow.appendChild(add);
    props.appendChild(addRow);
    document.getElementById('k-time').value = Editor.t.toFixed(2);
  },
  selectProp(L, prop) { Keyframes._prop = prop; toast(`${ANIM_PROPS[prop].name} — click a diamond to edit easing`); },
  drawTimeTrack(L) {
    const cv = document.getElementById('k-time-cv');
    const wrap = document.getElementById('k-time-track');
    cv.width = wrap.clientWidth || 500;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, 44);
    ctx.fillStyle = '#161a22'; ctx.fillRect(0, 0, cv.width, 44);
    ctx.strokeStyle = '#2b323f';
    for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(cv.width * i / 10, 0); ctx.lineTo(cv.width * i / 10, 44); ctx.stroke(); }
    const p = Keyframes._layer;
    ctx.fillStyle = '#00e887';
    for (const kfs of Object.values(p.anim)) {
      if (!kfs) continue;
      for (const k of kfs) { ctx.save(); ctx.translate(k.t / Editor.project.duration * cv.width, 22); ctx.rotate(Math.PI / 4); ctx.fillRect(-5, -5, 10, 10); ctx.restore(); }
    }
    document.getElementById('k-time-ph').style.left = (Editor.t / Editor.project.duration * 100) + '%';
  }
};
document.getElementById('k-time-track')?.addEventListener?.('pointerdown', e => { });
// move playhead by clicking track
window.addEventListener('DOMContentLoaded', () => {
  const wrap = document.getElementById('k-time-track');
  const ph = document.getElementById('k-time-ph');
  const scrubk = e => {
    const r = wrap.getBoundingClientRect();
    const u = clamp((e.clientX - r.left) / r.width, 0, 1);
    Editor.seek(u * Editor.project.duration);
    ph.style.left = (u * 100) + '%';
    if (Keyframes._layer) document.getElementById('k-time').value = Editor.t.toFixed(2);
  };
  wrap.addEventListener('pointerdown', e => { scrubk(e); const mv = ev => scrubk(ev); const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); });
  document.getElementById('k-time').addEventListener('change', e => { Editor.seek(clamp(+e.target.value || 0, 0, Editor.project.duration)); ph.style.left = (Editor.t / Editor.project.duration * 100) + '%'; });
  document.getElementById('k-clear-prop').onclick = () => {
    const L = Keyframes._layer; if (!L || !Keyframes._prop) return toast('Pick a property diamond first');
    clearProp(L, Keyframes._prop); Keyframes.fill(L); Props.render(); Editor.save();
  };
  document.getElementById('k-clear-all').onclick = () => {
    const L = Keyframes._layer; if (!L) return;
    L.anim = {}; Keyframes.fill(L); Props.render(); Editor.save(); toast('Keyframes cleared');
  };
});

// ---------------- EASING EDITOR ----------------
const Ease = {
  ctx: null,
  target: null,      // {layer, prop}
  curve: [0.33, 0.33, 0.66, 0.66],
  init() {
    const cv = document.getElementById('ez-cv');
    Ease.ctx = cv.getContext('2d');
    // chips
    const chips = document.getElementById('ease-chips');
    chips.innerHTML = '';
    for (const [id, info] of Object.entries(EASE_PRESETS)) {
      const b = document.createElement('button');
      b.textContent = info.name;
      b.dataset.eid = id;
      b.onclick = () => Ease.pick(id);
      chips.appendChild(b);
    }
    cv.addEventListener('pointerdown', e => {
      const pick = Ease.pickHandle(e);
      if (!pick) return;
      const mv = ev => {
        const r = cv.getBoundingClientRect();
        const ex = clamp((ev.clientX - r.left) / r.width, 0, 1);
        const ey = clamp(1 - (ev.clientY - r.top) / r.height, -1, 2);
        Ease.curve[pick.xi] = ex; Ease.curve[pick.yi] = ey;
        Ease.pickIdx = pick;
        Ease.draw();
        const [x1, y1, x2, y2] = Ease.curve;
        document.getElementById('ez-x1').value = x1; document.getElementById('ez-y1').value = y1;
        document.getElementById('ez-x2').value = x2; document.getElementById('ez-y2').value = y2;
      };
      mv(e);
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    ['ez-x1', 'ez-y1', 'ez-x2', 'ez-y2'].forEach((id, i) => {
      document.getElementById(id).addEventListener('change', () => { Ease.curve[i] = +document.getElementById(id).value; Ease.draw(); });
    });
    document.getElementById('ez-apply').onclick = () => {
      const { layer, prop, entry, t } = Ease.target || {};
      if ((layer || entry) && prop) {
        const k = entry ? effectKfAtTime(entry, prop, t) : kfAtTime(layer, prop, t);
        if (k) { k.c = [...Ease.curve]; k.ease = 'custom'; }
        Keyframes.refreshOpen(); Props.render(); Editor.save();
      }
      Modals.close('m-ease');
    };
  },
  pick(id) {
    document.querySelectorAll('#ease-chips button').forEach(b => b.classList.toggle('on', b.dataset.eid === id));
    if (id === 'custom') return;
    const b = EASE_PRESETS[id].b;
    Ease.curve = [...b];
    document.getElementById('ez-x1').value = b[0]; document.getElementById('ez-y1').value = b[1];
    document.getElementById('ez-x2').value = b[2]; document.getElementById('ez-y2').value = b[3];
    const { layer, prop, entry, t } = Ease.target || {};
    if ((layer || entry) && prop) {
      const k = entry ? effectKfAtTime(entry, prop, t) : kfAtTime(layer, prop, t);
      if (k) { k.ease = id; k.c = id === 'custom' ? [...Ease.curve] : undefined; }
      Editor.save();
    }
    Ease.draw();
    if (id !== 'hold') Modals.close('m-ease');
  },
  pickHandle(e) {
    const cv = document.getElementById('ez-cv');
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
    const [x1, y1, x2, y2] = Ease.curve;
    const d1 = Math.hypot(x - x1, y - y1), d2 = Math.hypot(x - x2, y - y2);
    if (d2 <= d1) return { xi: 2, yi: 3 };
    else return { xi: 0, yi: 1 };
  },
  draw() {
    const cv = document.getElementById('ez-cv'), ctx = Ease.ctx;
    if (!ctx) return;
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#161a22'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2b323f';
    ctx.strokeRect(.5, .5, w - 1, h - 1);
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    const X = v => v * w, Y = v => h - v * h;
    const [x1, y1, x2, y2] = Ease.curve;
    ctx.strokeStyle = '#00e887'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.bezierCurveTo(X(x1), Y(clamp(y1, -1, 2)), X(x2), Y(clamp(y2, -1, 2)), w, 0);
    ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(X(x1), Y(clamp(y1, -1, 2)), 6, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(X(x2), Y(clamp(y2, -1, 2)), 6, 0, 7); ctx.fill();
    // preview strip
    const pv = document.getElementById('ez-prev'), pc = pv.getContext('2d');
    pc.clearRect(0, 0, 256, 40); pc.fillStyle = '#161a22'; pc.fillRect(0, 0, 256, 40);
    pc.fillStyle = '#00e887';
    for (let u = 0; u < 1; u += 0.02) {
      pc.fillRect(u * 256, 40 - bezEase(u) * 36, 3, 4);
    }
    function bezEase(u2) { return easeApply('custom', u2, Ease.curve); }
  },
  open(layer, prop, t, entry = null) {
    if (!Ease.ctx) Ease.init();
    Ease.target = { layer, prop, t, entry };
    const k = entry ? effectKfAtTime(entry, prop, t) : kfAtTime(layer, prop, t);
    if (k) {
      if (k.ease === 'custom' && k.c) Ease.curve = [...k.c];
      else { Ease.curve = [...(EASE_PRESETS[k.ease]?.b || [0.33, .33, .66, .66])]; }
      document.querySelectorAll('#ease-chips button').forEach(b => b.classList.toggle('on', b.dataset.eid === (k.ease || 'linear')));
    }
    const [x1, y1, x2, y2] = Ease.curve;
    document.getElementById('ez-x1').value = x1; document.getElementById('ez-y1').value = y1;
    document.getElementById('ez-x2').value = x2; document.getElementById('ez-y2').value = y2;
    Ease.draw();
    Modals.open('m-ease');
  }
};
function editorEaseFor(layer, prop, t) { Ease.open(layer, prop, t); }
function editorEaseForEffect(entry, prop, t) { Ease.open(null, prop, t, entry); }

// ---------------- ADD MENUS ----------------
const AddMenus = {
  init() {
    // shape presets
    const grid = document.getElementById('shape-grid');
    for (const s of SHAPE_SHAPES) {
      const b = document.createElement('button'); b.dataset.s = s;
      b.innerHTML = ic(s);
      AddMenus._shape = 'rect';
      b.onclick = () => { document.querySelectorAll('#shape-grid button').forEach(x => x.classList.toggle('on', x === b)); AddMenus._shape = s; };
      if (s === 'rect') { b.classList.add('on'); AddMenus._shape = 'rect'; }
      grid.appendChild(b);
    }
    AddMenus._fill = '#00c2ff'; AddMenus._stroke = '#ffffff';
    bindSwatch(document.getElementById('sh-fill'), () => AddMenus._fill, hx => { AddMenus._fill = hx; document.getElementById('sh-fill').style.background = hx; });
    bindSwatch(document.getElementById('sh-stroke'), () => AddMenus._stroke, hx => { AddMenus._stroke = hx; document.getElementById('sh-stroke').style.background = hx; });
    document.getElementById('sh-add').onclick = () => {
      const p = Editor.project;
      Editor.pushUndo();
      const L = createLayer('shape', p, Editor.t, { shape: AddMenus._shape, fillColor: AddMenus._fill, strokeWidth: +document.getElementById('sh-sw').value || 0 });
      L.stroke.color = AddMenus._stroke;
      const sz = Math.min(p.width, p.height) * .4;
      L.w = sz; L.h = sz;
      L.name = AddMenus._shape[0].toUpperCase() + AddMenus._shape.slice(1);
      p.layers.splice(0, 0, L);
      Editor.select(L.id); Editor.renderTimeline(); Editor.save();
      Modals.close('m-shape');
    };

    // text
    AddMenus.fontsInit();
    document.getElementById('tx-save').onclick = () => {
      const L = AddMenus._textTarget;
      const val = {
        text: document.getElementById('tx-text').value || 'Text',
        font: document.getElementById('tx-font').value,
        weight: +document.getElementById('tx-weight').value,
        size: +document.getElementById('tx-size').value || 120,
        color: AddMenus._txColor,
        align: AddMenus._txAlign
      };
      const p = Editor.project;
      if (L) { Editor.pushUndo(); Object.assign(L, val); }
      else {
        Editor.pushUndo();
        const T = createLayer('text', p, Editor.t);
        Object.assign(T, val);
        T.name = 'Text';
        p.layers.splice(0, 0, T);
        Editor.select(T.id);
      }
      Editor.renderTimeline(); Editor.save();
      Modals.close('m-text');
    };
    AddMenus._txColor = '#ffffff'; AddMenus._txAlign = 'center';
    bindSwatch(document.getElementById('tx-color'), () => AddMenus._txColor, hx => { AddMenus._txColor = hx; document.getElementById('tx-color').style.background = hx; });
    document.querySelectorAll('#tx-align-chips button').forEach(b2 => b2.onclick = () => {
      AddMenus._txAlign = b2.dataset.al;
      document.querySelectorAll('#tx-align-chips button').forEach(x => x.classList.toggle('on', x === b2));
    });

    // freehand
    AddMenus.freehandInit();
    AddMenus.vectorInit();
    AddMenus.recordInit();
  },
  fontsInit() {
    const sel = document.getElementById('tx-font');
    sel.innerHTML = '';
    for (const f of FONTS) { const o = document.createElement('option'); o.value = f; o.textContent = f; sel.appendChild(o); }
  },
  shape() { Modals.open('m-shape'); },
  text(L) {
    AddMenus._textTarget = L;
    document.getElementById('tx-text').value = L ? L.text : '';
    document.getElementById('tx-font').value = L ? L.font : 'Arial';
    document.getElementById('tx-weight').value = L ? L.weight : 400;
    document.getElementById('tx-size').value = L ? L.size : Math.round(Editor.project.height / 9);
    document.getElementById('tx-color').style.background = L ? L.color : '#ffffff';
    AddMenus._txColor = L ? L.color : '#ffffff';
    AddMenus._txAlign = L ? L.align : 'center';
    document.querySelectorAll('#tx-align-chips button').forEach(x => x.classList.toggle('on', x.dataset.al === AddMenus._txAlign));
    Modals.open('m-text');
  },
  async elements() {
    const els = await Storage.all('elements');
    const grid = document.getElementById('el-grid');
    grid.innerHTML = els.length ? '' : '<p class="hint">No saved elements yet — use layer menu → Save as Element.</p>';
    for (const e of els.sort((a, b) => b.created - a.created)) {
      const card = document.createElement('div'); card.className = 'pcard';
      card.innerHTML = `<div class="thumb"></div><div class="meta"><div class="pname"></div><div class="psub">tap to add at playhead</div></div>`;
      card.querySelector('.pname').textContent = e.name;
      if (e.thumb) { const i = new Image(); i.src = e.thumb; card.querySelector('.thumb').appendChild(i); }
      card.onclick = () => { Modals.close('m-elements'); addElementToProject(e); };
      grid.appendChild(card);
    }
    Modals.close('m-elements'); Modals.open('m-elements');
  },

  // freehand ----------
  freehandInit() {
    const cv = document.getElementById('fh-canvas');
    AddMenus._fh = { strokes: [], cur: null, color: '#ffffff', fill: '#00e887' };
    bindSwatch(document.getElementById('fh-color'), () => AddMenus._fh.color, hx => { AddMenus._fh.color = hx; document.getElementById('fh-color').style.background = hx; });
    bindSwatch(document.getElementById('fh-fill'), () => AddMenus._fh.fill, hx => { AddMenus._fh.fill = hx; document.getElementById('fh-fill').style.background = hx; });
    const state = AddMenus._fh;
    const redraw = () => {
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const s of state.strokes.concat(state.cur ? [state.cur] : [])) FreehandRenderPreview(ctx, s);
    };
    const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
    cv.addEventListener('pointerdown', e => {
      state.cur = { pts: [pos(e)], size: +document.getElementById('fh-size').value || 8, color: state.color, fill: null };
      if (document.getElementById('fh-fillon').checked) state.cur.fillPending = true;
      const mv = ev => { state.cur.pts.push(pos(ev)); redraw(); };
      const up = () => {
        if (state.cur) {
          if (state.cur.fillPending) state.cur.fill = state.fill;
          state.strokes.push(state.cur); state.cur = null;
        }
        redraw();
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    document.getElementById('fh-undo').onclick = () => { state.strokes.pop(); redraw(); };
    document.getElementById('fh-clear').onclick = () => { state.strokes = []; redraw(); };
    document.getElementById('fh-color').style.background = state.color;
    document.getElementById('fh-fill').style.background = state.fill;
    document.getElementById('fh-add').onclick = () => {
      if (!state.strokes.length) return toast('Draw something first');
      const p = Editor.project;
      Editor.pushUndo();
      const L = createLayer('freehand', p, Editor.t);
      L.name = 'Drawing';
      L.w = p.width; L.h = p.height;
      const sx = p.width / 860, sy = p.height / 480;
      L.strokes = deep(state.strokes).map(s => ({ ...s, pts: s.pts.map(pt => [pt[0] * sx - p.width / 2, pt[1] * sy - p.height / 2]) }));
      L.duration = defaultDur ? L.duration : 3;
      p.layers.splice(0, 0, L);
      Editor.select(L.id); Editor.renderTimeline(); Editor.save();
      Modals.close('m-freehand'); state.strokes = []; redraw();
    };
  },

  // vector ----------
  vectorInit() {
    const cv = document.getElementById('vc-canvas');
    AddMenus._vc = { pts: [], closed: true, edit: false, dragIdx: -1, color: '#00e887' };
    const state = AddMenus._vc;
    bindSwatch(document.getElementById('vc-color'), () => state.color, hx => { state.color = hx; document.getElementById('vc-color').style.background = hx; });
    document.getElementById('vc-color').style.background = state.color;
    const redraw = () => {
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (state.pts.length > 1) {
        ctx.beginPath();
        state.pts.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]));
        if (state.closed) ctx.closePath();
        if (state.closed) { ctx.fillStyle = state.color + '66'; ctx.fill(); }
        ctx.strokeStyle = state.color; ctx.lineWidth = +document.getElementById('vc-sw').value || 4; ctx.stroke();
      }
      ctx.strokeStyle = '#8d97a5';
      state.pts.forEach(pt => ctx.strokeRect(pt[0] - 3, pt[1] - 3, 7, 7));
      for (let i = 1; i < state.pts.length; i++) {
        ctx.fillStyle = '#fff'; ctx.fillRect(state.pts[i][0] - 2, (state.pts[i][1] + state.pts[i - 1][1]) / 2 - 2, 4, 4);
      }
    };
    const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
    cv.addEventListener('pointerdown', e => {
      const p = pos(e);
      if (state.edit) {
        // drag nearest point
        let bi = -1, bd = 14;
        state.pts.forEach((pt, i) => { const d = Math.hypot(pt[0] - p[0], pt[1] - p[1]); if (d < bd) { bd = d; bi = i; } });
        if (bi >= 0) {
          state.dragIdx = bi;
          const mv = ev => { state.pts[state.dragIdx] = pos(ev); redraw(); };
          const up = () => { state.dragIdx = -1; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
          window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
        }
      } else {
        state.pts.push(p); redraw();
      }
    });
    document.getElementById('vc-undo').onclick = () => { state.pts.pop(); redraw(); };
    document.getElementById('vc-clear').onclick = () => { state.pts = []; redraw(); };
    document.getElementById('vc-close').onclick = () => { state.closed = true; redraw(); };
    document.getElementById('vc-open').onclick = () => { state.closed = false; redraw(); };
    document.getElementById('vc-editmode').onclick = e => {
      state.edit = !state.edit;
      e.target.textContent = 'Edit points: ' + (state.edit ? 'ON' : 'OFF');
      e.target.style.borderColor = state.edit ? 'var(--accent)' : '';
    };
    document.getElementById('vc-add').onclick = () => {
      if (state.pts.length < 3) return toast('Add at least 3 points');
      const p = Editor.project;
      Editor.pushUndo();
      const L = createLayer('vector', p, Editor.t);
      L.name = 'Vector Drawing';
      L.closed = state.closed;
      L.sw = +document.getElementById('vc-sw').value || 0;
      L.color = state.color;
      const sx = p.width / 860, sy = p.height / 480;
      L.points = state.pts.map(pt => [pt[0] * sx - p.width / 2, pt[1] * sy - p.height / 2]);
      L.scW = p.width; L.scH = p.height;
      p.layers.splice(0, 0, L);
      Editor.select(L.id); Editor.renderTimeline(); Editor.save();
      Modals.close('m-vector'); state.pts = []; redraw(); state.edit = false;
      document.getElementById('vc-editmode').textContent = 'Edit points: OFF';
    };
  },

  // record ----------
  recordInit() { RecordMod.init(); }
};
function FreehandRenderPreview(ctx, s) {
  if (s.fill && s.pts.length > 2) {
    ctx.fillStyle = s.fill; ctx.beginPath();
    s.pts.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]));
    ctx.closePath(); ctx.fill();
  }
  if (s.pts.length > 1) {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    s.pts.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]));
    ctx.stroke();
  } else {
    ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.pts[0][0], s.pts[0][1], s.size / 2, 0, 7); ctx.fill();
  }
}

async function addElementToProject(elem) {
  const p = Editor.project;
  if (!p) return;
  Editor.pushUndo();
  const L = deepDeser(elem.layer);
  L.id = uid(); L.start = Editor.t;
  p.layers.splice(0, 0, L);
  Editor.select(L.id); Editor.renderTimeline(); Editor.save();
  toast('Element added');
}

// ---------------- RECORD MODAL ----------------
const RecordMod = {
  init() {
    document.getElementById('rc-toggle').onclick = RecordMod.toggle;
    document.getElementById('rc-save').onclick = RecordMod.save;
  },
  async toggle() {
    if (RecordMod.rec) {
      RecordMod.rec.stop();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    const rec = new MediaRecorder(stream);
    RecordMod.rec = rec; RecordMod.stream = stream; RecordMod.chunks = chunks;
    RecordMod.started = Date.now();
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
      const fr = new FileReader();
      fr.onload = () => { RecordMod.result = fr.result; stream.getTracks().forEach(t => t.stop()); document.getElementById('rc-state').textContent = 'Ready — ' + fmtClock((Date.now() - RecordMod.started) / 1000); document.getElementById('rc-save').disabled = false; };
      fr.readAsDataURL(blob);
      rec.onresult = null;
      clearInterval(RecordMod.timer);
    };
    rec.start();
    RecordMod.timer = setInterval(() => { document.getElementById('rc-time').textContent = fmtClock((Date.now() - RecordMod.started) / 1000); }, 500);
    document.getElementById('rc-state').textContent = 'Recording…';
    document.getElementById('rc-toggle').textContent = '■ Stop';
    document.getElementById('rc-save').disabled = true;
  },
  save() {
    if (!RecordMod.result) return;
    const p = Editor.project;
    Editor.pushUndo();
    const probed = new Audio(RecordMod.result);
    const L = createLayer('audio', p, Editor.t);
    L.name = 'Recording';
    L.src = RecordMod.result;
    probed.onloadedmetadata = () => { L.aDur = probed.duration || 5; L.duration = Math.min(L.aDur, p.duration - L.start); Editor.renderTimeline(); Editor.save(); };
    L.aDur = 5; L.duration = 5;
    p.layers.splice(0, 0, L);
    Editor.select(L.id); Editor.renderTimeline(); Editor.save();
    RecordMod.result = null;
    document.getElementById('rc-save').disabled = true;
    document.getElementById('rc-toggle').textContent = '● Record';
    document.getElementById('rc-state').textContent = 'Idle.';
    Modals.close('m-record');
    toast('Recording added');
  }
};

// shape icons for the preset grid
function ic(s) {
  const M = {
    rect: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
    roundrect: '<rect x="6" y="6" width="12" height="12" rx="3"/>',
    ellipse: '<circle cx="12" cy="12" r="6.2"/>',
    triangle: '<path d="M12 5l7 13H5z"/>',
    diamond: '<path d="M12 5l7 7-7 7-7-7z"/>',
    star5: '<path d="M12 5l2 4.4 4.8.5-3.6 3.2 1 4.7L12 15.4 9.8 17.8l1-4.7L7.2 9.9l4.8-.5z"/>',
    heart: '<path d="M12 17s-5.5-3.4-5.5-7a2.8 2.8 0 0 1 5.5-1 2.8 2.8 0 0 1 5.5 1c0 3.6-5.5 7-5.5 7z"/>',
    hexagon: '<path d="M12 5l6 3.5v7L12 19l-6-3.5v-7z"/>',
    cross: '<path d="M10 5h4v5h5v4h-5v5h-4v-5H5v-4h5z"/>',
    arrow: '<path d="M4 10h10V6l6 6-6 6v-4H4z"/>',
    line: '<path d="M5 12h14"/>',
    spade: '<path d="M12 4c2.5 3 5 4.5 5 7a3 3 0 0 1-5 2.2V16l2 3H10l2-3v-2.8A3 3 0 0 1 7 11c0-2.5 2.5-4 5-7z"/>'
  };
  return `<svg viewBox="0 0 24 24">${M[s] || M.rect}</svg>`;
}
