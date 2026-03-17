// Visuals App — Full v2 (fix: fatia 360°, tamanho maior, anel SVG com furo via evenodd)
let W=1920, H=1080;
let cnv, paletas, customShapes={}, colorGrid=[];
let isRecording=false, recorder=null, recordedChunks=[];

const PALETAS_INICIAIS=[
  ["#FF6B6B","#FFE66D","#4472CA","#4ECDC4","#222831"],
  ["#6A0572","#AB83A1","#EDE6DB","#F9F9F9","#333333"],
  ["#05668D","#028090","#00A896","#02C39A","#F0F3BD"],
  ["#FFD166","#EF476F","#06D6A0","#118AB2","#073B4C"],
  ["#8E44AD","#2980B9","#27AE60","#F39C12","#2C3E50"]
];

function logError(e){
  const dbg=document.getElementById("debugBox");
  const msg=(e&&e.stack)?e.stack:String(e);
  if (dbg){ dbg.textContent=msg; dbg.style.display="block"; }
  console.error(e);
}

function setup(){
  try{
    paletas=[...PALETAS_INICIAIS];

    // default canvas
    makeCanvasByRes("1920x1080");

    // dat.GUI replaces the HTML menu
    initDatGUI();

    // initial color grid
    regenerateColorGrid();
    loop();
  }catch(e){logError(e);}
}

function makeCanvasByRes(val){
  const [w,h]=val.split("x").map(Number);
  W=w; H=h;
  if (cnv){ resizeCanvas(W,H); } else { cnv=createCanvas(W,H); }
}

// --- UI (dat.GUI) ---
let gui=null;
let guiControllers={};
let guiState={
  // canvas
  resolucao: "1920x1080",

  // shape
  forma: "circulo",
  diametro: 96,

  // palette
  tipoPaleta: "monocromatica",
  paletaIndex: 0,
  stableColors: true,
  seed: 1234,

  // grid
  colunas: 10,
  linhas: 8,
  espacoCol: 128,
  espacoLin: 128,
  rotacao: 0,

  // wave
  waveSize: 20,
  waveLength: 0.5,
  waveOffset: 0.5,
  waveSpeed: 0.05,

  // shape params
  fatiaAng: 60,
  gearTeeth: 12,

  // bg color (hex for dat.GUI)
  bgHex: "#00FF00",

  // actions
  gerarPaleta: () => {
    paletas.unshift(gerarPaletaHEX(guiState.tipoPaleta));
    guiState.paletaIndex = 0;
    rebuildPaletteController();
    updateSwatchesBar();
    regenerateColorGrid();
  },
  uploadSVG: () => {
    const inp=document.getElementById("svgUpload");
    if (inp) inp.click();
  },
  salvarPNG: () => {
    try{ const t=frameCount; redrawAtTime(t); saveCanvas(cnv,"visuals","png"); }catch(e){logError(e);}
  },
  exportarSVG: () => {
    try{ const t=frameCount; exportSVGAtTime(t); }catch(e){logError(e);}
  },
  toggleDebug: () => {
    const dbg=document.getElementById("debugBox");
    if (!dbg) return;
    dbg.style.display = (dbg.style.display==="none" || !dbg.style.display) ? "block" : "none";
  },
  record: () => toggleRecording(),
};

