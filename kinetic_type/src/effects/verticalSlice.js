// Vertical slice effect — reference image: letter cut into vertical strips
// with per-slice vertical offset that propagates as a wave/twist.
(function () {
  Effects.add({
    id: 'verticalSlice',
    name: 'Fatiamento vertical',
    params: [
      { id: 'sliceCount', label: 'Nº de fatias',    type: 'range', min: 10,  max: 220, step: 1,    default: 60 },
      { id: 'gap',        label: 'Espaço (px)',     type: 'range', min: 0,   max: 8,   step: 1,    default: 0  },
      { id: 'offsetAmp',  label: 'Amplitude',       type: 'range', min: 0,   max: 1,   step: 0.01, default: 0.45 },
      { id: 'phaseShift', label: 'Defasagem',       type: 'range', min: 0,   max: 2,   step: 0.01, default: 0.35 },
      { id: 'waveSpeed',  label: 'Velocidade',      type: 'range', min: 0,   max: 4,   step: 0.1,  default: 1  },
      { id: 'noise',      label: 'Ruído',           type: 'range', min: 0,   max: 1,   step: 0.01, default: 0  },
      { id: 'tilt',       label: 'Inclinação (°)',  type: 'range', min: -45, max: 45,  step: 1,    default: 0  },
      { id: 'alternate',  label: 'Alternar cores',  type: 'checkbox',                              default: true },
    ],

    draw({ ctx, W, H, mask, bbox, t, p, palette }) {
      const buf   = Effects.ensureCanvas(this, '_buf', W, H);
      const tintA = Effects.tintMask(this, '_tintA', mask, palette.colorA, W, H);
      const tintB = Effects.tintMask(this, '_tintB', mask, palette.colorB, W, H);
      const bctx = buf.getContext('2d');
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, W, H);

      // BG fill on main canvas
      ctx.save();
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);

      // Apply global tilt around center on the buffer
      bctx.translate(W / 2, H / 2);
      bctx.rotate((p.tilt * Math.PI) / 180);
      bctx.translate(-W / 2, -H / 2);
      // Snap to integer pixels — kills sub-pixel anti-aliasing seams between strips.
      bctx.imageSmoothingEnabled = false;

      const count = Math.max(2, Math.round(p.sliceCount));
      const sliceW = bbox.w / count;
      const phase = t * Math.PI * 2 * p.waveSpeed;

      for (let i = 0; i < count; i++) {
        const xf = bbox.x + i * sliceW;
        const sx = Math.round(xf);
        const sw = Math.max(1, Math.round(sliceW - p.gap));
        if (sx + sw <= 0 || sx >= W) continue;

        const yOffsetF = Math.sin(phase + i * p.phaseShift) * p.offsetAmp * bbox.h
                     + (p.noise > 0 ? (hash(i * 13.37) * 2 - 1) * p.noise * bbox.h * 0.25 * Math.sin(phase * 0.5 + i) : 0);
        const dy = Math.round(yOffsetF);

        const src = (p.alternate && (i % 2 === 1)) ? tintB : tintA;
        // Copy column (sx, 0, sw, H) from the tinted mask into buf at (sx, dy)
        bctx.drawImage(src,
          sx, 0, sw, H,
          sx, dy, sw, H
        );
      }

      ctx.drawImage(buf, 0, 0);
      ctx.restore();
    },
  });

  function hash(n) {
    const s = Math.sin(n) * 43758.5453;
    return s - Math.floor(s);
  }
})();
