// effects-catalog.js — parses effects/AlightMotionEffects.xml into FXCatalog
// def shape: { id, name, desc, category, tags, deprecated, experimental, internal, autoTransform,
//   compatY, overdraw, maxOverdraw, params[], textures{}, shaders{group:[{kind,src}]}, passes[],
//   iterationsParam, script, groups:[groupIds] }

const FXCatalog = {
  ready: false,
  lastError: '',
  defs: [],
  byId: {},

  // Curated, editor-facing categories.  XML categories describe implementation;
  // these names describe the primary effects people expect to find.
  PRIMARY_CATEGORIES: [
    ['color-light', 'Color & Light', ['exposure', 'gamma', 'bright', 'contrast', 'satur', 'vibrance', 'hue', 'color', 'rgb', 'invert', 'threshold', 'poster', 'highlight', 'shadow', 'rays', 'glow', 'channel']],
    ['distort', 'Distort', ['tile', 'wave', 'displace', 'pinch', 'bulge', 'bend', 'swirl', 'ripple', 'turbul', 'polar', 'hexagon', 'glass', 'mirror', 'stretch']],
    ['blur', 'Blur & Sharpen', ['blur', 'unsharp', 'sharpen']],
    ['motion', 'Motion', ['oscillat', 'shake', 'swing', 'pulse', 'spin', 'jitter', 'wiggle']],
    ['drawing', 'Drawing', ['findedge', 'contour', 'feather', 'roughen', 'wipe', 'stroke']],
    ['procedural', 'Procedural', ['grid', 'checker', 'stripe', 'dot', 'noise', 'fractal', 'starfield', 'cloud', 'ridge', 'voronoi']],
    ['3d', '3D', []],
    ['repeat', 'Repeat', ['repeat', 'kaleido', 'scatter']],
    ['matte', 'Matte & Key', ['chroma', 'luma', 'colorkey', 'screenwipe', 'cutout', 'matte']],
    ['opacity', 'Opacity', ['fade', 'blink', 'dissolve', 'opacity']],
    ['text', 'Text', ['text', 'counter', 'countup', 'countdown', 'spacing']],
    ['utility', 'Utility', ['copybackground', 'parent', 'posterizetime']]
  ],

  WORDS: ['box', 'blur', 'glow', 'warp', 'edge', 'fade', 'pulse', 'oscillate', 'shake', 'spin',
    'swing', 'jitter', 'chroma', 'key', 'beat', 'wave', 'zoom', 'pan', 'stretch', 'wave3d'],

  displayName(def) {
    const raw = def.rawName || '';
    if (raw && raw[0] !== '@') return raw;
    // '@am:string/effect_360reorientsphere_name' → derive from id tail
    let tail = def.id.split('.').pop();
    tail = tail.replace(/[Nn]ame$/, '').replace(/^[Nn]ame$/, '');
    tail = tail.replace(/\d+$/, m => ' ' + m + ' ');
    // camel split
    tail = tail.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    // known word boundaries
    for (const w of FXCatalog.WORDS) {
      tail = tail.replace(new RegExp('([a-z0-9])' +'(?=' + w + '(\\b|$|[ ]))', 'gi'), '$1 ');
    }
    const words = tail.split(/[\s\-_]+/).filter(Boolean);
    let out = words.map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    return out.replace(/\s+/g, ' ').trim();
  },

  displayLabel(labelToken, fallback) {
    if (!labelToken || labelToken[0] === '@') {
      // '@am:string/effect_param_angle' → 'Angle'
      let tail = String(labelToken || fallback || '').split('/').pop();
      tail = tail.replace(/^effect_param_/, '').replace(/^param_/, '');
      return (tail[0] || 'P').toUpperCase() + tail.slice(1).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    }
    return labelToken;
  },

  paramDefault(p) {
    switch (p.kind) {
      case 'spinner': case 'slider': case 'selector': case 'float':
        return p.def != null && !isNaN(parseFloat(p.def)) ? parseFloat(p.def) : (p.min != null ? p.min : 0);
      case 'switch': return p.def === 'true' || p.def === true;
      case 'xyz': {
        const parts = String(p.def || '').split(',').map(s => parseFloat(s.trim()));
        return { x: isFinite(parts[0]) ? parts[0] : 0, y: isFinite(parts[1]) ? parts[1] : 0, z: isFinite(parts[2]) ? parts[2] : 0 };
      }
      case 'point': {
        if (p.def != null && String(p.def).trim() !== '') {
          const parts = String(p.def).split(',').map(Number);
          return [parts[0] || 0, parts[1] || 0];
        }
        return [0, 0];
      }
      case 'color': {
        const raw = String(p.def || '#ffffffff').trim();
        if (/^#[\da-f]{8}$/i.test(raw)) return { hex: '#' + raw.slice(3, 9).toLowerCase(), a: parseInt(raw.slice(1, 3), 16) / 255 };
        if (/^#[\da-f]{3}$/i.test(raw)) return { hex: '#' + raw.slice(1).split('').map(c => c + c).join(''), a: 1 };
        return { hex: /^#[\da-f]{6}$/i.test(raw) ? raw.toLowerCase() : '#ffffff', a: 1 };
      }
      case 'orient': {
        const parts = String(p.def || '0,0,0').split(',').map(v => parseFloat(v.trim()));
        return { roll: isFinite(parts[0]) ? parts[0] : 0, pitch: isFinite(parts[1]) ? parts[1] : 0, yaw: isFinite(parts[2]) ? parts[2] : 0 };
      }
      default: return 0;
    }
  },

  async load() {
    if (FXCatalog.ready) return true;
    FXCatalog.lastError = '';
    if (typeof window !== 'undefined' && window.AM_EFFECTS_XML) {
      try {
        FXCatalog._ingest(window.AM_EFFECTS_XML);
        return true;
      } catch (e) {
        FXCatalog.lastError = 'embedded catalog failed: ' + (e && e.message ? e.message : e);
        console.warn('FXCatalog embedded parse error:', e);
      }
    }
    try {
      const res = await fetch('effects/AlightMotionEffects.xml', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      FXCatalog._ingest(text);
      return FXCatalog.ready;
    } catch (e) {
      FXCatalog.lastError = 'effects/AlightMotionEffects.xml: ' + (e && e.message ? e.message : e);
      console.warn('FXCatalog load error:', e);
      return false;
    }
  },

  _ingest(text) {
    // the catalog concatenates individual effect documents, each with its own <?xml?> prolog —
    // split on prologs and parse every chunk independently
    const parts = ('<?xml' + text).split(/<\?xml[^>]*\?>/).filter(p => p.trim());
    const roots = parts.map(p => new DOMParser().parseFromString(p, 'text/xml'));
    const nodes = [];
    for (const d of roots) {
      for (const n of d.getElementsByTagName('effect')) nodes.push(n);
    }
    const out = [], byId = {};
    for (const node of nodes) {
      let d;
      try { d = FXCatalog._parseEffect(node); } catch (e) { console.warn('fx parse fail', node.getAttribute && node.getAttribute('id'), e); continue; }
      if (!d || !d.id) continue;
      d.name = FXCatalog.displayName(d);
      byId[d.id] = d;
      out.push(d);
    }
    FXCatalog.defs = out;
    FXCatalog.byId = byId;
    // Retain older revisions for existing projects, but show only the newest
    // revision in the add-effects browser (tileRotate → tileRotate2, etc.).
    const revisions = new Map();
    for (const def of out) {
      const leaf = def.id.split('.').pop();
      const m = leaf.match(/^(.*?)(\d+)$/);
      const base = m ? m[1] : leaf;
      if (!revisions.has(base)) revisions.set(base, []);
      revisions.get(base).push({ def, revision: m ? +m[2] : 1 });
    }
    for (const list of revisions.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => b.revision - a.revision);
      const latest = list[0].def;
      for (let i = 1; i < list.length; i++) list[i].def.supersededBy = latest.id;
      if (/\s+\d+$/.test(latest.name)) latest.browserName = list[list.length - 1].def.name.replace(/\s+\d+$/, '');
    }
    if (!out.length) { FXCatalog.lastError = 'catalog parsed but contained no effect definitions'; return; }
    FXCatalog.ready = true;
    FXCatalog.lastError = '';
  },

  _parseEffect(node) {
    const attr = k => node.getAttribute(k);
    const def = {
      id: attr('id') || '',
      rawName: attr('name') || '',
      descRaw: attr('desc') || '',
      category: attr('category') || (attr('type') === 'text' ? 'text' : 'other'),
      tags: attr('tags') ? attr('tags').split(',').map(s => s.trim()).filter(Boolean) : [],
      deprecated: attr('deprecated') === 'true',
      experimental: attr('experimental') === 'true',
      internal: attr('internal') === 'true',
      autoTransform: attr('auto-transform') === 'true',
      afxver: parseInt(attr('afxver') || '1', 10) || 1,
      compat: attr('compat') || '',
      compatY: (attr('compat') || '').includes('acScreenNorm-y'),
      overdraw: attr('overdraw') === 'true',
      maxOverdraw: parseFloat(attr('maxOverdraw') || '0.1') || 0.1
    };
    if (!def.id) return null;

    // ---- params ----
    const params = [];
    const textures = {};
    const textureMeta = {};
    let script = null;
    const shaders = {}; // group → {fragment:[], vertex:[]}
    const passes = [];
    let iterationsParam = null;
    let defaultGroup = null;

    for (const child of node.children) {
      const k = child.tagName;
      if (k === 'params') {
        FXCatalog._parseParams(child, params, textures, textureMeta);
      } else if (k === 'script' && (child.getAttribute('lang') === 'js' || !child.getAttribute('lang'))) {
        script = child.textContent || '';
      } else if (k === 'shader') {
        const kind = child.getAttribute('type') || 'fragment';
        const group = child.getAttribute('group') != null ? parseInt(child.getAttribute('group')) : null;
        const src = child.textContent || '';
        shaders._all = shaders._all || [];
        shaders._all.push({ kind, group, src });
      } else if (k === 'passes') {
        for (const p of child.children) {
          if (p.tagName !== 'pass') continue;
          passes.push({
            target: p.getAttribute('target') || null,
            src: p.getAttribute('src') || null,
            blend: p.getAttribute('blend') || 'overwrite',
            shaderGroup: p.getAttribute('shader') != null ? parseInt(p.getAttribute('shader')) : null,
            effect: p.getAttribute('effect') || null
          });
        }
      } else if (k === 'iterations') {
        iterationsParam = child.getAttribute('param') || 'iter';
      }
    }

    // bucket shaders into groups; group undefined → treat as group 0
    let maxGroup = 0;
    for (const s of (shaders._all || [])) {
      const g = s.group == null ? 0 : s.group;
      maxGroup = Math.max(maxGroup, g);
      (shaders[g] = shaders[g] || { fragment: [], vertex: [] })[s.kind].push(s.src);
    }
    delete shaders._all;
    const groups = Object.keys(shaders).map(Number).sort((a, b) => a - b);
    if (!groups.length) maxGroup = -1;
    def.shaders = shaders;
    def.groups = groups;
    def.defaultGroup = groups.includes(0) ? 0 : (groups[0] != null ? groups[0] : null);
    def.passes = passes;
    def.script = script;
    def.hasScript = !!script && /function\s+animate/.test(script);
    def.iterationsParam = iterationsParam;
    def.needsComp = Object.values(textures).some(v => v === 'comp');
    def.needsOverdraw = def.overdraw;
    def.params = params;
    def.textures = textures;
    def.textureMeta = textureMeta;
    def.defaults = {};
    for (const p of params) if (p.kind !== 'section' && p.kind !== 'tip') def.defaults[p.id] = FXCatalog.paramDefault(p);
    def.hasGL = Object.keys(shaders).length > 0;
    return def;
  },

  _parseParams(parent, params, textures, textureMeta = {}) {
    for (const el of parent.children) {
      const k = el.tagName, a = el.getAttribute.bind(el);
      switch (k) {
        case 'texture': {
          const id = a('id');
          if (id) {
            const srcType = a('srcType') || 'content';
            textures[id] = srcType;
            textureMeta[id] = { id, srcType, src: a('src') || '', downsample: Math.max(1, parseInt(a('downsample') || '1', 10) || 1), filter: a('filter') || (/(dist|distance)/i.test(id) ? 'nearest' : 'linear') };
          }
          break;
        }
        case 'spinner': case 'slider': case 'float': case 'hue-disc': {
          // hue-disc is a 3-component h/s/v param (sometimes written as <spinner bias=true default="60,1,0">)
          const dd = k === 'float' && a('value') != null ? a('value') : (a('default') != null ? a('default') : a('deafult'));
          if (k === 'hue-disc' || String(dd || '').includes(',')) {
            params.push({ kind: 'xyz', id: a('id'), label: FXCatalog.displayLabel(a('label'), a('id')), def: dd, type: 'hsv' });
            break;
          }
          params.push({ kind: k, id: a('id'), label: FXCatalog.displayLabel(a('label'), a('id')), def: dd, min: parseFloat(a('min') ?? (k === 'float' ? '-10000' : '0')), max: parseFloat(a('max') ?? (k === 'float' ? '10000' : '100')), step: parseFloat(a('step') || '0.01'), type: a('type') || '', ticks: a('ticks') || '' });
          break;
        }
        case 'selector': {
          const p = { kind: 'selector', id: a('id'), label: FXCatalog.displayLabel(a('label'), a('id')), def: a('default'), style: a('style') || 'radio', choices: [] };
          for (const c of el.children) if (c.tagName === 'choice') p.choices.push({ label: FXCatalog.displayLabel(c.getAttribute('label'), 'Option'), value: c.getAttribute('value') });
          params.push(p);
          break;
        }
        case 'switch':
          params.push({ kind: 'switch', id: a('id'), label: FXCatalog.displayLabel(a('label'), a('id')), def: a('default') });
          break;
        case 'point':
          params.push({ kind: 'point', id: a('id'), label: FXCatalog.displayLabel(a('label'), a('id')), def: a('default'), min: a('min') || '0,0', max: a('max') || '1,1' });
          break;
        case 'xyz':
          params.push({ kind: 'xyz', id: a('id'), label: FXCatalog.displayLabel(a('label'), a('id')), def: a('default'), type: a('type') || 'rotate', applyTo: a('applyto') || '' });
          break;
        case 'orient':
          params.push({ kind: 'orient', id: a('id'), label: FXCatalog.displayLabel(a('label'), a('id')), def: a('default'), invert: a('invert') === 'true' });
          break;
        case 'color':
          params.push({ kind: 'color', id: a('id'), label: FXCatalog.displayLabel(a('label'), a('id')), def: a('default') || '#ffffffff', alpha: a('alpha') !== 'false' });
          break;
        case 'section':
          params.push({ kind: 'section', label: FXCatalog.displayLabel(a('text'), a('text')) });
          break;
        case 'tip':
          params.push({ kind: 'tip', label: a('text') || '' });
          break;
      }
    }
  },

  browserList(showLegacy) {
    return FXCatalog.defs.filter(d => {
      if (d.supersededBy) return false;
      if (d.internal && d.defaultGroup != null) return showLegacy; // blend mode internals stay hidden in add-list
      if (d.deprecated || d.experimental) return !!showLegacy;
      return true;
    });
  },

  primaryCategory(def) {
    if (!def) return null;
    if (def.category === '3d') return '3d';
    const haystack = `${def.id} ${def.name} ${(def.tags || []).join(' ')}`.toLowerCase();
    for (const [id, , tokens] of FXCatalog.PRIMARY_CATEGORIES) {
      if (tokens.some(token => haystack.includes(token))) return id;
    }
    return null;
  },

  primaryList(showLegacy, category = null) {
    return FXCatalog.browserList(showLegacy).filter(def => {
      const primary = FXCatalog.primaryCategory(def);
      return category ? primary === category : !!primary;
    });
  },

  primaryCategories(showLegacy) {
    return FXCatalog.PRIMARY_CATEGORIES.map(([id, label]) => ({
      id, label, count: FXCatalog.primaryList(showLegacy, id).length
    }));
  },

  categories() {
    const set = new Map();
    for (const d of FXCatalog.defs) {
      if (d.deprecated || d.experimental || (d.internal && d.defaultGroup != null)) continue;
      set.set(d.category, (set.get(d.category) || 0) + 1);
    }
    return [...set.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }
};

if (typeof window !== 'undefined' && window.AM_EFFECTS_XML) {
  try { FXCatalog._ingest(window.AM_EFFECTS_XML); } catch (e) { console.warn('FXCatalog sync load failed', e); }
}
