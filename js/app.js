// app.js — init, keyboard, export engine

/* global Editor, Home, Settings, Props, Keyframes, Ease, AddMenus, RecordMod, Modals, toast, renderComp, download */

class FastMp4Muxer {
  constructor({ width, height, fps }) {
    this.width = width;
    this.height = height;
    this.fps = fps;
    this.timescale = fps * 1000;
    this.chunks = [];
    this.avcC = null;
  }

  addChunk(chunk, meta) {
    if (meta && meta.decoderConfig && meta.decoderConfig.description) {
      this.avcC = new Uint8Array(meta.decoderConfig.description);
    }
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.chunks.push({
      data,
      isKey: chunk.type === 'key',
      duration: Math.round(this.timescale / this.fps)
    });
  }

  finalize() {
    function box(type, ...payloads) {
      let size = 8;
      for (const p of payloads) {
        size += (p instanceof Uint8Array) ? p.byteLength : p.length;
      }
      const out = new Uint8Array(size);
      const v = new DataView(out.buffer);
      v.setUint32(0, size);
      out[4] = type.charCodeAt(0);
      out[5] = type.charCodeAt(1);
      out[6] = type.charCodeAt(2);
      out[7] = type.charCodeAt(3);
      let offset = 8;
      for (const p of payloads) {
        if (p instanceof Uint8Array) {
          out.set(p, offset);
          offset += p.byteLength;
        } else {
          out.set(p, offset);
          offset += p.length;
        }
      }
      return out;
    }

    function concat(...arrs) {
      let total = 0;
      for (const a of arrs) total += a.byteLength;
      const res = new Uint8Array(total);
      let off = 0;
      for (const a of arrs) {
        res.set(a, off);
        off += a.byteLength;
      }
      return res;
    }

    const ftypPayload = new Uint8Array(16);
    const fv = new DataView(ftypPayload.buffer);
    ftypPayload.set([0x69, 0x73, 0x6f, 0x6d], 0); // isom
    fv.setUint32(4, 0x00000200);
    ftypPayload.set([0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31], 8); // isom, mp41
    const ftyp = box('ftyp', ftypPayload);

    let mdatPayloadSize = 0;
    for (const c of this.chunks) mdatPayloadSize += c.data.byteLength;
    const mdatPayload = new Uint8Array(mdatPayloadSize);
    let mdatOff = 0;
    const chunkOffsets = [];
    const chunkSizes = [];
    for (const c of this.chunks) {
      chunkOffsets.push(ftyp.byteLength + 8 + mdatOff);
      chunkSizes.push(c.data.byteLength);
      mdatPayload.set(c.data, mdatOff);
      mdatOff += c.data.byteLength;
    }
    const mdat = box('mdat', mdatPayload);

    const totalDuration = this.chunks.length * Math.round(this.timescale / this.fps);

    const mvhdPayload = new Uint8Array(100);
    const mvhv = new DataView(mvhdPayload.buffer);
    mvhv.setUint32(12, this.timescale);
    mvhv.setUint32(16, totalDuration);
    mvhv.setUint32(20, 0x00010000);
    mvhv.setUint16(24, 0x0100);
    mvhv.setUint32(36, 0x00010000);
    mvhv.setUint32(52, 0x00010000);
    mvhv.setUint32(84, 0x40000000);
    mvhv.setUint32(96, 2);
    const mvhd = box('mvhd', mvhdPayload);

    const tkhdPayload = new Uint8Array(84);
    const tkhv = new DataView(tkhdPayload.buffer);
    tkhv.setUint32(0, 0x00000007);
    tkhv.setUint32(12, 1);
    tkhv.setUint32(20, totalDuration);
    tkhv.setUint32(36, 0x00010000);
    tkhv.setUint32(52, 0x00010000);
    tkhv.setUint32(68, 0x40000000);
    tkhv.setUint32(76, this.width << 16);
    tkhv.setUint32(80, this.height << 16);
    const tkhd = box('tkhd', tkhdPayload);

    const mdhdPayload = new Uint8Array(24);
    const mdhv = new DataView(mdhdPayload.buffer);
    mdhv.setUint32(12, this.timescale);
    mdhv.setUint32(16, totalDuration);
    mdhv.setUint16(20, 0x55c4);
    const mdhd = box('mdhd', mdhdPayload);

    const hdlrPayload = new Uint8Array(25);
    hdlrPayload.set([0x76, 0x69, 0x64, 0x65], 8);
    const hdlr = box('hdlr', hdlrPayload);

    const vmhdPayload = new Uint8Array(12);
    new DataView(vmhdPayload.buffer).setUint16(4, 1);
    const vmhd = box('vmhd', vmhdPayload);

    const url = box('url ', new Uint8Array([0, 0, 0, 1]));
    const drefPayload = new Uint8Array(8);
    new DataView(drefPayload.buffer).setUint32(4, 1);
    const dref = box('dref', drefPayload, url);
    const dinf = box('dinf', dref);

    const avcCBox = box('avcC', this.avcC || new Uint8Array());
    const avc1Payload = new Uint8Array(78);
    const avc1v = new DataView(avc1Payload.buffer);
    avc1v.setUint16(6, 1);
    avc1v.setUint16(24, this.width);
    avc1v.setUint16(26, this.height);
    avc1v.setUint32(28, 0x00480000);
    avc1v.setUint32(32, 0x00480000);
    avc1v.setUint16(40, 1);
    avc1v.setUint16(74, 0x0018);
    avc1v.setInt16(76, -1);
    const avc1 = box('avc1', avc1Payload, avcCBox);

    const stsdPayload = new Uint8Array(8);
    new DataView(stsdPayload.buffer).setUint32(4, 1);
    const stsd = box('stsd', stsdPayload, avc1);

    const sttsPayload = new Uint8Array(16);
    const sttsv = new DataView(sttsPayload.buffer);
    sttsv.setUint32(4, 1);
    sttsv.setUint32(8, this.chunks.length);
    sttsv.setUint32(12, Math.round(this.timescale / this.fps));
    const stts = box('stts', sttsPayload);

    const keyIndices = [];
    for (let i = 0; i < this.chunks.length; i++) {
      if (this.chunks[i].isKey) keyIndices.push(i + 1);
    }
    const stssPayload = new Uint8Array(8 + keyIndices.length * 4);
    const stssv = new DataView(stssPayload.buffer);
    stssv.setUint32(4, keyIndices.length);
    for (let i = 0; i < keyIndices.length; i++) {
      stssv.setUint32(8 + i * 4, keyIndices[i]);
    }
    const stss = box('stss', stssPayload);

    const stscPayload = new Uint8Array(20);
    const stscv = new DataView(stscPayload.buffer);
    stscv.setUint32(4, 1);
    stscv.setUint32(8, 1);
    stscv.setUint32(12, 1);
    stscv.setUint32(16, 1);
    const stsc = box('stsc', stscPayload);

    const stszPayload = new Uint8Array(12 + chunkSizes.length * 4);
    const stszv = new DataView(stszPayload.buffer);
    stszv.setUint32(8, chunkSizes.length);
    for (let i = 0; i < chunkSizes.length; i++) {
      stszv.setUint32(12 + i * 4, chunkSizes[i]);
    }
    const stsz = box('stsz', stszPayload);

    const stcoPayload = new Uint8Array(8 + chunkOffsets.length * 4);
    const stcov = new DataView(stcoPayload.buffer);
    stcov.setUint32(4, chunkOffsets.length);
    for (let i = 0; i < chunkOffsets.length; i++) {
      stcov.setUint32(8 + i * 4, chunkOffsets[i]);
    }
    const stco = box('stco', stcoPayload);

    const stbl = box('stbl', stsd, stts, stss, stsc, stsz, stco);
    const minf = box('minf', vmhd, dinf, stbl);
    const mdia = box('mdia', mdhd, hdlr, minf);
    const trak = box('trak', tkhd, mdia);
    const moov = box('moov', mvhd, trak);

    return concat(ftyp, mdat, moov);
  }
}

