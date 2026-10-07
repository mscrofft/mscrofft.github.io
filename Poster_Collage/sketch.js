/* Poster Collage — port JS do sketch Processing (Poster_Collage5.pde)
   Canvas 2D puro + UIPanel/UITheme (mesmo sistema visual de SVG_dither). */

/* ── estado ─────────────────────────────────────────────── */
const S = {
  cols: 16, rows: 9,
  p3: 0.26, p2: 0.46,
  useSeed: false, seed: 12345,
  paletteMode: 'Triádica',
  fixedPalette: 'Paleta 2',
  hue: 210,
  showGrid: false, showLabels: false,
  randomRotation: false,
  format: '16:9',
  gap: 0,
};

const FORMATS = {
  '16:9': 16 / 9, '1:1': 1, '4:5': 4 / 5, '3:4': 3 / 4, 'A (1:1.414)': 1 / 1.414, '9:16': 9 / 16,
};

const FIXED_PALETTES = {
  '—': null,
  'Paleta 1': ['#B1BCBB', '#507CDD', '#D0662E', '#1938A6', '#4C1A2B'],
  'Paleta 2': ['#FDC004', '#F374A7', '#FD5811', '#74673E', '#205332'],
  'Paleta 3': ['#EDF0EC', '#F0A63D', '#199484', '#DE242D', '#0E0809'],
  'Paleta 4': ['#E2E1E3', '#2095AF', '#E72528', '#6D3B92', '#0F1214'],
  'Paleta 5': ['#F7F8E7', '#CADB2E', '#55B84A', '#1C748F', '#1D194C'],
};

const DEFAULT_SVGS = Array.from({ length: 26 }, (_, i) => `data/sample_svg_${i + 1}.svg`);

let pool = [];          // { type:'svg'|'img', name, svgText?, vbW, vbH, nChildren, img? }
let placed = [];        // itens posicionados na grade
let palette = [];
let swatchEl = null;

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

/* ── RNG com seed (mulberry32) ──────────────────────────── */
let rng = Math.random;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── cor ────────────────────────────────────────────────── */
function hsb(h, s, b) { // h 0-360, s/b 0-100 → hex
  s /= 100; b /= 100; h = ((h % 360) + 360) % 360;
  const k = n => (n + h / 60) % 6;
  const f = n => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  const x = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + x(f(5)) + x(f(3)) + x(f(1));
}

function makePalette(mode, base, size = 5) {
  const out = [];
  for (let i = 0; i < size; i++) {
    if (mode === 'Triádica') {
      out.push(hsb(base + 120 * (i % 3), 70 + (i % 2 === 0 ? 25 : 0), 85));
    } else if (mode === 'Complementar') {
      out.push(hsb(base + 180 * (i % 2), 75, i % 3 === 0 ? 90 : 80));
    } else if (mode === 'Análoga') {
      out.push(hsb(base - 30 + 60 * (i / (size - 1)), 70, 85));
    } else { // Monocromática
      out.push(hsb(base, 40 + i * (60 / (size - 1)), 60 + i * (35 / (size - 1))));
    }
  }
  return out;
}

function regenPalette() {
  const fixed = FIXED_PALETTES[S.fixedPalette];
  palette = fixed ? fixed.slice() : makePalette(S.paletteMode, S.hue, 5);
  if (swatchEl) swatchEl.innerHTML = palette.map(c => `<i style="background:${c}"></i>`).join('');
}

/* ── carregamento de mídia ──────────────────────────────── */
function parseSvg(text, name) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
  let vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some(isNaN)) {
    const w = parseFloat(root.getAttribute('width')) || 100;
    const h = parseFloat(root.getAttribute('height')) || 100;
    vb = [0, 0, w, h];
  }
  return { type: 'svg', name, svgText: text, vbW: vb[2], vbH: vb[3], vb };
}

/* Recolore: cada filho de topo do SVG (exceto defs/style/title…) recebe uma cor da paleta.
   `counter` é o contador global compartilhado, como o IntWrapper do Processing. */
