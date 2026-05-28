// Presets de preenchimento: cada função recebe (cols, rows, colors, params) e
// retorna uma matriz cells[r][c] de índices em Grid.swatchMap.
// `colors` = array de índices em Grid.swatchMap a usar.

const Presets = {
  randomUniform(cols, rows, colors) {
    const out = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) row.push(colors[Math.floor(Math.random() * colors.length)]);
      out.push(row);
    }
    return out;
  },

  randomWeighted(cols, rows, colors, params = {}) {
    // params.weights = [int...] proporcionais a colors. Se ausente, conta uso atual.
    let weights = params.weights;
    if (!weights || weights.length !== colors.length) {
      weights = colors.map(idx => {
        let n = 0;
        Grid.cells.forEach(row => row.forEach(v => { if (v === idx) n++; }));
        return Math.max(1, n);
      });
    }
    const total = weights.reduce((a, b) => a + b, 0);
    const cum = []; let acc = 0;
    weights.forEach(w => { acc += w / total; cum.push(acc); });
    const pick = () => {
      const r = Math.random();
      for (let i = 0; i < cum.length; i++) if (r < cum[i]) return colors[i];
      return colors[colors.length - 1];
    };
    const out = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) row.push(pick());
      out.push(row);
    }
    return out;
  },

  stripesH(cols, rows, colors, { width = 1 } = {}) {
    const out = [];
    for (let r = 0; r < rows; r++) {
      const ci = Math.floor(r / width) % colors.length;
      out.push(new Array(cols).fill(colors[ci]));
    }
    return out;
  },

  stripesV(cols, rows, colors, { width = 1 } = {}) {
    const out = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const ci = Math.floor(c / width) % colors.length;
        row.push(colors[ci]);
      }
      out.push(row);
    }
    return out;
  },

  diagonalSlash(cols, rows, colors, { width = 1 } = {}) {
    const out = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const ci = Math.floor((r - c + cols) / width) % colors.length;
        row.push(colors[ci]);
      }
      out.push(row);
    }
    return out;
  },

  diagonalBackslash(cols, rows, colors, { width = 1 } = {}) {
    const out = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const ci = Math.floor((r + c) / width) % colors.length;
        row.push(colors[ci]);
      }
      out.push(row);
    }
    return out;
  },

  checker(cols, rows, colors, { size = 1 } = {}) {
    const a = colors[0], b = colors[1] !== undefined ? colors[1] : colors[0];
    const out = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const cell = (Math.floor(r / size) + Math.floor(c / size)) % 2;
        row.push(cell === 0 ? a : b);
      }
      out.push(row);
    }
    return out;
  },

  diamond(cols, rows, colors, { size = 0.6 } = {}) {
    const bg = colors[0], fg = colors[1] !== undefined ? colors[1] : colors[0];
    const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
    const half = Math.min(cols, rows) * size / 2;
    const out = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const d = Math.abs(c - cx) + Math.abs(r - cy);
        row.push(d <= half ? fg : bg);
      }
      out.push(row);
    }
    return out;
  },

  // Losangos tiled (harlequim): cada tile size×size tem um losango, cor alterna por (rt+ct)%2
  diamondsTiled(cols, rows, colors, { size = 6 } = {}) {
    const a = colors[0], b = colors[1] !== undefined ? colors[1] : a;
    const half = size / 2;
    const out = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const rt = Math.floor(r / size), ct = Math.floor(c / size);
        const dx = (c % size) - half + 0.5;
        const dy = (r % size) - half + 0.5;
        const inside = Math.abs(dx) + Math.abs(dy) <= half;
        const tileColor = (rt + ct) % 2 === 0 ? a : b;
        const bgColor = (rt + ct) % 2 === 0 ? b : a;
        row.push(inside ? tileColor : bgColor);
      }
      out.push(row);
    }
    return out;
  },

  // Quadrados tiled: tiles (size+gap)x(size+gap), quadrado de lado size centralizado em cada
  squaresTiled(cols, rows, colors, { size = 4, gap = 2 } = {}) {
    const bg = colors[0], fg = colors[1] !== undefined ? colors[1] : colors[0];
    const tile = size + gap;
    const inset = gap / 2; // distância da borda do tile até o quadrado
    const out = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const rx = c % tile, ry = r % tile;
        const inside = rx >= inset && rx < inset + size && ry >= inset && ry < inset + size;
        row.push(inside ? fg : bg);
      }
      out.push(row);
    }
    return out;
  },

  waves(cols, rows, colors, { amp = 4, period = 10, thickness = 1 } = {}) {
    const bg = colors[0], fg = colors[1] !== undefined ? colors[1] : colors[0];
    const out = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      const center = cols / 2 + amp * Math.sin((2 * Math.PI * r) / period);
      for (let c = 0; c < cols; c++) {
        row.push(Math.abs(c - center) < thickness / 2 + 0.5 ? fg : bg);
      }
      out.push(row);
    }
    return out;
  },

  // Gradiente com dithering Bayer 4x4 para evitar bandas duras
  gradientH(cols, rows, colors) {
    return gradientGeneric(cols, rows, colors, true);
  },

  gradientV(cols, rows, colors) {
    return gradientGeneric(cols, rows, colors, false);
  }
};

