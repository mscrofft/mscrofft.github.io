// INTL5bTypeGrid — Presets + Sequencer + Color Modes + Export PNG/SVG
// p5.js + dat.GUI (+ p5.svg addon loaded in index.html)
//
// Added:
// - Gradient in typography
// - Color by row / by column
// - Animated interpolation between two colors
// - Auto palette mode (5-color palettes with optional shifting)
// - Save PNG (high-res offscreen render)
// - Save SVG (vector via p5.svg)

let ui = null;
let gui = null;
let guiCtrls = {};

let unitCount = 0;
let rowCount = 10;

let waveSize = 20, waveLength = 0.5, waveOffset = 0.5, waveSpeed = 0.05;

let txt = "HELLO WORLD";
let xSpace = 40, ySpace = 40;

let bkgdColor = "#0F52BF";
let foreColor = "#FFFFFF";

const FONT_SANS = "Roboto";
const FONT_MONO = "Space Mono";
let uploadedFont = null;
let uploadedOTFont = null; // opentype.js font (for SVG paths)
let recorder = null;
let recordChunks = [];
let recordStream = null;

// ---------- Color palettes ----------
const PALETTES = {
  "Warm Pop": ["#FF6B6B","#FFE66D","#4472CA","#4ECDC4","#222831"],
  "Violet Sand": ["#6A0572","#AB83A1","#EDE6DB","#F9F9F9","#333333"],
  "Ocean Mint": ["#05668D","#028090","#00A896","#02C39A","#F0F3BD"],
  "Sunset Mix": ["#FFD166","#EF476F","#06D6A0","#118AB2","#073B4C"],
  "Modern Jewel": ["#8E44AD","#2980B9","#27AE60","#F39C12","#2C3E50"],
};

// ---------- Animation presets + sequencer ----------
const ANIM_PRESETS = {
  "Calm Sweep":   { rowCount:10, xSpace:42, ySpace:42, waveSize:20, waveLength:0.45, waveOffset:0.55, waveSpeed:0.025 },
  "Breathing":    { rowCount:9,  xSpace:46, ySpace:46, waveSize:28, waveLength:0.85, waveOffset:0.90, waveSpeed:0.015 },
  "Ripple Fast":  { rowCount:12, xSpace:32, ySpace:32, waveSize:14, waveLength:1.65, waveOffset:0.65, waveSpeed:0.110 },
  "Slant Drift":  { rowCount:14, xSpace:28, ySpace:34, waveSize:22, waveLength:1.10, waveOffset:1.55, waveSpeed:0.050 },
  "Liquid Curtain":{rowCount:18, xSpace:22, ySpace:24, waveSize:36, waveLength:0.60, waveOffset:0.35, waveSpeed:0.030 },
  "Optical Shimmer":{rowCount:22, xSpace:18, ySpace:18, waveSize:10, waveLength:1.90, waveOffset:1.15, waveSpeed:0.140 },
  "Big Ocean":    { rowCount:7,  xSpace:60, ySpace:60, waveSize:120,waveLength:0.22, waveOffset:0.40, waveSpeed:0.010 },
  "Strobe Warp":  { rowCount:16, xSpace:24, ySpace:24, waveSize:48, waveLength:2.00, waveOffset:0.10, waveSpeed:0.180 },
};

let seq = {
  enabled: false,
  order: Object.keys(ANIM_PRESETS),
  idx: 0,
  phase: "hold", // hold | morph
  tStart: 0,
  from: null,
  to: null,
  holdSec: 2.0,
  morphSec: 1.2,
  ease: "inOutCubic", // linear | inOutSine | inOutCubic
  shuffle: false,
};

function _ease(t){
  t = constrain(t, 0, 1);
  if(seq.ease === "linear") return t;
  if(seq.ease === "inOutSine") return -(cos(PI*t)-1)/2;
  return t < 0.5 ? 4*t*t*t : 1 - pow(-2*t+2, 3)/2;
}

function _getPreset(name){
  return ANIM_PRESETS[name] ? JSON.parse(JSON.stringify(ANIM_PRESETS[name])) : null;
}