function initDatGUI(){
  if (!window.dat || !dat.GUI) return;

  gui = new dat.GUI();

  // Canvas folder
  const fCanvas = gui.addFolder("Canvas");
  guiControllers.res = fCanvas.add(guiState, "resolucao", ["1920x1080","2560x1440","3840x2160"]).name("Resolução")
    .onChange((v)=>{ makeCanvasByRes(v); maskResizeSync(); });
  fCanvas.open();

  // Shape folder
  const fShape = gui.addFolder("Forma");
  guiControllers.forma = fShape.add(guiState, "forma", getFormaOptions()).name("Tipo")
    .onChange(()=>{ /* nothing special */ });
  fShape.add(guiState, "uploadSVG").name("Upload SVG → custom");
  fShape.add(guiState, "diametro", 10, 800, 1).name("Tamanho (d)");
  const fShapeParams = fShape.addFolder("Parâmetros");
  fShapeParams.add(guiState, "fatiaAng", 5, 360, 1).name("Fatia (°)");
  fShapeParams.add(guiState, "gearTeeth", 4, 40, 1).name("Engrenagem dentes");
  fShape.open();
  fShapeParams.open();

  // Palette folder
  const fPal = gui.addFolder("Paleta");
  fPal.add(guiState, "tipoPaleta", ["monocromatica","analoga","complementar","triadica"]).name("Tipo");
  guiControllers.pal = fPal.add(guiState, "paletaIndex", getPaletteOptions()).name("Atual")
    .onChange(()=>{ updateSwatchesBar(); regenerateColorGrid(); });
  fPal.add(guiState, "gerarPaleta").name("Gerar paleta");
  fPal.add(guiState, "stableColors").name("Cores estáveis").onChange(()=>regenerateColorGrid());
  fPal.add(guiState, "seed", 0, 9999999, 1).name("Seed").onChange(()=>regenerateColorGrid());
  fPal.open();

  // Grid folder
  const fGrid = gui.addFolder("Grid");
  fGrid.add(guiState, "colunas", 1, 60, 1).name("Colunas").onChange(()=>regenerateColorGrid());
  fGrid.add(guiState, "linhas", 1, 60, 1).name("Linhas").onChange(()=>regenerateColorGrid());
  fGrid.add(guiState, "espacoCol", 20, 300, 1).name("Espaço X");
  fGrid.add(guiState, "espacoLin", 20, 300, 1).name("Espaço Y");
  fGrid.add(guiState, "rotacao", 0, 360, 1).name("Rotação (°)");
  fGrid.open();

  // Wave folder
  const fWave = gui.addFolder("Wave");
  fWave.add(guiState, "waveSize", 0, 300, 1).name("waveSize");
  fWave.add(guiState, "waveLength", 0, 2, 0.01).name("waveLength");
  fWave.add(guiState, "waveOffset", 0, 2, 0.01).name("waveOffset");
  fWave.add(guiState, "waveSpeed", 0, 0.2, 0.005).name("waveSpeed");
  fWave.open();

  // Colors folder
  const fColors = gui.addFolder("Cores");
  guiControllers.bg = fColors.addColor(guiState, "bgHex").name("Fundo").onChange(()=>{/* background reads live */});
  fColors.open();

  // Export folder
  const fExport = gui.addFolder("Export");
  fExport.add(guiState, "salvarPNG").name("Salvar PNG");
  fExport.add(guiState, "exportarSVG").name("Exportar SVG");
  fExport.open();

  // Record folder
  const fRec = gui.addFolder("Record");
  fRec.add(guiState, "record").name("Start/Stop");
  fRec.open();

  // Debug
  const fDbg = gui.addFolder("Debug");
  fDbg.add(guiState, "toggleDebug").name("Mostrar/ocultar debug");
  fDbg.open();

  // Hook SVG input
  const svgInp = document.getElementById("svgUpload");
  if (svgInp) svgInp.addEventListener("change", onUploadSVG);

  updateSwatchesBar();
}

function maskResizeSync(){
  // ensure any internal buffers match canvas if needed
  // (no-op today, but kept for future expansions)
}

function getPaletteOptions(){
  // dat.GUI accepts an object map label->value
  const map={};
  for (let i=0;i<paletas.length;i++) map[`Paleta ${i+1}`]=i;
  return map;
}

function rebuildPaletteController(){
  if (!gui || !guiControllers.pal) return;
  const f = guiControllers.pal.__gui; // folder
  f.remove(guiControllers.pal);
  guiControllers.pal = f.add(guiState, "paletaIndex", getPaletteOptions()).name("Atual")
    .onChange(()=>{ updateSwatchesBar(); regenerateColorGrid(); });
}

