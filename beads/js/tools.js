const Tools = {
  active: 'brush',
  isDrawing: false,
  lineStart: null,

  set(name) {
    this.active = name;
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === name));
  },

  currentSwatch() {
    return Grid.ensureSwatch(Palette.active, Palette.selectedIndex);
  },

  handleDown(row, col) {
    if (!row && row !== 0) return;
    this.isDrawing = true;
    const sw = this.currentSwatch();
    let changed = false;
    switch (this.active) {
      case 'brush': changed = Grid.paint(row, col, sw); break;
      case 'eraser': changed = Grid.erase(row, col); break;
      case 'bucket': changed = Grid.floodFill(row, col, sw); break;
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
    if (changed) { Grid.render(); History.push(Grid.snapshot()); }
  },

  handleMove(row, col) {
    if (!this.isDrawing) return;
    if (row === null || row === undefined) return;
    if (this.active === 'brush') {
      if (Grid.paint(row, col, this.currentSwatch())) Grid.render();
    } else if (this.active === 'eraser') {
      if (Grid.erase(row, col)) Grid.render();
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
  }
};