function applyPreset(name, {syncGUI=true} = {}){
  const p = _getPreset(name);
  if(!p || !ui) return;

  ui.rowCount = p.rowCount;
  ui.xSpace = p.xSpace;
  ui.ySpace = p.ySpace;
  ui.waveSize = p.waveSize;
  ui.waveLength = p.waveLength;
  ui.waveOffset = p.waveOffset;
  ui.waveSpeed = p.waveSpeed;

  if(syncGUI && guiCtrls){
    guiCtrls.rowCount?.setValue(ui.rowCount);
    guiCtrls.xSpace?.setValue(ui.xSpace);
    guiCtrls.ySpace?.setValue(ui.ySpace);
    guiCtrls.waveSize?.setValue(ui.waveSize);
    guiCtrls.waveLength?.setValue(ui.waveLength);
    guiCtrls.waveOffset?.setValue(ui.waveOffset);
    guiCtrls.waveSpeed?.setValue(ui.waveSpeed);
  }
}

function startSequencer(){
  if(!ui) return;
  seq.enabled = true;
  seq.phase = "hold";
  seq.tStart = millis();
  seq.order = Object.keys(ANIM_PRESETS);
  if(seq.shuffle) seq.order = shuffle(seq.order, true);
  seq.idx = 0;

  const name = seq.order[seq.idx];
  ui.preset = name;
  if(guiCtrls.preset) guiCtrls.preset.setValue(name);
  applyPreset(name, {syncGUI:true});
}

function stopSequencer(){ seq.enabled = false; }

function nextPreset(){
  const n = seq.order.length;
  if(n === 0 || !ui) return;
  seq.idx = (seq.idx + 1) % n;
  const name = seq.order[seq.idx];
  ui.preset = name;
  if(guiCtrls.preset) guiCtrls.preset.setValue(name);
  applyPreset(name, {syncGUI:true});
  seq.phase = "hold";
  seq.tStart = millis();
}

function prevPreset(){
  const n = seq.order.length;
  if(n === 0 || !ui) return;
  seq.idx = (seq.idx - 1 + n) % n;
  const name = seq.order[seq.idx];
  ui.preset = name;
  if(guiCtrls.preset) guiCtrls.preset.setValue(name);
  applyPreset(name, {syncGUI:true});
  seq.phase = "hold";
  seq.tStart = millis();
}

function updateSequencer(){
  if(!seq.enabled || !ui) return;

  const now = millis();
  const elapsed = (now - seq.tStart) / 1000.0;

  if(seq.phase === "hold"){
    if(elapsed >= seq.holdSec){
      const n = seq.order.length;
      if(n === 0) return;
      const fromName = seq.order[seq.idx];
      const toIdx = (seq.idx + 1) % n;
      const toName = seq.order[toIdx];
      seq.from = _getPreset(fromName);
      seq.to = _getPreset(toName);
      seq.phase = "morph";
      seq.tStart = now;
    }
    return;
  }

  const t = elapsed / max(0.0001, seq.morphSec);
  const k = _ease(t);

  const a = seq.from, b = seq.to;
  if(a && b){
    ui.rowCount = round(lerp(a.rowCount, b.rowCount, k));
    ui.xSpace   = lerp(a.xSpace, b.xSpace, k);
    ui.ySpace   = lerp(a.ySpace, b.ySpace, k);
    ui.waveSize = lerp(a.waveSize, b.waveSize, k);
    ui.waveLength = lerp(a.waveLength, b.waveLength, k);
    ui.waveOffset = lerp(a.waveOffset, b.waveOffset, k);
    ui.waveSpeed  = lerp(a.waveSpeed, b.waveSpeed, k);
  }

  if(t >= 1){
    seq.idx = (seq.idx + 1) % max(1, seq.order.length);
    const name = seq.order[seq.idx];
    ui.preset = name;
    applyPreset(name, {syncGUI:false});
    seq.phase = "hold";
    seq.tStart = now;
  }
}

// ---------- Color engine ----------
function _paletteArray(){
  const key = ui?.paletteName || Object.keys(PALETTES)[0];
  return PALETTES[key] || Object.values(PALETTES)[0];
}

