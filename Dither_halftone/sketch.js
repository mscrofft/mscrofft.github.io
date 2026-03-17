/* global createCanvas, pixelDensity, createGraphics, createVideo, loadImage, windowWidth, windowHeight, image, noLoop, redraw, loop, background */
let canvas;
let srcImg = null;    // p5.Image
let srcVideo = null;  // p5.MediaElement
let gSrc;             // p5.Graphics (fonte)
let gProc;            // p5.Graphics (resultado)

// UI state
let threshold = 128;        // bitmap threshold / halftone gamma slider source
let pixelSize = 8;
let stretchX = 1.0;
let method = 'bitmap';      // token
let processEveryN = 1;

// Halftone controls
let htShape = 'dots';       // 'dots' | 'squares' | 'lines'
let htAngle = 0;            // degrees
let htSpacing = 1.0;        // 0.5..2.0

// colors
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

// --- dat.GUI UI ---
const EXPORT_PRESETS = {
  '1280x720': [1280, 720],
  '1920x1080': [1920, 1080],
  '3840x2160': [3840, 2160],
};
function setExportPreset(key){
  const wh = EXPORT_PRESETS[key] || EXPORT_PRESETS['1920x1080'];
  exportW = wh[0]; exportH = wh[1];
}

let gui = null;
let guiCtrls = {};
let guiState = {
  // Source / actions
  upload: () => { const inp = document.getElementById('file'); if (inp) inp.click(); },
  fit: () => fitToCanvas(),
  invertColors: () => { const tmp = bgColor; bgColor = fgColor; fgColor = tmp; processAll(); },

  // Core params
  method: method,
  threshold: threshold,
  pixelSize: pixelSize,
  stretchX: stretchX,
  processEveryN: processEveryN,

  // Halftone
  htShape: htShape,
  htAngle: htAngle,
  htSpacing: Math.round(htSpacing * 100), // store as 50..200

  // Colors
  bgColor: bgColor,
  fgColor: fgColor,

  // Video actions
  play: () => { if (srcVideo) srcVideo.play(); },
  pause: () => { if (srcVideo) srcVideo.pause(); },
  mute: () => { if (srcVideo) srcVideo.volume(0); },
  unmute: () => { if (srcVideo) srcVideo.volume(1); },

  // Export
  exportPreset: '1920x1080',
  savePNG: () => savePNG(),
  saveSVG: () => saveSVG(),

  // Recording
  record: () => { if (!isRecording) startRecording(); else stopRecording(); },
};

