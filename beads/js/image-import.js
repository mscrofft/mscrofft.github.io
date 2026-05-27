const ImageImport = {
  image: null,

  load(file, cb) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => { this.image = img; cb(); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  // Renderiza preview no canvas e retorna {grid, palette}
  // grid[row][col] => índice no array palette (não na paleta ativa)
  // palette = lista de hex (centróides do k-means)
  preview(canvasEl, w, h, numColors) {
    if (!this.image) return null;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext('2d');
    tctx.imageSmoothingEnabled = true;
    tctx.drawImage(this.image, 0, 0, w, h);
    const data = tctx.getImageData(0, 0, w, h);
    const { quantized, centers, assign } = kmeansQuantize(data, numColors);
    const grid = [];
    for (let r = 0; r < h; r++) {
      const row = [];
      for (let c = 0; c < w; c++) row.push(assign[r * w + c]);
      grid.push(row);
    }
    const palette = centers.map(c => rgbToHex(c[0], c[1], c[2]));
    tctx.putImageData(quantized, 0, 0);
    // preview escalado
    const pctx = canvasEl.getContext('2d');
    canvasEl.width = 200; canvasEl.height = Math.round(200 * h / w);
    pctx.imageSmoothingEnabled = false;
    pctx.drawImage(tmp, 0, 0, canvasEl.width, canvasEl.height);
    return { grid, palette };
  },

  apply(result, stitch) { applyPatternResult(result, stitch); }
};

// Helper compartilhado por ImageImport e ChartImport
function applyPatternResult(result, stitch) {
  const { grid, palette } = result;
  Palette.replaceCustom(palette);
  const rows = grid.length, cols = grid[0].length;
  Grid.newPattern(stitch, cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sw = Grid.ensureSwatch('custom', grid[r][c]);
      Grid.paint(r, c, sw);
    }
  }
  History.reset(Grid.snapshot());
  Grid.render();
}

function rgbToHex(r, g, b) {
  const toHex = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

// K-means simples em RGB
function kmeansQuantize(imageData, k, iter = 8) {
  const px = imageData.data;
  const n = px.length / 4;
  // amostrar centróides iniciais aleatórios
  let centers = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(Math.random() * n) * 4;
    centers.push([px[idx], px[idx + 1], px[idx + 2]]);
  }
  const assign = new Uint16Array(n);
  for (let it = 0; it < iter; it++) {
    // assign
    for (let i = 0; i < n; i++) {
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (centers[c][0] - r) ** 2 + (centers[c][1] - g) ** 2 + (centers[c][2] - b) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      assign[i] = best;
    }
    // update
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const c = assign[i];
      sums[c][0] += px[i * 4];
      sums[c][1] += px[i * 4 + 1];
      sums[c][2] += px[i * 4 + 2];
      sums[c][3]++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) {
        centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
      }
    }
  }
  // recompor
  const out = new ImageData(imageData.width, imageData.height);
  for (let i = 0; i < n; i++) {
    const c = centers[assign[i]];
    out.data[i * 4] = c[0];
    out.data[i * 4 + 1] = c[1];
    out.data[i * 4 + 2] = c[2];
    out.data[i * 4 + 3] = 255;
  }
  return { quantized: out, centers, assign };
}