function _paletteIndex(i, j){
  const pal = _paletteArray();
  const n = pal.length;

  const shift = (ui?.paletteShiftSpeed || 0) > 0 ? floor(frameCount * ui.paletteShiftSpeed) : 0;
  const strat = ui?.paletteStrategy || "By Char";

  let idx = 0;
  if(strat === "By Row") idx = j;
  else if(strat === "By Col") idx = i;
  else idx = i + j; // By Char
  idx = (idx + shift) % n;
  if(idx < 0) idx += n;
  return pal[idx];
}

function computeGlyphColor(i, j, cols, rows, gx, gy, gridW, gridH){
  const mode = ui?.colorMode || "Solid";

  if(mode === "Solid"){
    return color(ui.foreColor);
  }

  if(mode === "Animated Lerp"){
    const spd = ui?.colorAnimSpeed ?? 0.02;
    const t = (sin(frameCount * spd) + 1) * 0.5;
    return lerpColor(color(ui.colorA), color(ui.colorB), t);
  }

  if(mode === "By Row"){
    const t = rows <= 1 ? 0 : j / (rows - 1);
    return lerpColor(color(ui.colorA), color(ui.colorB), t);
  }

  if(mode === "By Column"){
    const t = cols <= 1 ? 0 : i / (cols - 1);
    return lerpColor(color(ui.colorA), color(ui.colorB), t);
  }

  if(mode === "Gradient"){
    const ang = radians(ui.gradientAngle || 0);
    const vx = cos(ang), vy = sin(ang);
    const nx = gx / max(1e-6, gridW);
    const ny = gy / max(1e-6, gridH);
    const dx = nx - 0.5;
    const dy = ny - 0.5;
    const proj = dx*vx + dy*vy;
    const t = constrain(proj + 0.5, 0, 1);
    return lerpColor(color(ui.colorA), color(ui.colorB), t);
  }

  if(mode === "Auto Palette"){
    return color(_paletteIndex(i, j));
  }

  return color(ui.foreColor);
}



function translateOTPath(path, dx, dy){
  // path: opentype.Path
  if(!path || !path.commands) return path;
  for(const cmd of path.commands){
    if(cmd.x !== undefined) cmd.x += dx;
    if(cmd.y !== undefined) cmd.y += dy;
    if(cmd.x1 !== undefined) cmd.x1 += dx;
    if(cmd.y1 !== undefined) cmd.y1 += dy;
    if(cmd.x2 !== undefined) cmd.x2 += dx;
    if(cmd.y2 !== undefined) cmd.y2 += dy;
  }
  return path;
}

function pathToData(path){
  // opentype.Path -> SVG d string
  if(!path) return "";
  return path.toPathData ? path.toPathData(5) : (path.commands ? opentype.Path.prototype.toPathData.call(path, 5) : "");
}

function recordStart(){
  try{
    if(recorder && recorder.state !== "inactive") return;
    const fps = ui.recordFPS || 30;
    const canvasEl = document.querySelector("canvas");
    if(!canvasEl) return alert("Canvas não encontrado.");
    recordStream = canvasEl.captureStream(fps);
    recordChunks = [];
    const opts = {};
    // try preferred codecs
    const candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ];
    for(const c of candidates){
      if(window.MediaRecorder && MediaRecorder.isTypeSupported(c)){
        opts.mimeType = c;
        break;
      }
    }
    if(ui.recordBitrate && ui.recordBitrate > 0){
      opts.videoBitsPerSecond = Math.floor(ui.recordBitrate * 1000000);
    }
    recorder = new MediaRecorder(recordStream, opts);
    recorder.ondataavailable = (e)=>{ if(e.data && e.data.size>0) recordChunks.push(e.data); };
    recorder.onstop = ()=>{
      const blob = new Blob(recordChunks, { type: recorder.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g,"-");
      const a = document.createElement("a");
      a.download = `TypeGrid_${stamp}.webm`;
      a.href = url;
      a.style.display="none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url), 1500);
      recordChunks = [];
      recordStream = null;
    };
    recorder.start();
    ui.isRecording = true;
    if(guiCtrls.isRecording) guiCtrls.isRecording.setValue(true);
  }catch(err){
    console.warn(err);
    alert("Record falhou (MediaRecorder indisponível?).");
  }
}

