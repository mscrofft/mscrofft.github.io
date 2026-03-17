// Grid Painter v9.5 FULL — v9.3 + rotação de módulo (slider + MIDI CC25) + export com rotação
let cellSize = 50;
let cols, rows;
let grid = [];
let rotate90 = false;
let showGrid = true;
let mode = 'paint';

// Forma
let shapeType = 'square';
let customSvgText = null;
let customViewBox = null; // {minx, miny, w, h}
let customImgBlack = null; // p5.Image
let customReady = false;

// Rotação do módulo (global, múltiplos de 90°)
let moduleAngleDeg = 0;

// Cursor MIDI 2D
let curCol = 0, curRow = 0;

// MIDI mapping
let lastMidiMsg = '';
let ccState = {};
const MAP_KEY = 'gridPainterMidiMapV10';
let midiMap = { ccCol:20, ccRow:21, ccMode:22, ccSize:23, ccRotate:24, ccModAngle:25 };

function loadMidiMap(){ try{ const raw = localStorage.getItem(MAP_KEY); if(raw) midiMap = Object.assign(midiMap, JSON.parse(raw)); else saveMidiMap(); }catch(e){} }
function saveMidiMap(){ try{ localStorage.setItem(MAP_KEY, JSON.stringify(midiMap)); }catch(e){} }

function setup(){
  const cnv = createCanvas(1080,1080);
  cnv.parent(document.body);
  initGrid();
  loadMidiMap();
  initDatGUI();
  reflectMappingEcho();
  initMIDI();
}

function setupUI(){ /* UI replaced by dat.GUI */ }

// --- dat.GUI ---
let gui = null;
let ctrls = {};
let guiState = {
  format: "1080x1080",
  cellSize: cellSize,
  rotate45: rotate90,
  showGrid: showGrid,

  shape: shapeType,
  moduleAngle: moduleAngleDeg,

  mode: mode,

  ccCol: midiMap.ccCol,
  ccRow: midiMap.ccRow,
  ccMode: midiMap.ccMode,
  ccSize: midiMap.ccSize,
  ccRotate: midiMap.ccRotate,
  ccModAngle: midiMap.ccModAngle,

  clearAll: () => initGrid(),
  savePNG: () => saveCanvas('grid_paint','png'),
  exportSVG: () => exportSVGManual(),
  uploadCustomSVG: () => {
    const inp = document.getElementById('customSvg');
    if (inp) inp.click();
  },
  saveMapping: () => {
    midiMap = {
      ccCol: int(guiState.ccCol),
      ccRow: int(guiState.ccRow),
      ccMode: int(guiState.ccMode),
      ccSize: int(guiState.ccSize),
      ccRotate: int(guiState.ccRotate),
      ccModAngle: int(guiState.ccModAngle),
    };
    saveMidiMap();
    reflectMappingEcho();
  },
  resetMapping: () => {
    midiMap = { ccCol:20, ccRow:21, ccMode:22, ccSize:23, ccRotate:24, ccModAngle:25 };
    saveMidiMap();
    guiState.ccCol = midiMap.ccCol;
    guiState.ccRow = midiMap.ccRow;
    guiState.ccMode = midiMap.ccMode;
    guiState.ccSize = midiMap.ccSize;
    guiState.ccRotate = midiMap.ccRotate;
    guiState.ccModAngle = midiMap.ccModAngle;
    if (ctrls.ccCol) ctrls.ccCol.setValue(guiState.ccCol);
    if (ctrls.ccRow) ctrls.ccRow.setValue(guiState.ccRow);
    if (ctrls.ccMode) ctrls.ccMode.setValue(guiState.ccMode);
    if (ctrls.ccSize) ctrls.ccSize.setValue(guiState.ccSize);
    if (ctrls.ccRotate) ctrls.ccRotate.setValue(guiState.ccRotate);
    if (ctrls.ccModAngle) ctrls.ccModAngle.setValue(guiState.ccModAngle);
    reflectMappingEcho();
  },
};

