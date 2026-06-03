/* primitives.js — tipos de primitiva do esqueleto + utilidades.
   Coordenadas em GRID (x cresce p/ direita, y cresce p/ baixo).
   line: { type:'line', a:[gx,gy], b:[gx,gy] }
   arc : { type:'arc',  c:[gx,gy], r:gridRadius, a0:deg, a1:deg }
        Angulos em graus, conven. y-down: 0°=direita, 90°=baixo, 180°=esquerda, 270°=cima.
        Sweep direto de a0 -> a1 (pode ser negativo ou >360). */
(function (global) {
  const { gridToEm } = global.TG.grid;

  function flattenPrimitive(prim) {
    if (prim.type === 'line') {
      return [gridToEm(prim.a[0], prim.a[1]), gridToEm(prim.b[0], prim.b[1])];
    }
    if (prim.type === 'bezier') {
      const N = 32;
      const ax = prim.a[0], ay = prim.a[1];
      const c1x = prim.c1[0], c1y = prim.c1[1];
      const c2x = prim.c2[0], c2y = prim.c2[1];
      const bx = prim.b[0], by = prim.b[1];
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, mt = 1 - t;
        const m2 = mt*mt, m3 = m2*mt, t2 = t*t, t3 = t2*t;
        const gx = m3*ax + 3*m2*t*c1x + 3*mt*t2*c2x + t3*bx;
        const gy = m3*ay + 3*m2*t*c1y + 3*mt*t2*c2y + t3*by;
        pts.push(gridToEm(gx, gy));
      }
      return pts;
    }
    if (prim.type === 'arc') {
      const a0 = prim.a0 * Math.PI / 180;
      const a1 = prim.a1 * Math.PI / 180;
      const span = a1 - a0;
      const n = Math.max(2, Math.ceil(Math.abs(span) / (Math.PI / 16)));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const a = a0 + span * (i / n);
        const gx = prim.c[0] + prim.r * Math.cos(a);
        const gy = prim.c[1] + prim.r * Math.sin(a);
        pts.push(gridToEm(gx, gy));
      }
      return pts;
    }
    return [];
  }

  function flattenGlyph(prims) {
    return prims.map(p => flattenPrimitive(p));
  }

  function glyphBBoxEm(prims) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pl of flattenGlyph(prims)) {
      for (const [x, y] of pl) {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX, minY, maxX, maxY };
  }

  global.TG.primitives = { flattenPrimitive, flattenGlyph, glyphBBoxEm };
})(window);
