// Chromatic aberration — additive R/G/B copies with oscillating offset.
// tintMask keeps the background transparent, so 'lighter' compositing preserves
// transparency outside the letter and the palette bg shows through cleanly.
(function () {
  Effects.add({
    id: 'chromatic',
    name: 'Aberração cromática',
    params: [
      { id: 'amount',    label: 'Deslocamento', type: 'range', min: 0, max: 0.15, step: 0.005, default: 0.04 },
      { id: 'direction', label: 'Direção',      type: 'select', options: ['horizontal','vertical','radial'], default: 'horizontal' },
      { id: 'speed',     label: 'Velocidade',   type: 'range', min: 0, max: 4, step: 0.1, default: 1 },
    ],

    draw({ ctx, W, H, mask, bbox, t, p, palette }) {
      const buf   = Effects.ensureCanvas(this, '_buf', W, H);
      const tintR = Effects.tintMask(this, '_tintR', mask, '#ff0000', W, H);
      const tintG = Effects.tintMask(this, '_tintG', mask, '#00ff00', W, H);
      const tintB = Effects.tintMask(this, '_tintB', mask, '#0000ff', W, H);
      const bctx = buf.getContext('2d');
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, W, H);

      const phase = t * Math.PI * 2 * p.speed;
      const shift = p.amount * bbox.w * Math.sin(phase);

      // Per-channel offset vectors (G stays centred, R/B split opposite).
      let rx = 0, ry = 0, bx = 0, by = 0;
      if (p.direction === 'horizontal') { rx = shift; bx = -shift; }
      else if (p.direction === 'vertical') { ry = shift; by = -shift; }
      else { // radial — R out, B in along a rotating axis
        const ang = phase;
        rx = Math.cos(ang) * shift; ry = Math.sin(ang) * shift;
        bx = -rx; by = -ry;
      }

      bctx.globalCompositeOperation = 'lighter';
      bctx.drawImage(tintR, Math.round(rx), Math.round(ry));
      bctx.drawImage(tintG, 0, 0);
      bctx.drawImage(tintB, Math.round(bx), Math.round(by));
      bctx.globalCompositeOperation = 'source-over';

      ctx.save();
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(buf, 0, 0);
      ctx.restore();
    },
  });
})();
