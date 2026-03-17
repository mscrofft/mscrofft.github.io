// v4: gravação robusta (MediaRecorder com fallback CCapture), export res, paletas
let W = 1024, H = 768;
let pgMask, maskMode='text', loadedImg=null;
let canvasElt=null;

// MediaRecorder
let mediaRecorder=null, mrChunks=[], mrStream=null, mrMime='';
// CCapture fallback
let capturer=null;

let isRecording=false;

const layers = [];
const shapes = ['circle','arc','square','triangle','hexagon','rhombus'];
const schemeOptions = ['monocromática','análoga','complementar','triádica'];

const predefinedPalettes = [
  ["#FF6B6B","#FFE66D","#4472CA","#4ECDC4","#222831"],
  ["#6A0572","#AB83A1","#EDE6DB","#F9F9F9","#333333"],
  ["#05668D","#028090","#00A896","#02C39A","#F0F3BD"],
  ["#FFD166","#EF476F","#06D6A0","#118AB2","#073B4C"],
  ["#8E44AD","#2980B9","#27AE60","#F39C12","#2C3E50"]
];

const strokeMapOptions = ['constante','t','coluna','linha','ruído'];

// --- dat.GUI ---
let gui = null;
let guiFolders = { layers: [] };
let guiState = {
  // Entrada / máscara
  text: 'A',
  fontSize: 260,
  maskMode: 'text', // 'text' | 'image'
  density: 28,
  bgColor: '#000000',
  uploadMaskImage: ()=>{
    const inp = document.getElementById('imgInput');
    if(inp) inp.click();
  },
  useTextMask: ()=>{ guiState.maskMode='text'; maskMode='text'; rebuildMaskFromText(); },
  useImageMask: ()=>{ guiState.maskMode='image'; maskMode='image'; rebuildMaskFromImage(); },

  // Export
  exportRes: 'current',
  savePNG: ()=>savePNG_Res(),
  saveSVG: ()=>saveSVG_Res(),

  // Recording
  recEngine: 'auto', // auto | mediarecorder | ccapture
  recStart: ()=>startRecording(),
  recStop: ()=>stopRecording(),

  // Layers
  addLayer: ()=>{
    const L=defaultLayer(layers.length);
    layers.push(L);
    rebuildDatGUILayers();
  },
  removeLastLayer: ()=>{
    if(layers.length<=1) return;
    layers.pop();
    rebuildDatGUILayers();
  },
};

function initDatGUI(){
  if(!window.dat || !dat.GUI) return;
  if(gui){ gui.destroy(); gui=null; guiFolders.layers=[]; }

  gui = new dat.GUI();

  // Entrada / Máscara
  const fIn = gui.addFolder('Entrada / Máscara');
  fIn.add(guiState,'text').name('Texto').onFinishChange(()=>{ if(guiState.maskMode==='text') rebuildMaskFromText(); });
  fIn.add(guiState,'fontSize',24,360,1).name('Tamanho fonte').onChange(()=>{ if(guiState.maskMode==='text') rebuildMaskFromText(); });
  fIn.add(guiState,'maskMode',['text','image']).name('Modo').onChange(v=>{
    maskMode=v;
    if(v==='text') rebuildMaskFromText(); else rebuildMaskFromImage();
  });
  fIn.add(guiState,'uploadMaskImage').name('Upload imagem máscara…');
  fIn.add(guiState,'density',5,80,1).name('Grid density');
  fIn.addColor(guiState,'bgColor').name('BG');
  fIn.open();

  // Export
  const fEx = gui.addFolder('Exportar');
  fEx.add(guiState,'exportRes',{
    'Canvas atual (1024×768)':'current',
    '1080p (1920×1080)':'1080p',
    '2K (2560×1440)':'2k',
    '4K (3840×2160)':'4k',
    'Quadrado (1080×1080)':'square',
    'Stories (1080×1920)':'stories',
  }).name('Resolução');
  fEx.add(guiState,'savePNG').name('Salvar PNG');
  fEx.add(guiState,'saveSVG').name('Exportar SVG');
  fEx.open();

  // Gravação
  const fRec = gui.addFolder('Gravação');
  fRec.add(guiState,'recEngine',{
    'Auto (recomendada)':'auto',
    'MediaRecorder':'mediarecorder',
    'CCapture (fallback)':'ccapture',
  }).name('Engine');
  fRec.add(guiState,'recStart').name('Start Recording');
  fRec.add(guiState,'recStop').name('Stop & Save');
  fRec.open();

  // Camadas
  const fLayers = gui.addFolder('Camadas');
  fLayers.add(guiState,'addLayer').name('+ Adicionar camada');
  fLayers.add(guiState,'removeLastLayer').name('- Remover última');
  fLayers.open();

  rebuildDatGUILayers();
}

