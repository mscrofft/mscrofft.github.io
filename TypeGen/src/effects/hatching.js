/* effects/hatching.js — preenche o glyph com hachuras (linhas contínuas) num ângulo.
   Diferente do halftone "lines" que modula tamanho por cobertura: aqui as linhas
   atravessam o glyph inteiro nas regiões cobertas pela máscara. */
(function (global) {
  const { rasterMask } = global.TG.strokeToShape;

  function lineRectContour(cx, cy, len, w, angleRad) {
    const ca = Math.cos(angleRad), sa = Math.sin(angleRad);
    const hx = (len / 2) * ca, hy = (len / 2) * sa;
    const nx = (-sa) * (w / 2), ny = (ca) * (w / 2);
    return [
      [cx - hx - nx, cy - hy - ny],
      [cx + hx - nx, cy + hy - ny],
      [cx + hx + nx, cy + hy + ny],
      [cx - hx + nx, cy - hy + ny],
    ];
  }

  function apply(input, p) {
    const { polylines, bbox } = input;
    const renderMode = input.mode === 'fill' ? 'fill' : 'stroke';
    const strokeWidth = input.strokeWidth || 0;
    const spacingEm = p.spacing;
    const angleRad = p.angle * Math.PI / 180;
    const refSize = renderMode === 'fill'
      ? Math.max(40, (bbox.maxX - bbox.minX) * 0.1)
      : Math.max(8, strokeWidth);
    const pxPerEm = Math.max(0.1, Math.max(20 / spacingEm, 30 / refSize));
    const mask = rasterMask(polylines, {
      renderMode, strokeWidth, cap: input.cap, join: input.join,
      bbox, padding: Math.max(strokeWidth, spacingEm), pxPerEm,
    });

    const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
    const perpX = -sin, perpY = cos;
    const cxBox = (mask.minX + mask.maxX) / 2;
    const cyBox = (mask.minY + mask.maxY) / 2;
    const diag = Math.hypot(mask.maxX - mask.minX, mask.maxY - mask.minY);
    const half = diag / 2;
    const stepEm = 1 / mask.px;

    const contours = [];
    const sampleStep = 2 * stepEm;

    for (let t = -half; t <= half; t += spacingEm) {
      const cxL = cxBox + t * perpX;
      const cyL = cyBox + t * perpY;
      let prevInside = false, startU = 0;
      for (let u = -half; u <= half; u += sampleStep) {
        const ex = cxL + u * cos, ey = cyL + u * sin;
        const xPx = (ex - mask.minX) * mask.px;
        const yPx = (ey - mask.minY) * mask.px;
        let v = 0;
        if (xPx >= 0 && xPx < mask.W && yPx >= 0 && yPx < mask.H) {
          v = mask.mask[Math.floor(yPx) * mask.W + Math.floor(xPx)];
        }
        const curInside = !!v;
        if (curInside && !prevInside) startU = u;
        if (!curInside && prevInside) {
          const len = u - startU;
          if (len > 1) {
            const midU = (startU + u) / 2;
            contours.push(lineRectContour(cxL + midU * cos, cyL + midU * sin, len, p.size, angleRad));
          }
        }
        prevInside = curInside;
      }
      if (prevInside) {
        const len = half - startU;
        if (len > 1) {
          const midU = (startU + half) / 2;
          contours.push(lineRectContour(cxL + midU * cos, cyL + midU * sin, len, p.size, angleRad));
        }
      }
    }
    return contours;
  }

  global.TG.effects.register('hatching', {
    name: 'hatching',
    defaults: { spacing: 24, angle: 0, size: 6, gamma: 1.0 },
    apply(input, params) {
      const p = Object.assign({}, this.defaults, params);
      return apply(input, p);
    },
  });
})(window);