function initDatGUI(){
  if (!window.dat || !dat.GUI) return;

  gui = new dat.GUI();

  const fCanvas = gui.addFolder('Canvas');
  ctrls.format = fCanvas.add(guiState,'format',{
    'Post (1080×1080)':'1080x1080',
    'Stories (1080×1920)':'1080x1920',
    'HD (1920×1080)':'1920x1080',
    '2K (2560×1440)':'2560x1440',
    '4K (3840×2160)':'3840x2160',
  }).name('Formato').onChange(v=>{
    const [w,h] = v.split('x').map(n=>int(n));
    resizeCanvas(w,h);
    initGrid();
    curCol = constrain(curCol,0,cols-1); curRow = constrain(curRow,0,rows-1);
  });
  fCanvas.open();

  const fGrid = gui.addFolder('Grid');
  ctrls.cellSize = fGrid.add(guiState,'cellSize',6,240,1).name('Tamanho').onChange(v=>{
    cellSize = int(v);
    initGrid();
  });
  ctrls.rotate45 = fGrid.add(guiState,'rotate45').name('Rotacionar 45°').onChange(v=>{ rotate90=!!v; });
  ctrls.showGrid = fGrid.add(guiState,'showGrid').name('Linhas').onChange(v=>{ showGrid=!!v; });
  fGrid.open();

  const fShape = gui.addFolder('Forma');
  ctrls.shape = fShape.add(guiState,'shape',['square','rounded','circle','triangle','star8','custom']).name('Módulo')
    .onChange(v=>{ shapeType = v; });
  fShape.add(guiState,'uploadCustomSVG').name('Upload SVG (Custom)…');
  ctrls.modAngle = fShape.add(guiState,'moduleAngle',0,315,45).name('Rotação módulo').onChange(v=>{ moduleAngleDeg=int(v); });
  fShape.open();

  const fMode = gui.addFolder('Pintura');
  ctrls.mode = fMode.add(guiState,'mode',['paint','erase']).name('Modo').onChange(v=>{ mode=v; });
  fMode.open();

  const fExp = gui.addFolder('Export');
  fExp.add(guiState,'clearAll').name('Limpar tudo');
  fExp.add(guiState,'savePNG').name('Salvar PNG');
  fExp.add(guiState,'exportSVG').name('Exportar SVG');
  fExp.open();

  const fMidi = gui.addFolder('MIDI Mapping (CC)');
  const ccList = Array.from({length:128},(_,i)=>i);
  ctrls.ccCol = fMidi.add(guiState,'ccCol',ccList).name('CC Coluna (↑↓)');
  ctrls.ccRow = fMidi.add(guiState,'ccRow',ccList).name('CC Linha (←→)');
  ctrls.ccMode = fMidi.add(guiState,'ccMode',ccList).name('CC Modo (>=64 erase)');
  ctrls.ccSize = fMidi.add(guiState,'ccSize',ccList).name('CC Tamanho');
  ctrls.ccRotate = fMidi.add(guiState,'ccRotate',ccList).name('CC RotGrade 45°');
  ctrls.ccModAngle = fMidi.add(guiState,'ccModAngle',ccList).name('CC RotMódulo');
  fMidi.add(guiState,'saveMapping').name('Salvar mapping');
  fMidi.add(guiState,'resetMapping').name('Resetar padrão');
  fMidi.open();

  const customSvgInput = document.getElementById('customSvg');
  if (customSvgInput){
    customSvgInput.addEventListener('change', async (e)=>{
      await onCustomSvgFile(e);
      shapeType = 'custom';
      guiState.shape = 'custom';
      if (ctrls.shape) ctrls.shape.setValue('custom');
    });
  }

  reflectMappingEcho();
}
function initGrid(){
  cols = int(width/cellSize);
  rows = int(height/cellSize);
  grid = Array.from({length:cols},()=> Array.from({length:rows},()=> false));
  curCol=0; curRow=0;
}

function draw(){
  background(255);
  renderGrid(this,true);
  // cursor
  push();
  translate(width/2,height/2); if(rotate90) rotate(PI/4); translate(-width/2,-height/2);
  noFill(); stroke(0); strokeWeight(2); rect(curCol*cellSize, curRow*cellSize, cellSize, cellSize);
  pop();
}

