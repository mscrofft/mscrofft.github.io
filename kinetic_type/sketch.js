// Kinetic Type — bootstrap, UI wiring, render loop.

const ASPECTS = {
  '1:1':  { w: 1080, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
  '4:5':  { w: 1080, h: 1350 },
};

const PALETTES = [
  { name: 'blue/black',  bg: '#eaeaea', a: '#000000', b: '#1c3df5' },
  { name: 'noir',        bg: '#0a0a0a', a: '#f0ece3', b: '#d4b87a' },
  { name: 'paper',       bg: '#f0ece3', a: '#0a0a0a', b: '#e60023' },
  { name: 'ocean',       bg: '#0b1f2a', a: '#e8eef0', b: '#5ad7ff' },
  { name: 'lime',        bg: '#c4ff3d', a: '#0f2b33', b: '#ffffff' },
  { name: 'pink-maroon', bg: '#f5a8dc', a: '#7a1e1e', b: '#0a0a0a' },
  { name: 'sangue',      bg: '#1a0606', a: '#e8c8b0', b: '#c44a2a' },
  { name: 'verde',       bg: '#0e1a14', a: '#b8d4b8', b: '#d4f25b' },
  { name: 'editorial',   bg: '#1c1a17', a: '#d4b87a', b: '#f0ece3' },
  { name: 'glitch',      bg: '#0a0a0a', a: '#ff00aa', b: '#00ffd5' },
];

const DEFAULT_STATE = {
  text: 'A',
  fontFamily: 'Playfair Display',
  fontWeight: '700',
  aspect: '1:1',
  durationMs: 4000,
  loops: 3,
  gifScale: 0.5,
  fps: 30,
  effectId: 'verticalSlice',
  effectParams: {},
  palette: { bg: '#eaeaea', colorA: '#000000', colorB: '#1c3df5' },
};

const state = {
  ...structuredClone(DEFAULT_STATE),
  playing: true,
  t: 0,
  startTime: performance.now(),
};

const STORAGE_KEY = 'kinetic_type_state';
const SAVED_KEYS = ['text','fontFamily','fontWeight','aspect','durationMs','loops','gifScale','effectId','effectParams','palette'];

function saveState() {
  try {
    const o = {};
    for (const k of SAVED_KEYS) o[k] = state[k];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch (e) {}
}

let _saveTimer = null;
function saveStateSoon() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveState, 200);
}

function loadState() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return; }
  if (!saved) return;
  for (const k of SAVED_KEYS) {
    if (k === 'effectParams' || k === 'palette') continue;
    if (saved[k] !== undefined) state[k] = saved[k];
  }
  if (saved.palette) Object.assign(state.palette, saved.palette);
  // effectParams merged later, after defaults are known (applyLoadedParams)
  state._savedParams = saved.effectParams;
}

const $ = id => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const a = ASPECTS[state.aspect];
  canvas.width = a.w;
  canvas.height = a.h;
}

function currentGlyph() {
  return Glyph.build({
    text: state.text || ' ',
    fontFamily: state.fontFamily,
    fontWeight: state.fontWeight,
    targetW: canvas.width,
    targetH: canvas.height,
    padding: 0.08,
  });
}

function renderFrame(t) {
  state.t = t;
  const eff = Effects.get(state.effectId);
  if (!eff) return;
  const g = currentGlyph();
  eff.draw({
    ctx, W: canvas.width, H: canvas.height,
    mask: g.mask, bbox: g.bbox, t, p: state.effectParams, palette: state.palette,
  });
}

// Re-render the current frame immediately when paused, so UI tweaks give
// instant feedback instead of waiting for play/scrub.
function requestRender() {
  if (!state.playing) renderFrame(state.t);
  saveStateSoon();
}

// Web fonts load asynchronously; the first render (and any switch to a font
// not yet loaded) can measure/paint a fallback face. Once the real font is
// ready we invalidate the glyph cache and repaint.
function ensureFontThenRender(family, weight) {
  if (document.fonts && document.fonts.load) {
    document.fonts.load(`${weight} 40px "${family}"`).then(() => {
      Glyph.cache = null;
      renderFrame(state.t);
    }).catch(() => {});
  }
}

function loop() {
  if (state.playing) {
    const elapsed = (performance.now() - state.startTime) % state.durationMs;
    const t = elapsed / state.durationMs;
    renderFrame(t);
    $('scrubber').value = Math.round(t * 1000);
    $('time-label').textContent = (t * (state.durationMs / 1000)).toFixed(2) + 's';
  }
  requestAnimationFrame(loop);
}

