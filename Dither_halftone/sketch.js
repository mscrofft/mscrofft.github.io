/* global createCanvas, pixelDensity, createGraphics, createVideo, loadImage, windowWidth, windowHeight, image, noLoop, redraw, loop, background */
let canvas;
let srcImg = null;    // p5.Image
let srcVideo = null;  // p5.MediaElement
let gSrc;             // p5.Graphics (fonte)
let gProc;            // p5.Graphics (resultado)

// UI state
let threshold = 128;
let pixelSize = 8;
let stretchX = 1.0;
let method = 'bitmap';
let processEveryN = 1;

// Halftone controls
let htShape = 'dots';
let htAngle = 0;
let htSpacing = 1.0;

// colors — sincronizados com UITheme
let bgColor = '#000000';
let fgColor = '#ffffff';

// frame throttling (vídeo)
let frameCountForN = 0;

// gravação
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

// Export resolution state
let exportW = 1920, exportH = 1080;

const EXPORT_PRESETS = {
  '1280x720':  [1280, 720],
  '1920x1080': [1920, 1080],
  '3840x2160': [3840, 2160],
};
function setExportPreset(key) {
  const wh = EXPORT_PRESETS[key] || EXPORT_PRESETS['1920x1080'];
  exportW = wh[0]; exportH = wh[1];
}

// refs para controles (para ocultar/mostrar)
let ctrl = {};

// ── inicializa painel ────────────────────────────────────────
function initUI() {
  UITheme.init({
    initial: 'dark',
    onToggle(themeName, tokens) {
      // sincroniza bgColor/fgColor com o tema de UI
      bgColor = tokens.bg;
      fgColor = tokens.fg;
      // atualiza color pickers
      if (ctrl.bgColor) ctrl.bgColor.setValue(bgColor);
      if (ctrl.fgColor) ctrl.fgColor.setValue(fgColor);
      processAll();
    },
  });

  UIPanel.init('Bitmap / Dithering');

  // ── Source ─────────────────────────────────────────────────
  const fSrc = UIPanel.section('Source');
  fSrc.button('Upload image / video…', () => {
    document.getElementById('file').click();
  });
  fSrc.button('Fit to canvas', () => fitToCanvas());

  // ── Dither ─────────────────────────────────────────────────
  const fD = UIPanel.section('Dither');

  ctrl.method = fD.select('Method', [
    'bitmap','stretch','fs','atkinson','jjn','stucki',
    'bayer2','bayer4','bayer8','cluster4','halftone',
  ], {
    value: method,
    onChange(v) { method = v; updateVisibility(); processAll(); },
  });

  ctrl.threshold = fD.slider('Threshold / Gamma', {
    min: 0, max: 255, step: 1, value: threshold,
    onChange(v) { threshold = v; processAll(); },
  });

  ctrl.pixelSize = fD.slider('Pixel size', {
    min: 2, max: 64, step: 1, value: pixelSize,
    onChange(v) { pixelSize = v; processAll(); },
  });

  ctrl.stretchX = fD.slider('Stretch X', {
    min: 25, max: 400, step: 5, value: Math.round(stretchX * 100),
    onChange(v) { stretchX = v / 100; processAll(); },
  });

  ctrl.processEveryN = fD.slider('Process every N', {
    min: 1, max: 8, step: 1, value: processEveryN,
    onChange(v) { processEveryN = v; },
  });

  // ── Halftone ────────────────────────────────────────────────
  const fH = UIPanel.section('Halftone', { collapsed: true });

  ctrl.htShape = fH.select('Shape', ['dots','squares','lines'], {
    value: htShape,
    onChange(v) { htShape = v; processAll(); },
  });

  ctrl.htAngle = fH.slider('Angle', {
    min: -90, max: 90, step: 1, value: htAngle,
    onChange(v) { htAngle = v; processAll(); },
  });

  ctrl.htSpacing = fH.slider('Spacing %', {
    min: 50, max: 200, step: 1, value: Math.round(htSpacing * 100),
    onChange(v) { htSpacing = v / 100; processAll(); },
  });

  // ── Colors ──────────────────────────────────────────────────
  const fC = UIPanel.section('Colors');

  ctrl.bgColor = fC.color('BG', {
    value: bgColor,
    onChange(v) { bgColor = v; processAll(); },
  });

  ctrl.fgColor = fC.color('FG', {
    value: fgColor,
    onChange(v) { fgColor = v; processAll(); },
  });

  // ── Video ───────────────────────────────────────────────────
  const fV = UIPanel.section('Video', { collapsed: true });
  fV.button('Play',   () => { if (srcVideo) srcVideo.play(); });
  fV.button('Pause',  () => { if (srcVideo) srcVideo.pause(); });
  fV.button('Mute',   () => { if (srcVideo) srcVideo.volume(0); });
  fV.button('Unmute', () => { if (srcVideo) srcVideo.volume(1); });

  // ── Export ──────────────────────────────────────────────────
  const fE = UIPanel.section('Export');

  fE.select('Resolution', Object.keys(EXPORT_PRESETS), {
    value: '1920x1080',
    onChange(v) { setExportPreset(v); },
  });

  fE.button('Save PNG', () => savePNG());
  fE.button('Save SVG', () => saveSVG());

  // ── Record ──────────────────────────────────────────────────
  const fR = UIPanel.section('Record', { collapsed: true });
  fR.button('Start / Stop', () => {
    if (!isRecording) startRecording(); else stopRecording();
  });

  updateVisibility();
  setExportPreset('1920x1080');
}