function initDatGUI(){
  if (!window.dat || !dat.GUI) return;

  gui = new dat.GUI();

  const fSrc = gui.addFolder('Source');
  fSrc.add(guiState, 'upload').name('Upload image/video…');
  fSrc.add(guiState, 'fit').name('Fit to canvas');
  fSrc.add(guiState, 'invertColors').name('Invert colors');
  fSrc.open();

  const fD = gui.addFolder('Dither');
  guiCtrls.method = fD.add(guiState, 'method', [
    'bitmap','stretch','fs','atkinson','jjn','stucki','bayer2','bayer4','bayer8','cluster4','halftone'
  ]).name('Method').onChange((v)=>{
    method = v;
    updateGuiVisibility();
    processAll();
  });

  guiCtrls.threshold = fD.add(guiState, 'threshold', 0, 255, 1).name('Threshold / Gamma').onChange((v)=>{
    threshold = +v;
    processAll();
  });

  guiCtrls.pixelSize = fD.add(guiState, 'pixelSize', 2, 64, 1).name('Pixel size').onChange((v)=>{
    pixelSize = +v;
    processAll();
  });

  guiCtrls.stretchX = fD.add(guiState, 'stretchX', 0.25, 4.0, 0.05).name('Stretch X').onChange((v)=>{
    stretchX = +v;
    processAll();
  });

  guiCtrls.processEveryN = fD.add(guiState, 'processEveryN', 1, 8, 1).name('Process every N').onChange((v)=>{
    processEveryN = +v;
  });
  fD.open();

  const fH = gui.addFolder('Halftone');
  guiCtrls.htShape = fH.add(guiState, 'htShape', ['dots','squares','lines']).name('Shape').onChange((v)=>{
    htShape = v; processAll();
  });
  guiCtrls.htAngle = fH.add(guiState, 'htAngle', -90, 90, 1).name('Angle').onChange((v)=>{
    htAngle = +v; processAll();
  });
  guiCtrls.htSpacing = fH.add(guiState, 'htSpacing', 50, 200, 1).name('Spacing %').onChange((v)=>{
    htSpacing = (+v)/100; processAll();
  });
  fH.open();

  const fC = gui.addFolder('Colors');
  guiCtrls.bg = fC.addColor(guiState, 'bgColor').name('BG').onChange((v)=>{ bgColor = v; processAll(); });
  guiCtrls.fg = fC.addColor(guiState, 'fgColor').name('FG').onChange((v)=>{ fgColor = v; processAll(); });
  fC.open();

  const fV = gui.addFolder('Video');
  fV.add(guiState, 'play').name('Play');
  fV.add(guiState, 'pause').name('Pause');
  fV.add(guiState, 'mute').name('Mute');
  fV.add(guiState, 'unmute').name('Unmute');
  fV.open();

  const fE = gui.addFolder('Export');
  guiCtrls.exportPreset = fE.add(guiState, 'exportPreset', Object.keys(EXPORT_PRESETS)).name('Resolution').onChange((v)=>{
    setExportPreset(v);
  });
  fE.add(guiState, 'savePNG').name('Save PNG');
  fE.add(guiState, 'saveSVG').name('Save SVG');
  fE.open();

  const fR = gui.addFolder('Record');
  fR.add(guiState, 'record').name('Start/Stop');
  fR.open();

  updateGuiVisibility();
}

function _setCtrlVisible(ctrl, visible){
  if(!ctrl || !ctrl.domElement) return;
  const row = ctrl.domElement.parentElement;
  if(row) row.style.display = visible ? '' : 'none';
}
function updateGuiVisibility(){
  const isStretch = (method === 'stretch');
  const isHalftone = (method === 'halftone');
  _setCtrlVisible(guiCtrls.stretchX, isStretch);
  _setCtrlVisible(guiCtrls.htShape, isHalftone);
  _setCtrlVisible(guiCtrls.htAngle, isHalftone);
  _setCtrlVisible(guiCtrls.htSpacing, isHalftone);
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
        out[y][x] = 4*v+0;
        out[y][x+n] = 4*v+2;
        out[y+n][x] = 4*v+3;
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
  "fs": { spread:[ {dx:1,dy:0,w:7/16}, {dx:-1,dy:1,w:3/16}, {dx:0,dy:1,w:5/16}, {dx:1,dy:1,w:1/16} ] },
  "atkinson": { spread:[ {dx:1,dy:0,w:1/8},{dx:2,dy:0,w:1/8},{dx:-1,dy:1,w:1/8},{dx:0,dy:1,w:1/8},{dx:1,dy:1,w:1/8},{dx:0,dy:2,w:1/8} ] },
  "jjn": { spread:[
      {dx:1,dy:0,w:7/48},{dx:2,dy:0,w:5/48},
      {dx:-2,dy:1,w:3/48},{dx:-1,dy:1,w:5/48},{dx:0,dy:1,w:7/48},{dx:1,dy:1,w:5/48},{dx:2,dy:1,w:3/48},
      {dx:-2,dy:2,w:1/48},{dx:-1,dy:2,w:3/48},{dx:0,dy:2,w:5/48},{dx:1,dy:2,w:3/48},{dx:2,dy:2,w:1/48}
  ]},
  "stucki": { spread:[
      {dx:1,dy:0,w:8/42},{dx:2,dy:0,w:4/42},
      {dx:-2,dy:1,w:2/42},{dx:-1,dy:1,w:4/42},{dx:0,dy:1,w:8/42},{dx:1,dy:1,w:4/42},{dx:2,dy:1,w:2/42},
      {dx:-2,dy:2,w:1/42},{dx:-1,dy:2,w:2/42},{dx:0,dy:2,w:4/42},{dx:1,dy:2,w:2/42},{dx:2,dy:2,w:1/42}
  ]}
};