function rebuildDatGUILayers(){
  if(!gui) return;

  // remove previous folders
  if(guiFolders.layers && guiFolders.layers.length){
    guiFolders.layers.forEach(f=>{
      try{ gui.removeFolder ? gui.removeFolder(f) : f.destroy(); }catch(e){ try{ f.destroy(); }catch(_){ } }
    });
  }
  guiFolders.layers = [];

  // dat.GUI doesn't have removeFolder in vanilla; we'll brute-force by destroying & re-creating child folders.
  // So: destroy and re-init gui while preserving guiState.
  // To keep it simple & robust: rebuild full GUI.
  const stateCopy = JSON.parse(JSON.stringify({
    text: guiState.text, fontSize: guiState.fontSize, maskMode: guiState.maskMode,
    density: guiState.density, bgColor: guiState.bgColor, exportRes: guiState.exportRes,
    recEngine: guiState.recEngine
  }));
  initDatGUI_withoutRecurse(stateCopy);
}

function initDatGUI_withoutRecurse(stateCopy){
  // helper to rebuild without infinite recursion
  if(!window.dat || !dat.GUI) return;
  if(gui){ gui.destroy(); gui=null; }
  // restore state
  Object.assign(guiState, stateCopy);

  gui = new dat.GUI();

  const fIn = gui.addFolder('Entrada / Máscara');
  fIn.add(guiState,'text').name('Texto').onFinishChange(()=>{ if(guiState.maskMode==='text') rebuildMaskFromText(); });
  fIn.add(guiState,'fontSize',24,360,1).name('Tamanho fonte').onChange(()=>{ if(guiState.maskMode==='text') rebuildMaskFromText(); });
  fIn.add(guiState,'maskMode',['text','image']).name('Modo').onChange(v=>{
    maskMode=v;
    if(v==='text') rebuildMaskFromText(); else rebuildMaskFromImage();
  });
  fIn.add(guiState,'uploadMaskImage').name('Upload imagem máscara…');
  fIn.add(guiState,'density',5,80,1).name('Grid density');
  fIn.addColor(guiState,'bgColor').name('BG');
  fIn.open();

  const fEx = gui.addFolder('Exportar');
  fEx.add(guiState,'exportRes',{
    'Canvas atual (1024×768)':'current',
    '1080p (1920×1080)':'1080p',
    '2K (2560×1440)':'2k',
    '4K (3840×2160)':'4k',
    'Quadrado (1080×1080)':'square',
    'Stories (1080×1920)':'stories',
  }).name('Resolução');
  fEx.add(guiState,'savePNG').name('Salvar PNG');
  fEx.add(guiState,'saveSVG').name('Exportar SVG');
  fEx.open();

  const fRec = gui.addFolder('Gravação');
  fRec.add(guiState,'recEngine',{
    'Auto (recomendada)':'auto',
    'MediaRecorder':'mediarecorder',
    'CCapture (fallback)':'ccapture',
  }).name('Engine');
  fRec.add(guiState,'recStart').name('Start Recording');
  fRec.add(guiState,'recStop').name('Stop & Save');
  fRec.open();

  const fLayers = gui.addFolder('Camadas');
  fLayers.add(guiState,'addLayer').name('+ Adicionar camada');
  fLayers.add(guiState,'removeLastLayer').name('- Remover última');
  fLayers.open();

  // Create one folder per layer
  guiFolders.layers = [];
  layers.forEach((L, idx)=>{
    const f = gui.addFolder(`Camada ${idx+1}`);
    const layerUI = {
      enabled: L.enabled,
      shape: L.shape,
      stroke: L.stroke,
      size: L.size,
      rotA: L.rotA,
      rotB: L.rotB,
      arcA: L.arcA,
      arcB: L.arcB,
      strokeMap: L.strokeMap,
      strokeMin: L.strokeMin,
      strokeMax: L.strokeMax,
      baseColor: L.baseColor,
      scheme: L.scheme,
      p0: L.palette[0], p1: L.palette[1], p2: L.palette[2], p3: L.palette[3], p4: L.palette[4],
      genPalette: ()=>{
        L.palette = generatePaletteFromScheme(L.baseColor, L.scheme);
        layerUI.p0=L.palette[0]; layerUI.p1=L.palette[1]; layerUI.p2=L.palette[2]; layerUI.p3=L.palette[3]; layerUI.p4=L.palette[4];
        // refresh controllers by setting values
        if(layerCtrls.p0) layerCtrls.p0.setValue(layerUI.p0);
        if(layerCtrls.p1) layerCtrls.p1.setValue(layerUI.p1);
        if(layerCtrls.p2) layerCtrls.p2.setValue(layerUI.p2);
        if(layerCtrls.p3) layerCtrls.p3.setValue(layerUI.p3);
        if(layerCtrls.p4) layerCtrls.p4.setValue(layerUI.p4);
      }
    };
    const layerCtrls = {};
    layerCtrls.enabled = f.add(layerUI,'enabled').name('Ativa').onChange(v=>L.enabled=!!v);
    layerCtrls.shape = f.add(layerUI,'shape', shapes).name('Forma').onChange(v=>L.shape=v);
    layerCtrls.stroke = f.add(layerUI,'stroke',1,120,1).name('Stroke base').onChange(v=>L.stroke=+v);
    layerCtrls.strokeMap = f.add(layerUI,'strokeMap', strokeMapOptions).name('Map stroke').onChange(v=>L.strokeMap=v);
    layerCtrls.strokeMin = f.add(layerUI,'strokeMin',1,120,1).name('Stroke min').onChange(v=>L.strokeMin=+v);
    layerCtrls.strokeMax = f.add(layerUI,'strokeMax',1,120,1).name('Stroke max').onChange(v=>L.strokeMax=+v);
    layerCtrls.size = f.add(layerUI,'size',4,240,1).name('Tamanho').onChange(v=>L.size=+v);
    layerCtrls.rotA = f.add(layerUI,'rotA',-360,360,1).name('Rot início').onChange(v=>L.rotA=+v);
    layerCtrls.rotB = f.add(layerUI,'rotB',-360,360,1).name('Rot fim').onChange(v=>L.rotB=+v);
    layerCtrls.arcA = f.add(layerUI,'arcA',0,360,1).name('Arco início').onChange(v=>L.arcA=+v);
    layerCtrls.arcB = f.add(layerUI,'arcB',0,360,1).name('Arco fim').onChange(v=>L.arcB=+v);

    const fPal = f.addFolder('Paleta');
    layerCtrls.p0 = fPal.addColor(layerUI,'p0').name('C1').onChange(v=>L.palette[0]=v);
    layerCtrls.p1 = fPal.addColor(layerUI,'p1').name('C2').onChange(v=>L.palette[1]=v);
    layerCtrls.p2 = fPal.addColor(layerUI,'p2').name('C3').onChange(v=>L.palette[2]=v);
    layerCtrls.p3 = fPal.addColor(layerUI,'p3').name('C4').onChange(v=>L.palette[3]=v);
    layerCtrls.p4 = fPal.addColor(layerUI,'p4').name('C5').onChange(v=>L.palette[4]=v);
    layerCtrls.baseColor = fPal.addColor(layerUI,'baseColor').name('Base').onChange(v=>{ L.baseColor=v; });
    layerCtrls.scheme = fPal.add(layerUI,'scheme', schemeOptions).name('Esquema').onChange(v=>L.scheme=v);
    fPal.add(layerUI,'genPalette').name('Gerar paleta');
    layerUI.presetIndex = 0;
    layerCtrls.preset = fPal.add(layerUI, 'presetIndex', {'Preset 1':0,'Preset 2':1,'Preset 3':2,'Preset 4':3,'Preset 5':4})
      .name('Paletas prontas')
      .onChange(i=>{
        const p = predefinedPalettes[i];
        if(!p) return;
        L.palette = [...p];
        layerUI.p0=p[0]; layerUI.p1=p[1]; layerUI.p2=p[2]; layerUI.p3=p[3]; layerUI.p4=p[4];
        if(layerCtrls.p0) layerCtrls.p0.setValue(layerUI.p0);
        if(layerCtrls.p1) layerCtrls.p1.setValue(layerUI.p1);
        if(layerCtrls.p2) layerCtrls.p2.setValue(layerUI.p2);
        if(layerCtrls.p3) layerCtrls.p3.setValue(layerUI.p3);
        if(layerCtrls.p4) layerCtrls.p4.setValue(layerUI.p4);
      });
    fPal.open();

    f.open();
    guiFolders.layers.push(f);
  });
}