// ─────────── UI ───────────
function buildEffectSelect() {
  const sel = $('in-effect');
  sel.innerHTML = '';
  for (const e of Effects.list()) {
    const o = document.createElement('option');
    o.value = e.id; o.textContent = e.name;
    sel.appendChild(o);
  }
  sel.value = state.effectId;
}

function loadEffectDefaults() {
  const eff = Effects.get(state.effectId);
  state.effectParams = Effects.defaults(eff);
}

function buildEffectParams() {
  const eff = Effects.get(state.effectId);
  const host = $('effect-params');
  host.innerHTML = '';
  for (const p of eff.params) {
    const row = document.createElement('div');
    row.className = 'param-row';
    if (p.type === 'range') {
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `<span>${p.label}</span>`;
      // Editable numeric field synced with the slider.
      const num = document.createElement('input');
      num.type = 'number';
      num.className = 'param-num';
      num.min = p.min; num.max = p.max; num.step = p.step;
      num.value = state.effectParams[p.id];
      meta.appendChild(num);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = p.min; input.max = p.max; input.step = p.step;
      input.value = state.effectParams[p.id];
      const apply = (v, from) => {
        if (isNaN(v)) return;
        state.effectParams[p.id] = v;
        if (from !== 'range') input.value = v;
        if (from !== 'num') num.value = v;
        requestRender();
      };
      input.addEventListener('input', () => apply(parseFloat(input.value), 'range'));
      num.addEventListener('input', () => apply(parseFloat(num.value), 'num'));
      row.appendChild(meta);
      row.appendChild(input);
    } else if (p.type === 'select') {
      const lbl = document.createElement('label');
      lbl.textContent = p.label;
      const sel = document.createElement('select');
      for (const op of p.options) {
        const o = document.createElement('option');
        o.value = op; o.textContent = op;
        sel.appendChild(o);
      }
      sel.value = state.effectParams[p.id];
      sel.addEventListener('change', () => { state.effectParams[p.id] = sel.value; requestRender(); });
      lbl.appendChild(sel);
      row.appendChild(lbl);
    } else if (p.type === 'checkbox') {
      const lbl = document.createElement('label');
      lbl.textContent = p.label;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!state.effectParams[p.id];
      cb.addEventListener('change', () => { state.effectParams[p.id] = cb.checked; requestRender(); });
      lbl.appendChild(cb);
      row.appendChild(lbl);
    } else if (p.type === 'color') {
      const lbl = document.createElement('label');
      lbl.textContent = p.label;
      const cp = document.createElement('input');
      cp.type = 'color'; cp.value = state.effectParams[p.id];
      cp.addEventListener('input', () => { state.effectParams[p.id] = cp.value; requestRender(); });
      lbl.appendChild(cp);
      row.appendChild(lbl);
    }
    host.appendChild(row);
  }
}

function buildPaletteGrid() {
  const host = $('palette-grid');
  host.innerHTML = '';
  PALETTES.forEach((pal, idx) => {
    const sw = document.createElement('div');
    sw.className = 'palette-swatch';
    sw.dataset.idx = idx;
    sw.style.background = `linear-gradient(135deg, ${pal.bg} 0% 33%, ${pal.a} 33% 66%, ${pal.b} 66% 100%)`;
    sw.title = pal.name;
    sw.addEventListener('click', () => {
      state.palette = { bg: pal.bg, colorA: pal.a, colorB: pal.b };
      $('in-bg').value = pal.bg;
      $('in-colorA').value = pal.a;
      $('in-colorB').value = pal.b;
      [...host.children].forEach(c => c.classList.remove('active'));
      sw.classList.add('active');
      requestRender();
    });
    host.appendChild(sw);
  });
}

// Merge persisted effectParams over the current effect's defaults, keeping only
// keys the effect still declares (protects against param-schema changes).
function applyLoadedParams() {
  if (!state._savedParams) return;
  const eff = Effects.get(state.effectId);
  if (eff) {
    for (const p of eff.params) {
      if (state._savedParams[p.id] !== undefined) {
        state.effectParams[p.id] = state._savedParams[p.id];
      }
    }
  }
  state._savedParams = null;
}

