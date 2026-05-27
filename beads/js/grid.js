const Grid = {
  canvas: null,
  ctx: null,
  stitch: 'peyote',
  cols: 30,
  rows: 40,
  cellPx: 18,
  // cells[row][col] = índice de cor na "swatchMap" do padrão, ou -1 vazio
  cells: [],
  // swatchMap[i] = {paletteRef: 'miyuki:DB0010' | 'custom:#abc123', hex, code, name}
  swatchMap: [],

  init(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
  },

  newPattern(stitch, cols, rows) {
    this.stitch = stitch;
    this.cols = cols;
    this.rows = rows;
    this.cells = Array.from({ length: rows }, () => Array(cols).fill(-1));
    this.swatchMap = [];
    History.reset(this.snapshot());
    this.render();
  },

  snapshot() {
    return {
      stitch: this.stitch,
      cols: this.cols, rows: this.rows,
      cells: cloneCells(this.cells),
      swatchMap: JSON.parse(JSON.stringify(this.swatchMap))
    };
  },

  restore(snap) {
    // Migração: 'peyote' antigo vira 'peyote-even'
    if (snap.stitch === 'peyote') snap.stitch = 'peyote-even';
    this.stitch = snap.stitch;
    this.cols = snap.cols; this.rows = snap.rows;
    this.cells = cloneCells(snap.cells);
    this.swatchMap = JSON.parse(JSON.stringify(snap.swatchMap));
    this.render();
  },

  // Mapeia uma cor da paleta ativa para índice em swatchMap. Adiciona se ausente.
  ensureSwatch(paletteName, beadIdx) {
    const bead = PALETTES[paletteName][beadIdx];
    if (!bead) return -1;
    const ref = `${paletteName}:${bead.code}`;
    let idx = this.swatchMap.findIndex(s => s.ref === ref);
    if (idx === -1) {
      this.swatchMap.push({ ref, hex: bead.hex, code: bead.code, name: bead.name });
      idx = this.swatchMap.length - 1;
    }
    return idx;
  },

  paint(row, col, swatchIdx) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return false;
    if (this.cells[row][col] === swatchIdx) return false;
    this.cells[row][col] = swatchIdx;
    return true;
  },

  erase(row, col) { return this.paint(row, col, -1); },

  floodFill(row, col, targetSwatch) {
    const orig = this.cells[row]?.[col];
    if (orig === undefined || orig === targetSwatch) return false;
    const stack = [[row, col]];
    while (stack.length) {
      const [r, c] = stack.pop();
      if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) continue;
      if (this.cells[r][c] !== orig) continue;
      this.cells[r][c] = targetSwatch;
      stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
    }
    return true;
  },

  showNumbers: false,

  render() {
    const bounds = stitchBounds(this.stitch, this.cols, this.rows);
    const W = Math.ceil(bounds.w * this.cellPx) + 2;
    const H = Math.ceil(bounds.h * this.cellPx) + 2;
    this.canvas.width = W;
    this.canvas.height = H;
    const ctx = this.ctx;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const sIdx = this.cells[r][c];
        const color = sIdx >= 0 ? this.swatchMap[sIdx].hex : '#ffffff';
        drawStitchCell(ctx, this.stitch, r, c, color, this.cellPx, { stroke: sIdx >= 0 ? '#222' : '#ccc' });
      }
    }
    // Números das miçangas (ordem de execução), só com zoom suficiente
    if (this.showNumbers && this.cellPx >= 12 && typeof beadNumberMap === 'function') {
      const numMap = beadNumberMap(this.stitch, this.cols, this.rows);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fontSize = Math.max(7, Math.floor(this.cellPx * 0.42));
      ctx.font = `${fontSize}px sans-serif`;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const g = Stitches[this.stitch](r, c);
          const cx = (g.x + g.w / 2) * this.cellPx;
          const cy = (g.y + g.h / 2) * this.cellPx;
          const sIdx = this.cells[r][c];
          ctx.fillStyle = sIdx >= 0 ? contrastText(this.swatchMap[sIdx].hex) : '#888';
          ctx.fillText(String(numMap[r][c]), cx, cy);
        }
      }
    }
    UsedColors.render();
  }
};

// Escolhe preto ou branco baseado na luminância da cor de fundo
function contrastText(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.55 ? '#000' : '#fff';
}

const UsedColors = {
  render() {
    const el = document.getElementById('used-colors');
    if (!el) return;
    const counts = new Map();
    Grid.cells.forEach(row => row.forEach(v => {
      if (v >= 0) counts.set(v, (counts.get(v) || 0) + 1);
    }));
    el.innerHTML = '';
    Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).forEach(([idx, n]) => {
      const s = Grid.swatchMap[idx];
      const row = document.createElement('div');
      row.className = 'used-row';
      const sw = document.createElement('input');
      sw.type = 'color';
      sw.className = 'sw';
      sw.value = s.hex;
      sw.title = 'Clique para alterar a cor';
      // Atualiza ao vivo enquanto a usuária mexe no seletor
      sw.addEventListener('input', e => {
        Grid.swatchMap[idx].hex = e.target.value;
        Grid.render();
      });
      // Empurra ao histórico quando termina (change dispara após fechar o picker)
      sw.addEventListener('change', () => {
        History.push(Grid.snapshot());
      });
      const code = document.createElement('span');
      code.className = 'used-code';
      code.textContent = s.code;
      const label = document.createElement('span');
      label.className = 'used-label';
      label.textContent = s.name && s.name !== s.code ? s.name : '';
      label.title = 'Clique para renomear';
      const count = document.createElement('span');
      count.className = 'used-count';
      count.textContent = n;
      const startEdit = () => UsedColors.startEdit(row, idx);
      code.addEventListener('click', startEdit);
      label.addEventListener('click', startEdit);
      row.appendChild(sw);
      row.appendChild(code);
      row.appendChild(label);
      row.appendChild(count);
      el.appendChild(row);
    });
  },

  startEdit(rowEl, idx) {
    const s = Grid.swatchMap[idx];
    if (rowEl.querySelector('input.rename-input')) return;
    const label = rowEl.querySelector('.used-label');
    const code = rowEl.querySelector('.used-code');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.className = 'rename-input';
    input.type = 'text';
    input.value = s.name && s.name !== s.code ? s.name : '';
    input.placeholder = s.code;
    code.after(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return; done = true;
      if (commit) {
        const newName = input.value.trim();
        const prev = s.name;
        s.name = newName || s.code;
        if (s.name !== prev) History.push(Grid.snapshot());
      }
      UsedColors.render();
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }
};