function defaultLayer(i=0){
  return {
    enabled:true, shape:(i%2===0)?'circle':'arc',
    stroke:22, size:46,
    rotA:0, rotB:(i%2===0)?0:240,
    arcA:0, arcB:360,
    strokeMap:'constante', strokeMin:4, strokeMax:60,
    palette:['#ffeb3b','#1565ff','#22d06d','#ff6a00','#ffffff'],
    baseColor:'#33aaff', scheme:'análoga'
  };
}

function setupUIForLayer(){ /* UI replaced by dat.GUI */ }

function preload(){}

function setup(){
  frameRate(30);
  const cnv=createCanvas(W,H,P2D); cnv.parent('canvasHost'); pixelDensity(1);
  canvasElt = cnv.elt;

  pgMask=createGraphics(W,H); pgMask.pixelDensity(1);

  // init layers
  layers.length = 0;
  layers.push(defaultLayer(0));
  layers.push(defaultLayer(1));

  initDatGUI();

  // initial mask
  rebuildMaskFromText();

  // hidden image input
  const inp = document.getElementById('imgInput');
  if (inp){
    inp.onchange = (e)=>{
      const f=e.target.files[0]; if(!f) return;
      const reader=new FileReader();
      reader.onload=ev=>{
        loadedImg=loadImage(ev.target.result, ()=>{
          if(guiState.maskMode==='image') rebuildMaskFromImage();
        });
      };
      reader.readAsDataURL(f);
      // allow re-upload same file
      inp.value = '';
    };
  }
}


