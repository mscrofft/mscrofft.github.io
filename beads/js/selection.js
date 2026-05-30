// Sistema de seleção (retângulo e laço) + clipboard com copiar/colar/transformar.

const Selection = {
  active: false,
  mask: null,           // Set<"r,c"> de células selecionadas
  bounds: null,         // {minR, maxR, minC, maxC}
  // Estado de drag durante criação de seleção
  drag: null,           // {tool, startR, startC, lassoPoints?}
  // Estado de "move" (arrastar conteúdo da seleção)
  moveDrag: null,       // {startR, startC, mask, bounds, snapshot}
  dashOffset: 0,

  set(mask) {
    this.mask = mask;
    if (!mask || mask.size === 0) { this.clear(); return; }
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    mask.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      if (r < minR) minR = r; if (r > maxR) maxR = r;
      if (c < minC) minC = c; if (c > maxC) maxC = c;
    });
    this.bounds = { minR, maxR, minC, maxC };
    this.active = true;
    Grid.render();
  },

  clear() {
    this.mask = null; this.bounds = null; this.active = false;
    Grid.render();
  },

  contains(r, c) {
    return this.active && this.mask && this.mask.has(`${r},${c}`);
  },

  // Constrói máscara retangular
  static_rectMask(r0, c0, r1, c1) {
    const minR = Math.max(0, Math.min(r0, r1));
    const maxR = Math.min(Grid.rows - 1, Math.max(r0, r1));
    const minC = Math.max(0, Math.min(c0, c1));
    const maxC = Math.min(Grid.cols - 1, Math.max(c0, c1));
    const m = new Set();
    for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++) m.add(`${r},${c}`);
    return m;
  },

  // Point-in-polygon (ray casting) — points = [[x,y], ...] em coords de unidade do grid
  static_lassoMask(points) {
    if (points.length < 3) return new Set();
    const m = new Set();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(p => {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    });
    const r0 = Math.max(0, Math.floor(minY)), r1 = Math.min(Grid.rows - 1, Math.ceil(maxY));
    const c0 = Math.max(0, Math.floor(minX)), c1 = Math.min(Grid.cols - 1, Math.ceil(maxX));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const g = Stitches[Grid.stitch](r, c);
        const x = g.x + g.w / 2, y = g.y + g.h / 2;
        if (pointInPolygon(x, y, points)) m.add(`${r},${c}`);
      }
    }
    return m;
  },

  // Render do overlay no canvas (chamado dentro de Grid.render)
  drawOverlay(ctx, cellPx) {
    // Preview do retângulo durante drag
    if (this.drag && this.drag.tool === 'select-rect' && this.drag.currentR !== undefined) {
      this._strokeRect(ctx, cellPx,
        Math.min(this.drag.startR, this.drag.currentR),
        Math.min(this.drag.startC, this.drag.currentC),
        Math.max(this.drag.startR, this.drag.currentR),
        Math.max(this.drag.startC, this.drag.currentC));
    }
    // Preview do laço durante drag
    if (this.drag && this.drag.tool === 'select-lasso' && this.drag.lassoPoints) {
      this._strokeLasso(ctx, cellPx, this.drag.lassoPoints);
    }
    // Seleção ativa: contorno marching ants
    if (this.active && this.mask) {
      this._strokeMask(ctx, cellPx);
    }
  },

  _strokeRect(ctx, cellPx, r0, c0, r1, c1) {
    const a = Stitches[Grid.stitch](r0, c0);
    const b = Stitches[Grid.stitch](r1, c1);
    const x = Math.min(a.x, b.x) * cellPx, y = Math.min(a.y, b.y) * cellPx;
    const x2 = (Math.max(a.x + a.w, b.x + b.w)) * cellPx;
    const y2 = (Math.max(a.y + a.h, b.y + b.h)) * cellPx;
    ctx.save();
    ctx.strokeStyle = '#f7b955';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -this.dashOffset;
    ctx.strokeRect(x, y, x2 - x, y2 - y);
    ctx.restore();
  },

  _strokeLasso(ctx, cellPx, points) {
    if (points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = '#f7b955';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -this.dashOffset;
    ctx.beginPath();
    ctx.moveTo(points[0][0] * cellPx, points[0][1] * cellPx);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0] * cellPx, points[i][1] * cellPx);
    ctx.stroke();
    ctx.restore();
  },

  _strokeMask(ctx, cellPx) {
    ctx.save();
    ctx.strokeStyle = '#f7b955';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.lineDashOffset = -this.dashOffset;
    // Para cada célula, desenha as bordas que NÃO são compartilhadas com outra célula selecionada
    ctx.beginPath();
    this.mask.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      const g = Stitches[Grid.stitch](r, c);
      const x = g.x * cellPx, y = g.y * cellPx, w = g.w * cellPx, h = g.h * cellPx;
      // top
      if (!this.mask.has(`${r-1},${c}`)) { ctx.moveTo(x, y); ctx.lineTo(x + w, y); }
      // bottom
      if (!this.mask.has(`${r+1},${c}`)) { ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); }
      // left
      if (!this.mask.has(`${r},${c-1}`)) { ctx.moveTo(x, y); ctx.lineTo(x, y + h); }
      // right
      if (!this.mask.has(`${r},${c+1}`)) { ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); }
    });
    ctx.stroke();
    ctx.restore();
  },

  // Animação marching ants
  startAnts() {
    if (this._antsRaf) return;
    const tick = () => {
      this.dashOffset = (this.dashOffset + 0.5) % 10;
      if (this.active || this.drag) Grid.render();
      this._antsRaf = requestAnimationFrame(tick);
    };
    this._antsRaf = requestAnimationFrame(tick);
  }
};

