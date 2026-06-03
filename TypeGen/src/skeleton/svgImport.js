/* svgImport.js — converte SVG (Illustrator, Inkscape, Figma) em primitivas
   do esqueleto TypeGen. Suporta <line>, <polyline>, <circle>, <ellipse>
   e <path d="..."> com comandos M/L/H/V/C/S/Q/T/A/Z (absolutos e relativos). */
(function (global) {
  const TG = global.TG;

  // ---------- mini-parser de path data ----------
  function tokenize(d) {
    return d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
  }

  function parsePathD(d) {
    const tk = tokenize(d);
    const out = [];
    let cmd = null, i = 0;
    let cx = 0, cy = 0, sx = 0, sy = 0;
    let prevCubicCtl = null;
    let prevQuadCtl = null;
    const isCmd = (t) => /^[A-Za-z]$/.test(t);
    const num = () => parseFloat(tk[i++]);

    while (i < tk.length) {
      if (isCmd(tk[i])) { cmd = tk[i++]; }
      if (i >= tk.length) break;
      const lo = cmd.toLowerCase();
      const rel = cmd === lo;

      if (lo === 'm') {
        let x = num(), y = num();
        if (rel) { x += cx; y += cy; }
        cx = x; cy = y; sx = x; sy = y;
        prevCubicCtl = prevQuadCtl = null;
        cmd = rel ? 'l' : 'L';
      } else if (lo === 'l') {
        let x = num(), y = num();
        if (rel) { x += cx; y += cy; }
        out.push({ type: 'line', a: [cx, cy], b: [x, y] });
        cx = x; cy = y;
        prevCubicCtl = prevQuadCtl = null;
      } else if (lo === 'h') {
        let x = num(); if (rel) x += cx;
        out.push({ type: 'line', a: [cx, cy], b: [x, cy] });
        cx = x;
        prevCubicCtl = prevQuadCtl = null;
      } else if (lo === 'v') {
        let y = num(); if (rel) y += cy;
        out.push({ type: 'line', a: [cx, cy], b: [cx, y] });
        cy = y;
        prevCubicCtl = prevQuadCtl = null;
      } else if (lo === 'c') {
        let x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
        if (rel) { x1+=cx; y1+=cy; x2+=cx; y2+=cy; x+=cx; y+=cy; }
        out.push({ type: 'bezier', a: [cx, cy], c1: [x1, y1], c2: [x2, y2], b: [x, y] });
        prevCubicCtl = [x2, y2];
        prevQuadCtl = null;
        cx = x; cy = y;
      } else if (lo === 's') {
        let x2 = num(), y2 = num(), x = num(), y = num();
        if (rel) { x2+=cx; y2+=cy; x+=cx; y+=cy; }
        const x1 = prevCubicCtl ? 2*cx - prevCubicCtl[0] : cx;
        const y1 = prevCubicCtl ? 2*cy - prevCubicCtl[1] : cy;
        out.push({ type: 'bezier', a: [cx, cy], c1: [x1, y1], c2: [x2, y2], b: [x, y] });
        prevCubicCtl = [x2, y2];
        prevQuadCtl = null;
        cx = x; cy = y;
      } else if (lo === 'q') {
        let qx = num(), qy = num(), x = num(), y = num();
        if (rel) { qx+=cx; qy+=cy; x+=cx; y+=cy; }
        const cc1 = [cx + 2/3*(qx-cx), cy + 2/3*(qy-cy)];
        const cc2 = [x + 2/3*(qx-x),  y + 2/3*(qy-y)];
        out.push({ type: 'bezier', a: [cx, cy], c1: cc1, c2: cc2, b: [x, y] });
        prevQuadCtl = [qx, qy];
        prevCubicCtl = null;
        cx = x; cy = y;
      } else if (lo === 't') {
        let x = num(), y = num();
        if (rel) { x += cx; y += cy; }
        const qx = prevQuadCtl ? 2*cx - prevQuadCtl[0] : cx;
        const qy = prevQuadCtl ? 2*cy - prevQuadCtl[1] : cy;
        const cc1 = [cx + 2/3*(qx-cx), cy + 2/3*(qy-cy)];
        const cc2 = [x + 2/3*(qx-x),  y + 2/3*(qy-y)];
        out.push({ type: 'bezier', a: [cx, cy], c1: cc1, c2: cc2, b: [x, y] });
        prevQuadCtl = [qx, qy];
        prevCubicCtl = null;
        cx = x; cy = y;
      } else if (lo === 'a') {
        const rx = num(), ry = num(), phi = num() * Math.PI/180;
        const fA = num(), fS = num();
        let x = num(), y = num();
        if (rel) { x += cx; y += cy; }
        const arc = svgArcToCenterAngles(cx, cy, x, y, rx, ry, phi, fA, fS);
        if (arc) out.push(arc);
        else out.push({ type: 'line', a: [cx, cy], b: [x, y] });
        prevCubicCtl = prevQuadCtl = null;
        cx = x; cy = y;
      } else if (lo === 'z') {
        cx = sx; cy = sy;
        prevCubicCtl = prevQuadCtl = null;
      } else {
        i++; // token desconhecido — skip
      }
    }
    return out;
  }

  function svgArcToCenterAngles(x1, y1, x2, y2, rx, ry, phi, fA, fS) {
    if (rx === 0 || ry === 0) return null;
    rx = Math.abs(rx); ry = Math.abs(ry);
    const cosphi = Math.cos(phi), sinphi = Math.sin(phi);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const x1p =  cosphi*dx + sinphi*dy;
    const y1p = -sinphi*dx + cosphi*dy;
    const lambda = (x1p*x1p)/(rx*rx) + (y1p*y1p)/(ry*ry);
    if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s; }
    const sign = (fA !== fS) ? 1 : -1;
    const num = rx*rx*ry*ry - rx*rx*y1p*y1p - ry*ry*x1p*x1p;
    const den = rx*rx*y1p*y1p + ry*ry*x1p*x1p;
    const coef = sign * Math.sqrt(Math.max(0, num/den));
    const cxp = coef * (rx*y1p / ry);
    const cyp = coef * (-ry*x1p / rx);
    const cx = cosphi*cxp - sinphi*cyp + (x1+x2)/2;
    const cy = sinphi*cxp + cosphi*cyp + (y1+y2)/2;
    function ang(ux, uy, vx, vy) {
      const dot = ux*vx + uy*vy;
      const len = Math.hypot(ux,uy) * Math.hypot(vx,vy);
      let a = Math.acos(Math.max(-1, Math.min(1, dot/len)));
      if (ux*vy - uy*vx < 0) a = -a;
      return a;
    }
    const theta1 = ang(1, 0, (x1p - cxp)/rx, (y1p - cyp)/ry);
    let delta = ang((x1p - cxp)/rx, (y1p - cyp)/ry, (-x1p - cxp)/rx, (-y1p - cyp)/ry);
    if (!fS && delta > 0) delta -= 2*Math.PI;
    if (fS && delta < 0) delta += 2*Math.PI;
    const a0 = theta1 * 180/Math.PI;
    const a1 = (theta1 + delta) * 180/Math.PI;
    return { type: 'arc', c: [cx, cy], r: (rx + ry) / 2, a0, a1 };
  }

  // ---------- conversores de elementos SVG ----------
  function elementToPrims(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'line') {
      const x1 = parseFloat(el.getAttribute('x1') || '0');
      const y1 = parseFloat(el.getAttribute('y1') || '0');
      const x2 = parseFloat(el.getAttribute('x2') || '0');
      const y2 = parseFloat(el.getAttribute('y2') || '0');
      return [{ type: 'line', a: [x1, y1], b: [x2, y2] }];
    }
    if (tag === 'polyline' || tag === 'polygon') {
      const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(parseFloat);
      const out = [];
      for (let i = 2; i < pts.length; i += 2) {
        out.push({ type: 'line', a: [pts[i-2], pts[i-1]], b: [pts[i], pts[i+1]] });
      }
      if (tag === 'polygon' && pts.length >= 4) {
        out.push({ type: 'line', a: [pts[pts.length-2], pts[pts.length-1]], b: [pts[0], pts[1]] });
      }
      return out;
    }
    if (tag === 'circle') {
      const cx = parseFloat(el.getAttribute('cx') || '0');
      const cy = parseFloat(el.getAttribute('cy') || '0');
      const r  = parseFloat(el.getAttribute('r')  || '0');
      return [{ type: 'arc', c: [cx, cy], r, a0: 0, a1: 360 }];
    }
    if (tag === 'ellipse') {
      const cx = parseFloat(el.getAttribute('cx') || '0');
      const cy = parseFloat(el.getAttribute('cy') || '0');
      const rx = parseFloat(el.getAttribute('rx') || '0');
      const ry = parseFloat(el.getAttribute('ry') || '0');
      return [{ type: 'arc', c: [cx, cy], r: (rx + ry) / 2, a0: 0, a1: 360 }];
    }
    if (tag === 'rect') {
      const x = parseFloat(el.getAttribute('x') || '0');
      const y = parseFloat(el.getAttribute('y') || '0');
      const w = parseFloat(el.getAttribute('width') || '0');
      const h = parseFloat(el.getAttribute('height') || '0');
      return [
        { type:'line', a:[x,y],     b:[x+w,y] },
        { type:'line', a:[x+w,y],   b:[x+w,y+h] },
        { type:'line', a:[x+w,y+h], b:[x,y+h] },
        { type:'line', a:[x,y+h],   b:[x,y] },
      ];
    }
    if (tag === 'path') {
      const d = el.getAttribute('d') || '';
      return parsePathD(d);
    }
    return [];
  }

  function walkSVG(root) {
    const prims = [];
    const drawables = root.querySelectorAll('path, line, polyline, polygon, circle, ellipse, rect');
    for (const el of drawables) {
      // ignora elementos escondidos
      const disp = el.getAttribute('display');
      if (disp === 'none') continue;
      // ignora elementos dentro de <defs>
      if (el.closest('defs')) continue;
      // ignora se camada/grupo ancestral tiver id contendo "grid" ou "guide"
      let p = el.parentElement, skip = false;
      while (p) {
        const idLow = (p.id || '').toLowerCase();
        const cls = (p.getAttribute('class') || '').toLowerCase();
        if (/grid|guide|template|notes?/.test(idLow + ' ' + cls)) { skip = true; break; }
        if (p.tagName.toLowerCase() === 'svg') break;
        p = p.parentElement;
      }
      if (skip) continue;
      const ps = elementToPrims(el);
      for (const pr of ps) prims.push(pr);
    }
    return prims;
  }

  // ---------- normalização para grade local ----------
  function bboxOfPrims(prims) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function add(x, y) { if (x<minX) minX=x; if (y<minY) minY=y; if (x>maxX) maxX=x; if (y>maxY) maxY=y; }
    for (const p of prims) {
      if (p.type === 'line') { add(p.a[0], p.a[1]); add(p.b[0], p.b[1]); }
      else if (p.type === 'arc') {
        // bbox aproximado: caixa do círculo
        add(p.c[0] - p.r, p.c[1] - p.r);
        add(p.c[0] + p.r, p.c[1] + p.r);
      } else if (p.type === 'bezier') {
        for (const k of ['a','c1','c2','b']) add(p[k][0], p[k][1]);
      }
    }
    if (!isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  }

  function svgViewBox(svgEl) {
    const vb = svgEl.getAttribute('viewBox');
    if (vb) {
      const [vx, vy, vw, vh] = vb.split(/[\s,]+/).map(parseFloat);
      return { x: vx, y: vy, w: vw, h: vh };
    }
    const w = parseFloat(svgEl.getAttribute('width') || '500');
    const h = parseFloat(svgEl.getAttribute('height') || '700');
    return { x: 0, y: 0, w, h };
  }

  function normalizeToGrid(prims, viewBox, fitToContent) {
    const Alpha = TG.alphabet;
    let srcMinX, srcMinY, srcW, srcH;
    if (fitToContent) {
      const bb = bboxOfPrims(prims);
      if (!bb) return prims;
      srcMinX = bb.minX; srcMinY = bb.minY;
      srcW = bb.maxX - bb.minX; srcH = bb.maxY - bb.minY;
    } else {
      srcMinX = viewBox.x; srcMinY = viewBox.y;
      srcW = viewBox.w;    srcH = viewBox.h;
    }
    if (srcW <= 0 || srcH <= 0) return prims;
    const sx = Alpha.W / srcW;
    const sy = Alpha.H / srcH;
    function tp(p) { return [(p[0] - srcMinX) * sx, (p[1] - srcMinY) * sy]; }
    return prims.map(pr => {
      if (pr.type === 'line') return { type: 'line', a: tp(pr.a), b: tp(pr.b) };
      if (pr.type === 'arc')  return { type: 'arc', c: tp(pr.c), r: pr.r * Math.min(sx, sy), a0: pr.a0, a1: pr.a1 };
      if (pr.type === 'bezier') return { type: 'bezier', a: tp(pr.a), c1: tp(pr.c1), c2: tp(pr.c2), b: tp(pr.b) };
      return pr;
    });
  }

  // ---------- nome do glyph a partir do filename / id ----------
  function charFromFilename(filename) {
    let name = filename.replace(/\.svg$/i, '');
    // Illustrator: '<basename>_<artboardName>'
    let m = name.match(/[_\-](.+)$/);
    let candidate = m ? m[1] : name;
    candidate = candidate.replace(/^Glyph[_\-]?/i, '');
    if (candidate.length === 1) return candidate;
    const ch = TG.agl.fromName(candidate);
    if (ch) return ch;
    return null;
  }

  // ---------- API pública ----------
  // parseSVGText(text, hintedChar?) → { ch, prims, viewBox }
  function parseSVGText(text, fileName) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const err = doc.querySelector('parsererror');
    if (err) throw new Error('SVG inválido: ' + err.textContent.slice(0, 100));
    const svg = doc.documentElement;
    const viewBox = svgViewBox(svg);

    // 1 SVG = 1 glyph (caso Illustrator export por artboard)
    const prims = walkSVG(svg);
    const normalized = normalizeToGrid(prims, viewBox, /*fitToContent=*/false);
    const ch = fileName ? charFromFilename(fileName) : null;
    return [{ ch, prims: normalized }];
  }

  // importa array de arquivos (File[]) → mapa { ch: prims }
  async function importFiles(fileList) {
    const out = {};
    const unresolved = [];
    for (const f of fileList) {
      const text = await f.text();
      const items = parseSVGText(text, f.name);
      for (const it of items) {
        if (it.ch) out[it.ch] = it.prims;
        else unresolved.push({ file: f.name, prims: it.prims });
      }
    }
    // pra glyphs sem nome resolvido, pedir ao usuário (uma vez por arquivo)
    for (const u of unresolved) {
      const ch = prompt(`Caractere para "${u.file}" (1 letra ou nome AGL):`);
      if (ch) {
        const real = ch.length === 1 ? ch : (TG.agl.fromName(ch) || ch[0]);
        out[real] = u.prims;
      }
    }
    return out;
  }

  TG.svgImport = { parseSVGText, importFiles, parsePathD, svgArcToCenterAngles, normalizeToGrid };
})(window);