function draw(){
  background(guiState.bgColor);
  maskMode = guiState.maskMode;
  if(maskMode==='text') rebuildMaskFromText();
  const dens=+guiState.density;
  const step=Math.max(3,Math.floor(1000/dens));
  pgMask.loadPixels();

  noFill();
  for(let y=step/2;y<height;y+=step){
    for(let x=step/2;x<width;x+=step){
      if(isInsideMask(pgMask,x|0,y|0)){
        const t = fract((x/width + y/height) * 0.5 + 0.1*sin(frameCount*0.01 + (x+y)*0.01));
        for(const L of layers){
          if(!L.enabled) continue;
          push(); translate(x,y);
          rotate(radians(lerp(L.rotA,L.rotB,t)));
          const sw = mapStroke(L, t, x/width, y/height);
          strokeWeight(sw); stroke(samplePalette(L.palette,t));
          drawGlyph(L.shape,L.size,L,t);
          pop();
        }
      }
    }
  }

  // CCapture captura por frame; MediaRecorder não precisa
  if(isRecording && capturer){
    capturer.capture(canvasElt);
  }
}

function mapStroke(L, t, cx, cy){
  switch(L.strokeMap){
    case 'constante': return L.stroke;
    case 't': return lerp(L.strokeMin, L.strokeMax, t);
    case 'coluna': return lerp(L.strokeMin, L.strokeMax, cx);
    case 'linha': return lerp(L.strokeMin, L.strokeMax, cy);
    case 'ruído': {
      const n = noise(cx*3, cy*3, frameCount*0.01);
      return lerp(L.strokeMin, L.strokeMax, n);
    }
  }
  return L.stroke;
}

