// selection-bar.js — Alight Motion iOS Selection Action Panel & Tool Inspectors
// 1:1 recreation of iPhone Alight Motion GUI (IMG_8548 through IMG_8558)

const SelBar = {
  el: null,
  toolPanel: null,
  wrap: null,
  _L: null,
  activeTool: null,
  transformMode: 'pan', // 'pan' | 'rotate' | 'scale' | 'skew'

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
    presets: `<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    fx: `<svg viewBox="0 0 24 24"><path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    replace: `<svg viewBox="0 0 24 24"><path d="M4 16l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 19V9a4 4 0 0 1 4-4h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20 8l-3-3-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 5v10a4 4 0 0 1-4 4h-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    pan: `<svg viewBox="0 0 24 24"><path d="M12 2v20M2 12h20M12 2l-3 3h6zM12 22l-3-3h6zM2 12l3-3v6zM22 12l-3-3v6z" fill="currentColor"/></svg>`,
    rotate: `<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.8 1 6.5 2.6L21 3v6h-6l2.5-2.5A7 7 0 1 0 19 12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    scale: `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 15l6-6M9 9h6v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    skew: `<svg viewBox="0 0 24 24"><polygon points="6 4 20 4 18 20 4 20" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`,
    kf: `<svg viewBox="0 0 24 24"><path d="M12 3l8 9-8 9-8-9 8-9z" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 9v6M9 12h6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`,
    curve: `<svg viewBox="0 0 24 24"><path d="M4 19c6 0 6-14 16-14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="4" cy="19" r="2.5" fill="currentColor"/><circle cx="20" cy="5" r="2.5" fill="currentColor"/></svg>`,
    more: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/></svg>`
  },

  init() {
    if (SelBar.el) return;
    const wrap = document.getElementById('bottom-panel-wrap');
    if (!wrap) return;
    SelBar.wrap = wrap;

    const el = document.createElement('div');
    el.id = 'sel-actions';
    el.className = 'sel-actions';
    el.innerHTML = `
      <div class="sa-row-top">
        <button class="sa-mini" data-act="speed" title="Speed">${SelBar.icons.speed}</button>
        <div class="sa-join">
          <button class="sa-mini" data-act="trimstart" title="Trim start to playhead">${SelBar.icons.trimStart}</button>
          <button class="sa-mini" data-act="split" title="Split at playhead">${SelBar.icons.split}</button>
          <button class="sa-mini" data-act="trimend" title="Trim end to playhead">${SelBar.icons.trimEnd}</button>
        </div>
        <button class="sa-mini" data-act="volume" title="Volume">${SelBar.icons.volume}</button>
      </div>
      <div class="sa-cards-wrap">
        <div class="sa-row-cards sa-row-cards-3">
          <button class="sa-big" data-act="color">${SelBar.icons.fill}<span>Color &amp; Fill</span></button>
          <button class="sa-big" data-act="border">${SelBar.icons.border}<span>Border &amp; Shadow</span></button>
          <button class="sa-big" data-act="blend">${SelBar.icons.blend}<span>Blending &amp; Opacity</span></button>
        </div>
        <div class="sa-row-cards sa-row-cards-4">
          <button class="sa-big" data-act="transform">${SelBar.icons.move}<span>Move &amp; Transform</span></button>
          <button class="sa-big" data-act="shape">${SelBar.icons.shape}<span>Edit Shape</span></button>
          <button class="sa-big" data-act="presets">${SelBar.icons.presets}<span>Presets</span></button>
          <button class="sa-big" data-act="fx">${SelBar.icons.fx}<span>Effects</span></button>
        </div>
      </div>`;
    wrap.insertBefore(el, wrap.firstChild);
    SelBar.el = el;

    SelBar.toolPanel = document.getElementById('tool-detail-panel');

    el.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      e.preventDefault(); e.stopPropagation();
      SelBar.run(b.dataset.act, b);
    });
    el.addEventListener('pointerdown', e => e.stopPropagation());

    // Canvas zoom toggle (magnifying glass)
    const zoomBtn = document.getElementById('btn-canvas-zoom');
    if (zoomBtn) {
      zoomBtn.onclick = () => {
        Editor.zoom = Editor.zoom === 1 ? 2 : (Editor.zoom === 2 ? 0.5 : 1);
        Editor.fitStage();
        toast('Preview zoom ' + Math.round(Editor.zoom * 100) + '%');
      };
    }

    // Top layer header actions
    const btnGroup = document.getElementById('btn-layer-group');
    if (btnGroup) {
      btnGroup.onclick = () => {
        const L = Editor.sel();
        if (L) {
          Editor.clipboard = deep(L); delete Editor.clipboard.id;
          Editor.pasteLayer(false);
          toast('Layer duplicated');
        }
      };
    }
    const btnDel = document.getElementById('btn-layer-delete');
    if (btnDel) {
      btnDel.onclick = () => {
        const L = Editor.sel();
        if (L) {
          Editor.pushUndo();
          Editor.removeLayer(L);
          toast('Layer deleted');
        }
      };
    }
    const btnMore = document.getElementById('btn-layer-more');
    if (btnMore) {
      btnMore.onclick = e => {
        const L = Editor.sel(); if (!L) return;
        const r = btnMore.getBoundingClientRect();
        showContext(r.left - 120, r.bottom + 6, [
          ['Rename Layer', () => {
            const n = prompt('Layer name:', L.name);
            if (n) { L.name = n; SelBar.commit(); }
          }],
          ['Lock Layer', () => { L.locked = !L.locked; SelBar.commit(); }],
          ['Reset Position', () => { if (L.tf) { L.tf.x = 0; L.tf.y = 0; SelBar.commit(); } }],
          ['Duplicate', () => { Editor.clipboard = deep(L); delete Editor.clipboard.id; Editor.pasteLayer(false); }],
          ['Delete', () => { Editor.pushUndo(); Editor.removeLayer(L); }, 'warn']
        ]);
      };
    }

    // Floating add button
    const fab = document.getElementById('fab-add');
    if (fab) {
      fab.onclick = () => SelBar.openAddSheet();
    }
    const closeAdd = document.getElementById('btn-close-add-sheet');
    if (closeAdd) {
      closeAdd.onclick = () => SelBar.closeAddSheet();
    }
    const addOverlay = document.getElementById('ios-add-sheet');
    if (addOverlay) {
      addOverlay.onclick = e => {
        if (e.target === addOverlay) SelBar.closeAddSheet();
      };
    }
    SelBar.initAddSheetTabs();
  },

  tick() {
    if (!SelBar.el || SelBar.wrap.style.display === 'none') return;
    const L = SelBar._L; if (!L) return;
    const inside = Editor.t > L.start + 1e-4 && Editor.t < layerEnd(L) - 1e-4 ? 1 : 0;
    if (inside !== SelBar._inside) { SelBar._inside = inside; SelBar.updateActionStates(L); }
    if (SelBar.activeTool === 'transform') {
      SelBar.updateTransformDisplay(L);
    }
  },

  render(L) {
    if (!SelBar.el) SelBar.init();
    if (!SelBar.el || !SelBar.wrap) return;

    const editing = document.getElementById('editor-screen') &&
      document.getElementById('editor-screen').classList.contains('active');
    const visible = !!L && !!editing;

    const normalHeader = document.getElementById('ed-top-normal');
    const layerHeader = document.getElementById('ed-top-layer');
    const edTitle = document.getElementById('ed-title');
    const subTitle = document.getElementById('ed-sub-title');
    const zoomBtn = document.getElementById('btn-canvas-zoom');
    const fab = document.getElementById('fab-add');

    if (!visible) {
      SelBar.wrap.style.display = 'none';
      SelBar.el.style.display = 'none';
      if (SelBar.toolPanel) SelBar.toolPanel.style.display = 'none';
      SelBar._L = null;
      SelBar.activeTool = null;

      if (normalHeader) normalHeader.style.display = 'flex';
      if (layerHeader) layerHeader.style.display = 'none';
      if (edTitle) { edTitle.style.display = ''; edTitle.value = Editor.project ? Editor.project.name : 'Untitled'; }
      if (subTitle) subTitle.style.display = 'none';
      if (zoomBtn) zoomBtn.style.display = 'none';
      if (fab) fab.style.display = 'flex';

      const tl = document.getElementById('timeline');
      if (tl) tl.style.height = 'calc(100vh - 52px - 44px - 28px - 240px)';
      if (Editor.project) Editor.fitStage();
      return;
    }

    SelBar._L = L;
    SelBar.wrap.style.display = 'flex';

    if (normalHeader) normalHeader.style.display = 'none';
    if (layerHeader) layerHeader.style.display = 'flex';
    if (zoomBtn) zoomBtn.style.display = 'flex';
    if (fab) fab.style.display = 'none';

    if (SelBar.activeTool) {
      SelBar.el.style.display = 'none';
      if (SelBar.toolPanel) SelBar.toolPanel.style.display = 'flex';
      if (edTitle) edTitle.style.display = 'none';
      if (subTitle) {
        subTitle.style.display = '';
        subTitle.textContent = SelBar.toolTitle(SelBar.activeTool);
      }
    } else {
      SelBar.el.style.display = 'flex';
      if (SelBar.toolPanel) SelBar.toolPanel.style.display = 'none';
      if (edTitle) { edTitle.style.display = ''; edTitle.value = L.name || '(Unnamed Layer)'; }
      if (subTitle) subTitle.style.display = 'none';
    }

    SelBar.updateActionStates(L);

    const tl = document.getElementById('timeline');
    if (tl) tl.style.height = '140px';
    if (Editor.project) Editor.fitStage();
  },

  toolTitle(act) {
    const titles = {
      transform: 'Move & Transform',
      color: 'Color & Fill',
      border: 'Border & Shadow',
      blend: 'Blending & Opacity',
      shape: 'Edit Shape',
      presets: 'Presets',
      fx: 'Effects',
      volume: 'Volume'
    };
    return titles[act] || act;
  },

  updateActionStates(L) {
    if (!SelBar.el || !L) return;
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
      color: visual,
      border: visual,
      blend: L.type !== 'audio' && L.type !== 'camera',
      transform: L.type !== 'camera',
      shape: L.type === 'shape',
      presets: true,
      fx: !!(typeof FXUI !== 'undefined' && FXUI.isEffectable(L))
    };
    SelBar.el.querySelectorAll('[data-act]').forEach(b => {
      const on = state[b.dataset.act] !== false;
      b.disabled = !on;
      b.classList.toggle('off', !on);
    });
  },

  run(act, btn) {
    const L = SelBar._L || Editor.sel();
    if (!L) return;

    if (act === 'speed') return SelBar.speedMenu(L, btn);
    if (act === 'trimstart') return SelBar.trimStart(L);
    if (act === 'split') return SelBar.split(L);
    if (act === 'trimend') return SelBar.trimEnd(L);
    if (act === 'volume') return SelBar.openTool('volume');
    if (act === 'replace') return Editor.replaceMedia(L);

    SelBar.openTool(act);
  },

  openTool(tool) {
    SelBar.activeTool = tool;
    const L = Editor.sel();
    if (!L) return;

    SelBar.el.style.display = 'none';
    SelBar.toolPanel.style.display = 'flex';

    const edTitle = document.getElementById('ed-title');
    const subTitle = document.getElementById('ed-sub-title');
    if (edTitle) edTitle.style.display = 'none';
    if (subTitle) {
      subTitle.style.display = '';
      subTitle.textContent = SelBar.toolTitle(tool);
    }

    SelBar.renderToolPanel(tool, L);
  },

  closeTool() {
    SelBar.activeTool = null;
    SelBar.render(Editor.sel());
  },

  renderToolPanel(tool, L) {
    const p = SelBar.toolPanel;
    p.innerHTML = '';

    // 1. Left Action Strip
    const leftStrip = document.createElement('div');
    leftStrip.className = 'tool-left-strip';
    leftStrip.innerHTML = `
      <button class="t-back" title="Back to tools">
        <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="t-kf" title="Toggle keyframe">${SelBar.icons.kf}</button>
      <button class="t-curve" title="Easing curve">${SelBar.icons.curve}</button>
      <button class="t-more" title="More">${SelBar.icons.more}</button>`;
    p.appendChild(leftStrip);

    leftStrip.querySelector('.t-back').onclick = () => SelBar.closeTool();
    leftStrip.querySelector('.t-kf').onclick = () => SelBar.toggleActiveKeyframe(L);
    leftStrip.querySelector('.t-curve').onclick = () => Ease.open();
    leftStrip.querySelector('.t-more').onclick = () => toast('Options for ' + SelBar.toolTitle(tool));

    // 2. Central Content Area
    const centerArea = document.createElement('div');
    centerArea.className = 'tool-center-area';
    p.appendChild(centerArea);

    // 3. Right Mode Strip (if tool has submodes)
    let rightStrip = null;

    if (tool === 'transform') {
      rightStrip = document.createElement('div');
      rightStrip.className = 'tool-right-strip';
      rightStrip.innerHTML = `
        <button class="tf-mode-btn ${SelBar.transformMode === 'pan' ? 'on' : ''}" data-tf="pan" title="Pan / Move">${SelBar.icons.pan}</button>
        <button class="tf-mode-btn ${SelBar.transformMode === 'rotate' ? 'on' : ''}" data-tf="rotate" title="Rotate">${SelBar.icons.rotate}</button>
        <button class="tf-mode-btn ${SelBar.transformMode === 'scale' ? 'on' : ''}" data-tf="scale" title="Scale">${SelBar.icons.scale}</button>
        <button class="tf-mode-btn ${SelBar.transformMode === 'skew' ? 'on' : ''}" data-tf="skew" title="Skew">${SelBar.icons.skew}</button>`;
      p.appendChild(rightStrip);

      rightStrip.querySelectorAll('.tf-mode-btn').forEach(b => {
        b.onclick = () => {
          SelBar.transformMode = b.dataset.tf;
          rightStrip.querySelectorAll('.tf-mode-btn').forEach(x => x.classList.toggle('on', x === b));
          SelBar.renderTransformMode(centerArea, L);
        };
      });

      SelBar.renderTransformMode(centerArea, L);
    } else if (tool === 'color') {
      SelBar.renderColorInspector(centerArea, L);
    } else if (tool === 'border') {
      SelBar.renderBorderInspector(centerArea, L);
    } else if (tool === 'fx') {
      SelBar.renderEffectsInspector(centerArea, L);
    } else if (tool === 'volume') {
      SelBar.renderVolumeInspector(centerArea, L);
    } else if (tool === 'blend') {
      SelBar.renderBlendInspector(centerArea, L);
    } else if (tool === 'shape') {
      ShapeEdit.open(L);
      SelBar.closeTool();
    } else {
      centerArea.innerHTML = `<div style="margin:auto;color:var(--txt2);font-size:14px">${SelBar.toolTitle(tool)} controls</div>`;
    }
  },

  // ========== MOVE & TRANSFORM MODES (IMG_8551, 8552, 8553) ==========
  renderTransformMode(container, L) {
    container.innerHTML = '';
    const lt = layerTime(L, Editor.t);
    const curX = propAt(L, 'x', lt), curY = propAt(L, 'y', lt);
    const radX = Editor.project.width / 2, radY = Editor.project.height / 2;

    if (SelBar.transformMode === 'pan') {
      container.innerHTML = `
        <div class="tf-coords-row">
          <div class="tf-coord-box"><span class="tf-coord-val" id="tf-val-x">${(radX + curX).toFixed(1)}</span><span class="tf-coord-lbl">X</span></div>
          <div class="tf-coord-box"><span class="tf-coord-val" id="tf-val-y">${(radY + curY).toFixed(1)}</span><span class="tf-coord-lbl">Y</span></div>
          <div class="tf-coord-box"><span class="tf-coord-val">0.0</span><span class="tf-coord-lbl">Z</span></div>
        </div>
        <div class="tf-touchpad" id="tf-touchpad">
          <span class="tf-touchpad-hint">Swipe here to move layer</span>
          <div class="tf-corner tl"></div><div class="tf-corner tr"></div>
          <div class="tf-corner bl"></div><div class="tf-corner br"></div>
        </div>`;
      SelBar.initPanTouchpad(container.querySelector('#tf-touchpad'), L);
    } else if (SelBar.transformMode === 'rotate') {
      const curRot = propAt(L, 'rot', lt);
      container.innerHTML = `
        <div class="tf-coords-row">
          <div class="tf-coord-box"><span class="tf-coord-val" id="tf-val-rot">${curRot.toFixed(1)}°</span><span class="tf-coord-lbl">Angle</span></div>
        </div>
        <div class="tf-rotate-dial" id="tf-dial">
          <div class="tf-rotate-center" id="tf-dial-val">${Math.round(curRot)}°</div>
          <div class="tf-rotate-knob" id="tf-dial-knob"></div>
        </div>`;
      SelBar.initRotateDial(container.querySelector('#tf-dial'), L);
    } else if (SelBar.transformMode === 'scale') {
      const curScale = propAt(L, 'scale', lt) / 100;
      const baseW = L.w || Editor.project.width, baseH = L.h || Editor.project.height;
      const w = Math.round(baseW * curScale), h = Math.round(baseH * curScale);
      container.innerHTML = `
        <div class="tf-coords-row">
          <div class="tf-coord-box"><span class="tf-coord-val" id="tf-val-w">${w}</span><span class="tf-coord-lbl">Width</span></div>
          <span style="color:var(--txt3);font-size:18px">🔗</span>
          <div class="tf-coord-box"><span class="tf-coord-val" id="tf-val-h">${h}</span><span class="tf-coord-lbl">Height</span></div>
        </div>
        <div class="tf-scale-ruler" id="tf-scale-ruler">
          <div class="tf-scale-center-line"></div>
          <div class="tf-ruler-ticks"></div>
        </div>`;
      SelBar.initScaleRuler(container.querySelector('#tf-scale-ruler'), L);
    } else if (SelBar.transformMode === 'skew') {
      const curSkewX = propAt(L, 'skewX', lt);
      container.innerHTML = `
        <div class="tf-coords-row">
          <div class="tf-coord-box"><span class="tf-coord-val" id="tf-val-skew">${curSkewX.toFixed(1)}°</span><span class="tf-coord-lbl">Skew</span></div>
        </div>
        <div class="tf-touchpad" id="tf-skew-pad">
          <span class="tf-touchpad-hint">Swipe left / right to skew layer</span>
        </div>`;
      SelBar.initSkewPad(container.querySelector('#tf-skew-pad'), L);
    }
  },

  updateTransformDisplay(L) {
    if (!L) return;
    const lt = layerTime(L, Editor.t);
    const radX = Editor.project.width / 2, radY = Editor.project.height / 2;
    const curX = propAt(L, 'x', lt), curY = propAt(L, 'y', lt);
    const curRot = propAt(L, 'rot', lt);
    const curScale = propAt(L, 'scale', lt) / 100;

    const elX = document.getElementById('tf-val-x');
    const elY = document.getElementById('tf-val-y');
    if (elX) elX.textContent = (radX + curX).toFixed(1);
    if (elY) elY.textContent = (radY + curY).toFixed(1);

    const elRot = document.getElementById('tf-val-rot');
    const dialVal = document.getElementById('tf-dial-val');
    if (elRot) elRot.textContent = curRot.toFixed(1) + '°';
    if (dialVal) dialVal.textContent = Math.round(curRot) + '°';

    const baseW = L.w || Editor.project.width, baseH = L.h || Editor.project.height;
    const elW = document.getElementById('tf-val-w');
    const elH = document.getElementById('tf-val-h');
    if (elW) elW.textContent = Math.round(baseW * curScale);
    if (elH) elH.textContent = Math.round(baseH * curScale);
  },

  initPanTouchpad(pad, L) {
    if (!pad) return;
    let startX = 0, startY = 0, origX = 0, origY = 0;
    pad.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      startX = e.clientX; startY = e.clientY;
      const lt = layerTime(L, Editor.t);
      origX = propAt(L, 'x', lt); origY = propAt(L, 'y', lt);
      Editor.pushUndo();

      const move = ev => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        const nx = origX + dx, ny = origY + dy;
        const curLt = layerTime(L, Editor.t);
        if (hasKf(L, 'x') || hasKf(L, 'y')) {
          setKf(L, 'x', curLt, nx); setKf(L, 'y', curLt, ny);
        } else {
          if ('x' in L.tf) L.tf.x = nx;
          if ('y' in L.tf) L.tf.y = ny;
        }
        SelBar.updateTransformDisplay(L);
        Editor.draw();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        SelBar.commit();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  },

  initRotateDial(dial, L) {
    if (!dial) return;
    let origRot = 0, startAng = 0;
    dial.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      const rect = dial.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      startAng = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      const lt = layerTime(L, Editor.t);
      origRot = propAt(L, 'rot', lt);
      Editor.pushUndo();

      const move = ev => {
        const curAng = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
        const delta = curAng - startAng;
        const newRot = origRot + delta;
        const curLt = layerTime(L, Editor.t);
        if (hasKf(L, 'rot')) setKf(L, 'rot', curLt, newRot);
        else L.tf.rot = newRot;
        SelBar.updateTransformDisplay(L);
        Editor.draw();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        SelBar.commit();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  },

  initScaleRuler(ruler, L) {
    if (!ruler) return;
    let startY = 0, origScale = 100;
    ruler.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      startY = e.clientY;
      const lt = layerTime(L, Editor.t);
      origScale = propAt(L, 'scale', lt);
      Editor.pushUndo();

      const move = ev => {
        const dy = startY - ev.clientY;
        const newScale = Math.max(5, origScale + dy * 0.8);
        const curLt = layerTime(L, Editor.t);
        if (hasKf(L, 'scale')) setKf(L, 'scale', curLt, newScale);
        else L.tf.scale = newScale;
        SelBar.updateTransformDisplay(L);
        Editor.draw();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        SelBar.commit();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  },

  initSkewPad(pad, L) {
    if (!pad) return;
    let startX = 0, origSkew = 0;
    pad.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      startX = e.clientX;
      const lt = layerTime(L, Editor.t);
      origSkew = propAt(L, 'skewX', lt);
      Editor.pushUndo();

      const move = ev => {
        const dx = ev.clientX - startX;
        const newSkew = origSkew + dx * 0.4;
        const curLt = layerTime(L, Editor.t);
        if (hasKf(L, 'skewX')) setKf(L, 'skewX', curLt, newSkew);
        else L.tf.skewX = newSkew;
        const el = document.getElementById('tf-val-skew');
        if (el) el.textContent = newSkew.toFixed(1) + '°';
        Editor.draw();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        SelBar.commit();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  },

  toggleActiveKeyframe(L) {
    if (!L) return;
    const lt = layerTime(L, Editor.t);
    let prop = 'x';
    if (SelBar.activeTool === 'transform') {
      prop = SelBar.transformMode === 'rotate' ? 'rot' : (SelBar.transformMode === 'scale' ? 'scale' : 'x');
    }
    Editor.pushUndo();
    if (kfAtTime(L, prop, lt)) {
      removeKf(L, prop, lt);
      toast('Keyframe removed');
    } else {
      setKf(L, prop, lt, propAt(L, prop, lt));
      toast('Keyframe added');
    }
    SelBar.commit();
  },

  // ========== COLOR INSPECTOR (IMG_8555) ==========
  renderColorInspector(container, L) {
    const swatches = [
      '#ffffff', '#000000', '#ff2d78', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00e676',
      '#00c2ff', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#8e8e93', '#636366'
    ];
    const curColor = (L.fill && L.fill.color) || '#ffffff';

    container.innerHTML = `
      <div class="color-tab-strip">
        <button class="color-tab active">Color</button>
        <button class="color-tab">Gradient</button>
        <button class="color-tab">Media</button>
      </div>
      <div class="color-hex-bar">
        <input type="text" class="color-hex-input" id="col-hex-in" value="${curColor.toUpperCase()} (100%)">
        <button id="col-eyedrop" title="Eyedropper" style="font-size:16px">💧</button>
      </div>
      <div class="color-swatches-grid">
        ${swatches.map(c => `<div class="color-swatch-box" data-c="${c}" style="background:${c}"></div>`).join('')}
      </div>`;

    container.querySelectorAll('.color-swatch-box').forEach(b => {
      b.onclick = () => {
        const hx = b.dataset.c;
        Editor.pushUndo();
        if (!L.fill) L.fill = { type: 'solid', color: hx };
        else L.fill.color = hx;
        document.getElementById('col-hex-in').value = hx.toUpperCase() + ' (100%)';
        SelBar.commit();
      };
    });

    const eyedrop = container.querySelector('#col-eyedrop');
    if (eyedrop && window.EyeDropper) {
      eyedrop.onclick = async () => {
        try {
          const res = await new EyeDropper().open();
          if (res && res.sRGBHex) {
            Editor.pushUndo();
            if (!L.fill) L.fill = { type: 'solid', color: res.sRGBHex };
            else L.fill.color = res.sRGBHex;
            document.getElementById('col-hex-in').value = res.sRGBHex.toUpperCase() + ' (100%)';
            SelBar.commit();
          }
        } catch { }
      };
    }
  },

  // ========== BORDER INSPECTOR (IMG_8554) ==========
  renderBorderInspector(container, L) {
    const sw = L.stroke ? (L.stroke.width || 0) : 0;
    const on = sw > 0;
    container.innerHTML = `
      <div class="ios-switch-row">
        <span style="font-size:15px;font-weight:600">Stroke</span>
        <div class="ios-switch ${on ? 'on' : ''}" id="stroke-switch">
          <div class="ios-switch-thumb"></div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin:12px 0">
        <span style="font-size:13px;color:var(--txt2);min-width:60px">Width</span>
        <input type="range" min="0" max="60" value="${sw}" class="volume-slider" id="stroke-w-range">
        <span style="font-size:14px;font-weight:700;min-width:32px" id="stroke-w-num">${sw}</span>
      </div>`;

    const swEl = container.querySelector('#stroke-switch');
    const range = container.querySelector('#stroke-w-range');
    const num = container.querySelector('#stroke-w-num');

    swEl.onclick = () => {
      const nowOn = !swEl.classList.contains('on');
      swEl.classList.toggle('on', nowOn);
      Editor.pushUndo();
      if (!L.stroke) L.stroke = { color: '#ffffff', width: nowOn ? 4 : 0 };
      else L.stroke.width = nowOn ? (range.value > 0 ? +range.value : 4) : 0;
      range.value = L.stroke.width;
      num.textContent = L.stroke.width;
      SelBar.commit();
    };

    range.oninput = () => {
      const v = +range.value;
      num.textContent = v;
      swEl.classList.toggle('on', v > 0);
      if (!L.stroke) L.stroke = { color: '#ffffff', width: v };
      else L.stroke.width = v;
      Editor.draw();
    };
    range.onchange = () => SelBar.commit();
  },

  // ========== EFFECTS INSPECTOR (IMG_8556, 8557) ==========
  renderEffectsInspector(container, L) {
    const effs = L.effects || [];
    container.innerHTML = `
      <div class="ios-effects-list">
        ${effs.map((ef, idx) => `
          <div class="ios-effect-item" data-idx="${idx}">
            <span style="font-size:12px;color:var(--txt3)">▶</span>
            <span class="ios-effect-title">${ef.name || ef.id || 'Effect'}</span>
            <button class="eye ${ef.disabled ? 'off' : ''}" data-fx-eye="${idx}">
              <svg viewBox="0 0 24 24"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>
            </button>
            <span style="color:var(--txt3);font-size:14px;cursor:grab">≡</span>
          </div>
        `).join('')}
      </div>
      <button class="ios-add-effect-btn" id="btn-open-fx-browser">+ Add Effect</button>`;

    container.querySelectorAll('[data-fx-eye]').forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        const idx = +b.dataset.fxEye;
        if (effs[idx]) {
          effs[idx].disabled = !effs[idx].disabled;
          b.classList.toggle('off', !!effs[idx].disabled);
          SelBar.commit();
        }
      };
    });

    const addFx = container.querySelector('#btn-open-fx-browser');
    if (addFx && typeof FXUI !== 'undefined') {
      addFx.onclick = () => FXUI.open();
    }
  },

  // ========== VOLUME INSPECTOR (IMG_8558) ==========
  renderVolumeInspector(container, L) {
    const lt = layerTime(L, Editor.t);
    const curVol = clamp(propAt(L, 'volume', lt), 0, 100);
    container.innerHTML = `
      <div class="volume-control-wrap">
        <span style="font-size:20px;color:var(--txt2)">🔊</span>
        <input type="range" min="0" max="100" value="${curVol}" class="volume-slider" id="vol-slider">
        <span style="font-size:15px;font-weight:700;color:var(--txt);min-width:36px;text-align:right" id="vol-val">${Math.round(curVol)}</span>
      </div>`;

    const slider = container.querySelector('#vol-slider');
    const val = container.querySelector('#vol-val');
    slider.oninput = () => {
      const v = +slider.value;
      val.textContent = v;
      if (hasKf(L, 'volume')) setKf(L, 'volume', layerTime(L, Editor.t), v);
      else L.volume = v;
      Editor.draw();
    };
    slider.onchange = () => SelBar.commit();
  },

  // ========== BLENDING & OPACITY ==========
  renderBlendInspector(container, L) {
    const lt = layerTime(L, Editor.t);
    const op = propAt(L, 'opacity', lt);
    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <span style="font-size:13px;color:var(--txt2);min-width:60px">Opacity</span>
        <input type="range" min="0" max="100" value="${op}" class="volume-slider" id="blend-op-range">
        <span style="font-size:14px;font-weight:700;min-width:36px" id="blend-op-num">${Math.round(op)}%</span>
      </div>
      <div class="f-row">
        <span>Blend Mode</span>
        <select id="blend-mode-sel" style="flex:1">
          ${BLEND_MODES.map(m => `<option value="${m}" ${L.blend === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>`;

    const range = container.querySelector('#blend-op-range');
    const num = container.querySelector('#blend-op-num');
    const sel = container.querySelector('#blend-mode-sel');

    range.oninput = () => {
      const v = +range.value;
      num.textContent = v + '%';
      if (hasKf(L, 'opacity')) setKf(L, 'opacity', layerTime(L, Editor.t), v);
      else L.opacity = v;
      Editor.draw();
    };
    range.onchange = () => SelBar.commit();
    sel.onchange = () => {
      Editor.pushUndo();
      L.blend = sel.value;
      SelBar.commit();
    };
  },

  // ========== SPEED MENU ==========
  speedMenu(L, btn) {
    const cur = L.speed || 1;
    const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
    const r = btn && btn.getBoundingClientRect ? btn.getBoundingClientRect() : { left: 40, bottom: 200 };
    const items = speeds.map(s => [
      (Math.abs(s - cur) < 1e-3 ? '✓ ' : '   ') + (s === 1 ? '1× (normal)' : s + '×'),
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
    toast(s === 1 ? 'Speed reset to 1×' : 'Speed ' + s + '×');
  },

  // ========== TRIM / SPLIT ==========
  trimStart(L) {
    const t = Editor.t, end = layerEnd(L);
    if (!(t > L.start + 1e-4 && t < end - 1e-4)) return toast('Move playhead inside layer');
    Editor.pushUndo();
    const cut = t - L.start;
    L.tOff = (L.tOff || 0) + cut * (L.speed || 1);
    L.start = t;
    L.duration = end - t;
    SelBar.commit();
    toast('Trimmed start');
  },

  trimEnd(L) {
    const t = Editor.t;
    if (!(t > L.start + 1e-4 && t < layerEnd(L) - 1e-4)) return toast('Move playhead inside layer');
    Editor.pushUndo();
    L.duration = t - L.start;
    SelBar.commit();
    toast('Trimmed end');
  },

  split(L) {
    const t = Editor.t, end = layerEnd(L);
    if (!(t > L.start + 1e-4 && t < end - 1e-4)) return toast('Move playhead inside layer');
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

  commit() {
    Editor.renderTimeline();
    Editor.draw();
    if (typeof Props !== 'undefined' && Props.render) Props.render();
    SelBar.render(Editor.sel());
    Editor.save();
  },

  // ========== ALIGHT MOTION IOS ADD MENU SHEET (IMG_8549) ==========
  openAddSheet() {
    const sheet = document.getElementById('ios-add-sheet');
    if (sheet) {
      sheet.style.display = 'flex';
      SelBar.renderAddShapesGrid();
    }
  },

  closeAddSheet() {
    const sheet = document.getElementById('ios-add-sheet');
    if (sheet) sheet.style.display = 'none';
  },

  initAddSheetTabs() {
    const tabs = document.querySelectorAll('.ios-tab-btn[data-tab]');
    tabs.forEach(btn => {
      btn.onclick = () => {
        tabs.forEach(t => t.classList.toggle('active', t === btn));
        const tab = btn.dataset.tab;
        if (tab === 'media') {
          SelBar.closeAddSheet();
          document.getElementById('file-media').click();
        } else if (tab === 'audio') {
          SelBar.closeAddSheet();
          document.getElementById('file-audio').click();
        } else if (tab === 'object') {
          SelBar.closeAddSheet();
          Modals.open('m-object');
        } else if (tab === 'text') {
          SelBar.closeAddSheet();
          AddMenus.text(null);
        } else if (tab === 'freehand') {
          SelBar.closeAddSheet();
          AddMenus.freehand();
        } else if (tab === 'vector') {
          SelBar.closeAddSheet();
          AddMenus.vector();
        } else if (tab === 'shape') {
          SelBar.renderAddShapesGrid();
        }
      };
    });
  },

  renderAddShapesGrid() {
    const grid = document.getElementById('ios-shapes-grid');
    if (!grid) return;

    // Alight Motion iOS Shapes (Circle, Rounded Rect, Plus, Arc, Triangle, Pacman, Hexagon, Star, Arrow, Diamond, Heart, Cross, etc.)
    const shapes = [
      { id: 'ellipse', svg: `<circle cx="12" cy="12" r="9"/>` },
      { id: 'roundrect', svg: `<rect x="3" y="3" width="18" height="18" rx="5"/>` },
      { id: 'cross', svg: `<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>` },
      { id: 'arc', svg: `<path d="M12 3a9 9 0 1 0 9 9h-4a5 5 0 1 1-5-5V3z"/>` },
      { id: 'triangle', svg: `<polygon points="12 3 22 21 2 21"/>` },
      { id: 'pacman', svg: `<path d="M12 12l8.5-4.5A9 9 0 1 0 20.5 16.5L12 12z"/>` },
      { id: 'hexagon', svg: `<polygon points="12 2 21 7 21 17 12 22 3 17 3 7"/>` },
      { id: 'flower', svg: `<circle cx="12" cy="12" r="4"/><circle cx="12" cy="5" r="3"/><circle cx="12" cy="19" r="3"/><circle cx="5" cy="12" r="3"/><circle cx="19" cy="12" r="3"/>` },
      { id: 'arrow', svg: `<path d="M12 3l9 9h-6v9H9v-9H3z"/>` },
      { id: 'trapezoid', svg: `<polygon points="6 4 18 4 22 20 2 20"/>` },
      { id: 'rect', svg: `<rect x="3" y="3" width="18" height="18"/>` },
      { id: 'star5', svg: `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>` },
      { id: 'line', svg: `<line x1="3" y1="21" x2="21" y2="3" stroke="#fff" stroke-width="3" stroke-linecap="round"/>` },
      { id: 'diamond', svg: `<polygon points="12 2 22 12 12 22 2 12"/>` },
      { id: 'heart', svg: `<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>` }
    ];

    grid.innerHTML = shapes.map(s => `
      <div class="ios-shape-card" data-shape="${s.id}" title="${s.id}">
        <svg viewBox="0 0 24 24">${s.svg}</svg>
      </div>
    `).join('');

    grid.querySelectorAll('.ios-shape-card').forEach(card => {
      card.onclick = () => {
        const shapeId = card.dataset.shape;
        SelBar.addShapeLayer(shapeId);
        SelBar.closeAddSheet();
      };
    });
  },

  addShapeLayer(shapeType) {
    const p = Editor.project; if (!p) return;
    Editor.pushUndo();
    const l = createLayer(p, 'shape', {
      shape: shapeType,
      w: 420, h: 420,
      fill: { type: 'solid', color: '#ffffff' },
      stroke: { color: '#ffffff', width: 0 }
    });
    l.start = Editor.t;
    l.duration = Math.min(3, p.duration - Editor.t);
    p.layers.unshift(l);
    Editor.select(l.id);
    SelBar.commit();
    toast('Shape added');
  }
};

// ================= EDIT SHAPE =================
const ShapeEdit = {
  _L: null,
  open(L) {
    if (!L || L.type !== 'shape') return;
    ShapeEdit._L = L;
    const grid = document.getElementById('es-grid');
    if (grid && !grid.children.length) {
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
    ShapeEdit.bind();
    Modals.open('m-editshape');
  },
  fill(L) {
    document.querySelectorAll('#es-grid button').forEach(b => {
      b.classList.toggle('on', b.dataset.shape === L.shape);
    });
    document.getElementById('es-w').value = Math.round(L.w);
    document.getElementById('es-h').value = Math.round(L.h);
    const hasCorner = L.shape === 'roundrect';
    const isStar = L.shape === 'star5';
    document.getElementById('es-corner-row').hidden = !hasCorner;
    document.getElementById('es-spikes-row').hidden = !isStar;
    document.getElementById('es-inner-row').hidden = !isStar;
    if (hasCorner) document.getElementById('es-corner').value = Math.round(L.corner || 0);
    if (isStar) {
      document.getElementById('es-spikes').value = L.spikes || 5;
      document.getElementById('es-inner').value = Math.round((L.inner == null ? 0.42 : L.inner) * 100);
    }
  },
  bind() {
    if (ShapeEdit._bound) return;
    ShapeEdit._bound = true;
    const set = (k, v) => {
      const L = ShapeEdit._L; if (!L) return;
      Editor.pushUndo();
      L[k] = v;
      Editor.draw(); Editor.save();
    };
    document.getElementById('es-w').onchange = e => set('w', Math.max(4, +e.target.value));
    document.getElementById('es-h').onchange = e => set('h', Math.max(4, +e.target.value));
    document.getElementById('es-corner').onchange = e => set('corner', Math.max(0, +e.target.value));
    document.getElementById('es-spikes').onchange = e => set('spikes', clamp(Math.round(+e.target.value), 3, 24));
    document.getElementById('es-inner').onchange = e => set('inner', clamp(+e.target.value / 100, 0.05, 0.95));
  }
};
