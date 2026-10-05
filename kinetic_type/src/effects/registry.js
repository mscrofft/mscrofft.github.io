// Effect registry. Each effect:
// {
//   id, name,
//   params: [ { id, label, type: 'range'|'color'|'select'|'checkbox', min,max,step,default, options? } ],
//   draw({ ctx, W, H, mask, bbox, t, p, palette })
// }
window.Effects = {
  registry: [],
  add(eff) { this.registry.push(eff); },
  get(id) { return this.registry.find(e => e.id === id); },
  list() { return this.registry.slice(); },
  defaults(eff) {
    const o = {};
    for (const p of eff.params) o[p.id] = p.default;
    return o;
  },

  // Returns a canvas with the mask silhouette painted in `color` over transparency.
  // Cached on `host[key]`; only re-tints when mask reference, color, or size changes.
  tintMask(host, key, mask, color, W, H) {
    let c = host[key];
    if (!c || c.width !== W || c.height !== H) {
      c = host[key] = document.createElement('canvas');
      c.width = W; c.height = H;
      host[key + '_meta'] = null;
    }
    const meta = host[key + '_meta'];
    if (meta && meta.mask === mask && meta.color === color) return c;
    const x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, W, H);
    x.drawImage(mask, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over';
    host[key + '_meta'] = { mask, color };
    return c;
  },

  // Cached alpha read of the mask. The mask canvas is recreated whenever the
  // glyph changes (see Glyph.build), so reference comparison is enough.
  maskImageData(host, mask) {
    if (!host._imgCache || host._imgCache.mask !== mask) {
      host._imgCache = {
        mask,
        data: mask.getContext('2d').getImageData(0, 0, mask.width, mask.height).data,
      };
    }
    return host._imgCache.data;
  },

  // Cached offscreen canvas sized W×H, stored on host[key].
  ensureCanvas(host, key, W, H) {
    let c = host[key];
    if (!c || c.width !== W || c.height !== H) {
      c = host[key] = document.createElement('canvas');
      c.width = W; c.height = H;
    }
    return c;
  },
};