function setup(){
  pixelDensity(1);
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.position(0, 0);

  gSrc = createGraphics(1280, 720);
  gProc = createGraphics(1280, 720);

  noLoop();

  // Hidden file input (triggered by dat.GUI)
  const fileInput = document.getElementById('file');
  if (fileInput) fileInput.addEventListener('change', onFile);

  initDatGUI();

  // default export preset
  setExportPreset(guiState.exportPreset);
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
  // keep current fit
  fitToCanvas();
}



function onFile(e){
  const f = e.target.files[0];
  if(!f) return;
  cleanupMedia();

  const url = URL.createObjectURL(f);
  if(f.type.startsWith('image/')){
    loadImage(url, img=>{
      srcImg = img;
      fitToCanvas();
      processAll();
    }, err=>console.warn('Falha ao carregar imagem', err));
  }else if(f.type.startsWith('video/')){
    srcVideo = createVideo([url], ()=>{
      srcVideo.hide();
      srcVideo.elt.crossOrigin = 'anonymous';
      srcVideo.volume(0);
      srcVideo.loop();
      fitToCanvas();
      loop(); // draw contínuo para vídeo
    });
  }else{
    alert('Tipo não suportado. Use imagem ou vídeo (mp4/webm).');
  }
}

function cleanupMedia(){
  if(srcVideo){
    try{ srcVideo.stop(); srcVideo.remove(); }catch(e){}
  }
  srcVideo = null;
  srcImg = null;
}

// --- Core draw loop ---
function draw(){
  background(0);
  if(srcVideo){
    frameCountForN = (frameCountForN + 1) % processEveryN;
    gSrc.push();
    gSrc.clear();
    gSrc.image(srcVideo, 0, 0, gSrc.width, gSrc.height);
    gSrc.pop();
    if(frameCountForN===0){
      processCurrent(gSrc);
    }
  }
  image(gProc, 0, 0, width, height);
}

function processAll(){
  if(srcImg){
    gSrc.push();
    gSrc.clear();
    const fit = fitRect(srcImg.width, srcImg.height, gSrc.width, gSrc.height);
    gSrc.image(srcImg, fit.x, fit.y, fit.w, fit.h);
    gSrc.pop();
    processCurrent(gSrc);
    redraw();
  }else if(srcVideo){
    // draw() cuida
  }
}