function drawCellShape(ctx,x,y,s,filled){
  if(!filled) return;
  const cx=x+s/2, cy=y+s/2;
  ctx.push();
  ctx.translate(cx,cy);
  ctx.rotate(radians(moduleAngleDeg));
  ctx.translate(-cx,-cy);

  ctx.noStroke(); ctx.fill(0);
  if(shapeType==='square') ctx.rect(x,y,s,s);
  else if(shapeType==='rounded') ctx.rect(x,y,s,s,s*0.2);
  else if(shapeType==='circle') ctx.ellipse(cx,cy,s,s);
  else if(shapeType==='triangle'){ const h=s*Math.sqrt(3)/2; ctx.triangle(cx,cy-h/2,x+s,cy+h/2,x,cy+h/2); }
  else if(shapeType==='star8'){ const pts=star8Points(cx,cy,s*0.5,s*0.22); ctx.beginShape(); pts.forEach(p=>ctx.vertex(p.x,p.y)); ctx.endShape(CLOSE); }
  else if(shapeType==='custom'){ if(customReady && customImgBlack) ctx.image(customImgBlack,x,y,s,s); else ctx.rect(x,y,s,s); }
  ctx.pop();
}
function star8Points(cx,cy,R,r){ const pts=[]; const step=Math.PI/8; let a=-Math.PI/2; for(let i=0;i<16;i++){ const rad=(i%2===0)?R:r; pts.push({x:cx+Math.cos(a)*rad,y:cy+Math.sin(a)*rad}); a+=step;} return pts; }

function renderGrid(ctx,rot){
  ctx.push();
  if(rot){ ctx.translate(width/2,height/2); if(rotate90) ctx.rotate(PI/4); ctx.translate(-width/2,-height/2); }
  ctx.noStroke(); ctx.fill(255); ctx.rect(0,0,width,height);
  for(let i=0;i<cols;i++) for(let j=0;j<rows;j++) drawCellShape(ctx,i*cellSize,j*cellSize,cellSize,grid[i][j]);
  if(showGrid){ ctx.noFill(); ctx.stroke(200); for(let i=0;i<cols;i++) for(let j=0;j<rows;j++) ctx.rect(i*cellSize,j*cellSize,cellSize,cellSize); }
  ctx.pop();
}

// —— Pintura com mouse / mesa
function screenToCell(x,y){
  let cx=x-width/2, cy=y-height/2;
  if(rotate90){ const a=-PI/4; const rx=cx*cos(a)-cy*sin(a); const ry=cx*sin(a)+cy*cos(a); cx=rx; cy=ry; }
  const gx=cx+width/2, gy=cy+height/2;
  return { i:int(gx/cellSize), j:int(gy/cellSize) };
}
function applyPaintAt(x,y){ const {i,j}=screenToCell(x,y); if(i>=0&&i<cols&&j>=0&&j<rows) grid[i][j]=(mode==='paint'); }
function mousePressed(){
  // Nova lógica de toggle
  let gx = floor(mouseX / cellSize);
  let gy = floor(mouseY / cellSize);
  if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
    if (grid[gx][gy] === currentColor) {
      grid[gx][gy] = bgColor;
    } else {
      grid[gx][gy] = currentColor;
    }
  }
  return;
 applyPaintAt(mouseX,mouseY); } function mouseDragged(){ applyPaintAt(mouseX,mouseY); }
function touchStarted(){ applyPaintAt(mouseX,mouseY); return false; } function touchMoved(){ applyPaintAt(mouseX,mouseY); return false; }
function keyPressed(){ if(key==='c'||key==='C') initGrid(); if(key==='g'||key==='G') showGrid=!showGrid; }