const Ex = {
  tab: 'video',
  open() {
    const p = Editor.project;
    if (!p) return;
    Ex.fillOptions(p);
    Modals.open('m-export');
  },
  fillOptions(p) {
    p = p || Editor.project;
    if (!p) return;
    const nativeOpt = document.querySelector('#ex-vres option[value="native"]');
    if (nativeOpt) {
      nativeOpt.textContent = `Project Native (${p.width} × ${p.height})`;
    }
    const customW = document.getElementById('ex-vw');
    const customH = document.getElementById('ex-vh');
    if (customW && (!customW.value || customW.dataset.init !== '1')) {
      customW.value = p.width;
      customH.value = p.height;
      customW.dataset.init = '1';
    }
    Ex.updateVideoInfo(p);
  },
  getVideoParams(p) {
    p = p || Editor.project || { width: 1080, height: 1350, fps: 30, duration: 5 };
    const resMode = document.getElementById('ex-vres') ? document.getElementById('ex-vres').value : 'native';
    let rw = p.width, rh = p.height;
    if (resMode === 'custom') {
      rw = parseInt(document.getElementById('ex-vw')?.value, 10) || p.width;
      rh = parseInt(document.getElementById('ex-vh')?.value, 10) || p.height;
    } else if (resMode !== 'native') {
      const target = parseInt(resMode, 10);
      if (target > 0) {
        const minDim = Math.min(p.width, p.height);
        const scale = target / (minDim || 1080);
        rw = Math.round(p.width * scale);
        rh = Math.round(p.height * scale);
      }
    }
    // Clamp and ensure dimensions are even for video codecs (H.264/VP9)
    rw = Math.max(64, Math.min(7680, rw));
    rh = Math.max(64, Math.min(7680, rh));
    if (rw % 2 !== 0) rw += 1;
    if (rh % 2 !== 0) rh += 1;

    const brMode = document.getElementById('ex-vbitrate') ? document.getElementById('ex-vbitrate').value : '16000000';
    let qual = 16000000;
    if (brMode === 'custom') {
      const mbps = parseFloat(document.getElementById('ex-vbr-val')?.value) || 16;
      qual = Math.round(Math.max(0.5, Math.min(150, mbps)) * 1000000);
    } else {
      qual = parseInt(brMode, 10) || 16000000;
    }

    const fpsMode = document.getElementById('ex-vfps') ? document.getElementById('ex-vfps').value : 'project';
    let fps = p.fps || 30;
    if (fpsMode !== 'project') {
      fps = parseInt(fpsMode, 10) || fps;
    }

    return { rw, rh, qual, fps };
  },
  updateVideoInfo(p) {
    p = p || Editor.project;
    if (!p) return;
    const resMode = document.getElementById('ex-vres')?.value;
    const customResRow = document.getElementById('ex-vres-custom');
    if (customResRow) customResRow.style.display = (resMode === 'custom') ? 'flex' : 'none';

    const brMode = document.getElementById('ex-vbitrate')?.value;
    const customBrRow = document.getElementById('ex-vbitrate-custom');
    if (customBrRow) customBrRow.style.display = (brMode === 'custom') ? 'flex' : 'none';

    const { rw, rh, qual, fps } = Ex.getVideoParams(p);
    const dimsEl = document.getElementById('ex-vdims');
    if (dimsEl) dimsEl.textContent = `${rw} × ${rh} px`;

    const infoEl = document.getElementById('ex-vbr-info');
    if (infoEl) {
      const mbps = (qual / 1000000).toFixed(1);
      const dur = p.duration || 5;
      const estMB = ((qual / 8) * dur) / (1024 * 1024);
      const mbStr = estMB < 1 ? estMB.toFixed(1) : Math.round(estMB);
      infoEl.textContent = `${mbps} Mbps · ~${mbStr} MB · ${fps} fps`;
    }
  },
  init() {
    document.querySelectorAll('#ex-tabs button').forEach(b => b.onclick = () => {
      Ex.tab = b.dataset.ext;
      document.querySelectorAll('#ex-tabs button').forEach(x => x.classList.toggle('on', x === b));
      for (const t of ['video', 'gif', 'pngseq', 'still', 'project', 'amxml']) {
        const el = document.getElementById('ex-' + t);
        if (el) el.hidden = t !== Ex.tab;
      }
      const goBtn = document.getElementById('ex-go');
      if (goBtn) {
        goBtn.textContent = Ex.tab === 'video' ? 'Download Video' : 'Export';
      }
    });

    const goBtn = document.getElementById('ex-go');
    if (goBtn) {
      goBtn.onclick = () => Ex.run();
      goBtn.textContent = Ex.tab === 'video' ? 'Download Video' : 'Export';
    }

    const btnExp = document.getElementById('btn-export');
    if (btnExp) {
      btnExp.onclick = () => Ex.open();
    }

    ['ex-vres', 'ex-vw', 'ex-vh', 'ex-vbitrate', 'ex-vbr-val', 'ex-vfps'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => Ex.updateVideoInfo());
        el.addEventListener('input', () => Ex.updateVideoInfo());
      }
    });

    const impXmlBtn = document.getElementById('ex-btn-import-xml');
    if (impXmlBtn) {
      impXmlBtn.onclick = () => {
        const fileInput = document.getElementById('file-import-xml');
        if (fileInput) fileInput.click();
      };
    }
    const expXmlBtn = document.getElementById('ex-btn-export-xml');
    if (expXmlBtn) {
      expXmlBtn.onclick = () => {
        Ex.amXml(Editor.project);
      };
    }
  },
  async run() {
    const p = Editor.project;
    if (Editor.playing) Editor.togglePlay();
    if (Ex.tab === 'still') Ex.still();
    else if (Ex.tab === 'project') Ex.package(p);
    else if (Ex.tab === 'amxml') Ex.amXml(p);
    else if (Ex.tab === 'video') Ex.video(p);
    else if (Ex.tab === 'gif') Ex.gif(p);
    else if (Ex.tab === 'pngseq') Ex.pngSeq(p);
  },
  amXml(p) {
    if (typeof AMXML !== 'undefined') {
      AMXML.download(p);
      toast('Alight Motion XML exported');
    }
  },
  setProgress(show, frac, label) {
    const wrap = document.getElementById('ex-progress');
    wrap.hidden = !show;
    document.getElementById('ex-bar').style.width = (frac * 100) + '%';
    document.getElementById('ex-label').textContent = label || '';
  },
  async still() {
    const p = Editor.project;
    const sc = +document.getElementById('ex-sscale').value;
    const c = document.createElement('canvas');
    c.width = Math.round(p.width * sc); c.height = Math.round(p.height * sc);
    const ctx = c.getContext('2d');
    ctx.scale(sc, sc);
    if (typeof syncMediaForRender !== 'undefined') await syncMediaForRender(p, Editor.t);
    renderComp(ctx, p, Editor.t, {});
    c.toBlob(b => { if (!b) return toast('Export failed'); const url = URL.createObjectURL(b); download(p.name.replace(/\s+/g, '_') + '.png', url); setTimeout(() => URL.revokeObjectURL(url), 3000); toast('PNG exported'); });
  },
  package(p) {
    download(p.name.replace(/\s+/g, '_') + '.alightproj', URL.createObjectURL(new Blob([JSON.stringify(p)], { type: 'application/json' })));
    toast('Project package exported');
  },
  async video(p) {
    const wasPlaying = typeof Editor !== 'undefined' && Editor.playing;
    if (wasPlaying) Editor.togglePlay();
    const initialT = typeof Editor !== 'undefined' ? Editor.t : 0;

    try {
      const { rw, rh, qual, fps } = Ex.getVideoParams(p);
      const requestedMime = document.getElementById('ex-vfmt') ? document.getElementById('ex-vfmt').value : '';
      const c = document.createElement('canvas'); c.width = rw; c.height = rh;
      const rctx = c.getContext('2d');

      const compCanvas = document.createElement('canvas');
      compCanvas.width = p.width;
      compCanvas.height = p.height;
      const compCtx = compCanvas.getContext('2d');

      const totalDur = p.duration || 5;
      const totalFrames = Math.max(1, Math.round(totalDur * fps));

      const stageEl = document.getElementById('stage');
      const stageCtx = stageEl ? stageEl.getContext('2d') : null;

      // Check if WebCodecs VideoEncoder is available for guaranteed constant framerate (CFR) MP4 export
      let canUseWebCodecs = (typeof VideoEncoder !== 'undefined') && (!requestedMime || requestedMime.includes('mp4'));
      let chosenCodec = null;

      if (canUseWebCodecs) {
        const candidates = Math.max(rw, rh) > 2048
          ? ['avc1.640033', 'avc1.640028', 'avc1.4d002a']
          : ['avc1.4d002a', 'avc1.640028', 'avc1.640033', 'avc1.42001f'];
        for (const cand of candidates) {
          try {
            const s = await VideoEncoder.isConfigSupported({
              codec: cand,
              width: rw,
              height: rh,
              bitrate: qual,
              framerate: fps
            });
            if (s.supported) {
              chosenCodec = cand;
              break;
            }
          } catch (err) {}
        }
        if (!chosenCodec) canUseWebCodecs = false;
      }

      if (canUseWebCodecs && chosenCodec) {
        // Deterministic, zero-drift MP4 encoding at exact chosen FPS
        const muxer = new FastMp4Muxer({ width: rw, height: rh, fps });
        let encError = null;

        const encoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addChunk(chunk, meta),
          error: (e) => { console.error('VideoEncoder error:', e); encError = e; }
        });

        encoder.configure({
          codec: chosenCodec,
          width: rw,
          height: rh,
          bitrate: qual,
          framerate: fps
        });

        Ex.setProgress(true, 0, `Rendering video (0/${totalFrames})...`);

        const keyInterval = Math.max(1, Math.round(fps * 2));
        for (let f = 0; f < totalFrames; f++) {
          if (encError) throw encError;
          const curT = f / fps;
          if (typeof syncMediaForRender !== 'undefined') await syncMediaForRender(p, curT);
          renderComp(compCtx, p, curT, {});

          rctx.clearRect(0, 0, rw, rh);
          rctx.drawImage(compCanvas, 0, 0, rw, rh);

          if (stageCtx) {
            stageCtx.drawImage(compCanvas, 0, 0, stageEl.width, stageEl.height);
          }

          const frame = new VideoFrame(c, {
            timestamp: Math.round(f * 1_000_000 / fps),
            duration: Math.round(1_000_000 / fps)
          });
          encoder.encode(frame, { keyFrame: (f % keyInterval === 0) });
          frame.close();

          const frac = (f + 1) / totalFrames;
          Ex.setProgress(true, frac, `Rendering frame ${f + 1}/${totalFrames} (${Math.floor(frac * 100)}%) · ${fps} fps`);

          // Periodically yield to keep UI smooth without wall-clock drift
          if (f % 5 === 0) {
            await new Promise(r => setTimeout(r, 0));
          }
        }

        await encoder.flush();
        encoder.close();

        const mp4Bytes = muxer.finalize();
        const blob = new Blob([mp4Bytes], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const fileName = (p.name || 'AlightMotion_Video').replace(/\s+/g, '_') + '.mp4';
        download(fileName, url);
        Ex.setProgress(false, 0);
        toast(`Video exported (MP4 · ${fps} fps constant)`);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return;
      }

      // Fallback to MediaRecorder if WebCodecs is unavailable
      let chosenMime = requestedMime;
      if (!chosenMime) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4')) {
          chosenMime = 'video/mp4';
        } else if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
          chosenMime = 'video/webm;codecs=vp9';
        } else {
          chosenMime = 'video/webm';
        }
      }

      const stream = c.captureStream(fps);
      let rec;
      try {
        rec = new MediaRecorder(stream, { mimeType: chosenMime, videoBitsPerSecond: qual });
      } catch (e) {
        try {
          rec = new MediaRecorder(stream, { videoBitsPerSecond: qual });
        } catch (err) {
          return toast('Video recording is not supported in this browser');
        }
      }

      const chunks = [];
      rec.ondataavailable = e => e.data && e.data.size && chunks.push(e.data);
      const downloadPromise = new Promise(resolve => {
        rec.onstop = () => {
          const finalMime = rec.mimeType || chosenMime || 'video/webm';
          const isMp4 = finalMime.includes('mp4');
          const blob = new Blob(chunks, { type: finalMime });
          const url = URL.createObjectURL(blob);
          const fileName = (p.name || 'AlightMotion_Video').replace(/\s+/g, '_') + (isMp4 ? '.mp4' : '.webm');
          download(fileName, url);
          Ex.setProgress(false, 0);
          toast('Video exported (' + (isMp4 ? 'MP4' : 'WebM') + ')');
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          resolve();
        };
      });

      const frameIntervalMs = 1000 / fps;
      rec.start(100);
      Ex.setProgress(true, 0, `Rendering video (0/${totalFrames})...`);

      for (let f = 0; f < totalFrames; f++) {
        const curT = f / fps;
        if (typeof syncMediaForRender !== 'undefined') await syncMediaForRender(p, curT);
        renderComp(compCtx, p, curT, {});

        rctx.clearRect(0, 0, rw, rh);
        rctx.drawImage(compCanvas, 0, 0, rw, rh);

        if (stageCtx) {
          stageCtx.drawImage(compCanvas, 0, 0, stageEl.width, stageEl.height);
        }

        const frac = (f + 1) / totalFrames;
        Ex.setProgress(true, frac, `Rendering frame ${f + 1}/${totalFrames} (${Math.floor(frac * 100)}%)`);

        await new Promise(r => setTimeout(r, frameIntervalMs));
      }

      rec.stop();
      await downloadPromise;
    } finally {
      if (typeof Editor !== 'undefined') {
        Editor.seek(initialT);
        if (wasPlaying) Editor.togglePlay();
      }
    }
  },
  async gif(p) {
    const wasPlaying = typeof Editor !== 'undefined' && Editor.playing;
    if (wasPlaying) Editor.togglePlay();
    const initialT = typeof Editor !== 'undefined' ? Editor.t : 0;

    try {
      const fps = +document.getElementById('ex-gfps').value;
      const scale = +document.getElementById('ex-gscale').value;
      const w = Math.round(p.width * scale), h = Math.round(p.height * scale);
      const step = 1 / fps;
      let frames = Math.min(900, Math.round(p.duration * fps));
      // palette palette: 6-6-6 web-safe
      const pal = [];
      for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) pal.push([r * 51, g * 51, b * 51]);
      const gctx = document.createElement('canvas').getContext('2d');
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      const sc = Math.round(p.width * scale);
      const src = document.createElement('canvas'); src.width = p.width; src.height = p.height;
      const srcctx = src.getContext('2d');
      const idx = new Uint8Array(w * h * frames);
      let fi = 0;
      for (let t = 0; t < frames; t++) {
        const curT = t * step;
        if (typeof syncMediaForRender !== 'undefined') await syncMediaForRender(p, curT);
        renderComp(srcctx, p, curT, {});
        ctx.drawImage(src, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        for (let i = 0, pi = 0; i < d.length; i += 4, pi++) {
          idx[fi * w * h + pi] = Math.round(d[i] / 51) * 36 + Math.round(d[i + 1] / 51) * 6 + Math.round(d[i + 2] / 51);
        }
        fi++;
        if (t % 10 === 0) { Ex.setProgress(true, t / frames, `GIF frame ${t}/${frames}`); await new Promise(r => setTimeout(r, 0)); }
      }
      const gifData = GIFencode(idx, subarray0(pal, frames), w, h, frames, fps);
      download(p.name.replace(/\s+/g, '_') + '.gif', URL.createObjectURL(new Blob([gifData], { type: 'image/gif' })));
      Ex.setProgress(false, 0);
      toast('GIF exported');
    } finally {
      if (typeof Editor !== 'undefined') {
        Editor.seek(initialT);
        if (wasPlaying) Editor.togglePlay();
      }
    }
  },
  async pngSeq(p) {
    const wasPlaying = typeof Editor !== 'undefined' && Editor.playing;
    if (wasPlaying) Editor.togglePlay();
    const initialT = typeof Editor !== 'undefined' ? Editor.t : 0;

    try {
      const fps = +document.getElementById('ex-pfps').value;
      const total = Math.min(400, Math.round(p.duration * fps));
      const src = document.createElement('canvas'); src.width = p.width; src.height = p.height;
      const ctx = src.getContext('2d');
      for (let i = 0; i < total; i++) {
        const curT = i / fps;
        if (typeof syncMediaForRender !== 'undefined') await syncMediaForRender(p, curT);
        renderComp(ctx, p, curT, {});
        await new Promise(res => src.toBlob(b => {
          const url = URL.createObjectURL(b);
          download(`${p.name.replace(/\s+/g, '_')}_${String(i).padStart(4, '0')}.png`, url);
          Ex.setProgress(true, i / total, `Frame ${i + 1}/${total}`);
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          setTimeout(res, 45);
        }));
      }
      Ex.setProgress(false, 0, '');
      toast('PNG sequence exported');
    } finally {
      if (typeof Editor !== 'undefined') {
        Editor.seek(initialT);
        if (wasPlaying) Editor.togglePlay();
      }
    }
  }
};
function subarray0(pal, frames) { return pal; }

