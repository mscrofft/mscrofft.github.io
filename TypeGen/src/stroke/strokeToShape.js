/* strokeToShape.js — rasteriza o esqueleto stroked num canvas offscreen e devolve
   uma máscara binária (Uint8Array) + metadados de transformação em-units->pixel. */
(function (global) {
  function rasterMask(polylines, opts) {
    // opts: { renderMode:'stroke'|'fill', strokeWidth, cap, join, bbox, padding, pxPerEm }
    const renderMode = opts.renderMode || 'stroke';
    const pad = opts.padding != null ? opts.padding : (renderMode === 'stroke' ? opts.strokeWidth : 0);
    const minX = opts.bbox.minX - pad;
    const minY = opts.bbox.minY - pad;
    const maxX = opts.bbox.maxX + pad;
    const maxY = opts.bbox.maxY + pad;
    const wEm = maxX - minX;
    const hEm = maxY - minY;
    const px = opts.pxPerEm;
    const W = Math.max(2, Math.ceil(wEm * px));
    const H = Math.max(2, Math.ceil(hEm * px));
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.beginPath();
    for (const pl of polylines) {
      if (pl.length < 2) continue;
      const [x0, y0] = pl[0];
      ctx.moveTo((x0 - minX) * px, (y0 - minY) * px);
      for (let i = 1; i < pl.length; i++) {
        ctx.lineTo((pl[i][0] - minX) * px, (pl[i][1] - minY) * px);
      }
      if (renderMode === 'fill') ctx.closePath();
    }
    if (renderMode === 'fill') {
      ctx.fillStyle = '#fff';
      ctx.fill('evenodd');
    } else {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = opts.strokeWidth * px;
      ctx.lineCap = opts.cap || 'round';
      ctx.lineJoin = opts.join || 'round';
      ctx.stroke();
    }
    const data = ctx.getImageData(0, 0, W, H).data;
    const mask = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      mask[j] = data[i] > 64 ? 1 : 0;
    }
    return { mask, W, H, minX, minY, maxX, maxY, px };
  }

  // Amostra a cobertura local de uma célula r,c (centro) com raio em pixels.
  function sampleCoverage(maskInfo, cxPx, cyPx, rPx) {
    const { mask, W, H } = maskInfo;
    const r0 = Math.max(0, Math.floor(cyPx - rPx));
    const r1 = Math.min(H - 1, Math.ceil(cyPx + rPx));
    const c0 = Math.max(0, Math.floor(cxPx - rPx));
    const c1 = Math.min(W - 1, Math.ceil(cxPx + rPx));
    let hits = 0, total = 0;
    const r2 = rPx * rPx;
    for (let y = r0; y <= r1; y++) {
      for (let x = c0; x <= c1; x++) {
        const dx = x - cxPx, dy = y - cyPx;
        if (dx * dx + dy * dy > r2) continue;
        total++;
        if (mask[y * W + x]) hits++;
      }
    }
    return total ? hits / total : 0;
  }

  function pxToEm(maskInfo, x, y) {
    return [maskInfo.minX + x / maskInfo.px, maskInfo.minY + y / maskInfo.px];
  }

  global.TG.strokeToShape = { rasterMask, sampleCoverage, pxToEm };
})(window);