function isInsideMask(buf,x,y){ const idx=4*(y*buf.width+x); return (buf.pixels[idx+3]||0)>127; }

function drawGlyph(shape,size,L,t){
  switch(shape){
    case 'circle': noFill(); ellipse(0,0,size,size); break;
    case 'arc': {
      noFill(); const a0=radians(L.arcA), a1=radians(L.arcB)*t + radians(L.arcA)*(1-t);
      arc(0,0,size,size,a0,a1); break;
    }
    case 'square': rectMode(CENTER); noFill(); rect(0,0,size,size); break;
    case 'triangle': {
      const r=size*0.5, a=-PI/2, b=a+TWO_PI/3, c=b+TWO_PI/3;
      noFill(); beginShape(); vertex(r*cos(a),r*sin(a)); vertex(r*cos(b),r*sin(b)); vertex(r*cos(c),r*sin(c)); endShape(CLOSE); break;
    }
    case 'hexagon': regularPolygon(0,0,size*0.5,6); break;
    case 'rhombus': {
      const r=size*0.5; noFill(); beginShape(); vertex(0,-r); vertex(r,0); vertex(0,r); vertex(-r,0); endShape(CLOSE); break;
    }
  }
}
function regularPolygon(cx,cy,r,n){ noFill(); beginShape(); for(let i=0;i<n;i++){ const a=-PI/2+i*TWO_PI/n; vertex(cx+r*cos(a), cy+r*sin(a)); } endShape(CLOSE); }
function samplePalette(arr,t){ const stops=arr.slice(0,5); if(stops.length===0)return color(255); if(stops.length===1)return color(stops[0]);
  const seg=1/(stops.length-1); const i=constrain(floor(t/seg),0,stops.length-2); const tt=(t-i*seg)/seg; return lerpColor(color(stops[i]),color(stops[i+1]),tt); }
function fract(x){ return x - Math.floor(x); }

// ---------- Máscara ----------
function rebuildMaskFromText(){
  const txt = (guiState.text||'A');
  const fsize = +guiState.fontSize;
  pgMask.clear(); pgMask.push();
  pgMask.background(0,0); pgMask.fill(255); pgMask.noStroke();
  pgMask.textAlign(CENTER,CENTER); pgMask.textSize(fsize);
  const asc=pgMask.textAscent(), dsc=pgMask.textDescent();
  const th=asc+dsc;
  pgMask.text(txt, pgMask.width/2, pgMask.height/2 + (asc - th/2));
  pgMask.pop();
}
function rebuildMaskFromImage(){
  if(!loadedImg) return;
  pgMask.clear(); pgMask.push(); pgMask.background(0,0);
  const ar=loadedImg.width/loadedImg.height; let w=pgMask.width, h=w/ar;
  if(h<pgMask.height){ h=pgMask.height; w=h*ar; }
  pgMask.image(loadedImg,(pgMask.width-w)/2,(pgMask.height-h)/2,w,h);
  pgMask.loadPixels();
  for(let i=0;i<pgMask.pixels.length;i+=4){
    const a=pgMask.pixels[i+3];
    pgMask.pixels[i]=pgMask.pixels[i+1]=pgMask.pixels[i+2]=255;
    pgMask.pixels[i+3]=a>5?255:0;
  }
  pgMask.updatePixels(); pgMask.pop();
}

