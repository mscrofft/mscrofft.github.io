// Blinds (persianas) — horizontal strips that "rotate" like venetian blinds.
// Canvas2D has no real 3D, so the tilt is faked by vertically compressing each
// strip toward its centre line (scaleY = cos(angle)); the back face (scaleY < 0)
// is painted in colorB.
(function () {
  Effects.add({
    id: 'blinds',
    name: 'Persianas',
    params: [
      { id: 'count',      label: 'Nº de lâminas',  type: 'range', min: 5, max: 60, step: 1,    default: 24 },
      { id: 'phaseShift', label: 'Defasagem',      type: 'range', min: 0, max: 1,  step: 0.01, default: 0.15 },
      { id: 'speed',      label: 'Velocidade',     type: 'range', min: 0, max: 4,  step: 0.1,  default: 1 },
      { id: 'gap',        label: 'Fresta (px)',    type: 'range', min: 0, max: 8,  step: 1,    default: 1 },
      { id: 'alternate',  label: 'Cor no verso',   type: 'checkbox',                           default: true },
    ],

    draw({ ctx, W, H, mask, bbox, t, p, palette }) {
      const buf   = Effects.ensureCanvas(this, '_buf', W, H);
      const tintA = Effects.tintMask(this, '_tintA', mask, palette.colorA, W, H);
      const tintB = Effects.tintMask(this, '_tintB', mask, palette.colorB, W, H);
      const bctx = buf.getContext('2d');
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, W, H);

      ctx.save();
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);

      const phase = t * Math.PI * 2 * p.speed;
      const count = Math.max(2, Math.round(p.count));
      const stripH = bbox.h / count;

      for (let i = 0; i < count; i++) {
        const y = bbox.y + i * stripH;
        const a = phase + i * p.phaseShift;
        const scaleY = Math.cos(a);
        const h = Math.abs(scaleY) * (stripH - p.gap);
        if (h < 0.5) continue;
        const cy = y + stripH / 2;
        const dy = cy - h / 2;
        const src = (p.alternate && scaleY < 0) ? tintB : tintA;
        // Compress the strip (0, y, W, stripH) of the tinted mask into height h.
        bctx.drawImage(src, 0, y, W, stripH, 0, dy, W, h);
      }

      ctx.drawImage(buf, 0, 0);
      ctx.restore();
    },
  });
})();
