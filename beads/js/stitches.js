// Geometria de cada ponto. Cada função retorna {x, y, w, h, shape} para uma célula (row, col)
// no espaço lógico de uma "unidade de miçanga" (1 unidade = bead size).
// Renderização escala por cellSize.

const Stitches = {
  // Square / Embroidery: grid retangular simples
  square(row, col) {
    return { x: col, y: row, w: 1, h: 1, shape: 'rect' };
  },
  embroidery(row, col) {
    // Miçanga de bordado: célula quadrada com cantos arredondados (visual diferente)
    return { x: col, y: row, w: 1, h: 1, shape: 'round' };
  },
  // Peyote (par): célula retangular alta, colunas pares deslocadas em meia-altura
  peyote(row, col) {
    const w = 0.85, h = 1.2;
    // Offset invertido: cols pares ficam meio passo abaixo (posição "baixa"),
    // cols ímpares ficam no topo (posição "alta").
    const offsetY = (1 - col % 2) * (h / 2);
    return { x: col * w, y: row * h + offsetY, w, h, shape: 'rounded' };
  },
  // Brick: célula retangular larga, linhas alternadas deslocadas meia-largura
  brick(row, col) {
    const w = 1.2, h = 0.85;
    const offsetX = (row % 2) * (w / 2);
    return { x: col * w + offsetX, y: row * h, w, h, shape: 'rounded' };
  },
  // Herringbone: pares de células levemente inclinadas; aqui simplificamos
  // como duas colunas por "par" com inclinação alternada.
  herringbone(row, col) {
    const w = 0.85, h = 1.2;
    const pair = Math.floor(col / 2);
    const inPair = col % 2;
    const tilt = inPair === 0 ? -0.12 : 0.12;
    return {
      x: pair * (w * 2) + inPair * w,
      y: row * h,
      w, h,
      shape: 'rounded',
      tilt
    };
  },
  // Contour: caminho — não usa grid, mas geramos uma linha horizontal de células
  // como placeholder; UI permite editar pontos do caminho.
  contour(row, col) {
    return { x: col, y: row, w: 1, h: 1, shape: 'round' };
  }
};

// Aliases: peyote-even e peyote-odd compartilham a mesma geometria visual de peyote
Stitches['peyote-even'] = Stitches.peyote;
Stitches['peyote-odd'] = Stitches.peyote;

// Retorna {width, height} do bounding box em unidades para um padrão (cols, rows).
function stitchBounds(type, cols, rows) {
  let maxX = 0, maxY = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const g = Stitches[type](r, c);
      if (g.x + g.w > maxX) maxX = g.x + g.w;
      if (g.y + g.h > maxY) maxY = g.y + g.h;
    }
  }
  return { w: maxX, h: maxY };
}

// Desenha uma célula no canvas. cellPx é o tamanho de 1 unidade em pixels.
function drawStitchCell(ctx, type, row, col, color, cellPx, opts = {}) {
  const g = Stitches[type](row, col);
  const x = g.x * cellPx;
  const y = g.y * cellPx;
  const w = g.w * cellPx;
  const h = g.h * cellPx;
  ctx.save();
  if (g.tilt) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(g.tilt);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }
  ctx.fillStyle = color || '#ffffff';
  ctx.strokeStyle = opts.stroke || '#333';
  ctx.lineWidth = opts.lineWidth ?? 0.5;
  if (g.shape === 'round') {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 0.5, h / 2 - 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (g.shape === 'rounded') {
    const r = Math.min(w, h) * 0.25;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Hit-test inverso: dado (px, py) em pixels do canvas, devolve {row, col} ou null.
// Implementação simples por força bruta — ok para grids até ~300×300.
function hitTestCell(type, px, py, cols, rows, cellPx) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const g = Stitches[type](r, c);
      const x = g.x * cellPx, y = g.y * cellPx;
      const w = g.w * cellPx, h = g.h * cellPx;
      if (px >= x && px <= x + w && py >= y && py <= y + h) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}