function updateVisibility() {
  const isStretch  = (method === 'stretch');
  const isHalftone = (method === 'halftone');
  if (isStretch)  ctrl.stretchX.show(); else ctrl.stretchX.hide();
  if (isHalftone) { ctrl.htShape.show(); ctrl.htAngle.show(); ctrl.htSpacing.show(); }
  else            { ctrl.htShape.hide(); ctrl.htAngle.hide(); ctrl.htSpacing.hide(); }
}

// último grid (para SVG)
let lastGrid = null;
let lastBW = null;
let lastBWMeta = { method:null, pixelSize:null, stretchX:null, threshold:null };
let lastMethod = null;
let lastHT = { shape:'dots', angle:0, spacing:1.0 };

// dithering matrices
const Bayer2 = [
  [0, 2],
  [3, 1],
];
const Bayer4 = [
  [0, 8, 2,10],
  [12,4,14,6],
  [3,11,1,9],
  [15,7,13,5]
];
const Bayer8 = (function(){
  function expand(M){
    const n = M.length;
    const out = Array.from({length:n*2}, ()=>Array(n*2).fill(0));
    for(let y=0;y<n;y++){
      for(let x=0;x<n;x++){
        const v = M[y][x];
        out[y][x]     = 4*v+0;
        out[y][x+n]   = 4*v+2;
        out[y+n][x]   = 4*v+3;
        out[y+n][x+n] = 4*v+1;
      }
    }
    return out;
  }
  return expand(expand(Bayer2));
})();

const Cluster4 = [
  [ 7,13,11, 4],
  [12,16,14, 8],
  [10,15, 6, 2],
  [ 5, 9, 3, 1]
];

const KERNELS = {
  "fs":       { spread:[ {dx:1,dy:0,w:7/16}, {dx:-1,dy:1,w:3/16}, {dx:0,dy:1,w:5/16}, {dx:1,dy:1,w:1/16} ] },
  "atkinson": { spread:[ {dx:1,dy:0,w:1/8},{dx:2,dy:0,w:1/8},{dx:-1,dy:1,w:1/8},{dx:0,dy:1,w:1/8},{dx:1,dy:1,w:1/8},{dx:0,dy:2,w:1/8} ] },
  "jjn":      { spread:[
      {dx:1,dy:0,w:7/48},{dx:2,dy:0,w:5/48},
      {dx:-2,dy:1,w:3/48},{dx:-1,dy:1,w:5/48},{dx:0,dy:1,w:7/48},{dx:1,dy:1,w:5/48},{dx:2,dy:1,w:3/48},
      {dx:-2,dy:2,w:1/48},{dx:-1,dy:2,w:3/48},{dx:0,dy:2,w:5/48},{dx:1,dy:2,w:3/48},{dx:2,dy:2,w:1/48}
  ]},
  "stucki":   { spread:[
      {dx:1,dy:0,w:8/42},{dx:2,dy:0,w:4/42},
      {dx:-2,dy:1,w:2/42},{dx:-1,dy:1,w:4/42},{dx:0,dy:1,w:8/42},{dx:1,dy:1,w:4/42},{dx:2,dy:1,w:2/42},
      {dx:-2,dy:2,w:1/42},{dx:-1,dy:2,w:2/42},{dx:0,dy:2,w:4/42},{dx:1,dy:2,w:2/42},{dx:2,dy:2,w:1/42}
  ]}
};

