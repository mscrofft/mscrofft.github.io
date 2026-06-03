/* effects/halftone.js — efeito halftone (dots/lines).
   Em modo Stroke: amostra cobertura na máscara rasterizada e emite shape por célula.
   Em modo Path:   percorre amostras ao longo do path e emite shape por amostra. */
(function (global) {
  const { rasterMask, sampleCoverage, pxToEm } = global.TG.strokeToShape;
  const { sampleAlongPath } = global.TG.sampleAlongPath;

  function circleContour(cx, cy, r, segs = 24) {
    const pts = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
  }

  function lineRectContour(cx, cy, len, w, angleRad) {
    // retângulo (capsule-ish, mas só retângulo aqui) centrado em (cx,cy), comprimento len no eixo angle.
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

  function applyMaskMode(input, p) {
    const { polylines, bbox } = input;
    const renderMode = input.mode === 'fill' ? 'fill' : 'stroke';
    const strokeWidth = input.strokeWidth || 0;
    const spacingEm = p.spacing;
    const angleRad = p.angle * Math.PI / 180;
    const refSize = renderMode === 'fill'
      ? Math.max(40, (bbox.maxX - bbox.minX) * 0.1)
      : Math.max(8, strokeWidth);
    const pxPerEm = Math.max(0.1, Math.max(12 / spacingEm, 20 / refSize));
    const mask = rasterMask(polylines, {
      renderMode,
      strokeWidth, cap: input.cap, join: input.join,
      bbox,
      padding: Math.max(strokeWidth, spacingEm),
      pxPerEm,
    });

    const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
    const cxBox = (mask.minX + mask.maxX) / 2;
    const cyBox = (mask.minY + mask.maxY) / 2;
    const diag = Math.hypot(mask.maxX - mask.minX, mask.maxY - mask.minY);
    const half = diag / 2;

    const contours = [];
    const sampleR = (spacingEm * 0.5) * mask.px;
    const margin = renderMode === 'fill' ? spacingEm : strokeWidth;

    for (let v = -half; v <= half; v += spacingEm) {
      for (let u = -half; u <= half; u += spacingEm) {
        const xEm = cxBox + cos * u - sin * v;
        const yEm = cyBox + sin * u + cos * v;
        if (xEm < bbox.minX - margin || xEm > bbox.maxX + margin) continue;
        if (yEm < bbox.minY - margin || yEm > bbox.maxY + margin) continue;
        const xPx = (xEm - mask.minX) * mask.px;
        const yPx = (yEm - mask.minY) * mask.px;
        const cov = sampleCoverage(mask, xPx, yPx, sampleR);
        if (cov <= 0.001) continue;
        const k = Math.pow(cov, 1 / Math.max(0.01, p.gamma));
        if (p.shape === 'dots') {
          const r = (p.size / 2) * Math.sqrt(k);
          if (r > 0.5) contours.push(circleContour(xEm, yEm, r, 18));
        } else { // lines
          const len = spacingEm * k;
          const w = p.size;
          if (len > 1 && w > 1) contours.push(lineRectContour(xEm, yEm, len, w, angleRad + Math.PI / 2));
        }
      }
    }
    return contours;
  }

  function applyPathMode(input, p) {
    const samples = sampleAlongPath(input.polylines, p.spacing);
    const contours = [];
    if (p.shape === 'dots') {
      const r = p.size / 2;
      for (const s of samples) contours.push(circleContour(s.x, s.y, r, 18));
    } else {
      const w = p.size;
      for (const s of samples) {
        const ang = Math.atan2(s.ty, s.tx);
        contours.push(lineRectContour(s.x, s.y, p.spacing * 0.9, w, ang));
      }
    }
    return contours;
  }

  global.TG.effects.register('halftone', {
    name: 'halftone',
    defaults: { shape: 'dots', spacing: 32, angle: 45, size: 22, gamma: 1.0 },
    apply(input, params) {
      const p = Object.assign({}, this.defaults, params);
      return input.mode === 'path' ? applyPathMode(input, p) : applyMaskMode(input, p);
    },
  });
})(window);
