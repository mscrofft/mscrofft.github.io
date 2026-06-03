/* sketch.js — orquestra UI + pipeline + render p5. */
(function () {
  const TG = window.TG;
  const { GRID, glyphAdvanceWidth } = TG.grid;
  const { flattenGlyph, glyphBBoxEm } = TG.primitives;
  const Alphabet = TG.alphabet;

  // ---------- estado ----------
  const state = {
    currentChar: 'A',
    mode: 'stroke',
    showSkeleton: false,
    edit: false,
    tool: 'line',
    snap: 0.5,
    uiMode: 'effects',
    stroke: { strokeWidth: 40, cap: 'round', join: 'round' },
    halftone: { shape: 'dots', spacing: 32, angle: 45, size: 22, gamma: 1.0 },
    fx: 'halftone',
  };

  // ---------- editor ----------
  const editor = {
    transform: { ox: 0, oy: 0, s: 1 },
    drag: null,           // { primIdx, endpoint, startGrid }
    pendingLine: null,    // { from:[gx,gy], to:[gx,gy] } durante add
    arcDraft: { pts: [], cursor: null }, // criação de arc por 3 cliques
    bezierDraft: { phase: 'idle', a: null, c1: null, b: null, c2: null, cursor: null },
    snapHint: null,       // {gx,gy} marca handle alvo destacado pelo snap
    selectedPrimIdx: -1,  // primitiva selecionada no editor de esqueleto
    hoverHandle: null,
  };

  // -- math util: circumcircle e fit de arc por 3 pontos --
  function circleFrom3Points(p1, p2, p3) {
    const ax = p1[0], ay = p1[1];
    const bx = p2[0], by = p2[1];
    const cx2 = p3[0], cy2 = p3[1];
    const d = 2 * (ax * (by - cy2) + bx * (cy2 - ay) + cx2 * (ay - by));
    if (Math.abs(d) < 1e-6) return null;
    const ax2 = ax*ax + ay*ay, bx2 = bx*bx + by*by, c2 = cx2*cx2 + cy2*cy2;
    const ux = (ax2 * (by - cy2) + bx2 * (cy2 - ay) + c2 * (ay - by)) / d;
    const uy = (ax2 * (cx2 - bx) + bx2 * (ax - cx2) + c2 * (bx - ax)) / d;
    const r = Math.hypot(ax - ux, ay - uy);
    return { cx: ux, cy: uy, r };
  }

  function arcFrom3Points(p1, p2, p3) {
    const c = circleFrom3Points(p1, p2, p3);
    if (!c) return null;
    const a1 = Math.atan2(p1[1] - c.cy, p1[0] - c.cx);
    const a2 = Math.atan2(p2[1] - c.cy, p2[0] - c.cx);
    let a3 = Math.atan2(p3[1] - c.cy, p3[0] - c.cx);
    // escolhe sweep que passa por a2 (sentido CCW em y-down: ângulos positivos)
    const TAU = Math.PI * 2;
    const norm = a => { while (a < 0) a += TAU; while (a >= TAU) a -= TAU; return a; };
    const da = norm(a3 - a1);
    const dm = norm(a2 - a1);
    let sweep;
    if (dm <= da) sweep = da;             // CCW (positivo) passa por a2
    else sweep = da - TAU;                // CW (negativo) passa por a2
    const a0deg = a1 * 180 / Math.PI;
    const a1deg = a0deg + sweep * 180 / Math.PI;
    return { type: 'arc', c: [c.cx, c.cy], r: c.r, a0: a0deg, a1: a1deg };
  }

  function arcEndpointsGrid(pr) {
    const a0 = pr.a0 * Math.PI / 180;
    const a1 = pr.a1 * Math.PI / 180;
    const am = (a0 + a1) / 2;
    return {
      start: [pr.c[0] + pr.r * Math.cos(a0), pr.c[1] + pr.r * Math.sin(a0)],
      mid:   [pr.c[0] + pr.r * Math.cos(am), pr.c[1] + pr.r * Math.sin(am)],
      end:   [pr.c[0] + pr.r * Math.cos(a1), pr.c[1] + pr.r * Math.sin(a1)],
      center:[pr.c[0], pr.c[1]],
    };
  }

  function currentPrims() {
    const src = TG.fontSource.getSource(state.currentChar);
    const prims = (src.kind === 'skeleton' ? src.prims : []) || [];
    return prims.map(p => JSON.parse(JSON.stringify(p)));
  }

  function currentPaths() {
    const src = TG.fontSource.getSource(state.currentChar);
    const paths = (src.kind === 'contour' ? src.paths : []) || [];
    return paths.map(sp => sp.map(c => Object.assign({}, c)));
  }

  // ---------- history (undo/redo) ----------
  const history = { stack: [], idx: -1, limit: 60, suspend: false };
  function _snap() {
    return {
      ch: state.currentChar,
      sourceId: TG.fontSource.state().sourceId,
      ov: JSON.stringify(TG.overrides.get(state.currentChar) || null),
    };
  }
  function historyPush() {
    if (history.suspend) return;
    history.stack = history.stack.slice(0, history.idx + 1);
    history.stack.push(_snap());
    if (history.stack.length > history.limit) history.stack.shift();
    history.idx = history.stack.length - 1;
  }
  function _applySnap(s) {
    if (!s) return;
    history.suspend = true;
    if (s.ch !== state.currentChar) state.currentChar = s.ch;
    if (s.ov === 'null') TG.overrides.clear(s.ch);
    else TG.overrides.set(s.ch, JSON.parse(s.ov));
    if (typeof refreshEditedDots === 'function') refreshEditedDots();
    recompute();
    history.suspend = false;
  }
  function historyUndo() {
    if (history.idx <= 0) return;
    // garante que o estado atual esteja no topo antes de voltar
    if (history.stack.length === 0) return;
    history.idx -= 1;
    _applySnap(history.stack[history.idx]);
  }
  function historyRedo() {
    if (history.idx >= history.stack.length - 1) return;
    history.idx += 1;
    _applySnap(history.stack[history.idx]);
  }

  function commitPrims(prims) {
    const src = TG.fontSource.getSource(state.currentChar);
    TG.overrides.set(state.currentChar, {
      kind: 'skeleton', prims,
      advanceWidth: src.advanceWidth,
    });
    historyPush();
    refreshEditedDot(state.currentChar);
    recompute();
  }

  function commitPaths(paths) {
    const src = TG.fontSource.getSource(state.currentChar);
    TG.overrides.set(state.currentChar, {
      kind: 'contour', paths,
      advanceWidth: src.advanceWidth,
    });
    historyPush();
    refreshEditedDot(state.currentChar);
    recompute();
  }

  function refreshEditedDot(ch) {
    const grid = document.getElementById('glyph-grid');
    if (!grid) return;
    const idx = TG.fontSource.listChars().indexOf(ch);
    if (idx < 0 || idx >= grid.children.length) return;
    grid.children[idx].classList.toggle('glyph-cell--edited', TG.overrides.has(ch));
  }
  function refreshEditedDots() {
    const grid = document.getElementById('glyph-grid');
    if (!grid) return;
    const chars = TG.fontSource.listChars();
    for (let i = 0; i < Math.min(chars.length, grid.children.length); i++) {
      grid.children[i].classList.toggle('glyph-cell--edited', TG.overrides.has(chars[i]));
    }
  }

  function screenToEm(sx, sy) {
    const { ox, oy, s } = editor.transform;
    const m = met();
    return [(sx - ox) / s, m.ascender - (sy - oy) / s];
  }
  function emToScreen(ex, ey) {
    const { ox, oy, s } = editor.transform;
    const m = met();
    return [ox + ex * s, oy + (m.ascender - ey) * s];
  }
  function screenToGrid(sx, sy) {
    const [emX, emY] = screenToEm(sx, sy);
    const gx = (emX - GRID.sideBearing) / TG.grid.cellW();
    const gy = (GRID.ascender - emY) / TG.grid.cellH();
    return [gx, gy];
  }
  function gridToScreen(gx, gy) {
    const [emX, emY] = TG.grid.gridToEm(gx, gy);
    return emToScreen(emX, emY);
  }

  function snapVal(v) {
    const q = state.snap || 0.5;
    return Math.round(v / q) * q;
  }

  function distSq(ax, ay, bx, by) { const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; }

  function findHandle(sx, sy) {
    const prims = TG.overrides.get(state.currentChar) || Alphabet.get(state.currentChar);
    const R2 = 12 * 12;
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      if (p.type === 'line') {
        const sa = gridToScreen(p.a[0], p.a[1]);
        if (distSq(sx, sy, sa[0], sa[1]) <= R2) return { primIdx: i, endpoint: 'a' };
        const sb = gridToScreen(p.b[0], p.b[1]);
        if (distSq(sx, sy, sb[0], sb[1]) <= R2) return { primIdx: i, endpoint: 'b' };
      } else if (p.type === 'arc') {
        const eps = arcEndpointsGrid(p);
        for (const key of ['start', 'mid', 'end', 'center']) {
          const sp = gridToScreen(eps[key][0], eps[key][1]);
          if (distSq(sx, sy, sp[0], sp[1]) <= R2) return { primIdx: i, endpoint: key };
        }
      } else if (p.type === 'bezier') {
        for (const key of ['a', 'c1', 'c2', 'b']) {
          const sp = gridToScreen(p[key][0], p[key][1]);
          if (distSq(sx, sy, sp[0], sp[1]) <= R2) return { primIdx: i, endpoint: key };
        }
      }
    }
    return null;
  }

  function pointSegDistSq(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx*dx + dy*dy || 1)));
    const cx = ax + dx * t, cy = ay + dy * t;
    return distSq(px, py, cx, cy);
  }

  function findContourHandle(sx, sy) {
    const src = TG.fontSource.getSource(state.currentChar);
    if (src.kind !== 'contour') return null;
    const paths = src.paths || [];
    const R2 = 12 * 12;
    for (let pi = 0; pi < paths.length; pi++) {
      const sp = paths[pi];
      for (let qi = 0; qi < sp.length; qi++) {
        const c = sp[qi];
        if (c.type === 'M' || c.type === 'L') {
          const s = emToScreen(c.x, c.y);
          if (distSq(sx, sy, s[0], s[1]) <= R2) return { pathIdx: pi, cmdIdx: qi, role: 'on' };
        } else if (c.type === 'Q') {
          const s1 = emToScreen(c.x1, c.y1);
          if (distSq(sx, sy, s1[0], s1[1]) <= R2) return { pathIdx: pi, cmdIdx: qi, role: 'c1' };
          const se = emToScreen(c.x, c.y);
          if (distSq(sx, sy, se[0], se[1]) <= R2) return { pathIdx: pi, cmdIdx: qi, role: 'on' };
        } else if (c.type === 'C') {
          const s1 = emToScreen(c.x1, c.y1);
          if (distSq(sx, sy, s1[0], s1[1]) <= R2) return { pathIdx: pi, cmdIdx: qi, role: 'c1' };
          const s2 = emToScreen(c.x2, c.y2);
          if (distSq(sx, sy, s2[0], s2[1]) <= R2) return { pathIdx: pi, cmdIdx: qi, role: 'c2' };
          const se = emToScreen(c.x, c.y);
          if (distSq(sx, sy, se[0], se[1]) <= R2) return { pathIdx: pi, cmdIdx: qi, role: 'on' };
        }
      }
    }
    return null;
  }

  function findPrimitiveAt(sx, sy) {
    const prims = TG.overrides.get(state.currentChar) || Alphabet.get(state.currentChar);
    const R2 = 10 * 10;
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      if (p.type === 'line') {
        const sa = gridToScreen(p.a[0], p.a[1]);
        const sb = gridToScreen(p.b[0], p.b[1]);
        if (pointSegDistSq(sx, sy, sa[0], sa[1], sb[0], sb[1]) <= R2) return i;
      } else if (p.type === 'arc') {
        // teste aproximado: amostra alguns pontos e testa
        const samples = TG.primitives.flattenPrimitive(p);
        for (let k = 1; k < samples.length; k++) {
          const [ax, ay] = samples[k - 1], [bx, by] = samples[k];
          const sa = emToScreen(ax, ay);
          const sb = emToScreen(bx, by);
          const sax = sa[0], say = sa[1];
          const sbx = sb[0], sby = sb[1];
          if (pointSegDistSq(sx, sy, sax, say, sbx, sby) <= R2) return i;
        }
      } else if (p.type === 'bezier') {
        const samples = TG.primitives.flattenPrimitive(p);
        for (let k = 1; k < samples.length; k++) {
          const [ax, ay] = samples[k - 1], [bx, by] = samples[k];
          const sa = emToScreen(ax, ay);
          const sb = emToScreen(bx, by);
          if (pointSegDistSq(sx, sy, sa[0], sa[1], sb[0], sb[1]) <= R2) return i;
        }
      }
    }
    return -1;
  }

  // ---------- helpers de snap a handles + constrain de ângulo ----------
  function handlePointsOf(pr) {
    if (pr.type === 'line') return [{ gx: pr.a[0], gy: pr.a[1] }, { gx: pr.b[0], gy: pr.b[1] }];
    if (pr.type === 'arc') {
      const e = arcEndpointsGrid(pr);
      return ['start', 'mid', 'end', 'center'].map(k => ({ gx: e[k][0], gy: e[k][1] }));
    }
    if (pr.type === 'bezier') return ['a','c1','c2','b'].map(k => ({ gx: pr[k][0], gy: pr[k][1] }));
    return [];
  }
  function snapToNearbyHandle(gx, gy, ignorePrimIdx) {
    const prims = TG.fontSource.getSource(state.currentChar).prims || [];
    const RADIUS_PX = 10;
    const sd = gridToScreen(gx, gy);
    let best = null, bestD = RADIUS_PX * RADIUS_PX;
    for (let i = 0; i < prims.length; i++) {
      if (i === ignorePrimIdx) continue;
      for (const c of handlePointsOf(prims[i])) {
        const sc = gridToScreen(c.gx, c.gy);
        const d = distSq(sd[0], sd[1], sc[0], sc[1]);
        if (d < bestD) { bestD = d; best = c; }
      }
    }
    if (best) { editor.snapHint = best; return [best.gx, best.gy]; }
    editor.snapHint = null;
    return [gx, gy];
  }
  function maybeConstrainAngle(p, ox, oy, nx, ny) {
    if (!p.keyIsDown(16)) return [nx, ny];
    const dx = nx - ox, dy = ny - oy;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return [nx, ny];
    const step = Math.PI / 12; // 15°
    const ang = Math.round(Math.atan2(dy, dx) / step) * step;
    return [ox + Math.cos(ang) * len, oy + Math.sin(ang) * len];
  }

  // ---------- pipeline ----------
  function met() { return TG.fontSource.metrics(); }

  function bboxFor(source) {
    const m = met();
    const aw = source.advanceWidth || TG.fontSource.defaultAdvance();
    return { minX: 0, maxX: aw, minY: m.descender, maxY: m.ascender };
  }

  function processGlyph(source) {
    if (!source) return { contours: [], polylines: [] };
    let polylines = [];
    if (source.kind === 'skeleton') {
      polylines = flattenGlyph(source.prims || []);
    } else if (source.kind === 'contour') {
      polylines = TG.fontSource.flattenPaths(source.paths || []);
    }
    if (!polylines.length) return { contours: [], polylines };
    const bbox = bboxFor(source);
    // imported contour usa render fill (mode='fill'); skeleton segue state.mode
    const mode = source.kind === 'contour'
      ? (state.mode === 'path' ? 'path' : 'fill')
      : state.mode;
    const input = {
      mode, polylines, bbox,
      strokeWidth: state.stroke.strokeWidth,
      cap: state.stroke.cap,
      join: state.stroke.join,
    };
    // pipeline simples: state.fx pode ser 'halftone' | 'hatching' | 'halftone+halftone-cross'
    const contours = [];
    const layers = state.fx.split('+');
    for (const layer of layers) {
      if (layer === 'halftone') {
        const fx = TG.effects.get('halftone');
        const out = fx.apply(input, state.halftone);
        for (const c of out) contours.push(c);
      } else if (layer === 'halftone-cross') {
        const fx = TG.effects.get('halftone');
        const params = Object.assign({}, state.halftone, { angle: (state.halftone.angle + 90) % 180 });
        const out = fx.apply(input, params);
        for (const c of out) contours.push(c);
      } else if (layer === 'hatching') {
        const fx = TG.effects.get('hatching');
        const out = fx.apply(input, { spacing: state.halftone.spacing, angle: state.halftone.angle, size: state.halftone.size });
        for (const c of out) contours.push(c);
      }
    }
    return { contours, polylines };
  }

  // ---------- p5 ----------
  let p5inst = null;
  let cachedContours = [];
  let cachedPolylines = [];
  let cachedSource = null;

  function recompute() {
    cachedSource = TG.fontSource.getSource(state.currentChar);
    const r = processGlyph(cachedSource);
    cachedContours = r.contours;
    cachedPolylines = r.polylines;
    if (p5inst) p5inst.redraw();
    renderStrip();
  }

  // ---------- preview de palavra/string ----------
  let stripCanvas = null;
  let stripText = 'Halftone TypeGen';

  function setupStrip() {
    const host = document.getElementById('strip-canvas');
    if (!host) return;
    const cv = document.createElement('canvas');
    cv.style.width = '100%'; cv.style.height = '100%';
    host.appendChild(cv);
    stripCanvas = cv;
    const txtEl = document.getElementById('strip-text');
    if (txtEl) {
      stripText = txtEl.value || '';
      txtEl.addEventListener('input', () => { stripText = txtEl.value; renderStrip(); });
    }
    new ResizeObserver(() => renderStrip()).observe(host);
  }

  function renderStrip() {
    if (!stripCanvas) return;
    const host = stripCanvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const W = host.clientWidth, H = host.clientHeight;
    stripCanvas.width = Math.max(2, Math.floor(W * dpr));
    stripCanvas.height = Math.max(2, Math.floor(H * dpr));
    const ctx = stripCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dark = document.body.getAttribute('data-theme') !== 'light';
    ctx.fillStyle = dark ? '#111' : '#fff';
    ctx.fillRect(0, 0, W, H);

    // mede largura total
    const chars = Array.from(stripText);
    let total = 0;
    const advances = [];
    for (const ch of chars) {
      const src = TG.fontSource.getSource(ch);
      advances.push(src.advanceWidth || TG.fontSource.defaultAdvance());
      total += advances[advances.length - 1];
    }
    if (total <= 0) return;

    const m = TG.fontSource.metrics();
    const fh = m.ascender - m.descender;
    const pad = 12;
    const sx = (W - pad * 2) / total;
    const sy = (H - pad * 2) / fh;
    const s = Math.min(sx, sy);
    const ox = (W - total * s) / 2;
    const oy = (H - fh * s) / 2;
    ctx.fillStyle = dark ? '#eee' : '#111';

    let cursor = 0;
    for (let i = 0; i < chars.length; i++) {
      const src = TG.fontSource.getSource(chars[i]);
      const r = processGlyph(src);
      // desenha contornos em em-units → tela
      for (const c of r.contours) {
        if (!c || c.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(ox + (cursor + c[0][0]) * s, oy + (m.ascender - c[0][1]) * s);
        for (let k = 1; k < c.length; k++) {
          ctx.lineTo(ox + (cursor + c[k][0]) * s, oy + (m.ascender - c[k][1]) * s);
        }
        ctx.closePath();
        ctx.fill('evenodd');
      }
      cursor += advances[i];
    }
  }

  const sketch = function (p) {
    let cw = 0, ch = 0;
    p.setup = function () {
      const host = document.getElementById('preview');
      cw = host.clientWidth; ch = host.clientHeight;
      const cv = p.createCanvas(cw, ch);
      cv.parent('preview');
      p.noLoop();
      p.pixelDensity(window.devicePixelRatio || 1);
      window.addEventListener('resize', () => {
        cw = host.clientWidth; ch = host.clientHeight;
        p.resizeCanvas(cw, ch);
        p.redraw();
      });
    };
    p.draw = function () {
      const dark = document.body.getAttribute('data-theme') !== 'light';
      p.background(dark ? 17 : 244);
      const fg = dark ? 238 : 17;
      const subtle = dark ? 80 : 200;

      const m = met();
      const src = cachedSource || TG.fontSource.getSource(state.currentChar);
      const aw = src.advanceWidth || TG.fontSource.defaultAdvance();
      const fh = m.ascender - m.descender;
      const margin = 40;
      const sx = (cw - margin * 2) / aw;
      const sy = (ch - margin * 2) / fh;
      const s = Math.min(sx, sy);
      const ox = (cw - aw * s) / 2;
      const oy = (ch - fh * s) / 2;
      editor.transform = { ox, oy, s };

      p.push();
      p.translate(ox, oy);
      p.scale(s, -s);
      p.translate(0, -m.ascender);

      // grade de fundo (apenas em edit mode e source skeleton)
      if (state.edit && src.kind === 'skeleton') {
        p.noFill(); p.stroke(dark ? 50 : 220); p.strokeWeight(1 / s);
        const cellW = TG.grid.cellW();
        const cellH = TG.grid.cellH();
        for (let gx = 0; gx <= Alphabet.W; gx++) {
          const [x, y0] = TG.grid.gridToEm(gx, 0);
          const [, y1] = TG.grid.gridToEm(gx, Alphabet.H);
          p.line(x, y0, x, y1);
        }
        for (let gy = -2; gy <= Alphabet.H + 1; gy++) {
          const [x0, y] = TG.grid.gridToEm(0, gy);
          const [x1] = TG.grid.gridToEm(Alphabet.W, gy);
          p.line(x0, y, x1, y);
        }
        // baseline e cap-line destacadas
        p.stroke(dark ? 90 : 170); p.strokeWeight(1.5 / s);
        const [bx0, by] = TG.grid.gridToEm(0, Alphabet.H);
        const [bx1] = TG.grid.gridToEm(Alphabet.W, Alphabet.H);
        p.line(bx0, by, bx1, by);
        const [tx0, ty] = TG.grid.gridToEm(0, 0);
        const [tx1] = TG.grid.gridToEm(Alphabet.W, 0);
        p.line(tx0, ty, tx1, ty);
      }

      // linhas de sidebearing/advance — sempre em edit mode
      if (state.edit) {
        const awEm = src.advanceWidth || TG.fontSource.defaultAdvance();
        p.stroke(dark ? 100 : 180); p.strokeWeight(1 / s);
        p.drawingContext.setLineDash([6 / s, 4 / s]);
        p.line(0, m.descender, 0, m.ascender);
        p.line(awEm, m.descender, awEm, m.ascender);
        p.drawingContext.setLineDash([]);
      }

      // skeleton overlay
      if (state.showSkeleton || state.edit) {
        p.noFill();
        p.stroke(state.edit ? (dark ? 200 : 60) : subtle);
        p.strokeWeight((state.edit ? 2.5 : 2) / s);
        for (const pl of cachedPolylines) {
          p.beginShape();
          for (const [x, y] of pl) p.vertex(x, y);
          p.endShape();
        }
      }

      if (!state.edit) {
        p.noStroke(); p.fill(fg);
        for (const c of cachedContours) {
          if (!c || c.length < 3) continue;
          p.beginShape();
          for (const [x, y] of c) p.vertex(x, y);
          p.endShape(p.CLOSE);
        }
      }
      p.pop();

      // overlay de handles em edit mode (em coordenadas de tela)
      if (state.edit && src.kind === 'contour') {
        const paths = (TG.overrides.get(state.currentChar) || {}).paths || src.paths || [];
        p.push();
        for (let pi = 0; pi < paths.length; pi++) {
          const sp = paths[pi];
          let prevOn = null;
          for (let qi = 0; qi < sp.length; qi++) {
            const c = sp[qi];
            if (c.type === 'M' || c.type === 'L') {
              const s = emToScreen(c.x, c.y);
              drawHandle(p, s[0], s[1], dark);
              prevOn = s;
            } else if (c.type === 'Q') {
              const sp1 = emToScreen(c.x1, c.y1);
              const sp2 = emToScreen(c.x, c.y);
              p.stroke(dark ? 120 : 160); p.strokeWeight(1);
              p.drawingContext.setLineDash([3, 3]);
              if (prevOn) p.line(prevOn[0], prevOn[1], sp1[0], sp1[1]);
              p.line(sp2[0], sp2[1], sp1[0], sp1[1]);
              p.drawingContext.setLineDash([]);
              p.noStroke(); p.fill(dark ? 200 : 80);
              p.ellipse(sp1[0], sp1[1], 6, 6);
              drawHandle(p, sp2[0], sp2[1], dark);
              prevOn = sp2;
            } else if (c.type === 'C') {
              const sc1 = emToScreen(c.x1, c.y1);
              const sc2 = emToScreen(c.x2, c.y2);
              const se  = emToScreen(c.x, c.y);
              p.stroke(dark ? 120 : 160); p.strokeWeight(1);
              p.drawingContext.setLineDash([3, 3]);
              if (prevOn) p.line(prevOn[0], prevOn[1], sc1[0], sc1[1]);
              p.line(se[0], se[1], sc2[0], sc2[1]);
              p.drawingContext.setLineDash([]);
              p.noStroke(); p.fill(dark ? 200 : 80);
              p.ellipse(sc1[0], sc1[1], 6, 6);
              p.ellipse(sc2[0], sc2[1], 6, 6);
              drawHandle(p, se[0], se[1], dark);
              prevOn = se;
            }
          }
        }
        p.pop();
      } else if (state.edit) {
        const prims = TG.fontSource.getSource(state.currentChar).prims || [];
        p.push();
        // destaque da primitiva selecionada
        if (editor.selectedPrimIdx >= 0 && prims[editor.selectedPrimIdx]) {
          const sel = prims[editor.selectedPrimIdx];
          p.noFill(); p.stroke(255, 200, 0); p.strokeWeight(3);
          const samples = TG.primitives.flattenPrimitive(sel);
          p.beginShape();
          for (const [ex, ey] of samples) {
            const sp = emToScreen(ex, ey);
            p.vertex(sp[0], sp[1]);
          }
          p.endShape();
        }
        for (let i = 0; i < prims.length; i++) {
          const pr = prims[i];
          if (pr.type === 'line') {
            const sa = gridToScreen(pr.a[0], pr.a[1]);
            const sb = gridToScreen(pr.b[0], pr.b[1]);
            drawHandle(p, sa[0], sa[1], dark);
            drawHandle(p, sb[0], sb[1], dark);
          } else if (pr.type === 'arc') {
            const eps = arcEndpointsGrid(pr);
            const sStart = gridToScreen(eps.start[0], eps.start[1]);
            const sMid   = gridToScreen(eps.mid[0],   eps.mid[1]);
            const sEnd   = gridToScreen(eps.end[0],   eps.end[1]);
            const sC     = gridToScreen(eps.center[0],eps.center[1]);
            drawHandle(p, sStart[0], sStart[1], dark);
            drawHandle(p, sEnd[0],   sEnd[1],   dark);
            p.noStroke(); p.fill(dark ? 200 : 60);
            p.ellipse(sMid[0], sMid[1], 7, 7);
            p.noFill(); p.stroke(dark ? 150 : 120); p.strokeWeight(1);
            p.ellipse(sC[0], sC[1], 9, 9);
          } else if (pr.type === 'bezier') {
            const sa  = gridToScreen(pr.a[0], pr.a[1]);
            const sb  = gridToScreen(pr.b[0], pr.b[1]);
            const sc1 = gridToScreen(pr.c1[0], pr.c1[1]);
            const sc2 = gridToScreen(pr.c2[0], pr.c2[1]);
            p.stroke(dark ? 120 : 160); p.strokeWeight(1); p.noFill();
            p.drawingContext.setLineDash([3, 3]);
            p.line(sa[0], sa[1], sc1[0], sc1[1]);
            p.line(sb[0], sb[1], sc2[0], sc2[1]);
            p.drawingContext.setLineDash([]);
            p.noStroke(); p.fill(dark ? 200 : 80);
            p.ellipse(sc1[0], sc1[1], 6, 6);
            p.ellipse(sc2[0], sc2[1], 6, 6);
            drawHandle(p, sa[0], sa[1], dark);
            drawHandle(p, sb[0], sb[1], dark);
          }
        }
        // pending arc draft preview
        if (state.tool === 'arc' && editor.arcDraft.pts.length) {
          p.noFill(); p.stroke(dark ? 240 : 20); p.strokeWeight(2);
          for (const pt of editor.arcDraft.pts) {
            const sp = gridToScreen(pt[0], pt[1]);
            p.ellipse(sp[0], sp[1], 8, 8);
          }
          if (editor.arcDraft.pts.length >= 1 && editor.arcDraft.cursor) {
            const a = gridToScreen(editor.arcDraft.pts[0][0], editor.arcDraft.pts[0][1]);
            const c = gridToScreen(editor.arcDraft.cursor[0], editor.arcDraft.cursor[1]);
            p.drawingContext.setLineDash([4, 4]);
            p.line(a[0], a[1], c[0], c[1]);
            p.drawingContext.setLineDash([]);
          }
          if (editor.arcDraft.pts.length === 2 && editor.arcDraft.cursor) {
            const preview = arcFrom3Points(editor.arcDraft.pts[0], editor.arcDraft.cursor, editor.arcDraft.pts[1]);
            // ^ usuário ainda vai escolher mid: enquanto move o mouse antes do 3o clique, cursor é o "mid"
            if (preview) {
              const samples = TG.primitives.flattenPrimitive(preview);
              p.stroke(dark ? 240 : 20); p.strokeWeight(2); p.noFill();
              p.beginShape();
              for (const [ex, ey] of samples) {
                const sp = emToScreen(ex, ey);
                p.vertex(sp[0], sp[1]);
              }
              p.endShape();
            }
          }
        }
        // pending bezier draft preview
        const bd = editor.bezierDraft;
        if (state.tool === 'bezier' && bd.phase !== 'idle') {
          p.noFill(); p.stroke(dark ? 240 : 20); p.strokeWeight(2);
          if (bd.a) { const sp = gridToScreen(bd.a[0], bd.a[1]); drawHandle(p, sp[0], sp[1], dark); }
          if (bd.b) { const sp = gridToScreen(bd.b[0], bd.b[1]); drawHandle(p, sp[0], sp[1], dark); }
          if (bd.c1) {
            const sp = gridToScreen(bd.c1[0], bd.c1[1]);
            p.noStroke(); p.fill(dark ? 200 : 80); p.ellipse(sp[0], sp[1], 6, 6);
            if (bd.a) {
              const sa = gridToScreen(bd.a[0], bd.a[1]);
              p.stroke(dark ? 120 : 160); p.strokeWeight(1); p.noFill();
              p.drawingContext.setLineDash([3, 3]); p.line(sa[0], sa[1], sp[0], sp[1]); p.drawingContext.setLineDash([]);
            }
          }
          if (bd.c2) {
            const sp = gridToScreen(bd.c2[0], bd.c2[1]);
            p.noStroke(); p.fill(dark ? 200 : 80); p.ellipse(sp[0], sp[1], 6, 6);
            if (bd.b) {
              const sbp = gridToScreen(bd.b[0], bd.b[1]);
              p.stroke(dark ? 120 : 160); p.strokeWeight(1); p.noFill();
              p.drawingContext.setLineDash([3, 3]); p.line(sbp[0], sbp[1], sp[0], sp[1]); p.drawingContext.setLineDash([]);
            }
          }
          // curva preview se temos a/c1 + cursor (fase 'waiting') ou a/c1/b/c2 (fase 'second')
          let previewBz = null;
          if (bd.phase === 'waiting' && bd.cursor) {
            previewBz = { type: 'bezier', a: bd.a, c1: bd.c1, b: bd.cursor, c2: [2*bd.cursor[0]-bd.c1[0], 2*bd.cursor[1]-bd.c1[1]] };
          } else if (bd.phase === 'second' || (bd.a && bd.c1 && bd.b && bd.c2)) {
            previewBz = { type: 'bezier', a: bd.a, c1: bd.c1, b: bd.b, c2: bd.c2 };
          } else if (bd.phase === 'first' && bd.a && bd.c1) {
            const sa = gridToScreen(bd.a[0], bd.a[1]);
            const sc = gridToScreen(bd.c1[0], bd.c1[1]);
            p.stroke(dark ? 240 : 20); p.strokeWeight(2);
            p.line(sa[0], sa[1], sc[0], sc[1]);
          }
          if (previewBz) {
            const samples = TG.primitives.flattenPrimitive(previewBz);
            p.stroke(dark ? 240 : 20); p.strokeWeight(2); p.noFill();
            p.beginShape();
            for (const [ex, ey] of samples) { const sp = emToScreen(ex, ey); p.vertex(sp[0], sp[1]); }
            p.endShape();
          }
        }

        // snap hint
        if (editor.snapHint) {
          const sp = gridToScreen(editor.snapHint.gx, editor.snapHint.gy);
          p.noFill(); p.stroke(dark ? 0 : 255, 200, 0); p.strokeWeight(2);
          p.ellipse(sp[0], sp[1], 14, 14);
        }

        // pending line preview
        if (editor.pendingLine) {
          const a = gridToScreen(editor.pendingLine.from[0], editor.pendingLine.from[1]);
          const b = gridToScreen(editor.pendingLine.to[0], editor.pendingLine.to[1]);
          p.stroke(dark ? 240 : 20); p.strokeWeight(2);
          p.line(a[0], a[1], b[0], b[1]);
          drawHandle(p, a[0], a[1], dark);
          drawHandle(p, b[0], b[1], dark);
        }
        p.pop();
      }
    };

    p.mousePressed = function () {
      if (!state.edit) return;
      if (p.mouseX < 0 || p.mouseY < 0 || p.mouseX > cw || p.mouseY > ch) return;
      const sx = p.mouseX, sy = p.mouseY;
      const src = TG.fontSource.getSource(state.currentChar);

      // contour: só arrasta âncoras existentes
      if (src.kind === 'contour') {
        const ch = findContourHandle(sx, sy);
        if (ch) {
          editor.drag = ch;
          p.redraw();
        }
        return;
      }

      // shift+click = deletar primitiva sob o cursor
      if (p.keyIsDown(16)) {
        const idx = findPrimitiveAt(sx, sy);
        if (idx >= 0) {
          const prims = currentPrims();
          prims.splice(idx, 1);
          commitPrims(prims);
        }
        return;
      }

      const h = findHandle(sx, sy);
      if (h) {
        historyPush(); // estado pré-drag
        editor.drag = h;
        editor.selectedPrimIdx = h.primIdx;
        editor.arcDraft.pts = [];
        editor.bezierDraft.phase = 'idle';
        p.redraw();
        return;
      }

      // se sem draft em andamento, clique sobre primitiva = seleção
      const noDraft = editor.arcDraft.pts.length === 0 && editor.bezierDraft.phase === 'idle';
      if (noDraft) {
        const idx = findPrimitiveAt(sx, sy);
        if (idx >= 0) {
          editor.selectedPrimIdx = idx;
          p.redraw();
          return;
        }
        editor.selectedPrimIdx = -1;
      }

      const [gx, gy] = screenToGrid(sx, sy);
      let sg = [snapVal(gx), snapVal(gy)];
      const snapped = snapToNearbyHandle(sg[0], sg[1], -1);
      sg = snapped;

      if (state.tool === 'arc') {
        editor.arcDraft.pts.push(sg);
        if (editor.arcDraft.pts.length === 3) {
          const [p1, p2, p3] = editor.arcDraft.pts;
          const arc = arcFrom3Points(p1, p2, p3);
          const prims = currentPrims();
          if (arc) prims.push(arc);
          else prims.push({ type: 'line', a: p1.slice(), b: p3.slice() });
          editor.arcDraft.pts = [];
          editor.arcDraft.cursor = null;
          commitPrims(prims);
        } else {
          p.redraw();
        }
        return;
      }

      if (state.tool === 'bezier') {
        const bd = editor.bezierDraft;
        if (bd.phase === 'idle' || bd.phase === 'done') {
          bd.a = sg.slice();
          bd.c1 = sg.slice();
          bd.phase = 'first';
        } else if (bd.phase === 'waiting') {
          bd.b = sg.slice();
          // c2 default = espelho de c1 em torno de b para tangente contínua
          bd.c2 = [2 * bd.b[0] - bd.c1[0], 2 * bd.b[1] - bd.c1[1]];
          bd.phase = 'second';
        }
        p.redraw();
        return;
      }

      // tool === 'line'
      editor.pendingLine = { from: sg, to: sg };
      p.redraw();
    };

    p.mouseDragged = function () {
      if (!state.edit) return;
      const sx = p.mouseX, sy = p.mouseY;
      const src = TG.fontSource.getSource(state.currentChar);

      if (src.kind === 'contour' && editor.drag) {
        const [emX, emY] = screenToEm(sx, sy);
        const paths = currentPaths();
        const { pathIdx, cmdIdx, role } = editor.drag;
        const cmd = paths[pathIdx] && paths[pathIdx][cmdIdx];
        if (cmd) {
          if (role === 'on') { cmd.x = emX; cmd.y = emY; }
          else if (role === 'c1') { cmd.x1 = emX; cmd.y1 = emY; }
          else if (role === 'c2') { cmd.x2 = emX; cmd.y2 = emY; }
          TG.overrides.set(state.currentChar, { kind: 'contour', paths, advanceWidth: src.advanceWidth });
          recompute();
        }
        return;
      }

      const [gx, gy] = screenToGrid(sx, sy);
      let sg = [snapVal(gx), snapVal(gy)];

      // bezier draft drag (define c1 or c2)
      const bd = editor.bezierDraft;
      if (state.tool === 'bezier' && (bd.phase === 'first' || bd.phase === 'second')) {
        if (bd.phase === 'first') {
          let [nx, ny] = maybeConstrainAngle(p, bd.a[0], bd.a[1], sg[0], sg[1]);
          bd.c1 = [nx, ny];
        } else {
          let [nx, ny] = maybeConstrainAngle(p, bd.b[0], bd.b[1], sg[0], sg[1]);
          bd.c2 = [nx, ny];
        }
        p.redraw();
        return;
      }

      if (editor.drag) {
        const prims = currentPrims();
        const pr = prims[editor.drag.primIdx];
        // ignora própria primitiva no snap-to-handle
        sg = snapToNearbyHandle(sg[0], sg[1], editor.drag.primIdx);
        if (pr && pr.type === 'line') {
          const ep = editor.drag.endpoint;
          const other = pr[ep === 'a' ? 'b' : 'a'];
          let [nx, ny] = maybeConstrainAngle(p, other[0], other[1], sg[0], sg[1]);
          pr[ep] = [nx, ny];
          TG.overrides.set(state.currentChar, { kind: 'skeleton', prims, advanceWidth: TG.fontSource.getSource(state.currentChar).advanceWidth });
          recompute();
        } else if (pr && pr.type === 'arc') {
          const eps = arcEndpointsGrid(pr);
          const ep = editor.drag.endpoint;
          if (ep === 'center') {
            const dx = sg[0] - eps.center[0];
            const dy = sg[1] - eps.center[1];
            pr.c = [pr.c[0] + dx, pr.c[1] + dy];
          } else {
            const start = ep === 'start' ? sg : eps.start;
            const mid   = ep === 'mid'   ? sg : eps.mid;
            const end   = ep === 'end'   ? sg : eps.end;
            const refit = arcFrom3Points(start, mid, end);
            if (refit) {
              pr.c = refit.c; pr.r = refit.r; pr.a0 = refit.a0; pr.a1 = refit.a1;
            }
          }
          TG.overrides.set(state.currentChar, { kind: 'skeleton', prims, advanceWidth: TG.fontSource.getSource(state.currentChar).advanceWidth });
          recompute();
        } else if (pr && pr.type === 'bezier') {
          const ep = editor.drag.endpoint;
          if ((ep === 'a' || ep === 'b') && p.keyIsDown(18)) { // Alt: move anchor + control juntos
            const oldAnchor = pr[ep].slice();
            const ctrlKey = ep === 'a' ? 'c1' : 'c2';
            const oldCtrl = pr[ctrlKey].slice();
            pr[ep] = sg.slice();
            pr[ctrlKey] = [oldCtrl[0] + (sg[0] - oldAnchor[0]), oldCtrl[1] + (sg[1] - oldAnchor[1])];
          } else {
            pr[ep] = sg.slice();
          }
          TG.overrides.set(state.currentChar, { kind: 'skeleton', prims, advanceWidth: TG.fontSource.getSource(state.currentChar).advanceWidth });
          recompute();
        }
      } else if (editor.pendingLine) {
        const f = editor.pendingLine.from;
        let [nx, ny] = maybeConstrainAngle(p, f[0], f[1], sg[0], sg[1]);
        [nx, ny] = snapToNearbyHandle(nx, ny, -1);
        editor.pendingLine.to = [nx, ny];
        p.redraw();
      }
    };

    p.mouseMoved = function () {
      if (!state.edit) return;
      if (state.tool === 'arc' && editor.arcDraft.pts.length) {
        const [gx, gy] = screenToGrid(p.mouseX, p.mouseY);
        editor.arcDraft.cursor = [snapVal(gx), snapVal(gy)];
        p.redraw();
      } else if (state.tool === 'bezier' && editor.bezierDraft.phase === 'waiting') {
        const [gx, gy] = screenToGrid(p.mouseX, p.mouseY);
        editor.bezierDraft.cursor = [snapVal(gx), snapVal(gy)];
        p.redraw();
      }
    };

    p.keyPressed = function () {
      if (p.keyCode === 27) { // ESC
        if (editor.arcDraft.pts.length) {
          editor.arcDraft.pts = [];
          editor.arcDraft.cursor = null;
          p.redraw();
        }
        if (editor.pendingLine) { editor.pendingLine = null; p.redraw(); }
        if (editor.bezierDraft.phase !== 'idle') {
          editor.bezierDraft = { phase: 'idle', a: null, c1: null, b: null, c2: null, cursor: null };
          p.redraw();
        }
        if (editor.selectedPrimIdx >= 0) { editor.selectedPrimIdx = -1; p.redraw(); }
      }
    };

    p.mouseReleased = function () {
      if (!state.edit) return;

      // bezier creation transitions
      const bd = editor.bezierDraft;
      if (state.tool === 'bezier' && bd.phase === 'first') {
        bd.phase = 'waiting';
        p.redraw();
        return;
      }
      if (state.tool === 'bezier' && bd.phase === 'second') {
        const prims = currentPrims();
        prims.push({ type: 'bezier', a: bd.a.slice(), c1: bd.c1.slice(), c2: bd.c2.slice(), b: bd.b.slice() });
        editor.bezierDraft = { phase: 'idle', a: null, c1: null, b: null, c2: null, cursor: null };
        commitPrims(prims);
        return;
      }

      if (editor.drag) {
        editor.drag = null;
        editor.snapHint = null;
        historyPush();              // snapshot pós-drag
        refreshEditedDot(state.currentChar);
        recompute();
      } else if (editor.pendingLine) {
        const { from, to } = editor.pendingLine;
        if (from[0] !== to[0] || from[1] !== to[1]) {
          const prims = currentPrims();
          prims.push({ type: 'line', a: from.slice(), b: to.slice() });
          commitPrims(prims);
        }
        editor.pendingLine = null;
        editor.snapHint = null;
        p.redraw();
      }
    };
  };

  function drawHandle(p, x, y, dark) {
    p.noStroke();
    p.fill(dark ? 240 : 20);
    p.rect(x - 4, y - 4, 8, 8);
    p.stroke(dark ? 20 : 240); p.strokeWeight(1); p.noFill();
    p.rect(x - 4, y - 4, 8, 8);
  }

  // ---------- UI ----------
  function $(id) { return document.getElementById(id); }

  function bindRange(rangeId, numId, getter, setter) {
    const r = $(rangeId), n = $(numId);
    r.value = getter(); n.value = getter();
    const onR = () => { setter(parseFloat(r.value)); n.value = r.value; recompute(); };
    const onN = () => { setter(parseFloat(n.value)); r.value = n.value; recompute(); };
    r.addEventListener('input', onR);
    n.addEventListener('input', onN);
  }

  function bindSelect(id, getter, setter) {
    const el = $(id);
    el.value = getter();
    el.addEventListener('change', () => { setter(el.value); recompute(); });
  }

  function bindCheckbox(id, getter, setter) {
    const el = $(id);
    el.checked = getter();
    el.addEventListener('change', () => { setter(el.checked); recompute(); });
  }

  function buildGlyphGrid() {
    const grid = $('glyph-grid');
    grid.innerHTML = '';
    const chars = TG.fontSource.listChars();
    const max = 512; // limita para não travar com fontes enormes
    for (const ch of chars.slice(0, max)) {
      const cell = document.createElement('div');
      cell.className = 'glyph-cell' + (ch === state.currentChar ? ' active' : '') + (TG.overrides.has(ch) ? ' glyph-cell--edited' : '');
      cell.textContent = ch === ' ' ? '␣' : ch;
      cell.addEventListener('click', () => {
        state.currentChar = ch;
        editor.arcDraft.pts = []; editor.arcDraft.cursor = null; editor.selectedPrimIdx = -1;
        editor.pendingLine = null;
        editor.bezierDraft = { phase: 'idle', a: null, c1: null, b: null, c2: null, cursor: null };
        for (const c of grid.children) c.classList.remove('active');
        cell.classList.add('active');
        if (typeof window._tgSyncAdvanceUI === 'function') window._tgSyncAdvanceUI();
        recompute();
      });
      grid.appendChild(cell);
    }
  }

  function refreshPresetSelect() {
    const sel = $('preset-sel');
    sel.innerHTML = '';
    for (const p of TG.presets.load()) {
      const opt = document.createElement('option');
      opt.value = p.name; opt.textContent = p.name;
      sel.appendChild(opt);
    }
  }

  function applyPreset(p) {
    state.mode = p.mode || 'stroke';
    Object.assign(state.stroke, p.stroke || {});
    Object.assign(state.halftone, p.halftone || {});
    if (p.fx) state.fx = p.fx;
    // syncar UI
    if ($('fx-sel')) $('fx-sel').value = state.fx;
    $('mode-sel').value = state.mode;
    $('stroke-w').value = state.stroke.strokeWidth; $('stroke-w-n').value = state.stroke.strokeWidth;
    $('stroke-cap').value = state.stroke.cap;
    $('stroke-join').value = state.stroke.join;
    $('ht-shape').value = state.halftone.shape;
    $('ht-spacing').value = state.halftone.spacing; $('ht-spacing-n').value = state.halftone.spacing;
    $('ht-angle').value = state.halftone.angle; $('ht-angle-n').value = state.halftone.angle;
    $('ht-size').value = state.halftone.size; $('ht-size-n').value = state.halftone.size;
    $('ht-gamma').value = state.halftone.gamma; $('ht-gamma-n').value = state.halftone.gamma;
    $('preset-label').textContent = p.name;
    recompute();
  }

  function init() {
    // theme button
    if (window.UITheme && UITheme.mountInvertButton) {
      UITheme.mountInvertButton('#theme-slot');
    }

    bindSelect('mode-sel', () => state.mode, v => state.mode = v);
    function bindMirror(ids, getter, setter) {
      const els = ids.map(id => $(id)).filter(Boolean);
      els.forEach(el => { el.checked = getter(); });
      els.forEach(el => {
        el.addEventListener('change', () => {
          setter(el.checked);
          els.forEach(other => { if (other !== el) other.checked = el.checked; });
          recompute();
        });
      });
    }
    bindMirror(['show-skel', 'show-skel-import'], () => state.showSkeleton, v => state.showSkeleton = v);
    bindMirror(['edit-skel', 'edit-skel-import'], () => state.edit, v => {
      state.edit = v;
      editor.arcDraft.pts = []; editor.arcDraft.cursor = null; editor.selectedPrimIdx = -1;
      editor.pendingLine = null;
      const host = document.getElementById('preview');
      host.style.cursor = v ? 'crosshair' : 'default';
    });
    bindSelect('tool-sel', () => state.tool, v => {
      state.tool = v;
      editor.arcDraft.pts = []; editor.arcDraft.cursor = null; editor.selectedPrimIdx = -1;
      editor.pendingLine = null;
    });
    bindSelect('snap-sel', () => String(state.snap), v => state.snap = parseFloat(v));

    function resetGlyph() {
      TG.overrides.clear(state.currentChar);
      historyPush();
      refreshEditedDot(state.currentChar);
      recompute();
    }
    $('glyph-reset').addEventListener('click', resetGlyph);
    $('glyph-reset-import').addEventListener('click', resetGlyph);

    function mirrorPrim(pr, axis) {
      const W = Alphabet.W, H = Alphabet.H;
      const mp = (p) => axis === 'h' ? [W - p[0], p[1]] : [p[0], H - p[1]];
      if (pr.type === 'line') return { type: 'line', a: mp(pr.a), b: mp(pr.b) };
      if (pr.type === 'arc') {
        const c = mp(pr.c);
        let a0 = pr.a0, a1 = pr.a1;
        if (axis === 'h') { a0 = 180 - pr.a1; a1 = 180 - pr.a0; }
        else { a0 = -pr.a1; a1 = -pr.a0; }
        return { type: 'arc', c, r: pr.r, a0, a1 };
      }
      if (pr.type === 'bezier') return { type: 'bezier', a: mp(pr.a), c1: mp(pr.c1), c2: mp(pr.c2), b: mp(pr.b) };
      return pr;
    }
    function applyMirror(axis) {
      const src = TG.fontSource.getSource(state.currentChar);
      if (src.kind !== 'skeleton') return; // contour: skip
      const prims = currentPrims();
      const mirrored = prims.map(p => mirrorPrim(p, axis));
      commitPrims(prims.concat(mirrored));
    }
    $('glyph-mirror-h').addEventListener('click', () => applyMirror('h'));
    $('glyph-mirror-v').addEventListener('click', () => applyMirror('v'));

    // ----- per-glyph advance width -----
    function syncAdvanceUI() {
      const src = TG.fontSource.getSource(state.currentChar);
      const aw = Math.round(src.advanceWidth || TG.fontSource.defaultAdvance());
      const r = $('adv-w'), n = $('adv-w-n');
      if (r) r.value = aw;
      if (n) n.value = aw;
    }
    window._tgSyncAdvanceUI = syncAdvanceUI;
    function setAdvance(v) {
      const src = TG.fontSource.getSource(state.currentChar);
      const data = {
        kind: src.kind,
        advanceWidth: v,
      };
      if (src.kind === 'skeleton') data.prims = src.prims || [];
      else data.paths = src.paths || [];
      TG.overrides.set(state.currentChar, data);
      historyPush();
      refreshEditedDot(state.currentChar);
      recompute();
    }
    bindRange('adv-w', 'adv-w-n', () => {
      const src = TG.fontSource.getSource(state.currentChar);
      return Math.round(src.advanceWidth || TG.fontSource.defaultAdvance());
    }, setAdvance);
    $('adv-reset').addEventListener('click', () => {
      const ov = TG.overrides.get(state.currentChar);
      if (!ov) return;
      // remove só o advance override: usa default-advance e mantém prims/paths
      const data = { kind: ov.kind };
      if (ov.kind === 'skeleton') data.prims = ov.prims || [];
      else data.paths = ov.paths || [];
      data.advanceWidth = TG.fontSource.defaultAdvance();
      TG.overrides.set(state.currentChar, data);
      historyPush();
      syncAdvanceUI();
      recompute();
    });
    $('glyph-clear').addEventListener('click', () => {
      const src = TG.fontSource.getSource(state.currentChar);
      if (src.kind === 'contour') {
        TG.overrides.set(state.currentChar, { kind: 'contour', paths: [], advanceWidth: src.advanceWidth });
      } else {
        TG.overrides.set(state.currentChar, { kind: 'skeleton', prims: [], advanceWidth: src.advanceWidth });
      }
      historyPush();
      refreshEditedDot(state.currentChar);
      recompute();
    });

    // ----- atalhos undo / redo / delete -----
    document.addEventListener('keydown', (e) => {
      // ignora se foco em input/textarea/select
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const meta = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (meta && k === 'z' && !e.shiftKey) { e.preventDefault(); historyUndo(); return; }
      if (meta && ((k === 'z' && e.shiftKey) || k === 'y')) { e.preventDefault(); historyRedo(); return; }
      // Delete / Backspace remove primitiva selecionada
      if (state.edit && editor.selectedPrimIdx >= 0 && (e.key === 'Delete' || e.key === 'Backspace')) {
        const src = TG.fontSource.getSource(state.currentChar);
        if (src.kind !== 'skeleton') return;
        e.preventDefault();
        const prims = currentPrims();
        if (editor.selectedPrimIdx < prims.length) {
          prims.splice(editor.selectedPrimIdx, 1);
          editor.selectedPrimIdx = -1;
          commitPrims(prims);
        }
      }
    });

    bindRange('stroke-w', 'stroke-w-n', () => state.stroke.strokeWidth, v => state.stroke.strokeWidth = v);
    bindSelect('stroke-cap', () => state.stroke.cap, v => state.stroke.cap = v);
    bindSelect('stroke-join', () => state.stroke.join, v => state.stroke.join = v);

    bindSelect('fx-sel', () => state.fx, v => state.fx = v);
    bindSelect('ht-shape', () => state.halftone.shape, v => state.halftone.shape = v);
    bindRange('ht-spacing', 'ht-spacing-n', () => state.halftone.spacing, v => state.halftone.spacing = v);
    bindRange('ht-angle', 'ht-angle-n', () => state.halftone.angle, v => state.halftone.angle = v);
    bindRange('ht-size', 'ht-size-n', () => state.halftone.size, v => state.halftone.size = v);
    bindRange('ht-gamma', 'ht-gamma-n', () => state.halftone.gamma, v => state.halftone.gamma = v);

    // presets
    refreshPresetSelect();
    $('preset-sel').addEventListener('change', () => {
      const name = $('preset-sel').value;
      const p = TG.presets.load().find(x => x.name === name);
      if (p) applyPreset(p);
    });
    $('preset-save').addEventListener('click', () => {
      const name = $('preset-name').value.trim();
      if (!name) return;
      const p = { name, mode: state.mode, fx: state.fx, stroke: { ...state.stroke }, halftone: { ...state.halftone } };
      TG.presets.upsert(p);
      refreshPresetSelect();
      $('preset-sel').value = name;
      $('preset-label').textContent = name;
    });
    $('preset-export').addEventListener('click', () => {
      const txt = TG.presets.exportJSON();
      const blob = new Blob([txt], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'typegen-presets.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    $('preset-import').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'application/json';
      input.onchange = () => {
        const f = input.files[0]; if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          try { TG.presets.importJSON(reader.result); refreshPresetSelect(); }
          catch (e) { alert('JSON inválido: ' + e.message); }
        };
        reader.readAsText(f);
      };
      input.click();
    });

    $('reset-btn').addEventListener('click', () => {
      applyPreset({ name: '—', mode: 'stroke',
        stroke: { strokeWidth: 40, cap: 'round', join: 'round' },
        halftone: { shape: 'dots', spacing: 32, angle: 45, size: 22, gamma: 1.0 } });
    });

    // ----- modos de UI -----
    function applyUiMode() {
      const m = state.uiMode;
      document.querySelectorAll('section[data-mode]').forEach(sec => {
        const modes = (sec.dataset.mode || '').split(/\s+/);
        sec.classList.toggle('hidden', !modes.includes(m));
      });
      document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('tab--active', t.dataset.tab === m);
      });
      try { localStorage.setItem('typegen.uiMode', m); } catch (e) {}
    }
    function setUiMode(m) { state.uiMode = m; applyUiMode(); }
    document.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => setUiMode(t.dataset.tab));
    });

    // ----- source info / sync visual -----
    function refreshSourceUI() {
      const s = TG.fontSource.state();
      $('source-label').textContent = s.kind === 'imported' ? '· ' + s.fileName : '';
      const info = $('src-info');
      if (s.kind === 'imported') {
        const m = TG.fontSource.metrics();
        const n = TG.fontSource.listChars().length;
        info.innerHTML = `<b>${s.fileName}</b><br>família: ${TG.fontSource.familyHint()}<br>unitsPerEm: ${m.unitsPerEm} · asc/desc: ${m.ascender}/${m.descender}<br>glyphs: ${n}`;
      } else {
        info.textContent = 'Usando o esqueleto built-in.';
      }
      // desabilita stroke-width/cap/join quando contour
      const strokeIds = ['stroke-w','stroke-w-n','stroke-cap','stroke-join'];
      for (const id of strokeIds) {
        const el = $(id); if (!el) continue;
        el.disabled = s.kind === 'imported';
        const row = el.closest('.row'); if (row) row.style.opacity = s.kind === 'imported' ? .35 : 1;
      }
    }
    $('load-font-btn').addEventListener('click', () => $('font-file').click());
    $('font-file').addEventListener('change', async (ev) => {
      const file = ev.target.files[0]; if (!file) return;
      try {
        await TG.fontSource.loadFile(file);
        // primeiro char da nova fonte como current
        const list = TG.fontSource.listChars();
        state.currentChar = list.includes('A') ? 'A' : (list[0] || ' ');
        refreshSourceUI();
        buildGlyphGrid();
        recompute();
        setUiMode('import');
      } catch (e) { alert('Falha ao carregar fonte: ' + e.message); }
      ev.target.value = '';
    });
    $('tgsk-export').addEventListener('click', () => {
      const name = prompt('Nome do esqueleto:', 'TypeGen Skeleton') || 'TypeGen Skeleton';
      const includePresets = confirm('Incluir presets de efeito no arquivo?');
      const data = TG.skeletonIO.exportData({ name, includePresets });
      const safe = TG.exportFont.sanitizeForPS(name) || 'TypeGen';
      TG.skeletonIO.downloadJSON(`${safe}.tgsk.json`, data);
    });
    $('svg-import').addEventListener('click', () => $('svg-file').click());
    $('svg-file').addEventListener('change', async (ev) => {
      const files = Array.from(ev.target.files || []);
      if (!files.length) return;
      try {
        const n = await TG.skeletonIO.importSVGFiles(files);
        if (n > 0) {
          const first = files[0];
          // tentar focar no primeiro glyph importado
          const guess = TG.svgImport && first ? null : null; // grid update suficiente
          refreshSourceUI();
          buildGlyphGrid();
          recompute();
          alert(`${n} glyph(s) importado(s) com sucesso.`);
        } else {
          alert('Nenhum glyph reconhecido nos SVGs.');
        }
      } catch (e) { alert('Falha ao importar SVG: ' + e.message); }
      ev.target.value = '';
    });
    $('tgsk-import').addEventListener('click', () => $('tgsk-file').click());
    $('tgsk-file').addEventListener('change', (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          TG.skeletonIO.importJSONText(reader.result);
          state.currentChar = 'A';
          refreshSourceUI();
          refreshPresetSelect();
          buildGlyphGrid();
          recompute();
        } catch (e) { alert('Falha ao importar: ' + e.message); }
      };
      reader.readAsText(f);
      ev.target.value = '';
    });

    $('use-builtin-btn').addEventListener('click', () => {
      TG.fontSource.useBuiltin();
      state.currentChar = 'A';
      refreshSourceUI();
      buildGlyphGrid();
      recompute();
      if (state.uiMode === 'import') setUiMode('skeleton');
    });

    // exports
    $('export-svg').addEventListener('click', () => {
      const aw = cachedSource ? cachedSource.advanceWidth : TG.fontSource.defaultAdvance();
      const svg = TG.exportSVG.contoursToSVG(cachedContours, aw);
      TG.exportSVG.downloadSVG(svg, `typegen-${state.currentChar.charCodeAt(0).toString(16)}.svg`);
    });
    $('export-font').addEventListener('click', () => {
      const styleName = $('preset-label').textContent.trim() || 'Regular';
      const family = TG.fontSource.familyHint();
      const font = TG.exportFont.buildFont((ch, source) => {
        const r = processGlyph(source);
        return r.contours;
      }, { familyName: family + ' Halftone', styleName });
      const safe = TG.exportFont.sanitizeForPS(styleName);
      TG.exportFont.downloadFont(font, `${TG.exportFont.sanitizeForPS(family)}-${safe}.otf`);
    });

    refreshSourceUI();

    try {
      const saved = localStorage.getItem('typegen.uiMode');
      if (saved === 'effects' || saved === 'skeleton' || saved === 'import') state.uiMode = saved;
    } catch (e) {}
    applyUiMode();

    // re-render ao trocar tema
    document.addEventListener('ui-theme-change', () => { if (p5inst) p5inst.redraw(); renderStrip(); });
    setupStrip();

    buildGlyphGrid();
    p5inst = new p5(sketch);
    recompute();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