function setup(){
  pixelDensity(1);
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.position(0, 0);

  gSrc  = createGraphics(1280, 720);
  gProc = createGraphics(1280, 720);

  noLoop();

  const fileInput = document.getElementById('file');
  if (fileInput) fileInput.addEventListener('change', onFile);

  initUI();
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
  fitToCanvas();
}

function onFile(e){
  const f = e.target.files[0];
  if (!f) return;
  cleanupMedia();

  const url = URL.createObjectURL(f);
  if (f.type.startsWith('image/')){
    loadImage(url, img => {
      srcImg = img;
      fitToCanvas();
      processAll();
    }, err => console.warn('Falha ao carregar imagem', err));
  } else if (f.type.startsWith('video/')){
    srcVideo = createVideo([url], () => {
      srcVideo.hide();
      srcVideo.elt.crossOrigin = 'anonymous';
      srcVideo.volume(0);
      srcVideo.loop();
      fitToCanvas();
      loop();
    });
  } else {
    alert('Tipo não suportado. Use imagem ou vídeo (mp4/webm).');
  }
}

function cleanupMedia(){
  if (srcVideo){
    try { srcVideo.stop(); srcVideo.remove(); } catch(e) {}
  }
  srcVideo = null;
  srcImg = null;
}

// --- Core draw loop ---
function draw(){
  background(0);
  if (srcVideo){
    frameCountForN = (frameCountForN + 1) % processEveryN;
    gSrc.push();
    gSrc.clear();
    gSrc.image(srcVideo, 0, 0, gSrc.width, gSrc.height);
    gSrc.pop();
    if (frameCountForN === 0){
      processCurrent(gSrc);
    }
  }
  image(gProc, 0, 0, width, height);
}

function processAll(){
  if (srcImg){
    gSrc.push();
    gSrc.clear();
    const fit = fitRect(srcImg.width, srcImg.height, gSrc.width, gSrc.height);
    gSrc.image(srcImg, fit.x, fit.y, fit.w, fit.h);
    gSrc.pop();
    processCurrent(gSrc);
    redraw();
  } else if (srcVideo){
    // draw() cuida
  }
}