// ---------- Export PNG/SVG com resolução ----------
function getExportSize(){
  const v = guiState.exportRes;
  switch(v){
    case '1080p': return {w:1920,h:1080};
    case '2k': return {w:2560,h:1440};
    case '4k': return {w:3840,h:2160};
    case 'square': return {w:1080,h:1080};
    case 'stories': return {w:1080,h:1920};
    default: return {w:W,h:H};
  }
}

function buildMaskAtSize(TW,TH){
  const m = createGraphics(TW, TH);
  m.pixelDensity(1);
  m.background(0,0);
  m.fill(255); m.noStroke();
  if(maskMode==='text'){
    const txt = (guiState.text||'A');
    const fsize = (+guiState.fontSize) * (TW/W);
    m.textAlign(CENTER,CENTER); m.textSize(fsize);
    const asc=m.textAscent(), dsc=m.textDescent(); const th=asc+dsc;
    m.text(txt, TW/2, TH/2 + (asc - th/2));
  } else if(maskMode==='image' && loadedImg){
    const ar=loadedImg.width/loadedImg.height; let w=TW, h=w/ar;
    if(h<TH){ h=TH; w=h*ar; }
    m.image(loadedImg,(TW-w)/2,(TH-h)/2,w,h);
  }
  m.loadPixels();
  for(let i=0;i<m.pixels.length;i+=4){
    const a=m.pixels[i+3];
    m.pixels[i]=m.pixels[i+1]=m.pixels[i+2]=255;
    m.pixels[i+3]=a>5?255:0;
  }
  m.updatePixels();
  return m;
}

function savePNG_Res(){
  const {w:TW,h:TH}=getExportSize();
  const g = createGraphics(TW, TH);
  g.pixelDensity(1);
  g.background(guiState.bgColor);
  const dens=+guiState.density;
  const step=Math.max(3,Math.floor(1000/dens * (TW/W)));
  const m = buildMaskAtSize(TW,TH);
  m.loadPixels();
  g.noFill();
  for(let y=step/2;y<TH;y+=step){
    for(let x=step/2;x<TW;x+=step){
      if(isInsideMask(m,x|0,y|0)){
        const t = ((x/TW + y/TH) * 0.5) % 1;
        for(const L of layers){
          if(!L.enabled) continue;
          g.push(); g.translate(x,y);
          g.rotate(radians(lerp(L.rotA,L.rotB,t)));
          const sw = mapStroke(L, t, x/TW, y/TH);
          g.strokeWeight(sw); g.stroke(samplePalette(L.palette,t));
          drawGlyphSVGorG(g, L.shape, L.size*(TW/W), L, t);
          g.pop();
        }
      }
    }
  }
  g.save('frame.png');
  g.remove();
}

function saveSVG_Res(){
  const {w:TW,h:TH}=getExportSize();
  const bg=guiState.bgColor;
  const dens=+guiState.density;
  const step=Math.max(3,Math.floor(1000/dens * (TW/W)));
  const m = buildMaskAtSize(TW,TH);
  m.loadPixels();

  let svg=[]; svg.push(`<?xml version="1.0" encoding="UTF-8"?>`); svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}">`);
  svg.push(`<rect width="100%" height="100%" fill="${bg}"/>`);
  for(let y=step/2;y<TH;y+=step){
    for(let x=step/2;x<TW;x+=step){
      if(isInsideMask(m,x|0,y|0)){
        const t=((x/TW + y/TH)*0.5)%1;
        for(const L of layers){
          if(!L.enabled) continue;
          const ang=(L.rotA + (L.rotB-L.rotA)*t);
          const stroke=hexFromColor(samplePalette(L.palette,t));
          const sw = mapStroke(L, t, x/TW, y/TH);
          svg.push(`<g transform="translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${ang.toFixed(3)})" stroke="${stroke}" stroke-width="${sw.toFixed(2)}" fill="none">`);
          svg.push(glyphSVGPath(L.shape, L.size*(TW/W), L, t));
          svg.push(`</g>`);
        }
      }
    }
  }
  svg.push(`</svg>`);
  const blob=new Blob([svg.join("\n")],{type:"image/svg+xml;charset=utf-8"});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='art.svg'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function hexFromColor(c){ const r=Math.round(red(c)).toString(16).padStart(2,'0'); const g=Math.round(green(c)).toString(16).padStart(2,'0'); const b=Math.round(blue(c)).toString(16).padStart(2,'0'); return `#${r}${g}${b}`; }