function processCurrent(g){
  const gw = g.width, gh = g.height;
  g.loadPixels();
  const step = Math.max(2, Math.floor(pixelSize * htSpacing));
  const cols = Math.floor(gw / step);
  const rows = Math.floor(gh / step);
  const grid = new Array(rows).fill(0).map(()=>new Array(cols).fill(0));

  for(let j=0; j<rows; j++){
    for(let i=0; i<cols; i++){
      const cx = Math.floor((i+0.5)*step);
      const cy = Math.floor((j+0.5)*step);
      const idx = 4*(cy*gw + cx);
      const r = g.pixels[idx]||0, gg = g.pixels[idx+1]||0, b = g.pixels[idx+2]||0;
      const y = 0.2126*r + 0.7152*gg + 0.0722*b; // luminância
      grid[j][i] = y; // 0..255
    }
  }
  lastHT = { shape: htShape, angle: htAngle, spacing: htSpacing };
  if(method === 'halftone'){
    // cache for SVG export (halftone uses grid at 'step')
    lastMethod = method;
    lastGrid = grid;
    drawHalftone(grid, gProc, step, htShape, htAngle);
    return;
  }

  // dithers binários usam pixelSize normal (não spacing)
  const cols2 = Math.floor(gw / pixelSize);
  const rows2 = Math.floor(gh / pixelSize);
  const grid2 = new Array(rows2).fill(0).map(()=>new Array(cols2).fill(0));
  for(let j=0; j<rows2; j++){
    for(let i=0; i<cols2; i++){
      const cx = Math.floor((i+0.5)*pixelSize);
      const cy = Math.floor((j+0.5)*pixelSize);
      const idx = 4*(cy*gw + cx);
      const r = g.pixels[idx]||0, gg = g.pixels[idx+1]||0, b = g.pixels[idx+2]||0;
      const y = 0.2126*r + 0.7152*gg + 0.0722*b;
      grid2[j][i] = y;
    }
  }

  let bw = null;

  // cache the post-sampling grid for SVG export and debugging
  lastMethod = method;
  lastGrid = grid2;

  switch(method){
    case 'bitmap': bw = bitmap(grid2, threshold); break;
    case 'stretch': bw = bitmap(grid2, threshold); break;
    case 'fs': bw = errorDiffuse(grid2, threshold, KERNELS["fs"]); break;
    case 'atkinson': bw = errorDiffuse(grid2, threshold, KERNELS["atkinson"]); break;
    case 'jjn': bw = errorDiffuse(grid2, threshold, KERNELS["jjn"]); break;
    case 'stucki': bw = errorDiffuse(grid2, threshold, KERNELS["stucki"]); break;
    case 'bayer2': bw = orderedDither(grid2, Bayer2, threshold); break;
    case 'bayer4': bw = orderedDither(grid2, Bayer4, threshold); break;
    case 'bayer8': bw = orderedDither(grid2, Bayer8, threshold); break;
    case 'cluster4': bw = orderedDither(grid2, Cluster4, threshold); break;
  }
  // cache result for SVG export (ensures FS/Atkinson/JJN/Stucki/Bayer/Cluster match PNG)
  lastBW = bw;
  lastBWMeta = { method, pixelSize, stretchX: (method==='stretch' ? stretchX : 1.0), threshold };

  drawGridToGraphics(bw, gProc, pixelSize, method==='stretch' ? stretchX : 1.0);
}

function bitmap(grid, thr){
  const h = grid.length, w = grid[0].length;
  const out = Array.from({length:h}, ()=>Array(w).fill(0));
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      out[y][x] = grid[y][x] < thr ? 0 : 255;
    }
  }
  return out;
}

function orderedDither(grid, mat, thr){
  const h = grid.length, w = grid[0].length;
  const n = mat.length;
  const maxv = n*n - 1;
  const out = Array.from({length:h}, ()=>Array(w).fill(0));
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const t = ((mat[y % n][x % n] + 0.5) * (255 / (maxv+1)));
      const v = grid[y][x] + (t - 128);
      out[y][x] = v < thr ? 0 : 255;
    }
  }
  return out;
}