function processCurrent(g){
  const gw = g.width, gh = g.height;
  g.loadPixels();
  const step = Math.max(2, Math.floor(pixelSize * htSpacing));
  const cols = Math.floor(gw / step);
  const rows = Math.floor(gh / step);
  const grid = new Array(rows).fill(0).map(() => new Array(cols).fill(0));

  for (let j = 0; j < rows; j++){
    for (let i = 0; i < cols; i++){
      const cx = Math.floor((i+0.5)*step);
      const cy = Math.floor((j+0.5)*step);
      const idx = 4*(cy*gw + cx);
      const r = g.pixels[idx]||0, gg = g.pixels[idx+1]||0, b = g.pixels[idx+2]||0;
      const y = 0.2126*r + 0.7152*gg + 0.0722*b;
      grid[j][i] = y;
    }
  }
  lastHT = { shape: htShape, angle: htAngle, spacing: htSpacing };
  if (method === 'halftone'){
    lastMethod = method;
    lastGrid = grid;
    drawHalftone(grid, gProc, step, htShape, htAngle);
    return;
  }

  const cols2 = Math.floor(gw / pixelSize);
  const rows2 = Math.floor(gh / pixelSize);
  const grid2 = new Array(rows2).fill(0).map(() => new Array(cols2).fill(0));
  for (let j = 0; j < rows2; j++){
    for (let i = 0; i < cols2; i++){
      const cx = Math.floor((i+0.5)*pixelSize);
      const cy = Math.floor((j+0.5)*pixelSize);
      const idx = 4*(cy*gw + cx);
      const r = g.pixels[idx]||0, gg = g.pixels[idx+1]||0, b = g.pixels[idx+2]||0;
      const y = 0.2126*r + 0.7152*gg + 0.0722*b;
      grid2[j][i] = y;
    }
  }

  let bw = null;
  lastMethod = method;
  lastGrid = grid2;

  switch(method){
    case 'bitmap':   bw = bitmap(grid2, threshold); break;
    case 'stretch':  bw = bitmap(grid2, threshold); break;
    case 'fs':       bw = errorDiffuse(grid2, threshold, KERNELS["fs"]); break;
    case 'atkinson': bw = errorDiffuse(grid2, threshold, KERNELS["atkinson"]); break;
    case 'jjn':      bw = errorDiffuse(grid2, threshold, KERNELS["jjn"]); break;
    case 'stucki':   bw = errorDiffuse(grid2, threshold, KERNELS["stucki"]); break;
    case 'bayer2':   bw = orderedDither(grid2, Bayer2, threshold); break;
    case 'bayer4':   bw = orderedDither(grid2, Bayer4, threshold); break;
    case 'bayer8':   bw = orderedDither(grid2, Bayer8, threshold); break;
    case 'cluster4': bw = orderedDither(grid2, Cluster4, threshold); break;
  }
  lastBW = bw;
  lastBWMeta = { method, pixelSize, stretchX: (method==='stretch' ? stretchX : 1.0), threshold };

  drawGridToGraphics(bw, gProc, pixelSize, method==='stretch' ? stretchX : 1.0);
}

function bitmap(grid, thr){
  const h = grid.length, w = grid[0].length;
  const out = Array.from({length:h}, () => Array(w).fill(0));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      out[y][x] = grid[y][x] < thr ? 0 : 255;
  return out;
}

function orderedDither(grid, mat, thr){
  const h = grid.length, w = grid[0].length;
  const n = mat.length;
  const maxv = n*n - 1;
  const out = Array.from({length:h}, () => Array(w).fill(0));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++){
      const t = ((mat[y % n][x % n] + 0.5) * (255 / (maxv+1)));
      const v = grid[y][x] + (t - 128);
      out[y][x] = v < thr ? 0 : 255;
    }
  return out;
}

function errorDiffuse(grid, thr, kernel){
  const h = grid.length, w = grid[0].length;
  const out = Array.from({length:h}, () => Array(w).fill(0));
  const g = grid.map(row => row.slice());
  for (let y = 0; y < h; y++){
    for (let x = 0; x < w; x++){
      const old = g[y][x];
      const newVal = old < thr ? 0 : 255;
      const err = old - newVal;
      out[y][x] = newVal;
      for (const k of kernel.spread){
        const nx = x + k.dx, ny = y + k.dy;
        if (nx>=0 && nx<w && ny>=0 && ny<h){
          g[ny][nx] = g[ny][nx] + err * k.w;
        }
      }
    }
  }
  return out;
}

function drawGridToGraphics(bw, gfx, px, sx=1){
  const h = bw.length, w = bw[0].length;
  const pw = Math.max(1, Math.floor(px * sx));
  const ph = px;
  gfx.push();
  gfx.clear();
  gfx.noStroke();
  gfx.fill(bgColor);
  gfx.rect(0, 0, gfx.width, gfx.height);
  gfx.fill(fgColor);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (bw[y][x] === 0) gfx.rect(x*pw, y*ph, pw, ph);
  gfx.pop();
}

