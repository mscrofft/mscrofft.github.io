// Geometric distortion — twist / wave / displace, rendered by warping horizontal
// strips of the tinted mask.
(function () {
  Effects.add({
    id: 'geometric',
    name: 'Geométrico (twist/wave)',
    params: [
      { id: 'mode',      label: 'Modo',        type: 'select', options: ['twist','waveX','waveY','displace'], default: 'twist' },
      { id: 'amount',    label: 'Quantidade',  type: 'range', min: 0,   max: 1,   step: 0.01, default: 0.4 },
      { id: 'freq',      label: 'Frequência',  type: 'range', min: 0.2, max: 10,  step: 0.1,  default: 3 },
      { id: 'speed',     label: 'Velocidade',  type: 'range', min: 0,   max: 4,   step: 0.1,  default: 1 },
      { id: 'slices',    label: 'Resolução',   type: 'range', min: 20,  max: 200, step: 2,    default: 80 },
      { id: 'alternate', label: 'Alternar cores', type: 'checkbox',                           default: false },
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
      const slices = Math.round(p.slices);
      const stripH = bbox.h / slices;

      for (let i = 0; i < slices; i++) {
        const y = bbox.y + i * stripH;
        const nrm = i / slices;
        let dx = 0, dy = 0, rot = 0;
        if (p.mode === 'twist') {
          rot = Math.sin(phase + nrm * Math.PI * 2) * p.amount * 0.8 * (nrm - 0.5);
        } else if (p.mode === 'waveX') {
          dx = Math.sin(phase + nrm * p.freq * Math.PI * 2) * p.amount * bbox.w * 0.25;
        } else if (p.mode === 'waveY') {
          dy = Math.sin(phase + nrm * p.freq * Math.PI * 2) * p.amount * bbox.h * 0.15;
        } else { // displace
          dx = (Math.sin(phase + nrm * p.freq * 6.28) + Math.cos(phase * 1.3 + nrm * p.freq * 3)) * p.amount * bbox.w * 0.12;
          dy = (Math.cos(phase + nrm * p.freq * 6.28)) * p.amount * bbox.h * 0.08;
        }

        const src = (p.alternate && (i % 2 === 1)) ? tintB : tintA;

        bctx.save();
        bctx.beginPath();
        bctx.rect(0, y, W, stripH + 1);
        bctx.clip();
        const cx = bbox.x + bbox.w / 2;
        const cy = y + stripH / 2;
        bctx.translate(cx + dx, cy + dy);
        bctx.rotate(rot);
        bctx.translate(-cx, -cy);
        bctx.drawImage(src, 0, 0);
        bctx.restore();
      }

      ctx.drawImage(buf, 0, 0);
      ctx.restore();
    },
  });
})();
