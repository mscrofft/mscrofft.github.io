const Tools = {
  active: 'brush',
  isDrawing: false,
  lineStart: null,
  brushSize: 1,             // diâmetro em células (ímpar: 1,3,5,7,9)
  brushShape: 'square',     // 'square' | 'circle'

  set(name) {
    this.active = name;
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === name));
  },

  setBrushSize(n) { this.brushSize = Math.max(1, n | 1); }, // força ímpar
  setBrushShape(s) {
    this.brushShape = s;
    document.querySelectorAll('.brush-shape-btn').forEach(b => b.classList.toggle('active', b.dataset.shape === s));
  },

  currentSwatch() {
    return Grid.ensureSwatch(Palette.active, Palette.selectedIndex);
  },

  // Retorna lista de [r, c] que o pincel cobre centrado em (cr, cc)
  brushCells(cr, cc) {
    const size = this.brushSize;
    if (size <= 1) return [[cr, cc]];
    const half = (size - 1) / 2;
    const out = [];
    const r2 = half * half + 0.25; // tolerância pra círculo
    for (let dr = -half; dr <= half; dr++) {
      for (let dc = -half; dc <= half; dc++) {
        if (this.brushShape === 'circle' && (dr * dr + dc * dc) > r2) continue;
        out.push([cr + dr, cc + dc]);
      }
    }
    return out;
  },

  paintBrush(row, col) {
    const sw = this.currentSwatch();
    let changed = false;
    for (const [r, c] of this.brushCells(row, col)) {
      if (Grid.paint(r, c, sw)) changed = true;
    }
    return changed;
  },

  eraseBrush(row, col) {
    let changed = false;
    for (const [r, c] of this.brushCells(row, col)) {
      if (Grid.erase(r, c)) changed = true;
    }
    return changed;
  },

  handleDown(row, col) {
    if (!row && row !== 0) return;
    this.isDrawing = true;
    let changed = false;
    switch (this.active) {
      case 'brush': changed = this.paintBrush(row, col); break;
      case 'eraser': changed = this.eraseBrush(row, col); break;
      case 'bucket': changed = Grid.floodFill(row, col, this.currentSwatch()); break;
      case 'picker':
        const v = Grid.cells[row][col];
        if (v >= 0) {
          const s = Grid.swatchMap[v];
          const [pal, code] = s.ref.split(':');
          if (PALETTES[pal]) {
            const idx = PALETTES[pal].findIndex(b => b.code === code);
            if (idx >= 0) { Palette.setActive(pal); Palette.selectedIndex = idx; document.getElementById('palette-select').value = pal; Palette.render(); }
          }
        }
        this.isDrawing = false;
        return;
      case 'line':
      case 'rect':
        this.lineStart = { row, col };
        return;
    }
    if (changed) { Grid.render(); }
  },

  handleMove(row, col) {
    if (!this.isDrawing) return;
    if (row === null || row === undefined) return;
    if (this.active === 'brush') {
      if (this.paintBrush(row, col)) Grid.render();
    } else if (this.active === 'eraser') {
      if (this.eraseBrush(row, col)) Grid.render();
    }
  },

  handleUp(row, col) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    if (this.lineStart && (this.active === 'line' || this.active === 'rect')) {
      const sw = this.currentSwatch();
      const r0 = this.lineStart.row, c0 = this.lineStart.col;
      if (this.active === 'rect') {
        const minR = Math.min(r0, row), maxR = Math.max(r0, row);
        const minC = Math.min(c0, col), maxC = Math.max(c0, col);
        for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++) Grid.paint(r, c, sw);
      } else {
        // Bresenham
        let r1 = r0, c1 = c0, r2 = row, c2 = col;
        const dr = Math.abs(r2 - r1), dc = Math.abs(c2 - c1);
        const sr = r1 < r2 ? 1 : -1, sc = c1 < c2 ? 1 : -1;
        let err = dc - dr;
        while (true) {
          Grid.paint(r1, c1, sw);
          if (r1 === r2 && c1 === c2) break;
          const e2 = 2 * err;
          if (e2 > -dr) { err -= dr; c1 += sc; }
          if (e2 < dc) { err += dc; r1 += sr; }
        }
      }
      this.lineStart = null;
      Grid.render();
    }
    History.push(Grid.snapshot());
  },

  // Cancela a pintura sem snapshot (usado quando entra 2º dedo para pinch)
  cancel() {
    this.isDrawing = false;
    this.lineStart = null;
  }
};