function errorDiffuse(grid, thr, kernel){
  const h = grid.length, w = grid[0].length;
  const out = Array.from({length:h}, ()=>Array(w).fill(0));
  const g = grid.map(row=>row.slice());
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const old = g[y][x];
      const newVal = old < thr ? 0 : 255;
      const err = old - newVal;
      out[y][x] = newVal;
      for(const k of kernel.spread){
        const nx = x + k.dx, ny = y + k.dy;
        if(nx>=0 && nx<w && ny>=0 && ny<h){
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
  // fundo
  gfx.noStroke();
  gfx.fill(bgColor);
  gfx.rect(0,0,gfx.width,gfx.height);
  // pixels (fg)
  gfx.fill(fgColor);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      if(bw[y][x]===0){
        gfx.rect(x*pw, y*ph, pw, ph);
      }
    }
  }
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
  // fundo
  gfx.fill(bgColor);
  gfx.rect(0,0,gfx.width,gfx.height);
  // elementos
  gfx.fill(fgColor);

  for(let j=0;j<h;j++){
    for(let i=0;i<w;i++){
      const Y = grid[j][i] / 255;         // 0..1
      const val = Math.pow(1 - Y, gamma); // intensidade (0..1)
      const cx = i*step + half;
      const cy = j*step + half;

      gfx.push();
      gfx.translate(cx, cy);
      if(shape !== 'dots' && ang !== 0) gfx.rotate(ang);

      if(shape === 'dots'){
        const r = half * val;
        if(r > 0.05) gfx.circle(0, 0, 2*r);
      }else if(shape === 'squares'){
        const s = step * val;
        if(s > 0.05) gfx.rect(-s/2, -s/2, s, s);
      }else if(shape === 'lines'){
        const thickness = step * val;   // espessura da linha
        const length = step * 1.1;      // um pouquinho maior pra evitar gaps
        if(thickness > 0.05) gfx.rect(-length/2, -thickness/2, length, thickness);
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
  if(srcImg){ w = srcImg.width; h = srcImg.height; }
  if(srcVideo){ w = srcVideo.width || 1280; h = srcVideo.height || 720; }
  const fit = fitRect(w, h, windowWidth, windowHeight);
  gSrc.resizeCanvas(Math.max(320, fit.w), Math.max(320, fit.h));
  gProc.resizeCanvas(Math.max(320, fit.w), Math.max(320, fit.h));
  if(srcImg) processAll();
}

// SVG export (respeita cores e halftone shapes/ângulo/espaçamento)
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

  if(lastMethod === 'halftone' && lastGrid){
    for(let j=0;j<lastGrid.length;j++){
      for(let i=0;i<lastGrid[0].length;i++){
        const Y = lastGrid[j][i] / 255;
        const val = Math.pow(1 - Y, gamma);
        const cx = i*baseStep + half;
        const cy = j*baseStep + half;

        if(lastHT.shape === 'dots'){
          const r = half * val;
          if(r > 0.05) svg += `<circle cx="${cx}" cy="${cy}" r="${r}"/>\n`;
        }else if(lastHT.shape === 'squares'){
          const s = baseStep * val;
          if(s > 0.05){
            if(lastHT.angle !== 0){
              svg += `<rect x="${-s/2}" y="${-s/2}" width="${s}" height="${s}" transform="translate(${cx} ${cy}) rotate(${angDeg})"/>\n`;
            }else{
              svg += `<rect x="${cx - s/2}" y="${cy - s/2}" width="${s}" height="${s}"/>\n`;
            }
          }
        }else if(lastHT.shape === 'lines'){
          const thickness = baseStep * val;
          const length = baseStep * 1.1;
          if(thickness > 0.05){
            svg += `<rect x="${-length/2}" y="${-thickness/2}" width="${length}" height="${thickness}" transform="translate(${cx} ${cy}) rotate(${angDeg})"/>\n`;
          }
        }
      }
    }
  }else if(lastGrid){
    // métodos binários
    const cols = lastGrid[0].length;
    const rows = lastGrid.length;
    const bw = (lastBW && lastBWMeta && lastBWMeta.method===lastMethod) ? lastBW : bitmap(lastGrid, threshold);
    const pw = pixelSize, ph = pixelSize;
    const sx = (lastMethod==='stretch') ? stretchX : 1.0;
    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++){
        if(bw[y][x]===0){
          svg += `<rect x="${x*pw*sx}" y="${y*ph}" width="${pw*sx}" height="${ph}"/>\n`;
        }
      }
    }
  }

  svg += `</g>\n</svg>`;
  const blob = new Blob([svg], {type:"image/svg+xml"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'bitmap-dither.svg';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

/* =========================
   Gravação do Canvas (.webm)
   ========================= */
function pickMimeType(){
  const cands = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  for(const t of cands){
    try{
      if(typeof MediaRecorder!=='undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
    }catch(_){}
  }
  return '';
}

function startRecording(){
  if(isRecording) return;
  try{
    gSrc.remove(); gProc.remove(); gSrc = createGraphics(exportW, exportH); gProc = createGraphics(exportW, exportH);
  resizeCanvas(exportW, exportH); const stream = canvas.elt.captureStream(30); // 30 fps
    if(srcVideo && srcVideo.elt && typeof srcVideo.elt.captureStream === 'function'){
      try{
        const vstream = srcVideo.elt.captureStream();
        const audioTracks = vstream.getAudioTracks();
        if(audioTracks && audioTracks.length){
          stream.addTrack(audioTracks[0]);
        }
      }catch(err){ console.warn('Não foi possível anexar o áudio do vídeo.', err); }
    }
    const mimeType = pickMimeType();
    const opts = mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : { videoBitsPerSecond: 6_000_000 };
    mediaRecorder = new MediaRecorder(stream, opts);
    recordedChunks = [];
    mediaRecorder.ondataavailable = e => { if(e.data && e.data.size>0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = saveRecording;
    mediaRecorder.start(200);
    if(!srcVideo) loop();
    isRecording = true;
    const btn = null;
    
  }catch(err){
    alert('Falha ao iniciar gravação. Seu navegador suporta MediaRecorder/WebM?\n' + err);
  }
}

function stopRecording(){
  if(!isRecording) return;
  try{ mediaRecorder.stop(); }catch(err){ console.warn('Erro ao parar recorder', err); }
  isRecording = false;
  const btn = null;
  
  if(!srcVideo) noLoop();

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
  setTimeout(()=>{
    URL.revokeObjectURL(url);
    a.remove();
  }, 200);

  try{
    gSrc.remove(); gProc.remove();
  }catch(e){}
  gSrc = createGraphics(1280, 720);
  gProc = createGraphics(1280, 720);
  // canvas will be resized back by fitToCanvas on windowResized or manually


}


async function renderAtSizeAndDo(w, h, action){
  // cria buffers temporários e processa nesta resolução
  const prev_gSrc = gSrc, prev_gProc = gProc;
  const prev_lastGrid = lastGrid, prev_lastMethod = lastMethod, prev_lastHT = lastHT;

  const tmpSrc = createGraphics(w, h);
  const tmpProc = createGraphics(w, h);
  gSrc = tmpSrc;
  gProc = tmpProc;

  if(srcImg){
    tmpSrc.push(); tmpSrc.clear();
    const fit = fitRect(srcImg.width, srcImg.height, w, h);
    tmpSrc.image(srcImg, fit.x, fit.y, fit.w, fit.h);
    tmpSrc.pop();
    processCurrent(tmpSrc);
  }else if(srcVideo){
    tmpSrc.push(); tmpSrc.clear();
    tmpSrc.image(srcVideo, 0, 0, w, h);
    tmpSrc.pop();
    processCurrent(tmpSrc);
  }else{
    // nada carregado => apenas background com bgColor
    tmpProc.push(); tmpProc.clear(); tmpProc.background(bgColor); tmpProc.pop();
  }

  await action({w, h, g: tmpProc});

  // limpa temporários e restaura
  tmpSrc.remove();
  tmpProc.remove();
  gSrc = prev_gSrc;
  gProc = prev_gProc;
  lastGrid = prev_lastGrid;
  lastMethod = prev_lastMethod;
  lastHT = prev_lastHT;
}

function savePNG(){
  renderAtSizeAndDo(exportW, exportH, ({w,h,g})=>{
    return new Promise((resolve)=>{
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(g.elt, 0, 0, w, h);
      c.toBlob((blob)=>{
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
  // Se o tamanho desejado difere do buffer atual, reprocessa antes de salvar
  if(gProc.width !== exportW || gProc.height !== exportH){
    renderAtSizeAndDo(exportW, exportH, ()=>{ _saveSVG_do(); return Promise.resolve(); });
    return;
  }
  _saveSVG_do();
}