// ---------- minimal GIF89a encoder (web-safe palette, LZW) ----------
function GIFencode(idx, pal, w, h, frames, fps) {
  const out = [];
  const push = (...b) => out.push(...b);
  // header
  push(71, 73, 70, 56, 57, 97); // GIF89a
  push(w & 255, w >> 8 & 255, h & 255, h >> 8 & 255);
  push(0xF6); // GCT flag: 8-bit, 7*(64)=512? -> global color table size code 7 (256)
  push(0, 0); // bg color index 0
  push(0); // aspect
  // global color table (256 web-safe)
  for (let i = 0; i < 256; i++) {
    const c = pal[i % pal.length];
    push(c[0], c[1], c[2]);
  }
  // netscape loop
  push(33, 255, 11, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 3, 1, 0, 0, 0);
  const delay = Math.round(100 / fps);
  const minCodeSize = 8;
  for (let f = 0; f < frames; f++) {
    // graphic control ext
    push(33, 249, 4, 0, delay & 255, delay >> 8 & 255, 0, 0);
    // image descriptor
    push(44, 0, 0, 0, 0, w & 255, w >> 8 & 255, h & 255, h >> 8 & 255, 0);
    push(minCodeSize);
    // LZW
    const bits = lzwEncode(idx.subarray(f * w * h, (f + 1) * w * h), minCodeSize);
    // blocks of 255
    for (let i = 0; i < bits.length; i += 255) {
      const n = Math.min(255, bits.length - i);
      push(n, ...bits.slice(i, i + n));
    }
    push(0);
  }
  push(59);
  return new Uint8Array(out);
}
function lzwEncode(pix, minCodeSize) {
  const clearCode = 1 << minCodeSize, eoi = clearCode + 1;
  let codeSize = minCodeSize + 1, next = eoi + 1;
  const dict = new Map(); // key: prefix<<8 | k
  const bytes = [];
  let cur = 0, curBits = 0;
  const emit = code => {
    cur |= code << curBits; curBits += codeSize;
    while (curBits >= 8) { bytes.push(cur & 255); cur >>= 8; curBits -= 8; }
  };
  emit(clearCode);
  let prefix = -1;
  for (let i = 0; i < pix.length; i++) {
    const k = pix[i];
    if (prefix === -1) { prefix = k; continue; }
    const key = ((prefix & 0xFFFF) << 8) | k;
    let code = dict.get(key);
    if (code === undefined) {
      emit(prefix);
      dict.set(key, next++);
      if (next > (1 << codeSize)) {
        if (codeSize < 12) codeSize++;
        else { emit(clearCode); dict.clear(); next = eoi + 1; codeSize = minCodeSize + 1; }
      }
      prefix = k;
    } else {
      prefix = code;
    }
  }
  if (prefix !== -1) emit(prefix);
  emit(eoi);
  if (curBits > 0) bytes.push(cur & 255);
  return bytes;
}