// Reflect the current palette into the swatch grid + color inputs.
function syncPaletteUI() {
  $('in-bg').value = state.palette.bg;
  $('in-colorA').value = state.palette.colorA;
  $('in-colorB').value = state.palette.colorB;
  const swatches = [...$('palette-grid').children];
  swatches.forEach(sw => {
    const pal = PALETTES[sw.dataset.idx];
    const match = pal && pal.bg === state.palette.bg && pal.a === state.palette.colorA && pal.b === state.palette.colorB;
    sw.classList.toggle('active', !!match);
  });
}

// Reflect all top-level inputs from state (used on load + reset + randomize).
function syncControlsUI() {
  $('in-text').value = state.text;
  $('in-font').value = state.fontFamily;
  $('in-weight').value = state.fontWeight;
  $('in-aspect').value = state.aspect;
  $('in-duration').value = state.durationMs / 1000;
  $('in-loops').value = state.loops;
  $('in-gif-scale').value = String(state.gifScale);
  $('in-effect').value = state.effectId;
  syncPaletteUI();
}

function randInStep(min, max, step) {
  const n = Math.floor(Math.random() * ((max - min) / step + 1));
  return +(min + n * step).toFixed(6);
}

function randomizeAll() {
  const effs = Effects.list();
  const eff = effs[Math.floor(Math.random() * effs.length)];
  state.effectId = eff.id;
  const pal = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  state.palette = { bg: pal.bg, colorA: pal.a, colorB: pal.b };
  // Randomize params
  const params = {};
  for (const p of eff.params) {
    if (p.type === 'range') params[p.id] = randInStep(p.min, p.max, p.step);
    else if (p.type === 'select') params[p.id] = p.options[Math.floor(Math.random() * p.options.length)];
    else if (p.type === 'checkbox') params[p.id] = Math.random() < 0.5;
    else params[p.id] = p.default;
  }
  state.effectParams = params;
  $('in-effect').value = state.effectId;
  buildEffectParams();
  syncPaletteUI();
  renderFrame(state.t);
  saveStateSoon();
}

function resetAll() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  Object.assign(state, structuredClone(DEFAULT_STATE));
  Glyph.clearCustomFont();
  Glyph.cache = null;
  resetDropZone();
  resizeCanvas();
  loadEffectDefaults();
  buildEffectParams();
  syncControlsUI();
  ensureFontThenRender(state.fontFamily, state.fontWeight);
  renderFrame(state.t);
}

function setFontInputsEnabled(on) {
  $('in-font').disabled = !on;
  $('in-weight').disabled = !on;
}

function resetDropZone() {
  const dz = $('drop-zone');
  dz.textContent = 'Ou arraste um arquivo .ttf / .otf aqui';
  dz.onclick = null;
  setFontInputsEnabled(true);
}

