// Animated halftone — samples the mask alpha and renders dots whose size oscillates.
(function () {
  Effects.add({
    id: 'halftone',
    name: 'Halftone animado',
    params: [
      { id: 'spacing',    label: 'Espaçamento',    type: 'range', min: 4,  max: 60, step: 1,    default: 14 },
      { id: 'dotMax',     label: 'Tamanho máx',    type: 'range', min: 1,  max: 40, step: 1,    default: 12 },
      { id: 'angle',      label: 'Ângulo (°)',     type: 'range', min: 0,  max: 90, step: 1,    default: 0 },
      { id: 'pulse',      label: 'Pulso',          type: 'range', min: 0,  max: 1,  step: 0.01, default: 0.35 },
      { id: 'wave',       label: 'Onda',           type: 'range', min: 0,  max: 1,  step: 0.01, default: 0.4 },
      { id: 'shape',      label: 'Forma',          type: 'select', options: ['circle','square','line'], default: 'circle' },
    ],

    draw({ ctx, W, H, mask, bbox, t, p, palette }) {
      ctx.save();
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);

      const phase = t * Math.PI * 2;
      const img = Effects.maskImageData(this, mask);
      const cosA = Math.cos(p.angle * Math.PI / 180);
      const sinA = Math.sin(p.angle * Math.PI / 180);
      const cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h / 2;

      const stepX = p.spacing, stepY = p.spacing;

      for (let y = bbox.y; y < bbox.y + bbox.h; y += stepY) {
        for (let x = bbox.x; x < bbox.x + bbox.w; x += stepX) {
          // sample
          const sx = Math.round(x), sy = Math.round(y);
          if (sx < 0 || sy < 0 || sx >= mask.width || sy >= mask.height) continue;
          const a = img[(sy * mask.width + sx) * 4 + 3] / 255;
          if (a < 0.05) continue;
          // wave factor by position
          const dx = (x - cx) * cosA + (y - cy) * sinA;
          const wave = 0.5 + 0.5 * Math.sin(phase + dx * 0.02 * (1 + p.wave * 3));
          const pulse = 1 + p.pulse * Math.sin(phase * 1.5);
          const size = p.dotMax * a * wave * pulse;
          if (size < 0.3) continue;

          ctx.fillStyle = (Math.floor(x / stepX) + Math.floor(y / stepY)) % 2 === 0 ? palette.colorA : palette.colorB;
          if (p.shape === 'square') {
            ctx.fillRect(x - size / 2, y - size / 2, size, size);
          } else if (p.shape === 'line') {
            ctx.fillRect(x - size / 2, y - 1, size, 2);
          } else {
            ctx.beginPath();
            ctx.arc(x, y, size / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    },
  });
})();
