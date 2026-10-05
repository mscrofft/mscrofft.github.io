// Contour lines (moiré) — letter revealed only through horizontal bands whose
// thickness oscillates over time, like animated silkscreen line-work.
(function () {
  Effects.add({
    id: 'contourLines',
    name: 'Linhas de contorno (moiré)',
    params: [
      { id: 'spacing',   label: 'Espaçamento',    type: 'range', min: 4, max: 60, step: 1,    default: 16 },
      { id: 'freq',      label: 'Frequência',     type: 'range', min: 0, max: 10, step: 0.1,  default: 3 },
      { id: 'speed',     label: 'Velocidade',     type: 'range', min: 0, max: 4,  step: 0.1,  default: 1 },
      { id: 'minLine',   label: 'Linha mínima',   type: 'range', min: 0, max: 1,  step: 0.01, default: 0.15 },
      { id: 'alternate', label: 'Alternar cores', type: 'checkbox',                           default: false },
    ],

    draw({ ctx, W, H, mask, bbox, t, p, palette }) {
      const tintA = Effects.tintMask(this, '_tintA', mask, palette.colorA, W, H);
      const tintB = Effects.tintMask(this, '_tintB', mask, palette.colorB, W, H);

      ctx.save();
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);

      const phase = t * Math.PI * 2 * p.speed;
      const freq = p.freq * 0.01; // slider 0–10 → rad/px 0–0.1
      const spacing = Math.max(2, Math.round(p.spacing));
      const minTh = Math.max(0, Math.min(1, p.minLine));

      let row = 0;
      for (let y = bbox.y; y < bbox.y + bbox.h + spacing; y += spacing, row++) {
        const wave = 0.5 + 0.5 * Math.sin(phase + (y - bbox.y) * freq);
        const th = Math.max(1, Math.round(spacing * (minTh + (1 - minTh) * wave)));
        const yc = Math.round(y);
        const sy = Math.max(0, yc - Math.floor(th / 2));
        const src = (p.alternate && (row % 2 === 1)) ? tintB : tintA;
        ctx.drawImage(src, 0, sy, W, th, 0, sy, W, th);
      }
      ctx.restore();
    },
  });
})();