const SKIP = new Set(['defs', 'style', 'title', 'desc', 'metadata', 'clippath', 'mask', 'lineargradient', 'radialgradient']);
function recolorSvg(item, counter) {
  const doc = new DOMParser().parseFromString(item.svgText, 'image/svg+xml');
  const root = doc.documentElement;
  const kids = [...root.children].filter(k => !SKIP.has(k.nodeName.toLowerCase()));
  const paint = (el, color) => {
    el.setAttribute('fill', color);
    el.setAttribute('stroke', 'none');
    el.style.setProperty('fill', color, 'important');
    el.style.setProperty('stroke', 'none', 'important');
    el.removeAttribute('class');
    [...el.children].forEach(c => paint(c, color));
  };
  if (kids.length === 0) { counter.n++; }
  kids.forEach(k => { paint(k, palette[counter.n % palette.length]); counter.n++; });
  root.removeAttribute('width'); root.removeAttribute('height');
  root.setAttribute('viewBox', item.vb.join(' '));
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  root.querySelectorAll('style').forEach(s => s.remove());
  return new XMLSerializer().serializeToString(root);
}

function loadImageEl(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

async function loadDefaults() {
  const results = await Promise.all(DEFAULT_SVGS.map(async p => {
    try { const r = await fetch(p); if (!r.ok) return null; return parseSvg(await r.text(), p.split('/').pop()); }
    catch { return null; }
  }));
  pool = results.filter(Boolean);
}

async function addFiles(fileList) {
  for (const f of fileList) {
    if (/svg/i.test(f.type) || /\.svg$/i.test(f.name)) {
      const it = parseSvg(await f.text(), f.name); if (it) pool.push(it);
    } else if (/^image\//.test(f.type)) {
      const url = URL.createObjectURL(f);
      try { const img = await loadImageEl(url); pool.push({ type: 'img', name: f.name, img, vbW: img.width, vbH: img.height }); } catch {}
    }
  }
  refreshLayout();
}

/* ── layout (mesma lógica do refreshLayout) ─────────────── */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function refreshLayout() {
  if (!pool.length) { placed = []; render(); return; }
  rng = S.useSeed ? mulberry32(S.seed) : Math.random;
  const order = shuffle(pool.slice());
  const { cols, rows } = S;
  const next = [];
  const occ = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const free = (r, c, n) => {
    if (r + n > rows || c + n > cols) return false;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (occ[r + a][c + b]) return false;
    return true;
  };
  let idx = 0;
  const put = (r, c, n) => {
    const src = order[idx % order.length]; idx++;
    next.push({ src, row: r, col: c, span: n, rot: S.randomRotation ? Math.floor(rng() * 4) * Math.PI / 2 : 0 });
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) occ[r + a][c + b] = true;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (occ[r][c]) continue;
      if (rng() < S.p3 && free(r, c, 3)) { put(r, c, 3); continue; }
      if (rng() < S.p2 && free(r, c, 2)) { put(r, c, 2); continue; }
      put(r, c, 1);
    }
  }
  recolor(next);
}

/* Recolore e carrega as imagens dos SVGs. O layout novo só substitui o atual
   quando todas as imagens estão prontas — assim o canvas nunca fica vazio.
   Imagens já geradas ficam em cache (chave = SVG recolorido). */
const imgCache = new Map();
function cachedSvgImage(svgStr) {
  let p = imgCache.get(svgStr);
  if (!p) {
    if (imgCache.size > 600) imgCache.clear();
    const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml' }));
    p = loadImageEl(url).catch(() => null).finally(() => URL.revokeObjectURL(url));
    imgCache.set(svgStr, p);
  }
  return p;
}

let recolorToken = 0;
async function recolor(list = placed) {
  const token = ++recolorToken;
  const counter = { n: 0 };
  for (const p of list) if (p.src.type === 'svg') p.svgStr = recolorSvg(p.src, counter);
  await Promise.all(list.map(async p => {
    if (p.src.type === 'svg') p.el = await cachedSvgImage(p.svgStr);
  }));
  if (token !== recolorToken) return;   // chegou algo mais novo
  placed = list;
  render();
}