function getFormaOptions(){
  // include base shapes + custom shapes
  const base = [
    "circulo","retangulo","triangulo","estrela","poligono:5","estrelaK:7","losango","capsula","anel","fatia","coracao","engrenagem:12","squircle"
  ];
  const custom = Object.keys(customShapes||{}).map(k=>`custom:${k}`);
  return [...base, ...custom];
}

function rebuildFormaController(){
  if (!gui || !guiControllers.forma) return;
  const f = guiControllers.forma.__gui;
  f.remove(guiControllers.forma);
  guiControllers.forma = f.add(guiState, "forma", getFormaOptions()).name("Tipo");
}

function updateSwatchesBar(){
  const bar=document.getElementById("swatchesBar");
  if (!bar) return;
  bar.innerHTML="";
  const paleta = paletas[+guiState.paletaIndex || 0] || paletas[0];
  (paleta||[]).forEach(c=>{
    const d=document.createElement("div");
    d.className="sw"; d.style.background=c;
    bar.appendChild(d);
  });
}

// --- Params ---

function hexToRgb(hex){
  const h = (hex||"#000000").replace("#","").trim();
  const full = (h.length===3) ? (h[0]+h[0]+h[1]+h[1]+h[2]+h[2]) : h.padEnd(6,"0").slice(0,6);
  const n = parseInt(full,16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}

function params(){
  const paleta = paletas[+guiState.paletaIndex || 0] || paletas[0];
  const bg = hexToRgb(guiState.bgHex);
  return {
    forma: guiState.forma,
    paleta,
    d:+guiState.diametro,
    cols:+guiState.colunas,
    rows:+guiState.linhas,
    rotDeg:+guiState.rotacao,
    spacingX:+guiState.espacoCol,
    spacingY:+guiState.espacoLin,
    wave:{
      size:+guiState.waveSize,
      length:+guiState.waveLength,
      offset:+guiState.waveOffset,
      speed:+guiState.waveSpeed
    },
    fatiaAngDeg:+guiState.fatiaAng,
    gearTeeth:+guiState.gearTeeth,
    bg,
    stableColors: !!guiState.stableColors,
    seed:+guiState.seed || 0
  };
}

// --- Paletas ---
function rand(min,max){return Math.random()*(max-min)+min;}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function gerarPaletaHEX(tipo="monocromatica"){
  const h=rand(0,360), s=rand(55,80), l=rand(40,60);
  switch(tipo){
    case "analoga": return gerarAnaloga(h,s,l);
    case "complementar": return gerarComplementar(h,s,l);
    case "triadica": return gerarTriadica(h,s,l);
    default: return gerarMonocromatica(h,s,l);
  }
}
function hslToHex(h,s,l){
  s/=100; l/=100; const c=(1-Math.abs(2*l-1))*s; const x=c*(1-Math.abs(((h/60)%2)-1)); const m=l-c/2;
  let r=0,g=0,b=0;
  if (0<=h && h<60){r=c;g=x;b=0;}
  else if (60<=h && h<120){r=x;g=c;b=0;}
  else if (120<=h && h<180){r=0;g=c;b=x;}
  else if (180<=h && h<240){r=0;g=x;b=c;}
  else if (240<=h && h<300){r=x;g=0;b=c;}
  else {r=c;g=0;b=x;}
  const R=Math.round((r+m)*255), G=Math.round((g+m)*255), B=Math.round((b+m)*255);
  return "#" + [R,G,B].map(v=>v.toString(16).padStart(2,"0")).join("").toUpperCase();
}
function gerarMonocromatica(h,s,l){ const vs=[-15,-5,0,10,20], vl=[-20,-5,0,10,20]; const out=[]; for(let i=0;i<5;i++) out.push(hslToHex(h,clamp(s+vs[i],35,90),clamp(l+vl[i],25,85))); return out; }
function gerarAnaloga(h,s,l){ const hs=[h-60,h-30,h,h+30,h+60]; return hs.map((hh,i)=>hslToHex((hh+360)%360,clamp(s+(i-2)*5,40,90),clamp(l+(2-i)*4,30,80))); }
function gerarComplementar(h,s,l){ const comp=(h+180)%360,hs=[h-10,h,h+10,comp-10,comp+10]; return hs.map((hh,i)=>hslToHex((hh+360)%360,clamp(s+(i-2)*6,40,90),clamp(l+((i%2)?-6:+6),30,80))); }
function gerarTriadica(h,s,l){ const h1=(h+120)%360,h2=(h+240)%360,hs=[h-8,h,h1,h2,h2+12]; return hs.map((hh,i)=>hslToHex((hh+360)%360,clamp(s+(i-2)*5,45,90),clamp(l+(i===2?+6:-2),30,80))); }

// --- Cores estáveis ---
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function regenerateColorGrid(){
  const P=params();
  colorGrid=Array.from({length:P.rows},()=>Array(P.cols).fill("#000"));
  if (!P.stableColors) return;
  const rng=mulberry32(P.seed>>>0);
  for(let j=0;j<P.rows;j++){
    for(let i=0;i<P.cols;i++){
      const h=((i+1)*73856093 ^ (j+1)*19349663)>>>0;
      const r=(rng() + (h%997)/997)%1;
      const idx=Math.floor(r*P.paleta.length)%P.paleta.length;
      colorGrid[j][i]=P.paleta[idx];
    }
  }
}
function getCellColor(i,j, paleta, stable){
  if (stable && colorGrid[j] && colorGrid[j][i]) return colorGrid[j][i];
  return paleta[Math.floor(Math.random()*paleta.length)];
}

// --- Main draw ---
function draw(){ try{ drawAtTime(frameCount); }catch(e){logError(e);} }
function redrawAtTime(t){ try{ drawAtTime(t); }catch(e){logError(e);} }
function cellPos(i,j,t,P){
  const angle = i*P.wave.length + j*P.wave.offset + t*P.wave.speed;
  const wx=Math.cos(angle)*P.wave.size, wy=Math.sin(angle)*P.wave.size;
  const x = P.spacingX + i*P.spacingX + wx;
  const y = P.spacingY + j*P.spacingY + wy;
  return {x,y};
}
function drawAtTime(t){
  const P=params();
  background(P.bg.r,P.bg.g,P.bg.b);
  noStroke();
  const rot=radians(P.rotDeg);

  for (let i=0;i<P.cols;i++){
    for (let j=0;j<P.rows;j++){
      const {x,y}=cellPos(i,j,t,P);
      push();
      translate(x,y); rotate(rot);
      fill(getCellColor(i,j,P.paleta,P.stableColors));
      drawP5Shape(P.forma,P.d,P);
      pop();
    }
  }
}

// p5 shapes
function drawP5Shape(forma,d,P){
  const [base,paramStr]=forma.split(":"); const param=parseInt(paramStr||"0",10);
  if (base==="custom"){ const def=customShapes[paramStr]; if (def) drawCustomP5(def,d); else rectMode(CENTER),rect(0,0,d,d); return; }
  switch(base){
    case "circulo": ellipse(0,0,d,d); break;
    case "retangulo": rectMode(CENTER); rect(0,0,d,d); break;
    case "triangulo": triangle(0,-d/2,-d/2,d/2,d/2,d/2); break;
    case "estrela": drawStarP5(5,d/2,d/4); break;
    case "poligono": drawPolyP5(Math.max(3,param||5),d/2); break;
    case "estrelaK": drawStarP5(Math.max(3,param||7),d/2,d/4); break;
    case "losango": drawLosangoP5(d,d*0.6); break;
    case "capsula": drawCapsulaP5(d,d*0.5); break;
    case "anel": drawAnelP5(d,d*0.66); break;
    case "fatia": {
      const ang=radians(P.fatiaAngDeg);
      if (ang >= TWO_PI - 1e-6){ ellipse(0,0,d,d); }
      else drawFatiaP5(d,ang);
      break;
    }
    case "coracao": drawCoracaoP5(d); break;
    case "engrenagem": drawEngrenagemP5(P.gearTeeth||param||12,d/2,d*0.38); break;
    case "squircle": drawSquircleP5(d,4); break;
    default: rectMode(CENTER); rect(0,0,d,d);
  }
}
function drawPolyP5(n,r){ beginShape(); for(let i=0;i<n;i++){const a=-HALF_PI+i*TWO_PI/n; vertex(cos(a)*r,sin(a)*r);} endShape(CLOSE); }
function drawStarP5(k,r1,r2){ beginShape(); for(let i=0;i<2*k;i++){const a=-HALF_PI+i*PI/k; const r=(i%2===0)?r1:r2; vertex(cos(a)*r,sin(a)*r);} endShape(CLOSE); }
function drawLosangoP5(w,h){ beginShape(); vertex(0,-h/2);vertex(-w/2,0);vertex(0,h/2);vertex(w/2,0); endShape(CLOSE); }
function drawCapsulaP5(w,h){ const r=h/2; rectMode(CENTER); rect(0,0,w-2*r,h,r); }
function drawAnelP5(d,inner){ const R=d/2,r=inner/2,steps=96; beginShape(); for(let i=0;i<steps;i++){ const a=i*TWO_PI/steps; vertex(cos(a)*R,sin(a)*R); } beginContour(); for(let i=steps-1;i>=0;i--){ const a=i*TWO_PI/steps; vertex(cos(a)*r,sin(a)*r); } endContour(); endShape(CLOSE); }
function drawFatiaP5(d,ang){ const r=d/2,start=-HALF_PI,end=start+ang,steps=64; beginShape(); vertex(0,0); for(let s=0;s<=steps;s++){const a=start+(end-start)*s/steps; vertex(cos(a)*r,sin(a)*r);} endShape(CLOSE); }
function drawCoracaoP5(d){ const s=d/2; beginShape(); vertex(0,-0.3*s); bezierVertex(+0.5*s,-1.1*s,+1.3*s,+0.2*s,0,+0.9*s); bezierVertex(-1.3*s,+0.2*s,-0.5*s,-1.1*s,0,-0.3*s); endShape(CLOSE); }
function drawSquircleP5(d,n){ const a=d/2,b=d/2,steps=140; beginShape(); for(let t=0;t<steps;t++){ const th=-PI+2*PI*t/(steps-1), ct=Math.cos(th), st=Math.sin(th); const x=Math.sign(ct)*Math.pow(Math.abs(ct),2/n)*a, y=Math.sign(st)*Math.pow(Math.abs(st),2/n)*b; vertex(x,y);} endShape(CLOSE); }
function drawEngrenagemP5(teeth,rOuter,rInner){ teeth=Math.max(4,Math.floor(teeth)); beginShape(); for(let i=0;i<2*teeth;i++){ const a=-HALF_PI+i*PI/teeth; const r=(i%2===0)?rOuter:rInner; vertex(cos(a)*r,sin(a)*r);} endShape(CLOSE); }

// --- Custom canonical (unit sets) ---
async function onUploadSVG(e){
  const file=e.target.files[0]; if(!file) return;
  let text=await file.text();
  text=text.replace("\ufeff","");
  const name=file.name.replace(/\.[^/.]+$/,"").replace(/\W+/g,"_").toLowerCase();
  const unit = canonicalizeSVGToUnitSets(text);
  if (!unit){ alert("Não consegui ler geometria do SVG."); return; }
  customShapes[name]={ unit };
  adicionarFormaAoDropdown(name);
}
function adicionarFormaAoDropdown(name){
  // dat.GUI: add custom shape option and select it
  guiState.forma = "custom:" + name;
  rebuildFormaController();
}

function canonicalizeSVGToUnitSets(svgText){
  try{
    const doc=new DOMParser().parseFromString(svgText,"image/svg+xml");
    const svgNS="http://www.w3.org/2000/svg";
    const ptsSets=[]; const xs=[], ys=[];
    function samplePath(dstr, samples=320){
      const temp=document.createElementNS(svgNS,"svg");
      const path=document.createElementNS(svgNS,"path");
      path.setAttribute("d", dstr);
      temp.appendChild(path);
      const len=path.getTotalLength(); const pts=[];
      for(let i=0;i<=samples;i++){ const p=path.getPointAtLength(len*i/samples); pts.push({x:p.x,y:p.y}); }
      return pts;
    }
    doc.querySelectorAll("path,polygon,polyline,rect,circle,ellipse").forEach(el=>{
      let set=null;
      if (el.tagName==="path"){ const d=el.getAttribute("d")||""; if (d) set=samplePath(d,360); }
      else if (el.tagName==="polygon"||el.tagName==="polyline"){
        const raw=(el.getAttribute("points")||"").trim().split(/[\s,]+/).map(Number);
        if (raw.length>=4){ set=[]; for(let i=0;i<raw.length;i+=2) set.push({x:raw[i],y:raw[i+1]}); }
      } else if (el.tagName==="rect"){
        const x=+el.getAttribute("x")||0, y=+el.getAttribute("y")||0, w=+el.getAttribute("width")||0, h=+el.getAttribute("height")||0;
        if (w>0&&h>0) set=[{x:x,y:y},{x:x+w,y:y},{x:x+w,y:y+h},{x:x,y:y+h}];
      } else if (el.tagName==="circle" || el.tagName==="ellipse"){
        const cx=+el.getAttribute("cx")||0, cy=+el.getAttribute("cy")||0, rx=+(el.getAttribute("r")||el.getAttribute("rx")||0), ry=+(el.getAttribute("ry")||rx);
        const N=180; set=[]; for(let i=0;i<N;i++){ const a=i*TWO_PI/N; set.push({x:cx+Math.cos(a)*rx,y:cy+Math.sin(a)*ry}); }
      }
      if (set && set.length){ ptsSets.push(set); set.forEach(p=>{ xs.push(p.x); ys.push(p.y); }); }
    });
    if (!ptsSets.length){
      const vb=(doc.documentElement.getAttribute("viewBox")||"").trim().split(/[\s,]+/).map(Number);
      if (vb.length===4){ const [x,y,w,h]=vb; const set=[{x:x,y:y},{x:x+w,y:y},{x:x+w,y:y+h},{x:x,y:y+h}]; ptsSets.push(set); set.forEach(p=>{ xs.push(p.x); ys.push(p.y); }); }
      else return null;
    }
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
    let w=maxX-minX, h=maxY-minY; if (!(w>0&&h>0)){ w=1; h=1; }
    const scale=1/Math.max(w,h); const cx=minX+w/2, cy=minY+h/2;
    const unitSets = ptsSets.map(set=> set.map(p=>({x:(p.x-cx)*scale, y:(p.y-cy)*scale})));
    return { sets:unitSets };
  }catch(e){ logError(e); return null; }
}
function drawCustomP5(def,d){
  if (!def || !def.unit) return;
  const s=d;
  def.unit.sets.forEach(set=>{
    beginShape();
    set.forEach(p=> vertex(p.x*s, p.y*s));
    endShape(CLOSE);
  });
}

// --- Export SVG (fill por elemento) ---
function exportSVGAtTime(t){
  const P=params();
  const drawSVG = SVG().size(W,H);
  drawSVG.viewbox(0,0,W,H);
  drawSVG.rect(W,H).attr({ fill:`rgb(${P.bg.r},${P.bg.g},${P.bg.b})` });

  for(let i=0;i<P.cols;i++){
    for(let j=0;j<P.rows;j++){
      const {x,y}=cellPos(i,j,t,P);
      const color=getCellColor(i,j,P.paleta,P.stableColors);
      drawSVGShape(drawSVG,P.forma,P.d,P.rotDeg,x,y,color,P);
    }
  }

  const blob=new Blob([drawSVG.svg()],{type:"image/svg+xml"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="visuals.svg"; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function donutPath(cx,cy,R,r){
  // two concentric circles as arcs, using evenodd fill rule
  const d = [
    `M ${cx-R} ${cy}`,
    `a ${R} ${R} 0 1 0 ${2*R} 0`,
    `a ${R} ${R} 0 1 0 ${-2*R} 0`,
    `M ${cx-r} ${cy}`,
    `a ${r} ${r} 0 1 1 ${2*r} 0`,
    `a ${r} ${r} 0 1 1 ${-2*r} 0`,
    "Z"
  ].join(" ");
  return d;
}

function drawSVGShape(drawSVG, forma, d, rotDeg, x, y, color, P){
  const [base,paramStr]=forma.split(":"); const param=parseInt(paramStr||"0",10);
  switch(base){
    case "circulo": { const el=drawSVG.circle(d).center(x,y).rotate(rotDeg,x,y); el.attr({fill:color}); return; }
    case "retangulo": { const el=drawSVG.rect(d,d).center(x,y).rotate(rotDeg,x,y); el.attr({fill:color}); return; }
    case "triangulo": {
      const pts=[x,y-d/2, x-d/2,y+d/2, x+d/2,y+d/2];
      const el=drawSVG.polygon(pts.join(",")); el.attr({fill:color}); el.rotate(rotDeg,x,y); return;
    }
    case "estrela": {
      const r1=d/2,r2=d/4,pts=[]; for(let k=0;k<10;k++){ const a=-Math.PI/2+k*Math.PI/5; const r=(k%2===0)?r1:r2; pts.push(x+Math.cos(a)*r, y+Math.sin(a)*r); }
      const el=drawSVG.polygon(pts.join(",")); el.attr({fill:color}); el.rotate(rotDeg,x,y); return;
    }
    case "poligono": {
      const n=Math.max(3,param||5), r=d/2, pts=[]; for(let k=0;k<n;k++){ const a=-Math.PI/2+k*2*Math.PI/n; pts.push(x+Math.cos(a)*r, y+Math.sin(a)*r); }
      const el=drawSVG.polygon(pts.join(",")); el.attr({fill:color}); el.rotate(rotDeg,x,y); return;
    }
    case "estrelaK": {
      const k=Math.max(3,param||7), r1=d/2,r2=d/4, pts=[]; for(let t2=0;t2<2*k;t2++){ const a=-Math.PI/2+t2*Math.PI/k; const r=(t2%2===0)?r1:r2; pts.push(x+Math.cos(a)*r, y+Math.sin(a)*r); }
      const el=drawSVG.polygon(pts.join(",")); el.attr({fill:color}); el.rotate(rotDeg,x,y); return;
    }
    case "losango": {
      const w=d,h=d*0.6, pts=[x,y-h/2, x-w/2,y, x,y+h/2, x+w/2,y];
      const el=drawSVG.polygon(pts.join(",")); el.attr({fill:color}); el.rotate(rotDeg,x,y); return;
    }
    case "capsula": {
      const w=d,h=d*0.5,r=h/2; const g=drawSVG.group();
      g.rect(w-2*r,h).center(x,y).radius(r).attr({fill:color});
      g.circle(h).center(x-w/2+r,y).attr({fill:color});
      g.circle(h).center(x+w/2-r,y).attr({fill:color});
      g.rotate(rotDeg,x,y); return;
    }
    case "anel": {
      const R=d/2, r=d*0.33;
      const p = drawSVG.path(donutPath(x,y,R,r));
      p.attr({ fill: color, 'fill-rule': 'evenodd' });
      p.rotate(rotDeg, x, y);
      return;
    }
    case "fatia": {
      const angDeg = P.fatiaAngDeg||60;
      if (angDeg >= 360 - 1e-6){
        const el=drawSVG.circle(d).center(x,y).rotate(rotDeg,x,y); el.attr({fill:color});
        return;
      }
      const r=d/2,start=-Math.PI/2,end=start+radians(angDeg),steps=64,pts=[x,y];
      for(let s=0;s<=steps;s++){ const a=start+(end-start)*s/steps; pts.push(x+Math.cos(a)*r,y+Math.sin(a)*r); }
      const el=drawSVG.polygon(pts.join(",")); el.attr({fill:color}); el.rotate(rotDeg,x,y); return;
    }
    case "coracao": {
      const s=d/2; const path=`M ${x} ${y-0.3*s} C ${x+0.5*s} ${y-1.1*s}, ${x+1.3*s} ${y+0.2*s}, ${x} ${y+0.9*s} C ${x-1.3*s} ${y+0.2*s}, ${x-0.5*s} ${y-1.1*s}, ${x} ${y-0.3*s} Z`;
      const p=drawSVG.path(path); p.attr({fill:color}); p.rotate(rotDeg,x,y); return;
    }
    case "squircle": {
      const n=4,a=d/2,b=d/2,steps=140, pts=[];
      for(let t=0;t<steps;t++){ const th=-Math.PI+2*Math.PI*t/(steps-1); const ct=Math.cos(th), st=Math.sin(th);
        const xx=Math.sign(ct)*Math.pow(Math.abs(ct),2/n)*a, yy=Math.sign(st)*Math.pow(Math.abs(st),2/n)*b; pts.push(x+xx,y+yy); }
      const el=drawSVG.polygon(pts.join(",")); el.attr({fill:color}); el.rotate(rotDeg,x,y); return;
    }
    case "engrenagem": {
      const teeth=Math.max(4,P.gearTeeth||param||12), rOuter=d/2, rInner=d*0.38, pts=[];
      for(let i=0;i<2*teeth;i++){ const a=-Math.PI/2+i*Math.PI/teeth; const r=(i%2===0)?rOuter:rInner; pts.push(x+Math.cos(a)*r,y+Math.sin(a)*r); }
      const el=drawSVG.polygon(pts.join(",")); el.attr({fill:color}); el.rotate(rotDeg,x,y); return;
    }
    case "custom": return drawCustomSVG(drawSVG, forma, d, rotDeg, x, y, color);
  }
}

function drawCustomSVG(drawSVG, forma, d, rotDeg, x, y, color){
  const key=forma.split(":")[1]; const def=customShapes[key]; if (!def || !def.unit) return;
  const s=d;
  const cell=drawSVG.group(); cell.translate(x,y); cell.rotate(rotDeg,x,y);
  def.unit.sets.forEach(set=>{
    const flat=[]; set.forEach(p=>{ flat.push(p.x*s, p.y*s); });
    const el = cell.polygon(flat.join(",")); el.attr({ fill: color, stroke: null, "stroke-width": null });
  });
}

// --- Recording ---
function toggleRecording(){
  if (!isRecording) startRecording(); else stopRecording();
}
function startRecording(){
  const btn=document.getElementById("btnRecord");
  const stream=cnv.elt.captureStream(60);
  const mime=MediaRecorder.isTypeSupported("video/webm;codecs=vp9")?"video/webm;codecs=vp9":(MediaRecorder.isTypeSupported("video/webm;codecs=vp8")?"video/webm;codecs=vp8":"video/webm");
  recordedChunks=[];
  try{ recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6_000_000}); }catch(e){ alert("MediaRecorder não suportado."); return; }
  recorder.ondataavailable=e=>{ if (e.data && e.data.size) recordedChunks.push(e.data); };
  recorder.onstop=()=>{ const blob=new Blob(recordedChunks,{type:"video/webm"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="visuals_capture.webm"; a.click(); URL.revokeObjectURL(url); };
  recorder.start(100); isRecording=true; if (btn) btn.textContent="⏹ Stop Recording";
}
function stopRecording(){ const btn=document.getElementById("btnRecord"); if (recorder && isRecording) recorder.stop(); isRecording=false; if (btn) btn.textContent="🎥 Start Recording"; }