function recordStop(){
  try{
    if(!recorder) return;
    if(recorder.state !== "inactive"){
      recorder.stop();
    }
    ui.isRecording = false;
    if(guiCtrls.isRecording) guiCtrls.isRecording.setValue(false);
  }catch(err){
    console.warn(err);
  }
}

function escapeXml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

function colorToHex(c){
  const r = Math.round(red(c));
  const g = Math.round(green(c));
  const b = Math.round(blue(c));
  const to2 = (n)=> n.toString(16).padStart(2,"0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

// ---------- Rendering ----------
function renderTo(g){
  g.background(ui.bkgdColor);

  let f;
  if(ui.fontFamily === "Uploaded" && uploadedFont){
    f = uploadedFont;
  }else if(ui.fontFamily === "Space Mono"){
    f = FONT_MONO;
  }else{
    f = FONT_SANS;
  }

  const cols = unitCount;
  const rows = max(0, ui.rowCount);

  // Gradient bounding box (grid-local)
  const gridW = max(1, (cols-1) * ui.xSpace);
  const gridH = max(1, (rows-1) * ui.ySpace);

  g.push();
  g.translate(g.width/2, g.height/2);
  g.translate(-(cols-1)*ui.xSpace/2, -(rows-1)*ui.ySpace/2);

  g.textAlign(CENTER, CENTER);
  g.textFont(f);
  g.textSize(ui.fontSize);
  g.noStroke();

  for(let j=0; j<rows; j++){
    for(let i=0; i<cols; i++){
      const t = frameCount * ui.waveSpeed;
      const waveY = sin(i*ui.waveLength + j*ui.waveOffset + t) * ui.waveSize;
      const waveX = cos(i*ui.waveLength + j*ui.waveOffset + t) * ui.waveSize;

      const gx = i*ui.xSpace + waveX;
      const gy = j*ui.ySpace + waveY;

      const c = computeGlyphColor(i, j, cols, rows, gx, gy, gridW, gridH);
      g.fill(c);
      g.text((ui.text || "").charAt(i), gx, gy);
    }
  }

  g.pop();
}


function applyExportPreset(name){
  if(!ui) return;
  const presets = {
    "Story 1080×1920": { w:1080, h:1920 },
    "HD 1920×1080": { w:1920, h:1080 },
    "4K 3840×2160": { w:3840, h:2160 },
    "Custom": null
  };
  const p = presets[name] || presets["Custom"];
  if(p){
    ui.exportW = p.w;
    ui.exportH = p.h;
    // sync GUI controllers if they exist
    if(guiCtrls.exportW) guiCtrls.exportW.setValue(ui.exportW);
    if(guiCtrls.exportH) guiCtrls.exportH.setValue(ui.exportH);
  }
}

// ---------- Export ----------
function exportPNG(){
  const w = ui.exportW;
  const h = ui.exportH;
  const pg = createGraphics(w, h);
  pg.pixelDensity(1);
  // Render at current animation frame; if you want a still, pause animation before exporting.
  renderTo(pg);

  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g,"-");
  a.download = `TypeGrid_${stamp}.png`;
  a.href = pg.elt.toDataURL("image/png");
  a.click();
  pg.remove();
}

function exportSVG(){
  const w = ui.exportW;
  const h = ui.exportH;
  const stamp = new Date().toISOString().replace(/[:.]/g,"-");
  const filename = `TypeGrid_${stamp}.svg`;

  const cols = unitCount;
  const rows = Math.max(0, ui.rowCount);

  const gridW = Math.max(1, (cols-1) * ui.xSpace);
  const gridH = Math.max(1, (rows-1) * ui.ySpace);

  const baseX = (w/2) - (cols-1)*ui.xSpace/2;
  const baseY = (h/2) - (rows-1)*ui.ySpace/2;

  let svg = [];
  svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);
  svg.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="${ui.bkgdColor}"/>`);

  const usePaths = !!ui.svgAsPaths && !!uploadedOTFont;

  if(usePaths){
    // Convert each glyph to <path> using opentype.js (requires uploaded font)
    svg.push(`<g fill="none" stroke="none">`);
    for(let j=0; j<rows; j++){
      for(let i=0; i<cols; i++){
        const t = frameCount * ui.waveSpeed;
        const waveY = Math.sin(i*ui.waveLength + j*ui.waveOffset + t) * ui.waveSize;
        const waveX = Math.cos(i*ui.waveLength + j*ui.waveOffset + t) * ui.waveSize;

        const gx = i*ui.xSpace + waveX;
        const gy = j*ui.ySpace + waveY;

        const c = computeGlyphColor(i, j, cols, rows, gx, gy, gridW, gridH);
        const fillHex = colorToHex(c);

        const ch = (ui.text || "").charAt(i) || "";
        if(!ch.trim()) continue;

        // Build path at origin, then center it on desired x/y
        let p;
        try{
          p = uploadedOTFont.getPath(ch, 0, 0, ui.fontSize);
        }catch(e){
          continue;
        }
        const bb = p.getBoundingBox();
        const cx = (bb.x1 + bb.x2) * 0.5;
        const cy = (bb.y1 + bb.y2) * 0.5;

        const x = baseX + gx;
        const y = baseY + gy;

        translateOTPath(p, x - cx, y - cy);
        const d = pathToData(p);
        if(!d) continue;

        svg.push(`<path d="${d}" fill="${fillHex}"/>`);
      }
    }
    svg.push(`</g>`);
  }else{
    // Fallback: export as <text> (depends on installed font)
    const fontFamily = (ui.fontFamily === "Space Mono") ? "Space Mono" : (ui.fontFamily === "Roboto" ? "Roboto" : "sans-serif");
    svg.push(`<g font-family="${escapeXml(fontFamily)}" font-size="${ui.fontSize}" text-anchor="middle" dominant-baseline="middle">`);
    for(let j=0; j<rows; j++){
      for(let i=0; i<cols; i++){
        const t = frameCount * ui.waveSpeed;
        const waveY = Math.sin(i*ui.waveLength + j*ui.waveOffset + t) * ui.waveSize;
        const waveX = Math.cos(i*ui.waveLength + j*ui.waveOffset + t) * ui.waveSize;

        const gx = i*ui.xSpace + waveX;
        const gy = j*ui.ySpace + waveY;

        const c = computeGlyphColor(i, j, cols, rows, gx, gy, gridW, gridH);
        const fillHex = colorToHex(c);

        const ch = (ui.text || "").charAt(i) || "";
        if(!ch) continue;

        const x = baseX + gx;
        const y = baseY + gy;

        svg.push(`<text x="${x.toFixed(3)}" y="${y.toFixed(3)}" fill="${fillHex}">${escapeXml(ch)}</text>`);
      }
    }
    svg.push(`</g>`);
  }

  svg.push(`</svg>`);

  const blob = new Blob([svg.join("\n")], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.download = filename;
  a.href = url;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);

  if(ui.svgAsPaths && !uploadedOTFont){
    // gentle notice
    console.warn("SVG as paths requer upload de fonte (TTF/OTF) para gerar contornos.");
  }
}

// ---------- p5 ----------
function setup(){
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  ui = {
    // text/typography
    text: txt,
    fontFamily: "Roboto", // Roboto | Space Mono | Uploaded
    fontSize: 24,
    uploadFont: ()=>{ const inp=document.getElementById("fontInputHidden"); if(inp) inp.click(); },

    // layout
    rowCount: rowCount,
    xSpace: xSpace,
    ySpace: ySpace,

    // wave
    waveSize: waveSize,
    waveLength: waveLength,
    waveOffset: waveOffset,
    waveSpeed: waveSpeed,

    // background / solid font
    bkgdColor: bkgdColor,
    foreColor: foreColor,

    // color modes
    colorMode: "Solid", // Solid | Gradient | By Row | By Column | Animated Lerp | Auto Palette
    colorA: "#FFFFFF",
    colorB: "#00E5FF",
    gradientAngle: 0,
    colorAnimSpeed: 0.02,

    paletteName: Object.keys(PALETTES)[0],
    paletteStrategy: "By Char", // By Char | By Row | By Col
    paletteShiftSpeed: 0.0,

    // exports
    exportPreset: "Story 1080×1920",
    exportW: 1080,
    exportH: 1920,
    applyExportPreset: ()=>applyExportPreset(ui.exportPreset),
    svgAsPaths: true,
    savePNG: ()=>exportPNG(),
    saveSVG: ()=>exportSVG(),

    // recording
    isRecording: false,
    recordFPS: 30,
    recordBitrate: 8, // Mbps
    recordStart: ()=>recordStart(),
    recordStop: ()=>recordStop(),

    // presets / sequencer
    preset: "Calm Sweep",
    applyPreset: ()=>{ stopSequencer(); applyPreset(ui.preset, {syncGUI:true}); },
    autoPlay: false,
    holdSec: 2.0,
    morphSec: 1.2,
    ease: "inOutCubic",
    shuffle: false,
    prevPreset: ()=>{ stopSequencer(); prevPreset(); },
    nextPreset: ()=>{ stopSequencer(); nextPreset(); },
    startAuto: ()=>{ seq.holdSec=ui.holdSec; seq.morphSec=ui.morphSec; seq.ease=ui.ease; seq.shuffle=ui.shuffle; startSequencer(); },
    stopAuto: ()=>{ stopSequencer(); },
  };

  initDatGUI();
  wireFontUpload();
  applyPreset(ui.preset, {syncGUI:true});
}

function draw(){
  updateSequencer();

  txt = ui.text || "";
  unitCount = txt.length;

  renderTo(this);
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
}

// ---------- dat.GUI ----------
function initDatGUI(){
  if(!window.dat || !dat.GUI) return;
  if(gui){ gui.destroy(); gui = null; }
  gui = new dat.GUI();

  const fTxt = gui.addFolder("Texto");
  fTxt.add(ui, "text").name("String");
  guiCtrls.fontFamily = fTxt.add(ui, "fontFamily", {
    "Roboto": "Roboto",
    "Space Mono": "Space Mono",
    "Uploaded": "Uploaded"
  }).name("Fonte");
  fTxt.add(ui, "uploadFont").name("Upload fonte…");
  fTxt.add(ui, "fontSize", 6, 240, 1).name("Tamanho");
  guiCtrls.rowCount = fTxt.add(ui, "rowCount", 0, 60, 1).name("Row Count").listen();
  guiCtrls.xSpace = fTxt.add(ui, "xSpace", 5, 240, 1).name("X Space").listen();
  guiCtrls.ySpace = fTxt.add(ui, "ySpace", 5, 240, 1).name("Y Space").listen();
  fTxt.open();

  const fWave = gui.addFolder("Wave");
  guiCtrls.waveSize = fWave.add(ui, "waveSize", 0, 300, 1).name("Size").listen();
  guiCtrls.waveLength = fWave.add(ui, "waveLength", 0, 2, 0.01).name("Length").listen();
  guiCtrls.waveOffset = fWave.add(ui, "waveOffset", 0, 2, 0.01).name("Offset").listen();
  guiCtrls.waveSpeed = fWave.add(ui, "waveSpeed", 0, 0.2, 0.005).name("Speed").listen();
  fWave.open();

  const fSeq = gui.addFolder("Presets / Sequencer");
  guiCtrls.preset = fSeq.add(ui, "preset", Object.keys(ANIM_PRESETS)).name("Preset");
  fSeq.add(ui, "applyPreset").name("Aplicar preset");
  fSeq.add(ui, "autoPlay").name("Auto-play").onChange(v=>{
    if(v){ ui.startAuto(); } else { ui.stopAuto(); }
  });
  fSeq.add(ui, "holdSec", 0, 10, 0.1).name("Hold (s)").onChange(v=>{ ui.holdSec=v; if(seq.enabled) seq.holdSec=v; });
  fSeq.add(ui, "morphSec", 0.1, 10, 0.1).name("Morph (s)").onChange(v=>{ ui.morphSec=v; if(seq.enabled) seq.morphSec=v; });
  fSeq.add(ui, "ease", ["linear","inOutSine","inOutCubic"]).name("Ease").onChange(v=>{ ui.ease=v; if(seq.enabled) seq.ease=v; });
  fSeq.add(ui, "shuffle").name("Shuffle").onChange(v=>{ ui.shuffle=!!v; if(seq.enabled) seq.shuffle=!!v; });
  fSeq.add(ui, "prevPreset").name("◀ Prev");
  fSeq.add(ui, "nextPreset").name("Next ▶");
  fSeq.open();

  const fCol = gui.addFolder("Cores");
  fCol.addColor(ui, "bkgdColor").name("Background");
  fCol.addColor(ui, "foreColor").name("Font (solid)");
  const modeCtrl = fCol.add(ui, "colorMode", ["Solid","Gradient","By Row","By Column","Animated Lerp","Auto Palette"]).name("Mode");
  const ca = fCol.addColor(ui, "colorA").name("Color A");
  const cb = fCol.addColor(ui, "colorB").name("Color B");
  const ang = fCol.add(ui, "gradientAngle", 0, 360, 1).name("Grad angle");
  const spd = fCol.add(ui, "colorAnimSpeed", 0.0, 0.2, 0.001).name("Anim speed");

  const fPal = fCol.addFolder("Palette Auto");
  const palName = fPal.add(ui, "paletteName", Object.keys(PALETTES)).name("Palette");
  const palStrat = fPal.add(ui, "paletteStrategy", ["By Char","By Row","By Col"]).name("Strategy");
  const palShift = fPal.add(ui, "paletteShiftSpeed", 0.0, 0.2, 0.001).name("Shift spd");
  fPal.open();

  function setDisplay(controller, show){
    controller.domElement.parentElement.style.display = show ? "" : "none";
  }
  function refreshColorUI(){
    const m = ui.colorMode;
    const showAB = (m !== "Solid" && m !== "Auto Palette");
    const showAngle = (m === "Gradient");
    const showSpd = (m === "Animated Lerp");
    const showPal = (m === "Auto Palette");

    setDisplay(ca, showAB);
    setDisplay(cb, showAB);
    setDisplay(ang, showAngle);
    setDisplay(spd, showSpd);
    fPal.domElement.style.display = showPal ? "" : "none";
  }
  modeCtrl.onChange(refreshColorUI);
  refreshColorUI();

  fCol.open();

  const fExp = gui.addFolder("Export");
  guiCtrls.exportPreset = fExp.add(ui, "exportPreset", ["Story 1080×1920","HD 1920×1080","4K 3840×2160","Custom"]).name("Preset")
    .onChange((v)=>{ applyExportPreset(v); });
  fExp.add(ui, "applyExportPreset").name("Aplicar preset");
  guiCtrls.exportW = fExp.add(ui, "exportW", 100, 6000, 10).name("W");
  guiCtrls.exportH = fExp.add(ui, "exportH", 100, 6000, 10).name("H");
  fExp.add(ui, "svgAsPaths").name("SVG: texto→path");
  fExp.add(ui, "savePNG").name("Salvar PNG");
  fExp.add(ui, "saveSVG").name("Salvar SVG");
  fExp.open();

  const fRec = gui.addFolder("Record");
  guiCtrls.isRecording = fRec.add(ui, "isRecording").name("Recording").listen();
  fRec.add(ui, "recordFPS", 10, 60, 1).name("FPS");
  fRec.add(ui, "recordBitrate", 1, 30, 1).name("Bitrate (Mbps)");
  fRec.add(ui, "recordStart").name("Start");
  fRec.add(ui, "recordStop").name("Stop");
  fRec.open();
}

// ---------- Font upload ----------
function wireFontUpload(){
  const finp = document.getElementById("fontInputHidden");
  if(!finp) return;

  finp.addEventListener("change", (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f) return;

    const reader = new FileReader();
    reader.onload = (ev)=>{
      loadFont(ev.target.result, (ff)=>{
        uploadedFont = ff;
        ui.fontFamily = "Uploaded";
        if(guiCtrls.fontFamily) guiCtrls.fontFamily.setValue("Uploaded");
      }, (err)=>{
        console.warn("loadFont failed", err);
      });
    };
    reader.readAsDataURL(f);

    // Also parse font outlines for SVG path export (TTF/OTF best)
    const r2 = new FileReader();
    r2.onload = (ev2)=>{
      try{
        if(window.opentype){
          uploadedOTFont = opentype.parse(ev2.target.result);
        }
      }catch(e){
        console.warn('opentype parse failed', e);
        uploadedOTFont = null;
      }
    };
    r2.readAsArrayBuffer(f);

    finp.value = "";
  });
}