/* ── render ─────────────────────────────────────────────── */
function posterSize() {
  const ratio = FORMATS[S.format];
  const stage = document.getElementById('stage');
  const cs = getComputedStyle(stage);
  const aw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  let w = aw, h = aw / ratio;
  if (h > ah) { h = ah; w = ah * ratio; }
  return { w: Math.max(100, Math.floor(w)), h: Math.max(100, Math.floor(h)) };
}

function resize() {
  const { w, h } = posterSize();
  const dpr = window.devicePixelRatio || 1;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  render();
}

function geometry(W, H) {
  const cell = Math.min(W / S.cols, H / S.rows);
  return { cell, ox: (W - cell * S.cols) / 2, oy: (H - cell * S.rows) / 2 };
}

function render() {
  const bg = UITheme.get().bg;
  drawScene(ctx, cv.width, cv.height, bg);
}

function drawScene(g, W, H, bg, labels = true) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const { cell, ox, oy } = geometry(W, H);
  const gap = S.gap * cell * 0.5;

  for (const p of placed) {
    const x = ox + p.col * cell, y = oy + p.row * cell, w = p.span * cell, h = p.span * cell;
    const el = p.src.type === 'svg' ? p.el : p.src.img;
    if (el) {
      const iw = p.src.vbW, ih = p.src.vbH;
      const bw = w - gap * 2, bh = h - gap * 2;
      const s = Math.min(bw / iw, bh / ih);
      g.save();
      g.translate(x + w / 2, y + h / 2);
      g.rotate(p.rot);
      g.drawImage(el, -iw * s / 2, -ih * s / 2, iw * s, ih * s);
      g.restore();
    }
    if (labels && S.showLabels) {
      const barH = Math.max(14, cell * 0.18);
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y + h - barH, w, barH);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `${Math.max(10, cell * 0.12)}px "IBM Plex Mono", monospace`;
      g.fillText(p.src.name, x + w / 2, y + h - barH / 2, w);
    }
  }

  if (S.showGrid) {
    g.strokeStyle = 'rgba(128,128,128,.45)'; g.lineWidth = Math.max(1, cell * 0.01);
    for (let r = 0; r < S.rows; r++) for (let c = 0; c < S.cols; c++) g.strokeRect(ox + c * cell, oy + r * cell, cell, cell);
  }
  g.restore();
}

/* ── export ─────────────────────────────────────────────── */
function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function exportPNG() {
  const ratio = FORMATS[S.format], long = 4000;
  const W = ratio >= 1 ? long : Math.round(long * ratio), H = ratio >= 1 ? Math.round(long / ratio) : long;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  drawScene(c.getContext('2d'), W, H, UITheme.get().bg);
  c.toBlob(b => download(b, `poster_collage_${stamp()}.png`), 'image/png');
}

/* SVG vetorial (abre no Illustrator/Figma; de lá exporta para PDF) */
function exportSVG() {
  const ratio = FORMATS[S.format], W = 2000, H = Math.round(W / ratio);
  const { cell, ox, oy } = geometry(W, H);
  const gap = S.gap * cell * 0.5, bg = UITheme.get().bg;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${bg}"/>`;
  for (const p of placed) {
    const cx = ox + (p.col + p.span / 2) * cell, cy = oy + (p.row + p.span / 2) * cell;
    const iw = p.src.vbW, ih = p.src.vbH, s = Math.min((p.span * cell - gap * 2) / iw, (p.span * cell - gap * 2) / ih);
    const w = iw * s, h = ih * s, deg = p.rot * 180 / Math.PI;
    out += `<g transform="translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(${deg})">`;
    if (p.src.type === 'svg' && p.svgStr) {
      const inner = p.svgStr.replace(/^<svg[^>]*>/, m => `<svg x="${(-w / 2).toFixed(2)}" y="${(-h / 2).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" viewBox="${p.src.vb.join(' ')}" preserveAspectRatio="xMidYMid meet" overflow="hidden">`);
      out += inner;
    } else if (p.src.type === 'img') {
      const c = document.createElement('canvas'); c.width = iw; c.height = ih; c.getContext('2d').drawImage(p.src.img, 0, 0);
      out += `<image x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" xlink:href="${c.toDataURL('image/png')}"/>`;
    }
    out += '</g>';
  }
  out += '</svg>';
  download(new Blob([out], { type: 'image/svg+xml' }), `poster_collage_${stamp()}.svg`);
}

