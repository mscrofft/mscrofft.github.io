// Dense halftone — same idea as halftone, but with hexagonal (offset) packing
// and a minimum dot floor so there are no visible vertical white lanes between columns.
(function () {
  Effects.add({
    id: 'halftoneDense',
    name: 'Halftone denso',
    params: [
      { id: 'spacing', label: 'Espaçamento', type: 'range', min: 4,  max: 60, step: 1,    default: 14 },
      { id: 'dotMax',  label: 'Tamanho máx', type: 'range', min: 1,  max: 200, step: 1,    default: 18 },
      { id: 'dotMin',  label: 'Tamanho mín', type: 'range', min: 0,  max: 200, step: 0.5,  default: 6  },
      { id: 'angle',   label: 'Ângulo (°)',  type: 'range', min: 0,  max: 90, step: 1,    default: 0  },
      { id: 'pulse',   label: 'Pulso',       type: 'range', min: 0,  max: 1,  step: 0.01, default: 0.35 },
      { id: 'wave',    label: 'Onda',        type: 'range', min: 0,  max: 1,  step: 0.01, default: 0.4  },
      { id: 'shape',   label: 'Forma',       type: 'select', options: ['circle','square'], default: 'circle' },
      { id: 'cobrir',  label: 'Cobrir vãos', type: 'checkbox',                             default: true },
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

      const stepX = p.spacing;
      // Hex packing: vertical step is sqrt(3)/2 of horizontal, odd rows shifted by stepX/2
      const stepY = p.spacing * 0.866;

      // With "cobrir" on, the floor is at least the cell diagonal so no gaps remain;
      // off, the slider value rules alone.
      const cellDiag = Math.sqrt(stepX * stepX + stepY * stepY);
      const minSize = p.cobrir ? Math.max(p.dotMin, cellDiag * 0.55) : p.dotMin;

      let row = 0;
      for (let y = bbox.y; y < bbox.y + bbox.h; y += stepY) {
        const rowOffset = (row % 2 === 0) ? 0 : stepX / 2;
        for (let x = bbox.x - stepX; x < bbox.x + bbox.w + stepX; x += stepX) {
          const px = x + rowOffset;
          const sx = Math.round(px), sy = Math.round(y);
          if (sx < 0 || sy < 0 || sx >= mask.width || sy >= mask.height) continue;
          const a = img[(sy * mask.width + sx) * 4 + 3] / 255;
          if (a < 0.05) continue;
          const dx = (px - cx) * cosA + (y - cy) * sinA;
          const wave = 0.5 + 0.5 * Math.sin(phase + dx * 0.02 * (1 + p.wave * 3));
          const pulse = 1 + p.pulse * Math.sin(phase * 1.5);
          // Bias wave toward 1 so dots stay big; combine with mask alpha
          const size = Math.max(minSize * a, p.dotMax * a * wave * pulse);
          if (size < 0.3) continue;

          ctx.fillStyle = ((row + Math.floor(px / stepX)) % 2 === 0) ? palette.colorA : palette.colorB;
          if (p.shape === 'square') {
            ctx.fillRect(px - size / 2, y - size / 2, size, size);
          } else {
            ctx.beginPath();
            ctx.arc(px, y, size / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        row++;
      }
      ctx.restore();
    },
  });
})();
