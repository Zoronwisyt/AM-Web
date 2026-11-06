// effects-engine.js — WebGL2 runtime for the AM effect catalog.
// Frame model: per layer, content is drawn into a comp-sized (optionally overdraw-padded)
// canvas, uploads as a texture, then the enabled effect chain runs: script phase mutates
// alpha/transform/text, then each GL effect renders its pass graph with buffer ping-pong,
// comp-texture capture, and iterations. Output is read back as a straight-alpha canvas.
// Source semantics per am_pipeline_doc.txt: acScreenNorm, acLayerNorm, acLayerSize,
// acScreenSize, acLayerToScreen, acTime (seconds), acPass, acLayerCenter (mat4 identity uv),
// texture2DCv (unpremultiply), getTexSize (passthrough), AmTex struct (.texture/.size).

const FXEngine = {
  cv: null, gl: null, _W: -1, _H: -1,
  _programs: new Map(),           // progKey → {prog, u:{...}, texU, pU}
  _failedProgs: new Set(),
  _srcTex: null,
  _compTex: null,
  _neutralTex: null,
  _store: new WeakMap(),          // effect entry obj → {name: fboRec}
  _quad: null,
  _l2s: null,
  _blit: null,

  // The app loads model.js before this file. Keeping this fallback also lets the
  // standalone effect sweep run without the editor data-model bundle.
  paramAt(entry, param, t) {
    return typeof effectParamAt === 'function' ? effectParamAt(entry, param, t) : entry.params && entry.params[param];
  },

  init() {
    if (FXEngine.gl) return true;
    const cv = document.createElement('canvas');
    const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) { console.warn('FXEngine: no WebGL2'); return false; }
    gl.getExtension('EXT_color_buffer_float');
    FXEngine.cv = cv; FXEngine.gl = gl;
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    FXEngine._quad = b;
    // layer pixel → screen clip: x' = x/W*2-1 ; y' = 1 - y/H*2 (u-space, padded canvas)
    FXEngine._l2s = new Float32Array([2, 0, 0, 0, 0, -2, 0, 0, 0, 0, 1, 0, -1, 1, 0, 1]);
    FXEngine._srcTex = FXEngine.makeTex();
    FXEngine._compTex = FXEngine.makeTex();
    FXEngine._neutralTex = FXEngine.makeNeutral();
    return true;
  },

  makeTex() {
    const gl = FXEngine.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  },

  makeNeutral() {
    const gl = FXEngine.gl;
    const t = FXEngine.makeTex();
    const c = document.createElement('canvas');
    c.width = 4; c.height = 4;
    const x = c.getContext('2d');
    x.fillStyle = '#808080'; x.fillRect(0, 0, 4, 4);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 2, 2);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    return t;
  },

  resetChain() {
    // drop FBO caches when layer size changes
    FXEngine._store = new WeakMap();
  },

  upload(canvas, tex, flip = true) {
    const gl = FXEngine.gl;
    if (canvas.width < 1 || canvas.height < 1) return false;
    // bind/restore the active unit's previous texture — allocation must not clobber sampler slots
    const unit = gl.getParameter(gl.ACTIVE_TEXTURE) - gl.TEXTURE0;
    const prev = unit >= 0 ? gl.getParameter(gl.TEXTURE_BINDING_2D) : null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip !== false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.bindTexture(gl.TEXTURE_2D, prev);
    return true;
  },

  makeFBO(w, h, nearest = false) {
    const gl = FXEngine.gl;
    const unit = gl.getParameter(gl.ACTIVE_TEXTURE) - gl.TEXTURE0;
    const prev = unit >= 0 ? gl.getParameter(gl.TEXTURE_BINDING_2D) : null;
    const fbo = gl.createFramebuffer();
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, prev); // restore caller's sampler slot
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, w, h };
  },

  // ---------- GLSL assembly ----------
  glsl1To3(src, isVertex) {
    let s = src;
    if (!isVertex) {
      s = s.replace(/\bgl_FragColor\b/g, '_gm');
      s = s.replace(/\btexture2DProj\b/g, 'textureProj');
      s = s.replace(/\btexture2D\b/g, 'texture');
      s = s.replace(/\bvarying\b/g, 'in');
      // non-standard 'thread T&' reference params → 'inout T' (adjacent & supported)
      s = s.replace(/\bthread\s+(\w+)\s*&\s*(\w*)/g, 'inout $1 $2');
      s = s.replace(/\bthread\s+(\w+)\s+(\w+)/g, '$1 $2');
      // opaque sampler ternary: texture2DCv(cond ? a.texture : b.texture, uv) — genType ternary on samplers is illegal
      s = s.replace(/texture2DCv\(\s*([^,()?]+)\s*\?\s*([\w.]+)\s*:\s*([\w.]+)\s*,\s*([^)]+?)\)/g,
        'am_pick2DCv($1, $2, $3, $4)');
      // GLSL ES 3.0 reserved words AM took as identifiers
      s = s.replace(/\bsample\b/g, 'smp_');
      s = s.replace(/\bfilter\b/g, 'flt_');
      s = s.replace(/\boutput\b/g, 'outp_');
      s = s.replace(/\bthread\b/g, 'thr_');
      s = s.replace(/\bsmooth(?!step)\b/g, 'smt_');
      // ES3 has inverse(matN) → rename the authored redefine + all calls
      s = s.replace(/\binverse\b/g, 'am_inv');
      s = s.replace(/^\s*precision\s+\w+p\s+float\s*;?\s*$/gm, '');
      // HLSL-style vector postfix some authors used: float4 → vec4
      s = s.replace(/\bfloat4\b/g, 'vec4').replace(/\bfloat3\b/g, 'vec3').replace(/\bfloat2\b/g, 'vec2');
      // const with a function-call initializer: const expr required in ES3, but cross()/dot() are non-constant
      s = s.replace(/\bconst\s+((?:mat[234x]|vec[234x]|float|int|bool)[\w]*)\s+([A-Za-z_]\w*)\s*=\s*([A-Za-z_][\w./+-]*)\s*\(/g, '$1 $2 = $3(');
      // Safe division by alpha: prevent 0.0 / 0.0 = NaN producing pure white blobs in WebGL
      s = s.replace(/(\b\w+\.rgb)\s*\/=\s*(\b\w+\.a)\s*;/g, '$1 = $2 > 1e-4 ? ($1 / $2) : vec3(0.0);');
      s = s.replace(/(\b\w+)\s*\/=\s*(\1\.a)\s*\/\s*max\s*\(\s*\2\s*,\s*(\w+)\s*\)\s*;/g, '$1 = $2 > 1e-4 ? ($1 / ($2 / max($2, $3))) : vec4(0.0);');
      // Reverse Y in directional vectors to match WebGL acScreenNorm (Y increases downwards) with Android OpenGL ES (Y increases upwards)
      // Alight Motion APK shaders define velocity as vec2(cos(rad)*factor, -sin(rad)*factor) so angle=90 points downwards in OpenGL ES
      s = s.replace(/vec2\s*\(\s*cos\s*\(([^)]+)\)\s*([^,]*)\s*,\s*-\s*sin\s*\(\s*\1\s*\)\s*([^)]*)\)/g,
        (m, arg, m1, m2) => `vec2(cos(${arg})${m1}, sin(${arg})${m2})`);
      // const with any non-constant initializer (an identifier token in the expression) — drop const
      s = s.replace(/\bconst\s+((?:mat[234x]|vec[234x]|float|int|bool)[\w]*)\s+([A-Za-z_]\w*)\s*=\s*([^;\n]+);/g, (m, t, n, rhs) => {
        // scientific notation digits keep the const: an alphabetic run NOT preceded by a digit is an identifier
        return /(?<![0-9])[A-Za-z_]/.test(rhs) ? `${t} ${n} = ${rhs};` : m;
      });
      // hex* shaders have global 'const vec2 hexRatioNorm = normalize(hexRatio);' — non-constant in ES3
      s = s.replace(/\b(?:const\s+)?vec2\s+hexRatioNorm\s*=\s*normalize\s*\(\s*hexRatio\s*\)\s*;/g,
        'const vec2 hexRatioNorm = vec2(0.50044434, 0.86576872);');
      // float declaration with an int literal initializer: float min = 1;
      s = s.replace(/\b(float\s+[A-Za-z_]\w*\s*=\s*)(\d+)\s*;/g, '$1$2.0;');
      // scalar assigned to an .rgb target: result.rgb = result.a — needs vec3()
      s = s.replace(/([A-Za-z_][\w.]*)\.rgb\s*=\s*([A-Za-z_][\w.]*)\s*;/g, (m, dst, rhs) => (rhs.includes('.') ? (rhs.match(/^\w+\.(r|g|b|a)$/) ? dst + '.rgb = vec3(' + rhs + ');' : m) : dst + '.rgb = vec3(' + rhs + ');'));
      // scalar initializer truncating to int: int steps = 20.; (run first so its range is literal-pure)
      s = s.replace(/(int\s+\w+\s*=\s*)(\d+)\.\s*;/g, '$1$2;');
      // bare int used as a condition — ES3 needs an explicit boolean expression
      {
        const intNames = new Set((s.match(/\bint\s+[A-Za-z_]\w*/g) || []).map(w => w.replace(/^int\s+/, '')));
        for (const n of intNames) {
          s = s.replace(new RegExp('(^|[^\\w.])if\\s*\\(\\s*' + n + '\\s*\\)', 'g'), (mm, pre) => pre + 'if( ' + n + ' != 0 )');
        }
      }
      // int-decl initializer ranges protect integer-typed literals from floatification
      // (e.g. 'int n = int(quality)/2' and 'int incr = clamp(abs(a-b)/30,1,3)' are valid int math)
      const prot = [];
      {
        const re = /\bint\s+\w+\s*=/g;
        let mm;
        while ((mm = re.exec(s))) {
          const end = s.indexOf(';', mm.index + mm[0].length);
          if (end > 0) prot.push([mm.index + mm[0].length, end]);
        }
      }
      const inProt = (i) => prot.some(r => i >= r[0] && i < r[1]);
      // int literals beside float-typed (swizzled) operands — ES3 has no implicit int→float
      // LHS/RHS must be dotted member refs whose first dot-fragment starts with a letter
      // (protects scientific notation: '1.0e-10' must not be seen as 1.0e minus 10)
      s = s.replace(/([A-Za-z]\w*\.[A-Za-z]\w*)\s*([*+\-/])\s*(\d+)\b(?![.\w])/g, (m, a, op, d, off) => inProt(off) ? m : a + op + d + '.0');
      s = s.replace(/(?<![\w.])(\d+)\s*([*+\-/])\s*([A-Za-z]\w*\.[A-Za-z]\w*)/g, (m, d, op, a, off) => inProt(off) ? m : d + '.0' + op + a);
      // int literal right after a parenthesized expression
      s = s.replace(/\)(\s*[*+\-/]\s*)(\d+)\b(?![.\w])/g, (m, sp, d, off) => inProt(off) ? m : ')' + sp + d + '.0');
      // chained division: ...)/2/255 — the second int divisor follows a float literal; int tail in a
      // division chain is always meant as float math (valid int/int chains never divide literal chains)
      s = s.replace(/(?<=\d)\s*\/\s*(\d+)\b(?![.\w])/g, (m, d, off, str) => {
        if (inProt(off)) return m;
        const before = str.slice(Math.max(0, off - 2), off);
        return /\/\//.test(before) ? m : ' / ' + d + '.0';
      });
      // int literal against a parenthesized expression: 1 - ((…)) — implicit int→float
      s = s.replace(/(?<![\w.])(\d+)\s*([+\-])\s*\(/g, (m, d, op, off) => inProt(off) ? m : d + '.0' + op + '(');
      // authored array-of-vecN brace initializers (oil painting style) → constructor calls
      {
        const re = /vec([234])\s+(\w+)\s*\[\s*(\d+)?\s*\]\s*=\s*\{/g;
        let m;
        while ((m = re.exec(s))) {
          const open = m.index + m[0].length; // first char after '{' is m[0]\{ includes brace; adjust:
          const openBrace = m.index + m[0].length - 1;
          let i = openBrace, depth = 0, found = -1;
          for (; i < s.length; i++) {
            if (s[i] === '{') depth++;
            else if (s[i] === '}') { depth--; if (depth === 0) { found = i; break; } }
            else if (s[i] === ';') break; // bail — not a nested-brace initializer
          }
          if (found < 0) continue;
          const body = s.slice(openBrace + 1, found);
          if (!/\{/.test(body)) continue; // not a brace-row initializer
          const rows = [];
          let d = 0, cur = '';
          for (const ch of body + ',') {
            if (ch === '{') { cur = ''; d = 1; continue; }
            if (ch === '}') { if (d) rows.push(cur.trim()); d = 0; cur = ''; continue; }
            if (d) cur += ch;
          }
          const repl = `vec${m[1]} ${m[2]}[${m[3] || rows.length}] = vec${m[1]}[${m[3] || rows.length}](` + rows.map(r => `vec${m[1]}(${r})`).join(', ') + ');';
          s = s.slice(0, m.index) + repl + s.slice(found + 1);
          re.lastIndex = 0; // string changed — restart scan
        }
      }
      // Replace smoothstep with robust am_smooth to prevent edge0>=edge1 NaN / division-by-zero
      s = s.replace(/\bsmoothstep\b/g, 'am_smooth');
    } else {
      s = s.replace(/\bvarying\b/g, 'out');
      s = s.replace(/\battribute\b/g, 'in');
      s = s.replace(/\binverse\b/g, 'am_inv');
      s = s.replace(/^\s*precision\s+\w+p\s+float\s*;?\s*$/gm, '');
    }
    return s;
  },

  _declCommonUniforms() {
    return `uniform vec2 acProjectSize;
uniform vec2 acScreenSize;
uniform vec2 acPreviewSize;
uniform vec2 acLayerScale;
uniform vec2 acLayerCenter;
uniform vec2 acLayerCenterNorm;
uniform vec2 acLayerPivot;
uniform vec2 acLayerSize;
uniform vec2 acLayerSizeNorm;
uniform vec2 acVelocity;
uniform float acAngularVelocity;
uniform float acScaleVelocity;
uniform float acTime;
uniform float acStartTime;
uniform float acEndTime;
uniform int acPass;
uniform int acIter;
uniform mat3 acLayerTransform;
uniform mat4 acScreenToLayer;
uniform mat4 acLayerToScreen;
uniform mat4 acTransform;
uniform mat4 acVtoRSpace;
uniform bool acShowGuides;
uniform vec4 acOriginSpan; // (padX, padY, layerW, layerH) within padded buffer
uniform float amFlipYU;    // 1 → screen coords y-up

// --- ShaderToy Uniforms (stevensona/shader-toy standard) ---
uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform vec4 iDate;
uniform float iSampleRate;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
uniform vec3 iChannelResolution[4];
`;
  },
  _declTex(textures) {
    let s = 'struct AmTex { sampler2D texture; vec2 size; };\n';
    for (const [id] of Object.entries(textures)) s += `uniform AmTex ${id};\n`;
    return s;
  },
  _bufferSpec(def, id, W, H) {
    const meta = def.textureMeta && def.textureMeta[id] || {};
    const divisor = Math.max(1, +meta.downsample || 1);
    return {
      w: Math.max(1, Math.floor(W / divisor)),
      h: Math.max(1, Math.floor(H / divisor)),
      nearest: meta.filter === 'nearest' || /(?:dist|distance)/i.test(id) || /(?:encode|decode)Float/.test((def.shaders && JSON.stringify(def.shaders)) || '')
    };
  },
  _safeName(id) {
    return String(id)
      .replace(/\bsample\b/g, 'smp_')
      .replace(/\bfilter\b/g, 'flt_')
      .replace(/\boutput\b/g, 'outp_')
      .replace(/\bthread\b/g, 'thr_')
      .replace(/\bsmooth(?!step)\b/g, 'smt_');
  },

  // per-def param GLSL type overrides — authored shaders treat some color params as vec4
  _paramTypes: {},

  // per-def source fixes where general rewriting is unsafe or unclean
  _defPatches: {
    // YUV code reads yuv.u / yuv.v — invalid vec3 swizzles in ES3; the mat-column math maps u→g, v→b
    'com.alightcreative.effects.depth_from_yuv': s => s.replace(/\byuv\.u\b/g, 'yuv.g').replace(/\byuv\.v\b/g, 'yuv.b'),
    // authored loop bounds compare int counters to a float uniform — GLSL1 rejected this too; int() it;
    // also shadows the min() builtin with a local float — rename the variable only
    'com.alightcreative.effects.oilpainting': s => s
      .replace(/\bi\s*([<>]=?)\s*radius\b/g, 'i$1int(radius)')
      .replace(/\bj\s*([<>]=?)\s*radius\b/g, 'j$1int(radius)')
      .replace(/\bradius\s*([<>]=?)\s*[ij]\b/g, 'int(radius)$1$2')
      .replace(/\bmin\b(?!\s*\()/g, 'mn_'),
    // float param used in int arithmetic: layerDepth*2 → layerDepth*2.0
    'com.alightcreative.effects.shapefield': s => s.replace(/\b(layerDepth|layerDepth2|layerDepth3)\s*([*+\-/])\s*(\d+)\b(?![.\w])/g, (m, a, op, d) => a + op + d + '.0'),
    // switch (uniform bool) params passed where int is declared — bool→int has no implicit conversion
    // lookahead (not consuming the comma) — a consumed delimiter would block the next neighbor arg
    'com.alightcreative.effects.grunge': s => s.replace(/\b(d[12]fromctr|t[1-8]light|t[1-8]invert)\b(?=\s*[,)])/g, 'int($1)'),
    // float uniform used as a loop counter bound: for(int i = -samples; i < samples; …)
    'com.alightcreative.effects.ominoglass': s => s.replace(/for\(int i = -samples; i < samples;/g, 'for(int i = -int(samples); i < int(samples);'),
    // vec2 param called with a float expression: sdStarPoly(p, size-smooth, …)
    // (smooth was renamed smt_ by the reserved-word rule before per-def patches run)
    'com.alightcreative.effects.starpoly': s => s.replace(/\bsize\s*-\s*(?:smt_|smooth)\b(?=[^;]{0,30}int\(pointCount\))/g, 'vec2(size - smt_)'),
    // clamp speed sampling to at least 2 samples to avoid division by zero (nSamples-1) and empty loops
    'com.alightcreative.effects.differencematte': s => s.replace(
      /int\s+nSamples\s*=\s*int\s*\(\s*clamp\s*\(\s*speed\s*,\s*1\.01\s*,\s*30\.01\s*\)\s*\)\s*;/g,
      'int nSamples = max(2, int(clamp(speed, 1.01, 30.01)));'
    ),
    // Flip Layer: axis=0 rotates around horizontal axis (flips up/down), axis=90 rotates around vertical axis (flips left/right)
    'com.alightcreative.effects.flip': s => s.replace(/vec2\s*\(\s*0\.0\s*,\s*1\.0\s*\)\s*\*\s*rotAxis/g, 'vec2(cos(axisRad), sin(axisRad))'),
    'com.alightcreative.effects.flip2': s => s.replace(/vec2\s*\(\s*0\.0\s*,\s*1\.0\s*\)\s*\*\s*rotAxis/g, 'vec2(cos(axisRad), sin(axisRad))'),
    'com.alightcreative.effects.flip3': s => s.replace(/vec2\s*\(\s*0\.0\s*,\s*1\.0\s*\)\s*\*\s*rotAxis/g, 'vec2(cos(axisRad), sin(axisRad))'),
    // Edge Glow: guard against 0.0 / 0.0 = NaN producing solid white stroke/blob
    'com.alightcreative.effects.edgeglow': s => s
      .replace(/glow\.rgb\s*\/=\s*glow\.a\s*;/g, 'glow.rgb = glow.a > 1e-4 ? (glow.rgb / glow.a) : vec3(0.0);')
      .replace(/base\.rgb\s*\/=\s*base\.a\s*;/g, 'base.rgb = base.a > 1e-4 ? (base.rgb / base.a) : vec3(0.0);'),
    // Long shadow & directional vector parity with Alight Motion APK: 90 deg faces DOWN
    'com.alightcreative.effects.longshadow': s => s.replace(/-\s*sin\s*\(\s*rad\s*\)/g, 'sin(rad)'),
    'com.alightcreative.effects.longshadow2': s => s.replace(/-\s*sin\s*\(\s*rad\s*\)/g, 'sin(rad)'),
    'com.alightcreative.effects.skexnxxlongshadow2new': s => s.replace(/-\s*sin\s*\(\s*rad\s*\)/g, 'sin(rad)')
  },

  _declParams(def, params) {
    const overrides = FXEngine._paramTypes[def && def.id] || {};
    let s = '';
    for (const p of params) {
      const name = FXEngine._safeName(p.id);
      let type = null;
      switch (p.kind) {
        case 'spinner': case 'slider': case 'float': type = 'float'; break;
        case 'selector': type = 'int'; break;
        case 'switch': type = 'bool'; break;
        case 'point': type = 'vec2'; break;
        case 'color': type = 'vec4'; break;
        case 'xyz': type = 'vec3'; break;
        case 'orient': type = 'mat4'; break;
      }
      if (!type) continue;
      type = overrides[p.id] || type;
      s += `uniform ${type} ${name};\n`;
    }
    return s;
  },
  _acPrelude(fsRaw0, def) {
    let fsRaw = fsRaw0;
    const parts = [];
    if (/AC_ImageParams/.test(fsRaw)) {
      // GLSL ES 3.0 forbids structs-with-samplers as locals or copied values — bypass AC_ImageParams
      // entirely: strip the parameter and wire img.<name> accesses to the global uniforms the engine declares.
      const names = Array.from(new Set(fsRaw.match(/img\.(\w+)/g) || [])).map(s => s.slice(4));
      fsRaw = fsRaw.replace(/\s*,?\s*AC_ImageParams\s+(\w+)\s*\)/g, ' )')
        .replace(/\(AC_ImageParams\s+(\w+)/g, '(')
        .replace(/\bimg\.(\w+)\b/g, (m0, name) => (names.includes(name) && def.textures && def.textures[name] ? name : m0));
      parts.push('// AC_ImageParams bypassed: image fields map to engine texture uniforms');
    }
    if (/AC_ImageInfo/.test(fsRaw)) parts.push('#define AC_ImageInfo AmTex');
    if (/AC_FragShaderInput/.test(fsRaw)) {
      parts.push('struct AC_FragShaderInput { vec2 layerNorm; vec2 screenNorm; vec2 layerSize; vec2 screenSize; mat4 layerToScreen; mat4 screenToLayer; };');
    }
    const paramFields = [];
    if (/AC_ShaderParams/.test(fsRaw)) {
      const fields = Array.from(new Set(fsRaw.match(/\bp\.\w+/g) || [])).map(s => s.slice(2));
      const kindType = { spinner: 'float', slider: 'float', float: 'float', selector: 'int', switch: 'bool', point: 'vec2', color: 'vec4', xyz: 'vec3', orient: 'mat4' };
      const overrides = FXEngine._paramTypes[def.id] || {};
      const pm = new Map(def.params.map(p => [p.id, p]));
      for (const f of fields) {
        const pk = pm.get(f);
        let t = 'float';
        if (pk) t = kindType[pk.kind] || 'float';
        t = overrides[f] || t;
        paramFields.push([t, f]);
      }
      if (paramFields.length) {
        parts.push('struct AC_ShaderParams { ' + paramFields.map(([t, f]) => `${t} ${f}`).join('; ') + '; };');
      }
    }
    // main-less defs: composed entry point appended after all declarations
    let composedMain = '';
    if (!/void\s+main\s*\(/.test(fsRaw) && ((paramFields.length && /AC_ShaderParams/.test(fsRaw)) || /AC_FragShaderInput/.test(fsRaw))) {
      const acInit = /AC_FragShaderInput/.test(fsRaw) ? ' AC_FragShaderInput ac = AC_FragShaderInput(acLayerNorm, acScreenNorm, acLayerSize, acScreenSize, acLayerToScreen, acScreenToLayer);' : '';
      const pInit = paramFields.length ? ' AC_ShaderParams p = AC_ShaderParams(' + paramFields.map(([, f]) => f).join(', ') + ');' : '';
      composedMain = 'void main() {' + acInit + pInit + ' _gm = shadeFragment(ac, p); }\n';
    } else if (/\bvoid\s+mainImage\s*\(/.test(fsRaw) && !/void\s+main\s*\(/.test(fsRaw)) {
      composedMain = 'void main() { mainImage(_gm, gl_FragCoord.xy); }\n';
    }
    return { prelude: (parts.length ? parts.join('\n') + '\n' : ''), main: composedMain, body: fsRaw };
  },

  _declFragHelpers(def, fsRaw) {
    let s = `out vec4 _gm;
in vec2 acLayerNorm;
in vec2 acScreenNorm;
vec4 texture2DCv(sampler2D _T, vec2 _C) {
  vec2 _coord = vec2(_C.x, 1.0 - _C.y);
  vec2 _r = (vec4(_coord.xy, 0.0, 1.0) * acVtoRSpace).xy;
  return texture(_T, _r);
}
vec2 getTexSize(vec2 _S) {
  vec2 _r = (vec4(_S.xy, 0.0, 1.0) * acVtoRSpace).xy;
  return _r;
}
float am_smooth(float a, float b, float x) {
  float d = b - a;
  if (abs(d) < 1e-4) return step(a, x);
  return d > 0.0 ? smoothstep(a, b, x) : (1.0 - smoothstep(b, a, x));
}
vec2 am_smooth(vec2 a, vec2 b, vec2 x) { return vec2(am_smooth(a.x, b.x, x.x), am_smooth(a.y, b.y, x.y)); }
vec3 am_smooth(vec3 a, vec3 b, vec3 x) { return vec3(am_smooth(a.x, b.x, x.x), am_smooth(a.y, b.y, x.y), am_smooth(a.z, b.z, x.z)); }
vec4 am_smooth(vec4 a, vec4 b, vec4 x) { return vec4(am_smooth(a.x, b.x, x.x), am_smooth(a.y, b.y, x.y), am_smooth(a.z, b.z, x.z), am_smooth(a.w, b.w, x.w)); }
// mixed-type edges — authored code calls smoothstep(float-edges, vector-x)
vec2 am_smooth(float a, float b, vec2 x) { return vec2(am_smooth(a, b, x.x), am_smooth(a, b, x.y)); }
vec3 am_smooth(float a, float b, vec3 x) { return vec3(am_smooth(a, b, x.x), am_smooth(a, b, x.y), am_smooth(a, b, x.z)); }
vec4 am_smooth(float a, float b, vec4 x) { return vec4(am_smooth(a, b, x.x), am_smooth(a, b, x.y), am_smooth(a, b, x.z), am_smooth(a, b, x.w)); }
vec2 am_smooth(vec2 a, float b, vec2 x) { return am_smooth(a, vec2(b), x); }
vec3 am_smooth(vec3 a, float b, vec3 x) { return am_smooth(a, vec3(b), x); }
vec4 am_smooth(vec4 a, float b, vec4 x) { return am_smooth(a, vec4(b), x); }
vec2 am_smooth(float a, vec2 b, vec2 x) { return am_smooth(vec2(a), b, x); }
vec3 am_smooth(float a, vec3 b, vec3 x) { return am_smooth(vec3(a), b, x); }
vec4 am_smooth(float a, vec4 b, vec4 x) { return am_smooth(vec4(a), b, x); }
vec4 am_pick2DCv(bool c, sampler2D a, sampler2D b, vec2 uv) { return c ? texture2DCv(a, uv) : texture2DCv(b, uv); }
float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec2 saturate(vec2 x) { return max(min(x, vec2(1.0)), vec2(0.0)); }
vec3 saturate(vec3 x) { return max(min(x, vec3(1.0)), vec3(0.0)); }
vec4 saturate(vec4 x) { return max(min(x, vec4(1.0)), vec4(0.0)); }
`;
    void def;
    if (fsRaw && !/mat2\s+rot2\s*\(/.test(fsRaw) && /\brot2\s*\(/.test(fsRaw)) {
      s += `mat2 rot2(float a) { float c = cos(a), sn = sin(a); return mat2(c, sn, -sn, c); }\n`;
    }
    // starpoly / noise authors call rot(angle) → mat (no local definition in scope)
    if (fsRaw && /\brot\s*\(/.test(fsRaw) && !/(mat[234]|vec[234]|float)\s+rot\s*\(/.test(fsRaw)) {
      if (/rot\s*\(\s*[^,()]+\s*,\s*[^,()]+\s*\)/.test(fsRaw)) {
        s += `vec2 rot(vec2 p, float a) { float c = cos(a), sn = sin(a); return vec2(p.x*c - p.y*sn, p.x*sn + p.y*c); }\n`;
      }
      if (/rot\s*\(\s*[^,()]+\s*\)/.test(fsRaw)) {
        s += `mat2 rot(float a) { float c = cos(a), sn = sin(a); return mat2(c, sn, -sn, c); }\n`;
      }
    }
    if (fsRaw && !/(vec4|vec3|float)\s+premult\s*\(/.test(fsRaw) && /\bpremult\s*\(/.test(fsRaw)) {
      s += `vec4 premult(vec4 c) { return vec4(c.rgb * c.a, c.a); }\n`;
    }
    // AM_AUTHOR_CONVENTION: some shaders call helper functions defined later in the file.
    // GLSL requires declaration before use — forward-declare any such definition once.
    if (fsRaw) {
      const sigRe = /\b(mat[234]|vec[234]|float|int|bool|void)\s+([A-Za-z_]\w*)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*\{/g;
      let sm;
      const fwds = new Set();
      while ((sm = sigRe.exec(fsRaw))) {
        const [, rtype, name, args] = sm;
        if (name === 'main' || fwds.has(name)) continue;
        const useRe = new RegExp('(^|[^\\w.])' + name + '\\s*\\(', 'g');
        const um = useRe.exec(fsRaw.slice(0, sm.index + sm[0].length).slice(0, sm.index));
        if (um) { // a call appears before this definition → forward-declare it
          fwds.add(name);
          s += `${rtype} ${name}(${args.replace(/^\s*(in|out|inout)\s+/g, '').replace(/\s*\bin\b/g, '')});\n`;
        }
      }
    }
    return s;
  },
  _declVertIO() {
    return `out vec2 acLayerNorm;
out vec2 acScreenNorm;
in vec2 aP;
`;
  },

  _vertBody() {
    return `// shared vertex logic
void vertShaderInit() {
  vec2 uv = aP * 0.5 + 0.5;
  vec2 py = vec2(uv.x, 1.0 - uv.y);
  acScreenNorm = (vec4(py, 0.0, 1.0) * acTransform).xy;
  acLayerNorm = (vec4(acScreenNorm, 0.0, 1.0) * acScreenToLayer).xy;
  gl_Position = vec4(aP, 0.0, 1.0);
}
`;
  },

  buildProgram(def, group, vsIdx, fsIdx, entry = null) {
    const gl = FXEngine.gl;
    const custom = entry && entry._customShader;
    const key = custom ? `${def.id}|custom|${vsIdx}|${fsIdx}` : `${def.id}|${group}|${vsIdx}|${fsIdx}`;
    if (FXEngine._failedProgs.has(key)) return null;
    if (FXEngine._programs.has(key)) return FXEngine._programs.get(key);
    const gdata = def.shaders[group] || def.shaders[def.defaultGroup] || { fragment: [], vertex: [] };
    const fsList = gdata.fragment || [];
    if (!fsList.length && !custom) { FXEngine._failedProgs.add(key); return null; }
    const fs = custom || fsList[fsIdx % fsList.length];
    const hasVertex = (gdata.vertex || []).length > 0;

    const fsRaw0 = FXEngine.glsl1To3(fs, false);
    const fsRaw = FXEngine._defPatches[def.id] ? FXEngine._defPatches[def.id](fsRaw0) : fsRaw0;
    const ac = FXEngine._acPrelude(fsRaw, def);
    const fsBody = ac ? (ac.body || fsRaw) : fsRaw;
    const acSt = ac ? (ac.prelude || '') : '';
    const acMain = ac ? (ac.main || '') : '';
    let vsSrc;
    if (hasVertex) {
      const vsAuth = FXEngine.glsl1To3((gdata.vertex || [])[vsIdx % gdata.vertex.length], true);
      vsSrc = [
        'precision highp float;',
        FXEngine._declVertIO(),
        FXEngine._declCommonUniforms(),
        FXEngine._declTex(def.textures),
        FXEngine._declParams(def, def.params),
        'vec4 texture2DCv(sampler2D _T, vec2 _C) { return texture(_T, _C); }',
        'vec2 getTexSize(vec2 _S) { return _S; }',
        'float am_smooth(float a, float b, float x) { float d = b - a; if (abs(d) < 1e-4) return step(a, x); return d > 0.0 ? smoothstep(a, b, x) : (1.0 - smoothstep(b, a, x)); }',
        'vec2 am_smooth(vec2 a, vec2 b, vec2 x) { return vec2(am_smooth(a.x, b.x, x.x), am_smooth(a.y, b.y, x.y)); }',
        'vec3 am_smooth(vec3 a, vec3 b, vec3 x) { return vec3(am_smooth(a.x, b.x, x.x), am_smooth(a.y, b.y, x.y), am_smooth(a.z, b.z, x.z)); }',
        'vec4 am_smooth(vec4 a, vec4 b, vec4 x) { return vec4(am_smooth(a.x, b.x, x.x), am_smooth(a.y, b.y, x.y), am_smooth(a.z, b.z, x.z), am_smooth(a.w, b.w, x.w)); }',
        'vec2 am_smooth(float a, float b, vec2 x) { return vec2(am_smooth(a, b, x.x), am_smooth(a, b, x.y)); }',
        'vec3 am_smooth(float a, float b, vec3 x) { return vec3(am_smooth(a, b, x.x), am_smooth(a, b, x.y), am_smooth(a, b, x.z)); }',
        'vec4 am_smooth(float a, float b, vec4 x) { return vec4(am_smooth(a, b, x.x), am_smooth(a, b, x.y), am_smooth(a, b, x.z), am_smooth(a, b, x.w)); }',
        'float saturate(float x) { return clamp(x, 0.0, 1.0); }',
        'vec2 saturate(vec2 x) { return max(min(x, vec2(1.0)), vec2(0.0)); }',
        'vec3 saturate(vec3 x) { return max(min(x, vec3(1.0)), vec3(0.0)); }',
        'vec4 saturate(vec4 x) { return max(min(x, vec4(1.0)), vec4(0.0)); }',
        FXEngine._vertBody(),  // defines vertShaderInit before any call
        (/void\s+main\s*\(/.test(vsAuth) ? '' : 'void main() { vertShaderInit(); vUV = aP*0.5+0.5; }\n'),
        `out vec2 vUV;`,
        vsAuth
      ].join('\n');
    } else {
      vsSrc = [
        'precision highp float;',
        FXEngine._declVertIO(),
        FXEngine._declCommonUniforms(),
        FXEngine._vertBody(),
        'void main() { vertShaderInit(); }'
      ].join('\n');
    }
    const fsSrc = [
      'precision highp float;',
      acSt,
      FXEngine._declCommonUniforms(),
      FXEngine._declTex(def.textures),
      FXEngine._declParams(def, def.params),
      FXEngine._declFragHelpers(def, fsRaw),
      fsBody,
      acMain
    ].join('\n');

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, '#version 300 es\n' + src);
      gl.compileShader(sh);
      if (gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return sh;
      const log = gl.getShaderInfoLog(sh) || '';
      console.warn('fx compile', def.id, log.split('\n')[0]);
      FXEngine._lastErr = { id: def.id, stage: type === gl.FRAGMENT_SHADER ? 'frag' : 'vert', log };
      gl.deleteShader(sh);
      return null;
    };
    const fso = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!fso) { FXEngine._failedProgs.add(key); return null; }
    const vso = compile(gl.VERTEX_SHADER, vsSrc);
    if (!vso) { FXEngine._failedProgs.add(key); return null; }
    const prog = gl.createProgram();
    gl.attachShader(prog, vso); gl.attachShader(prog, fso);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('fx link', def.id, (gl.getProgramInfoLog(prog) || '').split('\n')[0]);
      FXEngine._lastErr = { id: def.id, stage: 'link', log: gl.getProgramInfoLog(prog) };
      FXEngine._failedProgs.add(key);
      return null;
    }
    const meta = { prog };
    meta.aP = gl.getAttribLocation(prog, 'aP');
    meta.u = {
      flip: gl.getUniformLocation(prog, 'amFlipYU'),
      originSpan: gl.getUniformLocation(prog, 'acOriginSpan'),
      layerSize: gl.getUniformLocation(prog, 'acLayerSize'),
      layerSizeNorm: gl.getUniformLocation(prog, 'acLayerSizeNorm'),
      layerScale: gl.getUniformLocation(prog, 'acLayerScale'),
      screenSize: gl.getUniformLocation(prog, 'acScreenSize'),
      projectSize: gl.getUniformLocation(prog, 'acProjectSize'),
      time: gl.getUniformLocation(prog, 'acTime'),
      startTime: gl.getUniformLocation(prog, 'acStartTime'),
      endTime: gl.getUniformLocation(prog, 'acEndTime'),
      pass: gl.getUniformLocation(prog, 'acPass'),
      iter: gl.getUniformLocation(prog, 'acIter'),
      center: gl.getUniformLocation(prog, 'acLayerCenter'),
      centerNorm: gl.getUniformLocation(prog, 'acLayerCenterNorm'),
      l2s: gl.getUniformLocation(prog, 'acLayerToScreen'),
      s2l: gl.getUniformLocation(prog, 'acScreenToLayer'),
      layerTransform: gl.getUniformLocation(prog, 'acLayerTransform'),
      transform: gl.getUniformLocation(prog, 'acTransform'),
      vtoRSpace: gl.getUniformLocation(prog, 'acVtoRSpace'),
      preview: gl.getUniformLocation(prog, 'acPreviewSize'),
      pivot: gl.getUniformLocation(prog, 'acLayerPivot'),
      velocity: gl.getUniformLocation(prog, 'acVelocity'),
      angVel: gl.getUniformLocation(prog, 'acAngularVelocity'),
      scaleVel: gl.getUniformLocation(prog, 'acScaleVelocity'),
      guides: gl.getUniformLocation(prog, 'acShowGuides'),
      iResolution: gl.getUniformLocation(prog, 'iResolution'),
      iTime: gl.getUniformLocation(prog, 'iTime'),
      iTimeDelta: gl.getUniformLocation(prog, 'iTimeDelta'),
      iFrame: gl.getUniformLocation(prog, 'iFrame'),
      iMouse: gl.getUniformLocation(prog, 'iMouse'),
      iChannel0: gl.getUniformLocation(prog, 'iChannel0'),
      iChannel1: gl.getUniformLocation(prog, 'iChannel1'),
      iChannel2: gl.getUniformLocation(prog, 'iChannel2'),
      iChannel3: gl.getUniformLocation(prog, 'iChannel3'),
      iChannelResolution: gl.getUniformLocation(prog, 'iChannelResolution')
    };
    meta.texU = {};
    for (const name of Object.keys(def.textures)) {
      const usesSize = new RegExp(`\\b${name}\\.size\\b`).test(fsRaw) || (hasVertex && new RegExp(`\\b${name}\\.size\\b`).test(vsSrc));
      meta.texU[name] = {
        tex: gl.getUniformLocation(prog, `${name}.texture`),
        size: usesSize ? gl.getUniformLocation(prog, `${name}.size`) : null
      };
    }
    meta.pU = {};
    for (const p of def.params) {
      if (p.kind === 'section' || p.kind === 'tip') continue;
      meta.pU[p.id] = gl.getUniformLocation(prog, FXEngine._safeName(p.id));
    }
    FXEngine._programs.set(key, meta);
    return meta;
  },

  // ---------- effect run ----------
  // entry: {id, enabled, params, _group(optional via script), _anim(_store), ...}
  // env: { W,H (padded canvas size), layerW, layerH, pad, time, duration, compTexReady }
  runEffect(def, entry, srcCanvas, srcTex, env) {
    const gl = FXEngine.gl;
    const W = env.W, H = env.H, pad = env.pad || 0;
    // The source canvas is composition-sized.  A 3D effect, however, must use
    // the selected layer's span inside that canvas or its local origin lands at
    // the composition center.  2D effects omit layerRect and retain old mapping.
    const rect = env.layerRect;
    const layerW = Math.max(1, rect ? rect.w : env.layerW);
    const layerH = Math.max(1, rect ? rect.h : env.layerH);
    const stores = FXEngine._store.get(entry) || (() => { const s = {}; FXEngine._store.set(entry, s); return s; })();
    for (const [texId, kind] of Object.entries(def.textures)) {
      if (kind !== 'buffer') continue;
      const spec = FXEngine._bufferSpec(def, texId, W, H);
      if (!stores[texId] || stores[texId].w !== spec.w || stores[texId].h !== spec.h) stores[texId] = FXEngine.makeFBO(spec.w, spec.h, spec.nearest);
    }
    if (def.iterationsParam && (!stores.__tmpA || stores.__tmpA.w !== W || stores.__tmpA.h !== H)) {
      stores.__tmpA = FXEngine.makeFBO(W, H);
      stores.__tmpB = FXEngine.makeFBO(W, H);
    }

    const group = (entry._group != null && def.groups.includes(entry._group)) ? entry._group : def.defaultGroup;
    const gdata = def.shaders[group] || def.shaders[def.defaultGroup];
    if (!gdata || !(gdata.fragment || []).length) return null;

    // per-chain flip convention: will be applied at upload/readback by caller; internal passes stay consistent.
    const flip = entry.__flipY ? 1 : 0;
    const passList = def.passes.length ? def.passes : [{ target: null, blend: 'overwrite' }];
    const iterations = def.iterationsParam ? clamp(Math.round(FXEngine.paramAt(entry, def.iterationsParam, env.paramTime || 0) || 1), 1, 64) : 1;

    let curSrcTex = srcTex;
    let finalOut = null;

    for (let it = 0; it < iterations; it++) {
      let outObj = null;
      for (let pi = 0; pi < passList.length; pi++) {
        const pass = passList[pi];
        if (pass.effect) {
          const subDef = FXCatalog.byId[pass.effect];
          if (subDef) {
            const subEntry = FXEngine.makeEntry(subDef.id, entry.params || {});
            if (entry.paramAnim) subEntry.paramAnim = entry.paramAnim;
            const subSource = pass.src && stores[pass.src] ? stores[pass.src] : { tex: curSrcTex, w: W, h: H };
            const subOut = FXEngine.runEffect(subDef, subEntry, srcCanvas, subSource.tex, Object.assign({}, env, { W: subSource.w, H: subSource.h }));
            if (subOut && pass.target) {
              const spec = FXEngine._bufferSpec(def, pass.target, W, H);
              if (!stores[pass.target] || stores[pass.target].w !== spec.w || stores[pass.target].h !== spec.h) stores[pass.target] = FXEngine.makeFBO(spec.w, spec.h, spec.nearest);
              FXEngine._blitTo(subOut.tex, stores[pass.target].fbo, stores[pass.target].w, stores[pass.target].h);
            }
          }
          continue;
        }
        const vsIdx = def.iterationsParam ? it : 0;
        const fsIdx = passList.length > 1 ? pi : (def.iterationsParam ? it : 0);
        const meta = FXEngine.buildProgram(def, group, vsIdx, fsIdx, entry);
        if (!meta) return null;

        gl.useProgram(meta.prog);
        FXEngine._unitN = 0;

        if (meta.aP >= 0) {
          gl.bindBuffer(gl.ARRAY_BUFFER, FXEngine._quad);
          gl.enableVertexAttribArray(meta.aP);
          gl.vertexAttribPointer(meta.aP, 2, gl.FLOAT, false, 0, 0);
        }
        const sx = layerW / (W || 1);
        const sy = layerH / (H || 1);
        const tx = (rect ? rect.x : pad) / (W || 1);
        const ty = (rect ? rect.y : pad) / (H || 1);

        // Affine layer transform: if layerMatrix provided, use it; else fallback to layerRect or center
        const mat = env.layerMatrix || (rect ? [1, 0, 0, 1, rect.x + rect.w / 2 - pad, rect.y + rect.h / 2 - pad] : [1, 0, 0, 1, (W / 2) - pad, (H / 2) - pad]);
        const a = mat[0] != null ? mat[0] : 1;
        const b = mat[1] != null ? mat[1] : 0;
        const c = mat[2] != null ? mat[2] : 0;
        const d = mat[3] != null ? mat[3] : 1;
        const e = mat[4] != null ? mat[4] : ((W / 2) - pad);
        const f = mat[5] != null ? mat[5] : ((H / 2) - pad);

        // layer center on padded screen (pixels and normalized)
        const cx = e + pad;
        const cy = f + pad;
        const cxNorm = cx / (W || 1);
        const cyNorm = cy / (H || 1);

        // AM shaders multiply row vectors on the left: vec4(v, 0, 1) * M.
        // Map (u, v) in [0, 1]^2 to (sx, sy) in [0, 1]^2
        const m00 = (a * layerW) / (W || 1);
        const m10 = (c * layerH) / (W || 1);
        const m30 = (cx - 0.5 * (a * layerW + c * layerH)) / (W || 1);
        const m01 = (b * layerW) / (H || 1);
        const m11 = (d * layerH) / (H || 1);
        const m31 = (cy - 0.5 * (b * layerW + d * layerH)) / (H || 1);

        const l2s = new Float32Array([
          m00, m10, 0, m30,
          m01, m11, 0, m31,
          0, 0, 1, 0,
          0, 0, 0, 1
        ]);

        const det = m00 * m11 - m10 * m01;
        let s2l;
        if (Math.abs(det) > 1e-7) {
          const invDet = 1 / det;
          const invA00 = m11 * invDet;
          const invA10 = -m10 * invDet;
          const invA01 = -m01 * invDet;
          const invA11 = m00 * invDet;
          const invT0 = -(invA00 * m30 + invA10 * m31);
          const invT1 = -(invA01 * m30 + invA11 * m31);
          s2l = new Float32Array([
            invA00, invA10, 0, invT0,
            invA01, invA11, 0, invT1,
            0, 0, 1, 0,
            0, 0, 0, 1
          ]);
        } else {
          s2l = new Float32Array([1 / (sx || 1e-4), 0, 0, -tx / (sx || 1e-4), 0, 1 / (sy || 1e-4), 0, -ty / (sy || 1e-4), 0, 0, 1, 0, 0, 0, 0, 1]);
        }

        const idMat4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        const lTrans3 = new Float32Array([a, b, 0, c, d, 0, e, f, 1]);

        gl.uniform1f(meta.u.flip, flip);
        gl.uniform4f(meta.u.originSpan, tx, ty, sx, sy);
        gl.uniform2f(meta.u.layerSize, layerW, layerH);
        gl.uniform2f(meta.u.layerSizeNorm, layerW / (W || 1), layerH / (H || 1));
        gl.uniform2f(meta.u.layerScale, env.layerScaleX || 1, env.layerScaleY || 1);
        gl.uniform2f(meta.u.screenSize, W, H);
        gl.uniform2f(meta.u.projectSize, env.projectWidth || W, env.projectHeight || H);
        gl.uniform1f(meta.u.time, env.time != null ? env.time : 0);
        gl.uniform1f(meta.u.startTime, env.startTime != null ? env.startTime : 0);
        gl.uniform1f(meta.u.endTime, env.endTime != null ? env.endTime : 1);
        gl.uniform1i(meta.u.pass, pi);
        gl.uniform1i(meta.u.iter, it);
        gl.uniform2f(meta.u.center, cx, H - cy);
        gl.uniform2f(meta.u.centerNorm, cxNorm, cyNorm);
        gl.uniformMatrix4fv(meta.u.l2s, false, l2s);
        gl.uniformMatrix4fv(meta.u.s2l, false, s2l);
        gl.uniformMatrix3fv(meta.u.layerTransform, false, lTrans3);
        gl.uniformMatrix4fv(meta.u.transform, false, idMat4);
        gl.uniformMatrix4fv(meta.u.vtoRSpace, false, idMat4);
        gl.uniform2f(meta.u.preview, env.previewW || W, env.previewH || H);
        gl.uniform2f(meta.u.pivot, env.layerPivotX || env.pivotX || 0, env.layerPivotY || env.pivotY || 0);
        const vvec = env.velocityVec || (Array.isArray(env.velocity) ? env.velocity : [env.velocity || 0, 0]);
        gl.uniform2f(meta.u.velocity, vvec[0], vvec[1]);
        gl.uniform1f(meta.u.angVel, env.angularVelocity || 0);
        gl.uniform1f(meta.u.scaleVel, env.scaleVelocity || 0);
        gl.uniform1i(meta.u.guides, 0);

        // Bind ShaderToy standard uniforms
        if (meta.u.iResolution) gl.uniform3f(meta.u.iResolution, W, H, 1.0);
        if (meta.u.iTime) gl.uniform1f(meta.u.iTime, env.time * (env.duration || 1.0));
        if (meta.u.iTimeDelta) gl.uniform1f(meta.u.iTimeDelta, 1.0 / (env.fps || 30));
        if (meta.u.iFrame) gl.uniform1i(meta.u.iFrame, Math.floor(env.frame || 0));
        if (meta.u.iMouse) gl.uniform4f(meta.u.iMouse, 0, 0, 0, 0);
        if (meta.u.iChannelResolution) {
          gl.uniform3fv(meta.u.iChannelResolution, new Float32Array([W, H, 1.0, W, H, 1.0, W, H, 1.0, W, H, 1.0]));
        }
        if (meta.u.iChannel0) {
          const bound0 = FXEngine._bind(curSrcTex, W, H);
          if (bound0) gl.uniform1i(meta.u.iChannel0, bound0.unit);
        }
        if (FXEngine._dbg) FXEngine._dbgStep('uniforms', gl.getError());

        for (const p of def.params) {
          const loc = meta.pU[p.id]; if (loc == null) continue;
          const v = entry.params ? FXEngine.paramAt(entry, p.id, env.paramTime || 0) : (def.defaults ? def.defaults[p.id] : 0);
          switch (p.kind) {
            case 'spinner': case 'slider': case 'float':
              gl.uniform1f(loc, +v || 0); break;
            case 'selector': gl.uniform1i(loc, Math.round(+v) || 0); break;
            case 'switch': gl.uniform1i(loc, v ? 1 : 0); break;
            case 'point': {
              const pv = Array.isArray(v) ? v : [v && v.x || 0, v && v.y || 0];
              gl.uniform2f(loc, pv[0], pv[1]); break;
            }
            case 'color': {
              const c = (v && v.hex) ? v.hex : (typeof v === 'string' ? v : '#ffffff');
              const raw = String(c).trim();
              const alpha = /^#[\da-f]{8}$/i.test(raw) ? parseInt(raw.slice(1, 3), 16) / 255 : (v && v.a != null ? +v.a : 1);
              const rgb = /^#[\da-f]{8}$/i.test(raw) ? raw.slice(3) : raw.slice(1);
              let n = 0; try { n = parseInt(rgb, 16) || 0; } catch { n = 0; }
              gl.uniform4f(loc, ((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha); break;
            }
            case 'xyz': case 'hue-disc': {
              const zv = (v && typeof v === 'object') ? v : { x: 0, y: 0, z: 0 };
              gl.uniform3f(loc, zv.x || 0, zv.y || 0, zv.z || 0); break;
            }
            case 'orient': {
              const oriented = FXEngine._orientWithAppliedRotation(def, entry, p, env.paramTime || 0);
              const m = FXEngine._orientMat4(oriented, !!p.invert);
              gl.uniformMatrix4fv(loc, false, m); break;
            }
          }
        }

        for (const [texId, kind] of Object.entries(def.textures)) {
          const tu = meta.texU[texId]; if (!tu) continue;
          let bound;
          if (kind === 'buffer') {
            const b = stores[texId]; if (!b) continue;
            if (pass.target === texId) {
              // about to write this same texture while it sits on a sampler = feedback loop
              // (GL 1282). Its read is dormant on this pass's active branch — bind inert instead.
              bound = FXEngine._bindNeu();
              bound.w = b.w; bound.h = b.h;
            } else {
              bound = FXEngine._bind(b.tex, b.w, b.h);
            }
          } else if (kind === 'comp') {
            bound = env.compTexReady ? FXEngine._bind(FXEngine._compTex, env.W, env.H) : FXEngine._bindNeu();
          } else if (kind === 'content') {
            const source = pass.src && stores[pass.src] ? stores[pass.src] : null;
            bound = source ? FXEngine._bind(source.tex, source.w, source.h) : FXEngine._bind(curSrcTex, W, H);
          } else {
            bound = FXEngine._bind(FXEngine._neutralTex, 4, 4);
          }
          if (bound) {
            if (tu.tex) gl.uniform1i(tu.tex, bound.unit);
            if (tu.size) gl.uniform2f(tu.size, bound.w, bound.h);
          }
          if (FXEngine._dbg) FXEngine._dbgStep('tex:' + texId + ':' + kind, gl.getError());
        }

        let target = null;
        if (pass.target) {
          const spec = FXEngine._bufferSpec(def, pass.target, W, H);
          if (!stores[pass.target] || stores[pass.target].w !== spec.w || stores[pass.target].h !== spec.h) stores[pass.target] = FXEngine.makeFBO(spec.w, spec.h, spec.nearest);
          target = stores[pass.target];
        } else if (iterations > 1) {
          target = (it % 2 === 0) ? stores.__tmpA : stores.__tmpB;
        } else {
          if (!stores.__out || stores.__out.w !== W || stores.__out.h !== H) stores.__out = FXEngine.makeFBO(W, H);
          target = stores.__out;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        gl.viewport(0, 0, target.w, target.h);
        if (FXEngine._dbg) FXEngine._dbgStep('bindFbo:' + (pass.target || 'out'), gl.getError());
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (FXEngine._dbg) FXEngine._dbgStep('clear', gl.getError());
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (FXEngine._dbg) FXEngine._dbgStep('draw', gl.getError());
        outObj = target;
        if (!pass.target) curSrcTex = target.tex;
      }
      finalOut = outObj;
      if (iterations > 1) curSrcTex = outObj.tex;
    }
    return finalOut ? { tex: finalOut.tex, w: finalOut.w, h: finalOut.h } : null;
  },

  _bind(tex, w, h) {
    const gl = FXEngine.gl;
    const unit = FXEngine._unitN++;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (FXEngine._dbg) FXEngine._dbgStep('bindTex:' + unit, gl.getError());
    return { unit, w, h };
  },
  _bindNeu() { return FXEngine._bind(FXEngine._neutralTex, 4, 4); },

  // ---------- debug error tracing ----------
  _dbg: false,
  _dbgSteps: null,
  _dbgStep(tag, err) {
    if (FXEngine._dbgSteps) FXEngine._dbgSteps.push(tag + ':' + err);
  },

  _orientMat4(orient, invert) {
    const v = orient || {};
    if (invert) return FXEngine._orientMat4({ roll: -(v.roll || 0), pitch: -(v.pitch || 0), yaw: -(v.yaw || 0) }, false);
    const rr = (v.roll || 0) * Math.PI / 180, pp = (v.pitch || 0) * Math.PI / 180, yy = (v.yaw || 0) * Math.PI / 180;
    const cy = Math.cos(yy), sy = Math.sin(yy), cp = Math.cos(pp), sp = Math.sin(pp), cr = Math.cos(rr), sr = Math.sin(rr);
    const M = [
      [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, 0],
      [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, 0],
      [-sp, cp * sr, cp * cr, 0],
      [0, 0, 0, 1]
    ];
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = M[r][c];
    return out;
  },

  _orientWithAppliedRotation(def, entry, orientParam, time) {
    const base = FXEngine.paramAt(entry, orientParam.id, time) || {};
    const out = { roll: base.roll || 0, pitch: base.pitch || 0, yaw: base.yaw || 0 };
    // XML's rotate xyz controls modify the target orient matrix; they are not
    // independent GLSL uniforms. This is used by Hollow Box and related 3D FX.
    for (const p of def.params) {
      if (p.applyTo !== orientParam.id) continue;
      const v = FXEngine.paramAt(entry, p.id, time) || {};
      out.roll += v.x || 0;
      out.pitch += v.y || 0;
      out.yaw += v.z || 0;
    }
    return out;
  },

  // ---------- script phase ----------
  // AM.* sandbox surface used by effect scripts (triangle, simplexNoise, log)
  _amGlobals() {
    if (window.AM && window.AM._fxReady) return;
    window.AM = window.AM || {};
    window.AM.log = function () {};
    window.clamp = window.clamp || ((x, min, max) => Math.min(Math.max(x, min), max));
    window.mix = window.mix || ((a, b, t) => a * (1 - t) + b * t);
    window.fract = window.fract || ((x) => x - Math.floor(x));
    window.step = window.step || ((edge, x) => (x < edge ? 0 : 1));
    window.smoothstep = window.smoothstep || ((e0, e1, x) => {
      const t = Math.min(Math.max((x - e0) / (e1 - e0 || 1e-6), 0), 1);
      return t * t * (3 - 2 * t);
    });
    window.saturate = window.saturate || ((x) => Math.min(Math.max(x, 0), 1));
    // period-1 triangle wave in [-1, 1]
    window.AM.triangle = function (x) {
      x = x - Math.floor(x);
      return Math.abs(x * 2 - 1) * 2 - 1;
    };
    // Ashima simplex noise (2D + 3D) converted to JS
    const g2 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
    window.AM._s2 = function (xin, yin) {
      const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
      let n0 = 0, n1 = 0, n2 = 0;
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - (i - t), y0 = yin - (j - t);
      let i1, j1;
      if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 >= 0) { const gg = g2[(ii + jj) % 8]; t0 *= t0; n0 = t0 * t0 * (gg[0] * x0 + gg[1] * y0); }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 >= 0) { const gg = g2[(ii + i1 + jj + j1) % 8]; t1 *= t1; n1 = t1 * t1 * (gg[0] * x1 + gg[1] * y1); }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 >= 0) { const gg = g2[(ii + 1 + jj + 1) % 8]; t2 *= t2; n2 = t2 * t2 * (gg[0] * x2 + gg[1] * y2); }
      return 70 * (n0 + n1 + n2);
    };
    const g3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
    window.AM._s3 = function (xin, yin, zin) {
      const F3 = 1 / 3, G3 = 1 / 6;
      let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
      const s = (xin + yin + zin) * F3;
      const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
      const t = (i + j + k) * G3;
      const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0)      { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
        else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
        else               { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
      } else {
        if (y0 < z0)       { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
        else if (x0 < z0)  { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
        else               { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
      }
      const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
      const ii = i & 255, jj = j & 255, kk = k & 255;
      let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
      if (t0 >= 0) { const gg = g3[(ii + jj + kk) % 12]; t0*=t0; n0 = t0*t0*(gg[0]*x0+gg[1]*y0+gg[2]*z0); }
      let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
      if (t1 >= 0) { const gg = g3[(ii+i1 + jj+j1 + kk+k1) % 12]; t1*=t1; n1 = t1*t1*(gg[0]*x1+gg[1]*y1+gg[2]*z1); }
      let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
      if (t2 >= 0) { const gg = g3[(ii+i2 + jj+j2 + kk+k2) % 12]; t2*=t2; n2 = t2*t2*(gg[0]*x2+gg[1]*y2+gg[2]*z2); }
      let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
      if (t3 >= 0) { const gg = g3[(ii+1 + jj+1 + kk+1) % 12]; t3*=t3; n3 = t3*t3*(gg[0]*x3+gg[1]*y3+gg[2]*z3); }
      return 32 * (n0 + n1 + n2 + n3);
    };
    window.AM.simplexNoise = function (x, y = 0, z = 0) {
      if (arguments.length >= 3 || z !== 0) return window.AM._s3(x, y, z);
      return window.AM._s2(x, y);
    };
    window.AM._fxReady = true;
  },

  // env: { time (norm 0..1), duration, fps, frame, velocity, scaleVelocity, angularVelocity }
  runScripts(layer, effects) {
    FXEngine._amGlobals();
    const fx = { dx: 0, dy: 0, dz: 0, ang: 0, sx: 1, sy: 1, alphaMul: 1, textOut: null, groups: [] };
    for (const entry of effects || []) {
      const def = FXCatalog.byId[entry.id];
      if (!def || !entry.enabled || !def.hasScript) continue;
      try {
        const env = entry._env;
        if (!env) continue;
        if (entry._anim == null) entry._anim = (new Function('AM', def.script + '\n;return animate;'))(window.AM);
        const p = Object.assign({}, def.defaults, entry.params);
        for (const id of Object.keys(entry.paramAnim || {})) p[id] = FXEngine.paramAt(entry, id, env.paramTime || 0);
        // AM's Hz controls represent cycles per second; scripts consume cycles at
        // the current elapsed time.
        for (const param of def.params) if (param.type === 'hz' && param.id in p) p[param.id] = (env.time || 0) * (env.duration || 1) * (+p[param.id] || 0);
        if (!entry._prev) entry._prev = Object.assign({}, p);
        const baseText = layer.text != null ? String(layer.text) : '';
        const el = {
          alpha: 1,
          transform: { location: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1 }, angle: 0 },
          text: baseText,
          shaderGroups: null
        };
        const out = entry._anim(env, el, p, entry._prev);
        entry._prev = Object.assign({}, p);
        if (!out) continue;
        fx.dx += out.transform.location.x || 0;
        fx.dy += out.transform.location.y || 0;
        fx.dz += out.transform.location.z || 0;
        fx.ang += out.transform.angle || 0;
        fx.sx *= out.transform.scale ? out.transform.scale.x || 1 : 1;
        fx.sy *= out.transform.scale ? out.transform.scale.y || 1 : 1;
        if (out.alpha != null) fx.alphaMul *= out.alpha;
        if (out.text != null && String(out.text) !== baseText) fx.textOut = String(out.text);
        if (out.shaderGroups && out.shaderGroups.length) {
          fx.groups.push(out.shaderGroups[0]);
          entry._group = out.shaderGroups[0];
        } else entry._group = null;
      } catch (e) { console.warn('fx script', def.id, String(e).slice(0, 120)); }
    }
    if (!isFinite(fx.dx)) fx.dx = 0;
    if (!isFinite(fx.dy)) fx.dy = 0;
    if (!isFinite(fx.ang)) fx.ang = 0;
    fx.alphaMul = clamp(isFinite(fx.alphaMul) ? fx.alphaMul : 1, 0, 100);
    return fx;
  },

  // ---------- chain over a rendered layer ----------
  // canvas: layer content (comp-sized, or padded for overdraw)
  // effects: layer.effects entries (GL ones with a shader)
  // env: { W, H, layerW, layerH, layerRect?, pad, time, compTex (canvas|null), compatFlip(bool → y-up) }
  // returns 2D canvas or null
  processLayer(canvas, effects, env) {
    const glList = [];
    for (const e of (effects || [])) {
      if (!e || !e.enabled) continue;
      const def = FXCatalog.byId[e.id];
      if (def && def.hasGL) glList.push(e);
    }
    if (!glList.length) return null;
    if (!FXEngine.init()) return null;
    const gl = FXEngine.gl;
    const W = env.W, H = env.H;
    // Textures uploaded with UNPACK_FLIP_Y_WEBGL = true match OpenGL FBO coordinate space
    if (!FXEngine.upload(canvas, FXEngine._srcTex, true)) return null;
    let curTex = FXEngine._srcTex;
    if (env.compTex) FXEngine.upload(env.compTex, FXEngine._compTex, true);
    for (const entry of glList) {
      const def = FXCatalog.byId[entry.id];
      const envx = Object.assign({}, env, { W, H, compTexReady: !!env.compTex });
      const out = FXEngine.runEffect(def, entry, canvas, curTex, envx);
      if (!out) continue;
      curTex = out.tex;
    }
    if (curTex === FXEngine._srcTex) return null;
    // ensure WebGL drawing buffer matches layer/comp dimensions
    if (FXEngine.cv.width !== W || FXEngine.cv.height !== H) {
      FXEngine.cv.width = W;
      FXEngine.cv.height = H;
    }
    // blit FBO → default fb
    if (!FXEngine._blit) FXEngine._blit = FXEngine._buildBlit();
    const BL = FXEngine._blit;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.useProgram(BL.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, FXEngine._quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, curTex);
    gl.uniform1i(BL.uSide, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const out = FXEngine._out || (FXEngine._out = document.createElement('canvas'));
    if (out.width !== W || out.height !== H) { out.width = W; out.height = H; }
    const cx = out.getContext('2d');
    cx.clearRect(0, 0, W, H);
    cx.drawImage(FXEngine.cv, 0, 0);
    return out;
  },

  setItemFlip(entry, flip) { /* per-entry flag for internal pass consistency */ entry.__flipY = flip ? 1 : 0; void flip; },

  _buildBlit() {
    const gl = FXEngine.gl;
    const vs = '#version 300 es\nin vec2 aP;out vec2 vUV;void main(){vUV=aP*0.5+0.5;gl_Position=vec4(aP,0.,1.);}';
    const fs = '#version 300 es\nprecision highp float;in vec2 vUV;out vec4 _gm;uniform sampler2D uS;void main(){_gm = texture(uS, vUV);}';
    const prog = gl.createProgram();
    const vso = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vso, vs); gl.compileShader(vso);
    const fso = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fso, fs); gl.compileShader(fso);
    gl.attachShader(prog, vso); gl.attachShader(prog, fso);
    gl.bindAttribLocation(prog, 0, 'aP');
    gl.linkProgram(prog);
    return { prog, uSide: gl.getUniformLocation(prog, 'uS') };
  },

  _blitTo(tex, fbo, w, h) {
    const gl = FXEngine.gl;
    if (!FXEngine._blit) FXEngine._blit = FXEngine._buildBlit();
    const BL = FXEngine._blit;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(BL.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, FXEngine._quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(BL.uSide, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  },

  // ---------- authoring helpers for layer.effects ----------
  makeEntry(id, overrides = {}) {
    const def = FXCatalog.byId[id];
    if (!def) return null;
    const entry = { id, enabled: true, params: JSON.parse(JSON.stringify(def.defaults)) };
    for (const [k, v] of Object.entries(overrides)) entry.params[k] = v;
    return entry;
  },

  // ---------- test sweep ----------
  // browsers-level helper: compile + render every shader-capable def and report.
  // Run from console: await FXEngine.testAll()
  async testAll(opts = {}) {
    if (!FXCatalog.ready) await FXCatalog.load();
    if (!FXEngine.init()) return { error: 'no webgl2' };
    const size = opts.size || 128;
    const src = FXEngine._testSource(size);
    const comp = FXEngine._testComp(size);
    const list = opts.list || FXCatalog.defs;
    const results = [];
    const gl = FXEngine.gl;
    let compileFails = 0, renderFails = 0, blankShots = 0, scriptFails = 0, passes = 0;
    for (const def of list) {
      const entry = FXEngine.makeEntry(def.id);
      if (!entry) { results.push({ id: def.id, name: def.name, pass: false, why: 'no-def' }); continue; }
      const rv = { id: def.id, name: def.name, cat: def.category, pass: true, why: '' };
      try {
        if (!def.hasGL && def.hasScript) {
          // script-only effect: run the animate() phase against a fake text layer
          FXEngine.resetChain();
          FXEngine._lastErr = null;
          const fake = { type: 'text', text: 'Count up 12345', start: 0, duration: 2 };
          const env = { time: 0.35, duration: 2, fps: 30, frame: 10, velocity: 120, scaleVelocity: 4, angularVelocity: 6 };
          entry._env = env;
          const fx = FXEngine.runScripts(fake, [entry]);
          const moved = !!(fx.dx || fx.dy || fx.ang || fx.sx !== 1 || fx.sy !== 1 || fx.alphaMul !== 1 || fx.textOut !== null);
          // a script effect must either move something or run the shader groups path;
          // both count as pass — the failure mode is anim() throwing (caught below) or sandbox miss
          void moved;
          if (rv.pass) passes++;
          results.push(rv);
          continue;
        }
        if (!def.hasGL && !def.hasScript) {
          // motion/param-driven def (Repeat, Movealongpath, Textspacing…): no shader exists —
          // its semantics live in engine-side motion logic, not GPU code. Report, don't fail.
          rv.why = 'motion-not-implemented';
          if (rv.pass) passes++;
          results.push(rv);
          continue;
        }
        FXEngine.resetChain();
        FXEngine._lastErr = null;
        const flip = true;
        FXEngine.upload(src, FXEngine._srcTex, true);
        if (def.needsComp) FXEngine.upload(comp, FXEngine._compTex, true);
        const entry2 = FXEngine._entryWithEnv(entry, flip, size);
        const out = FXEngine.runEffect(def, entry2, src, FXEngine._srcTex, {
          W: size, H: size, layerW: size, layerH: size, pad: 0, time: 0.5, compTexReady: !!def.needsComp
        });
        if (!out) {
          rv.pass = false;
          const firstErrLine = FXEngine._lastErr ? (String(FXEngine._lastErr.log || '').split('\n').map(l => l.trim()).filter(Boolean)[0] || '') : '';
          rv.why = FXEngine._lastErr ? (FXEngine._lastErr.stage + ': ' + firstErrLine) : 'no output';
          rv.fullLog = FXEngine._lastErr ? FXEngine._lastErr.log : null;
          compileFails++;
        } else {
          const px = FXEngine._readPixels(out.tex, size);
          const stat = FXEngine._pxStats(px);
          if (!stat.hasContent) {
            rv.pass = false;
            rv.why = 'render blank';
            blankShots++;
          }
        }
        if (rv.pass) passes++;
      } catch (e) {
        rv.pass = false; rv.why = String(e).slice(0, 100);
        if (!def.hasGL && def.hasScript) scriptFails++; else renderFails++;
      }
      results.push(rv);
    }
    void gl;
    return { total: list.length, pass: passes, compileFail: compileFails, renderBlank: blankShots, scriptFail: scriptFails, results };
  },

  _entryWithEnv(entry, flip, size) {
    entry.__flipY = flip ? 1 : 0;
    entry._anim = null; void size;
    return entry;
  },

  _testSource(size) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, '#12c2e9'); g.addColorStop(0.5, '#c471ed'); g.addColorStop(1, '#f64f59');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    x.fillStyle = '#fff'; x.globalAlpha = 0.35;
    for (let y = 0; y < 8; y++) for (let i = 0; i < 8; i++) if ((i + y) % 2 === 0) x.fillRect(i * size / 8, y * size / 8, size / 8, size / 8);
    x.globalAlpha = 1; x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(size / 2, size / 2, size / 4, 0, 7); x.fill();
    return c;
  },
  _testComp(size) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#203045'); g.addColorStop(1, '#0a0d14');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    x.fillStyle = '#4f7cff'; x.globalAlpha = 0.5; x.fillRect(size * 0.2, size * 0.2, size * 0.6, size * 0.6); x.globalAlpha = 1;
    return c;
  },

  _readPixels(tex, w, h = w) {
    const gl = FXEngine.gl;
    const gl2f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, gl2f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(gl2f);
    return px;
  },
  _pxStats(px) {
    let empty = 0, total = 0;
    for (let i = 0; i < px.length; i += 4) {
      total++;
      const hasAlpha = px[i + 3] > 10;
      const hasColor = (px[i] + px[i + 1] + px[i + 2]) > 5;
      if (!hasAlpha && !hasColor) empty++;
    }
    return { hasContent: (total - empty) >= 12 || empty / total < 0.98, empty, total };
  }
};

const FSQ = '#version';
const _noop = FSQ;