// Aliases sem o prefixo "static_" (JS não tem static realmente, é só convenção)
Selection.rectMask = Selection.static_rectMask;
Selection.lassoMask = Selection.static_lassoMask;

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ===== Clipboard =====

const Clipboard = {
  data: null,           // 2D [r][c] de índices em Grid.swatchMap (-1 = vazio/ignorar ao colar)
  width: 0, height: 0,
  pasteMode: false,
  pasteAnchor: null,    // {r, c} centro do preview

  isEmpty() { return !this.data || !this.width || !this.height; },

  copyFromSelection() {
    if (!Selection.active || !Selection.mask) return false;
    const b = Selection.bounds;
    const w = b.maxC - b.minC + 1;
    const h = b.maxR - b.minR + 1;
    const data = [];
    for (let r = 0; r < h; r++) {
      const row = [];
      for (let c = 0; c < w; c++) {
        const gr = b.minR + r, gc = b.minC + c;
        if (Selection.mask.has(`${gr},${gc}`)) row.push(Grid.cells[gr][gc]);
        else row.push(-2); // -2 = "fora da máscara" (não cola)
      }
      data.push(row);
    }
    this.data = data; this.width = w; this.height = h;
    return true;
  },

  flipH() {
    if (this.isEmpty()) return;
    this.data = this.data.map(row => row.slice().reverse());
  },
  flipV() {
    if (this.isEmpty()) return;
    this.data = this.data.slice().reverse();
  },
  rotateCW() {
    if (this.isEmpty()) return;
    const w = this.width, h = this.height;
    const out = Array.from({ length: w }, () => new Array(h).fill(-2));
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[c][h - 1 - r] = this.data[r][c];
    this.data = out;
    this.width = h; this.height = w;
  },

  startPaste() {
    if (this.isEmpty()) return;
    this.pasteMode = true;
    this.pasteAnchor = { r: Math.floor(Grid.rows / 2), c: Math.floor(Grid.cols / 2) };
    Grid.render();
  },

  setAnchor(r, c) {
    if (!this.pasteMode) return;
    this.pasteAnchor = { r, c };
    Grid.render();
  },

  commitPaste() {
    if (!this.pasteMode || !this.pasteAnchor) return;
    const halfH = Math.floor(this.height / 2);
    const halfW = Math.floor(this.width / 2);
    const r0 = this.pasteAnchor.r - halfH;
    const c0 = this.pasteAnchor.c - halfW;
    for (let r = 0; r < this.height; r++) {
      for (let c = 0; c < this.width; c++) {
        const v = this.data[r][c];
        if (v === -2) continue; // fora da máscara
        const gr = r0 + r, gc = c0 + c;
        if (gr < 0 || gr >= Grid.rows || gc < 0 || gc >= Grid.cols) continue;
        if (v === -1) Grid.erase(gr, gc);
        else Grid.paint(gr, gc, v);
      }
    }
    this.pasteMode = false;
    this.pasteAnchor = null;
    History.push(Grid.snapshot());
    Grid.render();
  },

  cancelPaste() {
    if (!this.pasteMode) return;
    this.pasteMode = false;
    this.pasteAnchor = null;
    Grid.render();
  },

  // Preview translúcido seguindo o cursor
  drawPreview(ctx, cellPx) {
    if (!this.pasteMode || !this.pasteAnchor) return;
    const halfH = Math.floor(this.height / 2);
    const halfW = Math.floor(this.width / 2);
    const r0 = this.pasteAnchor.r - halfH;
    const c0 = this.pasteAnchor.c - halfW;
    ctx.save();
    ctx.globalAlpha = 0.65;
    for (let r = 0; r < this.height; r++) {
      for (let c = 0; c < this.width; c++) {
        const v = this.data[r][c];
        if (v === -2) continue;
        const gr = r0 + r, gc = c0 + c;
        if (gr < 0 || gr >= Grid.rows || gc < 0 || gc >= Grid.cols) continue;
        const color = v >= 0 ? Grid.swatchMap[v].hex : '#ffffff';
        drawStitchCell(ctx, Grid.stitch, gr, gc, color, cellPx, { stroke: '#f7b955', lineWidth: 1 });
      }
    }
    ctx.restore();
  }
};
