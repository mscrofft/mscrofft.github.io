const Palette = {
  active: 'custom',
  selectedIndex: 0,
  deleteMode: false,

  toggleDeleteMode() {
    if (this.active !== 'custom') { this.deleteMode = false; return; }
    this.deleteMode = !this.deleteMode;
    const btn = document.getElementById('btn-palette-delete');
    if (btn) btn.classList.toggle('active', this.deleteMode);
    this.render();
  },
  exitDeleteMode() {
    if (!this.deleteMode) return;
    this.deleteMode = false;
    const btn = document.getElementById('btn-palette-delete');
    if (btn) btn.classList.remove('active');
    this.render();
  },

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
    if (name !== 'custom') this.deleteMode = false;
    const btn = document.getElementById('btn-palette-delete');
    if (btn) {
      btn.style.display = (name === 'custom') ? '' : 'none';
      btn.classList.toggle('active', this.deleteMode);
    }
    this.render();
  },

  addCustom(hex) {
    PALETTES.custom.push({ code: 'C' + (PALETTES.custom.length + 1).toString().padStart(3, '0'), name: hex, hex });
    if (this.active === 'custom') this.render();
  },

  render() {
    const el = document.getElementById('palette-list');
    el.innerHTML = '';
    const btn = document.getElementById('btn-palette-delete');
    if (btn) btn.style.display = (this.active === 'custom') ? '' : 'none';
    const inDelete = this.deleteMode && this.active === 'custom';
    this.list().forEach((c, i) => {
      const sw = document.createElement('div');
      sw.className = 'swatch'
        + (i === this.selectedIndex && !inDelete ? ' selected' : '')
        + (inDelete ? ' delete-mode' : '');
      sw.style.background = c.hex;
      sw.dataset.label = `${c.code} ${c.name}`;
      sw.title = inDelete ? `Excluir ${c.code}` : `${c.code} — ${c.name}`;
      sw.addEventListener('click', () => {
        if (inDelete) {
          PALETTES.custom.splice(i, 1);
          if (this.selectedIndex >= PALETTES.custom.length) {
            this.selectedIndex = Math.max(0, PALETTES.custom.length - 1);
          }
          this.render();
        } else {
          this.selectedIndex = i;
          this.render();
        }
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
