// Echo / trail — N staggered copies of the letter oscillating with phase lag,
// trailing copies fading out, ghost-motion style.
(function () {
  Effects.add({
    id: 'echo',
    name: 'Eco / rastro',
    params: [
      { id: 'copies',    label: 'Cópias',      type: 'range', min: 2, max: 12, step: 1,    default: 6 },
      { id: 'amp',       label: 'Amplitude',   type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.18 },
      { id: 'lag',       label: 'Defasagem',   type: 'range', min: 0, max: 1,  step: 0.01, default: 0.35 },
      { id: 'fade',      label: 'Esmaecer',    type: 'range', min: 0, max: 1,  step: 0.01, default: 0.7 },
      { id: 'direction', label: 'Direção',     type: 'select', options: ['horizontal','vertical','diagonal','circular'], default: 'horizontal' },
      { id: 'alternate', label: 'Alternar cores', type: 'checkbox',                        default: true },
    ],

    draw({ ctx, W, H, mask, bbox, t, p, palette }) {
      const tintA = Effects.tintMask(this, '_tintA', mask, palette.colorA, W, H);
      const tintB = Effects.tintMask(this, '_tintB', mask, palette.colorB, W, H);

      ctx.save();
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);

      const phase = t * Math.PI * 2;
      const copies = Math.max(2, Math.round(p.copies));
      const ampX = p.amp * bbox.w;
      const ampY = p.amp * bbox.h;

      // Back to front so the lead copy (k=0) lands on top.
      for (let k = copies - 1; k >= 0; k--) {
        const depth = k / copies; // 0 = lead, →1 = oldest ghost
        const reach = Easing.easeOutCubic(depth);
        const osc = Math.sin(phase - k * p.lag * Math.PI);

        let dx = 0, dy = 0;
        if (p.direction === 'horizontal') {
          dx = osc * ampX * reach;
        } else if (p.direction === 'vertical') {
          dy = osc * ampY * reach;
        } else if (p.direction === 'diagonal') {
          dx = osc * ampX * reach;
          dy = osc * ampY * reach;
        } else { // circular
          const a = phase - k * p.lag * Math.PI;
          dx = Math.cos(a) * ampX * reach;
          dy = Math.sin(a) * ampY * reach;
        }

        const src = (p.alternate && k % 2 === 1) ? tintB : tintA;

        ctx.globalAlpha = k === 0 ? 1 : Math.max(0.05, 1 - p.fade * depth);
        ctx.drawImage(src, Math.round(dx), Math.round(dy));
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },
  });
})();