// —— Export SVG com rotação do módulo e linhas do grid
function exportSVGManual(){
  const w=width,h=height; let out=[];
  out.push(`<?xml version="1.0" encoding="UTF-8" standalone="no"?>`);
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}px" height="${h}px" viewBox="0 0 ${w} ${h}">`);
  out.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`);
  out.push(rotate90?`<g transform="rotate(90 ${w/2} ${h/2})">`:`<g>`);
  for(let i=0;i<cols;i++) for(let j=0;j<rows;j++){ if(!grid[i][j]) continue; const x=i*cellSize,y=j*cellSize,s=cellSize;
    const cx=x+s/2, cy=y+s/2;
    const rot = moduleAngleDeg % 360;
    const rotStr = rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : '';
    if(shapeType==='square') out.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#000000"${rotStr}/>`);
    else if(shapeType==='rounded'){ const r=s*0.2; out.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${r}" ry="${r}" fill="#000000"${rotStr}/>`); }
    else if(shapeType==='circle'){ out.push(`<circle cx="${cx}" cy="${cy}" r="${s/2}" fill="#000000"${rotStr}/>`); }
    else if(shapeType==='triangle'){ const h3=s*Math.sqrt(3)/2; const pts=`${cx},${cy-h3/2} ${x+s},${cy+h3/2} ${x},${cy+h3/2}`; out.push(`<polygon points="${pts}" fill="#000000"${rotStr}/>`); }
    else if(shapeType==='star8'){ const pts=star8Points(cx,cy,s*0.5,s*0.22).map(p=>`${p.x},${p.y}`).join(' '); out.push(`<polygon points="${pts}" fill="#000000"${rotStr}/>`); }
    else if(shapeType==='custom' && customSvgText && customViewBox){ const vb=customViewBox; const scale=Math.min(s/vb.w, s/vb.h); const tx=x+(s-vb.w*scale)/2 - vb.minx*scale; const ty=y+(s-vb.h*scale)/2 - vb.miny*scale; const inner=stripOuterSvg(customSvgText); out.push(`<g transform="translate(${tx} ${ty}) scale(${scale}) rotate(${rot} ${vb.minx+(vb.w/2)} ${vb.miny+(vb.h/2)})" style="color:#000">`); out.push(inner); out.push(`</g>`); }
    else out.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#000000"${rotStr}/>`);
  }
  if(showGrid){ for(let i=0;i<cols;i++) for(let j=0;j<rows;j++){ const x=i*cellSize,y=j*cellSize,s=cellSize; out.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="none" stroke="#c8c8c8" stroke-width="1"/>`); } }
  out.push(`</g></svg>`);
  const blob=new Blob([out.join('\n')],{type:'image/svg+xml'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='grid_paint.svg'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function stripOuterSvg(svgText){ const m = svgText.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i); return m ? m[1] : svgText; }

// ------------ SVG loader (DOMParser + p5.loadImage) ------------
function pxFromUnit(val){
  if(val==null) return null;
  const m = String(val).trim().match(/^([0-9.]+)\s*([a-z%]+)?$/i);
  if(!m) return null;
  const n = parseFloat(m[1]); const u = (m[2]||'px').toLowerCase(); const DPI=96;
  switch(u){
    case 'px': return n;
    case 'in': return n*DPI;
    case 'cm': return n*(DPI/2.54);
    case 'mm': return n*(DPI/25.4);
    case 'pt': return n*(DPI/72);
    case 'pc': return n*16;
    case 'q': return n*(DPI/25.4)/4;
    default: return null;
  }
}
function ensureColorStyle(svgText, hex){
  if(/<svg[^>]*style="/i.test(svgText)){
    return svgText.replace(/<svg([^>]*?)style="([^"]*)"/i, (all,before,css)=> `<svg${before}style="color:${hex};${css}"`);
  } else {
    return svgText.replace(/<svg/i, `<svg style="color:${hex}"`);
  }
}
function parseAndSanitizeSvg(svgText){
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  let svg = doc.documentElement;
  if(!svg || svg.nodeName.toLowerCase()!=='svg') throw new Error('Conteúdo não é um SVG válido.');
  ['script','foreignObject'].forEach(tag => doc.querySelectorAll(tag).forEach(el=> el.remove()));
  doc.querySelectorAll('image,use').forEach(el=>{
    const href = el.getAttribute('href') || el.getAttribute('xlink:href');
    if(href && (/^https?:/i.test(href) || /^data:/i.test(href))) el.remove();
  });
  doc.querySelectorAll('style').forEach(el=> el.remove());
  if(!svg.getAttribute('xmlns')) svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  if(!svg.getAttribute('viewBox')){
    const wpx = pxFromUnit(svg.getAttribute('width'));
    const hpx = pxFromUnit(svg.getAttribute('height'));
    if(wpx && hpx) svg.setAttribute('viewBox', `0 0 ${wpx} ${hpx}`);
  }
  const vb = svg.getAttribute('viewBox');
  if(!vb) throw new Error('SVG sem viewBox nem width/height em unidades convertíveis.');
  svg.setAttribute('style', (svg.getAttribute('style')||'') + ';color:#000');
  const walker = doc.createTreeWalker(svg, NodeFilter.SHOW_ELEMENT, null);
  while(walker.nextNode()){
    const el = walker.currentNode;
    if(el.getAttribute){
      const f = el.getAttribute('fill');
      if(f && !/^url\(/i.test(f)) el.setAttribute('fill','currentColor');
    }
  }
  const ser = new XMLSerializer();
  const text = ser.serializeToString(svg);
  const m = text.match(/viewBox="([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)"/i);
  const view = m ? {minx:parseFloat(m[1]), miny:parseFloat(m[2]), w:parseFloat(m[3]), h:parseFloat(m[4])} : null;
  return {text, view};
}

function svgTextToP5Image(svgText){
  return new Promise((resolve,reject)=>{
    const blob = new Blob([svgText], {type:'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    loadImage(url, img=>{ URL.revokeObjectURL(url); resolve(img); }, err=>{ URL.revokeObjectURL(url); reject(err); });
  });
}

async function onCustomSvgFile(e){
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  try{
    customReady = false;
    const raw = await file.text();
    const {text, view} = parseAndSanitizeSvg(raw);
    customSvgText = text; customViewBox = view;
    const svgBlack = ensureColorStyle(customSvgText, '#000');
    customImgBlack = await svgTextToP5Image(svgBlack);
    customReady = true;
  }catch(err){
    console.error('Falha ao processar SVG:', err);
    alert('Não foi possível carregar o SVG: ' + (err.message||err));
    shapeType = 'square'; customReady = false;
  }
}

// -------------------- WebMIDI --------------------
async function initMIDI(){
  const midiStatus=document.getElementById('midiStatus'); const lastMidi=document.getElementById('lastMidi');
  try{
    if(!('requestMIDIAccess' in navigator)){ midiStatus.textContent='não suportado'; midiStatus.className='pill err'; return; }
    const access=await navigator.requestMIDIAccess({sysex:false}); midiStatus.textContent='ok'; midiStatus.className='pill ok';
    const onMIDIMessage=(e)=>{ const [status,data1,data2]=e.data; const type=status & 0xF0;
      if(type===0xB0){ const cc=data1, val=data2; ccState[cc]=val; handleCC(cc,val); lastMidi.textContent=`CC${cc}=${val}`; }
    };
    for(const input of access.inputs.values()){ input.onmidimessage=onMIDIMessage; }
    access.onstatechange=()=>{ for(const input of access.inputs.values()){ input.onmidimessage=onMIDIMessage; } };
  }catch(err){ midiStatus.textContent='erro'; midiStatus.className='pill err'; console.error('MIDI error:', err); }
}
function handleCC(cc,val){
  if(cc===midiMap.ccCol){
    const newRow=int(map(val,0,127,0,rows-1));
    if(newRow!==curRow){ curRow=constrain(newRow,0,rows-1); paintCurrentCell(); }
  }
  else if(cc===midiMap.ccRow){
    const newCol=int(map(val,0,127,0,cols-1));
    if(newCol!==curCol){ curCol=constrain(newCol,0,cols-1); paintCurrentCell(); }
  }
  else if(cc===midiMap.ccMode){
    mode=(val>=64)?'erase':'paint';
    if (typeof guiState!=='undefined' && guiState){ guiState.mode = mode; if (ctrls.mode) ctrls.mode.setValue(mode); }
  }
  else if(cc===midiMap.ccSize){
    const newSize=int(map(val,0,127,6,240));
    if(newSize!==cellSize){
      cellSize=newSize;
      if (typeof guiState!=='undefined' && guiState){ guiState.cellSize = cellSize; if (ctrls.cellSize) ctrls.cellSize.setValue(cellSize); }
      initGrid();
      curCol=constrain(curCol,0,cols-1); curRow=constrain(curRow,0,rows-1);
    }
  }
  else if(cc===midiMap.ccRotate){
    rotate90=(val>=64);
    if (typeof guiState!=='undefined' && guiState){ guiState.rotate45 = rotate90; if (ctrls.rotate45) ctrls.rotate45.setValue(rotate90); }
  }
  else if(cc===midiMap.ccModAngle){
    const step = Math.round(map(val,0,127,0,7));
    moduleAngleDeg = step * 45;
    if (typeof guiState!=='undefined' && guiState){ guiState.moduleAngle = moduleAngleDeg; if (ctrls.modAngle) ctrls.modAngle.setValue(moduleAngleDeg); }
  }
}
function paintCurrentCell(){ if(curCol>=0&&curCol<cols&&curRow>=0&&curRow<rows) grid[curCol][curRow]=(mode==='paint'); }

// Mapping UI
function setupMappingSelect(){ /* deprecated: dat.GUI */ }
function populateMappingSelects(){ /* deprecated: dat.GUI */ }
function reflectMappingEcho(){
  const echo=document.getElementById('mapEcho');
  if(!echo) return;
  echo.textContent=`Atual: Col=${midiMap.ccCol} • Lin=${midiMap.ccRow} • Modo=${midiMap.ccMode} • Tam=${midiMap.ccSize} • RotGrade=${midiMap.ccRotate} • RotMódulo=${midiMap.ccModAngle}`;
}
