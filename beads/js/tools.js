const Tools = {
  active: 'brush',
  isDrawing: false,
  lineStart: null,
  brushSize: 1,             // diâmetro em células (ímpar: 1,3,5,7,9)
  brushShape: 'square',     // 'square' | 'circle'
  symmetry: 'off',          // 'off' | 'h' | 'v' | 'both'

  setSymmetry(mode) {
    this.symmetry = mode;
    document.querySelectorAll('.sym-btn').forEach(b => b.classList.toggle('active', b.dataset.sym === mode));
    if (typeof Grid !== 'undefined' && Grid.canvas) Grid.render();
  },

  // Retorna lista de [r,c] com a célula original + espelhamentos (deduplicados)
  symmetryCells(r, c) {
    if (this.symmetry === 'off') return [[r, c]];
    const out = new Set();
    const add = (rr, cc) => out.add(`${rr},${cc}`);
    add(r, c);
    if (this.symmetry === 'h' || this.symmetry === 'both') add(r, Grid.cols - 1 - c);
    if (this.symmetry === 'v' || this.symmetry === 'both') add(Grid.rows - 1 - r, c);
    if (this.symmetry === 'both') add(Grid.rows - 1 - r, Grid.cols - 1 - c);
    return Array.from(out).map(k => k.split(',').map(Number));
  },

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
    for (const [sr, sc] of this.symmetryCells(row, col)) {
      for (const [r, c] of this.brushCells(sr, sc)) {
        if (Grid.paint(r, c, sw)) changed = true;
      }
    }
    return changed;
  },

  eraseBrush(row, col) {
    let changed = false;
    for (const [sr, sc] of this.symmetryCells(row, col)) {
      for (const [r, c] of this.brushCells(sr, sc)) {
        if (Grid.erase(r, c)) changed = true;
      }
    }
    return changed;
  },

  handleDown(row, col) {
    if (!row && row !== 0) return;
    // Paste mode: clique commita
    if (typeof Clipboard !== 'undefined' && Clipboard.pasteMode) {
      Clipboard.setAnchor(row, col);
      Clipboard.commitPaste();
      this.isDrawing = false;
      return;
    }
    this.isDrawing = true;
    // Tools de seleção
    if (this.active === 'select-rect' || this.active === 'select-lasso') {
      // Move dentro da seleção?
      if (Selection.contains(row, col)) {
        Selection.moveDrag = {
          startR: row, startC: col,
          mask: new Set(Selection.mask),
          bounds: { ...Selection.bounds },
          snapshot: Selection.mask.size > 0 ? captureCells(Selection.mask) : null
        };
        return;
      }
      if (this.active === 'select-rect') {
        Selection.drag = { tool: 'select-rect', startR: row, startC: col, currentR: row, currentC: col };
      } else {
        const g = Stitches[Grid.stitch](row, col);
        Selection.drag = { tool: 'select-lasso', lassoPoints: [[g.x + g.w/2, g.y + g.h/2]] };
      }
      Grid.render();
      return;
    }
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
    // Paste mode: atualiza preview seguindo cursor (sem precisar de drag)
    if (typeof Clipboard !== 'undefined' && Clipboard.pasteMode) {
      if (row !== null && row !== undefined) Clipboard.setAnchor(row, col);
      return;
    }
    if (!this.isDrawing) return;
    if (row === null || row === undefined) return;
    // Seleção em construção
    if (Selection.drag) {
      if (Selection.drag.tool === 'select-rect') {
        Selection.drag.currentR = row; Selection.drag.currentC = col;
        Grid.render();
      } else if (Selection.drag.tool === 'select-lasso') {
        const g = Stitches[Grid.stitch](row, col);
        const pt = [g.x + g.w/2, g.y + g.h/2];
        const last = Selection.drag.lassoPoints[Selection.drag.lassoPoints.length - 1];
        if (Math.hypot(pt[0]-last[0], pt[1]-last[1]) > 0.3) {
          Selection.drag.lassoPoints.push(pt);
          Grid.render();
        }
      }
      return;
    }
    // Move da seleção
    if (Selection.moveDrag) {
      Selection.moveDrag.previewR = row;
      Selection.moveDrag.previewC = col;
      Grid.render();
      return;
    }
    if (this.active === 'brush') {
      if (this.paintBrush(row, col)) Grid.render();
    } else if (this.active === 'eraser') {
      if (this.eraseBrush(row, col)) Grid.render();
    }
  },

  handleUp(row, col) {
    // Finaliza seleção em construção
    if (Selection.drag) {
      if (Selection.drag.tool === 'select-rect') {
        const m = Selection.rectMask(Selection.drag.startR, Selection.drag.startC, row ?? Selection.drag.startR, col ?? Selection.drag.startC);
        Selection.drag = null;
        Selection.set(m);
        Selection.startAnts();
      } else if (Selection.drag.tool === 'select-lasso') {
        const m = Selection.lassoMask(Selection.drag.lassoPoints);
        Selection.drag = null;
        Selection.set(m);
        Selection.startAnts();
      }
      this.isDrawing = false;
      return;
    }
    // Finaliza move da seleção
    if (Selection.moveDrag) {
      const mv = Selection.moveDrag;
      Selection.moveDrag = null;
      if (mv.previewR !== undefined && (mv.previewR !== mv.startR || mv.previewC !== mv.startC)) {
        const dr = mv.previewR - mv.startR;
        const dc = mv.previewC - mv.startC;
        // Apaga origem
        mv.mask.forEach(key => {
          const [r, c] = key.split(',').map(Number);
          Grid.erase(r, c);
        });
        // Pinta destino
        const newMask = new Set();
        mv.snapshot.forEach(({ r, c, v }) => {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < Grid.rows && nc >= 0 && nc < Grid.cols) {
            if (v >= 0) Grid.paint(nr, nc, v);
            newMask.add(`${nr},${nc}`);
          }
        });
        Selection.set(newMask);
        History.push(Grid.snapshot());
      }
      this.isDrawing = false;
      return;
    }
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
    Selection.drag = null;
    Selection.moveDrag = null;
  }
};

// Captura células de uma máscara para uso no move (snapshot pré-translação)
function captureCells(mask) {
  const out = [];
  mask.forEach(key => {
    const [r, c] = key.split(',').map(Number);
    out.push({ r, c, v: Grid.cells[r][c] });
  });
  return out;
}