function drawGlyphSVGorG(g, shape, size, L, t){
  switch(shape){
    case 'circle': g.noFill(); g.ellipse(0,0,size,size); break;
    case 'arc': {
      g.noFill(); const a0=radians(L.arcA), a1=radians(L.arcB)*t + radians(L.arcA)*(1-t);
      g.arc(0,0,size,size,a0,a1); break;
    }
    case 'square': g.rectMode(CENTER); g.noFill(); g.rect(0,0,size,size); break;
    case 'triangle': {
      const r=size*0.5, a=-PI/2, b=a+TWO_PI/3, c=b+TWO_PI/3;
      g.noFill(); g.beginShape(); g.vertex(r*cos(a),r*sin(a)); g.vertex(r*cos(b),r*sin(b)); g.vertex(r*cos(c),r*sin(c)); g.endShape(CLOSE); break;
    }
    case 'hexagon': {
      const n=6, r=size*0.5; g.noFill(); g.beginShape();
      for(let i=0;i<n;i++){ const a=-PI/2+i*TWO_PI/n; g.vertex(r*cos(a), r*sin(a)); } g.endShape(CLOSE); break;
    }
    case 'rhombus': {
      const r=size*0.5; g.noFill(); g.beginShape(); g.vertex(0,-r); g.vertex(r,0); g.vertex(0,r); g.vertex(-r,0); g.endShape(CLOSE); break;
    }
  }
}

function glyphSVGPath(shape, size, L, t){
  const s=size;
  switch(shape){
    case 'circle': return `<circle cx="0" cy="0" r="${(s/2).toFixed(3)}"/>`;
    case 'square': return `<rect x="${(-s/2).toFixed(3)}" y="${(-s/2).toFixed(3)}" width="${s.toFixed(3)}" height="${s.toFixed(3)}"/>`;
    case 'rhombus': { const r=s/2; const pts=[[0,-r],[r,0],[0,r],[-r,0]].map(p=>p.map(v=>v.toFixed(3)).join(',')).join(' '); return `<polygon points="${pts}"/>`; }
    case 'triangle': { const r=s/2, a=-Math.PI/2, b=a+2*Math.PI/3, c=b+2*Math.PI/3; const pts=[[r*Math.cos(a),r*Math.sin(a)],[r*Math.cos(b),r*Math.sin(b)],[r*Math.cos(c),r*Math.sin(c)]].map(p=>p.map(v=>v.toFixed(3)).join(',')).join(' '); return `<polygon points="${pts}"/>`; }
    case 'hexagon': { const n=6, r=s/2; const pts=[]; for(let i=0;i<n;i++){ const a=-Math.PI/2+i*2*Math.PI/n; pts.push([r*Math.cos(a),r*Math.sin(a)]); } const str=pts.map(p=>p.map(v=>v.toFixed(3)).join(',')).join(' '); return `<polygon points="${str}"/>`; }
    case 'arc': {
      const a0=radians(L.arcA); const a1=radians(L.arcB)*t + radians(L.arcA)*(1-t); const r=s/2;
      const x0=(r*Math.cos(a0)).toFixed(3), y0=(r*Math.sin(a0)).toFixed(3);
      const x1=(r*Math.cos(a1)).toFixed(3), y1=(r*Math.sin(a1)).toFixed(3);
      let delta=((L.arcB-L.arcA)*t); delta=((delta%360)+360)%360; const largeArc=delta>180?1:0; const sweep=(L.arcB>=L.arcA)?1:0;
      return `<path d="M ${x0} ${y0} A ${r.toFixed(3)} ${r.toFixed(3)} 0 ${largeArc} ${sweep} ${x1} ${y1}" />`; }
  } return ``;
}

