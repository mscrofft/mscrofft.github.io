const Palette = {
  active: 'custom',
  selectedIndex: 0,

  // Substitui a paleta custom por uma nova lista de hex (ex: cores quantizadas da imagem)
  replaceCustom(hexList) {
    PALETTES.custom = hexList.map((hex, i) => ({
      code: 'C' + (i + 1).toString().padStart(3, '0'),
      name: hex.toUpperCase(),
      hex
    }));
    this.active = 'custom';
    this.selectedIndex = 0;
    document.getElementById('palette-select').value = 'custom';
    this.render();
  },

  list() { return PALETTES[this.active]; },

  get(idx) {
    const arr = this.list();
    return arr[idx] || { code: '?', name: '?', hex: '#000000' };
  },

  setActive(name) {
    this.active = name;
    this.selectedIndex = 0;
    this.render();
  },

  addCustom(hex) {
    PALETTES.custom.push({ code: 'C' + (PALETTES.custom.length + 1).toString().padStart(3, '0'), name: hex, hex });
    if (this.active === 'custom') this.render();
  },

  render() {
    const el = document.getElementById('palette-list');
    el.innerHTML = '';
    this.list().forEach((c, i) => {
      const sw = document.createElement('div');
      sw.className = 'swatch' + (i === this.selectedIndex ? ' selected' : '');
      sw.style.background = c.hex;
      sw.dataset.label = `${c.code} ${c.name}`;
      sw.title = `${c.code} — ${c.name}`;
      sw.addEventListener('click', () => {
        this.selectedIndex = i;
        this.render();
      });
      el.appendChild(sw);
    });
    if (this.list().length === 0) {
      el.innerHTML = '<div style="font-size:11px;opacity:0.6;padding:10px">— vazio —</div>';
    }
  },

  // Find nearest color in active palette to a given rgb {r,g,b}. Returns index.
  nearestIndex(r, g, b) {
    let best = 0, bestD = Infinity;
    const arr = this.list();
    for (let i = 0; i < arr.length; i++) {
      const c = hexToRgb(arr[i].hex);
      const d = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
};

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