function wireInputs() {
  $('in-text').addEventListener('input', e => {
    state.text = e.target.value;
    Glyph.cache = null;
    requestRender();
  });
  $('in-font').addEventListener('change', e => {
    state.fontFamily = e.target.value;
    Glyph.clearCustomFont();
    Glyph.cache = null;
    resetDropZone();
    requestRender();
    ensureFontThenRender(state.fontFamily, state.fontWeight);
  });
  $('in-weight').addEventListener('change', e => {
    state.fontWeight = e.target.value;
    Glyph.cache = null;
    requestRender();
    ensureFontThenRender(state.fontFamily, state.fontWeight);
  });
  $('in-aspect').addEventListener('change', e => {
    state.aspect = e.target.value;
    resizeCanvas();
    Glyph.cache = null;
    requestRender();
  });
  $('in-duration').addEventListener('input', e => {
    const secs = parseFloat(e.target.value);
    state.durationMs = (isNaN(secs) || secs <= 0 ? 4 : secs) * 1000;
    state.startTime = performance.now();
    saveStateSoon();
  });
  $('in-loops').addEventListener('input', e => {
    state.loops = Math.max(1, parseInt(e.target.value, 10) || 1);
    saveStateSoon();
  });
  $('in-gif-scale').addEventListener('change', e => {
    state.gifScale = parseFloat(e.target.value);
    saveStateSoon();
  });
  for (const [id, k] of [['in-bg','bg'],['in-colorA','colorA'],['in-colorB','colorB']]) {
    $(id).addEventListener('input', e => { state.palette[k] = e.target.value; requestRender(); });
  }
  $('in-effect').addEventListener('change', e => {
    state.effectId = e.target.value;
    loadEffectDefaults();
    buildEffectParams();
    requestRender();
  });

  // Play / scrub
  $('btn-play').addEventListener('click', togglePlay);
  $('scrubber').addEventListener('input', e => {
    state.playing = false;
    $('btn-play').textContent = '▶';
    const t = parseFloat(e.target.value) / 1000;
    renderFrame(t);
    $('time-label').textContent = (t * (state.durationMs / 1000)).toFixed(2) + 's';
  });

  // OTF/TTF drop
  const dz = $('drop-zone');
  const setHover = on => dz.style.background = on ? 'rgba(255,255,255,0.06)' : '';
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); setHover(true); }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); setHover(false); }));
  dz.addEventListener('drop', async e => {
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const buf = await f.arrayBuffer();
    try {
      await Glyph.setCustomFontFromArrayBuffer(buf, f.name);
      dz.textContent = '✓ ' + f.name + ' (clique para limpar)';
      setFontInputsEnabled(false);
      dz.onclick = () => {
        Glyph.clearCustomFont();
        resetDropZone();
        requestRender();
      };
      requestRender();
    } catch (err) {
      dz.textContent = 'Falha ao ler fonte: ' + err.message;
    }
  });

  // Randomize / reset
  $('btn-random').addEventListener('click', randomizeAll);
  $('btn-reset').addEventListener('click', resetAll);

  // Keyboard shortcuts (ignore while typing in a field)
  document.addEventListener('keydown', e => {
    if (e.target instanceof Element && e.target.matches('input, textarea, select')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.code === 'ArrowLeft')  { e.preventDefault(); stepFrame(-1); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); stepFrame(1); }
    else if (e.key === 'r' || e.key === 'R') { randomizeAll(); }
  });

  // Export buttons
  $('btn-png').addEventListener('click', () => {
    Exporter.exportPNG({ canvas, filename: 'kinetic_' + (state.text || 'frame') });
  });
  $('btn-mp4').addEventListener('click', async () => {
    const wasPlaying = state.playing;
    state.playing = false;
    setStatus('Exportando MP4…');
    try {
      await Exporter.exportMP4({
        canvas, fps: state.fps, durationMs: state.durationMs, renderFrame,
        loops: state.loops,
        onProgress: pr => setStatus(`MP4 ${(pr*100).toFixed(0)}%`),
        filename: 'kinetic_' + (state.text || 'clip'),
      });
      setStatus('Pronto.');
    } catch (e) {
      setStatus('Erro: ' + e.message);
    }
    state.playing = wasPlaying;
    state.startTime = performance.now();
  });
  $('btn-gif').addEventListener('click', async () => {
    const wasPlaying = state.playing;
    state.playing = false;
    setStatus('Exportando GIF…');
    try {
      await Exporter.exportGIF({
        canvas, fps: 24, durationMs: state.durationMs, renderFrame,
        loops: state.loops,
        scale: state.gifScale,
        onProgress: pr => setStatus(`GIF ${(pr*100).toFixed(0)}%`),
        filename: 'kinetic_' + (state.text || 'clip'),
      });
      setStatus('Pronto.');
    } catch (e) {
      setStatus('Erro: ' + e.message);
    }
    state.playing = wasPlaying;
    state.startTime = performance.now();
  });
}

function setStatus(s) { $('status').textContent = s; }

function togglePlay() {
  state.playing = !state.playing;
  if (state.playing) state.startTime = performance.now() - state.t * state.durationMs;
  $('btn-play').textContent = state.playing ? '❚❚' : '▶';
}

// Advance/rewind one frame while paused (wraps within the loop).
function stepFrame(dir) {
  if (state.playing) togglePlay();
  const frames = Math.max(1, Math.round((state.durationMs / 1000) * state.fps));
  let t = state.t + dir / frames;
  t = ((t % 1) + 1) % 1;
  state.t = t;
  renderFrame(t);
  $('scrubber').value = Math.round(t * 1000);
  $('time-label').textContent = (t * (state.durationMs / 1000)).toFixed(2) + 's';
}

// ─────────── boot ───────────
function init() {
  loadState();               // hydrate state from localStorage (before UI build)
  resizeCanvas();
  buildPaletteGrid();
  buildEffectSelect();
  loadEffectDefaults();
  applyLoadedParams();       // merge saved params over defaults
  buildEffectParams();
  syncControlsUI();          // reflect state into DOM inputs
  wireInputs();
  if (window.UITheme) UITheme.mountInvertButton('#theme-toggle-container');
  ensureFontThenRender(state.fontFamily, state.fontWeight);
  loop();
}

init();