function drawHalftone(grid, gfx, step, shape, angleDeg){
  const h = grid.length, w = grid[0].length;
  const half = step * 0.5;
  const gamma = 0.5 + (threshold/255) * 1.5;
  const ang = angleDeg * Math.PI / 180;

  gfx.push();
  gfx.clear();
  gfx.noStroke();
  gfx.fill(bgColor);
  gfx.rect(0, 0, gfx.width, gfx.height);
  gfx.fill(fgColor);

  for (let j = 0; j < h; j++){
    for (let i = 0; i < w; i++){
      const Y = grid[j][i] / 255;
      const val = Math.pow(1 - Y, gamma);
      const cx = i*step + half;
      const cy = j*step + half;

      gfx.push();
      gfx.translate(cx, cy);
      if (shape !== 'dots' && ang !== 0) gfx.rotate(ang);

      if (shape === 'dots'){
        const r = half * val;
        if (r > 0.05) gfx.circle(0, 0, 2*r);
      } else if (shape === 'squares'){
        const s = step * val;
        if (s > 0.05) gfx.rect(-s/2, -s/2, s, s);
      } else if (shape === 'lines'){
        const thickness = step * val;
        const length = step * 1.1;
        if (thickness > 0.05) gfx.rect(-length/2, -thickness/2, length, thickness);
      }
      gfx.pop();
    }
  }
  gfx.pop();
}

// fit util
function fitRect(sw, sh, dw, dh){
  const s = Math.min(dw/sw, dh/sh);
  const w = Math.round(sw*s);
  const h = Math.round(sh*s);
  const x = Math.round((dw - w)/2);
  const y = Math.round((dh - h)/2);
  return {x,y,w,h};
}

function fitToCanvas(){
  let w = 1280, h = 720;
  if (srcImg)   { w = srcImg.width; h = srcImg.height; }
  if (srcVideo) { w = srcVideo.width || 1280; h = srcVideo.height || 720; }
  const fit = fitRect(w, h, windowWidth, windowHeight);
  gSrc.resizeCanvas(Math.max(320, fit.w), Math.max(320, fit.h));
  gProc.resizeCanvas(Math.max(320, fit.w), Math.max(320, fit.h));
  if (srcImg) processAll();
}

