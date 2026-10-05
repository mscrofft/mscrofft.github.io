// Export module: MP4 via WebCodecs + mp4-muxer, GIF via gif.js, PNG snapshot.
// renderFrame(t) is provided by sketch.js and draws into the main canvas.

window.Exporter = {
  async exportMP4({ canvas, fps, durationMs, renderFrame, onProgress, filename, loops = 1 }) {
    if (!('VideoEncoder' in window)) {
      throw new Error('Export MP4 requer Chrome 94+ ou Safari 16.4+ (sem WebCodecs).');
    }
    const { Muxer, ArrayBufferTarget } = await import('https://esm.sh/mp4-muxer@5');
    const W = canvas.width, H = canvas.height;
    const cycleFrames = Math.round((durationMs / 1000) * fps);
    const total = cycleFrames * Math.max(1, loops);
    const bitrate = Math.min(10_000_000, W * H * fps * 0.12);

    const codecs = ['avc1.640028', 'avc1.4d0028', 'avc1.42001f'];
    let codec = null;
    for (const c of codecs) {
      try {
        const sup = await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate, framerate: fps });
        if (sup && sup.supported) { codec = c; break; }
      } catch (_) {}
    }
    if (!codec) throw new Error('Nenhum codec H.264 suportado neste navegador.');

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: W, height: H },
      fastStart: 'in-memory',
    });
    let encError = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { encError = e; console.error('[VideoEncoder]', e); },
    });
    encoder.configure({ codec, width: W, height: H, bitrate, framerate: fps });

    try {
      for (let i = 0; i < total; i++) {
        if (encError) throw encError;
        const t = (i % cycleFrames) / cycleFrames;
        renderFrame(t);
        const ts = Math.round((i / fps) * 1_000_000);
        const vf = new VideoFrame(canvas, { timestamp: ts });
        encoder.encode(vf, { keyFrame: i % fps === 0 });
        vf.close();
        if (onProgress) onProgress((i + 1) / total);
        // Yield to keep UI responsive
        if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));
      }
      await encoder.flush();
      muxer.finalize();
      const blob = new Blob([target.buffer], { type: 'video/mp4' });
      downloadBlob(blob, (filename || 'kinetic') + '.mp4');
    } finally {
      try { if (encoder.state !== 'closed') encoder.close(); } catch (_) {}
    }
  },

  async exportGIF({ canvas, fps, durationMs, renderFrame, onProgress, filename, loops = 1, scale = 1 }) {
    // Load gif.js from CDN lazily, and fetch the worker as a Blob to bypass
    // origin=null/file:// worker restrictions.
    const libURL    = 'https://cdn.jsdelivr.net/npm/gif.js.optimized@1.0.1/dist/gif.js';
    const workerURL = 'https://cdn.jsdelivr.net/npm/gif.js.optimized@1.0.1/dist/gif.worker.js';
    if (!window.GIF) await loadScript(libURL);
    if (!this._gifWorkerBlob) {
      const res = await fetch(workerURL);
      const txt = await res.text();
      this._gifWorkerBlob = URL.createObjectURL(new Blob([txt], { type: 'application/javascript' }));
    }

    const W = Math.round(canvas.width * scale), H = Math.round(canvas.height * scale);
    const total = Math.round((durationMs / 1000) * fps);
    const delay = Math.round(1000 / fps);
    const gif = new GIF({
      workers: 2,
      quality: 8,
      width: W,
      height: H,
      repeat: 0,
      workerScript: this._gifWorkerBlob,
    });
    // Downscale buffer (also used at scale=1 for a consistent path)
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const offCtx = off.getContext('2d');
    const totalFrames = total * Math.max(1, loops);
    for (let i = 0; i < totalFrames; i++) {
      const t = (i % total) / total;
      renderFrame(t);
      offCtx.drawImage(canvas, 0, 0, W, H);
      gif.addFrame(off, { copy: true, delay });
      if (onProgress) onProgress(0.5 * (i + 1) / totalFrames);
    }
    await new Promise((resolve, reject) => {
      gif.on('progress', (pr) => { if (onProgress) onProgress(0.5 + 0.5 * pr); });
      gif.on('finished', (blob) => {
        downloadBlob(blob, (filename || 'kinetic') + '.gif');
        resolve();
      });
      gif.on('abort', () => reject(new Error('GIF abortado')));
      gif.render();
    });
  },

  exportPNG({ canvas, filename }) {
    canvas.toBlob((blob) => downloadBlob(blob, (filename || 'kinetic') + '.png'));
  },
};

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error('Falha ao carregar ' + src));
    document.head.appendChild(s);
  });
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}
