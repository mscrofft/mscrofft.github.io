// glyph.js — converts text+font (or uploaded OTF/TTF) into a rasterized mask + bbox.
// The mask is an offscreen canvas containing the letter(s) filled in white on transparent.
// Effects sample from it (alpha) or use the bbox to lay out their elements.

(function () {
  const Glyph = {
    customFont: null,        // opentype.Font (when user drops a TTF/OTF)
    customFontName: '',
    cache: null,             // { key, mask, bbox }

    async setCustomFontFromArrayBuffer(buf, name = 'Custom') {
      this.customFont = window.opentype.parse(buf);
      this.customFontName = name;
      this.cache = null;
    },

    clearCustomFont() {
      this.customFont = null;
      this.customFontName = '';
      this.cache = null;
    },

    // Build (or fetch cached) mask for given text/font config sized to fit `targetW × targetH`
    // with `padding` margin. Returns { mask: HTMLCanvasElement, bbox: {x,y,w,h} in mask coords }.
    build({ text, fontFamily, fontWeight, targetW, targetH, padding = 0.08 }) {
      const useCustom = !!this.customFont;
      const key = [
        useCustom ? 'OTF:' + this.customFontName : `${fontFamily}|${fontWeight}`,
        text, targetW, targetH, padding
      ].join('::');
      if (this.cache && this.cache.key === key) return this.cache;

      const mask = document.createElement('canvas');
      mask.width = targetW;
      mask.height = targetH;
      const mctx = mask.getContext('2d');
      const padPx = Math.round(Math.min(targetW, targetH) * padding);
      const innerW = targetW - 2 * padPx;
      const innerH = targetH - 2 * padPx;

      let bbox;
      if (useCustom) {
        bbox = drawWithOpentype(mctx, this.customFont, text, padPx, innerW, innerH);
      } else {
        bbox = drawWithSystemFont(mctx, text, fontFamily, fontWeight, padPx, innerW, innerH);
      }

      this.cache = { key, mask, bbox };
      return this.cache;
    },
  };

  function drawWithSystemFont(mctx, text, family, weight, pad, innerW, innerH) {
    // Binary-search font size to fit innerW × innerH
    const ctx = mctx;
    const lines = text.split('\n');
    let lo = 10, hi = innerH * 2, best = lo;
    const measure = (size) => {
      ctx.font = `${weight} ${size}px "${family}"`;
      let maxW = 0;
      for (const ln of lines) maxW = Math.max(maxW, ctx.measureText(ln).width);
      const totalH = size * 1.05 * lines.length;
      return { w: maxW, h: totalH };
    };
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const m = measure(mid);
      if (m.w <= innerW && m.h <= innerH) { best = mid; lo = mid; } else { hi = mid; }
    }
    const fontSize = best;
    ctx.font = `${weight} ${fontSize}px "${family}"`;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    const m = measure(fontSize);
    const startY = pad + (innerH - m.h) / 2 + fontSize;
    const cx = pad + innerW / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], cx, startY + i * fontSize * 1.05);
    }
    return computeBboxFromAlpha(ctx.canvas);
  }

  function drawWithOpentype(mctx, font, text, pad, innerW, innerH) {
    // Try a size; measure with font.getPath bounding box, scale to fit
    const lines = text.split('\n');
    const probe = 200;
    let maxW = 0, totalH = 0;
    const lineMetrics = [];
    for (const ln of lines) {
      const path = font.getPath(ln, 0, 0, probe);
      const b = path.getBoundingBox();
      const w = b.x2 - b.x1;
      const h = b.y2 - b.y1;
      lineMetrics.push({ b, w, h });
      maxW = Math.max(maxW, w);
      totalH += h * 1.05;
    }
    const scale = Math.min(innerW / maxW, innerH / totalH);
    const fontSize = probe * scale;
    mctx.fillStyle = '#fff';
    let y = pad - lineMetrics[0].b.y1 * scale + (innerH - totalH * scale) / 2;
    for (let i = 0; i < lines.length; i++) {
      const lm = lineMetrics[i];
      const x = pad + (innerW - lm.w * scale) / 2 - lm.b.x1 * scale;
      const path = font.getPath(lines[i], x, y, fontSize);
      path.fill = '#fff';
      path.draw(mctx);
      y += lm.h * scale * 1.05;
    }
    return computeBboxFromAlpha(mctx.canvas);
  }

  function computeBboxFromAlpha(canvas) {
    const ctx = canvas.getContext('2d');
    const { width: W, height: H } = canvas;
    const data = ctx.getImageData(0, 0, W, H).data;
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[(y * W + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { x: 0, y: 0, w: W, h: H };
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  window.Glyph = Glyph;
})();
