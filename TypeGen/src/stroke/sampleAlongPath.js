/* sampleAlongPath.js — amostra pontos ao longo de polylines com espaçamento
   constante em comprimento de arco. Retorna [{x,y,tx,ty}] (tangente unitária). */
(function (global) {
  function sampleAlongPath(polylines, spacingEm) {
    const out = [];
    for (const pl of polylines) {
      if (pl.length < 2) continue;
      // comprimento acumulado
      const lens = [0];
      for (let i = 1; i < pl.length; i++) {
        const dx = pl[i][0] - pl[i - 1][0];
        const dy = pl[i][1] - pl[i - 1][1];
        lens.push(lens[i - 1] + Math.hypot(dx, dy));
      }
      const total = lens[lens.length - 1];
      if (total <= 0) continue;
      const n = Math.max(1, Math.floor(total / spacingEm));
      const step = total / n;
      let segIdx = 1;
      for (let k = 0; k <= n; k++) {
        const target = k * step;
        while (segIdx < lens.length - 1 && lens[segIdx] < target) segIdx++;
        const segLen = lens[segIdx] - lens[segIdx - 1];
        const t = segLen > 0 ? (target - lens[segIdx - 1]) / segLen : 0;
        const x0 = pl[segIdx - 1][0], y0 = pl[segIdx - 1][1];
        const x1 = pl[segIdx][0], y1 = pl[segIdx][1];
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        const dx = x1 - x0, dy = y1 - y0;
        const m = Math.hypot(dx, dy) || 1;
        out.push({ x, y, tx: dx / m, ty: dy / m });
      }
    }
    return out;
  }

  global.TG.sampleAlongPath = { sampleAlongPath };
})(window);
