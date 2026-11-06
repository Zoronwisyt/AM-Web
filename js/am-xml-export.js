// js/am-xml-export.js
// Alight Motion XML Engine: High-fidelity Import, Export, Missing Font Detection
// Fully compatible with Alight Motion (Android & iOS)

const AMXML = {
  // ==========================================
  // EXPORT
  // ==========================================
  export(project) {
    const p = project;
    const totalTimeMs = Math.round((p.duration || 5) * 1000);
    const fps = p.fps || 30;
    const bgHex = AMXML._toAmColor(p.bg || '#000000');
    const title = AMXML._esc(p.name || 'Alight Motion Project');

    const lines = [];
    lines.push("<?xml version='1.0' encoding='UTF-8' ?>");
    lines.push(`<!-- Exported from Alight Motion Web Engine -->`);
    lines.push(`<scene title="${title}" width="${p.width || 1080}" height="${p.height || 1920}" exportWidth="${p.width || 1080}" exportHeight="${p.height || 1920}" bgcolor="${bgHex}" totalTime="${totalTimeMs}" fps="${fps}" amver="859" ffver="107" am="com.alightcreative.motion/6.2.53" amplatform="all" precompose="dynamicResolution" retime="freeze">`);

    // Bookmarks
    if (p.bookmarks && p.bookmarks.length) {
      for (const b of p.bookmarks) {
        const tSec = typeof b === 'number' ? b : (b.t || 0);
        const tMs = Math.round(tSec * 1000);
        const nameAttr = (typeof b === 'object' && b.name) ? ` name="${AMXML._esc(b.name)}"` : '';
        lines.push(`  <bookmark t="${tMs}"${nameAttr}/>`);
      }
    }

    // Export layers in reverse order (bottom-to-top as stored in AM scenes)
    const layerMap = new Map();
    const groupedLayerIds = new Set();
    for (const L of (p.layers || [])) {
      layerMap.set(L.id, L);
      if (L.type === 'group' && L.memberIds) {
        for (const mid of L.memberIds) groupedLayerIds.add(mid);
      }
    }

    const topLayers = (p.layers || []).filter(L => !groupedLayerIds.has(L.id)).reverse();
    for (let i = 0; i < topLayers.length; i++) {
      const L = topLayers[i];
      if (L.type === 'camera') continue;
      const xmlStr = AMXML._exportLayer(L, p, i + 1, layerMap);
      if (xmlStr && xmlStr.trim()) lines.push(xmlStr);
    }

    lines.push('</scene>');
    return lines.join('\n');
  },

  _exportLayer(L, p, idx, layerMap = null) {
    if (L.type === 'camera') return '';
    const stMs = Math.round((L.start || 0) * 1000);
    const etMs = Math.round(((L.start || 0) + (L.duration || 1)) * 1000);
    const id = L.id ? String(L.id).replace(/\D/g, '').slice(0, 10) || String(idx) : String(idx);
    const label = AMXML._esc(L.name || `Layer ${idx}`);
    const speedAttr = (L.speed && L.speed !== 1) ? ` speed="${L.speed.toFixed(6)}"` : '';

    if (L.type === 'group') {
      const inner = [];
      inner.push(AMXML._exportTransform(L, p));
      if (L.effects && L.effects.length) {
        for (const eff of L.effects) {
          inner.push(AMXML._exportEffect(eff, L));
        }
      }
      if (L.memberIds && L.memberIds.length && layerMap) {
        const memberLayers = L.memberIds.map(mid => layerMap.get(mid)).filter(Boolean).reverse();
        for (let m = 0; m < memberLayers.length; m++) {
          const subXml = AMXML._exportLayer(memberLayers[m], p, m + 1, layerMap);
          if (subXml && subXml.trim()) inner.push(subXml);
        }
      }
      const innerStr = inner.filter(Boolean).join('\n');
      return `  <embedScene id="${id}" label="${label}" startTime="${stMs}" endTime="${etMs}"${speedAttr} fillType="intrinsic">
${AMXML._indent(innerStr, 4)}
  </embedScene>`;
    }

    const inner = [];
    // Transform block
    inner.push(AMXML._exportTransform(L, p));

    // Effects block
    if (L.effects && L.effects.length) {
      for (const eff of L.effects) {
        inner.push(AMXML._exportEffect(eff, L));
      }
    }

    const innerStr = inner.filter(Boolean).join('\n');

    switch (L.type) {
      case 'shape': {
        const sShape = AMXML._shapeToAm(L.shape);
        const color = AMXML._toAmColor(L.fill?.color || '#00c2ff');
        const hw = ((L.w || 200) / 2).toFixed(6);
        const hh = ((L.h || 200) / 2).toFixed(6);
        return `  <shape id="${id}" label="${label}" startTime="${stMs}" endTime="${etMs}"${speedAttr} fillType="color" s="${sShape}">
${AMXML._indent(innerStr, 4)}
    <fillColor value="${color}"/>
    <property name="size" type="vec2" value="${hw},${hh}"/>
  </shape>`;
      }
      case 'image':
      case 'video': {
        const fillAttr = L.type === 'video' ? `fillVideo="${AMXML._esc(L.src || '')}"` : `fillImage="${AMXML._esc(L.src || '')}"`;
        const hw = (((L.w || p.width || 1080)) / 2).toFixed(6);
        const hh = (((L.h || p.height || 1920)) / 2).toFixed(6);
        return `  <shape id="${id}" label="${label}" startTime="${stMs}" endTime="${etMs}"${speedAttr} fillType="media" ${fillAttr} s=".rect">
${AMXML._indent(innerStr, 4)}
    <property name="size" type="vec2" value="${hw},${hh}"/>
  </shape>`;
      }
      case 'text': {
        const txt = AMXML._esc(L.text || 'Text');
        const szVal = L.rawAmSize != null ? L.rawAmSize : ((L.size && L.size >= 50) ? (L.size / 3.5) : (L.size || 24));
        const sz = szVal.toFixed(6);
        const col = AMXML._toAmColor(L.color || '#ffffff');
        const fontStr = AMXML._fontToAm(L.font || 'Roboto-Regular');
        const wrapW = Math.round(L.wrapWidth || p.width || 1080);
        const align = L.align || 'center';
        return `  <text id="${id}" label="${label}" startTime="${stMs}" endTime="${etMs}"${speedAttr} fillType="color" size="${sz}" font="${AMXML._esc(fontStr)}" wrapWidth="${wrapW}" align="${align}">
${AMXML._indent(innerStr, 4)}
    <fillColor value="${col}"/>
    <content>${txt}</content>
  </text>`;
      }
      case 'audio': {
        const vol = ((L.volume != null ? L.volume : 100) / 100).toFixed(6);
        return `  <audio id="${id}" label="${label}" startTime="${stMs}" endTime="${etMs}" src="${AMXML._esc(L.src || '')}" volume="${vol}">
${AMXML._indent(innerStr, 4)}
  </audio>`;
      }
      default: {
        return `  <shape id="${id}" label="${label}" startTime="${stMs}" endTime="${etMs}"${speedAttr} fillType="color" s=".rect">
${AMXML._indent(innerStr, 4)}
  </shape>`;
      }
    }
  },

  _exportTransform(L, p) {
    const tf = L.tf || {};
    const curX = (tf.x != null ? tf.x : (L.x != null ? L.x : 0));
    const curY = (tf.y != null ? tf.y : (L.y != null ? L.y : 0));
    const curZ = (tf.z != null ? tf.z : (L.z != null ? L.z : 0));
    const cx = ((p.width || 1080) / 2 + curX).toFixed(6);
    const cy = ((p.height || 1920) / 2 + curY).toFixed(6);
    const cz = curZ.toFixed(6);

    const baseScX = tf.scaleX != null ? tf.scaleX : (tf.scale != null ? tf.scale : (L.scaleX != null ? L.scaleX : (L.scale != null ? L.scale : 100)));
    const baseScY = tf.scaleY != null ? tf.scaleY : (tf.scale != null ? tf.scale : (L.scaleY != null ? L.scaleY : (L.scale != null ? L.scale : 100)));
    const sx = (baseScX / 100).toFixed(6);
    const sy = (baseScY / 100).toFixed(6);

    const rot = (tf.rot != null ? tf.rot : (L.rot || 0)).toFixed(6);
    const op = ((L.opacity != null ? L.opacity : 100) / 100).toFixed(6);

    const out = [];
    out.push('<transform>');

    // Location
    const animX = L.anim && L.anim['x'];
    const animY = L.anim && L.anim['y'];
    if ((animX && animX.length) || (animY && animY.length)) {
      out.push('  <location>');
      const kfMap = new Map();
      if (animX) for (const k of animX) kfMap.set(k.t, k);
      if (animY) for (const k of animY) kfMap.set(k.t, k);
      const sortedTimes = Array.from(kfMap.keys()).sort((a, b) => a - b);
      for (const t of sortedTimes) {
        const kx = (typeof propAt === 'function') ? (p.width / 2 + propAt(L, 'x', t)).toFixed(6) : cx;
        const ky = (typeof propAt === 'function') ? (p.height / 2 + propAt(L, 'y', t)).toFixed(6) : cy;
        const kfRef = kfMap.get(t);
        const easeAttr = AMXML._formatEase(kfRef);
        out.push(`    <kf t="${t.toFixed(6)}" v="${kx},${ky},${cz}"${easeAttr}/>`);
      }
      out.push('  </location>');
    } else {
      out.push(`  <location value="${cx},${cy},${cz}"/>`);
    }

    // Scale
    const animSc = L.anim && L.anim['scale'];
    const animScX = L.anim && L.anim['scaleX'];
    const animScY = L.anim && L.anim['scaleY'];
    if ((animSc && animSc.length) || (animScX && animScX.length) || (animScY && animScY.length)) {
      out.push('  <scale>');
      const kfMap = new Map();
      if (animSc) for (const k of animSc) kfMap.set(k.t, k);
      if (animScX) for (const k of animScX) kfMap.set(k.t, k);
      if (animScY) for (const k of animScY) kfMap.set(k.t, k);
      const sortedTimes = Array.from(kfMap.keys()).sort((a, b) => a - b);
      for (const t of sortedTimes) {
        let kx = baseScX, ky = baseScY;
        if (typeof propAt === 'function') {
          if (animScX) kx = propAt(L, 'scaleX', t);
          else if (animSc) kx = propAt(L, 'scale', t);
          if (animScY) ky = propAt(L, 'scaleY', t);
          else if (animSc) ky = propAt(L, 'scale', t);
        }
        const kfRef = kfMap.get(t);
        const easeAttr = AMXML._formatEase(kfRef);
        out.push(`    <kf t="${t.toFixed(6)}" v="${(kx / 100).toFixed(6)},${(ky / 100).toFixed(6)}"${easeAttr}/>`);
      }
      out.push('  </scale>');
    } else {
      out.push(`  <scale value="${sx},${sy}"/>`);
    }

    // Rotation
    const animRot = L.anim && L.anim['rot'];
    if (animRot && animRot.length) {
      out.push('  <rotation>');
      for (const k of animRot) {
        const r = (k.v || 0).toFixed(6);
        const easeAttr = AMXML._formatEase(k);
        out.push(`    <kf t="${k.t.toFixed(6)}" v="${r}"${easeAttr}/>`);
      }
      out.push('  </rotation>');
    } else {
      out.push(`  <rotation value="${rot}"/>`);
    }

    // Opacity
    const animOp = L.anim && L.anim['opacity'];
    if (animOp && animOp.length) {
      out.push('  <opacity>');
      for (const k of animOp) {
        const o = ((k.v != null ? k.v : 100) / 100).toFixed(6);
        const easeAttr = AMXML._formatEase(k);
        out.push(`    <kf t="${k.t.toFixed(6)}" v="${o}"${easeAttr}/>`);
      }
      out.push('  </opacity>');
    } else {
      out.push(`  <opacity value="${op}"/>`);
    }

    // Pivot / Anchor
    const ax = (tf.ax || 0).toFixed(6);
    const ay = (tf.ay || 0).toFixed(6);
    const animAx = L.anim && L.anim['ax'];
    const animAy = L.anim && L.anim['ay'];
    if ((animAx && animAx.length) || (animAy && animAy.length)) {
      out.push('  <pivot>');
      const kfMap = new Map();
      if (animAx) for (const k of animAx) kfMap.set(k.t, k);
      if (animAy) for (const k of animAy) kfMap.set(k.t, k);
      const sortedTimes = Array.from(kfMap.keys()).sort((a, b) => a - b);
      for (const t of sortedTimes) {
        const kx = (typeof propAt === 'function') ? propAt(L, 'ax', t).toFixed(6) : ax;
        const ky = (typeof propAt === 'function') ? propAt(L, 'ay', t).toFixed(6) : ay;
        const kfRef = kfMap.get(t);
        const easeAttr = AMXML._formatEase(kfRef);
        out.push(`    <kf t="${t.toFixed(6)}" v="${kx},${ky}"${easeAttr}/>`);
      }
      out.push('  </pivot>');
    } else if (tf.ax || tf.ay) {
      out.push(`  <pivot value="${ax},${ay}"/>`);
    }

    // Skew
    const skx = (tf.skewX || 0).toFixed(6);
    const sky = (tf.skewY || 0).toFixed(6);
    const animSkX = L.anim && L.anim['skewX'];
    const animSkY = L.anim && L.anim['skewY'];
    if ((animSkX && animSkX.length) || (animSkY && animSkY.length)) {
      out.push('  <skew>');
      const kfMap = new Map();
      if (animSkX) for (const k of animSkX) kfMap.set(k.t, k);
      if (animSkY) for (const k of animSkY) kfMap.set(k.t, k);
      const sortedTimes = Array.from(kfMap.keys()).sort((a, b) => a - b);
      for (const t of sortedTimes) {
        const kx = (typeof propAt === 'function') ? propAt(L, 'skewX', t).toFixed(6) : skx;
        const ky = (typeof propAt === 'function') ? propAt(L, 'skewY', t).toFixed(6) : sky;
        const kfRef = kfMap.get(t);
        const easeAttr = AMXML._formatEase(kfRef);
        out.push(`    <kf t="${t.toFixed(6)}" v="${kx},${ky}"${easeAttr}/>`);
      }
      out.push('  </skew>');
    } else if (tf.skewX || tf.skewY) {
      out.push(`  <skew value="${skx},${sky}"/>`);
    }

    out.push('</transform>');
    return out.join('\n');
  },

  _exportEffect(eff, L) {
    const def = (typeof FXCatalog !== 'undefined' && FXCatalog.byId) ? FXCatalog.byId[eff.id] : null;
    const effId = eff.id;
    const lines = [];
    const hiddenAttr = eff.enabled === false ? ' hidden="true"' : '';
    lines.push(`<effect id="${AMXML._esc(effId)}" locallyApplied="true"${hiddenAttr}>`);

    const params = eff.params || (def ? def.defaults : {});
    if (params) {
      for (const [pName, val] of Object.entries(params)) {
        // Filter out input textures, intermediate framebuffers, and meta parameters
        if (pName === 'inputImg' || pName === 'comp' || pName === 'xDistBuf' || pName === 'hblur') continue;
        const pDef = def && def.params ? def.params.find(p => p.id === pName) : null;
        if (pDef && (pDef.kind === 'texture' || pDef.tag === 'texture' || pDef.srcType)) continue;

        const kind = pDef ? pDef.kind : (typeof val === 'boolean' ? 'bool' : typeof val === 'number' ? 'float' : 'float');
        const typeStr = AMXML._kindToType(kind);

        const animKey = `fx.${effId}.${pName}`;
        const kfs = (eff.paramAnim && eff.paramAnim[pName]) || (L.anim && L.anim[animKey]);
        if (kfs && kfs.length) {
          lines.push(`  <property name="${AMXML._esc(pName)}" type="${typeStr}">`);
          for (const k of kfs) {
            const easeAttr = AMXML._formatEase(k);
            lines.push(`    <kf t="${k.t.toFixed(6)}" v="${AMXML._formatVal(k.v, kind)}"${easeAttr}/>`);
          }
          lines.push(`  </property>`);
        } else {
          lines.push(`  <property name="${AMXML._esc(pName)}" type="${typeStr}" value="${AMXML._formatVal(val, kind)}"/>`);
        }
      }
    }

    lines.push('</effect>');
    return lines.join('\n');
  },

  _formatEase(kf) {
    if (!kf) return '';
    if (kf.ease === 'custom' && kf.c && kf.c.length === 4) {
      return ` e="cubicBezier ${kf.c[0]} ${kf.c[1]} ${kf.c[2]} ${kf.c[3]}"`;
    }
    if (typeof EASE_PRESETS !== 'undefined' && kf.ease && EASE_PRESETS[kf.ease] && EASE_PRESETS[kf.ease].b) {
      const b = EASE_PRESETS[kf.ease].b;
      return ` e="cubicBezier ${b[0]} ${b[1]} ${b[2]} ${b[3]}"`;
    }
    if (kf.ease === 'hold') return ` e="hold"`;
    return '';
  },

  _kindToType(kind) {
    if (kind === 'switch' || kind === 'bool') return 'bool';
    if (kind === 'point' || kind === 'vec2') return 'vec2';
    if (kind === 'xyz' || kind === 'vec3') return 'xyz';
    if (kind === 'color') return 'color';
    if (kind === 'int' || kind === 'select' || kind === 'selector') return 'int';
    return 'float';
  },

  _formatVal(v, kind) {
    if (kind === 'point' || kind === 'vec2') {
      const p = Array.isArray(v) ? v : [v?.x || 0, v?.y || 0];
      return `${(+p[0] || 0).toFixed(6)},${(+p[1] || 0).toFixed(6)}`;
    }
    if (kind === 'xyz' || kind === 'vec3') {
      const z = Array.isArray(v) ? { x: v[0], y: v[1], z: v[2] } : (typeof v === 'object' ? v : { x: 0, y: 0, z: 0 });
      return `${(+z.x || 0).toFixed(6)},${(+z.y || 0).toFixed(6)},${(+z.z || 0).toFixed(6)}`;
    }
    if (kind === 'color') {
      return AMXML._toAmColor(v?.hex || v || '#ffffffff');
    }
    if (kind === 'switch' || kind === 'bool') {
      return (v === true || v === 'true' || v === 1) ? 'true' : 'false';
    }
    if (kind === 'int' || kind === 'select' || kind === 'selector') {
      return String(Math.round(+v || 0));
    }
    return (+v || 0).toFixed(6);
  },

  _shapeToAm(shape) {
    const map = {
      rect: '.rect',
      ellipse: '.circle',
      roundrect: '.roundedrect',
      star5: '.star',
      heart: '.heart',
      triangle: '.triangle',
      hexagon: '.hexagon',
      line: '.line',
      diamond: '.diamond',
      arrow: '.arrow',
      cross: '.cross',
      spade: '.spade'
    };
    return map[shape] || '.rect';
  },

  _amToShape(s) {
    const map = {
      '.rect': 'rect',
      '.circle': 'ellipse',
      '.ellipse': 'ellipse',
      '.roundedrect': 'roundrect',
      '.star': 'star5',
      '.heart': 'heart',
      '.triangle': 'triangle',
      '.hexagon': 'hexagon',
      '.line': 'line',
      '.diamond': 'diamond',
      '.arrow': 'arrow',
      '.cross': 'cross',
      '.spade': 'spade'
    };
    return map[s] || 'rect';
  },

  _fontToAm(font) {
    if (!font) return 'Roboto-Regular';
    if (font.includes('?') || font.startsWith('@font/')) return font;
    return `imported?name=${font}.ttf`;
  },

  _cleanFontName(raw) {
    if (!raw) return 'Arial';
    let s = String(raw).trim();
    if (s.startsWith('imported?name=')) s = s.slice(14);
    if (s.startsWith('@font/')) s = s.slice(6);
    try { s = decodeURIComponent(s); } catch (_) {}
    return s.trim();
  },

  _toAmColor(hex) {
    let h = String(hex || '#000000').trim();
    if (h.startsWith('#')) h = h.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length === 6) h = 'ff' + h; // prepend full alpha: #AARRGGBB
    if (h.length === 8) {
      // If was #RRGGBBAA, convert to #AARRGGBB
      // By default 8-char in CSS is RRGGBBAA
      // but let's check if it already looks like AARRGGBB
    }
    return '#' + h.toUpperCase();
  },

  _fromAmColor(amHex) {
    if (!amHex) return '#000000';
    let h = String(amHex).trim().replace(/^#/, '');
    if (h.length === 8) {
      // #AARRGGBB -> #RRGGBB
      return '#' + h.slice(2).toLowerCase();
    }
    if (h.length === 6) return '#' + h.toLowerCase();
    if (h.length === 3) return '#' + h.split('').map(c => c + c).join('').toLowerCase();
    return '#000000';
  },

  _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _indent(str, spaces) {
    const pad = ' '.repeat(spaces);
    return str.split('\n').map(l => (l.trim() ? pad + l : l)).join('\n');
  },

  download(project) {
    const xml = AMXML.export(project);
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const filename = (project.name || 'AlightMotion_Project').replace(/\s+/g, '_') + '.xml';
    if (typeof download === 'function') {
      download(filename, url);
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  // ==========================================
  // IMPORT & PARSING
  // ==========================================
  import(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      throw new Error('XML parsing failed: ' + parseError.textContent.slice(0, 100));
    }

    const sceneEl = doc.querySelector('scene') || doc.documentElement;
    const isScene = sceneEl.tagName.toLowerCase() === 'scene';

    const pWidth = Math.round(+sceneEl.getAttribute('width') || +sceneEl.getAttribute('exportWidth') || 1080);
    const pHeight = Math.round(+sceneEl.getAttribute('height') || +sceneEl.getAttribute('exportHeight') || 1920);
    const pFps = Math.round(+sceneEl.getAttribute('fps') || 30);
    const totalTimeMs = +sceneEl.getAttribute('totalTime') || 5000;
    const pDuration = Math.max(0.1, totalTimeMs / 1000);
    const pBg = AMXML._fromAmColor(sceneEl.getAttribute('bgcolor') || '#FF000000');
    const pTitle = sceneEl.getAttribute('title') || 'Imported Alight Project';
    const exportWidth = Math.round(+sceneEl.getAttribute('exportWidth') || pWidth);
    const exportHeight = Math.round(+sceneEl.getAttribute('exportHeight') || pHeight);
    const retime = sceneEl.getAttribute('retime') || 'freeze';
    const precompose = sceneEl.getAttribute('precompose') || 'dynamicResolution';
    const amver = sceneEl.getAttribute('amver') || '';
    const ffver = sceneEl.getAttribute('ffver') || '';
    const am = sceneEl.getAttribute('am') || '';
    const amplatform = sceneEl.getAttribute('amplatform') || '';

    const project = (typeof createProject === 'function')
      ? createProject({ name: pTitle, width: pWidth, height: pHeight, fps: pFps, duration: pDuration, bg: pBg })
      : {
          id: (typeof uid === 'function' ? uid() : 'p_' + Date.now()),
          name: pTitle,
          width: pWidth,
          height: pHeight,
          fps: pFps,
          bg: pBg,
          duration: pDuration,
          layers: [],
          bookmarks: [],
          created: Date.now(),
          updated: Date.now()
        };

    project.name = pTitle;
    project.width = pWidth;
    project.height = pHeight;
    project.fps = pFps;
    project.duration = pDuration;
    project.bg = pBg;
    project.exportWidth = exportWidth;
    project.exportHeight = exportHeight;
    project.retime = retime;
    project.precompose = precompose;
    project.amver = amver;
    project.ffver = ffver;
    project.am = am;
    project.amplatform = amplatform;
    project.bookmarks = [];

    // Bookmarks: store numeric seconds for timeline/transport/ruler compatibility
    const bookmarkNodes = sceneEl.querySelectorAll(':scope > bookmark, scene > bookmark');
    for (const b of bookmarkNodes) {
      const tMs = +b.getAttribute('t') || 0;
      project.bookmarks.push(+(tMs / 1000).toFixed(3));
    }
    project.bookmarks.sort((a, b) => a - b);

    // Parse top-level media catalog
    const mediaMap = {};
    for (const m of doc.querySelectorAll('media, resource')) {
      const id = m.getAttribute('id');
      if (id) {
        mediaMap[id] = {
          id,
          src: m.getAttribute('uri') || m.getAttribute('src') || m.getAttribute('url') || m.getAttribute('filename') || '',
          w: +m.getAttribute('width') || 0,
          h: +m.getAttribute('height') || 0
        };
      }
    }

    // Collect fonts and detect missing
    const missingFonts = AMXML.scanAndDetectMissingFonts(doc);

    // Parse layers (including nested <embedScene> and <scene> groups)
    const layerElements = AMXML._collectLayers(sceneEl, project, null, { w: pWidth, h: pHeight }, mediaMap);

    // Top-to-bottom: reverse AM order
    const reversedLayers = [...layerElements].reverse();
    for (let i = 0; i < reversedLayers.length; i++) {
      project.layers.push(reversedLayers[i]);
    }

    return { project, missingFonts };
  },

  _collectLayers(parentEl, p, groupParentId = null, containerBounds = null, mediaMap = null) {
    const curBounds = containerBounds || { w: p.width, h: p.height };
    const curMedia = mediaMap || {};
    const result = [];
    for (const child of parentEl.children) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'embedscene' || tag === 'scene') {
        const stMs = +child.getAttribute('startTime') || 0;
        const etMs = +child.getAttribute('endTime') || Math.round(p.duration * 1000);
        const grpStart = Math.max(0, stMs / 1000);
        const grpDur = Math.max(0.033, (etMs - stMs) / 1000);
        const grpTitle = child.getAttribute('label') || child.getAttribute('title') || 'Group';
        const grpId = child.getAttribute('id') ? ('grp_' + child.getAttribute('id')) : (typeof uid === 'function' ? uid() : 'grp_' + Math.random().toString(36).slice(2, 8));

        // In AM, an embedScene often contains an inner <scene width="..." height="..."> viewport definition
        const innerScene = child.querySelector(':scope > scene');
        const grpW = innerScene ? (+innerScene.getAttribute('width') || curBounds.w) : (+child.getAttribute('width') || curBounds.w);
        const grpH = innerScene ? (+innerScene.getAttribute('height') || curBounds.h) : (+child.getAttribute('height') || curBounds.h);
        const innerBounds = { w: grpW, h: grpH };

        const memberSource = innerScene || child;
        const subLayers = AMXML._collectLayers(memberSource, p, grpId, innerBounds, curMedia);
        const memberIds = subLayers.map(l => l.id);

        const grpLayer = (typeof createLayer === 'function')
          ? createLayer('group', p, grpStart, { id: grpId, name: grpTitle, duration: grpDur, memberIds })
          : { id: grpId, type: 'group', name: grpTitle, start: grpStart, duration: grpDur, memberIds, effects: [], tf: {}, anim: {} };

        grpLayer.w = grpW;
        grpLayer.h = grpH;
        grpLayer.memberIds = memberIds;

        const tfNode = child.querySelector(':scope > transform');
        if (tfNode) AMXML._parseTransform(tfNode, grpLayer, curBounds);

        // Parse effects directly attached to the embedScene/group (e.g. flip3)
        grpLayer.effects = grpLayer.effects || [];
        const effectNodes = child.querySelectorAll(':scope > effect');
        for (const effNode of effectNodes) {
          const eff = AMXML._parseEffect(effNode, grpLayer);
          if (eff) grpLayer.effects.push(eff);
        }

        result.push(grpLayer);
        result.push(...subLayers);
      } else if (['shape', 'text', 'media', 'image', 'video', 'audio', 'null', 'camera'].includes(tag)) {
        const layer = AMXML._parseLayer(child, p, result.length, curBounds, curMedia);
        if (layer) {
          if (groupParentId) layer.parentId = groupParentId;
          result.push(layer);
        }
      } else if (child.children && child.children.length > 0 && tag !== 'transform' && tag !== 'effect' && tag !== 'property') {
        result.push(...AMXML._collectLayers(child, p, groupParentId, curBounds, curMedia));
      }
    }
    return result;
  },

  _parseLayer(el, p, idx, containerBounds = null, mediaMap = null) {
    const curBounds = containerBounds || { w: p.width, h: p.height };
    const curMedia = mediaMap || {};
    const tag = el.tagName.toLowerCase();
    const stMs = +el.getAttribute('startTime') || 0;
    const etMs = +el.getAttribute('endTime') || Math.round(p.duration * 1000);
    const start = Math.max(0, stMs / 1000);
    const duration = Math.max(0.033, (etMs - stMs) / 1000);
    const speed = +el.getAttribute('speed') || 1;
    const name = el.getAttribute('label') || el.getAttribute('name') || `${tag.charAt(0).toUpperCase() + tag.slice(1)} ${idx + 1}`;

    let type = 'shape';
    if (tag === 'text') type = 'text';
    else if (tag === 'audio') type = 'audio';
    else if (tag === 'media' || tag === 'image' || tag === 'video') type = (tag === 'audio' ? 'audio' : (el.getAttribute('type') === 'video' ? 'video' : 'image'));
    else if (tag === 'shape') {
      const fillType = el.getAttribute('fillType') || '';
      if (fillType === 'media' || el.hasAttribute('fillVideo') || el.hasAttribute('fillImage') || el.hasAttribute('fillMedia') || el.hasAttribute('mediaRef')) {
        const isVid = el.hasAttribute('fillVideo') || (el.getAttribute('src') || '').endsWith('.mp4');
        type = isVid ? 'video' : 'image';
      } else {
        type = 'shape';
      }
    }

    const baseLayer = (typeof createLayer === 'function')
      ? createLayer(type, p, start, { name })
      : {
          id: (typeof uid === 'function' ? uid() : 'l_' + Math.random().toString(36).slice(2, 8)),
          type,
          name,
          start,
          duration,
          visible: true,
          locked: false,
          maskMode: 'none',
          blend: 'normal',
          opacity: 100,
          speed,
          effects: [],
          tf: { x: 0, y: 0, z: 0, scale: 100, scaleX: 100, scaleY: 100, rot: 0, skewX: 0, skewY: 0, ax: 0, ay: 0 },
          anim: {}
        };

    baseLayer.start = start;
    baseLayer.duration = duration;
    baseLayer.speed = speed;

    // Blending & Masking: support blending="mask", blending="exclude", mask="true"
    const blendAttr = (el.getAttribute('blending') || el.getAttribute('blend') || '').trim();
    if (blendAttr === 'mask' || el.getAttribute('mask') === 'true') {
      baseLayer.maskMode = 'mask';
      baseLayer.blend = 'normal';
    } else if (blendAttr === 'exclude' || blendAttr === 'alpha-invert' || blendAttr === 'invertMask') {
      baseLayer.maskMode = 'exclude';
      baseLayer.blend = 'normal';
    } else if (blendAttr) {
      baseLayer.blend = blendAttr;
    }

    // Parse Transform relative to current container bounds
    const tfNode = el.querySelector(':scope > transform') || el.querySelector('transform');
    if (tfNode) {
      AMXML._parseTransform(tfNode, baseLayer, curBounds);
    }

    // Parse specific layer types
    if (type === 'shape') {
      const sAttr = el.getAttribute('s') || '.rect';
      baseLayer.shape = AMXML._amToShape(sAttr);
      baseLayer.w = 200;
      baseLayer.h = 200;

      // Fill color
      const fillColNode = el.querySelector('fillColor');
      const fillHex = fillColNode ? fillColNode.getAttribute('value') : (el.getAttribute('color') || '#FF00C2FF');
      baseLayer.fill = baseLayer.fill || { mode: 'solid', color: '#00c2ff' };
      baseLayer.fill.color = AMXML._fromAmColor(fillHex);

      // Size (AM size property specifies half-extents [-w, -h] to [w, h])
      const sizeProp = el.querySelector(':scope > property[name="size"]') || Array.from(el.querySelectorAll('property[name="size"]')).find(p => p.parentElement === el);
      if (sizeProp && sizeProp.getAttribute('value')) {
        const [w, h] = sizeProp.getAttribute('value').split(',').map(Number);
        if (w) baseLayer.w = Math.round(w * 2);
        if (h) baseLayer.h = Math.round(h * 2);
      } else if (el.hasAttribute('width') && el.hasAttribute('height')) {
        baseLayer.w = Math.round(+el.getAttribute('width'));
        baseLayer.h = Math.round(+el.getAttribute('height'));
      }
    } else if (type === 'text') {
      const contentNode = el.querySelector('content');
      baseLayer.text = contentNode ? contentNode.textContent : (el.getAttribute('text') || 'Text');

      const fontAttr = el.getAttribute('font') || el.getAttribute('fontName') || '';
      baseLayer.font = AMXML._cleanFontName(fontAttr) || 'Arial';

      const szAttr = el.getAttribute('size') || el.getAttribute('fontSize');
      if (szAttr) {
        const rawSz = +szAttr;
        baseLayer.rawAmSize = rawSz;
        // AM text size in points/px
        baseLayer.size = rawSz < 50 ? Math.round(rawSz * 3.5) : Math.round(rawSz);
      }

      const fillColNode = el.querySelector('fillColor');
      const fontCol = fillColNode ? fillColNode.getAttribute('value') : (el.getAttribute('fontColor') || '#FFFFFFFF');
      baseLayer.color = AMXML._fromAmColor(fontCol);
      baseLayer.align = el.getAttribute('align') || 'center';
      baseLayer.wrapWidth = +el.getAttribute('wrapWidth') || curBounds.w;
    } else if (type === 'image' || type === 'video') {
      let uri = el.getAttribute('fillVideo') || el.getAttribute('fillImage') || el.getAttribute('fillMedia') || el.getAttribute('mediaRef') || el.getAttribute('uri') || el.getAttribute('src') || el.getAttribute('url') || '';
      if (curMedia[uri]) {
        const mInfo = curMedia[uri];
        uri = mInfo.src || uri;
        if (mInfo.w) baseLayer.w = mInfo.w;
        if (mInfo.h) baseLayer.h = mInfo.h;
      }
      baseLayer.src = uri;
      const sizeProp = el.querySelector(':scope > property[name="size"]') || Array.from(el.querySelectorAll('property[name="size"]')).find(p => p.parentElement === el);
      if (sizeProp && sizeProp.getAttribute('value')) {
        const [w, h] = sizeProp.getAttribute('value').split(',').map(Number);
        if (w) baseLayer.w = Math.round(w * 2);
        if (h) baseLayer.h = Math.round(h * 2);
      } else if (!baseLayer.w) {
        baseLayer.w = curBounds.w;
        baseLayer.h = curBounds.h;
      }
    } else if (type === 'audio') {
      baseLayer.src = el.getAttribute('src') || el.getAttribute('uri') || '';
      const volAttr = el.getAttribute('volume');
      if (volAttr) baseLayer.volume = Math.round((+volAttr) * 100);
    }

    // Parse Effects
    const effectNodes = el.querySelectorAll(':scope > effect');
    for (const effNode of effectNodes) {
      const eff = AMXML._parseEffect(effNode, baseLayer);
      if (eff) baseLayer.effects.push(eff);
    }

    return baseLayer;
  },

  _parseTransform(tfNode, layer, containerBounds = null) {
    const cb = containerBounds || { w: 1080, h: 1920 };

    // 1) Location
    const locNode = tfNode.querySelector(':scope > location') || tfNode.querySelector('location');
    if (locNode) {
      const val = locNode.getAttribute('value');
      if (val) {
        const [x, y, z] = val.split(',').map(Number);
        layer.tf.x = (x || 0) - cb.w / 2;
        layer.tf.y = (y || 0) - cb.h / 2;
        layer.tf.z = z || 0;
      }
      const kfs = locNode.querySelectorAll('kf');
      if (kfs.length) {
        const animX = [], animY = [];
        for (const kf of kfs) {
          const t = +kf.getAttribute('t') || 0;
          const [kx, ky] = (kf.getAttribute('v') || '0,0').split(',').map(Number);
          const { ease, c } = AMXML._parseEaseAttr(kf.getAttribute('e'));
          animX.push({ t, v: (kx || 0) - cb.w / 2, ease, c });
          animY.push({ t, v: (ky || 0) - cb.h / 2, ease, c });
        }
        for (let i = 1; i < animX.length; i++) {
          if (animX[i].ease === 'custom' && animX[i].c && (!animX[i - 1].c || animX[i - 1].ease === 'linear')) {
            animX[i - 1].ease = animX[i].ease;
            animX[i - 1].c = [...animX[i].c];
            animY[i - 1].ease = animY[i].ease;
            animY[i - 1].c = [...animY[i].c];
          }
        }
        layer.anim['x'] = animX;
        layer.anim['y'] = animY;
        layer.tf.x = animX[0].v;
        layer.tf.y = animY[0].v;
      }
    }

    // 2) Scale (supports 1D or 2D non-uniform scale)
    const scNode = tfNode.querySelector(':scope > scale') || tfNode.querySelector('scale');
    if (scNode) {
      const val = scNode.getAttribute('value');
      if (val) {
        const parts = val.split(',').map(Number);
        if (parts.length >= 2) {
          layer.tf.scaleX = (+parts[0] || 1) * 100;
          layer.tf.scaleY = (+parts[1] || 1) * 100;
          layer.tf.scale = 100;
        } else {
          layer.tf.scale = (+parts[0] || 1) * 100;
          layer.tf.scaleX = 100;
          layer.tf.scaleY = 100;
        }
      }
      const kfs = scNode.querySelectorAll('kf');
      if (kfs.length) {
        const animSc = [], animScX = [], animScY = [];
        let has2D = false;
        for (const kf of kfs) {
          const t = +kf.getAttribute('t') || 0;
          const parts = (kf.getAttribute('v') || '1').split(',').map(Number);
          const { ease, c } = AMXML._parseEaseAttr(kf.getAttribute('e'));
          if (parts.length >= 2) {
            has2D = true;
            animScX.push({ t, v: (+parts[0] || 1) * 100, ease, c });
            animScY.push({ t, v: (+parts[1] || 1) * 100, ease, c });
          }
          animSc.push({ t, v: (+parts[0] || 1) * 100, ease, c });
        }
        for (let i = 1; i < animSc.length; i++) {
          if (animSc[i].ease === 'custom' && animSc[i].c && (!animSc[i - 1].c || animSc[i - 1].ease === 'linear')) {
            animSc[i - 1].ease = animSc[i].ease;
            animSc[i - 1].c = [...animSc[i].c];
          }
        }
        if (has2D) {
          for (let i = 1; i < animScX.length; i++) {
            if (animScX[i].ease === 'custom' && animScX[i].c && (!animScX[i - 1].c || animScX[i - 1].ease === 'linear')) {
              animScX[i - 1].ease = animScX[i].ease; animScX[i - 1].c = [...animScX[i].c];
              animScY[i - 1].ease = animScY[i].ease; animScY[i - 1].c = [...animScY[i].c];
            }
          }
          layer.anim['scaleX'] = animScX;
          layer.anim['scaleY'] = animScY;
          layer.tf.scaleX = animScX[0].v;
          layer.tf.scaleY = animScY[0].v;
        }
        layer.anim['scale'] = animSc;
        layer.tf.scale = animSc[0].v;
      }
    }

    // 3) Rotation
    const rotNode = tfNode.querySelector(':scope > rotation') || tfNode.querySelector('rotation');
    if (rotNode) {
      const val = rotNode.getAttribute('value');
      if (val) layer.tf.rot = +val || 0;
      const kfs = rotNode.querySelectorAll('kf');
      if (kfs.length) {
        const animRot = [];
        for (const kf of kfs) {
          const t = +kf.getAttribute('t') || 0;
          const rv = +kf.getAttribute('v') || 0;
          const { ease, c } = AMXML._parseEaseAttr(kf.getAttribute('e'));
          animRot.push({ t, v: rv, ease, c });
        }
        for (let i = 1; i < animRot.length; i++) {
          if (animRot[i].ease === 'custom' && animRot[i].c && (!animRot[i - 1].c || animRot[i - 1].ease === 'linear')) {
            animRot[i - 1].ease = animRot[i].ease;
            animRot[i - 1].c = [...animRot[i].c];
          }
        }
        layer.anim['rot'] = animRot;
        layer.tf.rot = animRot[0].v;
      }
    }

    // 4) Opacity
    const opNode = tfNode.querySelector(':scope > opacity') || tfNode.querySelector('opacity');
    if (opNode) {
      const val = opNode.getAttribute('value');
      if (val) {
        const v = +val;
        layer.opacity = (v <= 1.0 ? v * 100 : v);
      }
      const kfs = opNode.querySelectorAll('kf');
      if (kfs.length) {
        const animOp = [];
        for (const kf of kfs) {
          const t = +kf.getAttribute('t') || 0;
          const ov = +kf.getAttribute('v') || 0;
          const { ease, c } = AMXML._parseEaseAttr(kf.getAttribute('e'));
          animOp.push({ t, v: (ov <= 1.0 ? ov * 100 : ov), ease, c });
        }
        for (let i = 1; i < animOp.length; i++) {
          if (animOp[i].ease === 'custom' && animOp[i].c && (!animOp[i - 1].c || animOp[i - 1].ease === 'linear')) {
            animOp[i - 1].ease = animOp[i].ease;
            animOp[i - 1].c = [...animOp[i].c];
          }
        }
        layer.anim['opacity'] = animOp;
        layer.opacity = animOp[0].v;
      }
    }

    // 5) Pivot / Anchor
    const pivotNode = tfNode.querySelector(':scope > pivot') || tfNode.querySelector('pivot');
    if (pivotNode) {
      const val = pivotNode.getAttribute('value');
      if (val) {
        const [px, py] = val.split(',').map(Number);
        layer.tf.ax = px || 0;
        layer.tf.ay = py || 0;
      }
      const kfs = pivotNode.querySelectorAll('kf');
      if (kfs.length) {
        const animAx = [], animAy = [];
        for (const kf of kfs) {
          const t = +kf.getAttribute('t') || 0;
          const [kx, ky] = (kf.getAttribute('v') || '0,0').split(',').map(Number);
          const { ease, c } = AMXML._parseEaseAttr(kf.getAttribute('e'));
          animAx.push({ t, v: kx || 0, ease, c });
          animAy.push({ t, v: ky || 0, ease, c });
        }
        layer.anim['ax'] = animAx;
        layer.anim['ay'] = animAy;
        layer.tf.ax = animAx[0].v;
        layer.tf.ay = animAy[0].v;
      }
    }

    // 6) Skew
    const skewNode = tfNode.querySelector(':scope > skew') || tfNode.querySelector('skew');
    if (skewNode) {
      const val = skewNode.getAttribute('value');
      if (val) {
        const parts = val.split(',').map(Number);
        layer.tf.skewX = parts[0] || 0;
        layer.tf.skewY = parts[1] || 0;
      }
      const kfs = skewNode.querySelectorAll('kf');
      if (kfs.length) {
        const animSkX = [], animSkY = [];
        for (const kf of kfs) {
          const t = +kf.getAttribute('t') || 0;
          const parts = (kf.getAttribute('v') || '0,0').split(',').map(Number);
          const { ease, c } = AMXML._parseEaseAttr(kf.getAttribute('e'));
          animSkX.push({ t, v: parts[0] || 0, ease, c });
          animSkY.push({ t, v: parts[1] || 0, ease, c });
        }
        layer.anim['skewX'] = animSkX;
        layer.anim['skewY'] = animSkY;
        layer.tf.skewX = animSkX[0].v;
        layer.tf.skewY = animSkY[0].v;
      }
    }
  },

  _parseEffect(effNode, layer) {
    const rawId = effNode.getAttribute('id') || '';
    if (!rawId) return null;

    // Resolve effect ID against catalog
    let effId = rawId;
    if (typeof FXCatalog !== 'undefined' && FXCatalog.byId) {
      if (!FXCatalog.byId[effId]) {
        // Try with prefix or without prefix
        const withPrefix = rawId.startsWith('com.alightcreative.effects.') ? rawId : ('com.alightcreative.effects.' + rawId);
        const withoutPrefix = rawId.replace(/^com\.alightcreative\.effects\./, '');
        if (FXCatalog.byId[withPrefix]) effId = withPrefix;
        else if (FXCatalog.byId[withoutPrefix]) effId = withoutPrefix;
      }
    }

    const def = (typeof FXCatalog !== 'undefined' && FXCatalog.byId) ? FXCatalog.byId[effId] : null;
    const isHidden = effNode.getAttribute('hidden') === 'true';
    const effObj = {
      id: effId,
      enabled: !isHidden,
      params: (def && def.defaults) ? { ...def.defaults } : {},
      paramAnim: {}
    };

    const propNodes = effNode.querySelectorAll('property');
    for (const pNode of propNodes) {
      const pName = pNode.getAttribute('name');
      const pType = pNode.getAttribute('type') || 'float';
      if (!pName) continue;

      const kfs = pNode.querySelectorAll('kf');
      if (kfs.length) {
        const animKey = `fx.${effId}.${pName}`;
        const parsedKfs = [];
        for (const kf of kfs) {
          const t = +kf.getAttribute('t') || 0;
          const v = AMXML._parseTypedVal(kf.getAttribute('v'), pType);
          const { ease, c } = AMXML._parseEaseAttr(kf.getAttribute('e'));
          parsedKfs.push({ t, v, ease, c });
        }
        // Transfer incoming easing curve from kfs[i] to kfs[i-1] so both endpoints carry the curve
        for (let i = 1; i < parsedKfs.length; i++) {
          if (parsedKfs[i].ease === 'custom' && parsedKfs[i].c && (!parsedKfs[i - 1].c || parsedKfs[i - 1].ease === 'linear')) {
            parsedKfs[i - 1].ease = parsedKfs[i].ease;
            parsedKfs[i - 1].c = [...parsedKfs[i].c];
          }
        }
        effObj.paramAnim[pName] = parsedKfs;
        layer.anim[animKey] = parsedKfs;
        effObj.params[pName] = parsedKfs[0].v;
      } else if (pNode.hasAttribute('value')) {
        effObj.params[pName] = AMXML._parseTypedVal(pNode.getAttribute('value'), pType);
      }
    }

    return effObj;
  },

  _parseTypedVal(valStr, type) {
    if (valStr == null) return 0;
    const s = String(valStr).trim();
    if (type === 'bool' || type === 'switch') {
      return s === 'true' || s === '1';
    }
    if (type === 'int') {
      return parseInt(s, 10) || 0;
    }
    if (type === 'color') {
      return AMXML._fromAmColor(s);
    }
    if (type === 'vec2' || type === 'point') {
      const parts = s.split(',').map(Number);
      return [parts[0] || 0, parts[1] || 0];
    }
    if (type === 'xyz' || type === 'vec3') {
      const parts = s.split(',').map(Number);
      return { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
    }
    return parseFloat(s) || 0;
  },

  _parseEaseAttr(eStr) {
    if (!eStr) return { ease: 'linear', c: null };
    const s = eStr.trim();
    if (s.startsWith('cubicBezier')) {
      const parts = s.replace(/^cubicBezier\s*/, '').trim().split(/\s+/).map(Number);
      if (parts.length === 4 && !parts.some(isNaN)) {
        return { ease: 'custom', c: parts };
      }
    }
    if (s === 'hold') return { ease: 'hold', c: null };
    return { ease: 'linear', c: null };
  },

  // ==========================================
  // MISSING FONTS DETECTION
  // ==========================================
  scanAndDetectMissingFonts(doc) {
    const fontNames = new Set();
    const textNodes = doc.querySelectorAll('text');
    for (const t of textNodes) {
      const f = t.getAttribute('font') || t.getAttribute('fontName') || t.getAttribute('fontFamily');
      if (f) fontNames.add(f);
    }

    const missing = [];
    for (const rawFont of fontNames) {
      const clean = AMXML._cleanFontName(rawFont);
      if (!clean) continue;
      if (!AMXML.isFontAvailable(clean)) {
        missing.push({
          raw: rawFont,
          name: clean,
          display: clean.replace(/\.(ttf|otf|woff2?)$/i, '')
        });
      }
    }
    return missing;
  },

  isFontAvailable(fontName) {
    if (!fontName) return true;
    const clean = fontName.replace(/\.(ttf|otf|woff2?)$/i, '').trim();
    if (!clean) return true;

    // Standard universally available web fonts
    const safeFonts = new Set([
      'arial', 'helvetica', 'sans-serif', 'serif', 'monospace', 'times new roman',
      'times', 'georgia', 'courier new', 'courier', 'verdana', 'tahoma',
      'trebuchet ms', 'impact', 'comic sans ms', 'segoe ui', 'roboto', 'system-ui',
      'calibri', 'garamond', 'consolas', 'lucida console', 'apple-system', 'blinkmacsystemfont'
    ]);
    if (safeFonts.has(clean.toLowerCase())) return true;

    // Browser Font Loading API check
    try {
      if (typeof document !== 'undefined' && document.fonts && document.fonts.check) {
        if (document.fonts.check(`16px "${clean}"`)) {
          // Double verify against canvas fallback
          return AMXML._checkWithCanvas(clean);
        }
      }
    } catch (_) {}

    return AMXML._checkWithCanvas(clean);
  },

  _checkWithCanvas(cleanFamily) {
    if (typeof document === 'undefined') return true;
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return true;

      const testStr = 'mmmmmmmmmmlli!@#$%^&*~WM0O';
      const baseFonts = ['monospace', 'sans-serif', 'serif'];

      let hasDiff = false;
      for (const base of baseFonts) {
        ctx.font = `72px ${base}`;
        const baseWidth = ctx.measureText(testStr).width;

        ctx.font = `72px "${cleanFamily}", ${base}`;
        const testWidth = ctx.measureText(testStr).width;

        if (Math.abs(testWidth - baseWidth) > 0.5) {
          hasDiff = true;
          break;
        }
      }
      return hasDiff;
    } catch (_) {
      return true;
    }
  },

  // ==========================================
  // MISSING FONTS UI DIALOG
  // ==========================================
  showMissingFontsDialog(missingFonts, onOk) {
    if (!missingFonts || !missingFonts.length) {
      if (typeof onOk === 'function') onOk();
      return;
    }

    const modal = document.getElementById('m-missing-fonts');
    const listEl = document.getElementById('mf-list');
    const okBtn = document.getElementById('btn-missing-fonts-ok');

    if (!modal || !listEl) {
      const names = missingFonts.map(f => f.name || f).join(', ');
      alert(`Missing Fonts detected:\n${names}\n\nDefault fonts will be used.`);
      if (typeof onOk === 'function') onOk();
      return;
    }

    listEl.innerHTML = '';
    for (const f of missingFonts) {
      const item = document.createElement('div');
      item.className = 'mf-item';
      item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:var(--bg2,#161b22);border-radius:6px;font-size:13px;';
      item.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;overflow:hidden">
          <svg viewBox="0 0 24 24" width="16" height="16" style="color:var(--accent,#00e887);flex-shrink:0"><path d="M5 4v3h5v12h3V7h5V4H5z" fill="currentColor"/></svg>
          <span style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${AMXML._esc(f.name)}">${AMXML._esc(f.name)}</span>
        </div>
        <span style="font-size:11px;padding:2px 6px;background:rgba(245,158,11,0.15);color:#f59e0b;border-radius:4px;font-weight:600">Missing</span>
      `;
      listEl.appendChild(item);
    }

    const closeHandler = () => {
      if (typeof Modals !== 'undefined' && Modals.close) {
        Modals.close('m-missing-fonts');
      } else {
        modal.hidden = true;
      }
      okBtn.removeEventListener('click', closeHandler);
      if (typeof onOk === 'function') onOk();
    };

    okBtn.addEventListener('click', closeHandler);

    if (typeof Modals !== 'undefined' && Modals.open) {
      Modals.open('m-missing-fonts');
    } else {
      modal.hidden = false;
    }
  }
};

// Backwards compatibility aliases
const AMXMLExport = AMXML;
const AMXMLImport = AMXML;

if (typeof window !== 'undefined') {
  window.AMXML = AMXML;
  window.AMXMLExport = AMXML;
  window.AMXMLImport = AMXML;
}
if (typeof module !== 'undefined') {
  module.exports = AMXML;
}