// SVG export
function _saveSVG_do(){
  const baseStep = Math.max(2, Math.floor(pixelSize * htSpacing));
  const half = baseStep * 0.5;
  const gamma = 0.5 + (threshold/255) * 1.5;
  const ang = htAngle * Math.PI / 180;
  const angDeg = htAngle;

  let w = gProc.width, h = gProc.height;
  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ` +
            `shape-rendering="crispEdges">\n` +
            `<rect width="100%" height="100%" fill="${bgColor}"/>\n` +
            `<g fill="${fgColor}">\n`;

  if (lastMethod === 'halftone' && lastGrid){
    for (let j = 0; j < lastGrid.length; j++){
      for (let i = 0; i < lastGrid[0].length; i++){
        const Y = lastGrid[j][i] / 255;
        const val = Math.pow(1 - Y, gamma);
        const cx = i*baseStep + half;
        const cy = j*baseStep + half;
        if (lastHT.shape === 'dots'){
          const r = half * val;
          if (r > 0.05) svg += `<circle cx="${cx}" cy="${cy}" r="${r}"/>\n`;
        } else if (lastHT.shape === 'squares'){
          const s = baseStep * val;
          if (s > 0.05){
            if (lastHT.angle !== 0)
              svg += `<rect x="${-s/2}" y="${-s/2}" width="${s}" height="${s}" transform="translate(${cx} ${cy}) rotate(${angDeg})"/>\n`;
            else
              svg += `<rect x="${cx - s/2}" y="${cy - s/2}" width="${s}" height="${s}"/>\n`;
          }
        } else if (lastHT.shape === 'lines'){
          const thickness = baseStep * val;
          const length = baseStep * 1.1;
          if (thickness > 0.05)
            svg += `<rect x="${-length/2}" y="${-thickness/2}" width="${length}" height="${thickness}" transform="translate(${cx} ${cy}) rotate(${angDeg})"/>\n`;
        }
      }
    }
  } else if (lastGrid){
    const cols = lastGrid[0].length;
    const rows = lastGrid.length;
    const bw = (lastBW && lastBWMeta && lastBWMeta.method===lastMethod) ? lastBW : bitmap(lastGrid, threshold);
    const pw = pixelSize, ph = pixelSize;
    const sx = (lastMethod==='stretch') ? stretchX : 1.0;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        if (bw[y][x] === 0)
          svg += `<rect x="${x*pw*sx}" y="${y*ph}" width="${pw*sx}" height="${ph}"/>\n`;
  }

  svg += `</g>\n</svg>`;
  const blob = new Blob([svg], {type:"image/svg+xml"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'bitmap-dither.svg';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// gravação
function pickMimeType(){
  const cands = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  for (const t of cands){
    try { if (typeof MediaRecorder!=='undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t; }
    catch(_){}
  }
  return '';
}

function startRecording(){
  if (isRecording) return;
  try {
    gSrc.remove(); gProc.remove();
    gSrc = createGraphics(exportW, exportH);
    gProc = createGraphics(exportW, exportH);
    resizeCanvas(exportW, exportH);
    const stream = canvas.elt.captureStream(30);
    if (srcVideo && srcVideo.elt && typeof srcVideo.elt.captureStream === 'function'){
      try {
        const vstream = srcVideo.elt.captureStream();
        const audioTracks = vstream.getAudioTracks();
        if (audioTracks && audioTracks.length) stream.addTrack(audioTracks[0]);
      } catch(err){ console.warn('Não foi possível anexar o áudio do vídeo.', err); }
    }
    const mimeType = pickMimeType();
    const opts = mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : { videoBitsPerSecond: 6_000_000 };
    mediaRecorder = new MediaRecorder(stream, opts);
    recordedChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data && e.data.size>0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = saveRecording;
    mediaRecorder.start(200);
    if (!srcVideo) loop();
    isRecording = true;
  } catch(err){
    alert('Falha ao iniciar gravação. Seu navegador suporta MediaRecorder/WebM?\n' + err);
  }
}

function stopRecording(){
  if (!isRecording) return;
  try { mediaRecorder.stop(); } catch(err){ console.warn('Erro ao parar recorder', err); }
  isRecording = false;
  if (!srcVideo) noLoop();
}

function saveRecording(){
  const type = recordedChunks[0]?.type || 'video/webm';
  const blob = new Blob(recordedChunks, { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'processed-video.webm';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);

  try { gSrc.remove(); gProc.remove(); } catch(e) {}
  gSrc  = createGraphics(1280, 720);
  gProc = createGraphics(1280, 720);
}

async function renderAtSizeAndDo(w, h, action){
  const prev_gSrc = gSrc, prev_gProc = gProc;
  const prev_lastGrid = lastGrid, prev_lastMethod = lastMethod, prev_lastHT = lastHT;

  const tmpSrc  = createGraphics(w, h);
  const tmpProc = createGraphics(w, h);
  gSrc  = tmpSrc;
  gProc = tmpProc;

  if (srcImg){
    tmpSrc.push(); tmpSrc.clear();
    const fit = fitRect(srcImg.width, srcImg.height, w, h);
    tmpSrc.image(srcImg, fit.x, fit.y, fit.w, fit.h);
    tmpSrc.pop();
    processCurrent(tmpSrc);
  } else if (srcVideo){
    tmpSrc.push(); tmpSrc.clear();
    tmpSrc.image(srcVideo, 0, 0, w, h);
    tmpSrc.pop();
    processCurrent(tmpSrc);
  } else {
    tmpProc.push(); tmpProc.clear(); tmpProc.background(bgColor); tmpProc.pop();
  }

  await action({w, h, g: tmpProc});

  tmpSrc.remove();
  tmpProc.remove();
  gSrc  = prev_gSrc;
  gProc = prev_gProc;
  lastGrid   = prev_lastGrid;
  lastMethod = prev_lastMethod;
  lastHT     = prev_lastHT;
}

function savePNG(){
  renderAtSizeAndDo(exportW, exportH, ({w,h,g}) => {
    return new Promise((resolve) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(g.elt, 0, 0, w, h);
      c.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `export_${w}x${h}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
        resolve();
      }, 'image/png');
    });
  });
}

function saveSVG(){
  if (gProc.width !== exportW || gProc.height !== exportH){
    renderAtSizeAndDo(exportW, exportH, () => { _saveSVG_do(); return Promise.resolve(); });
    return;
  }
  _saveSVG_do();
}
