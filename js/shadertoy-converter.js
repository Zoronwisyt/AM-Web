// js/shadertoy-converter.js
// Bidirectional converter between Alight Motion effect XML/GLSL and ShaderToy GLSL
// Spec: https://github.com/stevensona/shader-toy / https://www.shadertoy.com

const ShaderToyConverter = {
  // Convert an Alight Motion XML shader string into a clean ShaderToy GLSL file
  amToShadertoy(def, customSrc = null) {
    if (!def) return '';
    const rawSrc = customSrc || (def.shaders && def.shaders[0] && def.shaders[0].fragment && def.shaders[0].fragment[0]) || '';
    if (!rawSrc.trim()) return '';

    const lines = [];
    lines.push('// =====================================================================');
    lines.push(`// Alight Motion -> ShaderToy: ${def.name || def.id}`);
    lines.push(`// ID: ${def.id}`);
    lines.push('// Compatible with VS Code Shader Toy (stevensona/shader-toy) & shadertoy.com');
    lines.push('// =====================================================================\n');

    // ShaderToy channel hint (stevensona/shader-toy format)
    lines.push('#iChannel0 "self"\n');

    // Declare effect parameters as uniforms with range metadata
    if (def.params && def.params.length) {
      lines.push('// --- Alight Motion Effect Parameters ---');
      for (const p of def.params) {
        if (!p.id) continue;
        const typeStr = ShaderToyConverter._paramGlslType(p);
        const defVal = p.def != null ? p.def : (p.min != null ? p.min : 0);
        const info = `default: ${JSON.stringify(defVal)}${p.min != null ? ', min: ' + p.min : ''}${p.max != null ? ', max: ' + p.max : ''}`;
        lines.push(`uniform ${typeStr} ${p.id}; // ${p.label || p.id} (${info})`);
      }
      lines.push('');
    }

    // Convert shader body:
    let body = rawSrc;

    // Remove precision and version headers
    body = body.replace(/^\s*#version\s+.*$/gm, '');
    body = body.replace(/^\s*precision\s+.*$/gm, '');

    // Map Alight Motion builtins to ShaderToy standard
    // texture2DCv(sampler, uv) -> texture(sampler, uv)
    body = body.replace(/\btexture2DCv\s*\(\s*inputImg\.texture\s*,\s*/g, 'texture(iChannel0, ');
    body = body.replace(/\btexture2DCv\s*\(\s*(\w+)\.texture\s*,\s*/g, 'texture($1, ');
    body = body.replace(/\btexture2DCv\s*\(/g, 'texture(');
    body = body.replace(/\btexture2D\s*\(/g, 'texture(');

    // inputImg.texture -> iChannel0
    body = body.replace(/\binputImg\.texture\b/g, 'iChannel0');
    // inputImg.size -> iChannelResolution[0].xy
    body = body.replace(/\binputImg\.size\b/g, 'iChannelResolution[0].xy');
    body = body.replace(/\bgetTexSize\s*\([^)]*\)/g, 'iChannelResolution[0].xy');

    // acScreenSize / acLayerSize -> iResolution.xy
    body = body.replace(/\bacScreenSize\b/g, 'iResolution.xy');
    body = body.replace(/\bacLayerSize\b/g, 'iResolution.xy');
    body = body.replace(/\bacTime\b/g, 'iTime');

    // acScreenNorm / acLayerNorm -> uv
    body = body.replace(/\bacScreenNorm\.st\b/g, '(fragCoord.xy / iResolution.xy)');
    body = body.replace(/\bacScreenNorm\.xy\b/g, '(fragCoord.xy / iResolution.xy)');
    body = body.replace(/\bacScreenNorm\b/g, 'vec4(fragCoord.xy / iResolution.xy, 0.0, 1.0)');

    body = body.replace(/\bacLayerNorm\.st\b/g, '(fragCoord.xy / iResolution.xy)');
    body = body.replace(/\bacLayerNorm\.xy\b/g, '(fragCoord.xy / iResolution.xy)');
    body = body.replace(/\bacLayerNorm\b/g, '(fragCoord.xy / iResolution.xy)');

    // acLayerToScreen -> mat4 identity in screen space
    body = body.replace(/\bacLayerToScreen\b/g, 'mat4(1.0)');

    // gl_FragColor -> fragColor
    body = body.replace(/\bgl_FragColor\b/g, 'fragColor');

    // Replace void main() with void mainImage(out vec4 fragColor, in vec2 fragCoord)
    if (/\bvoid\s+main\s*\(\s*\)/.test(body)) {
      body = body.replace(/\bvoid\s+main\s*\(\s*\)/, 'void mainImage(out vec4 fragColor, in vec2 fragCoord)');
    } else if (!/\bvoid\s+mainImage\b/.test(body)) {
      body = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n${body}\n}`;
    }

    lines.push('// --- ShaderToy Core ---');
    lines.push(body.trim());
    return lines.join('\n');
  },

  // Convert a ShaderToy GLSL shader back to Alight Motion XML shader syntax
  shadertoyToAM(stSrc) {
    let s = stSrc;
    // Strip comments and metadata lines
    s = s.replace(/#iChannel\d+.*$/gm, '');
    s = s.replace(/\buniform\s+.*?;/g, ''); // params will be defined in <params>

    // Replace mainImage with main
    s = s.replace(/void\s+mainImage\s*\(\s*out\s+vec4\s+(\w+)\s*,\s*in\s+vec2\s+(\w+)\s*\)/, (m, outCol, inCoord) => {
      return `void main()`;
    });

    // Map ShaderToy builtins back to AM builtins
    s = s.replace(/\biResolution\.xy\b/g, 'acScreenSize');
    s = s.replace(/\biResolution\b/g, 'vec3(acScreenSize, 1.0)');
    s = s.replace(/\biTime\b/g, 'acTime');
    s = s.replace(/\btexture\s*\(\s*iChannel0\s*,\s*/g, 'texture2DCv(inputImg.texture, ');
    s = s.replace(/\biChannel0\b/g, 'inputImg.texture');
    s = s.replace(/\biChannelResolution\[0\]\.xy\b/g, 'getTexSize(inputImg.size)');
    s = s.replace(/\bfragColor\b/g, 'gl_FragColor');
    s = s.replace(/\(fragCoord\.xy\s*\/\s*iResolution\.xy\)/g, 'acScreenNorm.st');
    s = s.replace(/fragCoord\.xy\s*\/\s*iResolution\.xy/g, 'acScreenNorm.st');

    return s.trim();
  },

  _paramGlslType(p) {
    switch (p.kind) {
      case 'float': case 'slider': case 'spinner': return 'float';
      case 'switch': return 'bool';
      case 'point': return 'vec2';
      case 'xyz': return 'vec3';
      case 'color': return p.alpha ? 'vec4' : 'vec3';
      case 'selector': return 'int';
      case 'orient': return 'mat4';
      default: return 'float';
    }
  }
};

if (typeof window !== 'undefined') window.ShaderToyConverter = ShaderToyConverter;
if (typeof module !== 'undefined') module.exports = ShaderToyConverter;