// ---------- keyboard ----------
function keyboardInit() {
  window.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!Editor.project) return;
    if (e.code === 'Space') { e.preventDefault(); Editor.togglePlay(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); Editor.undo(); }
    else if ((e.ctrlKey && e.key.toLowerCase() === 'y') || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z')) { e.preventDefault(); Editor.redo(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); const L = Editor.sel(); if (L) { e.preventDefault(); } }
    else if (e.key === 'Delete' || e.key === 'Backspace') { const L = Editor.sel(); if (L) { Editor.pushUndo(); Editor.removeLayer(L); } }
    else if (e.key === 'ArrowLeft') { Editor.seek(Editor.t - (e.shiftKey ? 1 : 1 / Editor.project.fps)); }
    else if (e.key === 'ArrowRight') { Editor.seek(Editor.t + (e.shiftKey ? 1 : 1 / Editor.project.fps)); }
  });
}

// ---------- boot ----------
document.addEventListener('DOMContentLoaded', () => {
  Settings.init();
  toolbarInit();
  transportInit();
  timelineInit();
  Editor.addChannelInit();
  Editor.stageInit();
  Editor.settingsInit();
  Props.init();
  Ease.init();
  AddMenus.init();
  FXUI.init();
  Ex.init();
  keyboardInit();
  window.addEventListener('resize', () => { if (Editor.project) { Editor.fitStage(); } });
  document.getElementById('btn-back').addEventListener('click', async () => {
    await Editor.save();
    Editor.playing = false;
    if (typeof SelBar !== 'undefined' && SelBar.closePop) SelBar.closePop();
    if (typeof SelBar !== 'undefined') SelBar.render(null);
    document.getElementById('editor-screen').classList.remove('active');
    document.getElementById('home-screen').classList.add('active');
    Home.refresh();
  });
  Home.refresh();
});