/* ── UI ─────────────────────────────────────────────────── */
function buildUI() {
  UITheme.init({ onToggle: () => render() });
  UIPanel.init('Poster Collage');
  const onOff = ['Off', 'On'];

  const grade = UIPanel.section('Grade');
  grade.select('Formato', Object.keys(FORMATS), { value: S.format, onChange: v => { S.format = v; resize(); } });
  grade.slider('Cols', { min: 1, max: 40, value: S.cols, onChange: v => { S.cols = v; refreshLayout(); } });
  grade.slider('Rows', { min: 1, max: 40, value: S.rows, onChange: v => { S.rows = v; refreshLayout(); } });
  grade.slider('3×3 %', { min: 0, max: 1, step: 0.01, value: S.p3, onChange: v => { S.p3 = v; refreshLayout(); } });
  grade.slider('2×2 %', { min: 0, max: 1, step: 0.01, value: S.p2, onChange: v => { S.p2 = v; refreshLayout(); } });
  grade.slider('Margem', { min: 0, max: 0.6, step: 0.01, value: S.gap, onChange: v => { S.gap = v; render(); } });
  grade.select('Show Grid', onOff, { value: 'Off', onChange: v => { S.showGrid = v === 'On'; render(); } });
  grade.select('Show Labels', onOff, { value: 'Off', onChange: v => { S.showLabels = v === 'On'; render(); } });

  const rand = UIPanel.section('Aleatório');
  rand.select('Use Seed', onOff, { value: 'Off', onChange: v => { S.useSeed = v === 'On'; refreshLayout(); } });
  rand.slider('Seed', { min: 0, max: 1000000, value: S.seed, onChange: v => { S.seed = v; if (S.useSeed) refreshLayout(); } });
  rand.button('Shuffle', () => refreshLayout());

  const cor = UIPanel.section('Paleta');
  cor.select('Modo', ['Triádica', 'Monocromática', 'Complementar', 'Análoga'], {
    value: S.paletteMode, onChange: v => { S.paletteMode = v; S.fixedPalette = '—'; fixedSel.setValue('—'); regenPalette(); recolor(); },
  });
  cor.slider('Matiz', { min: 0, max: 359, value: S.hue, onChange: v => { S.hue = v; S.fixedPalette = '—'; fixedSel.setValue('—'); regenPalette(); recolor(); } });
  const fixedSel = cor.select('Fixa', Object.keys(FIXED_PALETTES), {
    value: S.fixedPalette, onChange: v => { S.fixedPalette = v; regenPalette(); recolor(); },
  });
  swatchEl = document.createElement('div'); swatchEl.className = 'swatches';
  cor._body.appendChild(swatchEl);

  const rot = UIPanel.section('Rotação');
  rot.button('Rotate 90°', () => { placed.forEach(p => p.rot += Math.PI / 2); render(); });
  rot.select('Random Rotation', onOff, { value: 'Off', onChange: v => { S.randomRotation = v === 'On'; refreshLayout(); } });

  const mid = UIPanel.section('Mídia');
  mid.button('Adicionar SVG / imagens…', () => document.getElementById('files').click());
  mid.button('Limpar e usar só as minhas', () => { pool = []; placed = []; render(); document.getElementById('files').click(); });
  mid.button('Restaurar exemplos', async () => { await loadDefaults(); refreshLayout(); });

  const exp = UIPanel.section('Export');
  exp.button('Export PNG', exportPNG);
  exp.button('Export SVG (vetor)', exportSVG);

  document.getElementById('files').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => { e.preventDefault(); addFiles([...e.dataTransfer.files]); });
  window.addEventListener('resize', resize);
}

/* ── boot ───────────────────────────────────────────────── */
(async function () {
  buildUI();
  regenPalette();
  await loadDefaults();
  const hint = document.getElementById('hint');
  if (!pool.length) {
    hint.hidden = false;
    hint.innerHTML = 'Não foi possível carregar <b>data/</b> (abrindo via file://?). Rode um servidor local ou arraste seus SVGs/imagens aqui.';
  }
  resize();
  refreshLayout();
})();