// ---------- Gravação ----------
function canUseMediaRecorder(){
  if(!('MediaRecorder' in window)) return false;
  const tests = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for(const t of tests){
    if(MediaRecorder.isTypeSupported(t)){ mrMime = t; return true; }
  }
  return false;
}

function startRecording(){
  if(isRecording) return;
  const engine = guiState.recEngine;
  const useMR = (engine==='mediarecorder') ? true : (engine==='ccapture' ? false : canUseMediaRecorder());

  if(useMR){
    mrChunks = [];
    mrStream = canvasElt.captureStream(30);
    mediaRecorder = new MediaRecorder(mrStream, { mimeType: mrMime, videoBitsPerSecond: 6_000_000 });
    mediaRecorder.ondataavailable = (e)=>{ if(e.data && e.data.size>0) mrChunks.push(e.data); };
    mediaRecorder.onstop = ()=>{
      const blob = new Blob(mrChunks, { type: mrMime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download='capture.webm';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      mrChunks=[]; mrStream=null; mediaRecorder=null; isRecording=false;
    };
    mediaRecorder.start();
    isRecording = true;
  } else {
    capturer = new CCapture({ format: 'webm', framerate: 30, verbose: false, quality: 100 });
    capturer.start();
    isRecording = true;
  }
}

function stopRecording(){
  if(!isRecording) return;
  if(mediaRecorder){
    mediaRecorder.stop();
  } else if(capturer){
    capturer.stop();
    capturer.save();
    capturer = null;
    isRecording = false;
  }
}

// ---------- Util ----------
function generatePaletteFromScheme(baseHex, scheme){
  const hsl=hexToHSL(baseHex); const H=hsl.h, S=constrain(hsl.s,0.45,0.9), L=constrain(hsl.l,0.35,0.65);
  let hues=[];
  switch(scheme){
    case 'monocromática': return [0.25,0.4,0.55,0.7,0.85].map(k=>hslToHex(H,S,k));
    case 'análoga': hues=[H-40,H-20,H,H+20,H+40]; break;
    case 'complementar': hues=[H-10,H,(H+180)%360,(H+190)%360,(H+170)%360]; break;
    case 'triádica': hues=[H,(H+120)%360,(H+240)%360,(H+140)%360,(H+220)%360]; break;
    default: hues=[H-40,H-20,H,H+20,H+40];
  }
  return hues.map(h=>hslToHex((h+360)%360,S,L));
}
function hexToHSL(H){
  let r=0,g=0,b=0;
  if(H.length==4){ r="0x"+H[1]+H[1]; g="0x"+H[2]+H[2]; b="0x"+H[3]+H[3]; }
  else if(H.length==7){ r="0x"+H[1]+H[2]; g="0x"+H[3]+H[4]; b="0x"+H[5]+H[6]; }
  r=+r; g=+g; b=+b; r/=255; g/=255; b/=255;
  const cmin=Math.min(r,g,b), cmax=Math.max(r,g,b), delta=cmax-cmin; let h=0,s=0,l=(cmax+cmin)/2;
  if(delta!=0){ if(cmax==r) h=((g-b)/delta)%6; else if(cmax==g) h=(b-r)/delta+2; else h=(r-g)/delta+4; h=Math.round(h*60); if(h<0) h+=360; }
  s=delta==0?0:delta/(1-Math.abs(2*l-1)); return {h:h,s:s,l:l};
}
function hslToHex(h,s,l){
  h=(h%360+360)%360; let r,g,b;
  if(s===0){ r=g=b=l; }
  else{
    const hue2rgb=(p,q,t)=>{ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; };
    const q=l<0.5? l*(1+s): l+s-l*s; const p=2*l-q;
    r=hue2rgb(p,q,(h/360)+1/3); g=hue2rgb(p,q,(h/360)); b=hue2rgb(p,q,(h/360)-1/3);
  }
  const toHex=x=>Math.round(x*255).toString(16).padStart(2,'0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
