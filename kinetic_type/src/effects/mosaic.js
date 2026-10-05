// Mosaic — block pixelation whose cell size pulses over time.
(function () {
  Effects.add({
    id: 'mosaic',
    name: 'Mosaico animado',
    params: [
      { id: 'cellSize',  label: 'Tamanho célula', type: 'range', min: 4, max: 80, step: 1,    default: 22 },
      { id: 'pulse',     label: 'Pulso',          type: 'range', min: 0, max: 1,  step: 0.01, default: 0.4 },
      { id: 'speed',     label: 'Velocidade',     type: 'range', min: 0, max: 4,  step: 0.1,  default: 1 },
      { id: 'alternate', label: 'Alternar cores', type: 'checkbox',                           default: true },
    ],

    draw({ ctx, W, H, mask, bbox, t, p, palette }) {
      ctx.save();
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);

      const img = Effects.maskImageData(this, mask);
      const phase = t * Math.PI * 2 * p.speed;
      const cell = Math.max(2, p.cellSize * (1 + p.pulse * Math.sin(phase)));

      let row = 0;
      for (let y = bbox.y; y < bbox.y + bbox.h; y += cell, row++) {
        let col = 0;
        for (let x = bbox.x; x < bbox.x + bbox.w; x += cell, col++) {
          const sx = Math.round(x + cell / 2);
          const sy = Math.round(y + cell / 2);
          if (sx < 0 || sy < 0 || sx >= mask.width || sy >= mask.height) continue;
          if (img[(sy * mask.width + sx) * 4 + 3] < 120) continue;
          ctx.fillStyle = (p.alternate && (row + col) % 2 === 1) ? palette.colorB : palette.colorA;
          ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(cell), Math.ceil(cell));
        }
      }
      ctx.restore();
    },
  });
})();