// Bayer 4x4 matrix (valores 0..15)
const BAYER4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5]
];

function gradientGeneric(cols, rows, colors, horizontal) {
  const a = colors[0];
  const b = colors[colors.length - 1] !== undefined ? colors[colors.length - 1] : a;
  if (a === b) return Array.from({ length: rows }, () => new Array(cols).fill(a));
  const cA = hexToRgbGrid(Grid.swatchMap[a].hex);
  const cB = hexToRgbGrid(Grid.swatchMap[b].hex);
  const out = [];
  // Pré-calcular distância de cada cor da paleta a uma cor RGB arbitrária
  const allHex = colors.map(i => hexToRgbGrid(Grid.swatchMap[i].hex));
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const t = horizontal ? c / (cols - 1) : r / (rows - 1);
      // Dither: ajusta t pela matriz Bayer
      const d = (BAYER4[r % 4][c % 4] + 0.5) / 16 - 0.5; // -0.5..+0.5
      const span = 1 / colors.length;
      const tD = t + d * span;
      // Cor interpolada teórica
      const ir = cA.r + (cB.r - cA.r) * Math.max(0, Math.min(1, tD));
      const ig = cA.g + (cB.g - cA.g) * Math.max(0, Math.min(1, tD));
      const ib = cA.b + (cB.b - cA.b) * Math.max(0, Math.min(1, tD));
      // Mais próximo entre as cores disponíveis
      let best = 0, bestD = Infinity;
      for (let i = 0; i < allHex.length; i++) {
        const dd = (allHex[i].r - ir) ** 2 + (allHex[i].g - ig) ** 2 + (allHex[i].b - ib) ** 2;
        if (dd < bestD) { bestD = dd; best = i; }
      }
      row.push(colors[best]);
    }
    out.push(row);
  }
  return out;
}

// Adiciona o método ao Grid (depende de Grid já estar definido).
// Esse arquivo é carregado APÓS grid.js, então funciona.
Grid.applyPreset = function (presetName, params = {}) {
  const fn = Presets[presetName];
  if (!fn) return;
  // Cores disponíveis: índices do swatchMap atual
  let colors = this.swatchMap.map((_, i) => i);
  if (colors.length === 0) {
    // Popula com até 8 primeiras cores da paleta ativa
    const list = PALETTES[Palette.active];
    const take = Math.min(8, list.length);
    for (let i = 0; i < take; i++) this.ensureSwatch(Palette.active, i);
    colors = this.swatchMap.map((_, i) => i);
  }
  if (colors.length === 0) return; // ainda vazio (paleta custom sem cores)
  const newCells = fn(this.cols, this.rows, colors, params);
  this.cells = newCells;
  History.push(this.snapshot());
  this.render();
};
